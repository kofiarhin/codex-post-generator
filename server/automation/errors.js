'use strict';

// Only locally defined codes/messages may cross the CLI diagnostic boundary.
// Never derive diagnostic text from model output, stderr, URLs or exception messages.
const messages = {
  DRAFT_MISSING: 'Missing draft',
  DRAFT_PLATFORM_MISMATCH: 'Draft platform selection mismatch',
  DRAFT_INCOMPLETE: 'Incomplete posts',
  METADATA_TOO_LONG: 'Metadata too long',
  PLATFORM_POSTS_IDENTICAL: 'Platform posts must differ',
  SOURCES_INVALID: 'Two traceable public HTTPS sources with claims and excerpts required',
  SOURCES_DUPLICATE: 'Sources must be distinct',
  LINKEDIN_LENGTH: 'LinkedIn length invalid',
  X_LENGTH: 'X post length invalid',
  LINKEDIN_MARKDOWN: 'LinkedIn must use plain text and plain URLs, not Markdown',
  LINKEDIN_ESCAPING: 'LinkedIn must contain decoded plain text without backslashes or control characters',
  HASHTAGS_INVALID: 'Invalid hashtags',
  FORMATTING_INVALID: 'Invalid platform formatting',
  PRIMARY_KEYWORD_MISSING: 'Primary keyword missing from hook',
  COPY_QUALITY_INVALID: 'Unsupported personal claim or low-quality copy',
  SECONDARY_KEYWORDS_MISSING: 'Secondary keywords missing',
  DUPLICATE_CONTENT: 'Duplicate topic, angle or content',
  REVIEW_REJECTED: 'Independent source and quality review failed',
  CODEX_RATE_LIMITED: 'Codex usage or rate limit reached'
};
for (const engine of ['CODEX', 'CLAUDE']) {
  for (const reason of ['FAILED', 'TIMEOUT', 'UNAVAILABLE', 'OUTPUT_LIMIT', 'PROCESS_FAILED',
    'EVENTS_INVALID', 'TURN_FAILED', 'UNEXPECTED_TOOL', 'RESEARCH_MISSING', 'OUTPUT_MISSING', 'OUTPUT_INVALID']) {
    messages[`${engine}_${reason}`] = `${engine === 'CODEX' ? 'Codex' : 'Claude'} research or structured output failed`;
  }
}

class AutomationError extends Error {
  constructor(code) {
    super(Object.hasOwn(messages, code) ? messages[code] : 'Automation failed');
    this.code = Object.hasOwn(messages, code) ? code : 'AUTOMATION_FAILED';
  }
}

const failure = code => new AutomationError(code);
const safeFailureCode = error => typeof error?.code === 'string' && Object.hasOwn(messages, error.code)
  ? error.code : undefined;

function processFailure(engine, result) {
  const reasons = { ETIMEDOUT: 'TIMEOUT', ENOENT: 'UNAVAILABLE', EACCES: 'UNAVAILABLE', ENOBUFS: 'OUTPUT_LIMIT' };
  const code = result?.error?.code;
  return failure(`${engine}_${Object.hasOwn(reasons, code) ? reasons[code] : 'PROCESS_FAILED'}`);
}

module.exports = { AutomationError, failure, safeFailureCode, processFailure };
