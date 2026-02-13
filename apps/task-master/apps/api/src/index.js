import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';
import nodemailer from 'nodemailer';
import { CreateProject, UpdateProject, UpdateProjectContext, CreateTask, MoveTask, ReorderColumn, UpdateTask, CreateComment, Login, ChangePassword, AdminCreateUser, AdminUpdateUser, AdminSetUserPassword, AdminAssignUserProjects, UpdateMe, CreateAgent, UpdateAgent, CreateDocument, UpdateDocument, CreateAgentMessage, CreateRoutingRule, UpdateRoutingRule, CreateNotificationSubscription, UpdateNotificationSubscription, JarvisChat, TaskAgentChat, TalonAuthStart, TalonExchange, TalonAuthRemove } from './validate.js';
import { DEFAULT_COLUMNS } from './seedDefaults.js';
import { buildTalonRequest, buildSessionKey, resolveAgentId, resolveAgentKey, shouldTriggerOnAssignment, shouldTriggerOnTodoMove, extractTalonResponseText, extractTalonResponseModel, extractTalonUsage, buildTalonAgentUrl } from './talon.js';
import { resolveEpicDoneMove } from './taskMoves.js';
import { resolveAgentIdFromRules } from './routingRules.js';
import apiProvidersRouter from './llm/providers.js';
import modelsRouter from './llm/models.js';
import { decrypt } from './llm/vault.js';
import { createContextQueue } from './context-queue.js';
import { createRepoObserver } from './repo-observer.js';
import { createContextIndexWorker } from './context-index-worker.js';
import { buildReindexPayload, shouldQueueReindex } from './context-sync.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
});

function broadcast(event, data) {
  io.emit(event, data);
}

function ok(res, data) { res.json({ ok: true, data }); }
function bad(res, status, message, details) { res.status(status).json({ ok: false, message, details }); }

const contextRepoStorePath = path.resolve(process.cwd(), 'data/context-repos.json');
const contextIndexQueue = createContextQueue();
const repoObserver = createRepoObserver({ queue: contextIndexQueue });
const contextIndexWorker = createContextIndexWorker({
  queue: contextIndexQueue,
  readRepos: readContextRepos,
  writeRepos: writeContextRepos
});

function ensureContextRepoStore() {
  const dir = path.dirname(contextRepoStorePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(contextRepoStorePath)) fs.writeFileSync(contextRepoStorePath, '[]', 'utf8');
}

function readContextRepos() {
  try {
    ensureContextRepoStore();
    const raw = fs.readFileSync(contextRepoStorePath, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeContextRepos(repos) {
  ensureContextRepoStore();
  fs.writeFileSync(contextRepoStorePath, JSON.stringify(repos, null, 2), 'utf8');
}

async function processContextRepoQueue(options = {}) {
  const logger = options.logger || console;
  const result = await contextIndexWorker.processNext();
  if (result) logger.log(`context queue job ${result.status}: ${result.id}`);
  return result;
}

function selectPrimaryRepoPath(project, projectRepos = []) {
  const firstRepoPath = projectRepos.find((r) => String(r?.repoPath || '').trim())?.repoPath;
  return String(project?.localPath || '').trim()
    || String(project?.repoPath || '').trim()
    || String(firstRepoPath || '').trim();
}

function refreshProjectRepoIndexes(projectId) {
  const repos = readContextRepos();
  let changed = false;
  const next = repos.map((repo) => {
    if (repo?.projectId !== projectId) return repo;
    changed = true;
    const stats = countRepoStats(repo.repoPath);
    return {
      ...repo,
      lastIndexedAt: stats.error ? repo.lastIndexedAt : new Date().toISOString(),
      lastFileCount: stats.fileCount,
      lastChunkCount: stats.chunkCount,
      lastError: stats.error,
      updatedAt: new Date().toISOString()
    };
  });
  if (changed) writeContextRepos(next);
  return next.filter((r) => r?.projectId === projectId);
}

function collectRepoFacts(repoPath) {
  const root = String(repoPath || '').trim();
  const result = {
    repoPath: root,
    exists: false,
    topLevel: [],
    keyFiles: [],
    extCounts: {},
    detectedStack: [],
    packageName: '',
    scripts: []
  };
  if (!root || !fs.existsSync(root)) return result;

  result.exists = true;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return result;
  }

  result.topLevel = entries.slice(0, 80).map((e) => e.name).sort();
  const keyCandidates = ['README.md', 'AGENTS.md', 'package.json', 'docker-compose.yml', 'pnpm-workspace.yaml', 'turbo.json'];
  result.keyFiles = keyCandidates.filter((file) => fs.existsSync(path.join(root, file)));

  const packageJsonPath = path.join(root, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      result.packageName = String(pkg?.name || '');
      result.scripts = Object.keys(pkg?.scripts || {}).slice(0, 20);
      const deps = {
        ...(pkg?.dependencies || {}),
        ...(pkg?.devDependencies || {})
      };
      const names = Object.keys(deps);
      if (names.some((n) => n === 'react')) result.detectedStack.push('React');
      if (names.some((n) => n === 'vite')) result.detectedStack.push('Vite');
      if (names.some((n) => n === 'express')) result.detectedStack.push('Express');
      if (names.some((n) => n === '@prisma/client' || n === 'prisma')) result.detectedStack.push('Prisma');
      if (names.some((n) => n === 'mongodb' || n === 'mongoose')) result.detectedStack.push('MongoDB');
      if (names.some((n) => n === 'typescript')) result.detectedStack.push('TypeScript');
    } catch {
      // ignore malformed package json
    }
  }

  const skipDirs = new Set(['.git', 'node_modules', '.next', '.turbo', 'dist', 'build', '.openclaw']);
  const extCounts = {};
  let seen = 0;
  const maxEntries = 8000;

  function walk(dir) {
    if (seen >= maxEntries) return;
    let dirEntries = [];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirEntries) {
      if (seen >= maxEntries) return;
      seen += 1;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase() || '(no-ext)';
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
  }
  walk(root);
  result.extCounts = Object.fromEntries(Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 20));
  return result;
}

function toSafeMdPath(value, idx = 1) {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^-+|-+$/g, '');
  const safe = base || `analysis-${idx}`;
  return safe.endsWith('.md') ? safe : `${safe}.md`;
}

function parseAnalysisFilesFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const candidates = [];
  candidates.push(raw);
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const files = Array.isArray(parsed?.files) ? parsed.files : [];
      const normalized = files
        .map((f, idx) => ({
          filePath: toSafeMdPath(f?.path || f?.file || f?.name || f?.title || `analysis-${idx + 1}`, idx + 1),
          title: String(f?.title || '').trim() || String(f?.path || f?.file || f?.name || `Analysis ${idx + 1}`),
          contentMarkdown: String(f?.content || f?.markdown || '').trim(),
          order: idx
        }))
        .filter((f) => f.contentMarkdown);
      if (normalized.length > 0) return normalized;
    } catch {
      // continue
    }
  }

  return [{
    filePath: 'analysis-overview.md',
    title: 'Analysis Overview',
    contentMarkdown: raw,
    order: 0
  }];
}

function isGitHubRepoUrl(value) {
  return /^https:\/\/github\.com\/.+\/.+/i.test(String(value || '').trim());
}

function countRepoStats(repoPath) {
  const result = { fileCount: 0, chunkCount: 0, error: null, deferred: false };
  const root = String(repoPath || '').trim();
  if (!root) return { ...result, error: 'Missing repo path' };
  if (isGitHubRepoUrl(root)) return { ...result, deferred: true };
  if (!fs.existsSync(root)) return { ...result, error: `Path does not exist: ${root}` };

  const skipDirs = new Set(['.git', 'node_modules', '.next', '.turbo', 'dist', 'build', '.openclaw']);
  const exts = new Set(['.js', '.jsx', '.ts', '.tsx', '.md', '.json', '.yml', '.yaml', '.py', '.go', '.java', '.rb', '.rs', '.c', '.cpp', '.h', '.hpp']);

  let seen = 0;
  const maxEntries = 25000;

  function walk(dir) {
    if (seen > maxEntries) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen > maxEntries) return;
      seen += 1;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!exts.has(path.extname(entry.name).toLowerCase())) continue;
      result.fileCount += 1;
      try {
        const stats = fs.statSync(full);
        const bytes = stats.size || 0;
        result.chunkCount += Math.max(1, Math.ceil(bytes / 1200));
      } catch {
        result.chunkCount += 1;
      }
    }
  }

  walk(root);
  return result;
}

async function logActivity({ action, detail = '', actor = 'system', projectId = null, taskId = null, fromColumnName = null, toColumnName = null }) {
  await prisma.activity.create({ data: { action, detail, actor, projectId, taskId, fromColumnName, toColumnName } });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(stored, password) {
  try {
    const [kind, saltHex, hashHex] = stored.split('$');
    if (kind !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const derived = crypto.scryptSync(password, salt, 32);
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'));
  } catch {
    return false;
  }
}

function extractMentions(text) {
  const body = String(text || '');
  const matches = body.match(/@([a-zA-Z0-9_-]+)/g) || [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

function isObjectId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

async function resolveAgentForAssignee(assignee) {
  const value = String(assignee || '').trim();
  if (!value) return null;
  const or = [{ name: value }];
  if (isObjectId(value)) or.push({ id: value });
  const direct = await prisma.agent.findFirst({ where: { OR: or } });
  if (direct) return direct;
  try {
    return await prisma.agent.findFirst({ where: { talonAgentId: value } });
  } catch {
    return null;
  }
}

async function resolveTaskPreferredAgent(task) {
  const assignee = String(task?.assignee || '').trim();
  if (!assignee) return { user: null, agent: null };

  const user = await prisma.user.findUnique({ where: { username: assignee } });
  if (user?.preferredAgentId) {
    const preferred = await prisma.agent.findUnique({ where: { id: user.preferredAgentId } });
    if (preferred) return { user, agent: preferred };
  }

  const resolved = await resolveAgentForAssignee(assignee);
  return { user, agent: resolved || null };
}

function buildTaskAgentChatSessionKey(taskId, agentKey) {
  return buildSessionKey(agentKey, taskId);
}

function isInvalidUpstreamText(value) {
  return /does not support tools|http 404: 404 page not found|no api key found for provider/i.test(String(value || ''));
}

function normalizeTranscriptMessages(messages) {
  return Array.isArray(messages) ? messages : [];
}

async function fetchTalonTranscript({ gatewayUrl, token, agentKey, sessionKey }) {
  const url = new URL('/v1/sessions/transcript', gatewayUrl);
  url.searchParams.set('sessionKey', sessionKey);
  const response = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-talon-agent-id': agentKey
    }
  });

  if (response.ok) {
    const data = await response.json();
    return { ok: true, status: response.status, messages: normalizeTranscriptMessages(data.messages) };
  }

  if (response.status === 404) {
    return { ok: true, status: response.status, messages: [] };
  }

  const payload = await readTalonResponse(response);
  return { ok: false, status: response.status, error: payload.json || payload.raw };
}

async function fetchTalonSessions({ gatewayUrl, token, agentKey }) {
  const url = new URL('/v1/sessions', gatewayUrl);
  const response = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-talon-agent-id': agentKey
    }
  });

  if (!response.ok) {
    const payload = await readTalonResponse(response);
    return { ok: false, status: response.status, error: payload.json || payload.raw };
  }

  const data = await response.json().catch(() => ({}));
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  return { ok: true, status: response.status, sessions };
}

async function deleteTalonSession({ gatewayUrl, token, agentKey, sessionKey }) {
  const url = new URL('/v1/sessions', gatewayUrl);
  url.searchParams.set('sessionKey', sessionKey);
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-talon-agent-id': agentKey
    }
  });

  if (!response.ok && response.status !== 404) {
    const payload = await readTalonResponse(response);
    return { ok: false, status: response.status, error: payload.json || payload.raw };
  }

  return { ok: true, status: response.status };
}

function buildTaskAgentSystemContext({ task, project, user, comments, projectRepos, projectAnalysis }) {
  const contextVersion = task?.updatedAt
    ? new Date(task.updatedAt).toISOString()
    : 'unknown';
  const commentLines = (comments || [])
    .slice(-8)
    .map((c) => {
      const at = c?.createdAt ? new Date(c.createdAt).toISOString() : '';
      const author = String(c?.author || 'unknown');
      const body = String(c?.body || '').trim();
      return `- [${at}] ${author}: ${body}`;
    });
  const lanes = sortColumns(project?.columns || [])
    .filter((c) => c?.enabled !== false)
    .map((c) => String(c?.name || '').trim())
    .filter(Boolean);
  const repoLines = (projectRepos || [])
    .slice(0, 8)
    .map((repo) => {
      const name = String(repo?.repoName || '').trim() || 'unnamed-repo';
      const pathValue = String(repo?.repoPath || '').trim();
      const chunks = Number(repo?.chunkCount || 0) || 0;
      return `- ${name} (${pathValue || 'no-path'}) chunks=${chunks}`;
    });
  const analysisSummary = String(projectAnalysis?.reportMarkdown || '').trim().slice(0, 4000);

  return [
    'STAGE SETTING',
    `- We are working on a ${String(task?.type || 'ticket').toUpperCase()} in project ${project?.name || ''} (${project?.code || ''}).`,
    '- This is a ticket-scoped implementation discussion. Use the provided ticket and project context as source of truth.',
    '- Do not ask the user to repeat fields already present below unless a critical field is truly missing.',
    '',
    'TICKET CONTEXT',
    `- contextVersion: ${contextVersion}`,
    `- id: ${task?.id || ''}`,
    `- ticketNumber: ${task?.ticketNumber || ''}`,
    `- title: ${task?.title || ''}`,
    `- description: ${task?.description || ''}`,
    `- type: ${task?.type || ''}`,
    `- status: ${task?.columnName || ''}`,
    `- priority: ${task?.priority || ''}`,
    `- assignee: ${task?.assignee || ''}`,
    `- dueAt: ${task?.dueAt || ''}`,
    `- tags: ${task?.tags || ''}`,
    '',
    'PROJECT CONTEXT',
    `- id: ${project?.id || ''}`,
    `- code: ${project?.code || ''}`,
    `- name: ${project?.name || ''}`,
    `- description: ${project?.description || ''}`,
    `- repoPath: ${project?.repoPath || ''}`,
    `- localPath: ${project?.localPath || ''}`,
    `- notes: ${project?.notes || ''}`,
    `- lanes: ${lanes.join(', ') || ''}`,
    'PROJECT REPOSITORIES',
    ...(repoLines.length ? repoLines : ['- none']),
    '',
    'PROJECT ANALYSIS',
    projectAnalysis
      ? `- generatedAt: ${projectAnalysis.generatedAt || ''}\n- generatedBy: ${projectAnalysis.generatedBy || ''}\n- model: ${projectAnalysis.model || ''}\n${analysisSummary || ''}`
      : '- none',
    '',
    'ASSIGNEE CONTEXT',
    `- username: ${user?.username || task?.assignee || ''}`,
    `- preferredAgentId: ${user?.preferredAgentId || ''}`,
    '',
    'RECENT COMMENTS',
    ...(commentLines.length ? commentLines : ['- none']),
    '',
    'WORKFLOW INSTRUCTIONS',
    '- Start inside the project repository (prefer localPath, then repoPath).',
    '- Read agent instructions from AGENTS.md at repo root before planning changes.',
    '- Start discovery by reading documentation first: any Markdown files (*.md), README files, and docs/ content.',
    '- Treat Markdown/documentation files as the primary source of project intent and constraints.',
    '- After documentation pass, inspect implementation code and map docs guidance to concrete files/functions.',
    '- Read memory-bank files if present: memory.md, .codex/memory.md, docs/memory.md.',
    '- If key context files are missing, state that clearly and proceed with best-effort assumptions.',
    '- Understand the codebase before proposing changes; map ticket intent to concrete files/modules.',
    '- Then answer the user question directly with implementation steps for this ticket.',
    '- Include concrete file-level suggestions where possible.',
    '',
    'OUTPUT RULES',
    '- First: short understanding of what the ticket asks.',
    '- Second: implementation plan tied to this repo.',
    '- Third: risks/edge cases and validation steps.'
  ].join('\n');
}

