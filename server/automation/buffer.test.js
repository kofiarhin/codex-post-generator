'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BufferClient, CREATE_POST, ENDPOINT } = require('./buffer');
const channels = { linkedin: 'test-linkedin', x: 'test-x' };
const response = (data, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status,
  headers: new Headers(headers), json: async () => data });
const client = fetchImpl => new BufferClient({ apiKey: 'test-only-key', channels, publishEnabled: true, dryRun: false, fetchImpl });
const publish = c => c.publish({ platform: 'linkedin', channelId: channels.linkedin, text: 'A test post' });

test('direct Buffer GraphQL request follows the verified text-only shareNow contract', async () => {
  const c = client(async (url, options) => {
    assert.equal(url, ENDPOINT);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    assert.deepEqual(JSON.parse(options.body), { query: CREATE_POST, variables: { input: {
      channelId: channels.linkedin, text: 'A test post', schedulingType: 'automatic', mode: 'shareNow',
      assets: [], needsApproval: false, saveToDraft: false, aiAssisted: true
    } } });
    assert(!Object.keys(options.headers).some(k => /idempotency/i.test(k)));
    return response({ data: { createPost: { post: { id: 'post-1', status: 'sending' } } } });
  });
  assert.deepEqual(await publish(c), { state: 'accepted', bufferId: 'post-1', bufferStatus: 'sending', failureCode: '' });
});
test('disabled and dry-run Buffer clients never make a mutation', async () => {
  let calls = 0;
  for (const config of [{}, { publishEnabled: true }, { dryRun: false }]) {
    const c = new BufferClient({ apiKey: 'test', channels, ...config, fetchImpl: async () => { calls++; } });
    await assert.rejects(publish(c), /PUBLISHING_DISABLED/);
  }
  assert.equal(calls, 0);
});
test('channel allowlist and missing credentials fail before requests', async () => {
  let calls = 0;
  const c = client(async () => { calls++; });
  await assert.rejects(c.publish({ platform: 'x', channelId: channels.linkedin, text: 'test' }), /ALLOWLISTED/);
  await assert.rejects(c.publish({ platform: 'facebook', channelId: channels.linkedin, text: 'test' }), /ALLOWLISTED/);
  await assert.rejects(c.verifyChannel('facebook'), /ALLOWLISTED/);
  c.apiKey = '';
  await assert.rejects(publish(c), /CREDENTIALS_MISSING/);
  await assert.rejects(c.verifyChannel('linkedin'), /CREDENTIALS_MISSING/);
  assert.equal(calls, 0);
});
test('channel preflight validates platform, permissions, connection, pause and Premium capability', async () => {
  for (const bad of [null, { service: 'facebook' }, { allowedActions: [] }, { isDisconnected: true },
    { isLocked: true }, { isQueuePaused: true }, { metadata: { subscriptionType: 'Free' } },
    { metadata: { subscriptionType: 'None' } }, { metadata: null }]) {
    const c = client(async (_url, options) => {
      const x = JSON.parse(options.body).query.includes('test-x');
      const channel = { id: x ? channels.x : channels.linkedin, service: x ? 'twitter' : 'linkedin',
        allowedActions: ['scheduleUpdates'], isDisconnected: false, isLocked: false, isQueuePaused: false,
        metadata: { subscriptionType: 'Premium' } };
      return response({ data: { channel: x && bad ? { ...channel, ...bad } : channel } });
    });
    await c.verifyChannel('linkedin');
    if (bad) await assert.rejects(c.verifyChannel('x'), /UNAVAILABLE|PREMIUM/);
    else await c.verifyChannel('x');
  }
});
test('429 preserves retry-after; timeouts, malformed and partial responses are uncertain', async () => {
  const cases = [
    [async () => response({}, 429, { 'Retry-After': '120' }), 'rate_limited', 'BUFFER_RATE_LIMITED'],
    [async () => response({}, 401), 'rejected', 'BUFFER_REQUEST_REJECTED'],
    [async () => response({}, 503), 'unknown', 'BUFFER_HTTP_UNKNOWN'],
    [async () => { throw new Error('secret transport detail'); }, 'unknown', 'BUFFER_TRANSPORT_UNKNOWN'],
    [async () => response({ errors: [{ message: 'secret' }], data: { createPost: { post: { id: 'p' } } } }), 'unknown', 'BUFFER_GRAPHQL_UNKNOWN'],
    [async () => response({ data: {} }), 'unknown', 'BUFFER_RESPONSE_UNKNOWN'],
    [async () => response({ data: { createPost: { message: 'secret server detail' } } }), 'rejected', 'BUFFER_MUTATION_REJECTED'],
    [async () => ({ ok: true, status: 200, json: async () => { throw new Error('secret JSON'); } }), 'unknown', 'BUFFER_RESPONSE_UNKNOWN']
  ];
  for (const [fetch, state, code] of cases) {
    await assert.rejects(publish(client(fetch)), error => {
      assert.equal(error.state, state);
      assert.equal(error.message, code);
      assert(!JSON.stringify(error).includes('secret'));
      if (state === 'rate_limited') assert.equal(error.retryAfter, 120);
      return true;
    });
  }
});
test('delivery sent and delivery error have distinct states with Buffer IDs retained', async () => {
  for (const [status, state] of [['sent', 'published'], ['error', 'rejected'], ['needs_approval', 'rejected']]) {
    const c = client(async () => response({ data: { createPost: { post: { id: 'post-1', status } } } }));
    const result = await publish(c);
    assert.equal(result.state, state);
    assert.equal(result.bufferId, 'post-1');
  }
});

test('partial GraphQL results and unfamiliar delivery status retain a safe Buffer ID without assuming success', async () => {
  for (const body of [
    { errors: [{ message: 'private provider detail' }], data: { createPost: { post: { id: 'known-post', status: 'sent' } } } },
    { data: { createPost: { post: { id: 'known-post', status: 'new-status' } } } }
  ]) {
    await assert.rejects(publish(client(async () => response(body))), error => {
      assert.equal(error.state, 'unknown');
      assert.equal(error.bufferId, 'known-post');
      assert(!JSON.stringify(error).includes('private'));
      return true;
    });
  }
});

test('LinkedIn URLs use the same 24-unit accounting during validation and submission', async () => {
  const text = 'a'.repeat(2960) + ' https://mongodb.com/' + 'b'.repeat(150);
  const c = client(async () => response({ data: { createPost: { post: { id: 'url-post', status: 'sent' } } } }));
  assert.equal((await c.publish({ platform: 'linkedin', channelId: channels.linkedin, text })).state, 'published');
  await assert.rejects(c.publish({ platform: 'linkedin', channelId: channels.linkedin, text: 'a'.repeat(3001) }), /TEXT_INVALID/);
});

test('missing or invalid Retry-After headers use a conservative cooldown', async () => {
  for (const header of ['', 'not-a-date', '-10', '0']) {
    await assert.rejects(publish(client(async () => response({}, 429, { 'Retry-After': header }))), error => {
      assert.equal(error.retryAfter, 30 * 86400);
      return true;
    });
  }
});
