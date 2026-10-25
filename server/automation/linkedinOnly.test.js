'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectMongo, disconnectMongo } = require('../config/db');
const Model = require('../models/AutomatedBlogPost');
const LegacyModel = require('../models/AutomatedPostDraft');
const { MongoStore, Lock } = require('./store');
const { run, parseRunArgs } = require('./run');
const { recover } = require('./recover');
const { readConfig } = require('./config');
const { BufferClient } = require('./buffer');
const { validateDraft, contentHash } = require('./validate');
const { generateWithCodex, reviewWithCodex } = require('./codex');
const { draft, review, env, now } = require('./testing/fixtures');
const linkedinDraft = () => {
  const { xPost, ...value } = draft();
  return value;
};
let mongo;
let store;
const options = patch => ({ now, clock: () => now, manual: true, platform: 'linkedin', dryRun: false,
  env: { ...env, BUFFER_X_CHANNEL_ID: undefined }, store, generate: async () => linkedinDraft(),
  review, manualHistory: () => [], ...patch });
before(async () => {
  // This suite never loads .env or connects to a configured production database.
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await connectMongo({ mongoUri: mongo.getUri('linkedin_only_tests') });
});
after(async () => { await disconnectMongo(); if (mongo) await mongo.stop(); });
beforeEach(async () => {
  await Model.deleteMany({});
  await LegacyModel.deleteMany({});
  await Lock.deleteMany({});
  store = new MongoStore();
});

test('LinkedIn-only CLI is explicit and rejects malformed or conflicting selectors', async () => {
  const command = require('../../package.json').scripts['automation:publish-manual'];
  assert.deepEqual(parseRunArgs([...command.split(' ').slice(2), '--platform=linkedin']),
    { dryRun: false, manual: true, platform: 'linkedin' });
  assert.deepEqual(parseRunArgs(['--dry-run', '--manual', '--platform=linkedin']),
    { dryRun: true, manual: true, platform: 'linkedin' });
  assert.deepEqual(parseRunArgs(['--publish', '--platform=linkedin']), { dryRun: false, manual: false, platform: 'linkedin' });
  for (const args of [['--publish', '--manual', '--platform=x'],
    ['--publish', '--manual', '--platform='], ['--publish', '--manual', '--platform', 'linkedin'],
    ['--publish', '--manual', '--platform=linkedin', '--platform=linkedin'],
    ['--publish', '--dry-run', '--manual', '--platform=linkedin']]) {
    assert.throws(() => parseRunArgs(args), /Use/);
  }
  for (const patch of [{ platform: 'x' }, { platform: null }, { platform: ['linkedin'] },
    { manual: false, platform: 'x' }, { manual: false, platform: null }]) {
    await assert.rejects(run(options({ ...patch, store: new Proxy({}, { get() { assert.fail('No database access'); } }) })),
      /platform|Platform/);
  }
});

test('LinkedIn-only config needs only LinkedIn credentials but retains the activation gate', () => {
  const config = readConfig({ ...env, BUFFER_X_CHANNEL_ID: undefined }, { dryRun: false, platform: 'linkedin' });
  assert.deepEqual(config.channels, { linkedin: env.BUFFER_LINKEDIN_CHANNEL_ID });
  assert.equal(config.platform, 'linkedin');
  assert.equal(config.publishEnabled, true);
  for (const patch of [{ BUFFER_API_KEY: '' }, { BUFFER_LINKEDIN_CHANNEL_ID: '' }, { AUTONOMOUS_PUBLISH_ENABLED: '' }]) {
    assert.throws(() => readConfig({ ...env, ...patch }, { dryRun: false, platform: 'linkedin' }), /required|disabled/);
  }
});