function normalizeAssigneeValue(assignee, agent) {
  if (agent?.name) return agent.name;
  return assignee || '';
}

function buildNotificationMessage({ project, task, comment, action }) {
  const projectLabel = project?.code ? `[${project.code}]` : '[Task Master]';
  const taskLabel = task?.ticketNumber ? `${project?.code || 'TASK'}-${task.ticketNumber}` : task?.title;
  const header = `${projectLabel} ${action}: ${taskLabel}`;
  const body = comment ? `\nComment: ${comment.body}` : '';
  return `${header}\n${task?.title || ''}${body}`.trim();
}

function smtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass }
  });
}

async function sendEmailNotification({ to, subject, text }) {
  const transport = smtpTransport();
  if (!transport) {
    return { ok: false, error: 'SMTP not configured' };
  }
  const from = process.env.SMTP_FROM || 'task-master@local';
  await transport.sendMail({ from, to, subject, text });
  return { ok: true };
}

async function sendSlackNotification({ webhookUrl, text }) {
  if (!webhookUrl) return { ok: false, error: 'Missing webhook' };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    return { ok: false, error: `Slack webhook status ${res.status}` };
  }
  return { ok: true };
}

async function notifySubscribers({ project, task, comment, action, mentions = [] }) {
  const subs = await prisma.notificationSubscription.findMany({
    where: {
      active: true,
      OR: [{ projectId: null }, { projectId: project?.id }]
    }
  });
  if (!subs.length) return;

  const users = await prisma.user.findMany({
    where: { id: { in: subs.map(s => s.userId) } },
    select: { id: true, username: true, email: true }
  });
  const userById = new Map(users.map(u => [u.id, u]));
  const mentionedSet = new Set(mentions);

  const message = buildNotificationMessage({ project, task, comment, action });

  for (const sub of subs) {
    const user = userById.get(sub.userId);
    if (!user) continue;
    if (comment?.author && user.username === comment.author) continue;
    const isMentioned = mentionedSet.has(user.username);
    if (sub.mentionsOnly && !isMentioned) continue;
    if (!sub.mentionsOnly && mentions.length > 0 && !isMentioned) {
      // still notify for general updates if not mentions-only
    }
    try {
      if (sub.channel === 'slack') {
        await sendSlackNotification({ webhookUrl: sub.target, text: message });
      } else if (sub.channel === 'email') {
        const to = sub.target || user.email;
        if (to) {
          await sendEmailNotification({ to, subject: `Task Master: ${action}`, text: message });
        }
      }
    } catch (err) {
      await logActivity({
        action: 'notification.error',
        detail: err?.message || 'notification failed',
        projectId: project?.id || null,
        taskId: task?.id || null
      });
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryTalon(status) {
  if (!status) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function readTalonResponse(res) {
  const text = await res.text();
  if (!text) return { raw: '', json: null };
  try {
    return { raw: text, json: JSON.parse(text) };
  } catch {
    return { raw: text, json: null };
  }
}

async function syncAgentToTalon(agent, mode = 'create') {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return { ok: true, skipped: true };

  // Resolve registered model if modelId is present
  const llmConfig = {};
  if (agent.modelId) {
    try {
      const llmModel = await prisma.llmModel.findUnique({
        where: { id: agent.modelId },
        include: { provider: true }
      });

      if (llmModel && llmModel.provider) {
        const provider = llmModel.provider;
        // Construct canonical model string: provider/modelId
        // e.g., google/gemini-pro
        // For OpenAI, it might just be the model code, but passing provider prefix helps Talon route correctly if needed
        // Actually, Talon expects "anthropic/claude-3-opus" or just "gpt-4" depending on gateway logic.
        // Let's assume providerType/providerModelId convention for now or rely on providerModelId if standard.
        // For Google/Anthropic/Ollama, the provider prefix is useful.
        // For simplicity: passing explicit fields to Talon allows it to construct client.

        // But Talon's Agent object usually takes a 'model' string.
        // Let's use `providerType/providerModelId` as the model string for clarity unless it's standard like 'gpt-4'
        if (provider.providerType === 'openai') {
          llmConfig.model = llmModel.providerModelId;
        } else {
          llmConfig.model = `${provider.providerType}/${llmModel.providerModelId}`;
        }

        // Use baseUrl if present
        if (provider.baseUrl) llmConfig.baseUrl = provider.baseUrl;

        // Decrypt API key
        if (provider.encryptedApiKey && provider.apiKeyNonce && provider.apiKeyTag) {
          try {
            const key = decrypt(provider.encryptedApiKey, provider.apiKeyNonce, provider.apiKeyTag);
            if (key) llmConfig.apiKey = key;
          } catch (e) {
            console.error(`Failed to decrypt API key for provider ${provider.name}`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Failed to load LLM model for agent ${agent.name}`, e);
    }
  }

  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const agentKey = agent.talonAgentId || agent.name || agent.id;
  const url = buildTalonAgentUrl(gatewayUrl, mode === 'update' ? agentKey : '');
  const method = mode === 'update' ? 'PUT' : 'POST';
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const resolvedModel = llmConfig.model || agent.model || '';
  const hasOrchestrationModels = !!(agent.defaultModel || agent.fallbackModel);
  const hasAnyModel = hasOrchestrationModels || !!resolvedModel;

  const body = {
    id: agentKey,
    name: agent.name,
    role: agent.role || '',
    type: isJarvisAgentRecord(agent) ? 'main' : 'subagent',
    parentAgentId: isJarvisAgentRecord(agent) ? null : JARVIS_CANONICAL_KEY,
    isSystem: isJarvisAgentRecord(agent),
    ...(hasAnyModel
      ? {
          // Prefer orchestration model settings when present, fallback to registered/custom model
          model: hasOrchestrationModels
            ? {
                primary: agent.defaultModel || resolvedModel,
                fallbacks: agent.fallbackModel ? [agent.fallbackModel] : []
              }
            : resolvedModel
        }
      : {}),
    apiKey: llmConfig.apiKey,
    baseUrl: llmConfig.baseUrl,
    systemPrompt: agent.soul || '',
    guardrails: agent.guardrails || '',
    bootstrap: agent.bootstrap || '',
    repoContext: agent.everyone || ''
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: text };
    }
    return { ok: true };
  } catch (err) {
    // Network failure or invalid URL - log but treat as non-fatal to allow TM agent creation
    console.error(`[Talon Sync] Failed to sync agent ${agent.name} to ${url}: ${err.message}`);
    return { ok: true, warning: 'Sync failed, proceeds locally', error: err.message };
  }
}

async function deleteAgentInTalon(agent) {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return { ok: true, skipped: true };
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const agentKey = agent?.talonAgentId || agent?.name || agent?.id || '';
  const url = buildTalonAgentUrl(gatewayUrl, agentKey);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch(url, { method: 'DELETE', headers });
    // 404 means agent doesn't exist in Talon - that's fine for deletion
    if (res.ok || res.status === 404) {
      return { ok: true };
    }
    const text = await res.text();
    return { ok: false, status: res.status, error: text };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || 'Talon delete failed' };
  }
}


async function callTalonWithRetry({ url, headers, body, maxAttempts, retryDelayMs }) {
  let attempt = 0;
  let lastError = null;
  let lastStatus = 0;
  let lastPayload = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      lastStatus = res.status;
      const payload = await readTalonResponse(res);
      lastPayload = payload;
      if (res.ok) {
        return { ok: true, status: res.status, payload, attempts: attempt };
      }
      if (!shouldRetryTalon(res.status) || attempt >= maxAttempts) {
        return { ok: false, status: res.status, payload, attempts: attempt };
      }
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) {
        return { ok: false, status: lastStatus, error: err, payload: lastPayload, attempts: attempt };
      }
    }
    const delay = retryDelayMs * attempt;
    await sleep(delay);
  }

  return { ok: false, status: lastStatus, error: lastError, payload: lastPayload, attempts: maxAttempts };
}

async function runTalonRequest({ task, project, assignee, prevColumnName, nextColumnName, agent, request, source = 'trigger', maxAttempts, retryDelayMs }) {
  const startedAt = Date.now();
  const result = await callTalonWithRetry({
    url: request.url,
    headers: request.headers,
    body: request.body,
    maxAttempts,
    retryDelayMs
  });
  const latencyMs = Date.now() - startedAt;
  const responseJson = result.payload?.json;
  const modelUsed = extractTalonResponseModel(responseJson, request.body?.model || '');
  const responseText = extractTalonResponseText(responseJson);
  const usage = extractTalonUsage(responseJson);
  const costPer1k = Number(process.env.TALON_COST_PER_1K || 0);
  const costUsd = costPer1k > 0 ? (usage.totalTokens / 1000) * costPer1k : null;
  const triggerAction = source === 'retry' ? 'talon.retry' : 'talon.trigger';
  const errorAction = source === 'retry' ? 'talon.retry.error' : 'talon.error';

  await logActivity({
    action: triggerAction,
    detail: `${task.id} ${prevColumnName || ''} -> ${nextColumnName || ''} attempts=${result.attempts}`.trim(),
    actor: assignee || 'system',
    projectId: task.projectId,
    taskId: task.id
  });

  if (!result.ok) {
    await logActivity({
      action: errorAction,
      detail: `status=${result.status || 0} attempts=${result.attempts} ${String(result.payload?.raw || result.error?.message || '').slice(0, 200)}`,
      actor: assignee || 'system',
      projectId: task.projectId,
      taskId: task.id
    });
    return { ok: false, result };
  }

  await logActivity({
    action: 'talon.response',
    detail: `model=${modelUsed || 'unknown'} latencyMs=${latencyMs} source=${source} tokens=${usage.totalTokens}${costUsd ? ` costUsd=${costUsd.toFixed(4)}` : ''}`,
    actor: agent?.name || assignee || 'system',
    projectId: task.projectId,
    taskId: task.id
  });
  if (usage.totalTokens > 0) {
    const user = assignee
      ? await prisma.user.findUnique({ where: { username: assignee } })
      : null;
    await prisma.usageEntry.create({
      data: {
        projectId: task.projectId,
        taskId: task.id,
        agentId: agent?.id || null,
        userId: user?.id || null,
        model: modelUsed || '',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        costUsd: costUsd === null ? null : Number(costUsd.toFixed(6))
      }
    });
  }
  if (responseText) {
    const modelKeyRaw = String(request?.body?.model || '');
    const agentKey = modelKeyRaw.startsWith('talon:') ? modelKeyRaw.slice('talon:'.length) : modelKeyRaw;
    const headerAgentKey = String(request?.headers?.['x-talon-agent-id'] || request?.headers?.['X-Talon-Agent-Id'] || '');
    const sessionKeyRaw = String(request?.body?.metadata?.sessionKey || '');
    const sessionAgentKey = sessionKeyRaw.startsWith('agent:')
      ? sessionKeyRaw.split(':')[1] || ''
      : '';
    const resolvedAgentKey = agentKey || headerAgentKey || sessionAgentKey;
    const agentForMessage = agent || (resolvedAgentKey
      ? await prisma.agent.findFirst({
        where: {
          OR: [
            { id: resolvedAgentKey },
            { talonAgentId: resolvedAgentKey },
            { name: resolvedAgentKey }
          ]
        }
      })
      : null);
    const author = agentForMessage?.name || agent?.name || 'Talon';
    await prisma.comment.create({
      data: {
        taskId: task.id,
        author,
        body: responseText
      }
    });
    if (agentForMessage?.id) {
      await prisma.agentMessage.create({
        data: {
          agentId: agentForMessage.id,
          author,
          body: responseText
        }
      });
    }
    await logActivity({
      action: 'talon.comment',
      detail: `Agent response added (${responseText.slice(0, 80)})`,
      actor: agentForMessage?.name || assignee || 'system',
      projectId: task.projectId,
      taskId: task.id
    });
  }
  return { ok: true, result };
}

function shouldQueueTalon() {
  const raw = String(process.env.TALON_QUEUE_ENABLED || '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function getUsageTotals({ projectId, userId }) {
  const since = monthStart();
  const where = { createdAt: { gte: since } };
  if (projectId) where.projectId = projectId;
  if (userId) where.userId = userId;
  const sums = await prisma.usageEntry.aggregate({
    where,
    _sum: { totalTokens: true, costUsd: true }
  });
  return {
    totalTokens: sums._sum.totalTokens ?? 0,
    costUsd: sums._sum.costUsd ?? 0
  };
}

async function checkQuota({ project, user }) {
  if (!project && !user) return { blocked: false };
  const projectTotals = project ? await getUsageTotals({ projectId: project.id }) : { totalTokens: 0, costUsd: 0 };
  const userTotals = user ? await getUsageTotals({ userId: user.id }) : { totalTokens: 0, costUsd: 0 };
  if (project?.monthlyTokenLimit && projectTotals.totalTokens >= project.monthlyTokenLimit) {
    return { blocked: true, reason: 'project token limit reached' };
  }
  if (project?.monthlyCostLimit && projectTotals.costUsd >= project.monthlyCostLimit) {
    return { blocked: true, reason: 'project cost limit reached' };
  }
  if (user?.monthlyTokenLimit && userTotals.totalTokens >= user.monthlyTokenLimit) {
    return { blocked: true, reason: 'user token limit reached' };
  }
  if (user?.monthlyCostLimit && userTotals.costUsd >= user.monthlyCostLimit) {
    return { blocked: true, reason: 'user cost limit reached' };
  }
  return { blocked: false };
}

async function enqueueTalonRetry({ task, agentId, assignee, prevColumnName, nextColumnName, request, attempts, error }) {
  await prisma.talonRetry.create({
    data: {
      taskId: task.id,
      projectId: task.projectId,
      agentId,
      request: {
        url: request.url,
        headers: request.headers,
        body: request.body,
        assignee: assignee || '',
        prevColumnName: prevColumnName || '',
        nextColumnName: nextColumnName || ''
      },
      attempts: attempts || 0,
      status: 'pending',
      lastError: error || ''
    }
  });
  await logActivity({
    action: 'talon.retry.queued',
    detail: `task=${task.id} agent=${agentId}`,
    actor: assignee || 'system',
    projectId: task.projectId,
    taskId: task.id
  });
}

async function processTalonQueueItem(item, { maxAttempts, retryDelayMs }) {
  const request = item.request || {};
  const task = await prisma.task.findUnique({ where: { id: item.taskId } });
  if (!task) {
    await prisma.talonRetry.update({
      where: { id: item.id },
      data: { status: 'failed', lastError: 'Task not found' }
    });
    return { ok: false, reason: 'Task not found' };
  }
  const project = await prisma.project.findUnique({ where: { id: task.projectId } });
  if (!project) {
    await prisma.talonRetry.update({
      where: { id: item.id },
      data: { status: 'failed', lastError: 'Project not found' }
    });
    return { ok: false, reason: 'Project not found' };
  }
  const agent = await prisma.agent.findUnique({ where: { id: item.agentId } });

  const outcome = await runTalonRequest({
    task,
    project,
    assignee: request.assignee || '',
    prevColumnName: request.prevColumnName || '',
    nextColumnName: request.nextColumnName || '',
    agent,
    request: {
      url: request.url,
      headers: request.headers,
      body: request.body
    },
    source: 'retry',
    maxAttempts,
    retryDelayMs
  });

  if (outcome.ok) {
    await prisma.talonRetry.update({
      where: { id: item.id },
      data: { status: 'done', attempts: item.attempts + 1, lastError: '' }
    });
    return { ok: true };
  }

  const nextAttempts = item.attempts + 1;
  const status = nextAttempts >= maxAttempts ? 'failed' : 'pending';
  await prisma.talonRetry.update({
    where: { id: item.id },
    data: {
      status,
      attempts: nextAttempts,
      lastError: String(outcome.result?.payload?.raw || outcome.result?.error?.message || '').slice(0, 500)
    }
  });
  return { ok: false, reason: 'retry failed' };
}

async function processTalonQueue({ limit = 5 }) {
  const maxAttempts = Number(process.env.TALON_QUEUE_MAX_ATTEMPTS || 3);
  const retryDelayMs = Number(process.env.TALON_RETRY_DELAY_MS || 500);
  const items = await prisma.talonRetry.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit
  });
  const results = [];
  for (const item of items) {
    await prisma.talonRetry.update({ where: { id: item.id }, data: { status: 'processing' } });
    results.push(await processTalonQueueItem(item, { maxAttempts, retryDelayMs }));
  }
  return results;
}

async function triggerTalonSession({ task, project, assignee, prevColumnName, nextColumnName, comment }) {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return;

  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const agents = await prisma.agent.findMany({ orderBy: { name: 'asc' } });
  const rules = await prisma.routingRule.findMany({
    where: { projectId: task.projectId, enabled: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
  });
  const routedAgentId = resolveAgentIdFromRules({ rules, task });
  let preferredAgentId = '';
  let user = null;
  if (assignee) {
    user = await prisma.user.findUnique({ where: { username: assignee } });
    preferredAgentId = user?.preferredAgentId || '';
  }
  const quotaCheck = await checkQuota({ project, user });
  if (quotaCheck.blocked) {
    await logActivity({
      action: 'talon.quota.blocked',
      detail: quotaCheck.reason || 'quota exceeded',
      actor: assignee || 'system',
      projectId: task.projectId,
      taskId: task.id
    });
    return;
  }
  const agentId = resolveAgentId({
    assignee,
    agents,
    defaultAgentId: process.env.TALON_DEFAULT_AGENT_ID || '',
    preferredAgentId: routedAgentId || preferredAgentId
  });
  if (!agentId) return;

  const agent = agents.find(a => a.id === agentId);
  const agentKey = resolveAgentKey(agent);
  if (!agentKey) return;

  let sessionKey = task.sessionKey || '';
  const desiredSessionKey = buildSessionKey(agentKey, task.id);
  if (!sessionKey || sessionKey !== desiredSessionKey) {
    sessionKey = desiredSessionKey;
    await prisma.task.update({ where: { id: task.id }, data: { sessionKey } });
  }
  const request = buildTalonRequest({
    gatewayUrl,
    token,
    agentId: agentKey,
    sessionKey,
    task: { ...task, sessionKey },
    project,
    comment
  });

  const headers = Object.fromEntries(Object.entries(request.headers).filter(([, v]) => v));
  const maxAttempts = Number(process.env.TALON_MAX_ATTEMPTS || 3);
  const retryDelayMs = Number(process.env.TALON_RETRY_DELAY_MS || 500);
  try {
    const outcome = await runTalonRequest({
      task,
      project,
      assignee,
      prevColumnName,
      nextColumnName,
      agent,
      request: { ...request, headers },
      source: 'trigger',
      maxAttempts,
      retryDelayMs
    });
    if (!outcome.ok && shouldQueueTalon()) {
      await enqueueTalonRetry({
        task,
        agentId,
        assignee,
        prevColumnName,
        nextColumnName,
        request: { ...request, headers },
        attempts: outcome.result.attempts,
        error: String(outcome.result.payload?.raw || outcome.result.error?.message || '')
      });
    }
  } catch (err) {
    await logActivity({
      action: 'talon.error',
      detail: err?.message || 'Talon request failed',
      actor: assignee || 'system',
      projectId: task.projectId,
      taskId: task.id
    });
  }
}

function normalizeColumnNames(list) {
  const names = (list || [])
    .map(n => String(n).trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function mergeProjectColumns(existingColumns, desiredNames) {
  const existing = Array.isArray(existingColumns) ? existingColumns : [];
  const byName = new Map(existing.map(col => [col.name, col]));
  const next = [];

  desiredNames.forEach((name, idx) => {
    const prev = byName.get(name);
    next.push({
      name,
      order: idx,
      enabled: true
    });
    if (prev) byName.delete(name);
  });

  const disabled = [...byName.values()].map((col, idx) => ({
    name: col.name,
    order: desiredNames.length + idx,
    enabled: false
  }));

  return [...next, ...disabled];
}

function sortColumns(columns) {
  return (Array.isArray(columns) ? columns : []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function requireAuth(req, res, next) {
  const apiKey = req.get('x-api-key');
  if (!apiKey) return bad(res, 401, 'Unauthorized');
  const user = await prisma.user.findUnique({ where: { apiKey } });
  if (!user) return bad(res, 401, 'Unauthorized');
  if (user.active === false) return bad(res, 403, 'User disabled');
  req.user = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    apiKey: user.apiKey,
    role: user.role,
    projectIds: user.projectIds || []
  };
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') return bad(res, 403, 'Forbidden');
  next();
}

async function canAccessProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return (user.projectIds || []).includes(projectId);
}

const JARVIS_CANONICAL_NAME = 'Jarvis';
const JARVIS_CANONICAL_KEY = 'jarvis';
const JARVIS_DEFAULT_MODEL = 'ollama/llama3.1';

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function toSafeToken(value, fallback = 'agent') {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return token || fallback;
}

function buildAutoTalonAgentId({ name, primaryModel }) {
  const safeName = toSafeToken(name, 'agent');
  const safeModel = toSafeToken(primaryModel, 'model');
  return `talon:${safeName}:${safeModel}`;
}

async function ensureUniqueTalonAgentId(baseId) {
  let next = String(baseId || '').trim();
  if (!next) return null;

  let attempt = 1;
  while (attempt <= 50) {
    const exists = await prisma.agent.findFirst({ where: { talonAgentId: next }, select: { id: true } });
    if (!exists) return next;
    attempt += 1;
    next = `${baseId}-${attempt}`;
  }

  return `${baseId}-${crypto.randomBytes(2).toString('hex')}`;
}

function isJarvisAgentRecord(agent) {
  if (!agent) return false;
  return normalizeLower(agent.talonAgentId) === JARVIS_CANONICAL_KEY
    || normalizeLower(agent.name) === JARVIS_CANONICAL_KEY
    || !!agent.isMain;
}

function toHierarchyAgent(agent, jarvisMainId) {
  const isMain = agent?.id === jarvisMainId;
  return {
    ...agent,
    isMain,
    type: isMain ? 'main' : 'subagent',
    isSystem: isMain,
    parentAgentId: isMain ? null : jarvisMainId
  };
}

async function ensureJarvisMainAgent() {
  const allAgents = await prisma.agent.findMany({
    orderBy: { createdAt: 'asc' }
  });
  let jarvisCreated = false;
  let jarvisUpdated = false;

  let jarvis = allAgents.find(a => normalizeLower(a.talonAgentId) === JARVIS_CANONICAL_KEY)
    || allAgents.find(a => normalizeLower(a.name) === JARVIS_CANONICAL_KEY)
    || null;

  if (!jarvis) {
    jarvis = await prisma.agent.create({
      data: {
        name: JARVIS_CANONICAL_NAME,
        role: 'Main Assistant',
        model: JARVIS_DEFAULT_MODEL,
        talonAgentId: JARVIS_CANONICAL_KEY,
        isMain: true,
        status: 'idle'
      }
    });
    jarvisCreated = true;
  }

  const jarvisNeedsUpdate = jarvis.name !== JARVIS_CANONICAL_NAME
    || normalizeLower(jarvis.talonAgentId) !== JARVIS_CANONICAL_KEY
    || !jarvis.isMain;

  if (jarvisNeedsUpdate) {
    jarvis = await prisma.agent.update({
      where: { id: jarvis.id },
      data: {
        name: JARVIS_CANONICAL_NAME,
        talonAgentId: JARVIS_CANONICAL_KEY,
        isMain: true
      }
    });
    jarvisUpdated = true;
  }

  await prisma.agent.updateMany({
    where: { NOT: { id: jarvis.id }, isMain: true },
    data: { isMain: false }
  });

  if (jarvisCreated || jarvisUpdated) {
    const mode = jarvisCreated ? 'create' : 'update';
    const sync = await syncAgentToTalon(jarvis, mode);
    if (!sync.ok) {
      console.warn(`[Jarvis Ensure] Talon sync failed (${mode}):`, sync.error || sync.status || 'unknown');
    }
  }

  return jarvis;
}


app.get('/health', (req, res) => ok(res, { status: 'ok' }));

app.get('/api/jarvis/status', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return ok(res, { status: 'down', reason: 'no-url' });
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  const agent = await ensureJarvisMainAgent();

  try {
    const r = await fetch(new URL('/v1/agents', gatewayUrl), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(2000)
    });
    const info = {
      defaultModel: agent?.defaultModel || agent?.model || 'unknown',
      fallbackModel: agent?.fallbackModel || 'none'
    };

    if (r.ok || r.status === 401) {
      ok(res, { status: 'up', ...info });
    } else {
      ok(res, { status: 'down', reason: `http-${r.status}`, ...info });
    }
  } catch (err) {
    ok(res, { status: 'down', reason: err.message });
  }
});

app.get('/api/jarvis/sessions', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const jarvis = await ensureJarvisMainAgent();
  const agentId = req.query.agentId || jarvis.talonAgentId || process.env.TALON_DEFAULT_AGENT_ID || 'jarvis';

  try {
    const response = await fetch(new URL('/v1/sessions', gatewayUrl), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-talon-agent-id': agentId
      }
    });

    if (!response.ok) {
      const payload = await readTalonResponse(response);
      return bad(res, response.status, 'Talon error', payload.json || payload.raw);
    }

    const data = await response.json();
    ok(res, data.sessions);
  } catch (err) {
    bad(res, 500, 'Failed to fetch sessions from Talon', err.message);
  }
});

app.post('/api/jarvis/sessions/label', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const jarvis = await ensureJarvisMainAgent();
  const agentId = req.body.agentId || jarvis.talonAgentId || process.env.TALON_DEFAULT_AGENT_ID || 'jarvis';
  const { sessionKey, label } = req.body;

  if (!sessionKey || !label) return bad(res, 400, 'sessionKey and label required');

  try {
    const response = await fetch(new URL('/v1/sessions', gatewayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-talon-agent-id': agentId
      },
      body: JSON.stringify({ sessionKey, label })
    });

    if (!response.ok) {
      const payload = await readTalonResponse(response);
      return bad(res, response.status, 'Talon error', payload.json || payload.raw);
    }

    ok(res, { ok: true });
  } catch (err) {
    bad(res, 500, 'Failed to update session label in Talon', err.message);
  }
});

app.get('/api/jarvis/sessions/transcript', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const jarvis = await ensureJarvisMainAgent();
  const agentId = req.query.agentId || jarvis.talonAgentId || process.env.TALON_DEFAULT_AGENT_ID || 'jarvis';
  const { sessionKey } = req.query;

  if (!sessionKey) return bad(res, 400, 'sessionKey required');

  try {
    const requestedSessionKey = String(sessionKey).trim();
    const candidateSessionKeys = requestedSessionKey.startsWith('jarvis:')
      ? [requestedSessionKey, `openai:${requestedSessionKey}`]
      : [requestedSessionKey];

    for (let i = 0; i < candidateSessionKeys.length; i += 1) {
      const key = candidateSessionKeys[i];
      const url = new URL('/v1/sessions/transcript', gatewayUrl);
      url.searchParams.set('sessionKey', key);

      const response = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-talon-agent-id': agentId
        }
      });

      if (response.ok) {
        const data = await response.json();
        return ok(res, data.messages);
      }

      if (response.status === 404 && i < candidateSessionKeys.length - 1) {
        continue;
      }

      const payload = await readTalonResponse(response);
      return bad(res, response.status, 'Talon error', payload.json || payload.raw);
    }

    return ok(res, []);
  } catch (err) {
    bad(res, 500, 'Failed to fetch transcript from Talon', err.message);
  }
});

app.delete('/api/jarvis/sessions', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const jarvis = await ensureJarvisMainAgent();
  const agentId = req.query.agentId || jarvis.talonAgentId || process.env.TALON_DEFAULT_AGENT_ID || 'jarvis';
  const sessionKey = String(req.query.sessionKey || '').trim();

  if (!sessionKey) return bad(res, 400, 'sessionKey required');

  try {
    const url = new URL('/v1/sessions', gatewayUrl);
    url.searchParams.set('sessionKey', sessionKey);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-talon-agent-id': agentId
      }
    });

    if (!response.ok) {
      const payload = await readTalonResponse(response);
      return bad(res, response.status, 'Talon error', payload.json || payload.raw);
    }

    const data = await response.json().catch(() => ({ ok: true }));
    ok(res, data);
  } catch (err) {
    bad(res, 500, 'Failed to delete session in Talon', err.message);
  }
});

// (debug endpoint removed)

app.post('/api/login', async (req, res) => {
  const parsed = Login.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (!user) return bad(res, 401, 'Invalid credentials');
  if (user.active === false) return bad(res, 403, 'User disabled');
  if (!verifyPassword(user.passwordHash, parsed.data.password)) return bad(res, 401, 'Invalid credentials');

  ok(res, { apiKey: user.apiKey, username: user.username, displayName: user.displayName, role: user.role });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return bad(res, 404, 'User not found');
  ok(res, { id: user.id, username: user.username, displayName: user.displayName, email: user.email || '', role: user.role, active: user.active, apiKey: user.apiKey, preferredAgentId: user.preferredAgentId || null, monthlyTokenLimit: user.monthlyTokenLimit ?? null, monthlyCostLimit: user.monthlyCostLimit ?? null });
});

app.patch('/api/me', requireAuth, async (req, res) => {
  const parsed = UpdateMe.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());
  const updates = {};
  if (typeof parsed.data.displayName === 'string') {
    updates.displayName = parsed.data.displayName;
  }
  if (typeof parsed.data.email === 'string') {
    updates.email = parsed.data.email;
  }
  if ('preferredAgentId' in parsed.data) {
    if (parsed.data.preferredAgentId) {
      const agent = await prisma.agent.findUnique({ where: { id: parsed.data.preferredAgentId } });
      if (!agent) return bad(res, 404, 'Agent not found');
      updates.preferredAgentId = parsed.data.preferredAgentId;
    } else {
      updates.preferredAgentId = null;
    }
  }
  if (typeof parsed.data.color === 'string') {
    updates.color = parsed.data.color;
  }
  if (Object.keys(updates).length === 0) {
    return bad(res, 400, 'No changes provided');
  }
  const user = await prisma.user.update({ where: { id: req.user.id }, data: updates });
  await logActivity({ action: 'user.profile.update', actor: req.user.username });
  ok(res, { id: user.id, username: user.username, displayName: user.displayName, role: user.role, active: user.active, preferredAgentId: user.preferredAgentId || null, color: user.color });
});

app.post('/api/me/api-key', requireAuth, async (req, res) => {
  const apiKey = crypto.randomBytes(24).toString('hex');
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { apiKey } });
  await logActivity({ action: 'user.apiKey.rotate', actor: req.user.username });
  ok(res, { apiKey: user.apiKey });
});

app.post('/api/me/password', requireAuth, async (req, res) => {
  const parsed = ChangePassword.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return bad(res, 404, 'User not found');
  if (!verifyPassword(user.passwordHash, parsed.data.currentPassword)) {
    return bad(res, 401, 'Invalid current password');
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) }
  });

  await logActivity({ action: 'user.password.change', actor: req.user.username });
  ok(res, { changed: true });
});

// Notification subscriptions (user preferences)
app.get('/api/me/notifications', requireAuth, async (req, res) => {
  const items = await prisma.notificationSubscription.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'asc' }
  });
  ok(res, items);
});

app.post('/api/me/notifications', requireAuth, async (req, res) => {
  const parsed = CreateNotificationSubscription.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  if (parsed.data.projectId) {
    if (!(await canAccessProject(req.user, parsed.data.projectId))) return bad(res, 403, 'Forbidden');
  }

  const item = await prisma.notificationSubscription.create({
    data: {
      userId: req.user.id,
      projectId: parsed.data.projectId || null,
      channel: parsed.data.channel,
      target: parsed.data.target,
      mentionsOnly: parsed.data.mentionsOnly ?? true,
      active: parsed.data.active ?? true
    }
  });
  await logActivity({ action: 'notification.subscribe', actor: req.user.username });
  ok(res, item);
});

app.patch('/api/me/notifications/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const parsed = UpdateNotificationSubscription.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const existing = await prisma.notificationSubscription.findUnique({ where: { id } });
  if (!existing) return bad(res, 404, 'Subscription not found');
  if (existing.userId !== req.user.id) return bad(res, 403, 'Forbidden');

  if (parsed.data.projectId) {
    if (!(await canAccessProject(req.user, parsed.data.projectId))) return bad(res, 403, 'Forbidden');
  }

  const updated = await prisma.notificationSubscription.update({
    where: { id },
    data: {
      ...parsed.data,
      projectId: parsed.data.projectId ?? existing.projectId
    }
  });
  await logActivity({ action: 'notification.update', actor: req.user.username });
  ok(res, updated);
});

app.delete('/api/me/notifications/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.notificationSubscription.findUnique({ where: { id } });
  if (!existing) return bad(res, 404, 'Subscription not found');
  if (existing.userId !== req.user.id) return bad(res, 403, 'Forbidden');

  await prisma.notificationSubscription.delete({ where: { id } });
  await logActivity({ action: 'notification.unsubscribe', actor: req.user.username });
  ok(res, { deleted: true });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  if (req.path === '/client-error') return next();
  if (req.path === '/talon/callback') return next();
  return requireAuth(req, res, next);
});

// Projects
app.get('/api/projects', async (req, res) => {
  if (req.user.role === 'ADMIN') {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    return ok(res, projects.map(p => ({ ...p, columns: sortColumns(p.columns) })));
  }

  const projectIds = req.user.projectIds || [];
  if (projectIds.length === 0) return ok(res, []);
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, active: true },
    orderBy: { updatedAt: 'desc' }
  });
  ok(res, projects.map(p => ({ ...p, columns: sortColumns(p.columns) })));
});

app.get('/api/users', async (req, res) => {
  // For UI conveniences (assignee dropdown etc.)
  // Non-admins only see themselves.
  const users = await prisma.user.findMany({
    where: req.user.role === 'ADMIN' ? {} : { id: req.user.id },
    orderBy: { username: 'asc' },
    select: { id: true, username: true, displayName: true, email: true, role: true, active: true, preferredAgentId: true, monthlyTokenLimit: true, monthlyCostLimit: true, color: true }
  });
  ok(res, users);
});

// Agents (Mission Control)
app.get('/api/agents', async (req, res) => {
  const jarvis = await ensureJarvisMainAgent();
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'asc' },
    include: { currentTask: true }
  });
  const mapped = agents.map(a => toHierarchyAgent(a, jarvis.id));
  mapped.sort((a, b) => {
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  ok(res, mapped);
});

app.get('/api/jarvis/agents-hierarchy', async (req, res) => {
  const jarvis = await ensureJarvisMainAgent();
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'asc' },
    include: { currentTask: true }
  });
  const mapped = agents.map(a => toHierarchyAgent(a, jarvis.id));
  mapped.sort((a, b) => {
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  ok(res, mapped);
});

app.post('/api/agents', requireAdmin, async (req, res) => {
  const parsed = CreateAgent.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const jarvis = await ensureJarvisMainAgent();
  const { modelId, currentTaskId, ...rest } = parsed.data;

  // Extract and remap talonId, ensuring it is NOT in the rest object passed to Prisma
  const { talonId, ...cleanRest } = rest;
  const normalizedName = String(cleanRest.name || '').trim();
  const normalizedTalonId = String(talonId || '').trim();
  if (normalizeLower(normalizedName) === JARVIS_CANONICAL_KEY || normalizeLower(normalizedTalonId) === JARVIS_CANONICAL_KEY) {
    return bad(res, 400, 'Jarvis is system-defined. Use Create Subagent with a different name/id.');
  }

  const requestedPrimaryModel = String(cleanRest.defaultModel || cleanRest.model || '').trim();
  const autoBaseTalonId = buildAutoTalonAgentId({
    name: normalizedName,
    primaryModel: requestedPrimaryModel
  });
  const finalTalonAgentId = await ensureUniqueTalonAgentId(normalizedTalonId || autoBaseTalonId);

  const agent = await prisma.agent.create({
    data: {
      name: normalizedName,
      role: cleanRest.role?.trim(),
      model: cleanRest.model?.trim(),
      defaultModel: cleanRest.defaultModel?.trim(),
      fallbackModel: cleanRest.fallbackModel?.trim(),
      talonAgentId: finalTalonAgentId,
      isMain: false,
      soul: cleanRest.soul?.trim() || '',
      guardrails: cleanRest.guardrails?.trim() || '',
      bootstrap: cleanRest.bootstrap?.trim() || '',
      everyone: cleanRest.everyone?.trim() || '',
      llmModel: modelId ? { connect: { id: modelId } } : undefined,
      currentTask: currentTaskId ? { connect: { id: currentTaskId } } : undefined
    }
  });

  const sync = await syncAgentToTalon(agent, 'create');
  if (!sync.ok) {
    await prisma.agent.delete({ where: { id: agent.id } });
    await logActivity({ action: 'agent.sync.error', actor: req.user.username, detail: `create ${agent.name} status=${sync.status || 0}` });
    return bad(res, 502, 'Talon sync failed', sync.error);
  }
  await logActivity({ action: 'agent.create', actor: req.user.username, detail: agent.name });
  ok(res, toHierarchyAgent(agent, jarvis.id));
});

app.patch('/api/agents/:id', requireAdmin, async (req, res) => {
  const parsed = UpdateAgent.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const jarvis = await ensureJarvisMainAgent();
  const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!existing) return bad(res, 404, 'Agent not found');
  const editingJarvis = existing.id === jarvis.id;

  const { modelId, currentTaskId, talonId, ...rest } = parsed.data;
  const updateData = { ...rest };

  if (updateData.name) updateData.name = updateData.name.trim();
  if (updateData.role) updateData.role = updateData.role.trim();
  if (updateData.model) updateData.model = updateData.model.trim();
  if (updateData.defaultModel) updateData.defaultModel = updateData.defaultModel.trim();
  if (updateData.fallbackModel) updateData.fallbackModel = updateData.fallbackModel.trim();
  if (updateData.soul) updateData.soul = updateData.soul.trim();
  if (updateData.guardrails) updateData.guardrails = updateData.guardrails.trim();
  if (updateData.bootstrap) updateData.bootstrap = updateData.bootstrap.trim();
  if (updateData.everyone) updateData.everyone = updateData.everyone.trim();

  if (!editingJarvis && normalizeLower(updateData.name) === JARVIS_CANONICAL_KEY) {
    return bad(res, 400, 'Subagent name cannot be Jarvis');
  }

  if (talonId !== undefined) {
    const normalizedTalonId = (talonId || '').trim();
    if (!editingJarvis && normalizeLower(normalizedTalonId) === JARVIS_CANONICAL_KEY) {
      return bad(res, 400, 'Subagent Talon ID cannot be jarvis');
    }
    updateData.talonAgentId = normalizedTalonId || null;
  }

  if (modelId !== undefined) {
    updateData.llmModel = modelId ? { connect: { id: modelId } } : { disconnect: true };
  }
  if (currentTaskId !== undefined) {
    updateData.currentTask = currentTaskId ? { connect: { id: currentTaskId } } : { disconnect: true };
  }

  // Enforce hierarchy invariants in v1.
  updateData.isMain = editingJarvis;
  if (editingJarvis) {
    updateData.name = JARVIS_CANONICAL_NAME;
    updateData.talonAgentId = JARVIS_CANONICAL_KEY;
  }

  const agentObj = await prisma.agent.update({
    where: { id: req.params.id },
    data: updateData
  });
  await ensureJarvisMainAgent();

  const sync = await syncAgentToTalon(agentObj, 'update');
  if (!sync.ok) {
    await logActivity({ action: 'agent.sync.warning', actor: req.user.username, detail: `update ${existing.name} status=${sync.status || 0}` });
    return ok(res, { ...toHierarchyAgent(agentObj, jarvis.id), talonSynced: false, talonSyncError: sync.error || 'Talon sync failed' });
  }
  await logActivity({ action: 'agent.update', actor: req.user.username, detail: agentObj.name });
  ok(res, { ...toHierarchyAgent(agentObj, jarvis.id), talonSynced: true });
});

app.delete('/api/agents/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const jarvis = await ensureJarvisMainAgent();
  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) return bad(res, 404, 'Agent not found');
  if (existing.id === jarvis.id || isJarvisAgentRecord(existing)) {
    return bad(res, 400, 'Jarvis is system-defined and cannot be deleted');
  }

  // Attempt Talon delete but don't block on failure
  const sync = await deleteAgentInTalon(existing);
  if (!sync.ok) {
    // Log the error but proceed with local deletion
    await logActivity({ action: 'agent.sync.warning', actor: req.user.username, detail: `Talon delete for ${existing.name} failed: ${sync.error || 'unknown'}` });
    console.warn(`[Agent Delete] Talon sync failed for ${existing.name}:`, sync.error);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.agentMessage.deleteMany({ where: { agentId: id } });
      await tx.routingRule.deleteMany({ where: { agentId: id } });
      await tx.agent.delete({ where: { id } });
    });
  } catch (err) {
    if (err?.code === 'P2003') {
      return bad(res, 409, 'Agent cannot be deleted due to related records', {
        agentId: id,
        reason: 'Remove or reassign related records first'
      });
    }
    throw err;
  }

  await logActivity({ action: 'agent.delete', actor: req.user.username, detail: existing.name });
  ok(res, { deleted: true, talonSynced: sync.ok });
});

app.post('/api/agents/:id/test', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return bad(res, 404, 'Agent not found');

  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  const agentKey = resolveAgentKey(agent) || id;
  const sessionKey = `agent-test:${agentKey}:${req.user.username}`;
  const body = {
    model: `talon:${agentKey}`,
    messages: [
      { role: 'user', content: 'Ping test: reply with a short health acknowledgment.' }
    ],
    metadata: { sessionKey }
  };

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'x-talon-agent-id': agentKey,
    'x-talon-session-key': sessionKey
  };

  try {
    const startedAt = Date.now();
    const response = await fetch(new URL('/v1/chat/completions', gatewayUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    const latencyMs = Date.now() - startedAt;

    const payload = await readTalonResponse(response);
    if (!response.ok) {
      return bad(res, response.status, 'Agent test failed in Talon', payload.json || payload.raw);
    }

    const text = extractTalonResponseText(payload.json);
    const model = extractTalonResponseModel(payload.json, body.model);
    const usage = extractTalonUsage(payload.json);

    ok(res, {
      status: 'up',
      agentId: agent.id,
      agentKey,
      latencyMs,
      responded: !!String(text || '').trim(),
      text,
      model,
      usage
    });
  } catch (err) {
    bad(res, 500, 'Failed to test agent', err.message);
  }
});

// Agent chat (Mission Control)
app.get('/api/agents/:id/messages', async (req, res) => {
  const messages = await prisma.agentMessage.findMany({
    where: { agentId: req.params.id },
    orderBy: { createdAt: 'asc' }
  });
  ok(res, messages);
});

app.post('/api/agents/:id/messages', async (req, res) => {
  const parsed = CreateAgentMessage.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!agent) return bad(res, 404, 'Agent not found');

  const msg = await prisma.agentMessage.create({
    data: {
      agentId: req.params.id,
      author: parsed.data.author || req.user.username,
      body: parsed.data.body
    }
  });
  await logActivity({ action: 'agent.message', actor: parsed.data.author || req.user.username, detail: agent.name });
  ok(res, msg);
});

// Documents (Mission Control)
app.get('/api/documents', async (req, res) => {
  const { taskId } = req.query;
  const where = taskId ? { taskId: String(taskId) } : {};
  const documents = await prisma.document.findMany({
    where,
    orderBy: { updatedAt: 'desc' }
  });
  ok(res, documents);
});

app.post('/api/documents', async (req, res) => {
  const parsed = CreateDocument.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const doc = await prisma.document.create({ data: parsed.data });
  await logActivity({ action: 'document.create', actor: req.user.username, detail: doc.title, taskId: doc.taskId || null });
  ok(res, doc);
});

app.patch('/api/documents/:id', async (req, res) => {
  const parsed = UpdateDocument.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const doc = await prisma.document.update({ where: { id: req.params.id }, data: parsed.data });
  await logActivity({ action: 'document.update', actor: req.user.username, detail: doc.title, taskId: doc.taskId || null });
  ok(res, doc);
});

// Admin: list users (with assigned projects)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
  const allProjectIds = [...new Set(users.flatMap(u => u.projectIds || []))];
  const projects = await prisma.project.findMany({ where: { id: { in: allProjectIds } } });
  const projectById = new Map(projects.map(p => [p.id, p]));
  ok(res, users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email || '',
    role: u.role,
    active: u.active,
    preferredAgentId: u.preferredAgentId || null,
    monthlyTokenLimit: u.monthlyTokenLimit ?? null,
    monthlyCostLimit: u.monthlyCostLimit ?? null,
    color: u.color || undefined,
    color: u.color || undefined,
    projects: (u.projectIds || [])
      .map(id => projectById.get(id))
      .filter(Boolean)
      .map(p => ({ id: p.id, code: p.code, name: p.name }))
  })));
});

// Admin: create user
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const parsed = AdminCreateUser.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const { username, displayName, role, password, preferredAgentId, color } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return bad(res, 400, 'Username already exists');
  if (preferredAgentId) {
    const agent = await prisma.agent.findUnique({ where: { id: preferredAgentId } });
    if (!agent) return bad(res, 404, 'Agent not found');
  }

  const user = await prisma.user.create({
    data: {
      username,
      displayName,
      role,
      active: true,
      passwordHash: hashPassword(password),
      apiKey: crypto.randomBytes(24).toString('hex'),
      projectIds: [],
      preferredAgentId: preferredAgentId || null,
      color: color || undefined
    }
  });

  await logActivity({ action: 'admin.user.create', detail: username, actor: req.user.username });

  // Return apiKey ONCE on creation
  ok(res, { id: user.id, username: user.username, displayName: user.displayName, role: user.role, active: user.active, apiKey: user.apiKey });
});

// Admin: Talon retry queue
app.get('/api/admin/talon/queue', requireAdmin, async (req, res) => {
  const items = await prisma.talonRetry.findMany({
    orderBy: { createdAt: 'asc' },
    take: 100
  });
  ok(res, items);
});

app.post('/api/admin/talon/queue/process', requireAdmin, async (req, res) => {
  const limit = Number(req.body?.limit || 5);
  const processed = await processTalonQueue({ limit });
  ok(res, { processed: processed.length });
});

app.patch('/api/admin/users/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const parsed = AdminUpdateUser.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const updates = { ...parsed.data };
  if ('preferredAgentId' in parsed.data) {
    if (parsed.data.preferredAgentId) {
      const agent = await prisma.agent.findUnique({ where: { id: parsed.data.preferredAgentId } });
      if (!agent) return bad(res, 404, 'Agent not found');
    }
    updates.preferredAgentId = parsed.data.preferredAgentId || null;
  }
  if (parsed.data.color !== undefined) {
    updates.color = parsed.data.color;
  }
  const user = await prisma.user.update({ where: { id: userId }, data: updates });
  await logActivity({ action: 'admin.user.update', detail: user.username, actor: req.user.username });
  ok(res, { id: user.id, username: user.username, displayName: user.displayName, email: user.email || '', role: user.role, active: user.active, preferredAgentId: user.preferredAgentId || null, monthlyTokenLimit: user.monthlyTokenLimit ?? null, monthlyCostLimit: user.monthlyCostLimit ?? null, color: user.color });
});

app.post('/api/admin/users/:userId/password', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const parsed = AdminSetUserPassword.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const user = await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(parsed.data.password) } });
  await logActivity({ action: 'admin.user.password.reset', detail: user.username, actor: req.user.username });
  ok(res, { reset: true });
});

app.post('/api/admin/users/:userId/api-key', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const apiKey = crypto.randomBytes(24).toString('hex');
  const user = await prisma.user.update({ where: { id: userId }, data: { apiKey } });
  await logActivity({ action: 'admin.user.apiKey.reset', detail: user.username, actor: req.user.username });
  ok(res, { apiKey: user.apiKey });
});

async function setUserProjects(req, res) {
  const { userId } = req.params;
  const parsed = AdminAssignUserProjects.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const desired = [...new Set(parsed.data.projectIds)];
  await prisma.user.update({ where: { id: userId }, data: { projectIds: desired } });

  await logActivity({ action: 'admin.user.projects.set', detail: userId, actor: req.user.username });
  ok(res, { updated: true, count: desired.length });
}

app.put('/api/admin/users/:userId/projects', requireAdmin, setUserProjects);
app.post('/api/admin/users/:userId/projects', requireAdmin, setUserProjects);

app.post('/api/projects', requireAdmin, async (req, res) => {
  const parsed = CreateProject.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const { name, code, description, enabledColumns, color } = parsed.data;
  const desired = normalizeColumnNames(enabledColumns && enabledColumns.length ? enabledColumns : DEFAULT_COLUMNS);
  const project = await prisma.project.create({
    data: {
      name,
      code,
      description: description || '',
      color: color || '',
      createdBy: req.user.username,
      active: true,
      columns: desired.map((colName, i) => ({ name: colName, order: i, enabled: true }))
    }
  });

  await logActivity({ action: 'project.create', detail: project.name, projectId: project.id });
  ok(res, project);
});

app.patch('/api/projects/:projectId', requireAdmin, async (req, res) => {
  const { projectId } = req.params;
  const parsed = UpdateProject.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const { enabledColumns, ...rest } = parsed.data;

  const updateData = { ...rest };
  if (typeof parsed.data.active === 'boolean') {
    updateData.active = parsed.data.active;
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: updateData
  });

  if (enabledColumns) {
    const desired = normalizeColumnNames(enabledColumns);
    const nextColumns = mergeProjectColumns(project.columns, desired);
    await prisma.project.update({ where: { id: projectId }, data: { columns: nextColumns } });
  }

  await logActivity({ action: 'project.update', detail: updated.name, projectId });
  ok(res, updated);
});

app.delete('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');

  const taskCount = await prisma.task.count({ where: { projectId } });
  if (taskCount > 0) return bad(res, 400, 'Project not empty', { taskCount });

  await prisma.project.delete({ where: { id: projectId } });
  await logActivity({ action: 'project.delete', detail: project.name, projectId });
  ok(res, { deleted: true });
});

app.get('/api/projects/:projectId/board', async (req, res) => {
  const { projectId } = req.params;
  const includeComments = req.query.includeComments === 'true';

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const tasks = await prisma.task.findMany({
    // Epics are managed separately and should not appear on the kanban board.
    where: { projectId, NOT: { type: 'epic' } },
    orderBy: [{ columnName: 'asc' }, { order: 'asc' }],
    include: { comments: includeComments }
  });
  const columns = sortColumns(project.columns);
  ok(res, { project, columns, tasks });
});

// Project context (shared memory)
app.get('/api/projects/:projectId/context', async (req, res) => {
  const { projectId } = req.params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  ok(res, {
    description: project.description || '',
    repoPath: project.repoPath || '',
    localPath: project.localPath || '',
    notes: project.notes || ''
  });
});

app.patch('/api/projects/:projectId/context', async (req, res) => {
  const { projectId } = req.params;
  const parsed = UpdateProjectContext.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: parsed.data
  });

  await logActivity({ action: 'project.context.update', detail: updated.name, projectId });
  ok(res, {
    description: updated.description || '',
    repoPath: updated.repoPath || '',
    localPath: updated.localPath || '',
    notes: updated.notes || ''
  });
});

async function runProjectAnalysisJob({ projectId, actor, jobId }) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    await prisma.projectAnalysis.upsert({
      where: { projectId },
      update: { status: 'failed', lastError: 'Project not found', jobId, completedAt: new Date() },
      create: { projectId, status: 'failed', lastError: 'Project not found', jobId, completedAt: new Date() }
    });
    return;
  }

  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) {
    await prisma.projectAnalysis.upsert({
      where: { projectId },
      update: { status: 'failed', lastError: 'Talon gateway not configured', jobId, completedAt: new Date() },
      create: { projectId, status: 'failed', lastError: 'Talon gateway not configured', jobId, completedAt: new Date() }
    });
    return;
  }
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  await prisma.projectAnalysis.upsert({
    where: { projectId },
    update: { status: 'running', lastError: null, startedAt: new Date(), completedAt: null, jobId },
    create: { projectId, status: 'running', startedAt: new Date(), jobId }
  });

  try {
    const projectRepos = refreshProjectRepoIndexes(projectId);
    const repoPath = selectPrimaryRepoPath(project, projectRepos);
    if (!repoPath) throw new Error('No repo path configured for project');

    const repoStats = countRepoStats(repoPath);
    const repoFacts = collectRepoFacts(repoPath);
    const jarvis = await ensureJarvisMainAgent();
    const agentKey = resolveAgentKey(jarvis) || JARVIS_CANONICAL_KEY;
    const sessionKey = `analysis:project:${projectId}:${Date.now()}`;

    const analysisPrompt = [
      'Create a developer-facing project analysis package for this repository.',
      'Generate MULTIPLE markdown files.',
      'Goals:',
      '- Explain what the project is and business purpose.',
      '- Describe technology stack and architecture.',
      '- Describe code graph/modules and major execution flow.',
      '- Provide onboarding notes and implementation guidance for agents/developers.',
      '',
      'Output MUST be valid JSON only (no prose outside JSON):',
      '{',
      '  "files": [',
      '    { "path": "00-project-purpose.md", "title": "Project Purpose", "content": "# ...markdown..." },',
      '    { "path": "01-tech-stack.md", "title": "Tech Stack", "content": "# ...markdown..." },',
      '    { "path": "02-architecture-code-graph.md", "title": "Architecture and Code Graph", "content": "# ...markdown..." },',
      '    { "path": "03-entry-points-modules.md", "title": "Key Modules and Entry Points", "content": "# ...markdown..." },',
      '    { "path": "04-developer-workflow.md", "title": "Developer Workflow", "content": "# ...markdown..." },',
      '    { "path": "05-risks-and-next-steps.md", "title": "Risks and Next Steps", "content": "# ...markdown..." }',
      '  ]',
      '}',
      'Each file content must be markdown and useful to engineers.',
      '',
      `Project: ${project.name} (${project.code})`,
      `Project Description: ${project.description || 'n/a'}`,
      `Repo Path: ${repoPath}`,
      `Repo Stats: files=${repoStats.fileCount} chunks=${repoStats.chunkCount} error=${repoStats.error || 'none'}`,
      '',
      'Repository Facts (JSON):',
      JSON.stringify({
        project: {
          id: project.id,
          code: project.code,
          name: project.name,
          description: project.description || '',
          localPath: project.localPath || '',
          repoPath: project.repoPath || '',
          notes: project.notes || '',
          lanes: sortColumns(project.columns || []).filter((c) => c?.enabled !== false).map((c) => c.name)
        },
        contextRepos: projectRepos.map((r) => ({
          repoName: r.repoName,
          repoPath: r.repoPath,
          lastFileCount: r.lastFileCount || 0,
          lastChunkCount: r.lastChunkCount || 0,
          lastIndexedAt: r.lastIndexedAt || null
        })),
        repoFacts
      }, null, 2)
    ].join('\n');

    const body = {
      model: `talon:${agentKey}`,
      messages: [
        { role: 'system', content: 'You are Jarvis, producing a practical repository analysis for engineers.' },
        { role: 'user', content: analysisPrompt }
      ],
      metadata: { sessionKey }
    };

    let report = '';
    let modelUsed = body.model;
    const primaryHeaders = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-talon-agent-id': agentKey,
      'x-talon-session-key': sessionKey
    };

    const response = await fetch(new URL('/v1/chat/completions', gatewayUrl), {
      method: 'POST',
      headers: primaryHeaders,
      body: JSON.stringify(body)
    });
    const payload = await readTalonResponse(response);
    const primaryErrorText = String(payload?.raw || payload?.json?.error?.message || payload?.json?.message || '');
    const authOrProviderFailure = /no api key found for provider|authentication|unauthorized|provider/i.test(primaryErrorText);

    if (!response.ok && authOrProviderFailure) {
      const directHeaders = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-talon-session-key': sessionKey
      };
      const modelCandidates = [
        jarvis?.defaultModel,
        jarvis?.fallbackModel,
        jarvis?.model,
        JARVIS_DEFAULT_MODEL
      ]
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .filter((v, idx, arr) => arr.indexOf(v) === idx);

      let recovered = false;
      for (const candidateModel of modelCandidates) {
        const directBody = {
          model: candidateModel,
          messages: body.messages,
          metadata: { sessionKey }
        };
        const retryRes = await fetch(new URL('/v1/chat/completions', gatewayUrl), {
          method: 'POST',
          headers: directHeaders,
          body: JSON.stringify(directBody)
        });
        const retryPayload = await readTalonResponse(retryRes);
        if (!retryRes.ok) continue;
        const retryText = extractTalonResponseText(retryPayload.json);
        if (isInvalidUpstreamText(retryText)) continue;
        report = retryText;
        modelUsed = extractTalonResponseModel(retryPayload.json, directBody.model);
        recovered = true;
        break;
      }
      if (!recovered) {
        throw new Error(`Jarvis analysis failed: ${JSON.stringify(payload.json || payload.raw || {})}`);
      }
    } else if (!response.ok) {
      throw new Error(`Jarvis analysis failed: ${JSON.stringify(payload.json || payload.raw || {})}`);
    } else {
      report = extractTalonResponseText(payload.json);
      modelUsed = extractTalonResponseModel(payload.json, body.model);
      if (isInvalidUpstreamText(report)) {
        throw new Error(`Jarvis analysis failed: invalid upstream reply (${report.slice(0, 200)})`);
      }
    }

    if (!report.trim()) {
      report = [
        `# ${project.name} (${project.code})`,
        '',
        '## Project Purpose',
        project.description || 'No project description available.',
        '',
        '## Tech Stack',
        `Detected: ${(repoFacts.detectedStack || []).join(', ') || 'Unknown'}`,
        '',
        '## Architecture and Code Graph',
        `Top-level folders/files: ${(repoFacts.topLevel || []).slice(0, 30).join(', ')}`,
        '',
        '## Developer Workflow',
        `Use repo path: ${repoPath}`
      ].join('\n');
    }

    const files = parseAnalysisFilesFromText(report);
    const canonicalMarkdown = files.map((f) => `# ${f.title || f.filePath}\n\n${f.contentMarkdown}`.trim()).join('\n\n---\n\n');

    const now = new Date();
    let record = await prisma.projectAnalysis.upsert({
      where: { projectId },
      update: {
        reportMarkdown: canonicalMarkdown,
        generatedAt: now,
        generatedBy: actor,
        model: modelUsed,
        repoPath,
        repoFileCount: repoStats.fileCount,
        repoChunkCount: repoStats.chunkCount,
        repoError: repoStats.error || null,
        status: 'complete',
        lastError: null,
        completedAt: now,
        jobId
      },
      create: {
        projectId,
        reportMarkdown: canonicalMarkdown,
        generatedAt: now,
        generatedBy: actor,
        model: modelUsed,
        repoPath,
        repoFileCount: repoStats.fileCount,
        repoChunkCount: repoStats.chunkCount,
        repoError: repoStats.error || null,
        status: 'complete',
        completedAt: now,
        jobId
      }
    });

    await prisma.projectAnalysisFile.deleteMany({ where: { analysisId: record.id } });
    if (files.length > 0) {
      await prisma.projectAnalysisFile.createMany({
        data: files.map((f, idx) => ({
          analysisId: record.id,
          filePath: f.filePath,
          title: f.title || f.filePath,
          contentMarkdown: f.contentMarkdown,
          order: Number(f.order ?? idx)
        }))
      });
    }

    await logActivity({
      action: 'project.analysis.generate',
      detail: `${project.name} model=${modelUsed} files=${files.length}`,
      actor,
      projectId
    });
  } catch (err) {
    await prisma.projectAnalysis.upsert({
      where: { projectId },
      update: {
        status: 'failed',
        lastError: err?.message || 'Analysis failed',
        completedAt: new Date(),
        jobId
      },
      create: {
        projectId,
        status: 'failed',
        lastError: err?.message || 'Analysis failed',
        completedAt: new Date(),
        jobId
      }
    });
    await logActivity({
      action: 'project.analysis.error',
      detail: err?.message || 'Analysis failed',
      actor,
      projectId
    });
  }
}

app.get('/api/projects/:projectId/analysis', async (req, res) => {
  const { projectId } = req.params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const analysis = await prisma.projectAnalysis.findUnique({
    where: { projectId },
    include: { files: { orderBy: { order: 'asc' } } }
  });
  ok(res, analysis ? { ...analysis, report: analysis.reportMarkdown } : null);
});

app.post('/api/projects/:projectId/analysis/run', requireAdmin, async (req, res) => {
  const { projectId } = req.params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const existing = await prisma.projectAnalysis.findUnique({ where: { projectId } });
  if (existing?.status === 'queued' || existing?.status === 'running') {
    return ok(res, { ...existing, report: existing.reportMarkdown, accepted: true, alreadyRunning: true });
  }

  const jobId = crypto.randomUUID();
  const queued = await prisma.projectAnalysis.upsert({
    where: { projectId },
    update: {
      status: 'queued',
      jobId,
      lastError: null,
      startedAt: null,
      completedAt: null,
      generatedBy: req.user.username,
      updatedAt: queuedAt
    },
    create: {
      projectId,
      status: 'queued',
      jobId,
      generatedBy: req.user.username
    }
  });

  setTimeout(() => {
    runProjectAnalysisJob({ projectId, actor: req.user.username, jobId })
      .catch((err) => {
        console.error(`[analysis-job] project=${projectId} failed`, err);
      });
  }, 10);

  ok(res, { ...queued, report: queued.reportMarkdown, accepted: true, jobId });
});

// Routing rules (project-level agent routing)
app.get('/api/projects/:projectId/routing-rules', requireAdmin, async (req, res) => {
  const { projectId } = req.params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const rules = await prisma.routingRule.findMany({
    where: { projectId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
  });
  const agentIds = [...new Set(rules.map(r => r.agentId))];
  const agents = await prisma.agent.findMany({ where: { id: { in: agentIds } } });
  const agentById = new Map(agents.map(a => [a.id, a]));
  ok(res, rules.map(r => ({
    ...r,
    agent: agentById.get(r.agentId)
      ? { id: r.agentId, name: agentById.get(r.agentId).name, role: agentById.get(r.agentId).role }
      : null
  })));
});

app.post('/api/projects/:projectId/routing-rules', requireAdmin, async (req, res) => {
  const { projectId } = req.params;
  const parsed = CreateRoutingRule.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const agent = await prisma.agent.findUnique({ where: { id: parsed.data.agentId } });
  if (!agent) return bad(res, 404, 'Agent not found');

  let order = parsed.data.order;
  if (order === undefined) {
    const maxOrder = await prisma.routingRule.aggregate({
      where: { projectId },
      _max: { order: true }
    });
    order = (maxOrder._max.order ?? -1) + 1;
  }

  const rule = await prisma.routingRule.create({
    data: {
      projectId,
      agentId: parsed.data.agentId,
      type: parsed.data.type || '',
      priority: parsed.data.priority || '',
      assignee: parsed.data.assignee || '',
      order,
      enabled: parsed.data.enabled ?? true
    }
  });
  await logActivity({ action: 'routing-rule.create', detail: `agent=${agent.name}`, projectId });
  ok(res, rule);
});

app.patch('/api/routing-rules/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const parsed = UpdateRoutingRule.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const rule = await prisma.routingRule.findUnique({ where: { id } });
  if (!rule) return bad(res, 404, 'Rule not found');
  if (!(await canAccessProject(req.user, rule.projectId))) return bad(res, 403, 'Forbidden');

  if (parsed.data.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: parsed.data.agentId } });
    if (!agent) return bad(res, 404, 'Agent not found');
  }

  const updated = await prisma.routingRule.update({
    where: { id },
    data: parsed.data
  });
  await logActivity({ action: 'routing-rule.update', detail: `rule=${id}`, projectId: rule.projectId });
  ok(res, updated);
});

app.delete('/api/routing-rules/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const rule = await prisma.routingRule.findUnique({ where: { id } });
  if (!rule) return bad(res, 404, 'Rule not found');
  if (!(await canAccessProject(req.user, rule.projectId))) return bad(res, 403, 'Forbidden');

  await prisma.routingRule.delete({ where: { id } });
  await logActivity({ action: 'routing-rule.delete', detail: `rule=${id}`, projectId: rule.projectId });
  ok(res, { deleted: true });
});

// Epics
app.get('/api/projects/:projectId/epics', async (req, res) => {
  const { projectId } = req.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const epicsRaw = await prisma.task.findMany({
    where: { projectId, type: 'epic' }
  });

  const stories = await prisma.task.findMany({
    where: { projectId, NOT: { type: 'epic' } },
    orderBy: [{ updatedAt: 'desc' }]
  });

  const colOrder = new Map((project.columns || []).map((c, i) => [c.name, i]));
  const priMap = { high: 1, medium: 2, low: 3 };

  const epicsSorted = epicsRaw.sort((a, b) => {
    // 1. Column Order (Right to Left: higher index first)
    const ai = colOrder.get(a.columnName) ?? -1;
    const bi = colOrder.get(b.columnName) ?? -1;
    if (ai !== bi) return bi - ai;

    // 2. Priority (High to Low: 1, 2, 3)
    const ap = priMap[String(a.priority).toLowerCase()] ?? 999;
    const bp = priMap[String(b.priority).toLowerCase()] ?? 999;
    if (ap !== bp) return ap - bp;

    // 3. Internal Order
    if (a.order !== b.order) return (a.order ?? 0) - (b.order ?? 0);

    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  const storiesByEpicId = new Map();
  for (const s of stories) {
    if (s.epicId) {
      const arr = storiesByEpicId.get(s.epicId) || [];
      arr.push(s);
      storiesByEpicId.set(s.epicId, arr);
    }
  }

  ok(res, {
    project,
    epics: epicsSorted.map(e => ({ ...e, stories: storiesByEpicId.get(e.id) || [] })),
    stories
  });
});


// Tasks
app.post('/api/tasks', async (req, res) => {
  const parsed = CreateTask.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const { projectId, columnName, title, description, tags, dueAt, assignee, createdBy, priority, type, epicId, epicColor } = parsed.data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');

  const columns = sortColumns(project.columns);
  const validColumn = columns.find(c => c.name === columnName && c.enabled);
  if (!validColumn) return bad(res, 400, 'Invalid column');

  // Compute next order within column
  const maxOrder = await prisma.task.aggregate({
    where: { projectId, columnName },
    _max: { order: true }
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  // Compute next ticket number globally (system-wide unique counter)
  const maxTicket = await prisma.task.aggregate({
    where: { ticketNumber: { not: null } },
    _max: { ticketNumber: true }
  });
  const nextTicketNumber = (maxTicket._max.ticketNumber ?? 0) + 1;

  const autoDueAt = (!dueAt && type === 'story')
    ? (() => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      return next;
    })()
    : null;

  const agentForAssignee = await resolveAgentForAssignee(assignee);
  const normalizedAssignee = normalizeAssigneeValue(assignee, agentForAssignee);

  const task = await prisma.task.create({
    data: {
      projectId,
      columnName,
      title,
      description,
      tags,
      assignee: normalizedAssignee,
      createdBy: createdBy || req.user.username,
      priority: priority || 'low',
      type: type || '',
      epicId: epicId || null,
      epicColor: epicColor || '',
      dueAt: dueAt ? new Date(dueAt) : autoDueAt,
      order: nextOrder,
      ticketNumber: nextTicketNumber
    }
  });

  await logActivity({ action: 'task.create', detail: title, projectId, taskId: task.id });
  broadcast('task.create', { task });
  ok(res, task);
});

app.patch('/api/tasks/:taskId/move', async (req, res) => {
  const { taskId } = req.params;
  const parsed = MoveTask.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return bad(res, 404, 'Task not found');

  const project = await prisma.project.findUnique({ where: { id: existing.projectId } });
  if (!(await canAccessProject(req.user, existing.projectId))) return bad(res, 403, 'Forbidden');

  const { columnName, order } = parsed.data;
  const columns = sortColumns(project.columns);
  const validColumn = columns.find(c => c.name === columnName && c.enabled);
  if (!validColumn) return bad(res, 400, 'Invalid column');

  let reviewMaxOrder = null;
  if (existing.type === 'epic' && String(columnName).toLowerCase() === 'done') {
    const reviewColumn = columns.find(c => c.enabled && String(c.name).toLowerCase() === 'review');
    if (reviewColumn) {
      const maxOrder = await prisma.task.aggregate({
        where: { projectId: existing.projectId, columnName: reviewColumn.name },
        _max: { order: true }
      });
      reviewMaxOrder = maxOrder._max.order ?? -1;
    }
  }

  const resolvedMove = resolveEpicDoneMove({
    taskType: existing.type,
    currentColumnName: existing.columnName,
    requestedColumnName: columnName,
    requestedOrder: order,
    columns,
    reviewMaxOrder
  });
  const nextColumnName = resolvedMove.columnName;
  const nextOrder = resolvedMove.order;

  const task = await prisma.task.update({
    where: { id: taskId },
    data: { columnName: nextColumnName, order: nextOrder }
  });

  // Auto-move epic logic
  if (task.epicId) {
    const stories = await prisma.task.findMany({
      where: { epicId: task.epicId, NOT: { type: 'epic' } }
    });
    if (stories.length > 0) {
      const allInSameCol = stories.every(s => s.columnName === nextColumnName);
      if (allInSameCol) {
        const epic = await prisma.task.findUnique({ where: { id: task.epicId } });
        if (epic && epic.columnName !== nextColumnName) {
          // Check if epic movement needs redirection (e.g. Done -> Review)
          let reviewMaxOrder = null;
          if (String(nextColumnName).toLowerCase() === 'done') {
            const reviewColumn = (columns || []).find(c => c.enabled && String(c.name).toLowerCase() === 'review');
            if (reviewColumn) {
              const maxOrder = await prisma.task.aggregate({
                where: { projectId: task.projectId, columnName: reviewColumn.name },
                _max: { order: true }
              });
              reviewMaxOrder = maxOrder._max.order ?? -1;
            }
          }

          const resolvedEpicMove = resolveEpicDoneMove({
            taskType: 'epic',
            currentColumnName: epic.columnName,
            requestedColumnName: nextColumnName,
            requestedOrder: 0,
            columns,
            reviewMaxOrder
          });

          // If no review column or not moving to Done, resolvedEpicMove.order will be 0.
          // Better to put it at the end of the target column.
          let finalEpicOrder = resolvedEpicMove.order;
          if (finalEpicOrder === 0) {
            const maxOrder = await prisma.task.aggregate({
              where: { projectId: task.projectId, columnName: resolvedEpicMove.columnName },
              _max: { order: true }
            });
            finalEpicOrder = (maxOrder._max.order ?? -1) + 1;
          }

          await prisma.task.update({
            where: { id: task.epicId },
            data: { columnName: resolvedEpicMove.columnName, order: finalEpicOrder }
          });

          await logActivity({
            action: 'task.move.auto',
            detail: `Epic ${task.epicId} auto-moved to ${resolvedEpicMove.columnName} because all stories are in ${nextColumnName}`,
            projectId: task.projectId,
            taskId: task.epicId,
            actor: 'system',
            fromColumnName: epic.columnName,
            toColumnName: resolvedEpicMove.columnName
          });
        }
      }
    }
  }

  if (shouldTriggerOnTodoMove(existing.columnName, nextColumnName, existing.assignee)) {
    triggerTalonSession({ task, project, assignee: existing.assignee, prevColumnName: existing.columnName, nextColumnName });
  }

  await logActivity({
    action: 'task.move',
    detail: `${existing.columnName} -> ${nextColumnName} @${nextOrder}`,
    projectId: task.projectId,
    taskId: task.id,
    actor: req.user.username,
    fromColumnName: existing.columnName,
    toColumnName: nextColumnName
  });
  await notifySubscribers({
    project,
    task,
    action: `moved to ${nextColumnName}`,
    mentions: []
  });

  const isMoveToInprogress = String(nextColumnName).toLowerCase() === 'inprogress'
    && String(existing.columnName).toLowerCase() !== 'inprogress';
  if (isMoveToInprogress && existing.assignee) {
    const autoAgent = await resolveAgentForAssignee(existing.assignee);
    if (autoAgent) {
      const agentName = autoAgent.name || 'Agent';
      const body = `${agentName} started work and moved this to Inprogress.`;
      const comment = await prisma.comment.create({ data: { taskId: task.id, author: agentName, body } });
      await logActivity({ action: 'comment.create', detail: body, projectId: task.projectId, taskId: task.id });
      const mentions = extractMentions(body);
      await notifySubscribers({
        project,
        task,
        comment,
        action: 'comment',
        mentions
      });
    }
  }

  broadcast('task.move', { taskId: task.id, projectId: task.projectId, task });
  ok(res, task);
});

app.post('/api/columns/reorder', async (req, res) => {
  const parsed = ReorderColumn.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const { projectId, columnName, orderedTaskIds } = parsed.data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return bad(res, 404, 'Project not found');
  if (!(await canAccessProject(req.user, projectId))) return bad(res, 403, 'Forbidden');
  const columns = sortColumns(project.columns);
  const validColumn = columns.find(c => c.name === columnName && c.enabled);
  if (!validColumn) return bad(res, 400, 'Invalid column');

  // Ensure all tasks belong to the project + column
  const tasks = await prisma.task.findMany({ where: { id: { in: orderedTaskIds } } });
  if (tasks.length !== orderedTaskIds.length) return bad(res, 400, 'Some tasks not found');
  for (const t of tasks) {
    if (t.projectId !== projectId) return bad(res, 400, 'Task does not belong to project', { taskId: t.id });
    if (t.columnName !== columnName) return bad(res, 400, 'Task does not belong to column', { taskId: t.id });
  }

  // Write orders (0..n-1)
  await prisma.$transaction(
    orderedTaskIds.map((id, idx) => prisma.task.update({ where: { id }, data: { order: idx } }))
  );

  await logActivity({ action: 'column.reorder', detail: `${projectId}:${columnName} (${orderedTaskIds.length})`, actor: req.user.username, projectId });
  ok(res, { reordered: orderedTaskIds.length });
});

app.get('/api/tasks', async (req, res) => {
  const { assignee, projectId, type } = req.query;
  const where = {};
  if (assignee) where.assignee = String(assignee);
  if (projectId) where.projectId = String(projectId);
  if (type) where.type = String(type);

  if (where.projectId && !(await canAccessProject(req.user, where.projectId))) {
    return bad(res, 403, 'Forbidden');
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { project: true }
  });

  // Filter tasks based on project access if projectId not provided
  if (!where.projectId && req.user.role !== 'ADMIN') {
    const allowed = new Set(req.user.projectIds || []);
    return ok(res, tasks.filter(t => allowed.has(t.projectId)));
  }

  ok(res, tasks);
});

app.get('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return bad(res, 404, 'Task not found');
  if (!(await canAccessProject(req.user, task.projectId))) return bad(res, 403, 'Forbidden');
  ok(res, task);
});

app.patch('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const parsed = UpdateTask.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return bad(res, 404, 'Task not found');

  const project = await prisma.project.findUnique({ where: { id: existing.projectId } });
  if (!(await canAccessProject(req.user, existing.projectId))) return bad(res, 403, 'Forbidden');

  const data = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.tags !== undefined) data.tags = parsed.data.tags;
  let agentForAssignee = null;
  if (parsed.data.assignee !== undefined) {
    agentForAssignee = await resolveAgentForAssignee(parsed.data.assignee);
    const normalizedAssignee = normalizeAssigneeValue(parsed.data.assignee, agentForAssignee);
    data.assignee = normalizedAssignee;
  }
  if (parsed.data.createdBy !== undefined) data.createdBy = parsed.data.createdBy;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority || 'low';
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.epicId !== undefined) data.epicId = parsed.data.epicId;
  if (parsed.data.epicColor !== undefined) data.epicColor = parsed.data.epicColor;
  if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;

  if (parsed.data.columnName !== undefined && parsed.data.columnName !== existing.columnName) {
    const projectColumns = sortColumns(project.columns);
    const validColumn = projectColumns.find(c => c.name === parsed.data.columnName && c.enabled);
    if (validColumn) {
      data.columnName = validColumn.name;
      const maxOrder = await prisma.task.aggregate({
        where: { projectId: existing.projectId, columnName: validColumn.name },
        _max: { order: true }
      });
      data.order = (maxOrder._max.order ?? -1) + 1;
    }
  }

  // Auto-processing: if assigned to an agent, move to Inprogress + mark agent active + add comment
  let autoMoved = false;
  let autoAgent = null;
  if (parsed.data.assignee !== undefined && data.assignee !== existing.assignee) {
    autoAgent = agentForAssignee;
    if (autoAgent) {
      const projectColumns = sortColumns(project.columns);
      const inprogressCol = projectColumns.find(c => c.name.toLowerCase() === 'inprogress');
      if (inprogressCol && inprogressCol.name !== existing.columnName) {
        data.columnName = inprogressCol.name;
        autoMoved = true;
      }
    }
  }

  const task = await prisma.task.update({ where: { id: taskId }, data });
  if (shouldTriggerOnAssignment(existing.assignee, task.assignee)) {
    triggerTalonSession({ task, project, assignee: task.assignee, prevColumnName: existing.columnName, nextColumnName: task.columnName });
  }
  await logActivity({ action: 'task.update', detail: task.title, projectId: task.projectId, taskId: task.id });

  if (autoAgent) {
    await prisma.agent.update({ where: { id: autoAgent.id }, data: { status: 'active', currentTaskId: task.id } });
    await logActivity({ action: 'agent.status', detail: `${autoAgent.name} active`, projectId: task.projectId, taskId: task.id });

    if (autoMoved) {
      await logActivity({ action: 'task.move', detail: 'Auto-moved to Inprogress', projectId: task.projectId, taskId: task.id });
    }

    const agentName = autoAgent.name || 'Agent';
    const body = autoMoved
      ? `${agentName} started work and moved this to Inprogress.`
      : `${agentName} started work.`;
    await prisma.comment.create({ data: { taskId: task.id, author: autoAgent.name, body } });
    await logActivity({ action: 'comment.create', detail: body, projectId: task.projectId, taskId: task.id });
  }

  broadcast('task.update', { taskId: task.id, task });
  ok(res, task);
});

app.delete('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return bad(res, 404, 'Task not found');
  if (!(await canAccessProject(req.user, existing.projectId))) return bad(res, 403, 'Forbidden');

  await prisma.task.delete({ where: { id: taskId } });
  await logActivity({ action: 'task.delete', detail: existing.title, projectId: existing.projectId, taskId: existing.id });
  ok(res, { deleted: true });
});

