'use strict';

const mongoose = require('mongoose');
const LegacyDraft = require('./AutomatedPostDraft');

// Reuse the existing validation and publication state machine, changing only
// the destination collection and adding fields read by IdeaHub's public blog API.
const schema = LegacyDraft.schema.clone();
schema.set('collection', 'blogposts');
schema.path('sources').schema.add({ title: { type: String, required: true } });
schema.add({
  slug: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  excerpt: { type: String, required: true },
  tags: [String],
  seoTitle: String,
  seoDescription: String,
  publishedAt: Date
});
schema.path('status').default('draft');
schema.path('status').enum('draft', 'published');

module.exports = mongoose.models.AutomatedBlogPost || mongoose.model('AutomatedBlogPost', schema);