test('LinkedIn-only validation rejects extra X content, preserves quality checks and binds the platform to review', () => {
  const value = validateDraft(linkedinDraft(), [], { platform: 'linkedin' });
  assert.equal(value.platform, 'linkedin');
  assert.equal(Object.hasOwn(value, 'xPost'), false);
  assert.notEqual(contentHash(value), contentHash({ ...value, platform: undefined }));
  assert.throws(() => validateDraft(linkedinDraft()), /Incomplete/);
  assert.throws(() => validateDraft(draft(), [], { platform: 'linkedin' }), /selection mismatch/);
  for (const patch of [{ linkedinPost: 'too short' }, { sources: [] },
    { linkedinPost: linkedinDraft().linkedinPost.replace(/#\w+/g, '') }, { primaryKeyword: 'missing' }]) {
    assert.throws(() => validateDraft({ ...linkedinDraft(), ...patch }, [], { platform: 'linkedin' }));
  }
  // Existing two-platform validation hashes must remain valid without a data migration.
  const legacy = validateDraft(draft());
  const oldHash = createHash('sha256').update(JSON.stringify([legacy.title, legacy.topicAngle,
    legacy.primaryKeyword, legacy.secondaryKeywords, legacy.linkedinPost, legacy.xPost, legacy.sources])).digest('hex');
  assert.equal(contentHash(legacy), oldHash);
});

test('LinkedIn-only Buffer client rejects X preflight and publishing before HTTP even with X configured', async () => {
  let requests = 0;
  const client = new BufferClient({ platform: 'linkedin', apiKey: 'test-only-key', dryRun: false, publishEnabled: true,
    channels: { linkedin: env.BUFFER_LINKEDIN_CHANNEL_ID, x: env.BUFFER_X_CHANNEL_ID },
    fetchImpl: async () => { requests++; assert.fail('No X HTTP requests allowed'); } });
  await assert.rejects(client.verifyChannel('x'), /CHANNEL_NOT_ALLOWLISTED/);
  await assert.rejects(client.publish({ platform: 'x', channelId: env.BUFFER_X_CHANNEL_ID, text: draft().xPost }), /CHANNEL_NOT_ALLOWLISTED/);
  assert.equal(requests, 0);
});

for (const subscriptionType of ['None', 'Basic', 'Premium']) {
  test(`LinkedIn-only submission sends exactly one LinkedIn mutation and zero X requests (${subscriptionType})`, async () => {
    const requests = [];
    const client = new BufferClient({ ...readConfig(env, { dryRun: false, platform: 'linkedin' }),
      fetchImpl: async (_url, request) => {
        const { query, variables } = JSON.parse(request.body);
        const platform = query.startsWith('query')
          ? (query.includes(env.BUFFER_X_CHANNEL_ID) ? 'x' : 'linkedin')
          : (variables.input.channelId === env.BUFFER_X_CHANNEL_ID ? 'x' : 'linkedin');
        requests.push({ platform, mutation: query.startsWith('mutation') });
        assert.equal(platform, 'linkedin');
        const saved = await Model.findOne().lean();
        assert.equal(saved.platform, 'linkedin');
        assert.equal(Object.hasOwn(saved, 'xPost'), false);
        assert.deepEqual(Object.keys(saved.publications), ['linkedin']);
        if (query.startsWith('query')) return { ok: true, status: 200, json: async () => ({ data: { channel: {
          id: env.BUFFER_LINKEDIN_CHANNEL_ID, service: 'linkedin', allowedActions: ['scheduleUpdates'],
          isDisconnected: false, isLocked: false, isQueuePaused: false, metadata: { subscriptionType }
        } } }) };
        assert.equal(saved.publications.linkedin.state, 'publishing');
        assert.equal(saved.publications.linkedin.attempts, 1);
        assert.equal(variables.input.text, saved.linkedinPost);
        return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'linkedin-receipt', status: 'sent' } } } }) };
      } });
    const result = await run(options({ buffer: client, env, generate: async context => {
      assert.equal(context.platform, 'linkedin'); return linkedinDraft();
    }, review: async (value, context) => {
      assert.equal(context.platform, 'linkedin'); assert.equal(value.xPost, undefined); return review(value);
    } }));
    assert.deepEqual(result.channels, { linkedin: 'published' });
    assert.equal(result.complete, true);
    assert.equal(result.requiresAttention, false);
    assert.deepEqual(requests, [{ platform: 'linkedin', mutation: false }, { platform: 'linkedin', mutation: true }]);
    const saved = await store.get(result.key);
    assert.equal(saved.publications.linkedin.bufferId, 'linkedin-receipt');
    assert.equal(saved.publications.linkedin.attempts, 1);
    await assert.rejects(run(options({ buffer: client })), /Duplicate/);
    assert.equal(requests.length, 2);
  });
}

