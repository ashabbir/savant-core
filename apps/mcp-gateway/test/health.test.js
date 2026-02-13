import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function getJson(url) {
  const response = await fetch(url);
  const json = await response.json();
  return { status: response.status, json };
}

test('GET /health returns version when savant-context is available', async () => {
  const app = createApp({ readVersion: () => 'savant-context 0.0.0-test' });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const { status, json } = await getJson(`http://127.0.0.1:${port}/health`);
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.savantContextVersion, 'savant-context 0.0.0-test');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /health returns 503 when savant-context check fails', async () => {
  const app = createApp({ readVersion: () => { throw new Error('boom'); } });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const { status, json } = await getJson(`http://127.0.0.1:${port}/health`);
    assert.equal(status, 503);
    assert.equal(json.ok, false);
    assert.match(json.message, /boom/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