app.get('/api/tasks/:taskId/comments', async (req, res) => {
  const { taskId } = req.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return bad(res, 404, 'Task not found');

  const project = await prisma.project.findUnique({ where: { id: task.projectId } });
  if (!(await canAccessProject(req.user, task.projectId))) return bad(res, 403, 'Forbidden');

  const items = await prisma.comment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
  ok(res, items);
});

app.post('/api/tasks/:taskId/comments', async (req, res) => {
  const { taskId } = req.params;
  const parsed = CreateComment.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return bad(res, 404, 'Task not found');

  const project = await prisma.project.findUnique({ where: { id: task.projectId } });
  if (!(await canAccessProject(req.user, task.projectId))) return bad(res, 403, 'Forbidden');

  const comment = await prisma.comment.create({
    data: {
      taskId,
      author: parsed.data.author || req.user.username,
      body: parsed.data.body
    }
  });

  await logActivity({ action: 'comment.create', detail: parsed.data.body.slice(0, 120), projectId: task.projectId, taskId });
  const mentions = extractMentions(parsed.data.body);
  await notifySubscribers({
    project,
    task,
    comment,
    action: 'comment',
    mentions
  });

  // Handle Agent Mentions (@AgentName)
  for (const mention of mentions) {
    const agent = await prisma.agent.findFirst({
      where: { OR: [{ name: mention }, { talonAgentId: mention }] }
    });
    if (agent) {
      await triggerTalonSession({ task, project, assignee: mention, comment });
      await logActivity({
        action: 'talon.summoned',
        detail: `Summoned agent @${mention} via comment`,
        actor: comment.author,
        projectId: task.projectId,
        taskId: task.id
      });
    }
  }

  // Forward to Talon if assigned to an agent
  const isAgentAuthor = await prisma.agent.findFirst({ where: { name: comment.author } });
  if (!isAgentAuthor && task.assignee && !mentions.includes(task.assignee)) {
    const autoAgent = await resolveAgentForAssignee(task.assignee);
    if (autoAgent) {
      await triggerTalonSession({ task, project, assignee: task.assignee, comment });
    }
  }

  broadcast('task.comment', { taskId, comment });
  ok(res, comment);
});