test('LinkedIn-only safe dry run uses Codex schemas and disposable MongoDB with zero Buffer access', async () => {
  let bufferAccesses = 0;
  let executions = 0;
  const execute = (_command, args, config) => {
    executions++;
    const schema = JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8'));
    const isReview = Boolean(schema.properties.originalityPassed);
    assert.equal(config.env.BUFFER_API_KEY, undefined);
    assert.equal(config.env.MONGO_URI, undefined);
    if (isReview) {
      assert(config.input.includes('ALL factual statements in the LinkedIn post'));
      assert(!config.input.includes('"xPost"'));
    } else {
      assert(config.input.includes('Produce exactly one LinkedIn post'));
      assert.equal(schema.properties.xPost, undefined);
      assert(!schema.required.includes('xPost'));
      assert.equal(schema.additionalProperties, false);
    }
    const value = isReview ? { approved: true, qualityPassed: true, originalityPassed: true,
      unsupportedClaims: [], sourceChecks: linkedinDraft().sources.map(s => ({ url: s.url, supported: true })) } : linkedinDraft();
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify(value));
    return { status: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'web_search' } }) };
  };
  const result = await run(options({ ...parseRunArgs(['--dry-run', '--manual', '--platform=linkedin']),
    buffer: new Proxy({}, { get() { bufferAccesses++; assert.fail('No Buffer access'); } }),
    generate: input => generateWithCodex(input, { execute, env }),
    review: (value, context) => reviewWithCodex(value, { ...context, execute, env }) }));
  const saved = await store.get(result.key);
  assert.deepEqual(result.channels, { linkedin: 'not_published' });
  assert.equal(result.published, false);
  assert.equal(saved.publications.linkedin.attempts, 0);
  assert.equal(saved.validation.originalityPassed, true);
  assert.equal(Object.hasOwn(saved, 'xPost'), false);
  assert.equal(Object.hasOwn(saved.publications, 'x'), false);
  assert.equal(executions, 2);
  assert.equal(bufferAccesses, 0);
  console.log('LinkedIn-only safe dry run: one reviewed LinkedIn post saved; no X post or publication; Buffer calls = 0. Codex output mocked.');
});

test('LinkedIn-only run preserves source review, log duplicate and persistence gates before Buffer', async () => {
  let bufferAccesses = 0;
  const buffer = new Proxy({}, { get() { bufferAccesses++; assert.fail('Invalid content cannot access Buffer'); } });
  for (const patch of [{ generate: async () => draft() }, { generate: async () => ({ ...linkedinDraft(), sources: [] }) },
    { review: async value => ({ ...await review(value), originalityPassed: false }) },
    { manualHistory: () => [{ title: linkedinDraft().title }] }]) {
    await assert.rejects(run(options({ buffer, ...patch })));
    assert.equal(await Model.countDocuments(), 0);
    assert.equal(await Lock.countDocuments(), 0);
  }
  store.save = async () => { throw new Error('database unavailable'); };
  await assert.rejects(run(options({ buffer })), /database unavailable/);
  assert.equal(bufferAccesses, 0);
});

test('LinkedIn-only malformed generated and previously reviewed posts cannot reach Buffer', async () => {
  const buffer = new Proxy({}, { get() { assert.fail('Malformed posts cannot access Buffer'); } });
  const malformed = [
    linkedinDraft().linkedinPost.replace('MongoDB documents', '[MongoDB](https://www.mongodb.com/) documents'),
    linkedinDraft().linkedinPost.replace(' #SoftwareEngineering', '')
  ];
  for (const linkedinPost of malformed) {
    await assert.rejects(run(options({ buffer, generate: async () => ({ ...linkedinDraft(), linkedinPost }),
      review: async () => assert.fail('Malformed posts cannot reach review') })), /plain text|Invalid hashtags/);
    assert.equal(await Model.countDocuments(), 0);
  }
  // Simulate a draft approved by the previous validator. Even a matching review hash
  // must not let old formatting bypass current validation when a scheduled run resumes.
  const result = await run(options({ manual: false, dryRun: true }));
  const saved = await store.get(result.key);
  for (const linkedinPost of malformed) {
    const changed = { ...saved, linkedinPost };
    await Model.collection.updateOne({ key: result.key }, { $set: {
      linkedinPost, dryRun: false, contentHash: contentHash(changed),
      'validation.contentHash': contentHash(changed), 'publications.linkedin.state': 'pending'
    } });
    await assert.rejects(run(options({ manual: false, buffer,
      generate: async () => assert.fail('Existing drafts must be revalidated') })), /plain text|Invalid hashtags/);
    assert.equal((await store.get(result.key)).publications.linkedin.attempts, 0);
  }
});

