import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir } from './store.js';

const TYPE_TO_DIR = {
  persona: 'personas',
  rule: 'rules',
  policy: 'policies',
  style: 'policies',
  repo: 'repos'
};

const ALLOWED_TYPES = new Set(Object.keys(TYPE_TO_DIR));
const RULE_TYPES = new Set(['rule', 'policy', 'style']);

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (value == null) return [];
  return String(value)
    .split(/[,\n]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function sanitizeRelPath(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  const normalized = path.posix.normalize(raw).replace(/^\/+/, '');
  if (!normalized || normalized === '.') return '';
  if (normalized.startsWith('../') || normalized === '..') {
    throw new Error('relativeDir must stay within abilities root');
  }
  return normalized;
}

function slugify(value) {
  const base = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'ability';
}

function parseYamlLike(yamlText) {
  const meta = {};
  const lines = String(yamlText || '').split(/\r?\n/);
  let activeListKey = '';
  for (const raw of lines) {
    const line = String(raw || '');
    if (!line.trim()) continue;
    const keyMatch = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      const rest = keyMatch[2].trim();
      activeListKey = '';
      if (!rest) {
        meta[key] = [];
        activeListKey = key;
        continue;
      }
      if (rest.startsWith('[') && rest.endsWith(']')) {
        const inner = rest.slice(1, -1).trim();
        meta[key] = inner
          ? inner.split(',').map((v) => v.trim()).filter(Boolean)
          : [];
        continue;
      }
      if (rest === 'true' || rest === 'false') {
        meta[key] = rest === 'true';
        continue;
      }
      if (/^-?\d+$/.test(rest)) {
        meta[key] = Number(rest);
        continue;
      }
      meta[key] = rest;
      continue;
    }

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && activeListKey) {
      if (!Array.isArray(meta[activeListKey])) meta[activeListKey] = [];
      meta[activeListKey].push(listMatch[1].trim());
    }
  }
  return meta;
}

function parseFrontmatter(text) {
  const raw = String(text || '');
  const match = raw.match(/^[\uFEFF\s]*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  return {
    meta: parseYamlLike(match[1]),
    body: String(match[2] || '').trim()
  };
}

function renderFrontmatter(meta, body) {
  const lines = ['---'];
  const writeField = (key, value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      if (!value.length) return;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${String(item)}`);
      return;
    }
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value ? 'true' : 'false'}`);
      return;
    }
    if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
      return;
    }
    const str = String(value || '').trim();
    if (!str) return;
    lines.push(`${key}: ${str}`);
  };

  writeField('id', meta.id);
  writeField('type', meta.type);
  writeField('tags', normalizeList(meta.tags).map((t) => t.toLowerCase()));
  writeField('priority', Number(meta.priority || 0));
  writeField('name', meta.name);
  writeField('aliases', normalizeList(meta.aliases));
  writeField('includes', normalizeList(meta.includes));
  writeField('deprecated', meta.deprecated === true);
  writeField('supersedes', meta.supersedes);
  lines.push('---');
  lines.push(String(body || '').trim());
  return `${lines.join('\n').trim()}\n`;
}

function typeOrder(type) {
  if (type === 'persona') return 0;
  if (type === 'repo') return 1;
  if (type === 'rule') return 2;
  if (type === 'policy' || type === 'style') return 3;
  return 9;
}

export function resolveAbilitiesRoot() {
  return process.env.ABILITIES_DATA_DIR || path.join(resolveDataDir(), 'abilities');
}

export function ensureAbilitiesRoot() {
  const root = resolveAbilitiesRoot();
  fs.mkdirSync(root, { recursive: true });
  const dirs = new Set(Object.values(TYPE_TO_DIR));
  for (const rel of dirs) {
    fs.mkdirSync(path.join(root, rel), { recursive: true });
  }
  const hasMarkdown = Array.from(dirs).some((rel) => listMarkdownFiles(path.join(root, rel)).length > 0);
  if (!hasMarkdown) {
    const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'abilities-defaults');
    if (fs.existsSync(srcDir)) {
      for (const rel of dirs) {
        const from = path.join(srcDir, rel);
        const to = path.join(root, rel);
        if (!fs.existsSync(from)) continue;
        fs.cpSync(from, to, { recursive: true, force: false });
      }
    }
  }
  return root;
}

function baseDirForType(type) {
  const mapped = TYPE_TO_DIR[String(type || '').trim().toLowerCase()];
  if (!mapped) throw new Error(`Unsupported ability type: ${type}`);
  return mapped;
}

function listMarkdownFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        out.push(abs);
      }
    }
  };
  walk(dir);
  return out;
}

