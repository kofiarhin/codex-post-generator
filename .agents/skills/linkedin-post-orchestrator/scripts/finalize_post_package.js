'use strict';

const fs = require('fs');
const path = require('path');
const {
  appendLogEntry,
  findDuplicateTitle,
  getCurrentDateStamp,
  readLogEntries,
  sanitizeLogField,
  slugify
} = require('./title_log_utils');
const {
  getReceiptPath,
  readReceipt,
  requireCompletedStages,
  sha256File,
  upsertStageReceipt
} = require('./workflow_receipts');
const { formatDuplicateError, savePostFiles } = require('./save_post');
const { saveAssetPrompt } = require('../../linkedin-post-assets/scripts/save_asset');

const REQUIRED_OUTPUT_FILES = ['linkedin_post.txt', 'x_post.txt', 'prompt.txt'];

function validateOutputPackage(outputDir) {
  return REQUIRED_OUTPUT_FILES.filter((fileName) => !fs.existsSync(path.join(outputDir, fileName)));
}

function buildPackageFileHashes(outputDir) {
  return REQUIRED_OUTPUT_FILES.reduce((accumulator, fileName) => {
    const filePath = path.join(outputDir, fileName);
    accumulator[fileName] = {
      path: filePath,
      sha256: sha256File(filePath),
      mtimeIso: fs.statSync(filePath).mtime.toISOString()
    };
    return accumulator;
  }, {});
}

function finalizePostPackage({
  title,
  linkedinInputPath,
  xInputPath,
  promptInputPath,
  primaryKeyword = '',
  topicAngle = '',
  repoRoot = path.resolve(__dirname, '../../../..')
}) {
  const logPath = path.join(repoRoot, 'log.txt');
  const logEntries = readLogEntries(logPath);
  const duplicateMatch = findDuplicateTitle(title, logEntries);

  if (duplicateMatch) {
    const error = new Error(formatDuplicateError(title, duplicateMatch));
    error.code = 'DUPLICATE_TITLE';
    error.duplicateMatch = duplicateMatch;
    throw error;
  }

  const slug = slugify(title);
  const outputDir = path.join(repoRoot, '_post_suggestion', slug);
  const outputDirExisted = fs.existsSync(outputDir);

  try {
    const postResult = savePostFiles({
      title,
      linkedinInputPath,
      xInputPath,
      repoRoot,
      skipDuplicateCheck: true
    });

    const assetResult = saveAssetPrompt({
      title,
      inputPath: promptInputPath,
      repoRoot
    });

    const receiptPath = getReceiptPath({ repoRoot, slug });
    const receipt = readReceipt(receiptPath);
    requireCompletedStages(receipt, ['orchestrator', 'asset']);

    const missingFiles = validateOutputPackage(outputDir);
    if (missingFiles.length > 0) {
      throw new Error(`Final package is incomplete. Missing files: ${missingFiles.join(', ')}`);
    }

    const packageFileHashes = buildPackageFileHashes(outputDir);
    const latestPackageFileTimestamp = Math.max(
      ...Object.values(packageFileHashes).map((entry) => new Date(entry.mtimeIso).getTime())
    );

    const logCountBefore = readLogEntries(logPath).length;
    const loggedLine = appendLogEntry(logPath, {
      date: getCurrentDateStamp(),
      title: sanitizeLogField(title),
      primaryKeyword: sanitizeLogField(primaryKeyword),
      topicAngle: sanitizeLogField(topicAngle)
    });
    const logCountAfter = readLogEntries(logPath).length;
    const logUpdatedAt = new Date().toISOString();
    const logUpdatedAfterPackageSave = new Date(logUpdatedAt).getTime() >= latestPackageFileTimestamp;

    const finalizerReceipt = upsertStageReceipt({
      repoRoot,
      title,
      slug,
      stage: 'finalizer',
      source: 'finalize_post_package.js',
      payload: {
        packageComplete: true,
        requiredFiles: REQUIRED_OUTPUT_FILES,
        packageFileHashes,
        logPath,
        logCountBefore,
        logCountAfter,
        logEntry: loggedLine,
        logUpdatedAt,
        logUpdatedAfterPackageSave
      }
    });

    if (!logUpdatedAfterPackageSave) {
      throw new Error('Invalid workflow order: log.txt was updated before the full package was saved.');
    }

    return {
      slug,
      outputDir,
      linkedinOutputPath: postResult.linkedinOutputPath,
      xOutputPath: postResult.xOutputPath,
      promptOutputPath: assetResult.outputPath,
      logPath,
      loggedLine,
      receiptPath: finalizerReceipt.receiptPath
    };
  } catch (error) {
    if (!outputDirExisted && fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }

    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error(
      'Usage: node finalize_post_package.js "<Post Title>" "<linkedin-input-path>" "<x-input-path>" "<prompt-input-path>" ["<primary-keyword>"] ["<topic-angle>"]'
    );
    process.exit(1);
  }

  const [title, linkedinInputArg, xInputArg, promptInputArg, primaryKeyword = '', topicAngle = ''] = args;

  try {
    const result = finalizePostPackage({
      title,
      linkedinInputPath: path.resolve(linkedinInputArg),
      xInputPath: path.resolve(xInputArg),
      promptInputPath: path.resolve(promptInputArg),
      primaryKeyword,
      topicAngle
    });

    console.log(`LinkedIn post saved to: _post_suggestion/${result.slug}/linkedin_post.txt`);
    console.log(`X post saved to: _post_suggestion/${result.slug}/x_post.txt`);
    console.log(`Prompt saved to: _post_suggestion/${result.slug}/prompt.txt`);
    console.log('Title logged in: log.txt');
    console.log(`Log entry: ${result.loggedLine}`);
    console.log(`Workflow receipt: _post_suggestion/${result.slug}/workflow_receipts.json`);
    console.log(`Full LinkedIn path: ${result.linkedinOutputPath}`);
    console.log(`Full X path: ${result.xOutputPath}`);
    console.log(`Full prompt path: ${result.promptOutputPath}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  finalizePostPackage
};
