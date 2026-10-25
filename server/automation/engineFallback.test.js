'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectMongo, disconnectMongo } = require('../config/db');
const Model = require('../models/AutomatedBlogPost');
const LegacyModel = require('../models/AutomatedPostDraft');
const { MongoStore, Lock } = require('./store');
const { run } = require('./run');
const { readConfig } = require('./config');
const { BufferClient } = require('./buffer');
const { invokeCodex, CodexRateLimited } = require('./codex');
const { invokeClaude, claudeEnvironment } = require('./claude');
const { createEngineSession } = require('./engines');
const { draft, env, now } = require('./testing/fixtures');
const linkedinDraft = () => {
  const { xPost, ...value } = draft();
  return value;
};
const approve = value => ({ approved: true, qualityPassed: true, originalityPassed: true, unsupportedClaims: [],
  sourceChecks: value.sources.map(s => ({ url: s.url, supported: true })) });
const childEnv = { ...env, PATH: '/bin', HOME: '/home/test', ANTHROPIC_API_KEY: 'private' };
const usageLimit = { status: 1, stdout: JSON.stringify({ type: 'turn.failed', error: { message: "You've reached your usage limit." } }),
  stderr: 'private detail' };
let mongo;
let store;

// Mocked CLIs. Each records the prompt/schema it received and answers like the real CLI contract.
function codexCli(calls, outcome = 'success') {
  return (command, args, config) => {
    assert.equal(command, 'codex');
    const schema = JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8'));
    calls.push({ engine: 'codex', prompt: config.input, schema });
    if (outcome === 'rate_limited') return usageLimit;
    if (outcome === 'failed') return { status: 1, stdout: '', stderr: 'network down' };
    const isReview = Boolean(schema.properties.originalityPassed);
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1],
      JSON.stringify(isReview ? approve(linkedinDraft()) : linkedinDraft()));
    return { status: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'web_search' } }) };
  };
}
function claudeCli(calls, outcome = 'success') {
  return (command, args, config) => {
    assert.equal(command, 'claude');
    assert.equal(config.env.MONGO_URI, undefined);
    assert.equal(config.env.BUFFER_API_KEY, undefined);
    const schema = JSON.parse(args[args.indexOf('--json-schema') + 1]);
    calls.push({ engine: 'claude', prompt: config.input, schema });
    if (outcome === 'failed') return { status: 1, stdout: '', stderr: 'Claude usage limit reached' };
    const isReview = Boolean(schema.properties.originalityPassed);
    return { status: 0, stdout: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'StructuredOutput' }] } },
      { type: 'result', subtype: 'success', is_error: false,
        structured_output: isReview ? approve(linkedinDraft()) : linkedinDraft() }
    ].map(e => JSON.stringify(e)).join('\n') };
  };
}
const session = (calls, codex, claude) => createEngineSession({
  codexOptions: { execute: codexCli(calls, codex), env: childEnv },
  claudeOptions: { execute: claudeCli(calls, claude), env: childEnv } });
const noBuffer = () => new Proxy({}, { get() { assert.fail('No Buffer access'); } });
const options = patch => ({ now, clock: () => now, manual: true, platform: 'linkedin', dryRun: true,
  env: { ...env, BUFFER_X_CHANNEL_ID: undefined }, store, manualHistory: () => [], buffer: noBuffer(), ...patch });

before(async () => {
  // Disposable local MongoDB only; Codex, Claude and Buffer are mocked.
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await connectMongo({ mongoUri: mongo.getUri('engine_fallback_tests') });
});
after(async () => { await disconnectMongo(); if (mongo) await mongo.stop(); });
beforeEach(async () => {
  await Model.deleteMany({});
  await LegacyModel.deleteMany({});
  await Lock.deleteMany({});
  store = new MongoStore();
});

