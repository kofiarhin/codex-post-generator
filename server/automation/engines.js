'use strict';

const { invokeCodex, generationRequest, reviewRequest, CodexRateLimited } = require('./codex');
const { invokeClaude } = require('./claude');
const { failure, safeFailureCode } = require('./errors');

// One session per post: Codex is always tried first. Only a recognized Codex usage/rate limit switches
// the rest of that post (generation and review) to Claude. The next post starts with Codex again.
function createEngineSession({ codex = invokeCodex, claude = invokeClaude, codexOptions, claudeOptions } = {}) {
  const session = { codexRateLimited: false, used: {} };
  session.invoke = (stage, prompt, schema) => {
    if (!session.codexRateLimited) {
      try {
        const value = codex(prompt, schema, codexOptions);
        session.used[stage] = 'codex';
        return value;
      } catch (error) {
        if (!(error instanceof CodexRateLimited)) throw error;
        session.codexRateLimited = true;
      }
    }
    try {
      const value = claude(prompt, schema, claudeOptions);
      session.used[stage] = 'claude';
      return value;
    } catch (error) {
      const wrapped = failure(safeFailureCode(error) || 'CLAUDE_FAILED');
      wrapped.message = 'Codex is rate limited and the Claude fallback failed; nothing was saved or published';
      wrapped.codexRateLimited = true;
      throw wrapped;
    }
  };
  // Persisted on the draft so every stored post records which engine produced and reviewed it.
  session.record = () => ({ engine: session.used.generation, reviewEngine: session.used.review,
    codexRateLimited: session.codexRateLimited });
  return session;
}

function generateWithFallback({ engines = createEngineSession(), ...input }) {
  return engines.invoke('generation', ...generationRequest(input));
}

function reviewWithFallback(draft, { engines = createEngineSession(), previous, date, slot, platform } = {}) {
  return engines.invoke('review', ...reviewRequest(draft, { previous, date, slot, platform }));
}
module.exports = { createEngineSession, generateWithFallback, reviewWithFallback };
