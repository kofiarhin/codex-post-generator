'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { slugify } = require('../../linkedin-post-orchestrator/scripts/title_log_utils');
const { sha256File, upsertStageReceipt } = require('../../linkedin-post-orchestrator/scripts/workflow_receipts');

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 628;
const DEFAULT_SEO_FILENAME_SUFFIX = 'software-development-linkedin-thumbnail';
const DEFAULT_SEO_FILENAME_MAX_LENGTH = 140;
const DEFAULT_HF_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell';
const DEFAULT_IMAGE_GENERATION_MODEL = DEFAULT_HF_IMAGE_MODEL;
const LOCAL_IMAGE_GENERATION_MODEL = 'local-node-png-renderer';
const HUGGING_FACE_API_BASE_URL = 'https://api-inference.huggingface.co/models';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[index] = crc >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  const crcBuffer = Buffer.alloc(4);
  const payload = Buffer.concat([typeBuffer, data]);

  lengthBuffer.writeUInt32BE(data.length, 0);
  crcBuffer.writeUInt32BE(crc32(payload), 0);

  return Buffer.concat([lengthBuffer, payload, crcBuffer]);
}

function encodePng({ width, height, pixels }) {
  const scanlineLength = width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * scanlineLength;
    const pixelOffset = y * width * 4;

    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, pixelOffset, pixelOffset + width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hexToRgb(hex) {
  const normalized = hex.replace(/^#/, '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function mixColor(left, right, amount) {
  return [
    left[0] + (right[0] - left[0]) * amount,
    left[1] + (right[1] - left[1]) * amount,
    left[2] + (right[2] - left[2]) * amount
  ];
}

function setPixel(canvas, x, y, color, alpha = 255) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }

  const offset = (y * canvas.width + x) * 4;
  const normalizedAlpha = alpha / 255;
  const inverseAlpha = 1 - normalizedAlpha;

  canvas.pixels[offset] = clamp(color[0] * normalizedAlpha + canvas.pixels[offset] * inverseAlpha);
  canvas.pixels[offset + 1] = clamp(color[1] * normalizedAlpha + canvas.pixels[offset + 1] * inverseAlpha);
  canvas.pixels[offset + 2] = clamp(color[2] * normalizedAlpha + canvas.pixels[offset + 2] * inverseAlpha);
  canvas.pixels[offset + 3] = 255;
}

function fillRect(canvas, x, y, width, height, color, alpha = 255) {
  for (let row = Math.max(0, y); row < Math.min(canvas.height, y + height); row += 1) {
    for (let column = Math.max(0, x); column < Math.min(canvas.width, x + width); column += 1) {
      setPixel(canvas, column, row, color, alpha);
    }
  }
}

function fillRoundedRect(canvas, x, y, width, height, radius, color, alpha = 255) {
  const xEnd = x + width;
  const yEnd = y + height;

  for (let row = Math.max(0, y); row < Math.min(canvas.height, yEnd); row += 1) {
    for (let column = Math.max(0, x); column < Math.min(canvas.width, xEnd); column += 1) {
      const dx = column < x + radius ? x + radius - column : column >= xEnd - radius ? column - (xEnd - radius - 1) : 0;
      const dy = row < y + radius ? y + radius - row : row >= yEnd - radius ? row - (yEnd - radius - 1) : 0;

      if (dx * dx + dy * dy <= radius * radius || dx === 0 || dy === 0) {
        setPixel(canvas, column, row, color, alpha);
      }
    }
  }
}

function drawLine(canvas, x1, y1, x2, y2, color, thickness = 1, alpha = 255) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

  for (let index = 0; index <= steps; index += 1) {
    const amount = steps === 0 ? 0 : index / steps;
    const x = Math.round(x1 + (x2 - x1) * amount);
    const y = Math.round(y1 + (y2 - y1) * amount);

    fillRect(canvas, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color, alpha);
  }
}

