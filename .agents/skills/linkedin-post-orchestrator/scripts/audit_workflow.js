'use strict';

const fs = require('fs');
const path = require('path');
const { readLogEntries } = require('./title_log_utils');
const { readReceipt } = require('./workflow_receipts');
const {
  MAX_REVIEW_ITERATIONS,
  STATE_FILE_NAME,
  STAGES,
  SUMMARY_FILE_NAME,
  WORKFLOW_MODE,
  WORKFLOW_NAME
} = require('./ralph_article_state');

const LEGACY_REQUIRED_OUTPUT_FILES = ['linkedin_post.txt', 'x_post.txt', 'prompt.txt'];
const CURRENT_REQUIRED_OUTPUT_FILES_DESCRIPTION = 'linkedin_post.txt, x_post.txt, prompt.txt, <seo-thumbnail-file>.png';
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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasThumbnail(dirPath) {
  return fs
    .readdirSync(dirPath)
    .some((fileName) => fileName.toLowerCase().endsWith('.png'));
}

function isRalphPackage(dirPath, receipt) {
  const state = readJsonIfExists(path.join(dirPath, STATE_FILE_NAME));
  const summary = readJsonIfExists(path.join(dirPath, SUMMARY_FILE_NAME));

  return (
    state?.workflow === WORKFLOW_NAME
    || state?.workflowMode === WORKFLOW_MODE
    || summary?.workflow === WORKFLOW_NAME
    || summary?.workflowMode === WORKFLOW_MODE
    || receipt?.workflow === WORKFLOW_NAME
    || receipt?.workflowMode === WORKFLOW_MODE
    || receipt?.mode === 'pipeline'
  );
}

function auditLegacyPackage(repoRoot, dirPath, receipt) {
  const issues = [];
  const requiredOutputFiles = receipt?.stages?.finalizer?.requiredFiles || LEGACY_REQUIRED_OUTPUT_FILES;
  const missingFiles = requiredOutputFiles.filter(
    (fileName) => !fs.existsSync(path.join(dirPath, fileName))
  );

  if (missingFiles.length > 0) {
    issues.push(
      `Incomplete legacy package: ${path.relative(repoRoot, dirPath)} is missing ${missingFiles.join(', ')}`
    );
    return issues;
  }

  if (!receipt) {
    return issues;
  }

  for (const stage of REQUIRED_STAGES) {
    if (receipt.stages?.[stage]?.status !== 'completed') {
      issues.push(`Missing completed stage '${stage}' in ${path.relative(repoRoot, path.join(dirPath, 'workflow_receipts.json'))}`);
    }
  }

  const expectsThumbnail = requiredOutputFiles.some((fileName) => fileName.toLowerCase().endsWith('.png'));

  if ((expectsThumbnail || hasThumbnail(dirPath)) && receipt.stages?.thumbnail?.status !== 'completed') {
    issues.push(`Missing completed stage 'thumbnail' in ${path.relative(repoRoot, path.join(dirPath, 'workflow_receipts.json'))}`);
  }

  if (receipt.stages?.finalizer && !receipt.stages.finalizer.logUpdatedAfterPackageSave) {
    issues.push(`Workflow order violation in ${path.relative(repoRoot, path.join(dirPath, 'workflow_receipts.json'))}: log update was not proven after package save.`);
  }

  return issues;
}

