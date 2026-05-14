'use strict';

const fs = require('fs');
const path = require('path');
const { slugify } = require('./title_log_utils');
const {
  MAX_REVIEW_ITERATIONS,
  STATE_FILE_NAME,
  STAGES,
  SUMMARY_FILE_NAME,
  WORKFLOW_MODE,
  WORKFLOW_NAME,
  getArticleOutputDir,
  getStatePath,
  getSummaryPath,
  readState,
  sha256File
} = require('./ralph_article_state');

function listStateFiles(repoRoot) {
  const outputRoot = path.join(repoRoot, '_post_suggestion');

  if (!fs.existsSync(outputRoot)) {
    return [];
  }

  return fs
    .readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(outputRoot, entry.name, STATE_FILE_NAME))
    .filter((statePath) => fs.existsSync(statePath));
}

function resolveTargets(repoRoot, targetArg) {
  if (!targetArg) {
    return listStateFiles(repoRoot);
  }

  const resolvedTarget = path.resolve(targetArg);

  if (fs.existsSync(resolvedTarget)) {
    const stat = fs.statSync(resolvedTarget);

    if (stat.isDirectory()) {
      return [path.join(resolvedTarget, STATE_FILE_NAME)];
    }

    return [resolvedTarget];
  }

  const slug = slugify(targetArg);
  return [getStatePath({ repoRoot, slug })];
}