app.get('/api/activity', async (req, res) => {
  const { actor, projectId, taskId } = req.query;
  const where = {};
  if (actor) where.actor = String(actor);
  if (projectId) where.projectId = String(projectId);
  if (taskId) where.taskId = String(taskId);

  const items = await prisma.activity.findMany({
    where,
    orderBy: { at: 'desc' },
    take: 200
  });
  ok(res, items);
});

app.get('/api/tasks/:taskId/activity', async (req, res) => {
  const { taskId } = req.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return bad(res, 404, 'Task not found');
  if (!(await canAccessProject(req.user, task.projectId))) return bad(res, 403, 'Forbidden');

  const items = await prisma.activity.findMany({
    where: { taskId },
    orderBy: { at: 'desc' },
    take: 200
  });
  ok(res, items);
});

async function resolveTaskAgentChatContext(req, res) {
  const { taskId } = req.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    bad(res, 404, 'Task not found');
    return null;
  }
  if (!(await canAccessProject(req.user, task.projectId))) {
    bad(res, 403, 'Forbidden');
    return null;
  }

  const project = await prisma.project.findUnique({ where: { id: task.projectId } });
  const projectRepos = readContextRepos()
    .filter((repo) => repo?.projectId === task.projectId)
    .slice(0, 20);
  const projectAnalysis = await prisma.projectAnalysis.findUnique({ where: { projectId: task.projectId } });
  const projectAnalysisWithFiles = projectAnalysis
    ? await prisma.projectAnalysis.findUnique({
      where: { projectId: task.projectId },
      include: { files: { orderBy: { order: 'asc' } } }
    })
    : null;
  const comments = await prisma.comment.findMany({
    where: { taskId: task.id },
    orderBy: { createdAt: 'asc' },
    take: 20
  });
  const { user, agent } = await resolveTaskPreferredAgent(task);
  if (!agent) {
    bad(res, 400, 'No preferred agent found for task assignee');
    return null;
  }

  const agentKey = resolveAgentKey(agent);
  if (!agentKey) {
    bad(res, 400, 'Assigned agent has no Talon key');
    return null;
  }

  const sessionKey = buildTaskAgentChatSessionKey(task.id, agentKey);
  return { task, project, projectRepos, projectAnalysis: projectAnalysisWithFiles || projectAnalysis, user, comments, agent, agentKey, sessionKey };
}

