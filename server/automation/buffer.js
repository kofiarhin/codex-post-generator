'use strict';

const { linkedInLength, validateLinkedInFormatting } = require('./validate');
const { platformsFor } = require('./platforms');

const ENDPOINT = 'https://api.buffer.com';
const CREATE_POST = `mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status } }
    ... on MutationError { message }
  }
}`;

class BufferFailure extends Error {
  constructor(code, state = 'unknown', retryAfter = null, bufferId) {
    super(code);
    this.code = code;
    this.state = state;
    this.retryAfter = retryAfter;
    if (typeof bufferId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(bufferId)) this.bufferId = bufferId;
  }
}

class BufferClient {
  constructor({ apiKey, channels, platform, publishEnabled = false, dryRun = true, fetchImpl = globalThis.fetch }) {
    this.apiKey = apiKey;
    this.channels = { ...channels };
    this.platforms = platformsFor(platform);
    this.canPublish = publishEnabled === true && dryRun === false;
    this.fetch = fetchImpl;
  }
  assertChannel(platform, channelId) {
    if (!this.platforms.includes(platform) || !channelId || channelId !== this.channels[platform] ||
      this.channels.linkedin === this.channels.x) throw new BufferFailure('CHANNEL_NOT_ALLOWLISTED', 'rejected');
  }
  async request(query, variables = {}) {
    if (!this.apiKey) throw new BufferFailure('BUFFER_CREDENTIALS_MISSING', 'rejected');
    let response;
    try {
      response = await this.fetch(ENDPOINT, { method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000) });
    } catch { throw new BufferFailure('BUFFER_TRANSPORT_UNKNOWN'); }
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const seconds = /^\d+$/.test(header || '') ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
      // Default to the longest documented quota window if Retry-After is absent/unusable.
      throw new BufferFailure('BUFFER_RATE_LIMITED', 'rate_limited', Number.isFinite(seconds) && seconds > 0 ? seconds : 30 * 86400);
    }
    if ([400, 401, 403, 422].includes(response.status)) throw new BufferFailure('BUFFER_REQUEST_REJECTED', 'rejected');
    if (!response.ok) throw new BufferFailure('BUFFER_HTTP_UNKNOWN');
    let body;
    try { body = await response.json(); } catch { throw new BufferFailure('BUFFER_RESPONSE_UNKNOWN'); }
    // GraphQL can include both data and errors. Never assume a mutation did not run.
    if (!body || body.errors?.length || !body.data) {
      throw new BufferFailure('BUFFER_GRAPHQL_UNKNOWN', 'unknown', null, body?.data?.createPost?.post?.id);
    }
    return body.data;
  }
  async verifyChannel(platform) {
    const id = this.channels[platform];
    this.assertChannel(platform, id);
    const data = await this.request(`query { channel(input: { id: ${JSON.stringify(id)} }) {
      id service allowedActions isDisconnected isLocked isQueuePaused
      metadata { ... on TwitterMetadata { subscriptionType } }
    } }`);
    const channel = data.channel;
    if (!channel || channel.id !== id || channel.service !== (platform === 'x' ? 'twitter' : 'linkedin') ||
      channel.isDisconnected !== false || channel.isLocked !== false || channel.isQueuePaused !== false ||
      !channel.allowedActions?.includes('scheduleUpdates')) throw new BufferFailure('BUFFER_CHANNEL_UNAVAILABLE', 'rejected');
    // Buffer exposes a string rather than an enum; fail closed on unfamiliar values.
    if (platform === 'x' && !['Basic', 'Premium', 'PremiumPlus', 'Premium+', 'basic', 'premium', 'premiumPlus', 'premium_plus', 'premium+']
      .includes(channel.metadata?.subscriptionType)) throw new BufferFailure('X_PREMIUM_UNVERIFIED', 'rejected');
  }
  async publish({ platform, channelId, text }) {
    if (!this.canPublish) throw new BufferFailure('PUBLISHING_DISABLED', 'rejected');
    this.assertChannel(platform, channelId);
    if (typeof text !== 'string' || !text.trim() ||
      (platform === 'x' ? text.length > 1500 : linkedInLength(text) > 3000)) {
      throw new BufferFailure('BUFFER_TEXT_INVALID', 'rejected');
    }
    if (platform === 'linkedin') {
      try { validateLinkedInFormatting(text); }
      catch { throw new BufferFailure('BUFFER_TEXT_INVALID', 'rejected'); }
    }
    const data = await this.request(CREATE_POST, { input: {
      channelId, text, schedulingType: 'automatic', mode: 'shareNow',
      assets: [], needsApproval: false, saveToDraft: false, aiAssisted: true
    } });
    const result = data.createPost;
    if (result?.post?.id) return publicationResult(result.post);
    if (typeof result?.message === 'string') throw new BufferFailure('BUFFER_MUTATION_REJECTED', 'rejected');
    throw new BufferFailure('BUFFER_RESPONSE_UNKNOWN');
  }
  async getPost(id) {
    if (typeof id !== 'string' || !id) throw new BufferFailure('BUFFER_ID_REQUIRED', 'rejected');
    const data = await this.request(`query { post(input: { id: ${JSON.stringify(id)} }) { id text channelId status } }`);
    return data.post;
  }
}
function publicationResult(post) {
  if (typeof post.id !== 'string' || !post.id || !['sent', 'scheduled', 'sending', 'error', 'draft', 'needs_approval'].includes(post.status)) {
    throw new BufferFailure('BUFFER_RESPONSE_UNKNOWN', 'unknown', null, post?.id);
  }
  return { state: post.status === 'sent' ? 'published' : ['scheduled', 'sending'].includes(post.status) ? 'accepted' : 'rejected',
    bufferId: post.id, bufferStatus: post.status,
    failureCode: ['error', 'draft', 'needs_approval'].includes(post.status) ? 'BUFFER_DELIVERY_BLOCKED' : '' };
}
module.exports = { BufferClient, BufferFailure, publicationResult, CREATE_POST, ENDPOINT };
