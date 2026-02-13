import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { upsertRepoIndex } from '../src/store.js';

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gateway-mcps-test-'));
}

test('MCP endpoints expose Context MCP and run tools against indexed repos', async () => {
  const root = withTempDir();
  const dataDir = path.join(root, 'data');
  const previousDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  upsertRepoIndex('savant-core', {
    repoId: 'repo-1',
    repoName: 'savant-core',
    repoPath: '/tmp/savant-core',
    indexedAt: new Date().toISOString(),
    files: [{ chunks: [{ content: 'hello' }] }]
  });

  const app = createApp({
    readVersion: () => 'test-version',
    searchMemory: ({ query, repo }) => [{ path: 'memory_bank/README.md', content: `q=${query} repo=${repo}`, score: 0.9 }],
    readMemory: ({ path: filePath, repo }) => `file=${filePath} repo=${repo}`
  });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const mcpsResponse = await fetch(`http://127.0.0.1:${port}/v1/mcps`);
    const mcpsBody = await mcpsResponse.json();
    assert.equal(mcpsResponse.status, 200);
    assert.equal(mcpsBody.ok, true);
    assert.equal(mcpsBody.data.total, 1);
    assert.equal(mcpsBody.data.mcps[0].mcp_id, 'context');

    const toolsResponse = await fetch(`http://127.0.0.1:${port}/v1/mcps/context/tools`);
    const toolsBody = await toolsResponse.json();
    assert.equal(toolsResponse.status, 200);
    assert.equal(Array.isArray(toolsBody.data.tools), true);
    assert.equal(toolsBody.data.tools.length >= 2, true);

    const runSearchResponse = await fetch(`http://127.0.0.1:${port}/v1/mcps/context/tools/memory_search/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: { repo: 'savant-core', query: 'architecture' } })
    });
    const runSearchBody = await runSearchResponse.json();
    assert.equal(runSearchResponse.status, 200);
    assert.equal(runSearchBody.ok, true);
    assert.match(runSearchBody.data[0].content, /repo=savant-core/);

    const runReadResponse = await fetch(`http://127.0.0.1:${port}/v1/mcps/context/tools/memory_read/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: { repo: 'savant-core', path: 'memory_bank/README.md' } })
    });
    const runReadBody = await runReadResponse.json();
    assert.equal(runReadResponse.status, 200);
    assert.equal(runReadBody.ok, true);
    assert.match(runReadBody.data.content, /repo=savant-core/);
  } finally {
    if (previousDataDir == null) delete process.env.CONTEXT_DATA_DIR;
    else process.env.CONTEXT_DATA_DIR = previousDataDir;
    await new Promise((resolve) => server.close(resolve));
  }
});
