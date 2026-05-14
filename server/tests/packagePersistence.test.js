'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildPackageDocument,
  parseLogEntry,
  upsertPackageDocument
} = require('../utils/packagePersistence');

describe('packagePersistence', () => {
  test('parseLogEntry extracts structured log fields', () => {
    expect(parseLogEntry('2026-05-14 | Durable AI Agents | AI agent testing | debugging long-running workflows')).toEqual({
      title: 'Durable AI Agents',
      primaryKeyword: 'AI agent testing',
      topicAngle: 'debugging long-running workflows'
    });
  });

  test('buildPackageDocument reads finalized package files and receipt metadata', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'post-generator-'));
    const slug = 'durable-ai-agents';
    const packageDir = path.join(repoRoot, '_post_suggestion', slug);
    fs.mkdirSync(packageDir, { recursive: true });

    fs.writeFileSync(path.join(packageDir, 'linkedin_post.txt'), 'LinkedIn copy\n', 'utf8');
    fs.writeFileSync(path.join(packageDir, 'x_post.txt'), 'X copy\n', 'utf8');
    fs.writeFileSync(path.join(packageDir, 'prompt.txt'), 'Prompt copy\n', 'utf8');
    fs.writeFileSync(path.join(packageDir, 'thumbnail.png'), 'png placeholder', 'utf8');
    fs.writeFileSync(
      path.join(packageDir, 'workflow_receipts.json'),
      JSON.stringify({
        title: 'Durable AI Agents',
        slug,
        stages: {
          thumbnail: {
            thumbnailFileName: 'thumbnail.png',
            provider: 'local',
            model: 'local-node-png-renderer',
            fallbackUsed: true,
            fallbackReason: 'test fallback'
          },
          finalizer: {
            logEntry: '2026-05-14 | Durable AI Agents | AI agent testing | debugging long-running workflows'
          }
        }
      }),
      'utf8'
    );

    const document = buildPackageDocument({ slug, packageDir, repoRoot });

    expect(document).toMatchObject({
      title: 'Durable AI Agents',
      slug,
      primaryKeyword: 'AI agent testing',
      topicAngle: 'debugging long-running workflows',
      linkedinPost: 'LinkedIn copy',
      xPost: 'X copy',
      prompt: 'Prompt copy',
      thumbnailPath: '_post_suggestion/durable-ai-agents/thumbnail.png',
      thumbnailFileName: 'thumbnail.png',
      packageDir: '_post_suggestion/durable-ai-agents',
      provider: 'local',
      model: 'local-node-png-renderer',
      fallbackUsed: true,
      fallbackReason: 'test fallback',
      workflowReceiptPath: '_post_suggestion/durable-ai-agents/workflow_receipts.json'
    });
  });

  test('upsertPackageDocument upserts by slug', async () => {
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ slug: 'durable-ai-agents' })
    };
    const document = { slug: 'durable-ai-agents', title: 'Durable AI Agents' };

    await expect(upsertPackageDocument(document, { model })).resolves.toEqual({ slug: 'durable-ai-agents' });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { slug: 'durable-ai-agents' },
      { $set: document },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  });
});
