import fs from 'node:fs';
import path from 'node:path';
import { getRepoIndex } from './store.js';

const MAX_FILE_SIZE_BYTES = Number(process.env.CODE_SEARCH_MAX_FILE_BYTES || 1024 * 1024);
const SEARCH_EXCLUDES = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'target', '.turbo', '.cache']);
const TEXT_FILE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.cs',
  '.php', '.scala', '.sh', '.bash', '.zsh', '.fish',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.md', '.mdx', '.txt', '.sql', '.graphql', '.proto',
  '.html', '.css', '.scss', '.sass', '.less', '.xml', '.svg',
  '.dockerfile', '.tf', '.hcl'
]);

function resolveRepoRoot(repoName) {
  const repoIndex = getRepoIndex(repoName);
  if (!repoIndex) throw new Error(`Repo index not found: ${repoName}`);
  return String(repoIndex.worktreePath || repoIndex.repoPath || repoIndex.repositoryRootPath || '').trim();
}

function isWithinRoot(root, targetPath) {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(targetPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function isLikelyTextFile(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile' || base === '.gitignore' || base === '.gitattributes') return true;
  const ext = path.extname(base).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext);
}

function isBinaryBuffer(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] === 0) return true;
  }
  return false;
}

function walkFiles(root) {
  const files = [];
  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SEARCH_EXCLUDES.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(fullPath);
    }
  }

  walk(root);
  return files;
}

export function readCode({ repo, path: codePath, maxBytes = 400_000 }) {
  const repoRoot = resolveRepoRoot(repo);
  if (!repoRoot) throw new Error('Repo path is not available');
  const requestedPath = String(codePath || '').trim();
  if (!requestedPath) throw new Error('path is required');

  const absolutePath = path.resolve(repoRoot, requestedPath);
  if (!isWithinRoot(repoRoot, absolutePath)) {
    throw new Error('path must stay inside repo root');
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`File not found: ${requestedPath}`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.size > Number(maxBytes || 400_000)) {
    throw new Error(`File too large: ${requestedPath} (${stat.size} bytes)`);
  }

  const buffer = fs.readFileSync(absolutePath);
  if (isBinaryBuffer(buffer)) throw new Error(`Binary file is not supported: ${requestedPath}`);

  return {
    path: requestedPath.replaceAll(path.sep, '/'),
    bytes: stat.size,
    content: buffer.toString('utf8')
  };
}

export function searchCode({ repo, query, limit = 20 }) {
  const repoRoot = resolveRepoRoot(repo);
  if (!repoRoot) throw new Error('Repo path is not available');
  const searchQuery = String(query || '').trim();
  if (!searchQuery) throw new Error('query is required');

  const normalizedNeedle = searchQuery.toLowerCase();
  const maxResults = Math.max(1, Number(limit || 20));
  const results = [];

  const files = walkFiles(repoRoot);
  for (const fullPath of files) {
    if (!isLikelyTextFile(fullPath)) continue;
    let stat = null;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat || stat.size > MAX_FILE_SIZE_BYTES) continue;

    let buffer = null;
    try {
      buffer = fs.readFileSync(fullPath);
    } catch {
      continue;
    }
    if (isBinaryBuffer(buffer)) continue;

    const content = buffer.toString('utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.toLowerCase().includes(normalizedNeedle)) continue;
      results.push({
        path: path.relative(repoRoot, fullPath).split(path.sep).join('/'),
        line: i + 1,
        content: line.trim()
      });
      if (results.length >= maxResults) return results;
    }
  }

  return results;
}
