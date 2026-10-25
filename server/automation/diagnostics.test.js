'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run, safeFailureDiagnostic } = require('./run');
const { invokeCodex, CodexRateLimited } = require('./codex');
const { invokeClaude } = require('./claude');
const { createEngineSession } = require('./engines');
const { linkedinDraft, review, env, now } = require('./testing/fixtures');
const fs = require('node:fs');

const secret = 'private-token https://example.com/?token=private-token';
const events = (...items) => items.map(item => JSON.stringify(item)).join('\n');
const search = { type: 'item.completed', item: { type: 'web_search' } };

for (const [reason, result] of [
  ['TIMEOUT', { error: Object.assign(new Error(secret), { code: 'ETIMEDOUT' }), status: null }],
  ['UNAVAILABLE', { error: Object.assign(new Error(secret), { code: 'ENOENT' }), status: null }],
  ['OUTPUT_LIMIT', { error: Object.assign(new Error(secret), { code: 'ENOBUFS' }), status: null }],
  ['PROCESS_FAILED', { status: 1, stderr: secret }],
  ['EVENTS_INVALID', { status: 0, stdout: secret }],
  ['TURN_FAILED', { status: 0, stdout: events({ type: 'turn.failed', error: { message: secret } }) }],
  ['UNEXPECTED_TOOL', { status: 0, stdout: events(search, { item: { type: 'command_execution' } }) }],
  ['RESEARCH_MISSING', { status: 0, stdout: events({ type: 'turn.completed' }) }],
  ['OUTPUT_MISSING', { status: 0, stdout: events(search) }]
]) {
  test(`Codex preserves safe failure code: ${reason}`, () => {
    let directory;
    assert.throws(() => invokeCodex('p', {}, { execute(_command, _args, options) {
      directory = options.cwd;
      return result;
    } }), error => {
      assert.equal(error.code, `CODEX_${reason}`);
      assert.match(safeFailureDiagnostic(error), new RegExp(`CODEX_${reason}`));
      assert.doesNotMatch(safeFailureDiagnostic(error) + String(error), /private-token|example\.com/);
      return true;
    });
    assert.equal(fs.existsSync(directory), false);
  });
}

test('invalid Codex output preserves its code without retaining generated content', () => {
  assert.throws(() => invokeCodex('p', {}, { execute(_command, args) {
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], secret);
    return { status: 0, stdout: events(search) };
  } }), { code: 'CODEX_OUTPUT_INVALID' });
});

test('fallback preserves the Claude failure code and safe rate-limit context', () => {
  const session = createEngineSession({
    codex: () => { throw new CodexRateLimited(); },
    claude: () => invokeClaude('p', {}, { execute: () => ({ status: 1, stderr: secret }) })
  });
  assert.throws(() => session.invoke('generation', 'p', {}), error => {
    assert.equal(error.code, 'CLAUDE_PROCESS_FAILED');
    assert.equal(error.codexRateLimited, true);
    assert.match(safeFailureDiagnostic(error), /CLAUDE_PROCESS_FAILED/);
    assert.doesNotMatch(String(error) + safeFailureDiagnostic(error), /private-token|example\.com/);
    return true;
  });
});

const claudeSearch = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebFetch' }] } };
for (const [reason, result] of [
  ['TIMEOUT', { error: { code: 'ETIMEDOUT', message: secret }, status: null }],
  ['UNAVAILABLE', { error: { code: 'ENOENT', message: secret }, status: null }],
  ['OUTPUT_LIMIT', { error: { code: 'ENOBUFS', message: secret }, status: null }],
  ['EVENTS_INVALID', { status: 0, stdout: secret }],
  ['UNEXPECTED_TOOL', { status: 0, stdout: events(claudeSearch,
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }) }],
  ['RESEARCH_MISSING', { status: 0, stdout: events({ type: 'result' }) }],
  ['OUTPUT_MISSING', { status: 0, stdout: events(claudeSearch) }],
  ['TURN_FAILED', { status: 0, stdout: events(claudeSearch, { type: 'result', subtype: 'error', message: secret }) }],
  ['OUTPUT_INVALID', { status: 0, stdout: events(claudeSearch, { type: 'result', subtype: 'success', is_error: false }) }]
]) {
  test(`Claude preserves safe failure code: ${reason}`, () => {
    assert.throws(() => invokeClaude('p', {}, { execute: () => result }), error => {
      assert.equal(error.code, `CLAUDE_${reason}`);
      assert.doesNotMatch(String(error) + safeFailureDiagnostic(error), /private-token|example\.com/);
      return true;
    });
  });
}

