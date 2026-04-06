'use strict';

const fs = require('fs');

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
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
  'our',
  'so',
  'than',
  'that',
  'the',
  'their',
  'there',
  'this',
  'those',
  'through',
  'to',
  'up',
  'was',
  'we',
  'when',
  'why',
  'with',
  'you',
  'your'
]);

function slugify(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug.slice(0, 60).replace(/-+$/g, '');
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[\s]+/g, ' ')
    .trim();
}

function sanitizeLogField(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s*\|\s*/g, ' / ')
    .replace(/[\s]+/g, ' ')
    .trim();
}

function getCurrentDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function parseLogEntry(line) {
  const trimmedLine = String(line || '').trim();

  if (!trimmedLine) {
    return null;
  }

  const parts = trimmedLine.split(' | ');

  if (parts.length >= 4) {
    const [date, title, primaryKeyword, topicAngle] = parts;

    return {
      raw: trimmedLine,
      date: sanitizeLogField(date),
      title: sanitizeLogField(title),
      primaryKeyword: sanitizeLogField(primaryKeyword),
      topicAngle: sanitizeLogField(parts.slice(3).join(' | ')),
      format: 'structured'
    };
  }

  return {
    raw: trimmedLine,
    date: 'legacy',
    title: trimmedLine,
    primaryKeyword: '',
    topicAngle: 'legacy entry',
    format: 'legacy'
  };
}

function formatLogEntry({ date, title, primaryKeyword, topicAngle }) {
  const safeDate = sanitizeLogField(date || getCurrentDateStamp()) || getCurrentDateStamp();
  const safeTitle = sanitizeLogField(title);
  const safePrimaryKeyword = sanitizeLogField(primaryKeyword) || '-';
  const safeTopicAngle = sanitizeLogField(topicAngle) || '-';

  return `${safeDate} | ${safeTitle} | ${safePrimaryKeyword} | ${safeTopicAngle}`;
}

function readLogEntries(logPath) {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  return fs
    .readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => parseLogEntry(line))
    .filter((entry) => entry && entry.title);
}

function readLoggedTitles(logPath) {
  return readLogEntries(logPath).map((entry) => entry.title);
}

function appendLogEntry(logPath, entry) {
  const existingEntries = readLogEntries(logPath);
  const formattedEntry = formatLogEntry(entry);
  const existingContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  const needsNewline = existingEntries.length > 0 && existingContent.length > 0 && !existingContent.endsWith('\n');
  const prefix = needsNewline ? '\n' : '';

  fs.appendFileSync(logPath, `${prefix}${formattedEntry}`, 'utf8');
  return formattedEntry;
}

function stemToken(token) {
  if (token.length > 4 && token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }

  return token;
}

function tokenizeTitle(title) {
  return normalizeTitle(title)
    .split(' ')
    .map((token) => stemToken(token.trim()))
    .filter((token) => token.length > 2)
    .filter((token) => !STOP_WORDS.has(token));
}

function unique(values) {
  return [...new Set(values)];
}

function buildBigrams(tokens) {
  const bigrams = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }

  return unique(bigrams);
}

function intersectionCount(leftValues, rightValues) {
  const rightSet = new Set(rightValues);

  return leftValues.filter((value) => rightSet.has(value)).length;
}

function safeRatio(numerator, denominator) {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function calculateSimilarity(candidateTitle, existingTitle) {
  const normalizedCandidate = normalizeTitle(candidateTitle);
  const normalizedExisting = normalizeTitle(existingTitle);
  const candidateTokens = unique(tokenizeTitle(candidateTitle));
  const existingTokens = unique(tokenizeTitle(existingTitle));
  const candidateBigrams = buildBigrams(candidateTokens);
  const existingBigrams = buildBigrams(existingTokens);

  const tokenIntersection = intersectionCount(candidateTokens, existingTokens);
  const bigramIntersection = intersectionCount(candidateBigrams, existingBigrams);

  const tokenUnion = new Set([...candidateTokens, ...existingTokens]).size;
  const bigramUnion = new Set([...candidateBigrams, ...existingBigrams]).size;
  const minTokenCount = Math.min(candidateTokens.length, existingTokens.length);

  const tokenJaccard = safeRatio(tokenIntersection, tokenUnion);
  const tokenOverlap = safeRatio(tokenIntersection, minTokenCount);
  const bigramJaccard = safeRatio(bigramIntersection, bigramUnion);
  const containsMatch =
    normalizedCandidate.length >= 24 &&
    normalizedExisting.length >= 24 &&
    (normalizedCandidate.includes(normalizedExisting) || normalizedExisting.includes(normalizedCandidate));

  let reason = 'distinct';
  let isDuplicate = false;

  if (normalizedCandidate === normalizedExisting) {
    isDuplicate = true;
    reason = 'exact-title-match';
  } else if (containsMatch && tokenOverlap >= 0.8) {
    isDuplicate = true;
    reason = 'title-containment-match';
  } else if (tokenOverlap >= 0.9 && bigramJaccard >= 0.45) {
    isDuplicate = true;
    reason = 'high-token-overlap';
  } else if (tokenJaccard >= 0.75) {
    isDuplicate = true;
    reason = 'high-keyword-overlap';
  }

  return {
    isDuplicate,
    reason,
    normalizedCandidate,
    normalizedExisting,
    tokenJaccard,
    tokenOverlap,
    bigramJaccard,
    candidateTokens,
    existingTokens
  };
}

function findDuplicateTitle(candidateTitle, logEntriesOrTitles) {
  const entries = logEntriesOrTitles.map((entryOrTitle) => {
    if (typeof entryOrTitle === 'string') {
      return { title: entryOrTitle, date: 'legacy', primaryKeyword: '', topicAngle: '' };
    }

    return entryOrTitle;
  });

  let bestMatch = null;

  for (const entry of entries) {
    const similarity = calculateSimilarity(candidateTitle, entry.title);

    if (!similarity.isDuplicate) {
      continue;
    }

    const enrichedMatch = {
      existingTitle: entry.title,
      existingDate: entry.date || '',
      existingPrimaryKeyword: entry.primaryKeyword || '',
      existingTopicAngle: entry.topicAngle || '',
      ...similarity
    };

    if (!bestMatch) {
      bestMatch = enrichedMatch;
      continue;
    }

    const currentScore = bestMatch.tokenOverlap + bestMatch.tokenJaccard + bestMatch.bigramJaccard;
    const nextScore = enrichedMatch.tokenOverlap + enrichedMatch.tokenJaccard + enrichedMatch.bigramJaccard;

    if (nextScore > currentScore) {
      bestMatch = enrichedMatch;
    }
  }

  return bestMatch;
}

module.exports = {
  appendLogEntry,
  findDuplicateTitle,
  formatLogEntry,
  getCurrentDateStamp,
  normalizeTitle,
  parseLogEntry,
  readLogEntries,
  readLoggedTitles,
  sanitizeLogField,
  slugify
};