function drawBackground(canvas) {
  const top = hexToRgb('#16212d');
  const bottom = hexToRgb('#f2efe7');
  const accent = hexToRgb('#0f8f95');

  for (let y = 0; y < canvas.height; y += 1) {
    const amount = y / (canvas.height - 1);
    const color = mixColor(top, bottom, amount);

    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const vignette = 1 - Math.min(0.36, Math.hypot((x - 600) / 820, (y - 300) / 500) * 0.18);
      canvas.pixels[offset] = clamp(color[0] * vignette);
      canvas.pixels[offset + 1] = clamp(color[1] * vignette);
      canvas.pixels[offset + 2] = clamp(color[2] * vignette);
      canvas.pixels[offset + 3] = 255;
    }
  }

  fillRoundedRect(canvas, 74, 74, 1052, 480, 28, hexToRgb('#101923'), 208);
  fillRoundedRect(canvas, 96, 96, 1008, 436, 20, hexToRgb('#273544'), 170);
  fillRect(canvas, 96, 178, 1008, 8, accent, 190);
}

function drawEditorialScene(canvas, keyword, topicAngle) {
  const panel = hexToRgb('#d8e1e3');
  const darkPanel = hexToRgb('#21303e');
  const accent = hexToRgb('#f2a13b');
  const teal = hexToRgb('#0f8f95');
  const red = hexToRgb('#d45549');

  fillRoundedRect(canvas, 138, 230, 356, 190, 18, panel, 238);
  fillRoundedRect(canvas, 160, 254, 312, 32, 8, darkPanel, 226);
  fillRoundedRect(canvas, 160, 306, 126, 78, 10, hexToRgb('#b7c7ca'), 255);
  fillRoundedRect(canvas, 304, 306, 168, 78, 10, hexToRgb('#edf3f2'), 255);
  drawLine(canvas, 180, 404, 450, 404, darkPanel, 8, 200);

  fillRoundedRect(canvas, 706, 232, 358, 190, 18, panel, 238);
  fillRoundedRect(canvas, 728, 256, 314, 32, 8, darkPanel, 226);
  fillRoundedRect(canvas, 730, 310, 88, 72, 12, hexToRgb('#edf3f2'), 255);
  fillRoundedRect(canvas, 842, 310, 88, 72, 12, hexToRgb('#edf3f2'), 255);
  fillRoundedRect(canvas, 954, 310, 88, 72, 12, hexToRgb('#edf3f2'), 255);
  drawLine(canvas, 818, 346, 842, 346, teal, 6, 220);
  drawLine(canvas, 930, 346, 954, 346, teal, 6, 220);

  drawLine(canvas, 494, 325, 706, 325, accent, 6, 245);
  drawLine(canvas, 660, 292, 706, 325, accent, 6, 245);
  drawLine(canvas, 660, 358, 706, 325, accent, 6, 245);
  fillRoundedRect(canvas, 545, 288, 110, 74, 12, hexToRgb('#f6efe2'), 245);
  drawLine(canvas, 570, 316, 630, 316, red, 5, 220);
  drawLine(canvas, 570, 338, 615, 338, teal, 5, 220);

  const keywordLine = cleanText(keyword).slice(0, 28) || 'SOFTWARE DEVELOPMENT';
  const angleLine = cleanText(topicAngle).slice(0, 34) || 'SEARCH READY ASSET';
  drawText(canvas, keywordLine, 168, 116, 4, hexToRgb('#f7f4ec'), 255);
  drawText(canvas, angleLine, 168, 145, 3, hexToRgb('#a8cdd0'), 245);
}

