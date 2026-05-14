'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { slugify } = require('./title_log_utils');

const STATE_VERSION = 1;
const WORKFLOW_MODE = 'ralph';
const WORKFLOW_NAME = 'ralph-article-post-loop';
const STATE_FILE_NAME = 'workflow_state.json';
const LEGACY_STATE_FILE_NAME = 'ralph_article_state.json';
const SUMMARY_FILE_NAME = 'workflow_summary.json';
const MAX_REVIEW_ITERATIONS = 3;

const STAGES = [
  {
    key: 'research_requirements',
    short: 'R',
    label: 'Research/Requirements',
    artifacts: ['article_requirements.md'],
    minBytes: 200
  },
  {
    key: 'article_draft',
    short: 'A',
    label: 'Article/Post Draft',
    artifacts: ['article_draft.md'],
    minBytes: 1200
  },
  {
    key: 'loop_review',
    short: 'L',
    label: 'Loop Review/Refine',
    artifacts: ['article_review_notes.md'],
    minBytes: 500
  },
  {
    key: 'polish',
    short: 'P',
    label: 'Polish',
    artifacts: ['article_polished.md', 'polish_decision.json', 'polished_package.json'],
    minBytes: 1200
  },
  {
    key: 'health_check',
    short: 'H',
    label: 'Health Check',
    artifacts: ['article_health_check.md'],
    minBytes: 300
  }
];

const STAGE_BY_KEY = new Map(STAGES.map((stage) => [stage.key, stage]));
const STAGE_BY_SHORT = new Map(STAGES.map((stage) => [stage.short, stage]));
const STAGE_ALIASES = new Map([
  ['requirements', 'research_requirements'],
  ['research', 'research_requirements'],
  ['draft', 'article_draft'],
  ['article_post_draft', 'article_draft'],
  ['post_draft', 'article_draft'],
  ['review', 'loop_review'],
  ['review_refine', 'loop_review'],
  ['refine', 'loop_review'],
  ['health', 'health_check']
]);

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function resolveStage(stageName) {
  const normalized = String(stageName || '').trim();
  const upper = normalized.toUpperCase();
  const lower = normalized.toLowerCase();
  const aliasedKey = STAGE_ALIASES.get(lower) || lower;
  const stage = STAGE_BY_SHORT.get(upper) || STAGE_BY_KEY.get(aliasedKey);

  if (!stage) {
    throw new Error(`Unknown RALPH stage: ${stageName}`);
  }

  return stage;
}

function getArticleOutputDir({ repoRoot, title, slug }) {
  const resolvedSlug = slug || slugify(title);
  return path.join(repoRoot, '_post_suggestion', resolvedSlug);
}

function getStatePath({ repoRoot, title, slug }) {
  return path.join(getArticleOutputDir({ repoRoot, title, slug }), STATE_FILE_NAME);
}

function getLegacyStatePath({ repoRoot, title, slug }) {
  return path.join(getArticleOutputDir({ repoRoot, title, slug }), LEGACY_STATE_FILE_NAME);
}