test('duplicate history is shared between LinkedIn-only and two-platform runs in both directions', async () => {
  await run(options({ dryRun: true }));
  await assert.rejects(run(options({ platform: undefined, dryRun: true, generate: async () => draft() })), /Duplicate/);
  await Model.deleteMany({});
  await run(options({ platform: undefined, dryRun: true, generate: async () => draft() }));
  await assert.rejects(run(options({ dryRun: true })), /Duplicate/);
});

test('LinkedIn-only Mongo records forbid X fields and atomic X claims even after an injected X publication', async () => {
  const result = await run(options({ dryRun: true }));
  const saved = await store.get(result.key);
  const copied = { ...saved, _id: undefined, key: 'other-key', topicHash: 'other-topic' };
  await assert.rejects(store.save({ ...copied, xPost: draft().xPost }), /cannot contain an X/);
  await assert.rejects(store.save({ ...copied, publications: { ...copied.publications, x: copied.publications.linkedin } }), /cannot contain an X/);
  await Model.collection.updateOne({ key: result.key }, { $set: { dryRun: false, 'publications.x': {
    state: 'pending', attempts: 0, channelId: env.BUFFER_X_CHANNEL_ID, idempotencyKey: 'injected'
  } } });
  assert.equal(await store.claim(result.key, 'x', env.BUFFER_X_CHANNEL_ID, now), null);
});

for (const outcome of ['accepted', 'unknown', 'rejected', 'rate_limited']) {
  test(`LinkedIn-only ${outcome} is recorded once without X submission or automatic retry`, async () => {
    let mutations = 0;
    const client = new BufferClient({ ...readConfig(env, { dryRun: false, platform: 'linkedin' }),
      fetchImpl: async (_url, request) => {
        const { query, variables } = JSON.parse(request.body);
        assert(!query.includes(env.BUFFER_X_CHANNEL_ID));
        if (query.startsWith('query')) return { ok: true, status: 200, json: async () => ({ data: { channel: {
          id: env.BUFFER_LINKEDIN_CHANNEL_ID, service: 'linkedin', allowedActions: ['scheduleUpdates'],
          isDisconnected: false, isLocked: false, isQueuePaused: false
        } } }) };
        mutations++;
        assert.equal(variables.input.channelId, env.BUFFER_LINKEDIN_CHANNEL_ID);
        if (outcome === 'unknown') throw new Error('response lost');
        if (outcome === 'rate_limited') return { ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }) };
        return { ok: true, status: 200, json: async () => ({ data: { createPost: outcome === 'rejected'
          ? { message: 'rejected' } : { post: { id: 'linkedin-receipt', status: 'sending' } } } }) };
      } });
    const result = await run(options({ buffer: client }));
    assert.deepEqual(result.channels, { linkedin: outcome });
    assert.equal(result.complete, false);
    assert.equal((await store.get(result.key)).publications.linkedin.attempts, 1);
    await assert.rejects(run(options({ buffer: client })), /Duplicate/);
    assert.equal(mutations, 1);
    if (outcome === 'rate_limited') assert.equal((await store.bufferCooldown()).getTime(), now.getTime() + 120000);
  });
}

test('LinkedIn-only receipts can be inspected and reconciled read-only without X credentials', async () => {
  const result = await run(options({ buffer: { verifyChannel: async () => {},
    publish: async () => ({ state: 'accepted', bufferId: 'linkedin-receipt', bufferStatus: 'sending' }) } }));
  const noXEnv = { ...env, BUFFER_X_CHANNEL_ID: undefined };
  const inspected = await recover({ key: result.key, env: noXEnv, store });
  assert.deepEqual(Object.keys(inspected.publications), ['linkedin']);
  let reads = 0;
  const client = new BufferClient({ ...readConfig(noXEnv, { platform: 'linkedin' }), fetchImpl: async (_url, request) => {
    reads++;
    assert(JSON.parse(request.body).query.startsWith('query'));
    return { ok: true, status: 200, json: async () => ({ data: { post: { id: 'linkedin-receipt', status: 'sent',
      channelId: env.BUFFER_LINKEDIN_CHANNEL_ID, text: linkedinDraft().linkedinPost } } }) };
  } });
  const delivered = await recover({ key: result.key, platform: 'linkedin', bufferId: 'linkedin-receipt', env: noXEnv, store, buffer: client });
  assert.equal(delivered.complete, true);
  await assert.rejects(recover({ key: result.key, platform: 'x', bufferId: 'x-id', env, store, buffer: client }), /Invalid reconciliation/);
  assert.equal(reads, 1);
  await Model.collection.updateOne({ key: result.key }, { $unset: { platform: '' },
    $set: { 'publications.linkedin.state': 'accepted' } });
  await assert.rejects(recover({ key: result.key, platform: 'linkedin', bufferId: 'linkedin-receipt', env: noXEnv, store, buffer: client }), /validation/);
  assert.equal(reads, 1);
});

