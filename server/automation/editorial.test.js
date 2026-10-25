'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generationRequest, reviewRequest } = require('./codex');
const { validateLinkedInFormatting } = require('./validate');
const { linkedinDraft } = require('./testing/fixtures');

test('LinkedIn writing guides and automation agree on the strict hashtag range', () => {
  const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
  const guides = [
    ['ChatGPT writing voice', read('chatgpt/linkedin-writing-voice.md').split('## Ending')[1]],
    ['orchestrator style guide', read('.agents/skills/linkedin-post-orchestrator/assets/post-style-guide.md')
      .split('## Hashtag Rules')[1].split('### X')[0]],
    ...['linkedin', undefined].flatMap(platform => [
      [`generation (${platform || 'both'})`, generationRequest({ date: '2026-10-25', slot: 'manual', platform })[0]],
      [`review (${platform || 'both'})`, reviewRequest(linkedinDraft(), { platform })[0]]
    ])
  ];
  for (const [name, text] of guides) {
    const range = text.match(/(\d+)(?:–| to )(\d+) (?:distinct, topic-relevant |relevant )?hashtags/);
    assert.ok(range, `${name} must specify a hashtag count`);
    const [min, max] = range.slice(1).map(Number);
    assert.deepEqual([min, max], [5, 7], `${name} must require 5–7 LinkedIn hashtags`);
    for (let count = min - 1; count <= max + 1; count++) {
      const post = `Engineering observation.\n\n${Array.from({ length: count }, (_, i) => `#Topic${i}`).join(' ')}`;
      if (count >= min && count <= max) assert.doesNotThrow(() => validateLinkedInFormatting(post), name);
      else assert.throws(() => validateLinkedInFormatting(post), { code: 'HASHTAGS_INVALID' }, name);
    }
  }
});

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
