import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gateway-abilities-test-'));
}

async function requestJson(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, json: await response.json() };
}

test('Abilities MCP can add and list nested rule blocks', async () => {
  const root = withTempDir();
  const dataDir = path.join(root, 'data');
  const previousDataDir = process.env.CONTEXT_DATA_DIR;
  const previousAbilitiesDir = process.env.ABILITIES_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;
  process.env.ABILITIES_DATA_DIR = path.join(dataDir, 'abilities');

  const app = createApp({ readVersion: () => 'test-version' });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const add = await requestJson(`http://127.0.0.1:${port}/v1/mcps/abilities/tools/add_ability_block/run`, 'POST', {
      arguments: {
        type: 'rule',
        id: 'rule.backend.python.fastapi',
        relativeDir: 'backend/python',
        tags: ['backend', 'python', 'fastapi'],
        priority: 120,
        body: '# FastAPI Rule\nAlways validate request payloads.'
      }
    });
    assert.equal(add.status, 200);
    assert.equal(add.json.ok, true);
    assert.equal(add.json.data.id, 'rule.backend.python.fastapi');
    assert.match(add.json.data.path, /rules\/backend\/python\//);

    const list = await requestJson(`http://127.0.0.1:${port}/v1/mcps/abilities/tools/list_rules/run`, 'POST', { arguments: {} });
    assert.equal(list.status, 200);
    assert.equal(list.json.ok, true);
    assert.equal(Array.isArray(list.json.data), true);
    assert.equal(list.json.data.some((block) => block.id === 'rule.backend.python.fastapi'), true);

    const detail = await requestJson(`http://127.0.0.1:${port}/v1/mcps/abilities`);
    assert.equal(detail.status, 200);
    assert.equal(detail.json.ok, true);
    assert.equal(detail.json.data.mcp_id, 'abilities');
    assert.equal(Array.isArray(detail.json.data.abilities.blocks), true);
    assert.equal(detail.json.data.abilities.blocks.some((block) => block.id === 'rule.backend.python.fastapi'), true);
  } finally {
    if (previousDataDir == null) delete process.env.CONTEXT_DATA_DIR;
    else process.env.CONTEXT_DATA_DIR = previousDataDir;
    if (previousAbilitiesDir == null) delete process.env.ABILITIES_DATA_DIR;
    else process.env.ABILITIES_DATA_DIR = previousAbilitiesDir;
    await new Promise((resolve) => server.close(resolve));
  }
});

