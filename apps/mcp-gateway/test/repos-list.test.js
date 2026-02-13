import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { appendAudit, upsertRepoIndex } from '../src/store.js';

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gateway-repos-list-test-'));
}

test('GET /v1/index/repos returns indexed repo summaries', async () => {
  const root = withTempDir();
  const dataDir = path.join(root, 'data');
  const previousDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  upsertRepoIndex('demo', {
    repoId: 'repo-1',
    repoName: 'demo',
    repoPath: '/tmp/demo',
    sourceRepoPath: 'https://github.com/org/demo',
    worktreePath: '/workdir/worktrees/demo/shared',
    agentId: 'shared',
    indexedAt: new Date().toISOString(),
    files: [{ chunks: [{ content: 'a' }, { content: 'b' }] }]
  });

  appendAudit({ at: new Date().toISOString(), tool: 'repo_index', repo: 'demo', ok: true });

  const app = createApp({ readVersion: () => 'test-version' });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const reposResponse = await fetch(`http://127.0.0.1:${port}/v1/index/repos`);
    const reposBody = await reposResponse.json();
    assert.equal(reposResponse.status, 200);
    assert.equal(reposBody.ok, true);
    assert.equal(reposBody.data.total, 1);
    assert.equal(reposBody.data.repos[0].repo_name, 'demo');
    assert.equal(reposBody.data.repos[0].files_indexed, 1);
    assert.equal(reposBody.data.repos[0].chunks_indexed, 2);

    const auditResponse = await fetch(`http://127.0.0.1:${port}/v1/audit?limit=10`);
    const auditBody = await auditResponse.json();
    assert.equal(auditResponse.status, 200);
    assert.equal(auditBody.ok, true);
    assert.equal(auditBody.data.total >= 1, true);
    assert.equal(auditBody.data.entries[0].tool, 'repo_index');
  } finally {
    if (previousDataDir == null) delete process.env.CONTEXT_DATA_DIR;
    else process.env.CONTEXT_DATA_DIR = previousDataDir;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /ui serves dashboard', async () => {
  const app = createApp({ readVersion: () => 'test-version' });
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/ui/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /MCP Gateway/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
