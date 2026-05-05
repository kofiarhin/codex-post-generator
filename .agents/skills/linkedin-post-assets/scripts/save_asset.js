'use strict';

const fs = require('fs');
const path = require('path');
const { slugify } = require('../../linkedin-post-orchestrator/scripts/title_log_utils');
const { sha256File, upsertStageReceipt } = require('../../linkedin-post-orchestrator/scripts/workflow_receipts');

const OVERLAY_SECTION_PATTERN = /(?:^|\n)(?:optional\s+)?text\s+overlay\s*:\s*([\s\S]*)$/i;
const OVERLAY_DIRECTIVE_PATTERN = /^(?:placement|position|style)\s*:/i;
const THUMBNAIL_QUALITY_DIRECTIVES = [
  'Quality requirements: create a 16:9 LinkedIn thumbnail with premium editorial production value, 2K-ready detail, sharp focus, cinematic but believable lighting, physically plausible shadows, realistic materials, clean depth of field, crisp edges, and no low-resolution artifacts. Compose it like a professional technology magazine cover: one dominant focal scene, large readable shapes, strong foreground-midground-background separation, and enough centered negative space for the overlay. If screens or UI panels appear, make them large, clean, and plausible with only short readable labels; avoid tiny text, malformed code, random glyphs, crowded dashboards, and decorative clutter. Use a subtle dark translucent center band behind the overlay only when needed for contrast, with bold white sans-serif text that is perfectly legible and not cropped.'
].join('\n');
const OVERLAY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'because',
  'but',
  'by',
  'for',
  'from',
  'how',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'so',
  'than',
  'that',
  'the',
  'their',
  'there',
  'they',
  'this',
  'to',
  'until',
  'vs',
  'when',
  'with'
]);

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripWrappingQuotes(value) {
  return value.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
}

function countWords(value) {
  return normalizeWhitespace(value).split(' ').filter(Boolean).length;
}

function sanitizeOverlayLine(value) {
  return stripWrappingQuotes(value.replace(/^[-*]\s*/, '').trim());
}

function extractExistingOverlay(content) {
  const overlayMatch = content.match(OVERLAY_SECTION_PATTERN);

  if (!overlayMatch) {
    return '';
  }

  const overlayLines = overlayMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !OVERLAY_DIRECTIVE_PATTERN.test(line))
    .map((line) => sanitizeOverlayLine(line));

  if (overlayLines.length === 1) {
    return overlayLines[0];
  }

  const collapsedOverlay = normalizeWhitespace(overlayLines.join(' '));
  if (overlayLines.length > 1 && countWords(collapsedOverlay) <= 8) {
    return collapsedOverlay;
  }

  return '';
}

function removeOverlaySection(content) {
  return content.replace(/\n?(?:optional\s+)?text\s+overlay\s*:[\s\S]*$/i, '').trim();
}

function splitTitleCandidates(title) {
  return title
    .split(/\s(?:until|when|because|but|vs)\s|\s[-–—]\s|[:|]/i)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean);
}

function removeFillerWords(title) {
  return title
    .split(' ')
    .filter(Boolean)
    .filter((word) => !OVERLAY_STOP_WORDS.has(word.toLowerCase()))
    .join(' ')
    .trim();
}

function deriveOverlayText(title) {
  const cleanedTitle = normalizeWhitespace(title.replace(/[^\w\s:|\-–—]/g, ' '));
  const titleCandidates = splitTitleCandidates(cleanedTitle);
  const conciseSegment = titleCandidates.find((segment) => {
    const wordCount = countWords(segment);
    return wordCount >= 3 && wordCount <= 8;
  });

  if (conciseSegment) {
    return conciseSegment;
  }

  if (countWords(cleanedTitle) <= 8) {
    return cleanedTitle;
  }

  const filteredTitle = normalizeWhitespace(removeFillerWords(cleanedTitle));
  if (filteredTitle && countWords(filteredTitle) <= 8) {
    return filteredTitle;
  }

  if (filteredTitle) {
    return filteredTitle.split(' ').slice(0, 8).join(' ');
  }

  return cleanedTitle.split(' ').slice(0, 8).join(' ');
}

function buildPromptWithOverlay(content, title) {
  const mainPrompt = appendQualityDirectives(removeOverlaySection(content));
  const overlayText = extractExistingOverlay(content) || deriveOverlayText(title);

  return [
    mainPrompt,
    'Text overlay:',
    `"${overlayText}"`,
    'Placement: centered in the middle of the thumbnail',
    'Style: bold clean sans-serif, high contrast, one line if possible'
  ].join('\n\n');
}

function appendQualityDirectives(mainPrompt) {
  if (/quality requirements:/i.test(mainPrompt)) {
    return mainPrompt;
  }

  return [mainPrompt, THUMBNAIL_QUALITY_DIRECTIVES].join('\n\n');
}

function saveAssetPrompt({
  title,
  inputPath,
  repoRoot = path.resolve(__dirname, '../../../..')
}) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const slug = slugify(title);
  const outputDir = path.join(repoRoot, '_post_suggestion', slug);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'prompt.txt');
  const content = fs.readFileSync(inputPath, 'utf8');
  const normalizedPrompt = buildPromptWithOverlay(content, title);

  fs.writeFileSync(outputPath, normalizedPrompt, 'utf8');

  const assetReceipt = upsertStageReceipt({
    repoRoot,
    title,
    slug,
    stage: 'asset',
    source: 'save_asset.js',
    payload: {
      promptOutputPath: outputPath,
      promptSha256: sha256File(outputPath)
    }
  });

  return {
    slug,
    outputDir,
    outputPath,
    normalizedPrompt,
    receiptPath: assetReceipt.receiptPath
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node save_asset.js "<Post Title>" "<input-prompt-path>"');
    process.exit(1);
  }

  const title = args[0];
  const inputPath = path.resolve(args[1]);

  try {
    const result = saveAssetPrompt({ title, inputPath });
    console.log(`Prompt saved to: _post_suggestion/${result.slug}/prompt.txt`);
    console.log(`Full path: ${result.outputPath}`);
    console.log(`Workflow receipt updated: ${result.receiptPath}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  appendQualityDirectives,
  buildPromptWithOverlay,
  deriveOverlayText,
  saveAssetPrompt
};
