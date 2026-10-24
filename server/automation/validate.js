'use strict';

const { createHash } = require('node:crypto');
const { findDuplicateTitle } = require('../../.agents/skills/linkedin-post-orchestrator/scripts/title_log_utils');
const { platformsFor } = require('./platforms');
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const digest = value => createHash('sha256').update(normalize(value)).digest('hex');
const contentHash = draft => createHash('sha256').update(JSON.stringify([
  draft.title, draft.topicAngle, draft.primaryKeyword, draft.secondaryKeywords, draft.linkedinPost, draft.xPost, draft.sources,
  ...(draft.platform === undefined ? [] : [draft.platform])
])).digest('hex');
const linkedInLength = text => text.replace(/https?:\/\/\S+/g, 'x'.repeat(24)).length;

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
  if (!draft || typeof draft !== 'object') throw new Error('Missing draft');
  if ((draft.platform !== undefined && draft.platform !== platform) ||
    (platform === 'linkedin' && draft.xPost !== undefined)) throw new Error('Draft platform selection mismatch');
  const fields = ['title', 'topicAngle', 'primaryKeyword', ...platforms.map(p => `${p}Post`)];
  if (!fields.every(k => typeof draft[k] === 'string' && draft[k].trim())) throw new Error('Incomplete posts');
  const clean = Object.fromEntries(fields.map(k => [k, draft[k].trim()]));
  const { title, topicAngle, primaryKeyword, linkedinPost, xPost } = clean;
  if (title.length > 200 || topicAngle.length > 500 || primaryKeyword.length > 100) throw new Error('Metadata too long');
  if (xPost !== undefined && normalize(linkedinPost) === normalize(xPost)) throw new Error('Platform posts must differ');
  const sources = draft.sources;
  if (!Array.isArray(sources) || sources.length < 2 || sources.length > 8 || sources.some(s =>
    !s || !publicSource(s.url) || typeof s.claim !== 'string' || s.claim.trim().length < 15 ||
    typeof s.excerpt !== 'string' || s.excerpt.trim().length < 15 || s.excerpt.length > 1000)) {
    throw new Error('Two traceable public HTTPS sources with claims and excerpts required');
  }
  if (new Set(sources.map(s => s.url)).size !== sources.length) throw new Error('Sources must be distinct');
  const words = linkedinPost.split(/\s+/).length;
  const linkedLength = linkedInLength(linkedinPost);
  if (words < 150 || words > 300 || linkedLength > 3000) throw new Error('LinkedIn length invalid');
  if (xPost !== undefined && (xPost.length > 1500 || xPost.length < 80)) throw new Error('X post length invalid');
  for (const [text, min, max] of [[linkedinPost, 5, 7], ...(xPost === undefined ? [] : [[xPost, 2, 4]])]) {
    const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
    if (tags.length < min || tags.length > max || new Set(tags.map(t => t.toLowerCase())).size !== tags.length ||
      !/(?:#[\p{L}\p{N}_]+\s*)+$/u.test(text)) throw new Error('Invalid hashtags');
    if (text.split(/\n\s*\n/).length < 2 || /```|\*\*|^\s*\d+\/\d+/m.test(text)) throw new Error('Invalid platform formatting');
    if (!normalize(text.split('\n')[0]).includes(normalize(primaryKeyword))) throw new Error('Primary keyword missing from hook');
    if (/\b(?:hot take|unpopular opinion|game[ -]changer|as an ai)\b|\b(?:I|we)\s+(?:built|shipped|launched|deployed|saved|increased)\b/i.test(text)) {
      throw new Error('Unsupported personal claim or low-quality copy');
    }
  }
  if (!Array.isArray(draft.secondaryKeywords) || draft.secondaryKeywords.length < 2 ||
    draft.secondaryKeywords.length > 4 || draft.secondaryKeywords.some(k => typeof k !== 'string' ||
      !k.trim() || !normalize(linkedinPost).includes(normalize(k)))) throw new Error('Secondary keywords missing');
  const topicHash = digest(`${title}| ${topicAngle}`);
  if (findDuplicateTitle(title, previous.filter(p => p.title)) ||
    findDuplicateTitle(topicAngle, previous.filter(p => p.topicAngle && p.topicAngle !== 'legacy entry').map(p => p.topicAngle)) ||
    previous.some(p => p.topicHash === topicHash || [p.linkedinPost, p.xPost].filter(Boolean).some(text =>
      digest(text) === digest(linkedinPost) || (xPost !== undefined && digest(text) === digest(xPost))))) throw new Error('Duplicate topic, angle or content');
  const validated = { ...clean, ...(platform === undefined ? {} : { platform }), secondaryKeywords: draft.secondaryKeywords, sources: sources.map(s =>
    ({ url: s.url, claim: s.claim.trim(), excerpt: s.excerpt.trim() })), topicHash };
  return { ...validated, contentHash: contentHash(validated) };
}

function validateReview(review, draft, now = new Date()) {
  if (!review || review.approved !== true || review.qualityPassed !== true || review.originalityPassed !== true ||
    !Array.isArray(review.unsupportedClaims) || review.unsupportedClaims.length !== 0 ||
    !Array.isArray(review.sourceChecks) || review.sourceChecks.length !== draft.sources.length ||
    draft.sources.some(s => !review.sourceChecks.some(c => c.url === s.url && c.supported === true))) {
    throw new Error('Independent source and quality review failed');
  }
  return { passed: true, originalityPassed: true, version: 2, reviewedAt: now, contentHash: draft.contentHash,
    sourceChecks: draft.sources.map(s => ({ url: s.url, supported: true })) };
}
module.exports = { validateDraft, validateReview, digest, contentHash, publicSource, linkedInLength };
