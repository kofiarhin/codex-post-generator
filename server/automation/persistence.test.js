'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectMongo, disconnectMongo } = require('../config/db');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoStore, Lock } = require('./store');
const Model = require('../models/AutomatedPostDraft');
const { run, reconcile } = require('./run');
const { recover } = require('./recover');
const { generateWithCodex, reviewWithCodex } = require('./codex');
const fs = require('node:fs');
const { BufferClient, BufferFailure } = require('./buffer');
const { draft, draftFor, linkedinDraft, review, env, now } = require('./testing/fixtures');
const withoutX = ({ xPost, ...value }) => value;
let mongo;
let store;
let calls;
let buffer;
const options = patch => ({ now, env, store, buffer, generate: async input => draftFor(input), review,
  clock: () => patch?.now || now, manualHistory: () => [], ...patch });
before(async () => {
  // No .env loading and no production URI: this suite starts its own disposable local database.
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await connectMongo({ mongoUri: mongo.getUri('post_generator_test') });
});
after(async () => { await disconnectMongo(); if (mongo) await mongo.stop(); });
beforeEach(async () => {
  await Model.deleteMany({});
  await Lock.deleteMany({});
  store = new MongoStore();
  calls = [];
  buffer = {
    verifyChannel: async () => {}, assertChannel: () => {},
    publish: async input => {
      const saved = await Model.findOne({ [`publications.${input.platform}.state`]: 'publishing' }).lean();
      assert(saved, 'The publication claim must be persisted before sending');
      assert.equal(input.text, input.platform === 'linkedin' ? saved.linkedinPost : saved.xPost);
      calls.push(input.platform);
      return { state: 'published', bufferId: `buffer-${input.platform}`, bufferStatus: 'sent' };
    }
  };
});

test('end-to-end scheduled dry run persists a LinkedIn-only validated draft and makes zero Buffer calls', async () => {
  buffer.verifyChannel = async () => { throw new Error('Dry run must not call Buffer'); };
  const result = await run(options({ generate: async input => {
    assert.equal(input.platform, 'linkedin');
    return draftFor(input);
  } }));
  const saved = await Model.findOne({ key: result.key }).lean();
  assert.equal(saved.key, 'post-generator:2026-10-21:morning');
  assert.equal(saved.platform, 'linkedin');
  assert.equal(saved.linkedinPost, draft().linkedinPost);
  assert.equal(Object.hasOwn(saved, 'xPost'), false);
  assert.deepEqual(Object.keys(saved.publications), ['linkedin']);
  assert.equal(saved.sources.length, 2);
  assert.equal(saved.validation.passed, true);
  assert.equal(saved.dryRun, true);
  assert.equal(saved.publications.linkedin.state, 'not_published');
  assert.equal(saved.publications.linkedin.attempts, 0);
  assert.deepEqual(result.channels, { linkedin: 'not_published' });
  assert.equal(result.published, false);
  assert.deepEqual(calls, []);
  console.log('Scheduled dry-run evidence: LinkedIn-only draft, source evidence and validation persisted; Buffer calls = 0.');
});

function alternativeDraft() {
  const value = draft();
  return { ...value, title: 'Request cancellation needs explicit ownership',
    topicAngle: 'Propagating abort signals through request lifecycles', primaryKeyword: 'Request cancellation',
    linkedinPost: value.linkedinPost.replaceAll('Database transactions', 'Request cancellation'),
    xPost: value.xPost.replaceAll('Database transactions', 'Request cancellation') };
}

test('manual run outside slots saves both reviewed drafts with publishing enabled and zero Buffer access', async () => {
  let bufferAccesses = 0;
  const forbiddenBuffer = new Proxy({}, { get() { bufferAccesses++; throw new Error('Buffer is forbidden'); } });
  const result = await run(options({ manual: true, now: new Date('2026-10-21T23:35:00Z'), buffer: forbiddenBuffer }));
  const saved = await store.get(result.key);
  assert.match(result.key, /^post-generator:manual:2026-10-22:[0-9a-f-]{36}$/);
  assert.equal(saved.slot, 'manual');
  assert.equal(saved.date, '2026-10-22');
  assert.equal(saved.dryRun, true);
  assert.equal(saved.linkedinPost, draft().linkedinPost);
  assert.equal(saved.xPost, draft().xPost);
  assert.equal(saved.validation.passed, true);
  assert.equal(saved.validation.originalityPassed, true);
  assert.equal(saved.validation.contentHash, saved.contentHash);
  for (const platform of ['linkedin', 'x']) {
    assert.equal(saved.publications[platform].state, 'not_published');
    assert.equal(saved.publications[platform].attempts, 0);
  }
  assert.equal(bufferAccesses, 0);
  assert.equal(result.published, false);
  assert.equal(await Lock.countDocuments(), 0);
  const inspected = await recover({ key: result.key, env, store, buffer: forbiddenBuffer });
  assert.equal(inspected.title, saved.title);
  await assert.rejects(recover({ key: result.key, platform: 'x', bufferId: 'id', env, store, buffer: forbiddenBuffer }), /only be inspected/);
  await assert.rejects(reconcile({ store, buffer: forbiddenBuffer, draft: saved, platform: 'x', bufferId: 'id' }), /Invalid reconciliation/);
  assert.equal(bufferAccesses, 0);
});

test('manual runs at the same instant have unique keys and idempotency keys', async () => {
  const first = await run(options({ manual: true }));
  const second = await run(options({ manual: true, generate: async () => alternativeDraft() }));
  assert.notEqual(first.key, second.key);
  const savedFirst = await store.get(first.key);
  const savedSecond = await store.get(second.key);
  for (const platform of ['linkedin', 'x']) {
    assert.notEqual(savedFirst.publications[platform].idempotencyKey, savedSecond.publications[platform].idempotencyKey);
  }
  assert.equal(await Model.countDocuments(), 2);
  assert.deepEqual(calls, []);
});

