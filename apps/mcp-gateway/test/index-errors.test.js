import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function requestJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, json: await response.json() };
}

test('POST /v1/index/repo returns deterministic INDEX_FAILED error', async () => {
  const app = createApp({
    readVersion: () => 'test-version',
    indexRepository: () => {
      throw new Error('Malformed markdown fence in memory_bank/architecture.md');
    }
  });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await requestJson(`http://127.0.0.1:${port}/v1/index/repo`, 'POST', {
      repo_id: 'repo-1',
      path: '/tmp/repo',
      name: 'repo'
    });

    assert.equal(response.status, 500);
    assert.equal(response.json.ok, false);
    assert.equal(response.json.error.code, 'INDEX_FAILED');
    assert.match(response.json.error.details, /Malformed markdown fence/);
    assert.equal(response.json.error.retryable, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