test('known codes do not expose untrusted messages, metadata or coerced code objects', () => {
  const error = { name: 'Error', automationPhase: 'draft-validation', code: 'LINKEDIN_MARKDOWN',
    message: secret, stack: secret, cause: new Error(secret), codexRateLimited: secret, engine: secret };
  assert.match(safeFailureDiagnostic(error), /LINKEDIN_MARKDOWN/);
  assert.doesNotMatch(safeFailureDiagnostic(error), /private-token|example\.com|CODEX_RATE_LIMITED/);
  for (const code of [secret, 'CODEX_' + secret, { toString: () => 'LINKEDIN_MARKDOWN' }, ['LINKEDIN_MARKDOWN']]) {
    assert.doesNotMatch(safeFailureDiagnostic({ ...error, code }), /private-token|example\.com|LINKEDIN_MARKDOWN/);
  }
});

for (const dryRun of [true, false]) {
  for (const kind of ['generation', 'formatting', 'duplicate', 'review', 'review-validation']) {
    test(`${dryRun ? 'dry' : 'live'} ${kind} failure has a precise diagnostic and no publication side effects`, async () => {
      const calls = [];
      const store = {
        initialize: async () => {}, acquire: async () => {}, get: async () => null,
        history: async () => kind === 'duplicate' ? [linkedinDraft()] : [],
        save: async () => { calls.push('save'); },
        release: async () => { calls.push('release'); }
      };
      await assert.rejects(run({ dryRun, manual: true, platform: 'linkedin', env, now, store,
        manualHistory: () => [],
        generate: async () => {
          calls.push('generate');
          if (kind === 'generation') return invokeCodex('p', {}, { execute: () => ({ status: 1, stderr: secret }) });
          const value = linkedinDraft();
          if (kind === 'formatting') value.linkedinPost = value.linkedinPost.replace('A request', '**A request**');
          return value;
        },
        review: async value => {
          calls.push('review');
          if (kind === 'review') return invokeCodex('p', {}, { execute: () => ({ status: 1, stderr: secret }) });
          return { ...await review(value), approved: false };
        },
        buffer: new Proxy({}, { get() { calls.push('buffer'); throw new Error('Buffer forbidden'); } })
      }), error => {
        assert.equal(error.automationPhase, ['formatting', 'duplicate'].includes(kind) ? 'draft-validation' : kind);
        assert.equal(error.code, { generation: 'CODEX_PROCESS_FAILED', formatting: 'LINKEDIN_MARKDOWN',
          duplicate: 'DUPLICATE_CONTENT', review: 'CODEX_PROCESS_FAILED', 'review-validation': 'REVIEW_REJECTED' }[kind]);
        assert.match(safeFailureDiagnostic(error), new RegExp(error.code));
        return true;
      });
      // A persistent rejection gets exactly one revision and fresh review before failing closed.
      assert.deepEqual(calls, kind === 'review-validation' ? ['generate', 'review', 'generate', 'review', 'release']
        : kind === 'review' ? ['generate', 'review', 'release'] : ['generate', 'release']);
    });
  }
}

test('failure diagnostics expose only a recognized stage and error class', () => {
  const error = new Error('secret=private-token https://example.com/token');
  error.automationPhase = 'generation-validation';
  assert.equal(safeFailureDiagnostic(error),
    'Automation failed at generation-validation (Error). No automatic retry. Inspect the stored publication state before any new live attempt.');
});

test('failure diagnostics do not leak untrusted fields', () => {
  const error = { name: 'API_KEY=secret', automationPhase: 'secret-phase',
    message: 'secret-token', stack: 'secret-stack', code: 'secret-code' };
  const output = safeFailureDiagnostic(error);
  assert.match(output, /startup-or-cleanup \(Error\)/);
  assert.doesNotMatch(output, /secret|token|stack|API_KEY/);
});
