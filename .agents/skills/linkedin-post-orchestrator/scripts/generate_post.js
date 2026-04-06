'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { finalizePostPackage } = require('./finalize_post_package');
const { findDuplicateTitle, readLogEntries, slugify } = require('./title_log_utils');

const MIN_TOPIC_COUNT = 4;
const MAX_REVIEW_ITERATIONS = 3;

function usageAndExit() {
  console.error(
    [
      'Usage:',
      '  Legacy mode:',
      '    node generate_post.js "<Post Title>" "<linkedin-input-path>" "<x-input-path>" "<prompt-input-path>" ["<primary-keyword>"] ["<topic-angle>"]',
      '  Multi-agent spec mode:',
      '    node generate_post.js --pipeline "<pipeline-input.json>"'
    ].join('\n')
  );
  process.exit(1);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function words(value) {
  return normalizeSpaces(value)
    .split(' ')
    .filter(Boolean);
}

function countHashtags(value) {
  return (String(value || '').match(/#[A-Za-z0-9_]+/g) || []).length;
}

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value;
}

function scoreTopic(topic, profile) {
  const conversationWeight = profile === 'engagement' ? 1.4 : 1;
  const seoWeight = profile === 'seo' ? 1.5 : 1;
  const conversionWeight = profile === 'conversion' ? 1.6 : 1;

  return (
    (Number(topic.signals?.relevance || 0) * 1.2 +
      Number(topic.signals?.pain || 0) * conversionWeight +
      Number(topic.signals?.freshness || 0) * 1.1 +
      Number(topic.signals?.seo || 0) * seoWeight +
      Number(topic.signals?.conversation || 0) * conversationWeight) /
    6
  );
}

function runResearchStage(input) {
  const candidateTopics = ensureArray(input.candidateTopics, 'candidateTopics');

  if (candidateTopics.length < MIN_TOPIC_COUNT || candidateTopics.length > 5) {
    throw new Error('candidateTopics must contain 4 to 5 topics.');
  }

  const agents = [
    { id: 'researcher_1', profile: 'conversion' },
    { id: 'researcher_2', profile: 'engagement' },
    { id: 'researcher_3', profile: 'seo' }
  ].map((agent) => {
    const rankedTopics = candidateTopics
      .map((topic) => ({
        title: topic.title,
        score: Number(scoreTopic(topic, agent.profile).toFixed(4)),
        whyTrendingNow: topic.whyTrendingNow,
        summary: topic.summary,
        primaryKeyword: topic.primaryKeyword,
        secondaryKeywords: topic.secondaryKeywords,
        linkedInHashtags: topic.linkedInHashtags,
        xHashtags: topic.xHashtags
      }))
      .sort((left, right) => right.score - left.score);

    return {
      agentId: agent.id,
      profile: agent.profile,
      rankedTopics
    };
  });

  const consensus = candidateTopics
    .map((topic) => {
      const averageScore =
        agents.reduce((sum, agent) => {
          const rank = agent.rankedTopics.find((entry) => entry.title === topic.title);
          return sum + (rank?.score || 0);
        }, 0) / agents.length;

      return {
        ...topic,
        consensusScore: Number(averageScore.toFixed(4))
      };
    })
    .sort((left, right) => right.consensusScore - left.consensusScore);

  return { agents, consensus };
}

function runSelectionStage(researchBrief, repoRoot) {
  const logPath = path.join(repoRoot, 'log.txt');
  const logEntries = readLogEntries(logPath);
  const selectorAgents = [
    { id: 'selector_1', emphasis: 'conversion' },
    { id: 'selector_2', emphasis: 'seo' },
    { id: 'selector_3', emphasis: 'engagement' }
  ];

  const votes = selectorAgents.map((agent) => {
    const ranked = researchBrief.consensus
      .map((topic) => ({
        topic,
        score:
          topic.consensusScore +
          (agent.emphasis === 'conversion' ? Number(topic.signals?.pain || 0) * 0.03 : 0) +
          (agent.emphasis === 'seo' ? Number(topic.signals?.seo || 0) * 0.03 : 0) +
          (agent.emphasis === 'engagement' ? Number(topic.signals?.conversation || 0) * 0.03 : 0)
      }))
      .sort((left, right) => right.score - left.score);

    const firstNonDuplicate = ranked.find((entry) => !findDuplicateTitle(entry.topic.title, logEntries));

    if (!firstNonDuplicate) {
      throw new Error('All candidate topics are duplicates or near-duplicates of log.txt entries.');
    }

    return {
      agentId: agent.id,
      emphasis: agent.emphasis,
      selectedTitle: firstNonDuplicate.topic.title,
      score: Number(firstNonDuplicate.score.toFixed(4)),
      duplicateCheck: 'clear'
    };
  });

  const tally = votes.reduce((accumulator, vote) => {
    accumulator[vote.selectedTitle] = (accumulator[vote.selectedTitle] || 0) + 1;
    return accumulator;
  }, {});

  const selectedTitle = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  const selectedTopic = researchBrief.consensus.find((topic) => topic.title === selectedTitle);
  const duplicateMatch = findDuplicateTitle(selectedTopic.title, logEntries);

  if (duplicateMatch) {
    throw new Error(`Selection failed duplicate check: ${selectedTopic.title}`);
  }

  return {
    votes,
    selectedTopic,
    rationale: {
      selectedBecause: 'Highest cross-agent vote with strongest aggregate conversion, SEO, and conversation signal.',
      duplicateReasoning: 'Cleared duplicate and near-duplicate checks against log.txt during selection stage.'
    }
  };
}

function buildLinkedInDraft(topic, variantIndex) {
  const hooks = [
    `${topic.primaryKeyword} hype is loud, but the debugging bill is louder.`,
    `${topic.primaryKeyword} is finally useful when it saves engineering time, not slides.`,
    `${topic.primaryKeyword} stopped feeling like marketing the moment it fixed one brutal production loop.`
  ];

  const body = [
    `${hooks[variantIndex]}`,
    '',
    `Most teams don't struggle with ideas; they struggle with friction. The real pain is context switching, flaky release flow, and slow incident feedback loops.`,
    `That's why this trend is resonating: it improves ${topic.secondaryKeywords[0]} and ${topic.secondaryKeywords[1]} without pretending judgment can be automated.`,
    `I've seen stronger adoption when teams tie it to ${topic.secondaryKeywords[2]} and define clear guardrails before rollout. Less theater, more shipping.`,
    '',
    `Where are you seeing the biggest win right now: speed, reliability, or fewer production surprises?`,
    '',
    topic.linkedInHashtags.join(' ')
  ];

  return body.join('\n');
}

function buildXDraft(topic, variantIndex) {
  const openers = [
    `${topic.primaryKeyword} is useful for one reason: less engineering drag.`,
    `${topic.primaryKeyword} only matters if it cuts real dev pain.`,
    `${topic.primaryKeyword} got real the minute it reduced on-call chaos.`
  ];

  const lines = [
    openers[variantIndex],
    `It helps with ${topic.secondaryKeywords[0]}, not engineering judgment.`,
    `Less context-switching, faster ${topic.secondaryKeywords[1]}, fewer avoidable fire drills.`,
    topic.xHashtags.join(' ')
  ];

  return lines.join('\n');
}

function buildPromptDraft(topic, title) {
  return [
    `A senior software engineer stands at a clean whiteboard split between stable deployment charts and noisy incident alerts, modern product studio background, single focal subject, waist-up composition, cinematic soft key light with cool shadows, muted slate and graphite palette with one electric cyan accent, polished editorial digital illustration, professional and credible mood with subtle wit, designed for a LinkedIn social thumbnail, no logos, no watermarks, no clutter, no distorted hands, no unreadable interface text.`,
    '',
    'Text overlay:',
    `"${title}"`,
    'Placement: centered in the middle of the thumbnail',
    'Style: bold clean sans-serif, high contrast, one line if possible'
  ].join('\n');
}

function runWritingStage(selectionDecision) {
  const topic = selectionDecision.selectedTopic;
  const postTitle = topic.title;

  const agentDrafts = [0, 1, 2].map((index) => ({
    agentId: `writer_${index + 1}`,
    postTitle,
    linkedinPost: buildLinkedInDraft(topic, index),
    xPost: buildXDraft(topic, index),
    prompt: buildPromptDraft(topic, postTitle)
  }));

  return {
    agentDrafts,
    selectedDraft: agentDrafts[0]
  };
}

function evaluateDraft(draft, topic) {
  const linkedinWordCount = words(draft.linkedinPost).length;
  const xWordCount = words(draft.xPost).length;
  const linkedinHashtagCount = countHashtags(draft.linkedinPost);
  const xHashtagCount = countHashtags(draft.xPost);
  const lowerLinkedin = draft.linkedinPost.toLowerCase();
  const lowerX = draft.xPost.toLowerCase();

  const checks = [
    {
      key: 'linkedin_length',
      ok: linkedinWordCount >= 150 && linkedinWordCount <= 300,
      details: `LinkedIn word count ${linkedinWordCount} (required 150-300).`
    },
    {
      key: 'linkedin_primary_keyword_early',
      ok: lowerLinkedin.slice(0, 220).includes(topic.primaryKeyword.toLowerCase()),
      details: 'Primary keyword appears in first LinkedIn paragraph window.'
    },
    {
      key: 'linkedin_hashtags',
      ok: linkedinHashtagCount >= 5 && linkedinHashtagCount <= 7,
      details: `LinkedIn hashtags ${linkedinHashtagCount} (required 5-7).`
    },
    {
      key: 'x_primary_keyword_early',
      ok: lowerX.slice(0, 120).includes(topic.primaryKeyword.toLowerCase()),
      details: 'Primary keyword appears early in X post.'
    },
    {
      key: 'x_hashtags',
      ok: xHashtagCount >= 2 && xHashtagCount <= 4,
      details: `X hashtags ${xHashtagCount} (required 2-4).`
    },
    {
      key: 'tone_anchor',
      ok: /debug|incident|ship|shipping|on-call|production/i.test(draft.linkedinPost + ' ' + draft.xPost),
      details: 'Draft references real engineering pain details.'
    }
  ];

  const passCount = checks.filter((entry) => entry.ok).length;

  return {
    checks,
    score: Number((passCount / checks.length).toFixed(4)),
    approved: passCount === checks.length
  };
}

function reviseDraft(draft, topic, review) {
  let linkedinPost = draft.linkedinPost;
  let xPost = draft.xPost;

  const failed = review.checks.filter((check) => !check.ok).map((check) => check.key);

  if (failed.includes('linkedin_length')) {
    linkedinPost = `${linkedinPost}\n\nEngineering teams usually discover the same truth: strong tools only matter when they reduce repeat toil in CI/CD pipelines, incident response, and release operations.`;
  }

  if (failed.includes('linkedin_hashtags')) {
    linkedinPost = linkedinPost.replace(/(#[A-Za-z0-9_]+\s*)+$/g, '').trim();
    linkedinPost = `${linkedinPost}\n\n${topic.linkedInHashtags.slice(0, 6).join(' ')}`;
  }

  if (failed.includes('x_hashtags')) {
    xPost = xPost.replace(/(#[A-Za-z0-9_]+\s*)+$/g, '').trim();
    xPost = `${xPost}\n${topic.xHashtags.slice(0, 3).join(' ')}`;
  }

  if (failed.includes('x_primary_keyword_early') && !xPost.toLowerCase().startsWith(topic.primaryKeyword.toLowerCase())) {
    xPost = `${topic.primaryKeyword}: ${xPost}`;
  }

  return {
    ...draft,
    linkedinPost,
    xPost
  };
}

function runReviewAndRevisionLoop(initialDraft, topic, traceDir) {
  let currentDraft = initialDraft;
  let approved = false;
  const reviewDecisions = [];
  const draftSnapshots = [];

  for (let iteration = 1; iteration <= MAX_REVIEW_ITERATIONS; iteration += 1) {
    if (approved) {
      const carryForwardReview = {
        iteration,
        approved: true,
        averageScore: 1,
        reason: 'Skipped: already approved in earlier iteration.',
        reviewers: [
          { reviewerId: 'reviewer_1', approved: true, score: 1, checks: [] },
          { reviewerId: 'reviewer_2', approved: true, score: 1, checks: [] },
          { reviewerId: 'reviewer_3', approved: true, score: 1, checks: [] }
        ]
      };
      const carryForwardDraft = {
        version: iteration,
        postTitle: currentDraft.postTitle,
        linkedinPost: currentDraft.linkedinPost,
        xPost: currentDraft.xPost,
        prompt: currentDraft.prompt,
        carryForward: true
      };

      writeJson(path.join(traceDir, `review_decision_v${iteration}.json`), carryForwardReview);
      writeJson(path.join(traceDir, `draft_package_v${iteration}.json`), carryForwardDraft);
      reviewDecisions.push(carryForwardReview);
      draftSnapshots.push(carryForwardDraft);
      continue;
    }

    const reviewers = [1, 2, 3].map((index) => {
      const review = evaluateDraft(currentDraft, topic);
      return {
        reviewerId: `reviewer_${index}`,
        approved: review.approved,
        score: review.score,
        checks: review.checks
      };
    });

    const averageScore = reviewers.reduce((sum, reviewer) => sum + reviewer.score, 0) / reviewers.length;
    const allApproved = reviewers.every((reviewer) => reviewer.approved);
    const orchestratorDecision = {
      iteration,
      approved: allApproved,
      averageScore: Number(averageScore.toFixed(4)),
      reason: allApproved
        ? 'All review agents approved the draft.'
        : 'One or more checks failed; draft will be revised and re-reviewed.',
      reviewers
    };

    writeJson(path.join(traceDir, `review_decision_v${iteration}.json`), orchestratorDecision);
    reviewDecisions.push(orchestratorDecision);

    const draftPackage = {
      version: iteration,
      postTitle: currentDraft.postTitle,
      linkedinPost: currentDraft.linkedinPost,
      xPost: currentDraft.xPost,
      prompt: currentDraft.prompt
    };

    writeJson(path.join(traceDir, `draft_package_v${iteration}.json`), draftPackage);
    draftSnapshots.push(draftPackage);

    if (allApproved) {
      approved = true;
      continue;
    }

    currentDraft = reviseDraft(currentDraft, topic, reviewers[0]);
  }

  return {
    approved,
    finalDraft: currentDraft,
    reviewDecisions,
    draftSnapshots
  };
}

function persistTraceArtifacts(outputDir, artifacts) {
  writeJson(path.join(outputDir, 'research_brief.json'), artifacts.researchBrief);
  writeJson(path.join(outputDir, 'selection_decision.json'), artifacts.selectionDecision);
  writeJson(path.join(outputDir, 'workflow_summary.json'), artifacts.workflowSummary);
}

function runPipelineMode(pipelineInputPath) {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const inputPath = path.resolve(pipelineInputPath);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Pipeline input file not found: ${inputPath}`);
  }

  const pipelineInput = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const researchBrief = runResearchStage(pipelineInput);
  const selectionDecision = runSelectionStage(researchBrief, repoRoot);
  const writingOutput = runWritingStage(selectionDecision);

  const title = selectionDecision.selectedTopic.title;
  const slug = slugify(title);
  const outputDir = path.join(repoRoot, '_post_suggestion', slug);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  writeJson(path.join(outputDir, 'research_brief.json'), researchBrief);
  writeJson(path.join(outputDir, 'selection_decision.json'), selectionDecision);

  const reviewResult = runReviewAndRevisionLoop(writingOutput.selectedDraft, selectionDecision.selectedTopic, outputDir);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-pipeline-'));
  const linkedinInputPath = path.join(tempDir, 'linkedin_post.txt');
  const xInputPath = path.join(tempDir, 'x_post.txt');
  const promptInputPath = path.join(tempDir, 'prompt.txt');

  fs.writeFileSync(linkedinInputPath, reviewResult.finalDraft.linkedinPost, 'utf8');
  fs.writeFileSync(xInputPath, reviewResult.finalDraft.xPost, 'utf8');
  fs.writeFileSync(promptInputPath, reviewResult.finalDraft.prompt, 'utf8');

  const finalDuplicateMatch = findDuplicateTitle(title, readLogEntries(path.join(repoRoot, 'log.txt')));
  if (finalDuplicateMatch) {
    throw new Error(`Final duplicate check failed for title: ${title}`);
  }

  const finalizeResult = finalizePostPackage({
    title,
    linkedinInputPath,
    xInputPath,
    promptInputPath,
    primaryKeyword: selectionDecision.selectedTopic.primaryKeyword,
    topicAngle: selectionDecision.selectedTopic.topicAngle || 'multi-agent-editorial-pipeline'
  });

  const workflowSummary = {
    objective: 'Multi-agent editorial pipeline execution',
    approvedBeforeMaxIterations: reviewResult.approved,
    reviewIterationsUsed: reviewResult.reviewDecisions.length,
    maxReviewIterations: MAX_REVIEW_ITERATIONS,
    selectedTopic: title,
    primaryKeyword: selectionDecision.selectedTopic.primaryKeyword,
    output: {
      linkedin: `_post_suggestion/${finalizeResult.slug}/linkedin_post.txt`,
      x: `_post_suggestion/${finalizeResult.slug}/x_post.txt`,
      prompt: `_post_suggestion/${finalizeResult.slug}/prompt.txt`
    },
    traceArtifacts: [
      `_post_suggestion/${finalizeResult.slug}/research_brief.json`,
      `_post_suggestion/${finalizeResult.slug}/selection_decision.json`,
      `_post_suggestion/${finalizeResult.slug}/draft_package_v1.json`,
      `_post_suggestion/${finalizeResult.slug}/draft_package_v2.json`,
      `_post_suggestion/${finalizeResult.slug}/draft_package_v3.json`,
      `_post_suggestion/${finalizeResult.slug}/review_decision_v1.json`,
      `_post_suggestion/${finalizeResult.slug}/review_decision_v2.json`,
      `_post_suggestion/${finalizeResult.slug}/review_decision_v3.json`,
      `_post_suggestion/${finalizeResult.slug}/workflow_summary.json`
    ]
  };

  persistTraceArtifacts(outputDir, {
    researchBrief,
    selectionDecision,
    workflowSummary
  });

  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log(`PIPELINE_COMPLETE: ${finalizeResult.slug}`);
  console.log(`TRACE_FILE: _post_suggestion/${finalizeResult.slug}/research_brief.json`);
  console.log(`TRACE_FILE: _post_suggestion/${finalizeResult.slug}/selection_decision.json`);
  console.log(`TRACE_FILE: _post_suggestion/${finalizeResult.slug}/workflow_summary.json`);
  console.log(`LINKEDIN_FILE: _post_suggestion/${finalizeResult.slug}/linkedin_post.txt`);
  console.log(`X_FILE: _post_suggestion/${finalizeResult.slug}/x_post.txt`);
  console.log(`PROMPT_FILE: _post_suggestion/${finalizeResult.slug}/prompt.txt`);
}

function runLegacyMode(args) {
  if (args.length < 4) {
    usageAndExit();
  }

  const [title, linkedinInputArg, xInputArg, promptInputArg, primaryKeyword = '', topicAngle = ''] = args;

  const result = finalizePostPackage({
    title,
    linkedinInputPath: path.resolve(linkedinInputArg),
    xInputPath: path.resolve(xInputArg),
    promptInputPath: path.resolve(promptInputArg),
    primaryKeyword,
    topicAngle
  });

  console.log(`GENERATE_POST_COMPLETE: ${result.slug}`);
  console.log(`PROOF_FILE: _post_suggestion/${result.slug}/workflow_receipts.json`);
  console.log(`LINKEDIN_FILE: _post_suggestion/${result.slug}/linkedin_post.txt`);
  console.log(`X_FILE: _post_suggestion/${result.slug}/x_post.txt`);
  console.log(`PROMPT_FILE: _post_suggestion/${result.slug}/prompt.txt`);
  console.log(`LOG_ENTRY: ${result.loggedLine}`);
}

function main() {
  const args = process.argv.slice(2);

  try {
    if (args[0] === '--pipeline') {
      if (!args[1]) {
        usageAndExit();
      }

      runPipelineMode(args[1]);
      return;
    }

    runLegacyMode(args);
  } catch (error) {
    console.error(`GENERATE_POST_FAILED: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runPipelineMode
};