test('Codex success: Codex generates and reviews, Claude is never invoked, engine is recorded', async () => {
  const calls = [];
  const result = await run(options({ engines: session(calls, 'success') }));
  assert.deepEqual(calls.map(c => c.engine), ['codex', 'codex']);
  const saved = await store.get(result.key);
  assert.deepEqual(saved.generation, { engine: 'codex', reviewEngine: 'codex', codexRateLimited: false });
  assert.deepEqual(result.channels, { linkedin: 'not_published' });
});

test('Codex rate limit switches to Claude with identical prompts and schemas; LinkedIn only, zero X requests', async () => {
  const calls = [];
  const requests = [];
  const buffer = new BufferClient({ ...readConfig(env, { dryRun: false, platform: 'linkedin' }),
    fetchImpl: async (_url, request) => {
      const { query, variables } = JSON.parse(request.body);
      const isX = query.includes(env.BUFFER_X_CHANNEL_ID) || variables.input?.channelId === env.BUFFER_X_CHANNEL_ID;
      requests.push({ platform: isX ? 'x' : 'linkedin', mutation: query.startsWith('mutation') });
      if (query.startsWith('query')) return { ok: true, status: 200, json: async () => ({ data: { channel: {
        id: env.BUFFER_LINKEDIN_CHANNEL_ID, service: 'linkedin', allowedActions: ['scheduleUpdates'],
        isDisconnected: false, isLocked: false, isQueuePaused: false, metadata: { subscriptionType: 'None' } } } }) };
      return { ok: true, status: 200, json: async () => ({ data: { createPost: { post: { id: 'li-1', status: 'sent' } } } }) };
    } });
  const result = await run(options({ dryRun: false, env, buffer, engines: session(calls, 'rate_limited') }));
  // Codex tried once for generation, then Claude handles the rest of this post.
  assert.deepEqual(calls.map(c => c.engine), ['codex', 'claude', 'claude']);
  assert.equal(calls[1].prompt, calls[0].prompt);
  assert.match(calls[1].prompt, /Every sources entry must use a different URL/);
  assert.deepEqual(calls[1].schema, calls[0].schema);
  assert.equal(calls[1].schema.properties.xPost, undefined);
  const saved = await store.get(result.key);
  assert.deepEqual(saved.generation, { engine: 'claude', reviewEngine: 'claude', codexRateLimited: true });
  assert.deepEqual(result.channels, { linkedin: 'published' });
  assert.equal(Object.hasOwn(saved, 'xPost'), false);
  assert.equal(Object.hasOwn(saved.publications, 'x'), false);
  assert.deepEqual(requests, [{ platform: 'linkedin', mutation: false }, { platform: 'linkedin', mutation: true }]);
  assert.equal(requests.filter(r => r.platform === 'x').length, 0);
});

test('the next post tries Codex first again after a fallback', () => {
  const calls = [];
  const first = session(calls, 'rate_limited');
  first.invoke('generation', 'prompt', { type: 'object', properties: {} });
  assert.deepEqual(first.record(), { engine: 'claude', reviewEngine: undefined, codexRateLimited: true });
  const second = session(calls, 'success');
  second.invoke('generation', 'prompt', { type: 'object', properties: {} });
  assert.deepEqual(calls.map(c => c.engine), ['codex', 'claude', 'codex']);
  assert.deepEqual(second.record(), { engine: 'codex', reviewEngine: undefined, codexRateLimited: false });
  // run() builds a fresh session for every invocation when none is injected.
  assert.match(String(run), /engines = createEngineSession\(\)/);
});

test('both engines failing stops safely: nothing saved, lock released, no Buffer access', async () => {
  const calls = [];
  await assert.rejects(run(options({ dryRun: false, env, engines: session(calls, 'rate_limited', 'failed') })),
    /^Error: Codex is rate limited and the Claude fallback failed; nothing was saved or published$/);
  assert.deepEqual(calls.map(c => c.engine), ['codex', 'claude']);
  assert.equal(await Model.countDocuments(), 0);
  assert.equal(await Lock.countDocuments({ _id: 'generation-and-publishing' }), 0);
});

