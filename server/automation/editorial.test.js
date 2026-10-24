'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generationRequest, reviewRequest } = require('./codex');
const { linkedinDraft } = require('./testing/fixtures');

test('generation and independent review require LinkedIn plain text and relevant closing hashtags', () => {
  for (const platform of ['linkedin', undefined]) {
    const [generation] = generationRequest({ date: '2026-10-24', slot: 'morning', platform });
    const [review] = reviewRequest(linkedinDraft(), { platform });
    for (const prompt of [generation, review]) {
      assert.match(prompt, /LinkedIn.*plain text/);
      assert.match(prompt, /plain HTTPS URLs/);
      assert.match(prompt, /Markdown links/);
      assert.match(prompt, /bold, italics or backticks/);
      assert.match(prompt, /5–7 distinct, topic-relevant hashtags.*closing block/);
    }
  }
});

test('AI engineering editorial brief ranks researched topics without changing output schema', () => {
  const [prompt, schema] = generationRequest({
    date: '2026-10-24', slot: 'morning', previous: [], platform: 'linkedin'
  });
  assert.match(prompt, /Research 4–5 current candidate topics/);
  assert.match(prompt, /five equally weighted criteria/);
  assert.match(prompt, /AI agents, LLM reliability and evaluation, RAG/);
  assert.match(prompt, /lightly sarcastic engineering voice/);
  assert.match(prompt, /Do not claim first-hand experience/);
  assert.equal(schema.properties.xPost, undefined);
  assert.ok(schema.properties.linkedinPost);
  assert.ok(schema.properties.sources);
});

test('two-platform generation keeps X schema and editorial brief', () => {
  const [prompt, schema] = generationRequest({
    date: '2026-10-24', slot: 'manual', previous: [], platform: undefined
  });
  assert.match(prompt, /five equally weighted criteria/);
  assert.ok(schema.properties.xPost);
});
