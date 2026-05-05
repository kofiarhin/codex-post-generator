'use strict';

const fs = require('fs');
const path = require('path');
const { readLogEntries } = require('./title_log_utils');
const { readReceipt } = require('./workflow_receipts');

const LEGACY_REQUIRED_OUTPUT_FILES = ['linkedin_post.txt', 'x_post.txt', 'prompt.txt'];
const CURRENT_REQUIRED_OUTPUT_FILES = [...LEGACY_REQUIRED_OUTPUT_FILES, 'thumbnail.png'];
const REQUIRED_STAGES = ['orchestrator', 'asset', 'finalizer'];

function listDirectories(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name));
}

function auditPackage(repoRoot, dirPath) {
  const issues = [];
  const receiptPath = path.join(dirPath, 'workflow_receipts.json');
  const receipt = readReceipt(receiptPath);
  const requiredOutputFiles = receipt?.stages?.finalizer?.requiredFiles || LEGACY_REQUIRED_OUTPUT_FILES;
  const missingFiles = requiredOutputFiles.filter(
    (fileName) => !fs.existsSync(path.join(dirPath, fileName))
  );

  if (missingFiles.length > 0) {
    issues.push(
      `Incomplete package: ${path.relative(repoRoot, dirPath)} is missing ${missingFiles.join(', ')}`
    );
    return issues;
  }

  if (!receipt) {
    issues.push(`Missing workflow receipt: ${path.relative(repoRoot, receiptPath)}`);
    return issues;
  }

  for (const stage of REQUIRED_STAGES) {
    if (receipt.stages?.[stage]?.status !== 'completed') {
      issues.push(`Missing completed stage '${stage}' in ${path.relative(repoRoot, receiptPath)}`);
    }
  }

  if (requiredOutputFiles.includes('thumbnail.png') && receipt.stages?.thumbnail?.status !== 'completed') {
    issues.push(`Missing completed stage 'thumbnail' in ${path.relative(repoRoot, receiptPath)}`);
  }

  if (!receipt.stages?.finalizer?.logUpdatedAfterPackageSave) {
    issues.push(`Workflow order violation in ${path.relative(repoRoot, receiptPath)}: log update was not proven after package save.`);
  }

  return issues;
}

function main() {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const outputRoot = path.join(repoRoot, '_post_suggestion');
  const legacyOutputRoot = path.join(repoRoot, '_post_suggestions');
  const logPath = path.join(repoRoot, 'log.txt');
  const packageDirs = listDirectories(outputRoot);
  const issues = [];

  if (!fs.existsSync(logPath)) {
    issues.push('Missing root log.txt file.');
  }

  const logEntries = readLogEntries(logPath);

  for (const dirPath of packageDirs) {
    issues.push(...auditPackage(repoRoot, dirPath));
  }

  if (fs.existsSync(legacyOutputRoot)) {
    const legacyFiles = fs
      .readdirSync(legacyOutputRoot)
      .filter((entry) => entry !== '.gitkeep');

    if (legacyFiles.length > 0) {
      issues.push(
        `Legacy output directory still contains files: ${legacyFiles
          .map((entry) => path.join('_post_suggestions', entry))
          .join(', ')}`
      );
    }
  }

  console.log(`Audited package directories: ${packageDirs.length}`);
  console.log(`Log file present: ${fs.existsSync(logPath) ? 'yes' : 'no'}`);
  console.log(`Log entry count: ${logEntries.length}`);
  console.log(`Current required files: ${CURRENT_REQUIRED_OUTPUT_FILES.join(', ')}`);

  if (issues.length === 0) {
    console.log('Workflow audit passed. All saved packages are machine-verifiable.');
    process.exit(0);
  }

  console.log('Workflow audit found issues:');
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }

  process.exit(1);
}

main();