function getSummaryPath({ repoRoot, title, slug }) {
  return path.join(getArticleOutputDir({ repoRoot, title, slug }), SUMMARY_FILE_NAME);
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function readWorkflowState({ repoRoot, title, slug }) {
  const statePath = getStatePath({ repoRoot, title, slug });
  const legacyStatePath = getLegacyStatePath({ repoRoot, title, slug });

  return readState(statePath) || readState(legacyStatePath);
}

function writeState(statePath, state) {
  const stateDir = path.dirname(statePath);

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function getNextStageKey(stageKey) {
  const index = STAGES.findIndex((stage) => stage.key === stageKey);
  const nextStage = STAGES[index + 1];

  return nextStage ? nextStage.key : null;
}

function copyArtifactToCanonicalPath({ artifactInputPath, outputDir, stage }) {
  if (!fs.existsSync(artifactInputPath)) {
    throw new Error(`RALPH artifact input file not found: ${artifactInputPath}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, stage.artifacts[0]);
  if (path.resolve(artifactInputPath) !== path.resolve(outputPath)) {
    fs.copyFileSync(artifactInputPath, outputPath);
  }

  return outputPath;
}

function defaultChecksForStage({ stage, outputPath }) {
  const sizeBytes = fs.statSync(outputPath).size;

  return [
    {
      name: `${stage.label} artifact exists`,
      status: fs.existsSync(outputPath) ? 'pass' : 'fail'
    },
    {
      name: `${stage.label} artifact is substantive`,
      status: sizeBytes >= stage.minBytes ? 'pass' : 'fail',
      details: `Expected at least ${stage.minBytes} bytes; found ${sizeBytes}.`
    }
  ];
}

function normalizeChecks(checks) {
  return checks.map((check) => {
    const status = String(check.status || check.result || '').toLowerCase() === 'pass' ? 'pass' : 'fail';

    return {
      name: String(check.name || 'Unnamed check'),
      status,
      ...(check.details || check.notes ? { details: String(check.details || check.notes) } : {})
    };
  });
}

function listPackageFiles(outputDir) {
  if (!fs.existsSync(outputDir)) {
    return [];
  }

  return fs.readdirSync(outputDir).map((fileName) => path.join(outputDir, fileName));
}

function findFirstExisting(outputDir, fileNames) {
  return fileNames
    .map((fileName) => path.join(outputDir, fileName))
    .find((filePath) => fs.existsSync(filePath)) || null;
}

function writeJsonArtifact(outputPath, payload) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return outputPath;
}

function buildArtifactHashes(artifactPaths) {
  return Object.entries(artifactPaths).reduce((accumulator, [artifactName, artifactPath]) => {
    if (fs.existsSync(artifactPath)) {
      accumulator[artifactName] = sha256File(artifactPath);
    }

    return accumulator;
  }, {});
}

function buildPolishedPackage({ title, slug, outputDir, now, polishedArticlePath, state }) {
  const thumbnailPath = listPackageFiles(outputDir).find((filePath) => filePath.toLowerCase().endsWith('.png')) || null;
  const finalOutputPaths = {
    linkedinPost: findFirstExisting(outputDir, ['linkedin_post.txt']),
    xPost: findFirstExisting(outputDir, ['x_post.txt']),
    prompt: findFirstExisting(outputDir, ['prompt.txt']),
    thumbnail: thumbnailPath,
    articleRequirements: findFirstExisting(outputDir, ['article_requirements.md']),
    articleDraft: findFirstExisting(outputDir, ['article_draft.md']),
    reviewNotes: findFirstExisting(outputDir, ['article_review_notes.md']),
    polishedArticle: polishedArticlePath,
    healthCheck: findFirstExisting(outputDir, ['article_health_check.md']),
    workflowState: path.join(outputDir, STATE_FILE_NAME),
    workflowSummary: path.join(outputDir, SUMMARY_FILE_NAME)
  };

  return {
    version: STATE_VERSION,
    workflow: WORKFLOW_NAME,
    workflowMode: WORKFLOW_MODE,
    title,
    slug,
    polishedAt: now,
    reviewIterationsUsed: state?.reviewIterationsUsed || 0,
    finalOutputPaths
  };
}

function writePolishArtifacts({ title, slug, outputDir, now, polishedArticlePath, state }) {
  const polishDecisionPath = path.join(outputDir, 'polish_decision.json');
  const polishedPackagePath = path.join(outputDir, 'polished_package.json');
  const reviewArtifactPath = findFirstExisting(outputDir, ['article_review_notes.md']);
  const reviewStage = state?.stages?.loop_review;
  const reviewApproved = reviewStage?.status === 'passed';

  writeJsonArtifact(polishDecisionPath, {
    version: STATE_VERSION,
    workflow: WORKFLOW_NAME,
    workflowMode: WORKFLOW_MODE,
    title,
    slug,
    stage: 'P',
    decision: reviewApproved ? 'approved_for_health_check' : 'polish_recorded_without_review_approval',
    reviewApproved,
    reviewIterationsUsed: state?.reviewIterationsUsed || 0,
    maxReviewIterations: MAX_REVIEW_ITERATIONS,
    reviewArtifactPath,
    polishedArticlePath,
    decidedAt: now
  });

  writeJsonArtifact(
    polishedPackagePath,
    buildPolishedPackage({ title, slug, outputDir, now, polishedArticlePath, state })
  );

  return {
    'polish_decision.json': polishDecisionPath,
    'polished_package.json': polishedPackagePath
  };
}

function collectArtifactPaths(state, outputDir) {
  const stageArtifactPaths = STAGES.reduce((accumulator, stage) => {
    for (const artifactName of stage.artifacts) {
      const artifactPath = path.join(outputDir, artifactName);

      if (fs.existsSync(artifactPath)) {
        accumulator[artifactName] = artifactPath;
      }
    }

    return accumulator;
  }, {});

  return {
    ...(state?.artifactPaths || {}),
    ...stageArtifactPaths,
    [STATE_FILE_NAME]: path.join(outputDir, STATE_FILE_NAME),
    [SUMMARY_FILE_NAME]: path.join(outputDir, SUMMARY_FILE_NAME)
  };
}

function buildWorkflowSummary({ state, outputDir }) {
  const finalOutputPaths = {
    linkedinPost: findFirstExisting(outputDir, ['linkedin_post.txt']),
    xPost: findFirstExisting(outputDir, ['x_post.txt']),
    prompt: findFirstExisting(outputDir, ['prompt.txt']),
    thumbnail: listPackageFiles(outputDir).find((filePath) => filePath.toLowerCase().endsWith('.png')) || null,
    articleRequirements: findFirstExisting(outputDir, ['article_requirements.md']),
    articleDraft: findFirstExisting(outputDir, ['article_draft.md']),
    reviewNotes: findFirstExisting(outputDir, ['article_review_notes.md']),
    polishDecision: findFirstExisting(outputDir, ['polish_decision.json']),
    polishedPackage: findFirstExisting(outputDir, ['polished_package.json']),
    polishedArticle: findFirstExisting(outputDir, ['article_polished.md']),
    healthCheck: findFirstExisting(outputDir, ['article_health_check.md']),
    workflowState: path.join(outputDir, STATE_FILE_NAME),
    workflowSummary: path.join(outputDir, SUMMARY_FILE_NAME)
  };

  return {
    version: STATE_VERSION,
    workflow: WORKFLOW_NAME,
    workflowMode: WORKFLOW_MODE,
    title: state.title,
    slug: state.slug,
    lastUpdatedAt: state.lastUpdatedAt,
    currentStage: state.currentStage,
    nextStage: state.nextStage,
    ralphStagesCompleted: state.completedStages,
    reviewIterationsUsed: state.reviewIterationsUsed || 0,
    polishCompleted: state.stages?.polish?.status === 'passed' && Boolean(finalOutputPaths.polishDecision && finalOutputPaths.polishedPackage),
    healthCheckPassed: state.stages?.health_check?.status === 'passed',
    finalOutputPaths
  };
}

function writeWorkflowSummary({ state, outputDir }) {
  const summaryPath = path.join(outputDir, SUMMARY_FILE_NAME);
  writeJsonArtifact(summaryPath, buildWorkflowSummary({ state, outputDir }));
  return summaryPath;
}

function recordStage({
  title,
  stageName,
  artifactInputPath,
  checks = null,
  repoRoot = path.resolve(__dirname, '../../../..')
}) {
  const stage = resolveStage(stageName);
  const slug = slugify(title);
  const outputDir = getArticleOutputDir({ repoRoot, slug });
  const statePath = getStatePath({ repoRoot, slug });
  const existingState = readWorkflowState({ repoRoot, slug });
  if (stage.key === 'loop_review' && (existingState?.reviewIterationsUsed || 0) >= MAX_REVIEW_ITERATIONS) {
    throw new Error(`RALPH review/refine iteration limit exceeded. Maximum allowed: ${MAX_REVIEW_ITERATIONS}.`);
  }

  if (stage.key === 'polish' && existingState?.stages?.loop_review?.status !== 'passed') {
    throw new Error('RALPH polish cannot run until the Loop Review/Refine stage has passed.');
  }

  const now = new Date().toISOString();
  const outputPath = copyArtifactToCanonicalPath({ artifactInputPath, outputDir, stage });
  const extraArtifactPaths = stage.key === 'polish'
    ? writePolishArtifacts({ title, slug, outputDir, now, polishedArticlePath: outputPath, state: existingState })
    : {};
  const defaultChecks = defaultChecksForStage({ stage, outputPath });
  const normalizedChecks = normalizeChecks(checks ? [...defaultChecks, ...checks] : defaultChecks);
  const status = normalizedChecks.every((check) => check.status === 'pass') ? 'passed' : 'failed';
  const nextStage = status === 'passed' ? getNextStageKey(stage.key) : stage.key;
  const priorCompletedStages = Array.isArray(existingState?.completedStages)
    ? existingState.completedStages
    : Object.entries(existingState?.stages || {})
      .filter(([, stageRecord]) => stageRecord.status === 'passed')
      .map(([stageKey]) => stageKey);
  const completedStages = status === 'passed'
    ? STAGES
      .map((candidate) => candidate.key)
      .filter((stageKey) => stageKey === stage.key || priorCompletedStages.includes(stageKey))
    : priorCompletedStages;
  const reviewIterationsUsed = stage.key === 'loop_review'
    ? (existingState?.reviewIterationsUsed || 0) + 1
    : (existingState?.reviewIterationsUsed || 0);
  const stageArtifactPaths = {
    [stage.artifacts[0]]: outputPath,
    ...extraArtifactPaths
  };
  const nextState = {
    version: STATE_VERSION,
    workflow: WORKFLOW_NAME,
    workflowMode: WORKFLOW_MODE,
    title,
    slug,
    createdAt: existingState?.createdAt || now,
    lastUpdatedAt: now,
    updatedAt: now,
    currentStage: stage.key,
    completedStages,
    nextStage,
    reviewIterationsUsed,
    maxReviewIterations: MAX_REVIEW_ITERATIONS,
    artifactPaths: {
      ...(existingState?.artifactPaths || {}),
      ...stageArtifactPaths
    },
    stages: {
      ...(existingState?.stages || {}),
      [stage.key]: {
        status,
        label: stage.label,
        artifacts: stage.artifacts,
        artifactPath: outputPath,
        artifactPaths: stageArtifactPaths,
        artifactHashes: buildArtifactHashes(stageArtifactPaths),
        sha256: sha256File(outputPath),
        checks: normalizedChecks,
        completedAt: now
      }
    }
  };

  nextState.artifactPaths = collectArtifactPaths(nextState, outputDir);
  writeState(statePath, nextState);
  const summaryPath = writeWorkflowSummary({ state: nextState, outputDir });

  return {
    slug,
    outputDir,
    outputPath,
    statePath,
    summaryPath,
    stage: stage.key,
    status,
    nextStage
  };
}

module.exports = {
  LEGACY_STATE_FILE_NAME,
  MAX_REVIEW_ITERATIONS,
  STATE_FILE_NAME,
  SUMMARY_FILE_NAME,
  STAGES,
  WORKFLOW_MODE,
  WORKFLOW_NAME,
  getArticleOutputDir,
  getLegacyStatePath,
  getNextStageKey,
  getSummaryPath,
  getStatePath,
  readWorkflowState,
  readState,
  recordStage,
  resolveStage,
  sha256File
};
