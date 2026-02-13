import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { upsertRepoIndex } from '../src/store.js';

async function requestJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, json: await response.json() };
}

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gateway-test-'));
}

test('POST /v1/mcp/query memory_search returns structured rows', async () => {
  const root = withTempDir();
  const repo = path.join(root, 'repo');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(path.join(repo, 'memory_bank'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'memory_bank', 'architecture.md'), '# Architecture\nGateway keeps context indexed.', 'utf8');

  const previousDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  const app = createApp({
    readVersion: () => 'test-version',
    indexRepository: ({ repoId, path: repoPath, name }) => {
      const record = {
        repoId,
        repoName: name,
        repoPath,
        indexedAt: new Date().toISOString(),
        files: [{
          path: 'memory_bank/architecture.md',
          absolutePath: path.join(repoPath, 'memory_bank', 'architecture.md'),
          chunks: [{ content: '# Architecture\nGateway keeps context indexed.' }]
        }]
      };
      upsertRepoIndex(name, record);
      return record;
    }
  });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const indexResult = await requestJson(`http://127.0.0.1:${port}/v1/index/repo`, 'POST', {
      repo_id: 'repo-1',
      path: repo,
      name: 'savant-core'
    });
    assert.equal(indexResult.status, 202);

    const search = await requestJson(`http://127.0.0.1:${port}/v1/mcp/query`, 'POST', {
      tool: 'memory_search',
      arguments: { query: 'architecture context', repo: 'savant-core' }
    });

    assert.equal(search.status, 200);
    assert.equal(search.json.ok, true);
    assert.equal(Array.isArray(search.json.data), true);
    assert.equal(search.json.data.length > 0, true);
    assert.equal(typeof search.json.data[0].path, 'string');
    assert.equal(typeof search.json.data[0].content, 'string');
    assert.equal(typeof search.json.data[0].score, 'number');
  } finally {
    if (previousDataDir == null) {
      delete process.env.CONTEXT_DATA_DIR;
    } else {
      process.env.CONTEXT_DATA_DIR = previousDataDir;
    }
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /v1/mcp/query memory_read returns full content', async () => {
  const root = withTempDir();
  const repo = path.join(root, 'repo');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(path.join(repo, 'memory_bank'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'memory_bank', 'README.md'), 'Context entrypoint', 'utf8');

  const previousDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  const app = createApp({
    readVersion: () => 'test-version',
    indexRepository: ({ repoId, path: repoPath, name }) => {
      const record = {
        repoId,
        repoName: name,
        repoPath,
        indexedAt: new Date().toISOString(),
        files: [{
          path: 'memory_bank/README.md',
          absolutePath: path.join(repoPath, 'memory_bank', 'README.md'),
          chunks: [{ content: 'Context entrypoint' }]
        }]
      };
      upsertRepoIndex(name, record);
      return record;
    }
  });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const indexResult = await requestJson(`http://127.0.0.1:${port}/v1/index/repo`, 'POST', {
      repo_id: 'repo-2',
      path: repo,
      name: 'savant-core-2'
    });
    assert.equal(indexResult.status, 202);

    const read = await requestJson(`http://127.0.0.1:${port}/v1/mcp/query`, 'POST', {
      tool: 'memory_read',
      arguments: { repo: 'savant-core-2', path: 'memory_bank/README.md' }
    });

    assert.equal(read.status, 200);
    assert.equal(read.json.ok, true);
    assert.equal(read.json.data.path, 'memory_bank/README.md');
    assert.match(read.json.data.content, /Context entrypoint/);
  } finally {
    if (previousDataDir == null) {
      delete process.env.CONTEXT_DATA_DIR;
    } else {
      process.env.CONTEXT_DATA_DIR = previousDataDir;
    }
    await new Promise((resolve) => server.close(resolve));
  }
});
