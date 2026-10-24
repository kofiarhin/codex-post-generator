'use strict';

const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { slotAt, londonDate } = require('./slot');
const { validateDraft, validateReview, contentHash, digest } = require('./validate');
const { readConfig } = require('./config');
const { generateWithCodex } = require('./codex');
const { createEngineSession, generateWithFallback, reviewWithFallback } = require('./engines');
const { MongoStore } = require('./store');
const { BufferClient, BufferFailure, publicationResult } = require('./buffer');
const { connectMongo, disconnectMongo, getMongoStatus } = require('../config/db');
const { readLogEntries } = require('../../.agents/skills/linkedin-post-orchestrator/scripts/title_log_utils');
const { platformsFor } = require('./platforms');

async function run({ now = new Date(), dryRun = true, manual = false, platform: requested, env = process.env,
  generate = generateWithFallback, review = reviewWithFallback, engines = createEngineSession(), store,
  buffer, clock = () => new Date(), manualHistory = () => readLogEntries(resolve(__dirname, '../../log.txt')) } = {}) {
  if (typeof manual !== 'boolean') throw new Error('Invalid manual option');
  // Scheduled runs are always LinkedIn-only; X is never generated, stored or contacted for a slot.
  const platform = manual ? requested : (requested === undefined ? 'linkedin' : requested);
  const platforms = platformsFor(platform);
  if (!manual && platform !== 'linkedin') throw new Error('Scheduled runs are LinkedIn-only');
  const config = readConfig(env, { dryRun, platform });
  const { date, slot } = manual ? { date: londonDate(now), slot: 'manual' } : slotAt(now);
  const key = manual ? `post-generator:manual:${date}:${randomUUID()}` : `post-generator:${date}:${slot}`;
  const ownsConnection = !store && getMongoStatus().readyState === 0;
  if (!store) {
    await connectMongo({ mongoUri: config.mongoUri });
    store = new MongoStore();
  }
  let locked = false;
  try {
    await store.initialize();
    await store.acquire();
    locked = true;
    let draft = await store.get(key);
    if (!draft) {
      const previous = [...await store.history(), ...await manualHistory()];
      // Engine choice never relaxes validation: fallback drafts face the same review and duplicate checks.
      const validated = validateDraft(await generate({ date, slot, previous, platform, engines }), previous, { platform });
      const validation = validateReview(await review(validated, { previous, date, slot, platform, engines }), validated, clock());
      const generation = engines.record();
      const publications = Object.fromEntries(platforms.map(platform => [platform, {
        channelId: config.channels[platform] || '', idempotencyKey: digest(`${key}:${platform}`),
        state: dryRun ? 'not_published' : 'pending', attempts: 0
      }]));
      draft = await store.save({ ...validated, validation, schemaVersion: 2, key, date, slot, dryRun,
        status: 'validated', publications, ...(generation.engine ? { generation } : {}) });
      if (!draft) throw new Error('Draft persistence failed');
    }
    if (draft.platform !== platform) throw new Error('Persisted platform selection changed');
    if (dryRun) return summarize(draft, true);
    // Legacy and dry-run drafts are never implicitly upgraded or published.
    if (draft.schemaVersion !== 2 || draft.dryRun !== false) throw new Error('Existing draft is not eligible for publishing');
    assertValidated(draft);
    for (const platform of platforms) {
      if (draft.publications[platform].channelId !== config.channels[platform]) throw new Error('Channel mapping changed');
    }
    buffer ||= new BufferClient(config);
    const cooldown = await store.bufferCooldown();
    if (cooldown && cooldown > clock()) return { ...summarize(draft, false), retryAt: cooldown, requiresAttention: true };
    const eligible = platform => {
      const record = draft.publications[platform];
      return record.attempts < 3 && (record.state === 'pending' ||
        (record.state === 'rate_limited' && record.nextAttemptAt <= clock()));
    };
    // Finish preflight before sending: shared auth/API failures and cooldowns still stop all sends.
    for (const platform of platforms.filter(eligible)) {
      try { await buffer.verifyChannel(platform); }
      catch (error) {
        // Preflight is read-only: no submission occurred. Keep its failure separate from an unknown send.
        const result = failureResult(error, clock());
        if (result.state !== 'rate_limited') result.state = 'rejected';
        if (result.nextAttemptAt) await store.deferBuffer(result.nextAttemptAt);
        const channelOnly = error instanceof BufferFailure &&
          ['CHANNEL_NOT_ALLOWLISTED', 'BUFFER_CHANNEL_UNAVAILABLE', 'X_PREMIUM_UNVERIFIED'].includes(error.code);
        for (const affected of channelOnly ? [platform] : platforms.filter(eligible)) {
          draft = await store.record(key, affected, ['pending', 'rate_limited'], result);
        }
        if (!channelOnly) return summarize(draft, false);
      }
    }
    for (const platform of platforms) {
      let record = draft.publications[platform];
      if (record.state === 'publishing') {
        draft = await store.record(key, platform, ['publishing'], { state: 'unknown', failureCode: 'INTERRUPTED_ATTEMPT' });
        record = draft.publications[platform];
      }
      if (record.state === 'accepted' && record.bufferId) {
        draft = await reconcile({ store, buffer, draft, platform, bufferId: record.bufferId, now: clock() });
        continue;
      }
      if (!eligible(platform)) continue;
      // Scheduled content must stay in its original slot; manual runs have no time window.
      const attemptedAt = clock();
      if (!manual) {
        const current = slotAt(attemptedAt);
        if (current.date !== date || current.slot !== slot) throw new Error('Publishing slot expired');
      }
      const claimed = await store.claim(key, platform, config.channels[platform], attemptedAt);
      if (!claimed) continue;
      let result;
      try {
        result = await buffer.publish({ platform, channelId: config.channels[platform],
          text: platform === 'linkedin' ? draft.linkedinPost : draft.xPost });
      } catch (error) {
        result = failureResult(error, clock());
      }
      // A DB failure here must propagate. The durable 'publishing' claim prevents resubmission.
      draft = await store.record(key, platform, ['publishing'], { ...result, completedAt: clock() });
      if (result.nextAttemptAt) {
        await store.deferBuffer(result.nextAttemptAt);
        break; // Buffer's quota applies to the API key, across both channels.
      }
    }
    return summarize(draft, false);
  } finally {
    try { if (locked) await store.release(); }
    finally { if (ownsConnection) await disconnectMongo(); }
  }
}

