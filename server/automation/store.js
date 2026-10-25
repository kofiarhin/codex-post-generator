'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const AutomatedPostDraft = require('../models/AutomatedPostDraft');
const lockSchema = new mongoose.Schema({ _id: String, owner: String, acquiredAt: Date, retryAt: Date },
  { collection: 'postgeneratorlocks', autoIndex: false, autoCreate: false });
const Lock = mongoose.models.PostGeneratorLock || mongoose.model('PostGeneratorLock', lockSchema);

class MongoStore {
  constructor({ model = AutomatedPostDraft, lockModel = Lock } = {}) {
    this.model = model;
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
  get(key) { return this.model.findOne({ key }).lean(); }
  history() {
    return this.model.find({}, { title: 1, topicAngle: 1, topicHash: 1, linkedinPost: 1, xPost: 1 }).lean();
  }
  async save(doc) { return (await this.model.create(doc)).toObject(); }
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
    const doc = await this.model.findOneAndUpdate({ key, [`${prefix}.state`]: { $in: expectedStates } },
      { $set: update }, { new: true, runValidators: true }).lean();
    if (!doc) throw new Error('Publication state changed; reconciliation required');
    return doc;
  }
}
module.exports = { MongoStore, Lock };
