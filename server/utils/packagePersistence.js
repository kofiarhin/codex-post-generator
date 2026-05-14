'use strict';

const fs = require('fs');
const path = require('path');
const { connectMongo } = require('../config/db');
const PostPackage = require('../models/PostPackage');

const REQUIRED_PACKAGE_FILES = ['linkedin_post.txt', 'x_post.txt', 'prompt.txt'];

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toRepoRelative(repoRoot, targetPath) {
  if (!targetPath) {
    return '';
  }

  return path.relative(repoRoot, targetPath).replace(/\\/g, '/');
}

function parseLogEntry(logEntry) {
  const parts = String(logEntry || '')
    .split('|')
    .map((part) => part.trim());

  if (parts.length < 4) {
    return {};
  }

  return {
    title: parts[1] || '',
    primaryKeyword: parts[2] || '',
    topicAngle: parts.slice(3).join(' | ') || ''
  };
}

function findThumbnailFile(packageDir, receipt) {
  const finalizerThumbnail = receipt?.stages?.finalizer?.thumbnailFileName;
  const thumbnailStageFile = receipt?.stages?.thumbnail?.thumbnailFileName;
  const candidates = [finalizerThumbnail, thumbnailStageFile].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(packageDir, candidate))) {
      return candidate;
    }
  }

  const pngFiles = fs
    .readdirSync(packageDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.png'))
    .map((fileName) => ({
      fileName,
      mtimeMs: fs.statSync(path.join(packageDir, fileName)).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return pngFiles[0]?.fileName || '';
}

function extractSources(receipt) {
  const sources =
    receipt?.sources ||
    receipt?.stages?.research?.sources ||
    receipt?.stages?.orchestrator?.sources ||
    [];

  return Array.isArray(sources) ? sources : [];
}

function buildPackageDocument({
  slug,
  packageDir,
  repoRoot,
  title,
  primaryKeyword = '',
  topicAngle = '',
  logEntry = ''
}) {
  for (const fileName of REQUIRED_PACKAGE_FILES) {
    const filePath = path.join(packageDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cannot sync package "${slug}". Missing ${fileName}`);
    }
  }

  const receiptPath = path.join(packageDir, 'workflow_receipts.json');
  const receipt = readJsonFile(receiptPath);
  const finalizer = receipt?.stages?.finalizer || {};
  const thumbnail = receipt?.stages?.thumbnail || {};
  const parsedLog = parseLogEntry(logEntry || finalizer.logEntry);
  const resolvedTitle = title || receipt?.title || parsedLog.title || slug;
  const resolvedPrimaryKeyword = primaryKeyword || parsedLog.primaryKeyword || '';
  const resolvedTopicAngle = topicAngle || parsedLog.topicAngle || '';
  const thumbnailFileName = findThumbnailFile(packageDir, receipt);
  const thumbnailPath = thumbnailFileName ? path.join(packageDir, thumbnailFileName) : '';

  return {
    title: resolvedTitle,
    slug,
    primaryKeyword: resolvedPrimaryKeyword,
    topicAngle: resolvedTopicAngle,
    linkedinPost: readTextFile(path.join(packageDir, 'linkedin_post.txt')),
    xPost: readTextFile(path.join(packageDir, 'x_post.txt')),
    prompt: readTextFile(path.join(packageDir, 'prompt.txt')),
    thumbnailPath: toRepoRelative(repoRoot, thumbnailPath),
    thumbnailFileName,
    packageDir: toRepoRelative(repoRoot, packageDir),
    logEntry: logEntry || finalizer.logEntry || '',
    provider: thumbnail.provider || '',
    model: thumbnail.model || '',
    fallbackUsed: Boolean(thumbnail.fallbackUsed),
    fallbackReason: thumbnail.fallbackReason || '',
    sources: extractSources(receipt),
    workflowReceiptPath: fs.existsSync(receiptPath) ? toRepoRelative(repoRoot, receiptPath) : ''
  };
}

async function upsertPackageDocument(document, { model = PostPackage } = {}) {
  return model.findOneAndUpdate(
    { slug: document.slug },
    { $set: document },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function persistPostPackage({
  slug,
  repoRoot = path.resolve(__dirname, '../..'),
  title,
  primaryKeyword = '',
  topicAngle = '',
  logEntry = '',
  packageDir = path.join(repoRoot, '_post_suggestion', slug),
  mongoUri = process.env.MONGODB_URI,
  model = PostPackage
}) {
  if (!slug) {
    throw new Error('slug is required to persist a post package.');
  }

  await connectMongo({ mongoUri });
  const document = buildPackageDocument({
    slug,
    packageDir,
    repoRoot,
    title,
    primaryKeyword,
    topicAngle,
    logEntry
  });

  return upsertPackageDocument(document, { model });
}

async function syncAllPostPackages({
  repoRoot = path.resolve(__dirname, '../..'),
  packagesRoot = path.join(repoRoot, '_post_suggestion'),
  mongoUri = process.env.MONGODB_URI,
  model = PostPackage
} = {}) {
  await connectMongo({ mongoUri });

  if (!fs.existsSync(packagesRoot)) {
    return [];
  }

  const slugs = fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const results = [];

  for (const slug of slugs) {
    const packageDir = path.join(packagesRoot, slug);
    const document = buildPackageDocument({ slug, packageDir, repoRoot });
    const saved = await upsertPackageDocument(document, { model });
    results.push(saved);
  }

  return results;
}

module.exports = {
  buildPackageDocument,
  findThumbnailFile,
  parseLogEntry,
  persistPostPackage,
  syncAllPostPackages,
  upsertPackageDocument
};
