import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReindexPayload, shouldQueueReindex } from '../src/context-sync.js';

test('queues reindex on pr.merged', () => {
  assert.equal(shouldQueueReindex('pr.merged', []), true);
});

test('queues reindex only when markdown file changed', () => {
  assert.equal(shouldQueueReindex('markdown.updated', ['src/index.ts']), false);
  assert.equal(shouldQueueReindex('markdown.updated', ['docs/architecture.md']), true);
  assert.equal(shouldQueueReindex('markdown.updated', ['memory_bank/README.mdx']), true);
});

test('buildReindexPayload maps repo fields', () => {
  const payload = buildReindexPayload({ id: 'repo-1', repoName: 'core', repoPath: '/tmp/core' });
  assert.deepEqual(payload, { repo_id: 'repo-1', path: '/tmp/core', name: 'core', agent_id: 'shared' });
});
