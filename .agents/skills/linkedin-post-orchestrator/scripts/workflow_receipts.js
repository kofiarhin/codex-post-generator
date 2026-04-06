'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { slugify } = require('./title_log_utils');

const RECEIPT_VERSION = 1;
const RECEIPT_FILE_NAME = 'workflow_receipts.json';

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getReceiptPath({ repoRoot, title, slug }) {
  const resolvedSlug = slug || slugify(title);
  return path.join(repoRoot, '_post_suggestion', resolvedSlug, RECEIPT_FILE_NAME);
}

function readReceipt(receiptPath) {
  if (!fs.existsSync(receiptPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
}

function writeReceipt(receiptPath, receipt) {
  const receiptDir = path.dirname(receiptPath);
  if (!fs.existsSync(receiptDir)) {
    fs.mkdirSync(receiptDir, { recursive: true });
  }

  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
}

function upsertStageReceipt({
  repoRoot,
  title,
  slug,
  stage,
  payload,
  source
}) {
  const resolvedSlug = slug || slugify(title);
  const receiptPath = getReceiptPath({ repoRoot, slug: resolvedSlug });
  const existingReceipt = readReceipt(receiptPath);
  const now = new Date().toISOString();

  const nextReceipt = {
    version: RECEIPT_VERSION,
    title,
    slug: resolvedSlug,
    createdAt: existingReceipt?.createdAt || now,
    updatedAt: now,
    stages: {
      ...(existingReceipt?.stages || {}),
      [stage]: {
        status: 'completed',
        source,
        completedAt: now,
        ...payload
      }
    }
  };

  writeReceipt(receiptPath, nextReceipt);

  return {
    receiptPath,
    receipt: nextReceipt
  };
}

function requireCompletedStages(receipt, expectedStages) {
  if (!receipt || !receipt.stages) {
    throw new Error('Missing workflow receipt. Run the full generate-post workflow to produce auditable proof.');
  }

  for (const stageName of expectedStages) {
    if (receipt.stages[stageName]?.status !== 'completed') {
      throw new Error(
        `Missing required workflow stage receipt: ${stageName}. This package is not machine-verifiable.`
      );
    }
  }
}

module.exports = {
  getReceiptPath,
  readReceipt,
  requireCompletedStages,
  sha256File,
  upsertStageReceipt
};
