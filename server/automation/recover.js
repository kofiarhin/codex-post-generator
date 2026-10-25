'use strict';

// Deliberately contains no createPost, retry, reset or unlock operation.
const { resolve } = require('node:path');
const { readConfig } = require('./config');
const { connectMongo, disconnectMongo, getMongoStatus } = require('../config/db');
const { MongoStore } = require('./store');
const { BufferClient } = require('./buffer');
const { reconcile, summarize } = require('./run');
const { platformsFor } = require('./platforms');

async function recover({ key, platform, bufferId, env = process.env, store, buffer, now = new Date() } = {}) {
  const manual = typeof key === 'string' && /^post-generator:manual:\d{4}-\d{2}-\d{2}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key);
  if (typeof key !== 'string' || (!manual && !/^post-generator:\d{4}-\d{2}-\d{2}:(morning|evening)$/.test(key))) {
    throw new Error('A valid run key is required');
  }
  const inspectOnly = platform === undefined && bufferId === undefined;
  if (!inspectOnly && (!['linkedin', 'x'].includes(platform) || typeof bufferId !== 'string' || !bufferId.trim())) {
    throw new Error('Reconciliation requires a platform and Buffer post ID');
  }
  const config = readConfig(env, { platform: platform === 'linkedin' ? 'linkedin' : undefined }); // Always non-publishing.
  if (!inspectOnly && (!config.apiKey?.trim() || !config.channels[platform])) {
    throw new Error('Buffer credentials and channel IDs are required for reconciliation');
  }
  const needsStore = !store;
  let ownsConnection = false;
  let locked = false;
  try {
    if (needsStore) {
      const wasDisconnected = getMongoStatus().readyState === 0;
      await connectMongo({ mongoUri: config.mongoUri });
      ownsConnection = wasDisconnected;
      store = new MongoStore();
    }
    if (!inspectOnly) { await store.acquire(); locked = true; }
    let draft = await store.get(key);
    if (!draft) throw new Error('Run not found');
    if (!inspectOnly) {
      if (draft.dryRun !== false) throw new Error('Dry-runs can only be inspected');
      draft = await reconcile({ store, buffer: buffer || new BufferClient(config), draft, platform, bufferId, now });
    }
    const publications = Object.fromEntries(platformsFor(draft.platform).map(name => {
      const record = draft.publications?.[name] || {};
      return [name, Object.fromEntries(['state', 'attempts', 'bufferId', 'bufferStatus', 'failureCode',
        'attemptedAt', 'completedAt', 'nextAttemptAt', 'reconciledAt'].filter(field => record[field] !== undefined)
        .map(field => [field, record[field]]))];
    }));
    return { ...summarize(draft, draft.dryRun !== false), publications, retryAt: await store.bufferCooldown() };
  } finally {
    try { if (locked) await store.release(); }
    finally { if (ownsConnection) await disconnectMongo(); }
  }
}

if (require.main === module) {
  require('dotenv').config({ path: resolve(__dirname, '../../.env') });
  const [key, platform, bufferId, ...extra] = process.argv.slice(2);
  if (extra.length) {
    console.error('Use <run-key> [linkedin|x <buffer-post-id>]');
    process.exitCode = 1;
  } else {
    recover({ key, platform, bufferId }).then(result => console.log(JSON.stringify(result))).catch(() => {
      console.error('Recovery failed; inspect the run key, lock, cooldown, configuration and Buffer evidence. No post was submitted.');
      process.exitCode = 1;
    });
  }
}
module.exports = { recover };