app.get('/api/tasks/:taskId/agent-chat/transcript', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const context = await resolveTaskAgentChatContext(req, res);
  if (!context) return;

  try {
    const transcript = await fetchTalonTranscript({
      gatewayUrl,
      token,
      agentKey: context.agentKey,
      sessionKey: context.sessionKey
    });
    if (!transcript.ok) return bad(res, transcript.status, 'Talon error', transcript.error);

    return ok(res, {
      messages: transcript.messages,
      sessionKey: context.sessionKey,
      agentName: context.agent.name,
      agentKey: context.agentKey
    });
  } catch (err) {
    bad(res, 500, 'Failed to fetch transcript from Talon', err.message);
  }
});

app.post('/api/tasks/:taskId/agent-chat', async (req, res) => {
  const parsed = TaskAgentChat.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const context = await resolveTaskAgentChatContext(req, res);
  if (!context) return;
  const transcript = await fetchTalonTranscript({
    gatewayUrl,
    token,
    agentKey: context.agentKey,
    sessionKey: context.sessionKey
  });
  if (!transcript.ok) return bad(res, transcript.status, 'Talon error', transcript.error);
  const hasConversation = transcript.messages.some((msg) => {
    const role = String(msg?.role || '').toLowerCase();
    return role === 'assistant' || role === 'user' || role === 'jarvis';
  });
  const contextVersion = context.task?.updatedAt
    ? new Date(context.task.updatedAt).toISOString()
    : 'unknown';
  const systemContext = buildTaskAgentSystemContext({
    task: context.task,
    project: context.project,
    projectRepos: context.projectRepos,
    projectAnalysis: context.projectAnalysis,
    user: context.user,
    comments: context.comments
  });
  const hasCurrentTicketContext = transcript.messages.some((msg) => {
    const content = typeof msg?.content === 'string'
      ? msg.content
      : Array.isArray(msg?.content)
        ? msg.content.map((part) => part?.text || part?.input_text || '').filter(Boolean).join('\n')
        : '';
    return content.includes(`- contextVersion: ${contextVersion}`);
  });
  const shouldInjectContext = !hasConversation || !hasCurrentTicketContext;
  const messages = shouldInjectContext
    ? [{ role: 'system', content: systemContext }, { role: 'user', content: parsed.data.message }]
    : [{ role: 'user', content: parsed.data.message }];

  const body = {
    model: `talon:${context.agentKey}`,
    messages,
    metadata: { sessionKey: context.sessionKey }
  };

  try {
    const response = await fetch(new URL('/v1/chat/completions', gatewayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-talon-agent-id': context.agentKey,
        'x-talon-session-key': context.sessionKey
      },
      body: JSON.stringify(body)
    });

    const payload = await readTalonResponse(response);
    if (!response.ok) {
      return bad(res, response.status, 'Talon error', payload.json || payload.raw);
    }

    const text = extractTalonResponseText(payload.json);
    const model = extractTalonResponseModel(payload.json, body.model);
    const usage = extractTalonUsage(payload.json);
    if (isInvalidUpstreamText(text)) {
      return bad(res, 502, 'Agent returned invalid upstream reply', { text, model });
    }

    await logActivity({
      action: 'task.agent.chat',
      detail: `task=${context.task.id} assignee=${context.task.assignee || 'none'} model=${model} tokens=${usage.totalTokens}`,
      actor: req.user.username,
      projectId: context.task.projectId,
      taskId: context.task.id
    });

    ok(res, {
      text,
      model,
      usage,
      contextualized: shouldInjectContext,
      sessionKey: context.sessionKey,
      agentName: context.agent.name,
      agentKey: context.agentKey
    });
  } catch (err) {
    bad(res, 500, 'Failed to chat with task agent', err.message);
  }
});