function failureResult(error, now) {
  const result = { state: error instanceof BufferFailure ? error.state : 'unknown',
    failureCode: error instanceof BufferFailure ? error.code : 'BUFFER_OUTCOME_UNKNOWN' };
  if (error instanceof BufferFailure && error.bufferId) result.bufferId = error.bufferId;
  if (error instanceof BufferFailure && error.state === 'rate_limited') {
    result.nextAttemptAt = new Date(now.getTime() + error.retryAfter * 1000);
  }
  return result;
}

function assertValidated(draft) {
  if (draft.validation?.passed !== true || draft.validation.originalityPassed !== true ||
    draft.validation.version !== 2 || draft.validation.contentHash !== contentHash(draft)) {
    throw new Error('Persisted validation does not match content');
  }
  validateDraft(draft, [], { platform: draft.platform });
  // Scheduled drafts must be LinkedIn-only, so an older two-platform slot draft can never reach X.
  if ((draft.slot !== 'manual' && draft.platform !== 'linkedin') ||
    (draft.platform === 'linkedin' && (draft.xPost !== undefined || draft.publications?.x !== undefined))) {
    throw new Error('Persisted platform selection mismatch');
  }
}

async function reconcile({ store, buffer, draft, platform, bufferId, now = new Date() }) {
  if (!platformsFor(draft.platform).includes(platform) || draft.dryRun !== false || draft.schemaVersion !== 2) throw new Error('Invalid reconciliation');
  const record = draft.publications[platform];
  if (!['unknown', 'publishing', 'accepted'].includes(record.state)) throw new Error('Reconciliation is not applicable');
  assertValidated(draft);
  if (record.bufferId && record.bufferId !== bufferId) throw new Error('Buffer ID does not match stored receipt');
  buffer.assertChannel(platform, record.channelId);
  const cooldown = await store.bufferCooldown();
  if (cooldown && cooldown > now) throw new Error('Buffer cooldown is active');
  let post;
  try { post = await buffer.getPost(bufferId); }
  catch (error) {
    const result = failureResult(error, now);
    if (result.nextAttemptAt) await store.deferBuffer(result.nextAttemptAt);
    throw error;
  }
  const text = platform === 'linkedin' ? draft.linkedinPost : draft.xPost;
  if (!post || post.id !== bufferId || post.channelId !== record.channelId || post.text !== text) {
    throw new Error('Buffer reconciliation mismatch; no resubmission allowed');
  }
  return store.record(draft.key, platform, [record.state], { ...publicationResult(post), reconciledAt: now });
}

function summarize(draft, dryRun) {
  const channels = Object.fromEntries(platformsFor(draft.platform).map(platform => [platform,
    draft.publications?.[platform]?.state || 'legacy_draft']));
  return { key: draft.key, title: draft.title, dryRun, stored: true, channels,
    complete: dryRun || Object.values(channels).every(state => state === 'published'),
    requiresAttention: !dryRun && Object.values(channels).some(state => !['accepted', 'published'].includes(state)),
    published: Object.values(channels).some(state => state === 'published') };
}

function parseRunArgs(args) {
  if (args.some(arg => !['--dry-run', '--publish', '--manual', '--platform=linkedin'].includes(arg)) ||
    args.filter(arg => arg.startsWith('--platform=')).length > 1 ||
    (args.includes('--dry-run') && args.includes('--publish')) ||
    (args.includes('--manual') && !args.includes('--dry-run') && !args.includes('--publish'))) {
    throw new Error('Use --dry-run (default) or --publish, optionally with --manual; scheduled runs are always --platform=linkedin');
  }
  const manual = args.includes('--manual');
  return { dryRun: !args.includes('--publish'), manual,
    ...(!manual || args.includes('--platform=linkedin') ? { platform: 'linkedin' } : {}) };
}

if (require.main === module) {
  require('dotenv').config({ path: resolve(__dirname, '../../.env') });
  let options;
  try { options = parseRunArgs(process.argv.slice(2)); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  if (options) {
    run(options).then(result => {
      console.log(JSON.stringify(result));
      if (result.requiresAttention) process.exitCode = 2;
    }).catch(() => {
      console.error('Automation failed; check configuration, validation, database state and recovery instructions. No automatic retry.');
      process.exitCode = 1;
    });
  }
}
module.exports = { run, reconcile, summarize, generateWithCodex, parseRunArgs };
