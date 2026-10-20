'use strict';

// Dry-run only. No publishing permissions or API credentials are used here.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { resolve } = require('node:path');
const { slotAt } = require('./slot');
const { validateDraft } = require('./validate');
const { connectMongo, disconnectMongo } = require('../config/db');
const mongoose = require('mongoose');

async function run({ now = new Date(), generate = generateWithCodex, persist = saveDraft } = {}) {
  if (process.env.AUTONOMOUS_PUBLISH_ENABLED === 'true') throw new Error('Autonomous publishing is not authorized');
  const { date, slot } = slotAt(now);
  const key = `post-generator:${date}:${slot}`;
  const draft = await generate({ date, slot });
  const validated = validateDraft(draft);
  const result = await persist({ ...validated, date, slot, key, status: 'draft', platforms: { linkedin: 'not_published', x: 'not_published' } });
  return { key, status: 'draft', stored: Boolean(result), published: false };
}

function generateWithCodex({ date, slot }) {
  const prompt = `Research current software engineering and AI sources. Produce one LinkedIn and one distinct X post for ${date} ${slot}. Return ONLY a JSON object with title, topicAngle, linkedinPost, xPost and sources (at least two objects with url and claim). Include only verifiable claims; do not invent personal experience. ${slot === 'morning' ? 'Prioritize current news.' : 'Prioritize practical engineering observations.'} Research and verify claims before writing.`;
  const result = spawnSync('codex', ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', prompt], {
    cwd: resolve(__dirname, '../..'), encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) throw new Error('Codex research failed');
  const text = result.stdout.trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Codex did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}

async function saveDraft(doc) {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI required');
  await connectMongo();
  try {
    const collection = mongoose.connection.db.collection('automatedpostdrafts');
    await collection.createIndex({ key: 1 }, { unique: true });
    await collection.createIndex({ topicHash: 1 }, { unique: true });
    const existing = await collection.findOne({ $or: [{ key: doc.key }, { topicHash: doc.topicHash }] });
    if (existing) throw new Error('Duplicate run or topic');
    await collection.insertOne({ ...doc, createdAt: new Date() });
    return true;
  } finally { await disconnectMongo(); }
}

if (require.main === module) {
  require('dotenv').config({ path: resolve(__dirname, '../../.env') });
  run().then(result => console.log(JSON.stringify(result))).catch(err => { console.error(err.message); process.exitCode = 1; });
}
module.exports = { run, generateWithCodex, saveDraft };
