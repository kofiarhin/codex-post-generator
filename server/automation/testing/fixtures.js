'use strict';

function draft() {
  return {
    title: 'Database transactions need failure boundaries', topicAngle: 'Atomic writes and retry boundaries in database transactions',
    primaryKeyword: 'Database transactions', secondaryKeywords: ['atomic writes', 'retry boundaries'],
    linkedinPost: `Database transactions make a promise worth reading carefully.

A request can fail after the database has finished its work. The application sees a timeout, the caller clicks again, and suddenly a harmless retry becomes a second operation. A green test with one request tells us very little about that particular afternoon.

MongoDB documents atomic writes at the single document level. Its transaction documentation describes how to group changes when the operation spans multiple documents. Those are useful tools, but they still need a design that matches the promise the application makes to its caller.

The practical question is where to put retry boundaries. Give the operation a stable identity, record its progress, and decide what evidence is needed before trying again. A missing response is not proof that nothing happened.

That makes debugging less theatrical. Instead of guessing from a stack trace, the next engineer can inspect an operation record and understand what is known, what failed, and what still needs checking.

Where does your service record an uncertain outcome?

#MongoDB #DatabaseTransactions #BackendEngineering #DistributedSystems #SoftwareEngineering`,
    xPost: `Database transactions cannot explain a missing response on their own.

The request times out. The caller retries. Now someone has to work out whether the first operation finished before the connection disappeared.

Stable operation IDs and explicit retry boundaries make that investigation less painful. Keep the evidence you need to distinguish a rejected request from an unknown outcome. Otherwise the retry button becomes a very confident guess.

#MongoDB #DistributedSystems #BackendEngineering`,
    sources: [
      { url: 'https://www.mongodb.com/docs/manual/core/write-operations-atomicity/', claim: 'Single document writes are atomic.', excerpt: 'a write operation is atomic on the level of a single document' },
      { url: 'https://www.mongodb.com/docs/manual/core/transactions/', claim: 'Transactions support operations on multiple documents.', excerpt: 'For situations that require atomicity of reads and writes to multiple documents' }
    ]
  };
}
// Scheduled runs are LinkedIn-only; manual runs without a platform remain two-platform.
const linkedinDraft = () => {
  const { xPost, ...value } = draft();
  return value;
};
const draftFor = ({ platform } = {}) => (platform === 'linkedin' ? linkedinDraft() : draft());
const review = async value => ({ approved: true, qualityPassed: true, originalityPassed: true, unsupportedClaims: [],
  sourceChecks: value.sources.map(s => ({ url: s.url, supported: true })) });
const env = { MONGO_URI: 'mongodb://127.0.0.1:27017/test', BUFFER_API_KEY: 'test-only-key',
  BUFFER_LINKEDIN_CHANNEL_ID: 'test-linkedin', BUFFER_X_CHANNEL_ID: 'test-x', AUTONOMOUS_PUBLISH_ENABLED: 'true' };
const now = new Date('2026-10-21T05:00:00Z');
module.exports = { draft, linkedinDraft, draftFor, review, env, now };
