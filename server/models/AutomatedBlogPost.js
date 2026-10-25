'use strict';

const mongoose = require('mongoose');
const LegacyDraft = require('./AutomatedPostDraft');

// Reuse the existing validation and publication state machine, changing only
// the destination collection and adding fields read by IdeaHub's public blog API.
// clone() shares child schemas, so blog-only source fields get their own schema
// instead of mutating the legacy automatedpostdrafts model.
const sourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, url: { type: String, required: true },
  claim: { type: String, required: true }, excerpt: { type: String, required: true }
}, { _id: false });
const schema = LegacyDraft.schema.clone();
schema.set('collection', 'blogposts');
// blogposts also holds IdeaHub posts without automation keys, so the automation
// unique indexes are partial and explicitly named rather than inherited.
schema.remove(['sources', 'key', 'topicHash', 'status']);
schema.add({
  key: { type: String, required: true },
  topicHash: { type: String, required: true },
  sources: { type: [sourceSchema], required: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  content: { type: String, required: true },
  excerpt: { type: String, required: true, trim: true },
  tags: { type: [String], default: [] },
  seoTitle: { type: String, required: true, trim: true },
  seoDescription: { type: String, required: true, trim: true },
  // Only a confirmed LinkedIn publication sets published/publishedAt; IdeaHub reads published only.
  status: { type: String, enum: ['draft', 'published'], default: 'draft', required: true },
  publishedAt: Date,
  origin: { generator: String, sourceType: String }
});
const automated = { key: { $type: 'string' } };
schema.index({ key: 1 }, { unique: true, name: 'automation_key_unique', partialFilterExpression: automated });
schema.index({ topicHash: 1 }, { unique: true, name: 'automation_topic_hash_unique',
  partialFilterExpression: { topicHash: { $type: 'string' } } });
// Same definition and name as DevKofi/IdeaHub, so createIndexes is a no-op on the shared collection.
schema.index({ slug: 1 }, { unique: true, name: 'blog_slug_unique' });

module.exports = mongoose.models.AutomatedBlogPost || mongoose.model('AutomatedBlogPost', schema);
