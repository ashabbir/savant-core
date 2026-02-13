import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContextQueue } from '../src/context-queue.js';
import { createRepoObserver } from '../src/repo-observer.js';

function makeQueuePath() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-master-context-queue-'));
  return path.join(root, 'context-index-queue.json');
}

test('repo observer enqueues repo.created job with repo payload', () => {
  const queue = createContextQueue({ queuePath: makeQueuePath() });
  const observer = createRepoObserver({ queue });

  const job = observer.onRepoCreated({
    id: 'repo-uuid',
    repoName: 'savant-core',
    repoPath: '/tmp/savant-core'
  });

  assert.equal(job.event, 'repo.created');
  assert.equal(job.status, 'queued');
  assert.equal(job.payload.repo_id, 'repo-uuid');
  assert.equal(job.payload.path, '/tmp/savant-core');
  assert.equal(job.payload.name, 'savant-core');
  assert.equal(job.payload.agent_id, 'shared');

  const queueRows = queue.readQueue();
  assert.equal(queueRows.length, 1);
  assert.equal(queueRows[0].payload.path, '/tmp/savant-core');
});

test('queue worker claims and completes jobs', async () => {
  const queue = createContextQueue({ queuePath: makeQueuePath() });
  queue.enqueue('repo.created', { repo_id: 'id-1', path: '/tmp/repo-1', name: 'repo-1' });

  const completed = await queue.processNext(async (job) => {
    assert.equal(job.status, 'running');
    assert.equal(job.event, 'repo.created');
  });

  assert.equal(completed.status, 'completed');
  const rows = queue.readQueue();
  assert.equal(rows[0].status, 'completed');
});