test('a non-rate-limit Codex failure does not fall back to Claude', async () => {
  const calls = [];
  await assert.rejects(run(options({ engines: session(calls, 'failed') })), /^Error: Codex research or structured output failed$/);
  assert.deepEqual(calls.map(c => c.engine), ['codex']);
  assert.equal(await Model.countDocuments(), 0);
});

test('Claude fallback drafts still face duplicate prevention against shared history', async () => {
  const calls = [];
  await run(options({ engines: session(calls, 'success') }));
  // Same topic produced by the fallback engine on the next post is rejected before saving.
  await assert.rejects(run(options({ engines: session(calls, 'rate_limited') })), /Duplicate/);
  assert.equal(await Model.countDocuments(), 1);
  const manual = { title: linkedinDraft().title, topicAngle: 'legacy entry' };
  await Model.deleteMany({});
  await assert.rejects(run(options({ engines: session([], 'rate_limited'), manualHistory: () => [manual] })), /Duplicate/);
  assert.equal(await Model.countDocuments(), 0);
});

test('Codex rate-limit detection uses failure events and stderr only, without leaking CLI output', () => {
  const ok = { status: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'web_search' } }) };
  const execWith = result => (_c, args) => {
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], '{"ok":true}');
    return result;
  };
  for (const result of [usageLimit,
    { status: 1, stdout: '', stderr: 'ERROR: 429 Too Many Requests' },
    { status: 1, stdout: JSON.stringify({ type: 'error', message: 'rate limit exceeded' }) },
    { status: 0, stdout: [ok.stdout, JSON.stringify({ type: 'turn.failed', error: { message: 'usage_limit_reached' } })].join('\n') }]) {
    assert.throws(() => invokeCodex('p', {}, { execute: execWith(result) }), error =>
      error instanceof CodexRateLimited && !error.message.includes('private'));
  }
  // A transient reconnect error followed by a successful turn is not a rate limit.
  assert.deepEqual(invokeCodex('p', {}, { execute: execWith({ status: 0,
    stdout: [JSON.stringify({ type: 'error', message: 'Reconnecting... 429' }), ok.stdout].join('\n') }) }), { ok: true });
  // Generated content mentioning limits never triggers a switch.
  assert.throws(() => invokeCodex('p', {}, { execute: () => ({ status: 1,
    stdout: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'rate limit' } }) }) }),
  error => !(error instanceof CodexRateLimited));
});

test('Claude adapter is restricted to web research, gets no app secrets and fails closed', () => {
  assert.deepEqual(claudeEnvironment(childEnv), { PATH: '/bin', HOME: '/home/test' });
  let directory;
  const calls = [];
  const execute = claudeCli(calls);
  const value = invokeClaude('prompt', { type: 'object', properties: {} }, { env: childEnv, execute(command, args, config) {
    directory = config.cwd;
    for (const flag of ['-p', '--restricted', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) {
      assert(args.includes(flag), flag);
    }
    assert.equal(args[args.indexOf('--tools') + 1], 'WebSearch,WebFetch');
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.equal(config.env.ANTHROPIC_API_KEY, undefined);
    return execute(command, args, config);
  } });
  assert.deepEqual(value, linkedinDraft());
  assert.equal(fs.existsSync(directory), false);
  const events = (...list) => ({ status: 0, stdout: list.map(e => JSON.stringify(e)).join('\n') });
  const search = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch' }] } };
  const done = { type: 'result', subtype: 'success', is_error: false, structured_output: { ok: true } };
  const fetchOnly = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebFetch' }] } };
  assert.deepEqual(invokeClaude('p', {}, { execute: () => events(fetchOnly, done) }), { ok: true });
  for (const result of [{ status: 1, stderr: 'secret' }, { status: null, error: new Error('timeout') },
    events(done), // no web research
    events(search, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }, done),
    events(search, { ...done, is_error: true }), events(search, { ...done, structured_output: undefined }),
    { status: 0, stdout: 'not json' }]) {
    assert.throws(() => invokeClaude('p', {}, { execute: () => result }), /^Error: Claude research or structured output failed$/);
  }
});
