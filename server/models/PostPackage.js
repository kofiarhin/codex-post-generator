'use strict';

const mongoose = require('mongoose');

const PostPackageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    primaryKeyword: { type: String, default: '' },
    topicAngle: { type: String, default: '' },
    linkedinPost: { type: String, required: true },
    xPost: { type: String, required: true },
    prompt: { type: String, required: true },
    thumbnailPath: { type: String, default: '' },
    thumbnailFileName: { type: String, default: '' },
    packageDir: { type: String, required: true },
    logEntry: { type: String, default: '' },
    provider: { type: String, default: '' },
    model: { type: String, default: '' },
    fallbackUsed: { type: Boolean, default: false },
    fallbackReason: { type: String, default: '' },
    sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    workflowReceiptPath: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.models.PostPackage || mongoose.model('PostPackage', PostPackageSchema);