function parseBlockFromFile(root, absPath) {
  const content = fs.readFileSync(absPath, 'utf8');
  const { meta, body } = parseFrontmatter(content);
  const relativePath = path.relative(root, absPath).replace(/\\/g, '/');
  const inferredType = relativePath.startsWith('personas/')
    ? 'persona'
    : relativePath.startsWith('rules/')
      ? 'rule'
      : relativePath.startsWith('policies/')
        ? 'policy'
        : relativePath.startsWith('repos/')
          ? 'repo'
          : 'rule';
  const id = String(meta.id || '').trim() || `${inferredType}.${path.basename(absPath, '.md')}`;
  const type = String(meta.type || inferredType).trim().toLowerCase();
  const tags = normalizeList(meta.tags).map((t) => t.toLowerCase());
  const includes = normalizeList(meta.includes);
  const aliases = normalizeList(meta.aliases);
  const priority = Number.isFinite(Number(meta.priority)) ? Number(meta.priority) : 100;
  const stat = fs.statSync(absPath);
  return {
    id,
    type,
    tags,
    includes,
    aliases,
    name: String(meta.name || '').trim(),
    priority,
    deprecated: meta.deprecated === true,
    supersedes: String(meta.supersedes || '').trim(),
    body,
    path: relativePath,
    updated_at: stat.mtime.toISOString()
  };
}

export function listAbilityBlocks({ type } = {}) {
  const root = ensureAbilitiesRoot();
  const wanted = String(type || '').trim().toLowerCase();
  if (wanted && !ALLOWED_TYPES.has(wanted)) throw new Error(`Unsupported ability type: ${wanted}`);
  const files = new Set();
  if (wanted) {
    for (const file of listMarkdownFiles(path.join(root, baseDirForType(wanted)))) files.add(file);
  } else {
    for (const rel of new Set(Object.values(TYPE_TO_DIR))) {
      for (const file of listMarkdownFiles(path.join(root, rel))) files.add(file);
    }
  }
  const blocks = Array.from(files).map((abs) => parseBlockFromFile(root, abs));
  blocks.sort((a, b) => a.path.localeCompare(b.path));
  return blocks;
}

function findPersona(blocks, persona) {
  const input = String(persona || '').trim().toLowerCase();
  if (!input) return null;
  const candidates = [
    input,
    input.startsWith('persona.') ? input : `persona.${input}`,
    `persona.${slugify(input)}`
  ];
  return blocks.find((b) => b.type === 'persona' && candidates.includes(String(b.id || '').toLowerCase()))
    || blocks.find((b) => b.type === 'persona' && slugify(b.id.replace(/^persona\./, '')) === slugify(input))
    || null;
}

function findRepo(blocks, repoId) {
  const input = String(repoId || '').trim().toLowerCase();
  if (!input) return null;
  const norm = slugify(input);
  return blocks.find((b) => {
    if (b.type !== 'repo') return false;
    const keys = [
      String(b.id || ''),
      String(b.id || '').replace(/^repo\./, ''),
      String(b.name || ''),
      ...normalizeList(b.aliases)
    ].map((k) => slugify(String(k || '').toLowerCase()));
    return keys.includes(norm);
  }) || null;
}

