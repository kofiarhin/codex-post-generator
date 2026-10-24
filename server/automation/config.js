'use strict';

const { mongoUriFromEnv } = require('../config/db');
const { platformsFor } = require('./platforms');

function readConfig(env = process.env, { dryRun = true, platform } = {}) {
  if (typeof dryRun !== 'boolean') throw new Error('Invalid dry-run option');
  const platforms = platformsFor(platform);
  const mongoUri = mongoUriFromEnv(env);
  if (!mongoUri) throw new Error('MONGO_URI is required');
  if (!dryRun && env.AUTONOMOUS_PUBLISH_ENABLED !== 'true') {
    throw new Error('Publishing is disabled');
  }
  const channels = Object.fromEntries(platforms.map(p => [p,
    env[p === 'linkedin' ? 'BUFFER_LINKEDIN_CHANNEL_ID' : 'BUFFER_X_CHANNEL_ID']?.trim()]));
  if (!dryRun && (!env.BUFFER_API_KEY?.trim() || platforms.some(p => !channels[p]))) {
    throw new Error('Buffer API key and selected channel IDs are required');
  }
  if (channels.linkedin && channels.linkedin === channels.x) throw new Error('Buffer channels must differ');
  return { mongoUri, dryRun, publishEnabled: !dryRun && env.AUTONOMOUS_PUBLISH_ENABLED === 'true',
    apiKey: env.BUFFER_API_KEY, channels, platform };
}
module.exports = { readConfig };