app.post('/api/tasks/:taskId/agent-chat/reset', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const context = await resolveTaskAgentChatContext(req, res);
  if (!context) return;

  try {
    const taskToken = `:task:${context.task.id}`;
    const agents = await prisma.agent.findMany({
      select: { id: true, name: true, talonAgentId: true }
    });

    const candidateAgentKeys = [...new Set([
      context.agentKey,
      ...agents.map((a) => resolveAgentKey(a)).filter(Boolean)
    ])];

    const toDelete = new Map(); // key: `${agentKey}::${sessionKey}`
    for (const agentKey of candidateAgentKeys) {
      const sessionsResult = await fetchTalonSessions({ gatewayUrl, token, agentKey });
      if (!sessionsResult.ok) continue;

      for (const session of sessionsResult.sessions) {
        const key = String(session?.key || session?.sessionKey || '').trim();
        if (!key || !key.includes(taskToken)) continue;
        toDelete.set(`${agentKey}::${key}`, { agentKey, sessionKey: key });
      }
    }

    // Ensure deterministic task-chat keys are removed even if they don't appear in list.
    toDelete.set(`${context.agentKey}::${context.sessionKey}`, { agentKey: context.agentKey, sessionKey: context.sessionKey });
    toDelete.set(`${context.agentKey}::${context.sessionKey}:health`, { agentKey: context.agentKey, sessionKey: `${context.sessionKey}:health` });

    for (const { agentKey, sessionKey } of toDelete.values()) {
      const deleted = await deleteTalonSession({ gatewayUrl, token, agentKey, sessionKey });
      if (!deleted.ok) {
        return bad(res, deleted.status, 'Talon error', deleted.error);
      }
    }

    await logActivity({
      action: 'task.agent.chat.reset',
      detail: `task=${context.task.id} assignee=${context.task.assignee || 'none'} removedSessions=${toDelete.size}`,
      actor: req.user.username,
      projectId: context.task.projectId,
      taskId: context.task.id
    });

    ok(res, {
      reset: true,
      removedSessions: toDelete.size,
      sessionKey: context.sessionKey,
      agentName: context.agent.name,
      agentKey: context.agentKey
    });
  } catch (err) {
    bad(res, 500, 'Failed to reset task agent chat', err.message);
  }
});

