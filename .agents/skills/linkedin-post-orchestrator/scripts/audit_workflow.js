'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_OUTPUT_FILES = ['linkedin_post.txt', 'x_post.txt', 'prompt.txt'];

function listDirectories(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name));
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

  for (const dirPath of packageDirs) {
    const missingFiles = REQUIRED_OUTPUT_FILES.filter(
      (fileName) => !fs.existsSync(path.join(dirPath, fileName))
    );

    if (missingFiles.length > 0) {
      issues.push(
        `Incomplete package: ${path.relative(repoRoot, dirPath)} is missing ${missingFiles.join(', ')}`
      );
    }
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

  if (issues.length === 0) {
    console.log('Workflow audit passed. All saved packages match the required structure.');
    process.exit(0);
  }

  console.log('Workflow audit found issues:');
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }

  process.exit(1);
}

main();