test('manual publishing can run repeatedly at the same off-schedule instant without a daily cap', async () => {
  const instant = new Date('2026-10-21T12:35:00Z');
  const topics = [draft(), alternativeDraft(),
    { ...draft(), title: 'Build caches require reliable fingerprints', topicAngle: 'Compiler inputs determine artifact reuse', primaryKeyword: 'Build caches' },
    { ...draft(), title: 'Connection pools hide resource starvation', topicAngle: 'Socket budgets constrain parallel workloads', primaryKeyword: 'Connection pools' }];
  const keys = new Set();
  const identities = new Set();
  let generations = 0;
  let reviews = 0;
  let preflights = 0;
  buffer.verifyChannel = async () => { preflights++; };
  for (const topic of topics) {
    const value = { ...topic,
      linkedinPost: topic.linkedinPost.replaceAll('Database transactions', topic.primaryKeyword),
      xPost: topic.xPost.replaceAll('Database transactions', topic.primaryKeyword) };
    const result = await run(options({ manual: true, dryRun: false, now: instant,
      generate: async ({ previous, slot }) => {
        assert.equal(slot, 'manual');
        assert.equal(previous.length, generations++);
        return value;
      }, review: async (value, context) => {
        assert.equal(context.previous.length, reviews++);
        return review(value);
      } }));
    keys.add(result.key);
    assert.equal(result.complete, true);
    assert.equal(result.requiresAttention, false);
    const saved = await store.get(result.key);
    assert.equal(saved.slot, 'manual');
    assert.equal(saved.dryRun, false);
    assert.equal(saved.validation.originalityPassed, true);
    for (const platform of ['linkedin', 'x']) {
      const receipt = saved.publications[platform];
      identities.add(receipt.idempotencyKey);
      assert.equal(receipt.attempts, 1);
      assert.equal(receipt.bufferId, `buffer-${platform}`);
      assert.equal(receipt.attemptedAt.getTime(), instant.getTime());
      assert.equal(receipt.completedAt.getTime(), instant.getTime());
    }
  }
  assert.equal(keys.size, 4);
  assert.equal(identities.size, 8);
  assert.equal(generations, 4);
  assert.equal(reviews, 4);
  assert.equal(preflights, 8);
  assert.deepEqual(calls, ['linkedin', 'x', 'linkedin', 'x', 'linkedin', 'x', 'linkedin', 'x']);
  assert.equal(await Model.countDocuments(), 4);
  assert.equal(await Model.countDocuments({ slot: { $in: ['morning', 'evening'] } }), 0);
});

test('manual publishing can cross London midnight during generation', async () => {
  const result = await run(options({ manual: true, dryRun: false,
    now: new Date('2026-10-21T22:59:00Z'), clock: () => new Date('2026-10-21T23:01:00Z') }));
  assert.match(result.key, /^post-generator:manual:2026-10-21:/);
  assert.equal(result.complete, true);
  assert.deepEqual(calls, ['linkedin', 'x']);
});

test('manual publishing retains configuration gates before store access', async () => {
  const forbiddenStore = new Proxy({}, { get() { assert.fail('Configuration must fail before database access'); } });
  for (const patch of [{ AUTONOMOUS_PUBLISH_ENABLED: '' }, { BUFFER_API_KEY: '' },
    { BUFFER_LINKEDIN_CHANNEL_ID: '' }, { BUFFER_X_CHANNEL_ID: '' },
    { BUFFER_X_CHANNEL_ID: env.BUFFER_LINKEDIN_CHANNEL_ID }]) {
    await assert.rejects(run(options({ manual: true, dryRun: false, env: { ...env, ...patch }, store: forbiddenStore })),
      /disabled|required|differ/);
  }
  assert.deepEqual(calls, []);
});

test('manual publishing rejects validation, semantic duplicates, log duplicates and storage failures before Buffer', async () => {
  buffer.verifyChannel = async () => { assert.fail('Invalid drafts must not reach Buffer'); };
  for (const patch of [
    { generate: async () => { throw new Error('generation unavailable'); } },
    { generate: async () => ({ ...draft(), sources: [] }) },
    { review: async value => ({ ...await review(value), originalityPassed: false }) },
    { manualHistory: () => [{ title: draft().title }] }
  ]) {
    await assert.rejects(run(options({ manual: true, dryRun: false, ...patch })));
    assert.equal(await Model.countDocuments(), 0);
    assert.equal(await Lock.countDocuments(), 0);
  }
  store.save = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(run(options({ manual: true, dryRun: false })), /storage/);
  assert.equal(await Lock.countDocuments(), 0);
  assert.deepEqual(calls, []);
});

test('manual published topics block repeated titles, angles and copy in manual and scheduled runs', async () => {
  await run(options({ manual: true, dryRun: false }));
  for (const manual of [true, false]) {
    for (const value of [draft(), { ...alternativeDraft(), topicAngle: draft().topicAngle },
      { ...alternativeDraft(), xPost: draft().xPost, primaryKeyword: draft().primaryKeyword,
        linkedinPost: draft().linkedinPost }]) {
      await assert.rejects(run(options({ manual, dryRun: false, generate: async () => manual ? value : withoutX(value) })), /Duplicate/);
    }
  }
  assert.equal(await Model.countDocuments(), 1);
  assert.deepEqual(calls, ['linkedin', 'x']);
});

test('manual publishing shares the lock with other manual and scheduled publishers', async () => {
  let unblock;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const first = run(options({ manual: true, dryRun: false, generate: async () => {
    started(); await new Promise(resolve => { unblock = resolve; }); return draft();
  } }));
  await ready;
  try {
    for (const manual of [true, false]) {
      await assert.rejects(run(options({ manual, dryRun: false, store: new MongoStore() })), /locked/);
    }
  } finally { unblock(); }
  await first;
  assert.deepEqual(calls, ['linkedin', 'x']);
});