app.post('/api/tasks/:taskId/agent-chat/test', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const context = await resolveTaskAgentChatContext(req, res);
  if (!context) return;

  const healthSessionKey = `${context.sessionKey}:health`;
  const body = {
    model: `talon:${context.agentKey}`,
    messages: [{ role: 'user', content: 'ping' }],
    metadata: { sessionKey: healthSessionKey }
  };

  try {
    const response = await fetch(new URL('/v1/chat/completions', gatewayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-talon-agent-id': context.agentKey,
        'x-talon-session-key': healthSessionKey
      },
      body: JSON.stringify(body)
    });

    const payload = await readTalonResponse(response);
    if (!response.ok) {
      return ok(res, {
        status: 'offline',
        reason: `http-${response.status}`,
        agentName: context.agent.name,
        agentKey: context.agentKey
      });
    }

    const text = extractTalonResponseText(payload.json);
    const model = extractTalonResponseModel(payload.json, body.model);
    const isOnline = !isInvalidUpstreamText(text);
    ok(res, {
      status: isOnline ? 'online' : 'offline',
      text,
      model,
      agentName: context.agent.name,
      agentKey: context.agentKey
    });
  } catch (err) {
    ok(res, {
      status: 'offline',
      reason: err?.message || 'ping-failed',
      agentName: context.agent.name,
      agentKey: context.agentKey
    });
  }
});

// Jarvis (Global Command Bar)
app.post('/api/jarvis/chat', async (req, res) => {
  const parsed = JarvisChat.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');

  const token = process.env.TALON_GATEWAY_TOKEN || '';
  const jarvis = await ensureJarvisMainAgent();
  let agentId = parsed.data.agentId || jarvis.talonAgentId || process.env.TALON_DEFAULT_AGENT_ID || jarvis.id;

  if (!agentId) return bad(res, 400, 'No agent specified for Jarvis (and no agents found in system)');

  const orConditions = [{ talonAgentId: agentId }, { name: agentId }];
  if (isObjectId(agentId)) {
    orConditions.push({ id: agentId });
  }

  const agent = await prisma.agent.findFirst({
    where: { OR: orConditions }
  });
  const agentKey = resolveAgentKey(agent) || agentId;

  const sessionKey = parsed.data.sessionKey || `openai:jarvis:${req.user.username}`;
  const talonSessionKey = sessionKey.startsWith('jarvis:') ? `openai:${sessionKey}` : sessionKey;
  const runtimeHints = [agent?.soul, agent?.guardrails, agent?.bootstrap, agent?.everyone]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join('\n\n');

  const body = {
    model: `talon:${agentKey}`,
    messages: [{ role: 'user', content: parsed.data.message }],
    metadata: { sessionKey: talonSessionKey }
  };

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'x-talon-agent-id': agentKey,
    'x-talon-session-key': talonSessionKey
  };

  try {
    const response = await fetch(new URL('/v1/chat/completions', gatewayUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const payload = await readTalonResponse(response);
    if (!response.ok) {
      return bad(res, response.status, 'Talon error', payload.json || payload.raw);
    }

    let text = extractTalonResponseText(payload.json);
    let model = extractTalonResponseModel(payload.json, body.model);
    let usage = extractTalonUsage(payload.json);

    const invalidReplyPattern = /does not support tools|http 404: 404 page not found|no api key found for provider/i;
    const shouldRetryDirectModel = invalidReplyPattern.test(String(text || ''));

    if (shouldRetryDirectModel) {
      const directMessages = [];
      if (runtimeHints) directMessages.push({ role: 'system', content: runtimeHints });
      directMessages.push({ role: 'user', content: parsed.data.message });
      const directHeaders = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-talon-session-key': talonSessionKey
      };

      const modelCandidates = [
        agent?.defaultModel,
        agent?.fallbackModel,
        agent?.model,
        jarvis?.defaultModel,
        jarvis?.fallbackModel,
        jarvis?.model,
        JARVIS_DEFAULT_MODEL
      ]
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .filter((v, idx, arr) => arr.indexOf(v) === idx);

      let recovered = false;
      for (const candidateModel of modelCandidates) {
        const directBody = {
          model: candidateModel,
          messages: directMessages,
          metadata: { sessionKey: talonSessionKey }
        };
        const retryResponse = await fetch(new URL('/v1/chat/completions', gatewayUrl), {
          method: 'POST',
          headers: directHeaders,
          body: JSON.stringify(directBody)
        });
        const retryPayload = await readTalonResponse(retryResponse);
        if (!retryResponse.ok) {
          continue;
        }

        const nextText = extractTalonResponseText(retryPayload.json);
        if (invalidReplyPattern.test(String(nextText || ''))) {
          continue;
        }

        text = nextText;
        model = extractTalonResponseModel(retryPayload.json, directBody.model);
        usage = extractTalonUsage(retryPayload.json);
        recovered = true;
        break;
      }

      if (!recovered && invalidReplyPattern.test(String(text || ''))) {
        return bad(res, 502, 'Jarvis returned an invalid upstream reply', { text, model });
      }
    }

    await logActivity({
      action: 'jarvis.chat',
      detail: `user=${req.user.username} tokens=${usage.totalTokens}`,
      actor: req.user.username
    });

    ok(res, { text, model, usage });
  } catch (err) {
    bad(res, 500, 'Failed to chat with Jarvis', err.message);
  }
});

// Talon Integration (Auth & Discovery)
app.get('/api/talon/auth/providers', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  try {
    const response = await fetch(new URL('/v1/auth/providers', gatewayUrl), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    ok(res, data);
  } catch (err) {
    bad(res, 500, 'Failed to fetch providers from Talon', err.message);
  }
});

app.post('/api/talon/auth/start', async (req, res) => {
  const parsed = TalonAuthStart.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  try {
    const hostNoPort = String(req.get('host') || '').split(':')[0] || 'localhost';
    const callbackUrl = parsed.data.provider === 'openai-codex'
      ? `${req.protocol}://${hostNoPort}:1455/auth/callback`
      : `${req.protocol}://${req.get('host')}/api/talon/callback`;
    const response = await fetch(new URL('/v1/auth/start', gatewayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ provider: parsed.data.provider, callbackUrl }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) return bad(res, response.status, 'Talon auth start failed', data);
    ok(res, data);
  } catch (err) {
    bad(res, 500, 'Failed to start auth flow with Talon', err.message);
  }
});

app.post('/api/talon/auth/exchange', async (req, res) => {
  const parsed = TalonExchange.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  try {
    const response = await fetch(new URL('/v1/auth/exchange', gatewayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) return bad(res, response.status, 'Talon exchange failed', data);
    ok(res, data);
  } catch (err) {
    bad(res, 500, 'Failed to exchange credentials with Talon', err.message);
  }
});

app.post('/api/talon/auth/remove', requireAdmin, async (req, res) => {
  const parsed = TalonAuthRemove.safeParse(req.body);
  if (!parsed.success) return bad(res, 400, 'Invalid payload', parsed.error.flatten());

  const rawProvider = String(parsed.data.provider || '').trim().toLowerCase();
  const provider = rawProvider === 'google-api' ? 'google' : rawProvider;
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  try {
    const llmModels = await prisma.llmModel.findMany({
      where: { provider: { providerType: provider } },
      select: {
        id: true,
        providerModelId: true,
        provider: { select: { providerType: true } }
      }
    });

    const modelIds = llmModels.map((m) => m.id);
    const modelRefs = llmModels.flatMap((m) => {
      const canonical = `${m.provider.providerType}/${m.providerModelId}`;
      return [canonical, m.providerModelId];
    });

    const agentsUsingProvider = await prisma.agent.findMany({
      where: {
        OR: [
          ...(modelIds.length > 0 ? [{ modelId: { in: modelIds } }] : []),
          ...(modelRefs.length > 0
            ? [
                { model: { in: modelRefs } },
                { defaultModel: { in: modelRefs } },
                { fallbackModel: { in: modelRefs } }
              ]
            : [
                { model: { startsWith: `${provider}/` } },
                { defaultModel: { startsWith: `${provider}/` } },
                { fallbackModel: { startsWith: `${provider}/` } }
              ])
        ]
      },
      select: { id: true, name: true, talonAgentId: true, model: true, defaultModel: true, fallbackModel: true }
    });

    if (agentsUsingProvider.length > 0) {
      return bad(res, 409, 'Provider is in use by agents', {
        provider,
        inUseBy: agentsUsingProvider.map((a) => ({
          id: a.id,
          name: a.name,
          talonAgentId: a.talonAgentId || null
        }))
      });
    }

    const response = await fetch(new URL('/v1/auth/remove', gatewayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ provider }),
      signal: AbortSignal.timeout(15000)
    });
    const raw = await response.text();
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const isJson = contentType.includes('application/json');
    let data = { message: raw || 'No response body' };
    if (isJson) {
      try {
        data = JSON.parse(raw || '{}');
      } catch {
        data = { message: raw || 'Invalid JSON response body' };
      }
    }
    if (!response.ok) return bad(res, response.status, 'Talon auth remove failed', data);

    await prisma.llmModel.deleteMany({ where: { provider: { providerType: provider } } });
    await prisma.llmProvider.deleteMany({ where: { providerType: provider } });

    ok(res, data);
  } catch (err) {
    bad(res, 500, 'Failed to remove provider from Talon', err.message);
  }
});

