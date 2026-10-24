'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const repoRoot = path.resolve(__dirname, '../..');
const RESEARCH_TOOLS = ['WebSearch', 'WebFetch'];

function claudeEnvironment(env = process.env) {
  // HOME carries the CLI's own login. Application DB/Buffer credentials and API keys are never inherited.
  return Object.fromEntries(['PATH', 'HOME', 'CLAUDE_CONFIG_DIR', 'TMPDIR', 'LANG', 'SYSTEMROOT']
    .filter(k => env[k]).map(k => [k, env[k]]));
}

// Fallback engine: same prompt and JSON schema as Codex, web research only, no command/file/MCP tools.
function invokeClaude(prompt, schema, { execute = spawnSync, env = process.env } = {}) {
  const root = path.join(repoRoot, '_post_suggestion');
  fs.mkdirSync(root, { recursive: true });
  const work = fs.mkdtempSync(path.join(root, '.automation-claude-'));
  try {
    const result = execute('claude', ['-p', '--restricted', '--strict-mcp-config', '--setting-sources', '',
      '--disable-slash-commands', '--no-session-persistence', '--permission-mode', 'dontAsk',
      '--tools', RESEARCH_TOOLS.join(','), '--allowedTools', RESEARCH_TOOLS.join(','),
      '--output-format', 'stream-json', '--verbose', '--json-schema', JSON.stringify(schema)], {
      cwd: work, env: claudeEnvironment(env), input: prompt, encoding: 'utf8', timeout: 300000,
      maxBuffer: 16 * 1024 * 1024, killSignal: 'SIGKILL'
    });
    if (result.error || result.status !== 0) throw new Error('Claude research failed');
    const events = result.stdout.trim().split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    const tools = events.filter(e => e.type === 'assistant').flatMap(e => e.message?.content || [])
      .filter(c => c.type === 'tool_use').map(c => c.name);
    if (tools.some(name => ![...RESEARCH_TOOLS, 'StructuredOutput'].includes(name))) {
      throw new Error('Unexpected Claude tool activity');
    }
    // Opening sources with WebFetch is live research too (the review stage mostly fetches cited URLs).
    if (!tools.some(name => RESEARCH_TOOLS.includes(name))) throw new Error('Claude did not perform web research');
    const final = events.filter(e => e.type === 'result').at(-1);
    if (!final || final.subtype !== 'success' || final.is_error !== false ||
      !final.structured_output || typeof final.structured_output !== 'object') {
      throw new Error('Claude structured output missing');
    }
    return final.structured_output;
  } catch {
    // CLI output and malformed generated content are never included in logs/errors.
    throw new Error('Claude research or structured output failed');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
module.exports = { invokeClaude, claudeEnvironment };
