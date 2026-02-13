import fs from 'node:fs';
import path from 'node:path';
import { getRepoIndex } from './store.js';

function normalize(text) {
  return String(text || '').toLowerCase();
}

function scoreSnippet(content, query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const source = normalize(content);
  const hits = tokens.reduce((sum, token) => sum + (source.includes(token) ? 1 : 0), 0);
  return hits / tokens.length;
}

export function searchMemory({ query, repo, limit = 5 }) {
  const repoIndex = getRepoIndex(repo);
  if (!repoIndex) return [];

  const ranked = [];
  for (const file of repoIndex.files || []) {
    for (const chunk of file.chunks || []) {
      const score = scoreSnippet(chunk.content, query);
      if (score <= 0) continue;
      ranked.push({
        path: file.path,
        content: chunk.content,
        score: Number(score.toFixed(4))
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(1, Number(limit) || 5));
}

export function readMemory({ path: memoryPath, repo }) {
  const repoIndex = getRepoIndex(repo);
  if (!repoIndex) throw new Error(`Repo index not found: ${repo}`);

  const found = (repoIndex.files || []).find((f) => f.path === memoryPath);
  if (!found) throw new Error(`File not found in index: ${memoryPath}`);

  const absolute = found.absolutePath || '';
  if (absolute && fs.existsSync(absolute)) {
    return fs.readFileSync(absolute, 'utf8');
  }

  return (found.chunks || []).map((chunk) => chunk.content).join('\n\n');
}

export function isMemoryBankPath(filePath) {
  const normalized = filePath.split(path.sep).join('/').toLowerCase();
  return normalized.includes('/memory_bank/') || normalized.endsWith('/memory_bank');
}
