'use strict';

const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { slotAt, londonDate } = require('./slot');
const { validateDraft, validateReview, contentHash, digest } = require('./validate');
const { readConfig } = require('./config');
const { generateWithCodex } = require('./codex');
const { createEngineSession, generateWithFallback, reviewWithFallback } = require('./engines');
const { MongoStore, assertWritable } = require('./store');
const { BufferClient, BufferFailure, publicationResult } = require('./buffer');
const { connectMongo, disconnectMongo, getMongoStatus } = require('../config/db');
const { readLogEntries } = require('../../.agents/skills/linkedin-post-orchestrator/scripts/title_log_utils');
const { platformsFor } = require('./platforms');
const { safeFailureCode } = require('./errors');
const MAX_REVISIONS = 1;

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
  let phase = 'database-initialize';
  try {
    await store.initialize();
    phase = 'database-lock';
    await store.acquire();
    locked = true;
    let draft = await store.get(key);
    if (!draft) {
      phase = 'history';
      const previous = [...await store.history(), ...await manualHistory()];
      // Engine choice never relaxes validation: fallback drafts face the same review and duplicate checks.
      phase = 'generation';
      let generated = await generate({ date, slot, previous, platform, engines });
      let validated, validation;
      // One revision pass: a rejected draft is corrected from the reviewer's findings, then must pass
      // full draft validation and a fresh independent review. A second rejection still fails closed.
      for (let attempt = 0; ; attempt++) {
        phase = 'draft-validation';
        validated = validateDraft(generated, previous, { platform });
        phase = 'review';
        const reviewed = await review(validated, { previous, date, slot, platform, engines });
        phase = 'review-validation';
        try {
          validation = validateReview(reviewed, validated, clock());
          break;
        } catch (error) {
          if (error?.code !== 'REVIEW_REJECTED' || attempt >= MAX_REVISIONS) throw error;
          phase = 'revision';
          generated = await generate({ date, slot, previous, platform, engines,
            revision: { draft: validated, review: reviewed } });
        }
      }
      const generation = engines.record();
      const publications = Object.fromEntries(platforms.map(platform => [platform, {
        channelId: config.channels[platform] || '', idempotencyKey: digest(`${key}:${platform}`),
        state: dryRun ? 'not_published' : 'pending', attempts: 0
      }]));
      phase = 'draft-save';
      draft = await store.save({ ...validated, validation, schemaVersion: 2, key, date, slot, dryRun,
        status: 'validated', publications, ...(generation.engine ? { generation } : {}) });
      if (!draft) throw new Error('Draft persistence failed');
    }
    if (draft.platform !== platform) throw new Error('Persisted platform selection changed');
    if (dryRun) return summarize(draft, true);
    // Historical records stay inspectable, but nothing past this point may touch Buffer or the record.
    assertWritable(draft);
    // Legacy and dry-run drafts are never implicitly upgraded or published.
    if (draft.schemaVersion !== 2 || draft.dryRun !== false) throw new Error('Existing draft is not eligible for publishing');
    phase = 'stored-draft-validation';
    assertValidated(draft);
    for (const platform of platforms) {
      if (draft.publications[platform].channelId !== config.channels[platform]) throw new Error('Channel mapping changed');
    }
    buffer ||= new BufferClient(config);
    phase = 'buffer-cooldown-check';
    const cooldown = await store.bufferCooldown();
    if (cooldown && cooldown > clock()) return { ...summarize(draft, false), retryAt: cooldown, requiresAttention: true };
    const eligible = platform => {
      const record = draft.publications[platform];
      return record.attempts < 3 && (record.state === 'pending' ||
        (record.state === 'rate_limited' && record.nextAttemptAt <= clock()));
    };
    // Finish preflight before sending: shared auth/API failures and cooldowns still stop all sends.
    for (const platform of platforms.filter(eligible)) {
      phase = 'buffer-channel-preflight';
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
        phase = 'publication-receipt';
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
      phase = 'publication-claim';
      const claimed = await store.claim(key, platform, config.channels[platform], attemptedAt);
      if (!claimed) continue;
      let result;
      try {
        phase = 'buffer-submission';
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
  } catch (error) {
    if (error && typeof error === 'object') error.automationPhase = phase;
    throw error;
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
  assertWritable(draft);
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

function safeFailureDiagnostic(error) {
  // Never print exception messages, stack traces, URLs or credential-bearing upstream responses.
  const allowedPhases = new Set(['database-initialize', 'database-lock', 'history',
    'generation-validation', 'generation', 'draft-validation', 'review', 'review-validation', 'revision', 'draft-save', 'stored-draft-validation',
    'buffer-cooldown-check', 'buffer-channel-preflight', 'publication-claim',
    'buffer-submission', 'publication-receipt']);
  const phase = allowedPhases.has(error?.automationPhase) ? error.automationPhase : 'startup-or-cleanup';
  const name = ['Error', 'TypeError', 'RangeError', 'ValidationError', 'MongoServerError',
    'MongoNetworkError', 'MongooseError', 'BufferFailure', 'CodexRateLimited'].includes(error?.name)
    ? error.name : 'Error';
  const code = safeFailureCode(error);
  const detail = code ? ` [${code}${error.codexRateLimited === true ? '; CODEX_RATE_LIMITED' : ''}]` : '';
  return `Automation failed at ${phase} (${name})${detail}. No automatic retry. Inspect the stored publication state before any new live attempt.`;
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
    }).catch(error => {
      console.error(safeFailureDiagnostic(error));
      process.exitCode = 1;
    });
  }
}
module.exports = { run, reconcile, summarize, generateWithCodex, parseRunArgs, safeFailureDiagnostic };