export function resolveAbilities({ persona, tags = [], repo_id, trace = false } = {}) {
  const blocks = listAbilityBlocks();
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const personaBlock = findPersona(blocks, persona);
  if (!personaBlock) throw new Error(`Unknown persona: ${persona}`);
  const repoBlock = repo_id ? findRepo(blocks, repo_id) : null;
  const traceRows = [];
  const selected = new Map();
  const visiting = new Set();

  const addBlock = (block, reason, detail = null) => {
    const current = selected.get(block.id);
    if (!current || block.priority > current.priority || (block.priority === current.priority && block.id < current.id)) {
      selected.set(block.id, block);
    }
    if (trace) {
      traceRows.push({
        id: block.id,
        type: block.type,
        priority: block.priority,
        reason,
        detail: detail || undefined
      });
    }
  };

  const expandIncludes = (block) => {
    if (!Array.isArray(block.includes) || !block.includes.length) return;
    if (visiting.has(block.id)) return;
    visiting.add(block.id);
    for (const includeId of block.includes) {
      const include = byId.get(includeId);
      if (!include) continue;
      addBlock(include, `include:${block.id}`, { include_of: block.id });
      expandIncludes(include);
    }
    visiting.delete(block.id);
  };

  addBlock(personaBlock, 'persona');
  expandIncludes(personaBlock);

  if (repoBlock) {
    addBlock(repoBlock, `repo:${repoBlock.id}`);
    expandIncludes(repoBlock);
  }

  const effectiveTagSet = new Set([
    ...normalizeList(tags).map((t) => t.toLowerCase()),
    ...((repoBlock?.tags || []).map((t) => String(t || '').toLowerCase()))
  ]);
  const effectiveTags = Array.from(effectiveTagSet).filter(Boolean);

  for (const block of blocks) {
    if (!RULE_TYPES.has(block.type)) continue;
    const hit = (block.tags || []).find((t) => effectiveTagSet.has(String(t || '').toLowerCase()));
    if (!hit) continue;
    addBlock(block, 'tag-match', { hit, effective_tags: effectiveTags });
    expandIncludes(block);
  }

  const ordered = Array.from(selected.values()).sort((a, b) =>
    b.priority - a.priority
    || typeOrder(a.type) - typeOrder(b.type)
    || a.id.localeCompare(b.id)
  );
  const others = ordered.filter((b) => b.id !== personaBlock.id && (!repoBlock || b.id !== repoBlock.id));
  const rules = others.filter((b) => b.type === 'rule');
  const policies = others.filter((b) => b.type === 'policy' || b.type === 'style');

  const renderSection = (title, items) => {
    if (!items.length) return '';
    const rows = [`# ${title}`];
    for (const item of items) {
      rows.push(`<!-- ${item.id} (priority ${item.priority}) -->\n${item.body}`.trim());
    }
    return rows.join('\n\n').trim();
  };

  const prompt = [
    renderSection('Persona', [personaBlock]),
    renderSection('Repo Constraints', repoBlock ? [repoBlock] : []),
    renderSection('Rules', rules),
    renderSection('Policies & Style', policies)
  ].filter(Boolean).join('\n\n');

  const applied = {
    persona: personaBlock.id,
    repo: repoBlock?.id || '',
    rules: rules.map((b) => b.id),
    policies: policies.map((b) => b.id)
  };
  const manifest = {
    applied,
    order: ordered.map((b) => b.id),
    hash: Buffer.from(`${prompt}\n${applied.rules.join(',')}`).toString('base64url').slice(0, 64)
  };

  const response = {
    persona: personaBlock.body,
    repo: repoBlock?.body || '',
    rules: rules.map((b) => b.body),
    policies: policies.map((b) => b.body),
    manifest,
    prompt
  };
  if (trace) response.trace = traceRows;
  return response;
}

export function addAbilityBlock(input = {}) {
  const type = String(input.type || '').trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) throw new Error(`Unsupported ability type: ${type}`);
  const id = String(input.id || '').trim();
  if (!id) throw new Error('id is required');
  const priority = Number(input.priority);
  if (!Number.isFinite(priority)) throw new Error('priority must be a number');

  const root = ensureAbilitiesRoot();
  const baseDir = path.join(root, baseDirForType(type));
  const relativeDir = sanitizeRelPath(input.relativeDir || input.directory || '');
  const targetDir = relativeDir ? path.join(baseDir, relativeDir) : baseDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const fileBase = slugify(input.fileName || id.replace(/^[^.]+\./, ''));
  const filePath = path.join(targetDir, `${fileBase}.md`);
  if (fs.existsSync(filePath) && input.overwrite !== true) {
    throw new Error(`Ability file already exists: ${path.relative(root, filePath).replace(/\\/g, '/')}`);
  }

  const meta = {
    id,
    type,
    tags: normalizeList(input.tags),
    priority,
    name: String(input.name || '').trim(),
    aliases: normalizeList(input.aliases),
    includes: normalizeList(input.includes),
    deprecated: input.deprecated === true,
    supersedes: String(input.supersedes || '').trim()
  };
  const body = String(input.body || '').trim();
  if (!body) throw new Error('body is required');
  fs.writeFileSync(filePath, renderFrontmatter(meta, body), 'utf8');

  return parseBlockFromFile(root, filePath);
}

export function abilitiesSummary() {
  const blocks = listAbilityBlocks();
  const counts = {
    personas: 0,
    rules: 0,
    policies: 0,
    repos: 0,
    styles: 0
  };
  for (const block of blocks) {
    if (block.type === 'persona') counts.personas += 1;
    else if (block.type === 'rule') counts.rules += 1;
    else if (block.type === 'policy') counts.policies += 1;
    else if (block.type === 'style') counts.styles += 1;
    else if (block.type === 'repo') counts.repos += 1;
  }
  const latest = blocks
    .map((b) => b.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  return {
    root: resolveAbilitiesRoot(),
    total: blocks.length,
    counts,
    indexed_at: latest
  };
}
