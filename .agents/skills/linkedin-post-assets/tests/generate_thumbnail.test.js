'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildSeoThumbnailFileName,
  createLocalThumbnail,
  generateHuggingFaceImage,
  generateThumbnail
} = require('../scripts/generate_thumbnail');

function makeTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbnail-generator-'));
  fs.mkdirSync(path.join(repoRoot, '_inputs'), { recursive: true });
  return repoRoot;
}

function writePrompt(repoRoot, prompt) {
  const promptPath = path.join(repoRoot, '_inputs', 'prompt.txt');
  fs.writeFileSync(promptPath, prompt, 'utf8');
  return promptPath;
}

function readThumbnailReceipt(result) {
  return JSON.parse(fs.readFileSync(result.receiptPath, 'utf8')).stages.thumbnail;
}

function pngFixture() {
  return createLocalThumbnail({
    title: 'Fixture Thumbnail',
    prompt: 'Text Overlay: Fixture',
    width: 120,
    height: 63
  });
}

test('passes the full saved prompt to the Hugging Face provider', async () => {
  const repoRoot = makeTempRepo();
  const fullPrompt = [
    'A tired senior developer stands between two production dashboards shaped like courtroom evidence boards.',
    'The scene should show debugging fatigue, maintenance judgment, and a single warm desk lamp.',
    '',
    'Text Overlay: Maintenance Beats Magic',
    'Placement: centered in the middle of the thumbnail'
  ].join('\n');
  const promptInputPath = writePrompt(repoRoot, fullPrompt);
  let capturedPrompt = '';

  const result = await generateThumbnail({
    title: 'Maintenance Beats Magic',
    promptInputPath,
    primaryKeyword: 'AI software maintenance',
    topicAngle: 'full prompt handoff',
    repoRoot,
    env: {
      IMAGE_GENERATION_PROVIDER: 'huggingface',
      HF_TOKEN: 'test-token',
      HF_IMAGE_MODEL: 'test-image-model'
    },
    huggingFaceImageGenerator: async ({ prompt, model, hfToken, width, height }) => {
      capturedPrompt = prompt;
      assert.equal(model, 'test-image-model');
      assert.equal(hfToken, 'test-token');
      assert.equal(width, 1200);
      assert.equal(height, 628);
      return pngFixture();
    }
  });

  const receipt = readThumbnailReceipt(result);

  assert.equal(capturedPrompt, fullPrompt);
  assert.equal(result.provider, 'huggingface');
  assert.equal(result.fallbackUsed, false);
  assert.equal(receipt.provider, 'huggingface');
  assert.equal(receipt.model, 'test-image-model');
  assert.equal(receipt.fallbackUsed, false);
  assert.equal(receipt.promptInputPath, promptInputPath);
  assert.equal(receipt.width, 1200);
  assert.equal(receipt.height, 628);
  assert.match(receipt.promptSha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.thumbnailSha256, /^[a-f0-9]{64}$/);
});

test('Hugging Face REST provider sends the full prompt as request inputs', async () => {
  const fullPrompt = 'A complete thumbnail concept with metaphor, mood, constraints, and overlay instructions.';
  let capturedUrl = '';
  let capturedBody = null;
  let capturedHeaders = null;

  const pngBuffer = await generateHuggingFaceImage({
    prompt: fullPrompt,
    model: 'org/test-image',
    hfToken: 'test-token',
    apiBaseUrl: 'https://example.test/models',
    width: 1200,
    height: 628,
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      capturedHeaders = options.headers;
      const png = pngFixture();

      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
        headers: {
          get: () => 'image/png'
        }
      };
    }
  });

  assert.equal(capturedUrl, 'https://example.test/models/org/test-image');
  assert.equal(capturedHeaders.Authorization, 'Bearer test-token');
  assert.equal(capturedHeaders.Accept, 'image/png');
  assert.equal(capturedBody.inputs, fullPrompt);
  assert.equal(capturedBody.parameters.width, 1200);
  assert.equal(capturedBody.parameters.height, 628);
  assert.equal(pngBuffer.subarray(1, 4).toString('ascii'), 'PNG');
});