function cleanText(value) {
  return String(value || '')
    .replace(/[^\w\s#+./:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function extractOverlayText(prompt, title) {
  const match = String(prompt || '').match(/(?:^|\n)text\s+overlay\s*:\s*([\s\S]*?)(?:\n\s*(?:placement|style)\s*:|$)/i);
  const extracted = match ? match[1].replace(/["']/g, ' ').trim() : '';
  const normalized = cleanText(extracted || title);

  return normalized || 'SOFTWARE DEVELOPMENT';
}

function textWidth(text, scale) {
  return [...text].reduce((width, char) => {
    if (char === ' ') {
      return width + 4 * scale;
    }

    return width + 6 * scale;
  }, 0);
}

function wrapText(text, maxWidth, scale, maxLines) {
  const words = cleanText(text).split(' ').filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (textWidth(nextLine, scale) <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : ['SOFTWARE DEVELOPMENT'];
}

function drawGlyph(canvas, character, x, y, scale, color, alpha) {
  const glyph = FONT[character] || FONT[' '];

  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] === '1') {
        fillRect(canvas, x + column * scale, y + row * scale, scale, scale, color, alpha);
      }
    }
  }
}

function drawText(canvas, text, x, y, scale, color, alpha = 255) {
  let cursorX = x;

  for (const character of cleanText(text)) {
    if (character === ' ') {
      cursorX += 4 * scale;
      continue;
    }

    drawGlyph(canvas, character, cursorX, y, scale, color, alpha);
    cursorX += 6 * scale;
  }
}

function drawCenteredText(canvas, text, centerX, y, scale, color, alpha = 255) {
  drawText(canvas, text, Math.round(centerX - textWidth(text, scale) / 2), y, scale, color, alpha);
}

function createLocalThumbnail({ title, prompt, primaryKeyword = '', topicAngle = '', width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }) {
  const canvas = {
    width,
    height,
    pixels: Buffer.alloc(width * height * 4)
  };

  drawBackground(canvas);
  drawEditorialScene(canvas, primaryKeyword, topicAngle);

  const overlayText = extractOverlayText(prompt, title);
  const overlayLines = wrapText(overlayText, 850, 9, 2);
  const bandHeight = overlayLines.length === 1 ? 112 : 170;
  const bandY = Math.round(height / 2 - bandHeight / 2);

  fillRoundedRect(canvas, 132, bandY, width - 264, bandHeight, 18, hexToRgb('#0b1219'), 218);
  fillRect(canvas, 168, bandY + 18, width - 336, 3, hexToRgb('#f2a13b'), 235);

  const firstLineY = overlayLines.length === 1 ? bandY + 38 : bandY + 34;
  overlayLines.forEach((line, index) => {
    drawCenteredText(canvas, line, width / 2, firstLineY + index * 68, 9, hexToRgb('#fff9ec'), 255);
  });

  drawCenteredText(canvas, 'LINKEDIN SOCIAL THUMBNAIL', width / 2, bandY + bandHeight - 28, 3, hexToRgb('#a8cdd0'), 230);

  return encodePng(canvas);
}

function isPngBuffer(buffer) {
  return buffer.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function redactErrorMessage(error) {
  return String(error?.message || error || 'Unknown image generation error')
    .replace(/hf_[0-9A-Za-z_-]{10,}/g, '[redacted-hf-token]')
    .slice(0, 500);
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();

  if (provider === 'huggingface' || provider === 'local') {
    return provider;
  }

  return '';
}

function resolveImageGenerationConfig(env = process.env) {
  const configuredProvider = normalizeProvider(env.IMAGE_GENERATION_PROVIDER);
  const rawProvider = String(env.IMAGE_GENERATION_PROVIDER || '').trim();
  const hfToken = String(env.HF_TOKEN || '').trim();
  const model = String(env.HF_IMAGE_MODEL || '').trim() || DEFAULT_HF_IMAGE_MODEL;

  if (configuredProvider === 'local') {
    return {
      configuredProvider: 'local',
      provider: 'local',
      model: LOCAL_IMAGE_GENERATION_MODEL,
      requestedModel: model,
      hfToken,
      fallbackUsed: true,
      fallbackReason: 'IMAGE_GENERATION_PROVIDER=local'
    };
  }

  if (configuredProvider === 'huggingface' || (!rawProvider && hfToken)) {
    if (!hfToken) {
      return {
        configuredProvider: 'huggingface',
        provider: 'local',
        model: LOCAL_IMAGE_GENERATION_MODEL,
        requestedModel: model,
        hfToken,
        fallbackUsed: true,
        fallbackReason: 'IMAGE_GENERATION_PROVIDER=huggingface but HF_TOKEN is missing'
      };
    }

    return {
      configuredProvider: configuredProvider || 'auto',
      provider: 'huggingface',
      model,
      hfToken,
      fallbackUsed: false,
      fallbackReason: ''
    };
  }

  return {
    configuredProvider: rawProvider || '',
    provider: 'local',
    model: LOCAL_IMAGE_GENERATION_MODEL,
    requestedModel: model,
    hfToken,
    fallbackUsed: true,
    fallbackReason: rawProvider
      ? `Unsupported IMAGE_GENERATION_PROVIDER=${rawProvider}`
      : 'HF_TOKEN is missing'
  };
}

function encodeModelForUrl(model) {
  return String(model || DEFAULT_HF_IMAGE_MODEL)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function responseBuffer(response) {
  if (typeof response.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer());
  }

  if (typeof response.buffer === 'function') {
    return response.buffer();
  }

  if (typeof response.text === 'function') {
    return Buffer.from(await response.text());
  }

  throw new Error('Hugging Face response did not expose a readable body.');
}

function decodeResponseError(buffer) {
  const text = buffer.toString('utf8').trim();

  if (!text) {
    return '';
  }

  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || text;
  } catch (error) {
    return text;
  }
}

async function generateHuggingFaceImage({
  prompt,
  model = DEFAULT_HF_IMAGE_MODEL,
  hfToken,
  fetchImpl = globalThis.fetch,
  apiBaseUrl = HUGGING_FACE_API_BASE_URL,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT
}) {
  if (!hfToken) {
    throw new Error('HF_TOKEN is required for Hugging Face thumbnail generation.');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node 18+ or pass a fetch implementation.');
  }

  const response = await fetchImpl(`${apiBaseUrl}/${encodeModelForUrl(model)}`, {
    method: 'POST',
    headers: {
      Accept: 'image/png',
      Authorization: `Bearer ${hfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        width,
        height
      }
    })
  });

  const buffer = await responseBuffer(response);

  if (!response.ok) {
    const message = decodeResponseError(buffer) || response.statusText || 'Hugging Face image generation failed';
    throw new Error(`Hugging Face image generation failed (${response.status}): ${message}`);
  }

  if (!isPngBuffer(buffer)) {
    const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') : '';
    throw new Error(`Hugging Face returned ${contentType || 'non-PNG data'} instead of PNG data.`);
  }

  return buffer;
}

function tokenizeSeoText(value) {
  return slugify(String(value || ''))
    .split('-')
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildSeoThumbnailBaseName({
  title,
  primaryKeyword = '',
  topicAngle = '',
  maxLength = DEFAULT_SEO_FILENAME_MAX_LENGTH
}) {
  const seenTokens = new Set();
  const orderedTokens = [];
  const suffixTokens = tokenizeSeoText(DEFAULT_SEO_FILENAME_SUFFIX);
  const suffixText = suffixTokens.join('-');
  const maxPrefixLength = Math.max(0, maxLength - suffixText.length - 1);
  const sourceValues = [title, primaryKeyword, topicAngle];

  for (const sourceValue of sourceValues) {
    for (const token of tokenizeSeoText(sourceValue)) {
      if (seenTokens.has(token)) {
        continue;
      }

      const nextName = [...orderedTokens, token].join('-');
      if (nextName.length > maxPrefixLength) {
        return [...orderedTokens, ...suffixTokens].join('-') || suffixText;
      }

      seenTokens.add(token);
      orderedTokens.push(token);
    }
  }

  return [...orderedTokens, ...suffixTokens].join('-') || suffixText;
}

function buildSeoThumbnailFileName(options) {
  return `${buildSeoThumbnailBaseName(options)}.png`;
}

async function generateThumbnail({
  title,
  promptInputPath,
  primaryKeyword = '',
  topicAngle = '',
  thumbnailFileName,
  repoRoot = path.resolve(__dirname, '../../../..'),
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  env = process.env,
  fetchImpl = globalThis.fetch,
  huggingFaceImageGenerator = generateHuggingFaceImage,
  localThumbnailRenderer = createLocalThumbnail,
  logger = console
}) {
  if (!fs.existsSync(promptInputPath)) {
    throw new Error(`Prompt input file not found: ${promptInputPath}`);
  }

  const prompt = fs.readFileSync(promptInputPath, 'utf8').trim();

  if (!prompt) {
    throw new Error(`Prompt input file is empty: ${promptInputPath}`);
  }

  const slug = slugify(title);
  const outputDir = path.join(repoRoot, '_post_suggestion', slug);
  const outputFileName = thumbnailFileName || buildSeoThumbnailFileName({ title, primaryKeyword, topicAngle });

  if (path.basename(outputFileName) !== outputFileName || !outputFileName.endsWith('.png')) {
    throw new Error(`Invalid thumbnail file name: ${outputFileName}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, outputFileName);
  const config = resolveImageGenerationConfig(env);
  let pngBuffer = null;
  let provider = config.provider;
  let model = config.model;
  let fallbackUsed = config.fallbackUsed;
  let fallbackReason = config.fallbackReason;
  let providerError = '';

  if (config.provider === 'huggingface') {
    try {
      pngBuffer = await huggingFaceImageGenerator({
        prompt,
        model: config.model,
        hfToken: config.hfToken,
        fetchImpl,
        width,
        height
      });
    } catch (error) {
      providerError = redactErrorMessage(error);
      pngBuffer = null;
      provider = 'local';
      model = LOCAL_IMAGE_GENERATION_MODEL;
      fallbackUsed = true;
      fallbackReason = `Hugging Face provider failed: ${providerError}`;
    }
  }

  if (!pngBuffer) {
    if (fallbackUsed && typeof logger?.warn === 'function') {
      logger.warn(`Thumbnail fallback: using local renderer. Reason: ${fallbackReason || 'provider did not return an image'}`);
    }
    pngBuffer = localThumbnailRenderer({ title, prompt, primaryKeyword, topicAngle, width, height });
  }

  if (!isPngBuffer(pngBuffer)) {
    throw new Error(`${provider === 'huggingface' ? 'Hugging Face provider' : 'Local thumbnail renderer'} did not produce PNG data.`);
  }

  fs.writeFileSync(outputPath, pngBuffer);

  const thumbnailReceipt = upsertStageReceipt({
    repoRoot,
    title,
    slug,
    stage: 'thumbnail',
    source: provider === 'huggingface' ? 'huggingface-thumbnail-generator' : 'local-thumbnail-generator',
    payload: {
      thumbnailOutputPath: outputPath,
      thumbnailFileName: outputFileName,
      thumbnailSha256: sha256File(outputPath),
      thumbnailBufferSha256: sha256Buffer(pngBuffer),
      promptInputPath,
      promptSha256: sha256File(promptInputPath),
      provider,
      configuredProvider: config.configuredProvider,
      model,
      requestedModel: config.requestedModel || config.model,
      fallbackUsed,
      fallbackReason,
      providerError,
      width,
      height
    }
  });

  return {
    slug,
    outputDir,
    outputPath,
    fileName: outputFileName,
    receiptPath: thumbnailReceipt.receiptPath,
    provider,
    model,
    fallbackUsed
  };
}

function usageAndExit() {
  console.error('Usage: node generate_thumbnail.js "<Post Title>" "<prompt-input-path>" ["<primary-keyword>"] ["<topic-angle>"]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    usageAndExit();
  }

  const [title, promptInputArg, primaryKeyword = '', topicAngle = ''] = args;

  try {
    const result = await generateThumbnail({
      title,
      promptInputPath: path.resolve(promptInputArg),
      primaryKeyword,
      topicAngle
    });

    console.log(`Thumbnail saved to: _post_suggestion/${result.slug}/${result.fileName}`);
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
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_HF_IMAGE_MODEL,
  buildSeoThumbnailBaseName,
  buildSeoThumbnailFileName,
  createLocalThumbnail,
  generateHuggingFaceImage,
  generateThumbnail,
  isPngBuffer,
  resolveImageGenerationConfig
};
