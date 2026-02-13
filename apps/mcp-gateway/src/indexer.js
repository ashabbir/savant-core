import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runSavantContext } from './savant-context.js';
import { upsertRepoIndex } from './store.js';

const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.txt']);

function chunkText(content, maxChars = 1200) {
  const text = String(content || '').trim();
  if (!text) return [];
  const chunks = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push({ content: text.slice(i, i + maxChars) });
  }
  return chunks;
}

function walkMarkdownFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const absolute = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      files.push(absolute);
    }
  }

  walk(rootDir);
  return files;
}

function assertWellFormedMarkdown(content, filePath) {
  const fenceMatches = String(content || '').match(/```/g) || [];
  if (fenceMatches.length % 2 !== 0) {
    throw new Error(`Malformed markdown fence in ${filePath}`);
  }
}

function sanitizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'repo';
}

function defaultWorkdirRoot() {
  return process.env.REPO_WORKDIR_ROOT || '/app/workdir';
}

export function isGitHubRepoUrl(value) {
  const text = String(value || '').trim();
  return /^https:\/\/github\.com\/.+\/.+/i.test(text);
}

function parseGithubOwnerRepo(urlText) {
  const url = new URL(urlText);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error(`Invalid GitHub repo URL: ${urlText}`);
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  return { owner, repo };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 120000,
    env: process.env,
    ...(options.cwd ? { cwd: options.cwd } : {})
  });

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error || null
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function ensureCommandSuccess(result, messagePrefix) {
  if (result.status === 0) return;
  const reason = result.stderr || result.error?.message || 'unknown error';
  throw new Error(`${messagePrefix}: ${reason}`);
}

function isGitRepository(repoPath, commandRunner) {
  const result = commandRunner('git', ['-C', repoPath, 'rev-parse', '--is-inside-work-tree']);
  return result.status === 0;
}

export function materializeRepository(repoPath, repoName, options = {}) {
  const inputPath = String(repoPath || '').trim();
  if (!inputPath) throw new Error('path is required');

  const commandRunner = options.commandRunner || runCommand;
  const existsSync = options.existsSync || fs.existsSync;
  const workdirRoot = options.workdirRoot || defaultWorkdirRoot();
  const repositoryRootDir = path.join(workdirRoot, 'repos');

  ensureDir(repositoryRootDir);

  if (!isGitHubRepoUrl(inputPath)) return inputPath;

  const { owner, repo } = parseGithubOwnerRepo(inputPath);
  const slugBase = sanitizeSlug(repoName || `${owner}-${repo}`);
  const suffix = crypto.createHash('sha1').update(inputPath).digest('hex').slice(0, 10);
  const targetDir = path.join(repositoryRootDir, `${slugBase}-${suffix}`);
  const gitDir = path.join(targetDir, '.git');

  if (!existsSync(gitDir)) {
    const cloneResult = commandRunner('git', ['clone', '--depth', '1', inputPath, targetDir]);
    ensureCommandSuccess(cloneResult, 'git clone failed');
    return targetDir;
  }

  const fetchResult = commandRunner('git', ['-C', targetDir, 'fetch', '--depth', '1', 'origin']);
  ensureCommandSuccess(fetchResult, 'git fetch failed');

  const resetResult = commandRunner('git', ['-C', targetDir, 'reset', '--hard', 'FETCH_HEAD']);
  ensureCommandSuccess(resetResult, 'git reset failed');

  return targetDir;
}

export function ensureAgentWorktree(repoRootPath, repoName, agentId = 'shared', options = {}) {
  const commandRunner = options.commandRunner || runCommand;
  const workdirRoot = options.workdirRoot || defaultWorkdirRoot();
  if (!isGitRepository(repoRootPath, commandRunner)) return repoRootPath;

  const worktreeRootDir = path.join(workdirRoot, 'worktrees');
  ensureDir(worktreeRootDir);

  const repoSlug = sanitizeSlug(repoName);
  const agentSlug = sanitizeSlug(agentId || 'shared');
  const targetDir = path.join(worktreeRootDir, repoSlug, agentSlug);

  const existsSync = options.existsSync || fs.existsSync;
  const worktreeGitRef = path.join(targetDir, '.git');
  if (!existsSync(worktreeGitRef)) {
    ensureDir(path.dirname(targetDir));
    const addResult = commandRunner('git', ['-C', repoRootPath, 'worktree', 'add', '--detach', targetDir, 'HEAD']);
    ensureCommandSuccess(addResult, 'git worktree add failed');
    return targetDir;
  }

  const fetchResult = commandRunner('git', ['-C', targetDir, 'fetch', '--all', '--prune']);
  ensureCommandSuccess(fetchResult, 'git fetch in worktree failed');

  const resetResult = commandRunner('git', ['-C', targetDir, 'reset', '--hard', 'HEAD']);
  ensureCommandSuccess(resetResult, 'git reset in worktree failed');

  return targetDir;
}

export function buildIndexFromRepository(repoPath) {
  const files = walkMarkdownFiles(repoPath).map((absolutePath) => {
    const relPath = path.relative(repoPath, absolutePath).split(path.sep).join('/');
    const content = fs.readFileSync(absolutePath, 'utf8');
    if (absolutePath.endsWith('.md') || absolutePath.endsWith('.mdx')) {
      assertWellFormedMarkdown(content, relPath);
    }
    return {
      path: relPath,
      absolutePath,
      chunks: chunkText(content)
    };
  });

  return { files };
}

export function indexRepository({ repoId, path: repoPath, name, agentId }, options = {}) {
  if (!repoPath || !name) throw new Error('path and name are required');

  const sourceRepoPath = String(repoPath).trim();
  const repositoryRootPath = materializeRepository(sourceRepoPath, name, {
    commandRunner: options.commandRunner,
    workdirRoot: options.workdirRoot
  });
  const worktreePath = ensureAgentWorktree(repositoryRootPath, name, agentId || 'shared', {
    commandRunner: options.commandRunner,
    workdirRoot: options.workdirRoot
  });

  ensureDir(worktreePath);

  const runner = options.runSavantContext || runSavantContext;
  const command = runner(['index', 'repo', worktreePath, '--name', name], { cwd: worktreePath });
  if (command.status !== 0) {
    const stderr = command.stderr || command.error?.message || 'unknown error';
    throw new Error(`savant-context index failed: ${stderr}`);
  }

  const generated = buildIndexFromRepository(worktreePath);
  const record = {
    repoId,
    repoName: name,
    repoPath: worktreePath,
    sourceRepoPath,
    repositoryRootPath,
    worktreePath,
    agentId: agentId || 'shared',
    indexedAt: new Date().toISOString(),
    command: {
      status: command.status,
      stdout: command.stdout,
      stderr: command.stderr
    },
    files: generated.files
  };

  upsertRepoIndex(name, record);
  return record;
}
