'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDraft, contentHash } = require('./validate');
const { linkedinDraft } = require('./testing/fixtures');
const validate = value => validateDraft(value, [], { platform: 'linkedin' });
const withSource = source => {
  const value = linkedinDraft();
  value.linkedinPost = value.linkedinPost.replace('\n\n#MongoDB', `\n\n${source}\n\n#MongoDB`);
  return value;
};

for (const source of [
  '[MongoDB’s explanation](https://www.mongodb.com/docs/manual/core/transactions/)',
  '[MongoDB’s explanation](<https://www.mongodb.com/docs/manual/core/transactions/>)',
  '[MongoDB’s explanation](https://www.mongodb.com/docs/manual/core/transactions/ "Transactions")',
  '[MongoDB’s explanation]\n(https://www.mongodb.com/docs/manual/core/transactions/)',
  '[MongoDB’s\nexplanation](https://www.mongodb.com/docs/manual/core/transactions/)',
  '[MongoDB’s explanation][docs]', '[MongoDB’s explanation][]',
  '[docs]: https://www.mongodb.com/docs/manual/core/transactions/',
  '<https://www.mongodb.com/docs/manual/core/transactions/>',
  '**Further reading**', '__Further reading__', '*Further reading*', '_Further reading_',
  '*x*', '_x_',
  '<HTTPS://www.mongodb.com/docs/manual/core/transactions/>', '`retry`', '## Further reading'
]) {
  test(`LinkedIn validation rejects Markdown: ${source}`, () => {
    assert.throws(() => validate(withSource(source)), /LinkedIn.*plain text/);
  });
}

test('plain URLs, punctuation and technical brackets survive validation and hashing unchanged', () => {
  const source = 'MongoDB’s explanation: https://www.mongodb.com/docs/manual/core/transactions/\n' +
    'Reading notes [optional]: https://www.mongodb.com/docs/manual/core/write-operations-atomicity/#atomicity';
  const value = withSource(source);
  const result = validate(value);
  assert.equal(result.linkedinPost, value.linkedinPost);
  assert.deepEqual(result.sources, value.sources);
  assert.equal(result.contentHash, contentHash(result));
});

test('Markdown-like characters in plain URLs and technical identifiers remain plain text', () => {
  const value = withSource('Reference: https://www.mongodb.com/docs/manual/__transactions__/?filter=[value](literal)**\n' +
    'Use retry_count and operation_id fields; reading notes [optional].');
  assert.equal(validate(value).linkedinPost, value.linkedinPost);
});

for (const count of [5, 6, 7]) {
  test(`LinkedIn accepts ${count} distinct closing hashtags`, () => {
    const value = linkedinDraft();
    value.linkedinPost += ['#DatabaseDesign', '#Reliability'].slice(0, count - 5).map(tag => `\n${tag}`).join('');
    assert.equal(validate(value).linkedinPost, value.linkedinPost);
  });
}

for (const [name, change] of [
  ['no tags', text => text.replace(/\n\n#MongoDB[^]*$/, '')],
  ['four tags', text => text.replace(' #SoftwareEngineering', '')],
  ['eight tags', text => `${text} #DatabaseDesign #Reliability #MongoDBTransactions`],
  ['duplicate tags', text => text.replace('#SoftwareEngineering', '#mongodb')],
  ['tags in body with only one at end', text => text.replace('A request', '#MongoDB #DatabaseTransactions #BackendEngineering #DistributedSystems\n\nA request')
    .replace('#MongoDB #DatabaseTransactions #BackendEngineering #DistributedSystems #SoftwareEngineering', '#SoftwareEngineering')],
  ['prose after tags', text => `${text}\nFurther reading: https://www.mongodb.com/docs/manual/`],
  ['punctuated body hashtag', text => text.replace('A request', 'A request (#MongoDB)')],
  ['joined tags', text => text.replace('#MongoDB #DatabaseTransactions', '#MongoDB#DatabaseTransactions')],
  ['label before closing block', text => text.replace('\n\n#MongoDB', '\n\nHashtags: #MongoDB')],
  ['comma-separated tags', text => text.replace('#MongoDB #DatabaseTransactions', '#MongoDB, #DatabaseTransactions')],
  ['punctuation after tags', text => `${text}.`]
]) {
  test(`LinkedIn rejects invalid closing hashtags: ${name}`, () => {
    const value = linkedinDraft();
    value.linkedinPost = change(value.linkedinPost);
    assert.throws(() => validate(value), { code: 'HASHTAGS_INVALID', message: 'Invalid hashtags' });
  });
}