test('uses the local fallback when explicitly configured as local', async () => {
  const repoRoot = makeTempRepo();
  const promptInputPath = writePrompt(repoRoot, 'A full editorial prompt.\n\nText Overlay: Local Fallback');
  let providerCalled = false;

  const result = await generateThumbnail({
    title: 'Local Fallback Only',
    promptInputPath,
    repoRoot,
    env: {
      IMAGE_GENERATION_PROVIDER: 'local',
      HF_TOKEN: 'test-token'
    },
    huggingFaceImageGenerator: async () => {
      providerCalled = true;
      return pngFixture();
    }
  });

  const receipt = readThumbnailReceipt(result);

  assert.equal(providerCalled, false);
  assert.equal(result.provider, 'local');
  assert.equal(result.fallbackUsed, true);
  assert.equal(receipt.provider, 'local');
  assert.equal(receipt.model, 'local-node-png-renderer');
  assert.equal(receipt.fallbackUsed, true);
  assert.match(receipt.fallbackReason, /IMAGE_GENERATION_PROVIDER=local/);
});

test('uses Hugging Face when HF_TOKEN is present and provider config is missing', async () => {
  const repoRoot = makeTempRepo();
  const promptInputPath = writePrompt(repoRoot, 'A full editorial prompt.\n\nText Overlay: Token Present');
  let providerCalled = false;

  const result = await generateThumbnail({
    title: 'Token Present Uses Provider',
    promptInputPath,
    repoRoot,
    env: {
      HF_TOKEN: 'test-token'
    },
    huggingFaceImageGenerator: async () => {
      providerCalled = true;
      return pngFixture();
    }
  });

  const receipt = readThumbnailReceipt(result);

  assert.equal(providerCalled, true);
  assert.equal(result.provider, 'huggingface');
  assert.equal(receipt.fallbackUsed, false);
  assert.equal(receipt.configuredProvider, 'auto');
});

test('uses local fallback and records the reason when provider token is missing', async () => {
  const repoRoot = makeTempRepo();
  const promptInputPath = writePrompt(repoRoot, 'A full editorial prompt.\n\nText Overlay: Missing Token');
  let providerCalled = false;

  const result = await generateThumbnail({
    title: 'Missing Token Fallback',
    promptInputPath,
    repoRoot,
    env: {},
    huggingFaceImageGenerator: async () => {
      providerCalled = true;
      return pngFixture();
    }
  });

  const receipt = readThumbnailReceipt(result);

  assert.equal(providerCalled, false);
  assert.equal(result.provider, 'local');
  assert.equal(receipt.fallbackUsed, true);
  assert.match(receipt.fallbackReason, /HF_TOKEN is missing/);
});

test('falls back to local rendering when the Hugging Face provider fails', async () => {
  const repoRoot = makeTempRepo();
  const promptInputPath = writePrompt(repoRoot, 'A full metaphor-heavy prompt.\n\nText Overlay: Provider Failed');
  let localCalled = false;

  const result = await generateThumbnail({
    title: 'Provider Failure Fallback',
    promptInputPath,
    repoRoot,
    env: {
      IMAGE_GENERATION_PROVIDER: 'huggingface',
      HF_TOKEN: 'test-token'
    },
    huggingFaceImageGenerator: async () => {
      throw new Error('simulated Hugging Face outage with hf_secretToken12345');
    },
    localThumbnailRenderer: (options) => {
      localCalled = true;
      return createLocalThumbnail({ ...options, width: 120, height: 63 });
    }
  });

  const receipt = readThumbnailReceipt(result);

  assert.equal(localCalled, true);
  assert.equal(result.provider, 'local');
  assert.equal(result.fallbackUsed, true);
  assert.equal(receipt.provider, 'local');
  assert.equal(receipt.fallbackUsed, true);
  assert.equal(receipt.model, 'local-node-png-renderer');
  assert.equal(receipt.requestedModel, 'black-forest-labs/FLUX.1-schnell');
  assert.match(receipt.fallbackReason, /Hugging Face provider failed/);
  assert.match(receipt.providerError, /simulated Hugging Face outage/);
  assert.doesNotMatch(receipt.providerError, /hf_secretToken12345/);
});

test('keeps generated thumbnail filenames SEO-safe', () => {
  const fileName = buildSeoThumbnailFileName({
    title: 'AI Agents, Build Tools & "One Weird Bug"!',
    primaryKeyword: 'software development workflow',
    topicAngle: 'debugging + deployment'
  });

  assert.equal(path.basename(fileName), fileName);
  assert.match(fileName, /^[a-z0-9-]+\.png$/);
  assert.match(fileName, /software-development-linkedin-thumbnail\.png$/);
  assert.ok(fileName.length <= 144);
});