function validateStateFile(repoRoot, statePath) {
  const issues = [];
  const state = readState(statePath);
  let previousCompletedAt = null;

  if (!state) {
    return [`Missing RALPH resume state file: ${path.relative(repoRoot, statePath)}`];
  }

  const outputDir = getArticleOutputDir({ repoRoot, slug: state.slug });
  const summaryPath = getSummaryPath({ repoRoot, slug: state.slug });

  if (state.workflow !== WORKFLOW_NAME || state.workflowMode !== WORKFLOW_MODE) {
    issues.push(`Invalid workflow marker in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!state.currentStage) {
    issues.push(`Missing currentStage in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!Object.prototype.hasOwnProperty.call(state, 'nextStage')) {
    issues.push(`Missing nextStage in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!Array.isArray(state.completedStages)) {
    issues.push(`Missing completedStages array in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!state.lastUpdatedAt || Number.isNaN(new Date(state.lastUpdatedAt).getTime())) {
    issues.push(`Missing or invalid lastUpdatedAt in ${path.relative(repoRoot, statePath)}.`);
  }

  if (!state.artifactPaths || typeof state.artifactPaths !== 'object') {
    issues.push(`Missing artifact paths in ${path.relative(repoRoot, statePath)}.`);
  }

  if ((state.reviewIterationsUsed || 0) > MAX_REVIEW_ITERATIONS) {
    issues.push(`Review iteration limit exceeded: ${state.reviewIterationsUsed}/${MAX_REVIEW_ITERATIONS}.`);
  }

  for (const stage of STAGES) {
    const stageRecord = state.stages?.[stage.key];
    const artifactPaths = stage.artifacts.map((artifactName) => path.join(outputDir, artifactName));
    const missingArtifacts = artifactPaths.filter((artifactPath) => !fs.existsSync(artifactPath));

    for (const artifactPath of missingArtifacts) {
      issues.push(`Missing RALPH artifact: ${path.relative(repoRoot, artifactPath)}`);
    }

    if (!stageRecord) {
      issues.push(`Missing RALPH state record for stage '${stage.key}'.`);
      continue;
    }

    if (stageRecord.status !== 'passed') {
      issues.push(`Stage '${stage.key}' did not pass. Current status: ${stageRecord.status || 'unknown'}.`);
    }

    if (!stageRecord.completedAt) {
      issues.push(`Missing completion timestamp for stage '${stage.key}'.`);
    } else {
      const completedAt = new Date(stageRecord.completedAt).getTime();

      if (Number.isNaN(completedAt)) {
        issues.push(`Invalid completion timestamp for stage '${stage.key}'.`);
      } else if (previousCompletedAt !== null && completedAt < previousCompletedAt) {
        issues.push(`Stage '${stage.key}' was completed out of RALPH order.`);
      } else {
        previousCompletedAt = completedAt;
      }
    }

    const failedChecks = (stageRecord.checks || []).filter((check) => check.status !== 'pass');

    for (const check of failedChecks) {
      issues.push(`Failed check in '${stage.key}': ${check.name}`);
    }

    for (const artifactPath of artifactPaths.filter((candidatePath) => fs.existsSync(candidatePath))) {
      const artifactName = path.basename(artifactPath);
      const recordedHash = stageRecord.artifactHashes?.[artifactName]
        || (artifactPath === path.join(outputDir, stage.artifacts[0]) ? stageRecord.sha256 : null);
      const actualHash = sha256File(artifactPath);

      if (recordedHash && recordedHash !== actualHash) {
        issues.push(`Artifact hash mismatch for ${path.relative(repoRoot, artifactPath)}.`);
      }
    }
  }

  const polishDecisionPath = path.join(outputDir, 'polish_decision.json');
  const polishedPackagePath = path.join(outputDir, 'polished_package.json');
  const healthCheckPath = path.join(outputDir, 'article_health_check.md');

  if (!fs.existsSync(polishDecisionPath)) {
    issues.push(`Missing polish decision artifact: ${path.relative(repoRoot, polishDecisionPath)}`);
  } else {
    const polishDecision = JSON.parse(fs.readFileSync(polishDecisionPath, 'utf8'));

    if (polishDecision.reviewApproved !== true) {
      issues.push(`Polish decision is not review-approved in ${path.relative(repoRoot, polishDecisionPath)}.`);
    }
  }

  if (!fs.existsSync(polishedPackagePath)) {
    issues.push(`Missing polished package artifact: ${path.relative(repoRoot, polishedPackagePath)}`);
  }

  if (!fs.existsSync(healthCheckPath)) {
    issues.push(`Missing health check artifact: ${path.relative(repoRoot, healthCheckPath)}`);
  }

  if (!fs.existsSync(statePath) || path.basename(statePath) !== STATE_FILE_NAME) {
    issues.push(`Missing canonical resume state: ${path.relative(repoRoot, path.join(outputDir, STATE_FILE_NAME))}`);
  }

  if (!fs.existsSync(summaryPath)) {
    issues.push(`Missing workflow summary: ${path.relative(repoRoot, summaryPath)}`);
  } else {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    if (!Array.isArray(summary.ralphStagesCompleted)) {
      issues.push(`Missing ralphStagesCompleted in ${path.relative(repoRoot, summaryPath)}.`);
    }

    if (typeof summary.reviewIterationsUsed !== 'number') {
      issues.push(`Missing reviewIterationsUsed in ${path.relative(repoRoot, summaryPath)}.`);
    }

    if (summary.polishCompleted !== true) {
      issues.push(`workflow_summary.json does not mark polishCompleted true.`);
    }

    if (summary.healthCheckPassed !== true) {
      issues.push(`workflow_summary.json does not mark healthCheckPassed true.`);
    }

    if (!summary.finalOutputPaths || typeof summary.finalOutputPaths !== 'object') {
      issues.push(`Missing finalOutputPaths in ${path.relative(repoRoot, summaryPath)}.`);
    }
  }

  if (state.nextStage !== null) {
    issues.push(`RALPH loop is not complete. Next stage: ${state.nextStage || 'unknown'}.`);
  }

  return issues;
}

function main() {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const targetArg = process.argv[2];
  const targets = resolveTargets(repoRoot, targetArg);
  const issues = [];

  if (targets.length === 0) {
    console.log('No RALPH article/post packages found.');
    process.exit(0);
  }

  for (const statePath of targets) {
    issues.push(...validateStateFile(repoRoot, statePath));
  }

  console.log(`Audited RALPH article/post states: ${targets.length}`);

  if (issues.length === 0) {
    console.log('RALPH article/post validation passed.');
    process.exit(0);
  }

  console.log('RALPH article/post validation found issues:');
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }

  process.exit(1);
}

if (require.main === module) {
  main();
}
