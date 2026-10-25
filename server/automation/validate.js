'use strict';

const { createHash } = require('node:crypto');
const { findDuplicateTitle } = require('../../.agents/skills/linkedin-post-orchestrator/scripts/title_log_utils');
const { platformsFor } = require('./platforms');
const { failure } = require('./errors');
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const digest = value => createHash('sha256').update(normalize(value)).digest('hex');
// Only the reviewed source fields are hashed, so storage-only fields (the public blog's
// source title) never invalidate a review. Stored legacy hashes are unchanged.
const contentHash = draft => createHash('sha256').update(JSON.stringify([
  draft.title, draft.topicAngle, draft.primaryKeyword, draft.secondaryKeywords, draft.linkedinPost, draft.xPost,
  Array.isArray(draft.sources) ? draft.sources.map(({ url, claim, excerpt }) => ({ url, claim, excerpt })) : draft.sources,
  ...(draft.platform === undefined ? [] : [draft.platform])
])).digest('hex');
const linkedInLength = text => text.replace(/https?:\/\/\S+/g, 'x'.repeat(24)).length;

function validateLinkedInFormatting(text) {
  // Reject rather than rewrite: reviewed, hashed and submitted text must stay identical.
  // JSON decoding belongs to the engine adapter and Buffer transport. A backslash
  // remaining in the decoded post is literal content, not an escape to decode again.
  if (typeof text !== 'string' || /[\\\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw failure('LINKEDIN_ESCAPING');
  }
  // Ignore bare URLs when inspecting prose; URL paths can contain Markdown punctuation.
  // Keep URLs inside Markdown delimiters visible so links/autolinks are still rejected.
  const prose = text.replace(/(^|\s)https?:\/\/\S+/gi, '$1URL');
  // Cover inline/reference links, reference definitions, autolinks and Markdown styling.
  if (/\[[^\]]*\]\s*(?:\(|\[)|^\s*\[[^\]]+\]:|<https?:\/\/[^>\s]+>|`|\*\*|~~|^\s*#{1,6}\s/im.test(prose) ||
    /^ {0,3}(?:>\s?|[-+*]\s|\d+[.)]\s|(?:={3,}|-{3,}|\*{3,}|_{3,})\s*$)/m.test(prose) ||
    /(?<![\p{L}\p{N}_])(_{1,2}|\*)\S(?:[^\n]*?\S)?\1(?![\p{L}\p{N}_])/u.test(prose)) {
    throw failure('LINKEDIN_MARKDOWN');
  }
  const closing = text.match(/(?:^|\n)\s*(#[\p{L}\p{N}_]+(?:\s+#[\p{L}\p{N}_]+)*)\s*$/u);
  const tags = closing ? closing[1].match(/#[\p{L}\p{N}_]+/gu) : [];
  // A URL fragment is not a hashtag. All actual hashtags belong in the closing block.
  const allTags = prose.match(/#[\p{L}\p{N}_]+/gu) || [];
  // LinkedIn's copied/display labels are not post syntax. Never turn them into
  // hashtags after review, or silently accept them alongside a valid closing block.
  if (/(?<![\p{L}\p{N}_])#?hashtag(?=[\p{Lu}\p{Lt}\p{N}_])/u.test(prose) ||
    tags.length < 5 || tags.length > 7 || allTags.length !== tags.length ||
    new Set(tags.map(tag => tag.toLowerCase())).size !== tags.length) throw failure('HASHTAGS_INVALID');
}

function publicSource(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      !u.search && !u.hash && /[a-z]/i.test(u.hostname) && u.hostname.includes('.') &&
      !/(^|\.)(localhost|local|internal|test|invalid|example\.com|example\.org|example\.net)$/.test(u.hostname) &&
      !/^[\d.]+$/.test(u.hostname) && !u.hostname.includes(':');
  } catch { return false; }
}

function validateDraft(draft, previous = [], { platform } = {}) {
  const platforms = platformsFor(platform);
  if (!draft || typeof draft !== 'object') throw failure('DRAFT_MISSING');
  if ((draft.platform !== undefined && draft.platform !== platform) ||
    (platform === 'linkedin' && draft.xPost !== undefined)) throw failure('DRAFT_PLATFORM_MISMATCH');
  const fields = ['title', 'topicAngle', 'primaryKeyword', ...platforms.map(p => `${p}Post`)];
  if (!fields.every(k => typeof draft[k] === 'string' && draft[k].trim())) throw failure('DRAFT_INCOMPLETE');
  const clean = Object.fromEntries(fields.map(k => [k, draft[k].trim()]));
  const { title, topicAngle, primaryKeyword, linkedinPost, xPost } = clean;
  if (title.length > 200 || topicAngle.length > 500 || primaryKeyword.length > 100) throw failure('METADATA_TOO_LONG');
  if (xPost !== undefined && normalize(linkedinPost) === normalize(xPost)) throw failure('PLATFORM_POSTS_IDENTICAL');
  const sources = draft.sources;
  if (!Array.isArray(sources) || sources.length < 2 || sources.length > 8 || sources.some(s =>
    !s || !publicSource(s.url) || typeof s.claim !== 'string' || s.claim.trim().length < 15 ||
    typeof s.excerpt !== 'string' || s.excerpt.trim().length < 15 || s.excerpt.length > 1000)) {
    throw failure('SOURCES_INVALID');
  }
  if (new Set(sources.map(s => s.url)).size !== sources.length) throw failure('SOURCES_DUPLICATE');
  const words = linkedinPost.split(/\s+/).length;
  const linkedLength = linkedInLength(linkedinPost);
  if (words < 150 || words > 300 || linkedLength > 3000) throw failure('LINKEDIN_LENGTH');
  if (xPost !== undefined && (xPost.length > 1500 || xPost.length < 80)) throw failure('X_LENGTH');
  for (const [text, min, max] of [[linkedinPost, 5, 7], ...(xPost === undefined ? [] : [[xPost, 2, 4]])]) {
    if (text === linkedinPost) validateLinkedInFormatting(text);
    else {
      const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
      if (tags.length < min || tags.length > max || new Set(tags.map(t => t.toLowerCase())).size !== tags.length ||
        !/(?:#[\p{L}\p{N}_]+\s*)+$/u.test(text)) throw failure('HASHTAGS_INVALID');
    }
    if (text.split(/\n\s*\n/).length < 2 || /^\s*\d+\/\d+/m.test(text) ||
      (text !== linkedinPost && /```|\*\*/.test(text))) throw failure('FORMATTING_INVALID');
    if (!normalize(text.split('\n')[0]).includes(normalize(primaryKeyword))) throw failure('PRIMARY_KEYWORD_MISSING');
    if (/\b(?:hot take|unpopular opinion|game[ -]changer|as an ai)\b|\b(?:I|we)\s+(?:built|shipped|launched|deployed|saved|increased)\b/i.test(text)) {
      throw failure('COPY_QUALITY_INVALID');
    }
  }
  if (!Array.isArray(draft.secondaryKeywords) || draft.secondaryKeywords.length < 2 ||
    draft.secondaryKeywords.length > 4 || draft.secondaryKeywords.some(k => typeof k !== 'string' ||
      !k.trim() || !normalize(linkedinPost).includes(normalize(k)))) throw failure('SECONDARY_KEYWORDS_MISSING');
  const topicHash = digest(`${title}| ${topicAngle}`);
  if (findDuplicateTitle(title, previous.filter(p => p.title)) ||
    findDuplicateTitle(topicAngle, previous.filter(p => p.topicAngle && p.topicAngle !== 'legacy entry').map(p => p.topicAngle)) ||
    previous.some(p => p.topicHash === topicHash || [p.linkedinPost, p.xPost].filter(Boolean).some(text =>
      digest(text) === digest(linkedinPost) || (xPost !== undefined && digest(text) === digest(xPost))))) throw failure('DUPLICATE_CONTENT');
  const validated = { ...clean, ...(platform === undefined ? {} : { platform }), secondaryKeywords: draft.secondaryKeywords, sources: sources.map(s =>
    ({ url: s.url, claim: s.claim.trim(), excerpt: s.excerpt.trim() })), topicHash };
  return { ...validated, contentHash: contentHash(validated) };
}

function validateReview(review, draft, now = new Date()) {
  if (!review || review.approved !== true || review.qualityPassed !== true || review.originalityPassed !== true ||
    !Array.isArray(review.unsupportedClaims) || review.unsupportedClaims.length !== 0 ||
    !Array.isArray(review.sourceChecks) || review.sourceChecks.length !== draft.sources.length ||
    draft.sources.some(s => !review.sourceChecks.some(c => c.url === s.url && c.supported === true))) {
    throw failure('REVIEW_REJECTED');
  }
  return { passed: true, originalityPassed: true, version: 2, reviewedAt: now, contentHash: draft.contentHash,
    sourceChecks: draft.sources.map(s => ({ url: s.url, supported: true })) };
}
module.exports = { validateDraft, validateReview, digest, contentHash, publicSource, linkedInLength, validateLinkedInFormatting };
