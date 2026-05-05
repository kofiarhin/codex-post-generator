'use strict';

const fs = require('fs');
const path = require('path');
const { slugify } = require('../../linkedin-post-orchestrator/scripts/title_log_utils');
const { sha256File, upsertStageReceipt } = require('../../linkedin-post-orchestrator/scripts/workflow_receipts');

const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_IMAGE_SIZE = '2K';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stripWrappingQuotes(value) {
  const trimmed = value.trim();
  const quotePairs = [
    ['"', '"'],
    ["'", "'"]
  ];

  for (const [leftQuote, rightQuote] of quotePairs) {
    if (trimmed.startsWith(leftQuote) && trimmed.endsWith(rightQuote)) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

function parseEnvLine(line) {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith('#')) {
    return null;
  }

  const match = trimmedLine.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: stripWrappingQuotes(match[2].replace(/\s+#.*$/, ''))
  };
}

function loadRootEnv(repoRoot) {
  const envPath = path.join(repoRoot, '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of envLines) {
    const parsedLine = parseEnvLine(line);

    if (parsedLine && process.env[parsedLine.key] === undefined) {
      process.env[parsedLine.key] = parsedLine.value;
    }
  }
}

function supportsImageSize(model) {
  return /gemini-(?:3|3\.1|3-pro)/i.test(model);
}

function buildGenerateContentBody({ prompt, model, aspectRatio, imageSize }) {
  const imageConfig = {
    aspectRatio
  };

  if (supportsImageSize(model)) {
    imageConfig.imageSize = imageSize;
  }

  return {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig
    }
  };
}

function extractErrorMessage(payload) {
  if (!payload) {
    return 'empty response body';
  }

  if (typeof payload === 'string') {
    return payload.slice(0, 500);
  }

  return payload.error?.message || JSON.stringify(payload).slice(0, 500);
}

function collectResponseParts(payload) {
  return (payload.candidates || []).flatMap((candidate) => candidate.content?.parts || []);
}

function extractInlineImage(payload) {
  const parts = collectResponseParts(payload);
  const imagePart = parts.find((part) => {
    const inlineData = part.inlineData || part.inline_data;
    return inlineData?.data;
  });

  if (!imagePart) {
    const textResponse = parts
      .map((part) => part.text)
      .filter(Boolean)
      .join(' ')
      .trim();

    throw new Error(
      textResponse
        ? `Gemini returned text but no image data: ${textResponse}`
        : 'Gemini response did not include image data.'
    );
  }

  const inlineData = imagePart.inlineData || imagePart.inline_data;

  return {
    buffer: Buffer.from(inlineData.data, 'base64'),
    mimeType: inlineData.mimeType || inlineData.mime_type || ''
  };
}

async function parseJsonResponse(response) {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    return responseText;
  }
}

function isPngBuffer(buffer) {
  return buffer.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

async function requestGeminiImage({
  prompt,
  apiKey,
  model = DEFAULT_MODEL,
  endpointBase = DEFAULT_ENDPOINT_BASE,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  imageSize = DEFAULT_IMAGE_SIZE,
  fetchImpl = globalThis.fetch
}) {
  if (!fetchImpl) {
    throw new Error('This script requires Node.js 18+ with global fetch support.');
  }

  const endpointUrl = `${endpointBase.replace(/\/+$/, '')}/models/${model}:generateContent`;
  const response = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(buildGenerateContentBody({ prompt, model, aspectRatio, imageSize }))
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Gemini image generation failed (${response.status}): ${extractErrorMessage(payload)}`);
  }

  return extractInlineImage(payload);
}

async function generateThumbnail({
  title,
  promptInputPath,
  repoRoot = path.resolve(__dirname, '../../../..'),
  apiKey,
  model,
  aspectRatio,
  imageSize,
  fetchImpl
}) {
  loadRootEnv(repoRoot);

  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const resolvedModel = model || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
  const resolvedAspectRatio = aspectRatio || process.env.THUMBNAIL_ASPECT_RATIO || DEFAULT_ASPECT_RATIO;
  const resolvedImageSize = imageSize || process.env.THUMBNAIL_IMAGE_SIZE || DEFAULT_IMAGE_SIZE;

  if (!resolvedApiKey) {
    throw new Error('Missing GEMINI_API_KEY. Add it to the root .env file or export it before finalizing a post package.');
  }

  if (!fs.existsSync(promptInputPath)) {
    throw new Error(`Prompt input file not found: ${promptInputPath}`);
  }

  const prompt = fs.readFileSync(promptInputPath, 'utf8').trim();

  if (!prompt) {
    throw new Error(`Prompt input file is empty: ${promptInputPath}`);
  }

  const slug = slugify(title);
  const outputDir = path.join(repoRoot, '_post_suggestion', slug);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'thumbnail.png');
  const imageResult = await requestGeminiImage({
    prompt,
    apiKey: resolvedApiKey,
    model: resolvedModel,
    aspectRatio: resolvedAspectRatio,
    imageSize: resolvedImageSize,
    fetchImpl
  });

  if (!isPngBuffer(imageResult.buffer)) {
    throw new Error(`Generated thumbnail was not PNG data${imageResult.mimeType ? ` (${imageResult.mimeType})` : ''}.`);
  }

  fs.writeFileSync(outputPath, imageResult.buffer);

  const thumbnailReceipt = upsertStageReceipt({
    repoRoot,
    title,
    slug,
    stage: 'thumbnail',
    source: 'generate_thumbnail.js',
    payload: {
      thumbnailOutputPath: outputPath,
      thumbnailSha256: sha256File(outputPath),
      promptInputPath,
      promptSha256: sha256File(promptInputPath),
      model: resolvedModel,
      aspectRatio: resolvedAspectRatio,
      imageSize: resolvedImageSize
    }
  });

  return {
    slug,
    outputDir,
    outputPath,
    receiptPath: thumbnailReceipt.receiptPath
  };
}

function usageAndExit() {
  console.error('Usage: node generate_thumbnail.js "<Post Title>" "<prompt-input-path>"');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    usageAndExit();
  }

  const [title, promptInputArg] = args;

  try {
    const result = await generateThumbnail({
      title,
      promptInputPath: path.resolve(promptInputArg)
    });

    console.log(`Thumbnail saved to: _post_suggestion/${result.slug}/thumbnail.png`);
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
  buildGenerateContentBody,
  generateThumbnail,
  isPngBuffer,
  requestGeminiImage
};
