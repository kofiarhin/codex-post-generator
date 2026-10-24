'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeFailureDiagnostic } = require('./run');

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
