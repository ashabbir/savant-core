import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCode, searchCode } from '../src/code-tools.js';
import { upsertRepoIndex } from '../src/store.js';

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gateway-code-tools-test-'));
}

test('code_search returns matching source lines', () => {
  const root = withTempDir();
  const dataDir = path.join(root, 'data');
  const repoDir = path.join(root, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'src', 'main.ts'), 'export function run() {\n  return "hello";\n}\n', 'utf8');

  const prevDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  try {
    upsertRepoIndex('demo', {
      repoName: 'demo',
      repoPath: repoDir,
      worktreePath: repoDir,
      files: []
    });
    const rows = searchCode({ repo: 'demo', query: 'return', limit: 5 });
    assert.equal(rows.length >= 1, true);
    assert.equal(rows[0].path, 'src/main.ts');
    assert.equal(rows[0].line, 2);
  } finally {
    if (prevDataDir == null) delete process.env.CONTEXT_DATA_DIR;
    else process.env.CONTEXT_DATA_DIR = prevDataDir;
  }
});

test('code_read returns file content from indexed repo root', () => {
  const root = withTempDir();
  const dataDir = path.join(root, 'data');
  const repoDir = path.join(root, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello repo', 'utf8');

  const prevDataDir = process.env.CONTEXT_DATA_DIR;
  process.env.CONTEXT_DATA_DIR = dataDir;

  try {
    upsertRepoIndex('demo', {
      repoName: 'demo',
      repoPath: repoDir,
      worktreePath: repoDir,
      files: []
    });
    const file = readCode({ repo: 'demo', path: 'README.md' });
    assert.equal(file.path, 'README.md');
    assert.match(file.content, /hello repo/);
  } finally {
    if (prevDataDir == null) delete process.env.CONTEXT_DATA_DIR;
    else process.env.CONTEXT_DATA_DIR = prevDataDir;
  }
});