app.get('/api/talon/providers/models', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  try {
    const response = await fetch(new URL('/v1/providers/models', gatewayUrl), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    ok(res, data);
  } catch (err) {
    bad(res, 500, 'Failed to fetch models from Talon', err.message);
  }
});

app.post('/api/talon/providers/sync', async (req, res) => {
  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return bad(res, 503, 'Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  try {
    const response = await fetch(new URL('/v1/providers/models', gatewayUrl), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(15000)
    });
    const { data: models } = await response.json();

    if (!Array.isArray(models)) return bad(res, 500, 'Invalid response from Talon');

    const results = [];
    for (const model of models) {
      // Find or create provider
      let provider = await prisma.llmProvider.findFirst({
        where: { providerType: model.provider }
      });

      if (!provider) {
        provider = await prisma.llmProvider.create({
          data: {
            name: model.provider.charAt(0).toUpperCase() + model.provider.slice(1),
            providerType: model.provider,
            status: 'active'
          }
        });
      }

      // Upsert model
      const upserted = await prisma.llmModel.upsert({
        where: {
          providerId_providerModelId: {
            providerId: provider.id,
            providerModelId: model.id
          }
        },
        update: {
          enabled: true
        },
        create: {
          providerId: provider.id,
          providerModelId: model.id,
          displayName: model.id,
          enabled: true
        }
      });
      results.push(upserted);
    }

    ok(res, { syncedCount: results.length });
  } catch (err) {
    bad(res, 500, 'Failed to sync models from Talon', err.message);
  }
});

app.get('/api/context/repos', requireAuth, async (req, res) => {
  try {
    const repos = readContextRepos();
    const projects = await prisma.project.findMany({ select: { id: true, code: true, name: true } });
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const hydrated = repos.map((r) => ({
      ...r,
      project: r.projectId ? (projectMap.get(r.projectId) || null) : null
    }));
    ok(res, hydrated);
  } catch (err) {
    bad(res, 500, 'Failed to load context repos', err.message);
  }
});

app.get('/api/context/repos/status', requireAuth, async (_req, res) => {
  try {
    const repos = readContextRepos();
    const enabled = repos.filter((r) => r.enabled !== false).length;
    const indexed = repos.filter((r) => !!r.lastIndexedAt).length;
    const withErrors = repos.filter((r) => !!r.lastError).length;
    const totalFiles = repos.reduce((sum, r) => sum + Number(r.lastFileCount || 0), 0);
    const totalChunks = repos.reduce((sum, r) => sum + Number(r.lastChunkCount || 0), 0);
    ok(res, { total: repos.length, enabled, indexed, withErrors, totalFiles, totalChunks });
  } catch (err) {
    bad(res, 500, 'Failed to load context repo status', err.message);
  }
});

app.post('/api/context/repos', requireAuth, async (req, res) => {
  try {
    const repoName = String(req.body?.repoName || '').trim();
    const repoPath = String(req.body?.repoPath || '').trim();
    const projectId = req.body?.projectId ? String(req.body.projectId) : null;

    if (!repoName) return bad(res, 400, 'repoName is required');
    if (!repoPath) return bad(res, 400, 'repoPath is required');

    const repos = readContextRepos();
    if (repos.some((r) => String(r.repoName).toLowerCase() === repoName.toLowerCase())) {
      return bad(res, 409, 'A repo with this name already exists');
    }

    const stats = countRepoStats(repoPath);
    const now = new Date().toISOString();
    const isDeferred = Boolean(stats.deferred);
    const created = {
      id: crypto.randomUUID(),
      repoName,
      repoPath,
      projectId,
      enabled: req.body?.enabled !== false,
      indexStatus: 'QUEUED',
      indexAcceptedAt: null,
      lastIndexedAt: stats.error || isDeferred ? null : now,
      lastFileCount: stats.fileCount,
      lastChunkCount: stats.chunkCount,
      lastError: stats.error,
      createdAt: now,
      updatedAt: now
    };

    repos.push(created);
    writeContextRepos(repos);

    repoObserver.onRepoCreated(created);
    ok(res, created);
  } catch (err) {
    bad(res, 500, 'Failed to create context repo', err.message);
  }
});

app.patch('/api/context/repos/:name', requireAuth, async (req, res) => {
  try {
    const name = String(req.params.name || '').trim().toLowerCase();
    const repos = readContextRepos();
    const idx = repos.findIndex((r) => String(r.repoName).toLowerCase() === name);
    if (idx < 0) return bad(res, 404, 'Context repo not found');

    const existing = repos[idx];
    const next = {
      ...existing,
      repoPath: req.body?.repoPath != null ? String(req.body.repoPath).trim() : existing.repoPath,
      projectId: req.body?.projectId != null ? String(req.body.projectId || '') || null : existing.projectId,
      enabled: req.body?.enabled != null ? !!req.body.enabled : existing.enabled,
      updatedAt: new Date().toISOString()
    };

    repos[idx] = next;
    writeContextRepos(repos);
    ok(res, next);
  } catch (err) {
    bad(res, 500, 'Failed to update context repo', err.message);
  }
});

app.post('/api/context/repos/:name/reindex', requireAuth, async (req, res) => {
  try {
    const name = String(req.params.name || '').trim().toLowerCase();
    const repos = readContextRepos();
    const idx = repos.findIndex((r) => String(r.repoName).toLowerCase() === name);
    if (idx < 0) return bad(res, 404, 'Context repo not found');

    const stats = countRepoStats(repos[idx].repoPath);
    repos[idx] = {
      ...repos[idx],
      lastIndexedAt: stats.error ? repos[idx].lastIndexedAt : new Date().toISOString(),
      lastFileCount: stats.fileCount,
      lastChunkCount: stats.chunkCount,
      lastError: stats.error,
      updatedAt: new Date().toISOString()
    };
    writeContextRepos(repos);
    ok(res, repos[idx]);
  } catch (err) {
    bad(res, 500, 'Failed to reindex context repo', err.message);
  }
});

app.post('/api/context/repos/:name/sync', requireAuth, async (req, res) => {
  try {
    const name = String(req.params.name || '').trim().toLowerCase();
    const eventType = String(req.body?.eventType || '').trim();
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    const repos = readContextRepos();
    const idx = repos.findIndex((r) => String(r.repoName).toLowerCase() === name);
    if (idx < 0) return bad(res, 404, 'Context repo not found');

    if (!shouldQueueReindex(eventType, files)) {
      return ok(res, { accepted: false, reason: 'No markdown-related sync required' });
    }

    const repo = repos[idx];
    const queuedJob = contextIndexQueue.enqueue('repo.reindex', buildReindexPayload(repo));
    repos[idx] = {
      ...repo,
      indexStatus: 'QUEUED',
      updatedAt: new Date().toISOString()
    };
    writeContextRepos(repos);
    ok(res, { accepted: true, jobId: queuedJob.id, eventType });
  } catch (err) {
    bad(res, 500, 'Failed to queue repo sync', err.message);
  }
});

app.post('/api/context/repos/index-completed', async (req, res) => {
  try {
    const token = String(process.env.CONTEXT_GATEWAY_TOKEN || '').trim();
    const auth = String(req.headers.authorization || '');
    if (token) {
      const expected = `Bearer ${token}`;
      if (auth !== expected) return bad(res, 401, 'Unauthorized gateway webhook');
    }

    const repoId = String(req.body?.repo_id || '').trim();
    const status = String(req.body?.status || '').trim().toLowerCase();
    const error = String(req.body?.error || '').trim();
    const indexedAt = req.body?.indexed_at ? String(req.body.indexed_at) : null;
    const fileCount = Number(req.body?.file_count || 0);
    const chunkCount = Number(req.body?.chunk_count || 0);
    if (!repoId) return bad(res, 400, 'repo_id is required');

    const repos = readContextRepos();
    const idx = repos.findIndex((repo) => String(repo.id) === repoId);
    if (idx < 0) return bad(res, 404, 'Context repo not found');

    const isSuccess = status === 'indexed' || status === 'complete';
    repos[idx] = {
      ...repos[idx],
      indexStatus: isSuccess ? 'INDEXED' : 'FAILED',
      lastIndexedAt: isSuccess ? (indexedAt || new Date().toISOString()) : repos[idx].lastIndexedAt,
      lastFileCount: isSuccess ? fileCount : repos[idx].lastFileCount,
      lastChunkCount: isSuccess ? chunkCount : repos[idx].lastChunkCount,
      lastError: isSuccess ? null : (error || 'Indexing failed'),
      updatedAt: new Date().toISOString()
    };
    writeContextRepos(repos);
    ok(res, { updated: true, repoId, status: repos[idx].indexStatus });
  } catch (err) {
    bad(res, 500, 'Failed to handle context index webhook', err.message);
  }
});

app.delete('/api/context/repos/:name', requireAuth, async (req, res) => {
  try {
    const name = String(req.params.name || '').trim().toLowerCase();
    const repos = readContextRepos();
    const idx = repos.findIndex((r) => String(r.repoName).toLowerCase() === name);
    if (idx < 0) return bad(res, 404, 'Context repo not found');
    const existing = repos[idx];

    const gatewayUrl = process.env.CONTEXT_GATEWAY_URL || 'http://localhost:4444';
    const gatewayToken = process.env.CONTEXT_GATEWAY_TOKEN || '';
    const gatewayDeleteUrl = new URL(`/v1/index/repo/${encodeURIComponent(existing.repoName)}`, gatewayUrl);
    const gatewayResponse = await fetch(gatewayDeleteUrl, {
      method: 'DELETE',
      headers: {
        ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {})
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!gatewayResponse.ok && gatewayResponse.status !== 404) {
      const details = await gatewayResponse.text().catch(() => '');
      return bad(
        res,
        502,
        'Failed to delete repo index in context gateway',
        details || `gateway responded ${gatewayResponse.status}`
      );
    }

    const next = repos.filter((r) => String(r.id) !== String(existing.id));
    writeContextRepos(next);
    ok(res, { deleted: true, repoName: existing.repoName, indexDeleted: gatewayResponse.status !== 404 });
  } catch (err) {
    bad(res, 500, 'Failed to delete context repo', err.message);
  }
});

const handleTalonOAuthCallback = async (req, res) => {
  // Handles OAuth redirect from Google/Anthropic etc.
  const { code, state } = req.query;
  if (!code) return res.send('Missing code in callback');

  // state usually contains the provider name if we set it in /v1/auth/start
  const stateValue = String(state || '').trim();
  const provider = stateValue.startsWith('openai-codex:') ? 'openai-codex' : (stateValue || 'google');

  const gatewayUrl = process.env.TALON_GATEWAY_URL;
  if (!gatewayUrl) return res.send('Talon gateway not configured');
  const token = process.env.TALON_GATEWAY_TOKEN || '';

  try {
    const response = await fetch(new URL('/v1/auth/exchange', gatewayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ provider, code, state: stateValue }),
      signal: AbortSignal.timeout(15000)
    });

    if (response.ok) {
      // Success! Redirect back to the UI
      res.send(`
        <html>
          <body>
            <h1>Success</h1>
            <p>Provider connected successfully. You can close this tab now.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);
    } else {
      const error = await response.text();
      res.send(`Auth failed: ${error}`);
    }
  } catch (err) {
    res.send(`Internal error: ${err.message}`);
  }
};

app.get('/api/talon/callback', handleTalonOAuthCallback);
app.get('/auth/callback', handleTalonOAuthCallback);

// Agent Lifecycle (Start/Stop Work)
app.post('/api/tasks/:taskId/start-work', async (req, res) => {
  const { taskId } = req.params;
  const { agent } = req.body;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return bad(res, 404, 'Task not found');

  const project = await prisma.project.findUnique({ where: { id: task.projectId } });

  const autoAgent = await resolveAgentForAssignee(agent || task.assignee);
  const agentName = autoAgent?.name || agent || 'Agent';

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: { columnName: 'Inprogress' }
  });

  if (autoAgent) {
    await prisma.agent.update({
      where: { id: autoAgent.id },
      data: { status: 'active', currentTaskId: taskId }
    });
  }

  await logActivity({
    action: 'agent.start',
    detail: `${agentName} started work`,
    actor: agentName,
    projectId: task.projectId,
    taskId
  });

  broadcast('task.move', { taskId, task: updatedTask });
  ok(res, updatedTask);
});

app.post('/api/tasks/:taskId/stop-work', async (req, res) => {
  const { taskId } = req.params;
  const { agent, outcome, reason } = req.body; // outcome: 'review' | 'blocked'

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return bad(res, 404, 'Task not found');

  const targetColumn = outcome === 'blocked' ? 'Blocked' : 'Review';
  const autoAgent = await resolveAgentForAssignee(agent || task.assignee);
  const agentName = autoAgent?.name || agent || 'Agent';

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: { columnName: targetColumn }
  });

  if (autoAgent) {
    await prisma.agent.update({
      where: { id: autoAgent.id },
      data: { status: 'idle', currentTaskId: null }
    });
  }

  await logActivity({
    action: `agent.stop.${outcome || 'finish'}`,
    detail: `${agentName} stopped work: ${reason || 'Task complete'}`,
    actor: agentName,
    projectId: task.projectId,
    taskId
  });

  broadcast('task.move', { taskId, task: updatedTask });
  ok(res, updatedTask);
});

// LLM Registry Routes
app.use('/api/llm/providers', apiProvidersRouter);
app.use('/api/llm/models', modelsRouter);

// Client-side error reporting (UI)
app.post('/api/client-error', async (req, res) => {
  const { message, stack, extra } = req.body || {};
  await logActivity({
    action: 'client.error',
    detail: [message, stack, extra ? JSON.stringify(extra) : ''].filter(Boolean).join('\n'),
    actor: 'web'
  });
  ok(res, { logged: true });
});

// Serve the built web UI (if present)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback (avoid /api routes)
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const port = process.env.PORT || 3333;
const oauthPort = Number(process.env.OAUTH_PORT || 1455);
const host = process.env.HOST || '127.0.0.1';
httpServer.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
  if (fs.existsSync(webDist)) console.log(`Web UI served from ${webDist}`);
  const pollMs = Number(process.env.TALON_QUEUE_POLL_MS || 0);
  if (pollMs > 0 && shouldQueueTalon()) {
    setInterval(() => {
      processTalonQueue({ limit: Number(process.env.TALON_QUEUE_BATCH || 5) })
        .catch((err) => console.error('Talon queue processing failed', err));
    }, pollMs);
  }

  const contextPollMs = Number(process.env.CONTEXT_INDEX_QUEUE_POLL_MS || 0);
  if (contextPollMs > 0) {
    setInterval(() => {
      processContextRepoQueue()
        .catch((err) => console.error('Context index queue processing failed', err));
    }, contextPollMs);
  }
});

if (oauthPort && Number(port) !== oauthPort) {
  createServer(app).listen(oauthPort, host, () => {
    console.log(`OAuth callback listening on http://${host}:${oauthPort}`);
  });
}