test('manual uncertain outcomes are not retried and can be reconciled read-only by run key', async () => {
  const publish = buffer.publish;
  buffer.publish = async input => {
    if (input.platform === 'x') { calls.push('x'); throw new Error('response lost after send'); }
    return publish(input);
  };
  const result = await run(options({ manual: true, dryRun: false }));
  assert.deepEqual(result.channels, { linkedin: 'published', x: 'unknown' });
  assert.equal(result.requiresAttention, true);
  await assert.rejects(run(options({ manual: true, dryRun: false })), /Duplicate/);
  const saved = await store.get(result.key);
  assert.equal(saved.publications.x.attempts, 1);
  assert.equal(saved.publications.x.failureCode, 'BUFFER_OUTCOME_UNKNOWN');
  buffer.getPost = async id => ({ id, channelId: env.BUFFER_X_CHANNEL_ID, text: draft().xPost, status: 'sent' });
  const reconciled = await recover({ key: result.key, platform: 'x', bufferId: 'observed-id', env, store, buffer });
  assert.equal(reconciled.complete, true);
  await run(options({ manual: true, dryRun: false, generate: async () => alternativeDraft() }));
  assert.equal((await store.get(result.key)).publications.x.attempts, 1);
  assert.deepEqual(calls, ['linkedin', 'x', 'linkedin', 'x']);
});

test('manual receipt persistence failure leaves a durable claim and duplicate protection blocks replay', async () => {
  store.record = async () => { throw new Error('receipt write failed'); };
  await assert.rejects(run(options({ manual: true, dryRun: false })), /receipt write/);
  const saved = await Model.findOne().lean();
  assert.equal(saved.publications.linkedin.state, 'publishing');
  assert.equal(saved.publications.linkedin.attempts, 1);
  await assert.rejects(run(options({ manual: true, dryRun: false, store: new MongoStore() })), /Duplicate/);
  assert.deepEqual(calls, ['linkedin']);
});

test('manual preflight rejection records failure without publication', async () => {
  buffer.verifyChannel = async () => { throw new BufferFailure('BUFFER_CHANNEL_UNAVAILABLE', 'rejected'); };
  const result = await run(options({ manual: true, dryRun: false }));
  assert.deepEqual(result.channels, { linkedin: 'rejected', x: 'rejected' });
  assert.equal(result.requiresAttention, true);
  assert.equal((await store.get(result.key)).publications.x.attempts, 0);
  assert.deepEqual(calls, []);
});

test('manual runs respect durable Buffer cooldown across fresh run IDs', async () => {
  let preflights = 0;
  buffer.verifyChannel = async () => { preflights++; };
  buffer.publish = async input => { calls.push(input.platform); throw new BufferFailure('BUFFER_RATE_LIMITED', 'rate_limited', 120); };
  const first = await run(options({ manual: true, dryRun: false }));
  assert.deepEqual(first.channels, { linkedin: 'rate_limited', x: 'pending' });
  const second = await run(options({ manual: true, dryRun: false, store: new MongoStore(), generate: async () => alternativeDraft() }));
  assert.notEqual(first.key, second.key);
  assert.deepEqual(second.channels, { linkedin: 'pending', x: 'pending' });
  assert.equal(second.requiresAttention, true);
  assert.equal(second.retryAt.getTime(), now.getTime() + 120000);
  assert.equal(preflights, 2);
  assert.deepEqual(calls, ['linkedin']);
});

test('manual drafts do not reserve scheduled keys and scheduled generation still sees their history', async () => {
  const manual = await run(options({ manual: true }));
  assert.equal(await store.get('post-generator:2026-10-21:morning'), null);
  const scheduled = await run(options({ generate: async ({ previous }) => {
    assert(previous.some(p => p.title === draft().title));
    return withoutX(alternativeDraft());
  } }));
  assert.equal(scheduled.key, 'post-generator:2026-10-21:morning');
  assert.notEqual(scheduled.key, manual.key);
  assert.equal(await Model.countDocuments(), 2);
  assert.deepEqual(calls, []);
});

test('invalid manual options and scheduled runs outside slots fail before accessing the store', async () => {
  let accesses = 0;
  const forbiddenStore = new Proxy({}, { get() { accesses++; throw new Error('Store is forbidden'); } });
  await assert.rejects(run(options({ manual: 'true', store: forbiddenStore })), /Invalid manual/);
  for (const dryRun of [true, false]) {
    await assert.rejects(run(options({ dryRun, now: new Date('2026-10-21T12:00:00Z'), store: forbiddenStore })), /Outside/);
  }
  assert.equal(accesses, 0);
  assert.deepEqual(calls, []);
});

test('manual runs preserve generation, validation, independent review and both duplicate-history gates', async () => {
  const manual = { manual: true, now: new Date('2026-10-21T12:00:00Z') };
  for (const patch of [
    { generate: async () => { throw new Error('research unavailable'); } },
    { generate: async () => ({ ...draft(), sources: [] }) },
    { review: async () => ({ approved: false }) },
    { manualHistory: () => [{ title: draft().title }] }
  ]) {
    await assert.rejects(run(options({ ...manual, ...patch })));
    assert.equal(await Model.countDocuments(), 0);
    assert.equal(await Lock.countDocuments(), 0);
  }
  await run(options()); // Existing scheduled draft participates in manual duplicate checks.
  await assert.rejects(run(options(manual)), /Duplicate/);
  assert.equal(await Model.countDocuments(), 1);
  assert.equal(await Lock.countDocuments(), 0);
  assert.deepEqual(calls, []);
});
test('Mongo connection reuse cannot silently select another configured database', async () => {
  assert.equal(await connectMongo({ mongoUri: mongo.getUri('post_generator_test') }), mongoose.connection);
  await assert.rejects(connectMongo({ mongoUri: mongo.getUri('another_database') }), /does not match/);
  assert.equal(mongoose.connection.name, 'post_generator_test');
});

