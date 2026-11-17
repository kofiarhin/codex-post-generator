'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDraft, validateLinkedInEditorial } = require('./validate');
const { readConfig, readSchedule } = require('./config');
const { slotScheduled, londonWeekday } = require('./slot');
const { generationRequest } = require('./codex');
const { run } = require('./run');
const { linkedinDraft, env } = require('./testing/fixtures');

const post = (hook, closing = 'Where does your team record an uncertain outcome?') =>
  `${hook}\n\nA request can time out after the database finished its work. The caller retries and a harmless retry becomes a second write.\n\nThat is the bug report nobody enjoys reading.\n\n${closing}\n\n#MongoDB #Retries #BackendEngineering #DistributedSystems #SoftwareEngineering`;

for (const hook of [
  'AI SDK telemetry deserves a test that checks what actually leaves your server.',
  'AI workers deserve a place in your rollback plan.',
  'Tool approval needs a resume-path test.',
  'Agent sandboxing gets interesting when the shell loses internet access.',
  'Reminder: idempotency keys expire.',
  'A very long hook line that goes on.\nAnd on for a second line.\nAnd then a third line that nobody sees.'
]) {
  test(`weak or reminder-style hooks are rejected: ${hook.split('\n')[0]}`, () => {
    assert.throws(() => validateLinkedInEditorial(post(hook)), { code: 'HOOK_WEAK' });
  });
}

for (const hook of [
  'Agent memory gets awkward when the agents overwrite each other’s homework.',
  'Group chat agents need a success state where nobody gets another message.',
  'Claude API conversations can break because you improved a tool description.\nExcellent plot twist for release day.'
]) {
  test(`concrete-failure hooks are accepted: ${hook.split('\n')[0]}`, () => {
    assert.doesNotThrow(() => validateLinkedInEditorial(post(hook)));
  });
}

test('the body must end with a reader question, ignoring source lines and hashtags', () => {
  const hook = 'Retries get awkward when the first write already landed.';
  assert.throws(() => validateLinkedInEditorial(post(hook, 'Design the retry boundary first.')), { code: 'CLOSING_QUESTION_MISSING' });
  const withSources = post(hook).replace('\n\n#MongoDB', '\n\nSources:\nMongoDB docs: https://www.mongodb.com/docs/manual/core/transactions/\n\n#MongoDB');
  assert.doesNotThrow(() => validateLinkedInEditorial(withSources));
  assert.doesNotThrow(() => validateDraft(linkedinDraft(), [], { platform: 'linkedin' }));
});

test('posting defaults to one weekday-morning slot and stays configurable', () => {
  assert.deepEqual(readSchedule({}), { slots: ['morning'], days: ['mon', 'tue', 'wed', 'thu', 'fri'] });
  assert.deepEqual(readSchedule({ POST_SLOTS: 'Morning, evening', POST_DAYS: 'sat' }), { slots: ['morning', 'evening'], days: ['sat'] });
  assert.throws(() => readSchedule({ POST_SLOTS: 'noon' }), /POST_SLOTS/);
  assert.throws(() => readSchedule({ POST_DAYS: '' }), /POST_DAYS/);
  const schedule = readSchedule({});
  const wednesday = new Date('2026-10-21T05:00:00Z');
  const saturday = new Date('2026-10-24T05:00:00Z');
  assert.equal(londonWeekday(wednesday), 'wed');
  assert.equal(slotScheduled(wednesday, 'morning', schedule), true);
  assert.equal(slotScheduled(wednesday, 'evening', schedule), false);
  assert.equal(slotScheduled(saturday, 'morning', schedule), false);
});

test('unscheduled slots exit before database, engine or Buffer access', async () => {
  const { POST_SLOTS, POST_DAYS, ...defaults } = env;
  const fail = () => { throw new Error('must not be called'); };
  const result = await run({ now: new Date('2026-10-21T17:00:00Z'), dryRun: false, env: defaults,
    generate: fail, review: fail, store: { initialize: fail }, buffer: { publish: fail } });
  assert.equal(result.skipped, true);
  assert.equal(result.published, false);
  assert.equal(result.requiresAttention, false);
  assert.equal(readConfig(defaults, { dryRun: true, platform: 'linkedin' }).schedule.slots.join(), 'morning');
});

test('editorial failures get one revision pass, then fail closed', async () => {
  const weak = { ...linkedinDraft(), linkedinPost: linkedinDraft().linkedinPost.replace(
    'Database transactions make a promise worth reading carefully.', 'Database transactions deserve a test that covers timeouts.') };
  const requests = [];
  const store = { initialize: async () => {}, acquire: async () => {}, release: async () => {}, get: async () => null,
    history: async () => [], save: async doc => doc };
  const review = async value => ({ approved: true, qualityPassed: true, originalityPassed: true, unsupportedClaims: [],
    sourceChecks: value.sources.map(s => ({ url: s.url, supported: true })) });
  const engines = { record: () => ({}) };
  const options = generate => ({ now: new Date('2026-10-21T05:00:00Z'), env, store, review, engines, generate,
    manualHistory: () => [] });
  const fixed = await run(options(async input => { requests.push(input); return requests.length === 1 ? weak : linkedinDraft(); }));
  assert.equal(fixed.stored, true);
  assert.deepEqual(requests[1].revision.editorial, ['HOOK_WEAK']);
  await assert.rejects(run(options(async () => weak)), { code: 'HOOK_WEAK' });
});

test('generation prompt carries the analytics-grounded hook, question and audience rules', () => {
  const [prompt] = generationRequest({ date: '2026-11-17', slot: 'morning', platform: 'linkedin' });
  assert.match(prompt, /concrete failure an engineer can picture/);
  assert.match(prompt, /Never open with a reminder or lecture such as "X deserves a test/);
  assert.match(prompt, /end the body with one genuine question/);
  assert.match(prompt, /Accra or London/);
  const [revision] = generationRequest({ date: '2026-11-17', slot: 'morning', platform: 'linkedin',
    revision: { draft: linkedinDraft(), editorial: ['HOOK_WEAK'] } });
  assert.match(revision, /failed editorial validation \(HOOK_WEAK\)/);
});
