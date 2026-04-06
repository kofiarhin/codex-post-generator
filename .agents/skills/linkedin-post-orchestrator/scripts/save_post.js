'use strict';

const fs = require('fs');
const path = require('path');
const {
  findDuplicateTitle,
  readLogEntries,
  slugify
} = require('./title_log_utils');
const { sha256File, upsertStageReceipt } = require('./workflow_receipts');

function formatDuplicateError(title, duplicateMatch) {
  const lines = [
    `Duplicate or near-duplicate post title detected: ${title}`,
    `Matched logged title: ${duplicateMatch.existingTitle}`
  ];

  if (duplicateMatch.existingDate) {
    lines.push(`Logged date: ${duplicateMatch.existingDate}`);
  }

  if (duplicateMatch.existingPrimaryKeyword && duplicateMatch.existingPrimaryKeyword !== '-') {
    lines.push(`Logged keyword: ${duplicateMatch.existingPrimaryKeyword}`);
  }

  if (duplicateMatch.existingTopicAngle && duplicateMatch.existingTopicAngle !== '-') {
    lines.push(`Logged angle: ${duplicateMatch.existingTopicAngle}`);
  }

  lines.push(`Match reason: ${duplicateMatch.reason}`);
  lines.push(
    `Similarity scores — tokenOverlap=${duplicateMatch.tokenOverlap.toFixed(2)}, tokenJaccard=${duplicateMatch.tokenJaccard.toFixed(2)}, bigramJaccard=${duplicateMatch.bigramJaccard.toFixed(2)}`
  );

  return lines.join('\n');
}

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} input file not found: ${filePath}`);
  }
}

function savePostFiles({
  title,
  linkedinInputPath,
  xInputPath,
  repoRoot = path.resolve(__dirname, '../../../..'),
  skipDuplicateCheck = false
}) {
  ensureFileExists(linkedinInputPath, 'LinkedIn');
  ensureFileExists(xInputPath, 'X');

  const slug = slugify(title);
  const logPath = path.join(repoRoot, 'log.txt');
  const outputDir = path.join(repoRoot, '_post_suggestion', slug);

  if (!skipDuplicateCheck) {
    const logEntries = readLogEntries(logPath);
    const duplicateMatch = findDuplicateTitle(title, logEntries);

    if (duplicateMatch) {
      const error = new Error(formatDuplicateError(title, duplicateMatch));
      error.code = 'DUPLICATE_TITLE';
      error.duplicateMatch = duplicateMatch;
      throw error;
    }
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const linkedinOutputPath = path.join(outputDir, 'linkedin_post.txt');
  const xOutputPath = path.join(outputDir, 'x_post.txt');
  const linkedinContent = fs.readFileSync(linkedinInputPath, 'utf8');
  const xContent = fs.readFileSync(xInputPath, 'utf8');

  fs.writeFileSync(linkedinOutputPath, linkedinContent, 'utf8');
  fs.writeFileSync(xOutputPath, xContent, 'utf8');

  const orchestratorReceipt = upsertStageReceipt({
    repoRoot,
    title,
    slug,
    stage: 'orchestrator',
    source: 'save_post.js',
    payload: {
      linkedinOutputPath,
      xOutputPath,
      linkedinSha256: sha256File(linkedinOutputPath),
      xSha256: sha256File(xOutputPath)
    }
  });

  return {
    slug,
    outputDir,
    linkedinOutputPath,
    xOutputPath,
    receiptPath: orchestratorReceipt.receiptPath
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error(
      'Usage: node save_post.js "<Post Title>" "<linkedin-input-path>" "<x-input-path>"'
    );
    process.exit(1);
  }

  const title = args[0];
  const linkedinInputPath = path.resolve(args[1]);
  const xInputPath = path.resolve(args[2]);

  try {
    const result = savePostFiles({ title, linkedinInputPath, xInputPath });
    console.log(`LinkedIn post saved to: _post_suggestion/${result.slug}/linkedin_post.txt`);
    console.log(`X post saved to: _post_suggestion/${result.slug}/x_post.txt`);
    console.log(`Full LinkedIn path: ${result.linkedinOutputPath}`);
    console.log(`Full X path: ${result.xOutputPath}`);
    console.log(`Workflow receipt updated: ${result.receiptPath}`);
    console.log('Log update deferred until the full package is finalized.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  formatDuplicateError,
  savePostFiles
};
