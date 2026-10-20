'use strict';

const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');
function validateDraft(draft, previous = []) {
  if (!draft || typeof draft !== 'object') throw new Error('Missing draft');
  const { title, topicAngle, linkedinPost, xPost, sources } = draft;
  if (![title, topicAngle, linkedinPost, xPost].every(s => typeof s === 'string' && s.trim())) throw new Error('Incomplete posts');
  if (linkedinPost.trim() === xPost.trim()) throw new Error('Platform posts must differ');
  if (!Array.isArray(sources) || sources.length < 2 || sources.some(s => !s || !/^https:\/\//.test(s.url || '') || !s.claim)) throw new Error('Two traceable HTTPS sources required');
  const topicHash = digest(`${title}| ${topicAngle}`);
  if (previous.some(p => p.topicHash === topicHash || p.title?.toLowerCase() === title.toLowerCase())) throw new Error('Duplicate topic');
  if (xPost.length > 1500) throw new Error('X post exceeds premium limit');
  return { title: title.trim(), topicAngle: topicAngle.trim(), linkedinPost: linkedinPost.trim(), xPost: xPost.trim(), sources, topicHash };
}
module.exports = { validateDraft, digest };
