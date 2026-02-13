import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function resolveDataDir() {
  return process.env.CONTEXT_DATA_DIR || path.resolve(process.cwd(), 'data');
}

export function resolveStorePath() {
  return path.join(resolveDataDir(), 'context-store.json');
}

export function ensureStore() {
  ensureDir(resolveDataDir());
  const file = resolveStorePath();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ repos: {}, audit: [] }, null, 2), 'utf8');
  }
}

export function readStore() {
  ensureStore();
  const raw = fs.readFileSync(resolveStorePath(), 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return {
    repos: parsed?.repos && typeof parsed.repos === 'object' ? parsed.repos : {},
    audit: Array.isArray(parsed?.audit) ? parsed.audit : []
  };
}

export function writeStore(nextStore) {
  ensureStore();
  fs.writeFileSync(resolveStorePath(), JSON.stringify(nextStore, null, 2), 'utf8');
}

export function upsertRepoIndex(repoName, repoRecord) {
  const store = readStore();
  store.repos[repoName] = repoRecord;
  writeStore(store);
  return store.repos[repoName];
}

export function getRepoIndex(repoName) {
  const store = readStore();
  return store.repos[repoName] || null;
}

export function deleteRepoIndex(repoName) {
  const key = String(repoName || '');
  const store = readStore();
  if (!Object.prototype.hasOwnProperty.call(store.repos, key)) {
    return { deleted: false, record: null };
  }
  const record = store.repos[key];
  delete store.repos[key];
  writeStore(store);
  return { deleted: true, record };
}

export function appendAudit(entry) {
  const store = readStore();
  store.audit.push(entry);
  if (store.audit.length > 2000) store.audit = store.audit.slice(-2000);
  writeStore(store);
}
