'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { slotAt, londonDate } = require('./slot');
const { parseRunArgs } = require('./run');
const { validateDraft, validateReview, contentHash } = require('./validate');
const { readConfig } = require('./config');
const { mongoUriFromEnv } = require('../config/db');
const { invokeCodex, codexEnvironment } = require('./codex');
const { draft, review, env, now } = require('./testing/fixtures');

test('UK scheduling follows both DST transitions and rejects outside slots', () => {
  for (const instant of ['2026-03-28T06:00:00Z', '2026-03-29T05:00:00Z', '2026-10-24T05:00:00Z', '2026-10-25T06:00:00Z']) {
    assert.equal(slotAt(new Date(instant)).slot, 'morning');
    assert.equal(slotAt(new Date(new Date(instant).getTime() + 12 * 3600000)).slot, 'evening');
  }
  for (const instant of ['2026-03-29T06:00:00Z', '2026-10-25T05:00:00Z', '2026-10-21T23:00:00Z']) {
    assert.throws(() => slotAt(new Date(instant)), /Outside/);
  }
});
test('manual entry points are explicit and scheduled runs are always LinkedIn-only', () => {
  const command = require('../../package.json').scripts['automation:dry-run'];
  assert.deepEqual(parseRunArgs(command.split(' ').slice(2)), { dryRun: true, manual: true });
  const publishCommand = require('../../package.json').scripts['automation:publish-manual'];
  assert.equal(publishCommand, 'node server/automation/run.js --publish --manual');
  assert.deepEqual(parseRunArgs(publishCommand.split(' ').slice(2)), { dryRun: false, manual: true });
  assert.equal(require('../../package.json').scripts['automation:run'], 'node server/automation/run.js');
  assert.deepEqual(parseRunArgs([]), { dryRun: true, manual: false, platform: 'linkedin' });
  assert.deepEqual(parseRunArgs(['--dry-run']), { dryRun: true, manual: false, platform: 'linkedin' });
  assert.deepEqual(parseRunArgs(['--publish']), { dryRun: false, manual: false, platform: 'linkedin' });
  assert.deepEqual(parseRunArgs(['--publish', '--platform=linkedin']), { dryRun: false, manual: false, platform: 'linkedin' });
  for (const args of [['--manual'], ['--dry-run', '--publish'], ['--manual', '--dry-run', '--publish'], ['--force'],
    ['--publish', '--platform=x'], ['--publish', '--platform=both']]) {
    assert.throws(() => parseRunArgs(args), /Use/);
  }
});
test('manual dates use London calendar days across midnight and DST', () => {
  assert.equal(londonDate(new Date('2026-10-21T23:35:00Z')), '2026-10-22');
  assert.equal(londonDate(new Date('2026-10-25T23:35:00Z')), '2026-10-25');
  assert.equal(londonDate(new Date('2026-03-29T23:35:00Z')), '2026-03-30');
});
test('MONGO_URI and legacy alias work, conflicting destinations fail closed', () => {
  assert.equal(mongoUriFromEnv({ MONGO_URI: 'a' }), 'a');
  assert.equal(mongoUriFromEnv({ MONGODB_URI: 'b' }), 'b');
  assert.equal(mongoUriFromEnv({ MONGO_URI: 'a', MONGODB_URI: 'a' }), 'a');
  assert.throws(() => mongoUriFromEnv({ MONGO_URI: 'a', MONGODB_URI: 'b' }), /Conflicting/);
});
test('dry-run is default even with enabled environment; publishing needs both explicit gates', () => {
  assert.equal(readConfig(env).publishEnabled, false);
  assert.equal(readConfig(env, { dryRun: false }).publishEnabled, true);
  assert.throws(() => readConfig({ ...env, AUTONOMOUS_PUBLISH_ENABLED: '' }, { dryRun: false }), /disabled/);
  assert.throws(() => readConfig({ ...env, MONGO_URI: '' }), /MONGO_URI/);
  for (const key of ['BUFFER_API_KEY', 'BUFFER_LINKEDIN_CHANNEL_ID', 'BUFFER_X_CHANNEL_ID']) {
    assert.throws(() => readConfig({ ...env, [key]: '' }, { dryRun: false }), /required/);
  }
  assert.throws(() => readConfig({ ...env, BUFFER_X_CHANNEL_ID: env.BUFFER_LINKEDIN_CHANNEL_ID }), /differ/);
});
test('valid platform copy and independent source review produce content-bound validation', async () => {
  const valid = validateDraft(draft());
  assert.equal(validateReview(await review(valid), valid, now).contentHash, contentHash(valid));
  assert.notEqual(contentHash(valid), contentHash({ ...valid, xPost: valid.xPost + ' changed' }));
});
test('duplicate titles, near titles, paraphrased angles and exact copy are rejected', () => {
  const value = draft();
  for (const prior of [value, { title: value.title.toUpperCase() },
    { title: 'New database transactions need failure boundaries' },
    { title: 'Completely different headline', topicAngle: value.topicAngle },
    { title: 'Different', xPost: value.xPost }]) {
    assert.throws(() => validateDraft(value, [prior]), /Duplicate/);
  }
});
test('missing, duplicated, private and noncanonical sources are rejected', () => {
  for (const sources of [[], [draft().sources[0], draft().sources[0]],
    draft().sources.map(s => ({ ...s, excerpt: '' })),
    draft().sources.map(s => ({ ...s, url: 'https://127.0.0.1/internal' })),
    draft().sources.map(s => ({ ...s, url: 'https://docs.example.com/?token=private' }))]) {
    assert.throws(() => validateDraft({ ...draft(), sources }), /source/i);
  }
});
test('length, hashtags, keywords, formatting and invented personal claims fail validation', () => {
  for (const patch of [{ linkedinPost: 'too short' }, { xPost: 'a'.repeat(1501) },
    { xPost: draft().xPost.replace(/#\w+/g, '') }, { primaryKeyword: 'Missing Keyword' },
    { secondaryKeywords: ['missing', 'also missing'] }, { xPost: draft().xPost + '\nWe shipped this yesterday.' },
    { xPost: draft().xPost.replace('Stable', '**Stable**') }]) {
    assert.throws(() => validateDraft({ ...draft(), ...patch }));
  }
});
test('source review fails closed on unsupported claims or missing source checks', async () => {
  const valid = validateDraft(draft());
  const approved = await review(valid);
  for (const patch of [{ approved: false }, { qualityPassed: false }, { originalityPassed: false },
    { originalityPassed: undefined }, { unsupportedClaims: ['Unsupported assertion'] },
    { sourceChecks: [] }, { sourceChecks: valid.sources.map(s => ({ url: s.url, supported: false })) }]) {
    assert.throws(() => validateReview({ ...approved, ...patch }, valid), /review failed/);
  }
});
test('Codex gets no application secrets, runs with live search and structured output, and removes scratch files', () => {
  assert.deepEqual(codexEnvironment({ PATH: '/bin', MONGO_URI: 'private', BUFFER_API_KEY: 'private' }), { PATH: '/bin' });
  let directory;
  const value = invokeCodex('Public research prompt', { type: 'object' }, {
    env: { PATH: '/bin', MONGO_URI: 'private', BUFFER_API_KEY: 'private' },
    execute(command, args, options) {
      directory = options.cwd;
      assert.equal(command, 'codex');
      assert(args.includes('--ignore-user-config'));
      assert(args.includes('features.shell_tool=false'));
      assert(args.includes('features.apps=false'));
      assert(args.includes('web_search="live"'));
      assert.equal(options.env.MONGO_URI, undefined);
      assert.equal(options.env.BUFFER_API_KEY, undefined);
      fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], '{"ok":true}');
      return { status: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'web_search' } }) };
    }
  });
  assert.deepEqual(value, { ok: true });
  assert.equal(fs.existsSync(directory), false);
  assert.throws(() => invokeCodex('prompt', {}, { execute: () => ({ status: 0, stdout: '{}' }) }), /research/);
  assert.throws(() => invokeCodex('prompt', {}, { execute: () => ({ status: 1, stderr: 'secret' }) }), /^Error: Codex research or structured output failed$/);
});

test('Codex rejects timeouts, invalid JSON, missing output and unexpected tool activity', () => {
  for (const result of [{ status: null, error: new Error('private timeout detail') },
    { status: 0, stdout: 'invalid JSON' },
    { status: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'web_search' } }) },
    { status: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'command_execution' } }) }]) {
    let directory;
    assert.throws(() => invokeCodex('prompt', {}, { execute(_command, _args, options) {
      directory = options.cwd;
      return result;
    } }), /^Error: Codex research or structured output failed$/);
    assert.equal(fs.existsSync(directory), false);
  }
});
