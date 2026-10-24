'use strict';

const mongoose = require('mongoose');
const sourceSchema = new mongoose.Schema({
  url: { type: String, required: true }, claim: { type: String, required: true },
  excerpt: { type: String, required: true }
}, { _id: false });
const channelSchema = new mongoose.Schema({
  channelId: { type: String, default: '' },
  idempotencyKey: { type: String, required: true },
  state: { type: String, enum: ['not_published', 'pending', 'publishing', 'accepted', 'published', 'rejected', 'rate_limited', 'unknown'], required: true },
  attempts: { type: Number, default: 0 },
  attemptedAt: Date, completedAt: Date, reconciledAt: Date, nextAttemptAt: Date,
  bufferId: String, bufferStatus: String, failureCode: String
}, { _id: false });
const engine = { type: String, enum: ['codex', 'claude'] };
const generationSchema = new mongoose.Schema({
  engine: { ...engine, required: true }, reviewEngine: engine, codexRateLimited: { type: Boolean, default: false }
}, { _id: false });
const schema = new mongoose.Schema({
  schemaVersion: { type: Number, required: true },
  platform: { type: String, enum: ['linkedin'] },
  key: { type: String, required: true, unique: true },
  date: { type: String, required: true }, slot: { type: String, enum: ['morning', 'evening', 'manual'], required: true },
  title: { type: String, required: true }, topicAngle: { type: String, required: true },
  primaryKeyword: { type: String, required: true }, secondaryKeywords: [String],
  topicHash: { type: String, required: true, unique: true },
  contentHash: { type: String, required: true },
  linkedinPost: { type: String, required: true },
  xPost: { type: String, required: function () { return this.platform !== 'linkedin'; } },
  sources: { type: [sourceSchema], required: true },
  validation: { type: mongoose.Schema.Types.Mixed, required: true },
  // Absent on records created before engine fallback.
  generation: generationSchema,
  dryRun: { type: Boolean, required: true },
  status: { type: String, default: 'validated' },
  publications: { linkedin: { type: channelSchema, required: true },
    x: { type: channelSchema, required: function () { return this.platform !== 'linkedin'; } } }
}, { timestamps: true, collection: 'automatedpostdrafts', autoIndex: false, autoCreate: false });

schema.pre('validate', function () {
  if (this.isNew && this.slot !== 'manual' && this.platform !== 'linkedin') {
    this.invalidate('platform', 'Scheduled drafts must be LinkedIn-only');
  }
  if (this.platform === 'linkedin') {
    if (this.xPost !== undefined || this.publications?.x !== undefined) {
      this.invalidate('platform', 'LinkedIn-only records cannot contain an X post or publication');
    }
  }
});

module.exports = mongoose.models.AutomatedPostDraft || mongoose.model('AutomatedPostDraft', schema);
