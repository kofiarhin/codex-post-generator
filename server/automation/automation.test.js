'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slotAt } = require('./slot');
const { validateDraft } = require('./validate');
const { run } = require('./run');
const draft = { title: 'Engineering tradeoffs', topicAngle: 'testing',
  linkedinPost: 'Longer LinkedIn text', xPost: 'Short X text',
  sources: [{ url: 'https://example.org/a', claim: 'claim a' }, { url: 'https://example.org/b', claim: 'claim b' }] };
test('UK summer time and winter time slots', () => {
  assert.equal(slotAt(new Date('2026-07-01T05:00:00Z')).slot, 'morning');
  assert.equal(slotAt(new Date('2026-12-01T06:00:00Z')).slot, 'morning');
  assert.equal(slotAt(new Date('2026-07-01T17:00:00Z')).slot, 'evening');
  assert.throws(() => slotAt(new Date('2026-07-01T06:00:00Z')));
});
test('rejects duplicates and missing evidence', () => {
  const valid = validateDraft(draft);
  assert.throws(() => validateDraft(draft, [valid]), /Duplicate/);
  assert.throws(() => validateDraft({ ...draft, sources: [] }), /sources/);
});
test('dry run never publishes', async () => {
  let stored;
  const result = await run({ now: new Date('2026-07-01T05:00:00Z'),
    generate: async () => draft, persist: async doc => { stored = doc; return true; } });
  assert.equal(result.published, false);
  assert.equal(stored.platforms.x, 'not_published');
});