function auditRalphPackage(repoRoot, dirPath) {
  const issues = [];
  const statePath = path.join(dirPath, STATE_FILE_NAME);
  const summaryPath = path.join(dirPath, SUMMARY_FILE_NAME);
  const state = readJsonIfExists(statePath);
  const summary = readJsonIfExists(summaryPath);

  if (!state) {
    issues.push(`Missing RALPH resume state: ${path.relative(repoRoot, statePath)}`);
    return issues;
  }

  if (state.workflow !== WORKFLOW_NAME || state.workflowMode !== WORKFLOW_MODE) {
    issues.push(`Invalid RALPH workflow marker in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!state.currentStage) {
    issues.push(`Missing currentStage in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!Array.isArray(state.completedStages)) {
    issues.push(`Missing completedStages array in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!Object.prototype.hasOwnProperty.call(state, 'nextStage')) {
    issues.push(`Missing nextStage in ${path.relative(repoRoot, statePath)}.`);
  } else if (state.nextStage !== null) {
    issues.push(`RALPH package is not complete in ${path.relative(repoRoot, statePath)}. Next stage: ${state.nextStage || 'unknown'}.`);
  }

  if (!state.lastUpdatedAt) {
    issues.push(`Missing lastUpdatedAt in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!state.artifactPaths || typeof state.artifactPaths !== 'object') {
    issues.push(`Missing artifact paths in ${path.relative(repoRoot, statePath)}.`);
  }

  if ((state.reviewIterationsUsed || 0) > MAX_REVIEW_ITERATIONS) {
    issues.push(`Review iteration limit exceeded in ${path.relative(repoRoot, statePath)}: ${state.reviewIterationsUsed}/${MAX_REVIEW_ITERATIONS}.`);
  }

  for (const stage of STAGES) {
    const stageRecord = state.stages?.[stage.key];

    for (const artifactName of stage.artifacts) {
      const artifactPath = path.join(dirPath, artifactName);

      if (!fs.existsSync(artifactPath)) {
        issues.push(`Missing RALPH artifact: ${path.relative(repoRoot, artifactPath)}`);
      }
    }

    if (!stageRecord) {
      issues.push(`Missing RALPH state record for stage '${stage.key}' in ${path.relative(repoRoot, statePath)}.`);
    } else if (stageRecord.status !== 'passed') {
      issues.push(`RALPH stage '${stage.key}' is not passed in ${path.relative(repoRoot, statePath)}.`);
    }
  }

  if (!fs.existsSync(path.join(dirPath, 'polish_decision.json'))) {
    issues.push(`Missing polish decision artifact: ${path.relative(repoRoot, path.join(dirPath, 'polish_decision.json'))}`);
  } else {
    const polishDecision = readJsonIfExists(path.join(dirPath, 'polish_decision.json'));

    if (polishDecision?.reviewApproved !== true) {
      issues.push(`Polish decision is not review-approved in ${path.relative(repoRoot, path.join(dirPath, 'polish_decision.json'))}.`);
    }
  }

  if (!fs.existsSync(path.join(dirPath, 'polished_package.json'))) {
    issues.push(`Missing polished package artifact: ${path.relative(repoRoot, path.join(dirPath, 'polished_package.json'))}`);
  }

  if (!fs.existsSync(path.join(dirPath, 'article_health_check.md'))) {
    issues.push(`Missing health check artifact: ${path.relative(repoRoot, path.join(dirPath, 'article_health_check.md'))}`);
  }

  if (!summary) {
    issues.push(`Missing workflow summary: ${path.relative(repoRoot, summaryPath)}`);
  } else {
    if (!Array.isArray(summary.ralphStagesCompleted)) {
      issues.push(`Missing ralphStagesCompleted in ${path.relative(repoRoot, summaryPath)}.`);
    }

    if (typeof summary.reviewIterationsUsed !== 'number') {
      issues.push(`Missing reviewIterationsUsed in ${path.relative(repoRoot, summaryPath)}.`);
    }

    if (typeof summary.polishCompleted !== 'boolean') {
      issues.push(`Missing polishCompleted in ${path.relative(repoRoot, summaryPath)}.`);
    }

    if (typeof summary.healthCheckPassed !== 'boolean') {
      issues.push(`Missing healthCheckPassed in ${path.relative(repoRoot, summaryPath)}.`);
    }

    if (!summary.finalOutputPaths || typeof summary.finalOutputPaths !== 'object') {
      issues.push(`Missing finalOutputPaths in ${path.relative(repoRoot, summaryPath)}.`);
    }
  }

  return issues;
}

function auditPackage(repoRoot, dirPath) {
  const receiptPath = path.join(dirPath, 'workflow_receipts.json');
  const receipt = readReceipt(receiptPath);

  if (isRalphPackage(dirPath, receipt)) {
    return auditRalphPackage(repoRoot, dirPath);
  }

  return auditLegacyPackage(repoRoot, dirPath, receipt);
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
  console.log(`Current required files: ${CURRENT_REQUIRED_OUTPUT_FILES_DESCRIPTION}`);

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