test('recovery leaves an existing database connection intact on configuration mismatch or read success', async () => {
  const result = await run(options());
  await assert.rejects(recover({ key: result.key, env: { MONGO_URI: mongo.getUri('another_database') } }), /does not match/);
  assert.equal(mongoose.connection.readyState, 1);
  const inspected = await recover({ key: result.key, env: { MONGO_URI: mongo.getUri('post_generator_test') } });
  assert.equal(inspected.key, result.key);
  assert.equal(mongoose.connection.readyState, 1);
});
test('same slot is idempotent and dry-run content cannot later be published', async () => {
  const first = await run(options());
  await run(options({ generate: async () => { throw new Error('Must not regenerate'); } }));
  assert.equal(await Model.countDocuments(), 1);
  await assert.rejects(run(options({ dryRun: false })), /not eligible/);
  assert.equal((await store.get(first.key)).publications.linkedin.state, 'not_published');
});
test('legacy IDE-120 collection rows and indexes survive and cannot be published', async () => {
  await Model.collection.insertOne({ key: 'post-generator:2026-10-21:morning', topicHash: 'legacy',
    title: 'Old title', platforms: { linkedin: 'not_published', x: 'not_published' } });
  // A legacy two-platform slot row can never be resumed by the LinkedIn-only scheduler, let alone reach X.
  await assert.rejects(run(options()), /platform selection changed/);
  await assert.rejects(run(options({ dryRun: false })), /platform selection changed/);
  assert.deepEqual(calls, []);
  assert.equal((await store.get('post-generator:2026-10-21:morning')).platforms.x, 'not_published');
  const indexes = await Model.collection.indexes();
  assert(indexes.some(i => i.key.key === 1 && i.unique));
  assert(indexes.some(i => i.key.topicHash === 1 && i.unique));
});
test('failed generation, validation, review, persistence and configuration block publication', async () => {
  const patches = [
    { generate: async () => { throw new Error('research unavailable'); } },
    { generate: async () => ({ ...draft(), sources: [] }) },
    { review: async () => ({ approved: false }) },
    { env: { ...env, BUFFER_API_KEY: '' } }
  ];
  for (const patch of patches) await assert.rejects(run(options({ dryRun: false, ...patch })));
  const save = store.save;
  store.save = async () => { throw new Error('database unavailable'); };
  await assert.rejects(run(options({ dryRun: false })), /database/);
  store.save = save;
  assert.deepEqual(calls, []);
  assert.equal(await Model.countDocuments(), 0);
});
test('duplicate checking includes Mongo history and manual title log', async () => {
  await run(options());
  await assert.rejects(run(options({ now: new Date('2026-10-21T17:00:00Z') })), /Duplicate/);
  await Model.deleteMany({});
  await assert.rejects(run(options({ manualHistory: () => [{ title: draft().title }] })), /Duplicate/);
});
test('overlapping runs cannot both generate or publish', async () => {
  let unblock;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const first = run(options({ dryRun: false, generate: async () => {
    started(); await new Promise(resolve => { unblock = resolve; }); return linkedinDraft();
  } }));
  await ready;
  await assert.rejects(run(options({ store: new MongoStore(), dryRun: false })), /locked/);
  unblock();
  await first;
  assert.deepEqual(calls, ['linkedin']);
  await run(options({ dryRun: false }));
  assert.deepEqual(calls, ['linkedin']);
});
test('atomic channel claims allow only one worker and unique indexes reject duplicate saves', async () => {
  const result = await run(options());
  await Model.updateOne({ key: result.key }, { $set: { dryRun: false, 'publications.linkedin.state': 'pending' } });
  const claims = await Promise.all([store.claim(result.key, 'linkedin', env.BUFFER_LINKEDIN_CHANNEL_ID, now),
    store.claim(result.key, 'linkedin', env.BUFFER_LINKEDIN_CHANNEL_ID, now)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const value = await store.get(result.key);
  delete value._id;
  await assert.rejects(store.save(value), error => error.code === 11000);
});
test('partial failure preserves success and unknown outcomes are never blindly retried', async () => {
  const publish = buffer.publish;
  buffer.publish = async input => {
    if (input.platform === 'x') { calls.push('x'); throw new Error('transport failed after send'); }
    return publish(input);
  };
  // Two-platform partial failure exists only for manual runs.
  const manual = await run(options({ manual: true, dryRun: false }));
  assert.deepEqual(manual.channels, { linkedin: 'published', x: 'unknown' });
  const saved = await store.get(manual.key);
  assert.equal(saved.publications.linkedin.bufferId, 'buffer-linkedin');
  assert.equal(saved.publications.x.failureCode, 'BUFFER_OUTCOME_UNKNOWN');
  // A scheduled unknown LinkedIn outcome is not retried within the same slot.
  await Model.deleteMany({});
  calls.length = 0;
  buffer.publish = async input => { calls.push(input.platform); throw new Error('transport failed after send'); };
  const scheduled = await run(options({ dryRun: false }));
  assert.deepEqual(scheduled.channels, { linkedin: 'unknown' });
  await run(options({ dryRun: false }));
  assert.deepEqual(calls, ['linkedin']);
});
test('write failure after Buffer success leaves a durable claim requiring reconciliation', async () => {
  const record = store.record.bind(store);
  store.record = async () => { throw new Error('result persistence failed'); };
  await assert.rejects(run(options({ dryRun: false })), /persistence/);
  assert.deepEqual(calls, ['linkedin']);
  store.record = record;
  const result = await run(options({ dryRun: false }));
  assert.deepEqual(calls, ['linkedin']);
  assert.deepEqual(result.channels, { linkedin: 'unknown' });
});
test('429 retries honor Retry-After within the scheduled slot', async () => {
  const publish = buffer.publish;
  buffer.publish = async input => { calls.push(input.platform); throw new BufferFailure('BUFFER_RATE_LIMITED', 'rate_limited', 120); };
  await run(options({ dryRun: false }));
  await run(options({ dryRun: false, now: new Date(now.getTime() + 60000) }));
  assert.deepEqual(calls, ['linkedin']);
  buffer.publish = publish;
  const result = await run(options({ dryRun: false, now: new Date(now.getTime() + 121000) }));
  assert.deepEqual(result.channels, { linkedin: 'published' });
  assert.deepEqual(calls, ['linkedin', 'linkedin']);
});
test('reconciliation uses read-only Buffer evidence and never requeues uncertain content', async () => {
  buffer.publish = async () => { throw new Error('timeout'); };
  const result = await run(options({ dryRun: false }));
  const saved = await store.get(result.key);
  buffer.getPost = async id => ({ id, channelId: env.BUFFER_X_CHANNEL_ID, text: draft().xPost, status: 'sent' });
  await assert.rejects(reconcile({ store, buffer, draft: saved, platform: 'linkedin', bufferId: 'candidate' }), /mismatch/);
  await assert.rejects(reconcile({ store, buffer, draft: saved, platform: 'x', bufferId: 'candidate' }), /Invalid reconciliation/);
  assert.equal((await store.get(result.key)).publications.linkedin.state, 'unknown');
  buffer.getPost = async id => ({ id, channelId: env.BUFFER_LINKEDIN_CHANNEL_ID, text: draft().linkedinPost, status: 'sent' });
  const reconciled = await reconcile({ store, buffer, draft: saved, platform: 'linkedin', bufferId: 'candidate' });
  assert.equal(reconciled.publications.linkedin.state, 'published');
  assert.equal(reconciled.publications.linkedin.bufferId, 'candidate');
});
test('changed channel mapping or post content fails closed', async () => {
  const result = await run(options({ dryRun: false }));
  await assert.rejects(run(options({ dryRun: false, env: { ...env, BUFFER_LINKEDIN_CHANNEL_ID: 'different' } })), /mapping/);
  // Scheduled runs ignore X configuration entirely.
  assert.deepEqual((await run(options({ dryRun: false, env: { ...env, BUFFER_X_CHANNEL_ID: undefined } }))).channels,
    { linkedin: 'published' });
  await Model.updateOne({ key: result.key }, { $set: { linkedinPost: draft().linkedinPost + 'tampered' } });
  await assert.rejects(run(options({ dryRun: false })), /validation/);
  assert.deepEqual(calls, ['linkedin']);
});

test('independent review receives history and rejects a semantic duplicate before saving', async () => {
  const history = [{ title: 'Another title', topicAngle: 'A differently worded prior argument' }];
  await assert.rejects(run(options({ dryRun: false, manualHistory: () => history,
    review: async (value, context) => {
      assert.deepEqual(context.previous, history);
      assert.equal(context.date, '2026-10-21');
      return { ...await review(value), originalityPassed: false };
    } })), /review failed/);
  assert.equal(await Model.countDocuments(), 0);
  assert.deepEqual(calls, []);
  assert.equal(await Lock.countDocuments({ _id: 'generation-and-publishing' }), 0);
});

test('a first-channel 429 stops all Buffer calls until the durable global cooldown expires', async () => {
  let preflights = 0;
  buffer.verifyChannel = async () => { preflights++; };
  buffer.publish = async input => { calls.push(input.platform); throw new BufferFailure('BUFFER_RATE_LIMITED', 'rate_limited', 120); };
  const result = await run(options({ manual: true, dryRun: false }));
  assert.deepEqual(result.channels, { linkedin: 'rate_limited', x: 'pending' });
  assert.equal(result.requiresAttention, true);
  assert.equal(result.complete, false);
  await run(options({ manual: true, dryRun: false, store: new MongoStore(), generate: async () => alternativeDraft(),
    now: new Date(now.getTime() + 60000) }));
  assert.equal(preflights, 2);
  assert.deepEqual(calls, ['linkedin']);
  assert.equal((await store.bufferCooldown()).getTime(), now.getTime() + 120000);
});

test('preflight failures on both channels are persisted without attempting either publication', async () => {
  buffer.verifyChannel = async () => { throw new BufferFailure('BUFFER_CHANNEL_UNAVAILABLE', 'rejected'); };
  const result = await run(options({ manual: true, dryRun: false }));
  assert.deepEqual(result.channels, { linkedin: 'rejected', x: 'rejected' });
  const saved = await store.get(result.key);
  assert.equal(saved.publications.x.failureCode, 'BUFFER_CHANNEL_UNAVAILABLE');
  assert.equal(saved.publications.x.attempts, 0);
  assert.deepEqual(calls, []);
});

// Two-channel preflight interplay applies to manual runs only; scheduled runs never contact X.
for (const manual of [true]) {
  for (const scenario of [
    { name: 'LinkedIn succeeds with X Premium unverified', linkedinBlocked: false, subscriptionType: 'None' },
    { name: 'both channels fail their own checks', linkedinBlocked: true, subscriptionType: 'None' },
    { name: 'both channels are eligible', linkedinBlocked: false, subscriptionType: 'Basic' },
    { name: 'X succeeds with LinkedIn disconnected', linkedinBlocked: true, subscriptionType: 'Premium' }
  ]) test(`${scenario.name} (manual=${manual})`, async () => {
    const requests = [];
    const published = [];
    const channels = { linkedin: env.BUFFER_LINKEDIN_CHANNEL_ID, x: env.BUFFER_X_CHANNEL_ID };
    const client = new BufferClient({ apiKey: 'test-only-key', channels, publishEnabled: true, dryRun: false,
      fetchImpl: async (_url, request) => {
        const { query, variables } = JSON.parse(request.body);
        let data;
        if (query.startsWith('query')) {
          const platform = query.includes(channels.x) ? 'x' : 'linkedin';
          requests.push(platform);
          data = { channel: { id: channels[platform], service: platform === 'x' ? 'twitter' : 'linkedin',
            allowedActions: ['scheduleUpdates'], isDisconnected: platform === 'linkedin' && scenario.linkedinBlocked,
            isLocked: false, isQueuePaused: false, metadata: { subscriptionType: scenario.subscriptionType } } };
        } else {
          const platform = variables.input.channelId === channels.x ? 'x' : 'linkedin';
          assert.deepEqual(requests, ['linkedin', 'x'], 'All preflights finish before any send');
          const saved = await Model.findOne().lean();
          assert.equal(saved.publications[platform].state, 'publishing');
          assert.equal(saved.publications[platform].attempts, 1);
          published.push(platform);
          data = { createPost: { post: { id: `buffer-${platform}`, status: 'sent' } } };
        }
        return { ok: true, status: 200, json: async () => ({ data }) };
      } });
    const result = await run(options({ manual, dryRun: false, buffer: client }));
    const expected = { linkedin: scenario.linkedinBlocked ? 'rejected' : 'published',
      x: scenario.subscriptionType === 'None' ? 'rejected' : 'published' };
    assert.deepEqual(result.channels, expected);
    assert.deepEqual(published, Object.keys(expected).filter(p => expected[p] === 'published'));
    assert.equal(result.requiresAttention, Object.values(expected).includes('rejected'));
    const saved = await store.get(result.key);
    for (const platform of ['linkedin', 'x']) {
      const record = saved.publications[platform];
      assert.equal(record.state, expected[platform]);
      assert.equal(record.attempts, expected[platform] === 'published' ? 1 : 0);
      if (expected[platform] === 'published') assert.equal(record.bufferId, `buffer-${platform}`);
      else {
        assert.equal(record.bufferId, undefined);
        assert.equal(record.failureCode, platform === 'x' ? 'X_PREMIUM_UNVERIFIED' : 'BUFFER_CHANNEL_UNAVAILABLE');
      }
    }
    // Already rejected or successful records remain terminal; neither is replayed.
    const previousRequests = requests.length;
    const previousPublishes = published.length;
    if (manual) await assert.rejects(run(options({ manual, dryRun: false, buffer: client })), /Duplicate/);
    else assert.deepEqual((await run(options({ dryRun: false, buffer: client }))).channels, expected);
    assert.equal(requests.length, previousRequests);
    assert.equal(published.length, previousPublishes);
  });
}

for (const failedPlatform of ['linkedin', 'x']) {
  for (const status of [401, 403, 429, 503, 200]) {
    test(`shared preflight HTTP ${status} on ${failedPlatform} stops both sends`, async () => {
      const requests = [];
      const client = new BufferClient({ apiKey: 'test-only-key',
        channels: { linkedin: env.BUFFER_LINKEDIN_CHANNEL_ID, x: env.BUFFER_X_CHANNEL_ID },
        publishEnabled: true, dryRun: false, fetchImpl: async (_url, request) => {
          const { query } = JSON.parse(request.body);
          assert(query.startsWith('query'), 'A shared preflight error must prevent every mutation');
          const platform = query.includes(env.BUFFER_X_CHANNEL_ID) ? 'x' : 'linkedin';
          requests.push(platform);
          if (platform === failedPlatform) return { ok: status === 200, status,
            headers: new Headers({ 'Retry-After': '120' }), json: async () => ({ errors: [{ message: 'private details' }] }) };
          return { ok: true, status: 200, json: async () => ({ data: { channel: {
            id: env.BUFFER_LINKEDIN_CHANNEL_ID, service: 'linkedin', allowedActions: ['scheduleUpdates'],
            isDisconnected: false, isLocked: false, isQueuePaused: false
          } } }) };
        } });
      const result = await run(options({ manual: true, dryRun: false, buffer: client }));
      const state = status === 429 ? 'rate_limited' : 'rejected';
      assert.deepEqual(result.channels, { linkedin: state, x: state });
      assert.deepEqual(requests, failedPlatform === 'linkedin' ? ['linkedin'] : ['linkedin', 'x']);
      const saved = await store.get(result.key);
      for (const platform of ['linkedin', 'x']) {
        assert.equal(saved.publications[platform].attempts, 0);
        assert.equal(saved.publications[platform].failureCode, status === 429 ? 'BUFFER_RATE_LIMITED' :
          status === 200 ? 'BUFFER_GRAPHQL_UNKNOWN' : status === 503 ? 'BUFFER_HTTP_UNKNOWN' : 'BUFFER_REQUEST_REJECTED');
      }
      if (status === 429) {
        assert.equal((await store.bufferCooldown()).getTime(), now.getTime() + 120000);
        await run(options({ manual: true, dryRun: false, buffer: client, generate: async () => alternativeDraft() }));
        assert.equal(requests.length, failedPlatform === 'linkedin' ? 1 : 2);
      }
    });
  }
}

test('failure to save an X preflight rejection prevents the LinkedIn submission', async () => {
  buffer.verifyChannel = async platform => {
    if (platform === 'x') throw new BufferFailure('X_PREMIUM_UNVERIFIED', 'rejected');
  };
  store.record = async () => { throw new Error('database unavailable'); };
  await assert.rejects(run(options({ manual: true, dryRun: false })), /database unavailable/);
  assert.deepEqual(calls, []);
});

test('preflight rate limits persist cooldown and permit a later safe first attempt', async () => {
  buffer.verifyChannel = async () => { throw new BufferFailure('BUFFER_RATE_LIMITED', 'rate_limited', 120); };
  const result = await run(options({ dryRun: false }));
  assert.deepEqual(result.channels, { linkedin: 'rate_limited' });
  buffer.verifyChannel = async () => {};
  const retried = await run(options({ dryRun: false, now: new Date(now.getTime() + 121000) }));
  assert.equal(retried.complete, true);
  assert.deepEqual(calls, ['linkedin']);
});

test('rate-limit mutation retries are capped at three attempts', async () => {
  buffer.publish = async input => { calls.push(input.platform); throw new BufferFailure('BUFFER_RATE_LIMITED', 'rate_limited', 1); };
  for (let i = 0; i < 8; i++) await run(options({ dryRun: false, now: new Date(now.getTime() + i * 2000) }));
  assert.equal(calls.filter(p => p === 'linkedin').length, 3);
  assert.equal(calls.filter(p => p === 'x').length, 0);
});

test('accepted posts reconcile to delivery failure or success without another mutation', async () => {
  buffer.publish = async input => { calls.push(input.platform); return {
    state: 'accepted', bufferId: `buffer-${input.platform}`, bufferStatus: 'sending'
  }; };
  await run(options({ dryRun: false }));
  buffer.getPost = async id => ({ id, channelId: id.endsWith('linkedin') ? env.BUFFER_LINKEDIN_CHANNEL_ID : env.BUFFER_X_CHANNEL_ID,
    text: id.endsWith('linkedin') ? draft().linkedinPost : draft().xPost, status: id.endsWith('linkedin') ? 'sent' : 'error' });
  buffer.verifyChannel = async () => { throw new Error('Completed submissions do not need preflight'); };
  const delivered = await run(options({ dryRun: false }));
  assert.deepEqual(delivered.channels, { linkedin: 'published' });
  // A second slot's accepted post reconciles to a delivery failure without another mutation.
  buffer.getPost = async id => ({ id, channelId: env.BUFFER_LINKEDIN_CHANNEL_ID, text: withoutX(alternativeDraft()).linkedinPost, status: 'error' });
  const evening = new Date('2026-10-21T17:00:00Z');
  buffer.verifyChannel = async () => {};
  await run(options({ dryRun: false, now: evening, clock: () => evening, generate: async () => withoutX(alternativeDraft()) }));
  buffer.verifyChannel = async () => { throw new Error('Completed submissions do not need preflight'); };
  const result = await run(options({ dryRun: false, now: evening, clock: () => evening }));
  assert.deepEqual(result.channels, { linkedin: 'rejected' });
  assert.deepEqual(calls, ['linkedin', 'linkedin']);
  const saved = await store.get(result.key);
  assert.equal(saved.publications.linkedin.bufferId, 'buffer-linkedin');
  assert.equal(saved.publications.linkedin.failureCode, 'BUFFER_DELIVERY_BLOCKED');
});

test('an expired slot cannot send content even after successful generation', async () => {
  await assert.rejects(run(options({ dryRun: false, clock: () => new Date('2026-10-21T06:00:00Z') })), /Outside|expired/);
  assert.equal(await Model.countDocuments(), 1);
  assert.deepEqual(calls, []);
});

test('recovery inspects old slots without Buffer and reconciles using read-only evidence', async () => {
  buffer.publish = async () => { throw new Error('unknown'); };
  const result = await run(options({ dryRun: false }));
  const inspect = await recover({ key: result.key, env: { MONGO_URI: env.MONGO_URI }, store });
  assert.equal(inspect.publications.linkedin.failureCode, 'BUFFER_OUTCOME_UNKNOWN');
  assert.equal(inspect.publications.x, undefined);
  let requests = 0;
  const readOnly = new BufferClient({ apiKey: 'test-only-key', channels: { linkedin: env.BUFFER_LINKEDIN_CHANNEL_ID, x: env.BUFFER_X_CHANNEL_ID },
    fetchImpl: async (_url, request) => {
      requests++;
      assert(JSON.parse(request.body).query.startsWith('query'));
      return { ok: true, status: 200, json: async () => ({ data: { post: {
        id: 'existing-post', channelId: env.BUFFER_LINKEDIN_CHANNEL_ID, text: draft().linkedinPost, status: 'sent'
      } } }) };
    } });
  await assert.rejects(recover({ key: result.key, platform: 'x', bufferId: 'existing-post', env, store, buffer: readOnly }), /Invalid reconciliation/);
  const value = await recover({ key: result.key, platform: 'linkedin', bufferId: 'existing-post', env, store, buffer: readOnly,
    now: new Date('2026-10-22T12:00:00Z') });
  assert.deepEqual(value.channels, { linkedin: 'published' });
  assert.equal(requests, 1);
  assert.equal(readOnly.canPublish, false);
  await assert.rejects(recover({ key: result.key, platform: 'facebook', bufferId: 'id', env, store }), /platform/);
  assert.equal(await Lock.countDocuments({ _id: 'generation-and-publishing' }), 0);
});

test('reconciliation fails closed for changed validation or conflicting stored Buffer IDs', async () => {
  buffer.publish = async () => ({ state: 'accepted', bufferId: 'known-id', bufferStatus: 'sending' });
  const result = await run(options({ dryRun: false }));
  const saved = await store.get(result.key);
  await assert.rejects(reconcile({ store, buffer, draft: saved, platform: 'linkedin', bufferId: 'different-id' }), /receipt/);
  await assert.rejects(reconcile({ store, buffer, draft: { ...saved, linkedinPost: 'changed' }, platform: 'linkedin', bufferId: 'known-id' }), /validation/);
});

for (const manual of [false, true]) test(`real Buffer adapter and Mongo orchestrator integrate with mocked HTTP (manual=${manual})`, async () => {
  let mutations = 0;
  const queried = [];
  const client = new BufferClient({ apiKey: 'test-only-key', channels: { linkedin: env.BUFFER_LINKEDIN_CHANNEL_ID, x: env.BUFFER_X_CHANNEL_ID },
    publishEnabled: true, dryRun: false, fetchImpl: async (_url, request) => {
      const { query, variables } = JSON.parse(request.body);
      let data;
      if (query.startsWith('mutation')) {
        mutations++;
        const saved = await Model.findOne().lean();
        const platform = variables.input.channelId === env.BUFFER_X_CHANNEL_ID ? 'x' : 'linkedin';
        assert.equal(saved.publications[platform].state, 'publishing');
        assert.equal(variables.input.text, platform === 'x' ? saved.xPost : saved.linkedinPost);
        data = { createPost: { post: { id: `buffer-${platform}`, status: 'sending' } } };
      } else if (query.includes('channel(input')) {
        const x = query.includes(env.BUFFER_X_CHANNEL_ID);
        queried.push(x ? 'x' : 'linkedin');
        data = { channel: { id: x ? env.BUFFER_X_CHANNEL_ID : env.BUFFER_LINKEDIN_CHANNEL_ID,
          service: x ? 'twitter' : 'linkedin', allowedActions: ['scheduleUpdates'],
          isDisconnected: false, isLocked: false, isQueuePaused: false, metadata: { subscriptionType: 'Premium' } } };
      } else {
        const x = query.includes('buffer-x');
        data = { post: { id: x ? 'buffer-x' : 'buffer-linkedin', status: 'sent',
          channelId: x ? env.BUFFER_X_CHANNEL_ID : env.BUFFER_LINKEDIN_CHANNEL_ID, text: x ? draft().xPost : draft().linkedinPost } };
      }
      return { ok: true, status: 200, json: async () => ({ data }) };
    } });
  const submitted = await run(options({ manual, dryRun: false, buffer: client,
    now: manual ? new Date('2026-10-21T12:35:00Z') : now }));
  const platforms = manual ? ['linkedin', 'x'] : ['linkedin'];
  assert.deepEqual(submitted.channels, Object.fromEntries(platforms.map(p => [p, 'accepted'])));
  assert.deepEqual(queried, platforms);
  let delivered;
  if (manual) {
    for (const platform of ['linkedin', 'x']) {
      delivered = await recover({ key: submitted.key, platform, bufferId: `buffer-${platform}`, env, store, buffer: client });
    }
  } else {
    delivered = await run(options({ dryRun: false, buffer: client }));
  }
  assert.equal(delivered.complete, true);
  assert.equal(mutations, platforms.length);
});

test('Codex generation and independent review adapters feed an end-to-end non-publishing Mongo run', async () => {
  let executions = 0;
  const scratch = [];
  const execute = (_command, args, config) => {
    executions++;
    scratch.push(config.cwd);
    assert.equal(config.env.BUFFER_API_KEY, undefined);
    assert.equal(config.env.MONGO_URI, undefined);
    const schema = JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8'));
    const isReview = Boolean(schema.properties.originalityPassed);
    assert(config.input.includes(isReview ? 'Independently audit' : 'Research 4–5 current candidate topics'));
    const value = isReview ? { approved: true, qualityPassed: true, originalityPassed: true,
      unsupportedClaims: [], sourceChecks: draft().sources.map(s => ({ url: s.url, supported: true })) } : draft();
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify(value));
    return { status: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'web_search' } }) };
  };
  buffer.verifyChannel = async () => { throw new Error('No Buffer requests permitted'); };
  const result = await run(options({ manual: true, now: new Date('2026-10-21T12:00:00Z'),
    generate: input => generateWithCodex(input, { execute, env }),
    review: (value, context) => reviewWithCodex(value, { ...context, execute, env }) }));
  assert.equal(executions, 2);
  assert.equal(result.published, false);
  assert.equal((await store.get(result.key)).validation.originalityPassed, true);
  assert(scratch.every(dir => !fs.existsSync(dir)));
});

