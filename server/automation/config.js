'use strict';

const { mongoUriFromEnv } = require('../config/db');
const { platformsFor } = require('./platforms');

const SLOTS = ['morning', 'evening'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// Fewer, stronger posts: the Nov 2026 analytics showed twice-daily posting spread reach thin.
// Default is one weekday-morning post (5/week); POST_SLOTS / POST_DAYS widen it without code changes.
const DEFAULT_SCHEDULE = { slots: 'morning', days: 'mon,tue,wed,thu,fri' };

function readSchedule(env = process.env) {
  const list = (value, fallback, allowed, name) => {
    const items = String(value ?? fallback).split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
    if (!items.length || items.some(item => !allowed.includes(item))) throw new Error(`Invalid ${name}`);
    return [...new Set(items)];
  };
  return { slots: list(env.POST_SLOTS, DEFAULT_SCHEDULE.slots, SLOTS, 'POST_SLOTS'),
    days: list(env.POST_DAYS, DEFAULT_SCHEDULE.days, DAYS, 'POST_DAYS') };
}

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
    apiKey: env.BUFFER_API_KEY, channels, platform, schedule: readSchedule(env) };
}
module.exports = { readConfig, readSchedule, DEFAULT_SCHEDULE };
