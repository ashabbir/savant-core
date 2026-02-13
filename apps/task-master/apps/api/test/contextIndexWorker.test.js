import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContextQueue } from '../src/context-queue.js';
import { createContextIndexWorker } from '../src/context-index-worker.js';

function makeTempFile(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-master-index-worker-'));
  return path.join(root, name);
}

test('worker sends /v1/index/repo and updates repo to INDEXED on 202', async () => {
  const queuePath = makeTempFile('queue.json');
  const repoStorePath = makeTempFile('repos.json');

  const queue = createContextQueue({ queuePath });
  const seedRepos = [{ id: 'repo-1', repoName: 'savant-core', repoPath: '/tmp/repo-1', indexStatus: 'QUEUED' }];
  fs.writeFileSync(repoStorePath, JSON.stringify(seedRepos, null, 2), 'utf8');

  queue.enqueue('repo.created', {
    repo_id: 'repo-1',
    path: '/tmp/repo-1',
    name: 'savant-core'
  });

  const calls = [];
  const worker = createContextIndexWorker({
    queue,
    readRepos: () => JSON.parse(fs.readFileSync(repoStorePath, 'utf8')),
    writeRepos: (repos) => fs.writeFileSync(repoStorePath, JSON.stringify(repos, null, 2), 'utf8'),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            worktree_path: '/workdir/worktrees/savant-core/shared',
            indexed_at: '2026-02-13T00:00:00.000Z',
            files_indexed: 12,
            chunks_indexed: 34
          }
        }),
        { status: 202, headers: { 'content-type': 'application/json' } },
      );
    },
    gatewayUrl: 'http://mcp-gateway:4444'
  });

  const result = await worker.processNext();
  assert.equal(result.status, 'completed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://mcp-gateway:4444/v1/index/repo');

  const updatedRepos = JSON.parse(fs.readFileSync(repoStorePath, 'utf8'));
  assert.equal(updatedRepos[0].indexStatus, 'INDEXED');
  assert.equal(Boolean(updatedRepos[0].indexAcceptedAt), true);
  assert.equal(updatedRepos[0].lastIndexedAt, '2026-02-13T00:00:00.000Z');
  assert.equal(updatedRepos[0].lastFileCount, 12);
  assert.equal(updatedRepos[0].lastChunkCount, 34);
  assert.equal(updatedRepos[0].worktreePath, '/workdir/worktrees/savant-core/shared');
});

test('worker re-executes indexing for repo.reindex events', async () => {
  const queuePath = makeTempFile('queue-reindex.json');
  const repoStorePath = makeTempFile('repos-reindex.json');

  const queue = createContextQueue({ queuePath });
  const seedRepos = [{ id: 'repo-2', repoName: 'savant-core', repoPath: '/tmp/repo-2', indexStatus: 'QUEUED' }];
  fs.writeFileSync(repoStorePath, JSON.stringify(seedRepos, null, 2), 'utf8');

  queue.enqueue('repo.reindex', {
    repo_id: 'repo-2',
    path: '/tmp/repo-2',
    name: 'savant-core'
  });

  let calls = 0;
  const worker = createContextIndexWorker({
    queue,
    readRepos: () => JSON.parse(fs.readFileSync(repoStorePath, 'utf8')),
    writeRepos: (repos) => fs.writeFileSync(repoStorePath, JSON.stringify(repos, null, 2), 'utf8'),
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'content-type': 'application/json' } });
    },
    gatewayUrl: 'http://mcp-gateway:4444'
  });

  const result = await worker.processNext();
  assert.equal(result.status, 'completed');
  assert.equal(calls, 1);
});

test('worker records actionable FAILED status when gateway rejects indexing', async () => {
  const queuePath = makeTempFile('queue-failed.json');
  const repoStorePath = makeTempFile('repos-failed.json');

  const queue = createContextQueue({ queuePath });
  const seedRepos = [{ id: 'repo-3', repoName: 'savant-core', repoPath: '/tmp/repo-3', indexStatus: 'QUEUED' }];
  fs.writeFileSync(repoStorePath, JSON.stringify(seedRepos, null, 2), 'utf8');

  queue.enqueue('repo.created', {
    repo_id: 'repo-3',
    path: '/tmp/repo-3',
    name: 'savant-core'
  });

  const worker = createContextIndexWorker({
    queue,
    readRepos: () => JSON.parse(fs.readFileSync(repoStorePath, 'utf8')),
    writeRepos: (repos) => fs.writeFileSync(repoStorePath, JSON.stringify(repos, null, 2), 'utf8'),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: 'INDEX_FAILED', details: 'Malformed markdown fence in memory_bank/architecture.md' } }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
    gatewayUrl: 'http://mcp-gateway:4444'
  });

  const result = await worker.processNext();
  assert.equal(result.status, 'failed');

  const updatedRepos = JSON.parse(fs.readFileSync(repoStorePath, 'utf8'));
  assert.equal(updatedRepos[0].indexStatus, 'FAILED');
  assert.match(updatedRepos[0].lastError, /Malformed markdown fence/);
});