test('reconciliation read errors preserve receipts and enforce cooldown', async () => {
  buffer.publish = async () => ({ state: 'accepted', bufferId: 'accepted-id', bufferStatus: 'sending' });
  const result = await run(options({ dryRun: false }));
  const saved = await store.get(result.key);
  buffer.getPost = async () => { throw new BufferFailure('BUFFER_RATE_LIMITED', 'rate_limited', 120); };
  await assert.rejects(reconcile({ store, buffer, draft: saved, platform: 'linkedin', bufferId: 'accepted-id', now }), /RATE_LIMITED/);
  assert.equal((await store.get(result.key)).publications.linkedin.state, 'accepted');
  await assert.rejects(reconcile({ store, buffer, draft: saved, platform: 'linkedin', bufferId: 'accepted-id', now }), /cooldown/);
});

test('persisted uncertain outcomes retain known Buffer IDs for operator reconciliation', async () => {
  buffer.publish = async () => { throw new BufferFailure('BUFFER_GRAPHQL_UNKNOWN', 'unknown', null, 'candidate-id'); };
  const result = await run(options({ dryRun: false }));
  const saved = await store.get(result.key);
  assert.equal(saved.publications.linkedin.state, 'unknown');
  assert.equal(saved.publications.linkedin.bufferId, 'candidate-id');
  assert.equal(saved.publications.linkedin.failureCode, 'BUFFER_GRAPHQL_UNKNOWN');
});
