'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const AutomatedPostDraft = require('../models/AutomatedPostDraft');
const BlogPost = require('../models/AutomatedBlogPost');
const slugify = title => title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const lockSchema = new mongoose.Schema({ _id: String, owner: String, acquiredAt: Date, retryAt: Date },
  { collection: 'postgeneratorlocks', autoIndex: false, autoCreate: false });
const Lock = mongoose.models.PostGeneratorLock || mongoose.model('PostGeneratorLock', lockSchema);

class MongoStore {
  constructor({ model = BlogPost, legacyModel = AutomatedPostDraft, lockModel = Lock } = {}) {
    this.model = model;
    this.legacyModel = legacyModel;
    this.lockModel = lockModel;
    this.owner = randomUUID();
  }
  async initialize() {
    // Additive only: reuse the IDE-120 indexes. Never syncIndexes/drop legacy data.
    await this.model.createIndexes();
  }
  async acquire() {
    try {
      await this.lockModel.create({ _id: 'generation-and-publishing', owner: this.owner, acquiredAt: new Date() });
    } catch (error) {
      if (error.code === 11000) throw new Error('Automation is locked; inspect the active or interrupted run');
      throw error;
    }
  }
  async release() {
    await this.lockModel.deleteOne({ _id: 'generation-and-publishing', owner: this.owner });
  }
  async bufferCooldown() {
    return (await this.lockModel.findById('buffer-cooldown').lean())?.retryAt;
  }
  async deferBuffer(retryAt) {
    await this.lockModel.updateOne({ _id: 'buffer-cooldown' }, { $max: { retryAt } }, { upsert: true });
  }
  async get(key) {
    // Historical records remain readable, but new writes never go to the legacy collection.
    return await this.model.findOne({ key }).lean() || await this.legacyModel.findOne({ key }).lean();
  }
  async history() {
    const projection = { title: 1, topicAngle: 1, topicHash: 1, linkedinPost: 1, xPost: 1 };
    const [current, legacy] = await Promise.all([
      this.model.find({}, projection).lean(), this.legacyModel.find({}, projection).lean()
    ]);
    return [...current, ...legacy];
  }
  async save(doc) {
    // A single document contains both automation state and the public blog fields.
    const slug = slugify(doc.title);
    if (!slug) throw new Error('Invalid blog title');
    const blog = {
      ...doc, slug, content: doc.linkedinPost,
      excerpt: doc.linkedinPost.replace(/#[\w-]+/g, '').trim().slice(0, 240),
      tags: [...new Set([doc.primaryKeyword, ...(doc.secondaryKeywords || [])])].filter(Boolean),
      sources: doc.sources.map(source => ({ ...source, title: source.claim })),
      seoTitle: doc.title, seoDescription: doc.linkedinPost.slice(0, 160),
      status: 'draft'
    };
    return (await this.model.create(blog)).toObject();
  }
  async claim(key, platform, channelId, now) {
    if (!['linkedin', 'x'].includes(platform)) throw new Error('Invalid platform');
    const path = `publications.${platform}`;
    return this.model.findOneAndUpdate({ key, schemaVersion: 2, dryRun: false,
      ...(platform === 'x' ? { platform: { $ne: 'linkedin' } } : {}),
      [`${path}.channelId`]: channelId, [`${path}.attempts`]: { $lt: 3 },
      $or: [{ [`${path}.state`]: 'pending' },
        { [`${path}.state`]: 'rate_limited', [`${path}.nextAttemptAt`]: { $lte: now } }]
    }, { $set: { [`${path}.state`]: 'publishing', [`${path}.attemptedAt`]: now },
      $inc: { [`${path}.attempts`]: 1 } }, { new: true, runValidators: true }).lean();
  }
  async record(key, platform, expectedStates, result) {
    if (!['linkedin', 'x'].includes(platform)) throw new Error('Invalid platform');
    const prefix = `publications.${platform}`;
    const update = Object.fromEntries(Object.entries(result).map(([k, v]) => [`${prefix}.${k}`, v]));
    const isLinkedInPublished = platform === 'linkedin' && result.state === 'published';
    if (isLinkedInPublished) {
      update.status = 'published';
      update.publishedAt = result.completedAt || result.reconciledAt || new Date();
    }
    const doc = await this.model.findOneAndUpdate({ key, [`${prefix}.state`]: { $in: expectedStates } },
      { $set: update }, { new: true, runValidators: true }).lean();
    if (!doc) throw new Error('Publication state changed; reconciliation required');
    return doc;
  }
}
module.exports = { MongoStore, Lock };
