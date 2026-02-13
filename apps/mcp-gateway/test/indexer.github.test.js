import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureAgentWorktree, indexRepository, materializeRepository } from '../src/indexer.js';

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-github-indexer-'));
}

test('materializeRepository clones github repo when missing', () => {
  const workdirRoot = withTempDir();
  const calls = [];

  const target = materializeRepository('https://github.com/acme/repo', 'acme-repo', {
    workdirRoot,
    commandRunner: (command, args) => {
      calls.push({ command, args });
      const outDir = args[args.length - 1];
      fs.mkdirSync(path.join(outDir, '.git'), { recursive: true });
      return { status: 0, stdout: '', stderr: '', error: null };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'git');
  assert.deepEqual(calls[0].args.slice(0, 3), ['clone', '--depth', '1']);
  assert.equal(fs.existsSync(path.join(target, '.git')), true);
});

test('ensureAgentWorktree creates detached worktree path', () => {
  const workdirRoot = withTempDir();
  const repoRoot = path.join(workdirRoot, 'repos', 'sample');
  fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });

  const calls = [];
  const worktreePath = ensureAgentWorktree(repoRoot, 'sample', 'agent-a', {
    workdirRoot,
    commandRunner: (command, args) => {
      calls.push({ command, args });
      if (args.includes('rev-parse')) return { status: 0, stdout: 'true', stderr: '', error: null };
      const target = args[args.length - 2];
      fs.mkdirSync(path.join(target, '.git'), { recursive: true });
      return { status: 0, stdout: '', stderr: '', error: null };
    }
  });

  assert.equal(worktreePath.includes('/worktrees/'), true);
  assert.equal(worktreePath.endsWith('/agent-a'), true);
  assert.equal(calls.some((c) => c.args.includes('worktree') && c.args.includes('add')), true);
});

test('indexRepository uses worktree path for savant-context indexing', () => {
  const workdirRoot = withTempDir();
  const calls = [];
  let savantCwd = '';

  const result = indexRepository(
    { repoId: 'repo-1', path: 'https://github.com/acme/repo', name: 'acme-repo', agentId: 'agent-a' },
    {
      workdirRoot,
      commandRunner: (command, args) => {
        calls.push({ command, args });
        if (args.includes('rev-parse')) return { status: 0, stdout: 'true', stderr: '', error: null };

        if (args[0] === 'clone') {
          const outDir = args[args.length - 1];
          fs.mkdirSync(path.join(outDir, '.git'), { recursive: true });
          return { status: 0, stdout: '', stderr: '', error: null };
        }

        if (args.includes('worktree') && args.includes('add')) {
          const target = args[args.length - 2];
          fs.mkdirSync(path.join(target, '.git'), { recursive: true });
          fs.mkdirSync(path.join(target, 'memory_bank'), { recursive: true });
          fs.writeFileSync(path.join(target, 'memory_bank', 'README.md'), 'seed content', 'utf8');
          return { status: 0, stdout: '', stderr: '', error: null };
        }

        return { status: 0, stdout: '', stderr: '', error: null };
      },
      runSavantContext: (_args, options) => {
        savantCwd = options.cwd;
        return { status: 0, stdout: 'ok', stderr: '', error: null };
      }
    }
  );

  assert.equal(result.sourceRepoPath, 'https://github.com/acme/repo');
  assert.equal(result.repoName, 'acme-repo');
  assert.equal(result.agentId, 'agent-a');
  assert.equal(result.worktreePath.includes('/worktrees/'), true);
  assert.equal(result.repositoryRootPath.includes('/repos/'), true);
  assert.equal(result.files.length > 0, true);
  assert.equal(savantCwd, result.worktreePath);
  assert.equal(calls.some((c) => c.args.includes('worktree') && c.args.includes('add')), true);
});
