import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { getRepoIndex, upsertRepoIndex } from '../src/store.js';

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gateway-delete-test-'));
}

async function deleteJson(url) {
  const response = await fetch(url, { method: 'DELETE' });
  return { status: response.status, json: await response.json() };
}

test('DELETE /v1/index/repo/:repo_name deletes existing repo index', async () => {
  const root = withTempDir();
  const dataDir = path.join(root, 'data');
  const previousDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  upsertRepoIndex('savant-core', {
    repoId: 'repo-1',
    repoName: 'savant-core',
    repoPath: '/tmp/savant-core',
    indexedAt: new Date().toISOString(),
    files: []
  });

  const app = createApp({ readVersion: () => 'test-version' });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await deleteJson(`http://127.0.0.1:${port}/v1/index/repo/savant-core`);
    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.data.deleted, true);
    assert.equal(getRepoIndex('savant-core'), null);
  } finally {
    if (previousDataDir == null) delete process.env.CONTEXT_DATA_DIR;
    else process.env.CONTEXT_DATA_DIR = previousDataDir;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DELETE /v1/index/repo/:repo_name returns 404 for missing repo index', async () => {
  const root = withTempDir();
  const dataDir = path.join(root, 'data');
  const previousDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  const app = createApp({ readVersion: () => 'test-version' });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await deleteJson(`http://127.0.0.1:${port}/v1/index/repo/missing-repo`);
    assert.equal(response.status, 404);
    assert.equal(response.json.ok, false);
    assert.equal(response.json.error.code, 'NOT_FOUND');
  } finally {
    if (previousDataDir == null) delete process.env.CONTEXT_DATA_DIR;
    else process.env.CONTEXT_DATA_DIR = previousDataDir;
    await new Promise((resolve) => server.close(resolve));
  }
});
