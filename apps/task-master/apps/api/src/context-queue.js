import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function ensureParent(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function createContextQueue(options = {}) {
  const queuePath = options.queuePath || path.resolve(process.cwd(), 'data/context-index-queue.json');

  function readQueue() {
    const queue = readJson(queuePath, []);
    return Array.isArray(queue) ? queue : [];
  }

  function writeQueue(queue) {
    writeJson(queuePath, queue);
  }

  function enqueue(event, payload) {
    const queue = readQueue();
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(),
      event,
      payload,
      status: 'queued',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      error: null
    };
    queue.push(job);
    writeQueue(queue);
    return job;
  }

  function claimNext() {
    const queue = readQueue();
    const idx = queue.findIndex((job) => job.status === 'queued');
    if (idx < 0) return null;

    queue[idx] = {
      ...queue[idx],
      status: 'running',
      attempts: Number(queue[idx].attempts || 0) + 1,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null
    };
    writeQueue(queue);
    return queue[idx];
  }

  function complete(jobId) {
    const queue = readQueue();
    const idx = queue.findIndex((job) => job.id === jobId);
    if (idx < 0) return null;
    queue[idx] = {
      ...queue[idx],
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null
    };
    writeQueue(queue);
    return queue[idx];
  }

  function fail(jobId, error) {
    const queue = readQueue();
    const idx = queue.findIndex((job) => job.id === jobId);
    if (idx < 0) return null;
    queue[idx] = {
      ...queue[idx],
      status: 'failed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: String(error || 'unknown error')
    };
    writeQueue(queue);
    return queue[idx];
  }

  async function processNext(handler) {
    const job = claimNext();
    if (!job) return null;
    try {
      await handler(job);
      return complete(job.id);
    } catch (error) {
      return fail(job.id, error?.message || error);
    }
  }

  return {
    queuePath,
    enqueue,
    claimNext,
    complete,
    fail,
    processNext,
    readQueue
  };
}