for (const slotTime of ['2026-10-21T05:00:00Z', '2026-10-21T17:00:00Z']) {
  test(`scheduled publishing is LinkedIn-only even with a Premium X channel configured (${slotTime})`, async () => {
    const at = new Date(slotTime);
    const requests = [];
    const client = new BufferClient({ ...readConfig(env, { dryRun: false, platform: 'linkedin' }),
      fetchImpl: async (_url, request) => {
        const { query, variables } = JSON.parse(request.body);
        const isX = query.includes(env.BUFFER_X_CHANNEL_ID) || variables.input?.channelId === env.BUFFER_X_CHANNEL_ID;
        requests.push({ platform: isX ? 'x' : 'linkedin', mutation: query.startsWith('mutation') });
        if (query.startsWith('query')) return { ok: true, status: 200, json: async () => ({ data: { channel: {
          id: env.BUFFER_LINKEDIN_CHANNEL_ID, service: 'linkedin', allowedActions: ['scheduleUpdates'],
          isDisconnected: false, isLocked: false, isQueuePaused: false, metadata: { subscriptionType: 'Premium' } } } }) };
        return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'li-scheduled', status: 'sent' } } } }) };
      } });
    const generated = [];
    const result = await run(options({ ...parseRunArgs(['--publish']), now: at, clock: () => at, env, buffer: client,
      generate: async context => { generated.push(context.platform); return linkedinDraft(); } }));
    assert.deepEqual(generated, ['linkedin']);
    assert.match(result.key, /^post-generator:2026-10-21:(morning|evening)$/);
    assert.deepEqual(result.channels, { linkedin: 'published' });
    assert.deepEqual(requests, [{ platform: 'linkedin', mutation: false }, { platform: 'linkedin', mutation: true }]);
    const saved = await store.get(result.key);
    assert.equal(saved.platform, 'linkedin');
    assert.equal(Object.hasOwn(saved, 'xPost'), false);
    assert.deepEqual(Object.keys(saved.publications), ['linkedin']);
    // Rerunning the same slot makes no further Buffer requests.
    await run(options({ ...parseRunArgs(['--publish']), now: at, clock: () => at, env, buffer: client }));
    assert.equal(requests.length, 2);
  });
}

test('scheduled runs reject X selections and an X-bearing draft before any Buffer access', async () => {
  for (const platform of ['x', null]) {
    await assert.rejects(run(options({ manual: false, platform,
      store: new Proxy({}, { get() { assert.fail('No database access'); } }) })), /platform/);
  }
  await assert.rejects(run(options({ manual: false, buffer: new Proxy({}, { get() { assert.fail('No Buffer access'); } }),
    generate: async () => draft() })), /platform selection mismatch/);
  assert.equal(await Model.countDocuments(), 0);
});

test('a two-platform scheduled draft can never be saved or published', async () => {
  const value = validateDraft(draft(), []);
  const base = { ...value, validation: { passed: true, originalityPassed: true, version: 2, contentHash: value.contentHash },
    schemaVersion: 2, key: 'post-generator:2026-10-21:morning', date: '2026-10-21', slot: 'morning', dryRun: false,
    status: 'validated', publications: { linkedin: { channelId: env.BUFFER_LINKEDIN_CHANNEL_ID, idempotencyKey: 'a', state: 'pending' },
      x: { channelId: env.BUFFER_X_CHANNEL_ID, idempotencyKey: 'b', state: 'pending' } } };
  await assert.rejects(store.save(base), /Scheduled drafts must be LinkedIn-only/);
  // Even if such a row already exists (written outside the model), the scheduler refuses to resume it.
  await Model.collection.insertOne(base);
  await assert.rejects(run(options({ manual: false, env,
    buffer: new Proxy({}, { get() { assert.fail('No Buffer access'); } }) })), /platform selection changed/);
  const saved = await store.get(base.key);
  assert.equal(saved.publications.x.state, 'pending');
  assert.equal(saved.publications.x.attempts, undefined);
});
