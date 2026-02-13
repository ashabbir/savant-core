import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSavantContextVersion } from './savant-context.js';
import { appendAudit, deleteRepoIndex, getRepoIndex, listAuditEntries, listRepoIndexes } from './store.js';
import { indexRepository } from './indexer.js';
import { readMemory, searchMemory } from './memory-tools.js';
import { readCode, searchCode } from './code-tools.js';
import { addAbilityBlock, abilitiesSummary, listAbilityBlocks, resolveAbilities } from './abilities.js';
import { errorResponse } from './errors.js';
import { sendIndexWebhook } from './webhook.js';
import { validateGatewayAuth } from './auth.js';

const MCP_CONTEXT = {
  mcp_id: 'context',
  mcp_name: 'Context MCP',
  description: 'Repository memory index and retrieval'
};

const MCP_ABILITIES = {
  mcp_id: 'abilities',
  mcp_name: 'Abilities MCP',
  description: 'Filesystem-backed personas, rules, policies, and repo overlays'
};

function toRepoSummary(repo) {
  return {
    repo_name: repo.repoName || '',
    repo_id: repo.repoId || '',
    source_repo_path: repo.sourceRepoPath || repo.repoPath || '',
    worktree_path: repo.worktreePath || repo.repoPath || '',
    agent_id: repo.agentId || 'shared',
    indexed_at: repo.indexedAt || null,
    files_indexed: Array.isArray(repo.files) ? repo.files.length : 0,
    chunks_indexed: Array.isArray(repo.files)
      ? repo.files.reduce((sum, file) => sum + (Array.isArray(file?.chunks) ? file.chunks.length : 0), 0)
      : 0
  };
}

function contextToolCatalog() {
  return [
    {
      name: 'memory_search',
      description: 'Search semantic memory chunks in indexed repositories.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Indexed repository name (for example savant-core)' },
          query: { type: 'string', description: 'Search query text' },
          limit: { type: 'number', description: 'Maximum number of rows to return' }
        },
        required: ['repo', 'query']
      },
      defaults: { repo: '', limit: 8 }
    },
    {
      name: 'memory_read',
      description: 'Read a full indexed file from a repository by relative path.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Indexed repository name (for example savant-core)' },
          path: { type: 'string', description: 'Relative file path, for example memory_bank/architecture.md' }
        },
        required: ['repo', 'path']
      },
      defaults: { repo: '' }
    },
    {
      name: 'code_search',
      description: 'Search source code lines within a repository.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Indexed repository name' },
          query: { type: 'string', description: 'Text to find in code files' },
          limit: { type: 'number', description: 'Maximum matching lines to return' }
        },
        required: ['repo', 'query']
      },
      defaults: { repo: '', query: 'TODO', limit: 20 }
    },
    {
      name: 'code_read',
      description: 'Read a code file from a repository by relative path.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Indexed repository name' },
          path: { type: 'string', description: 'Relative file path' },
          maxBytes: { type: 'number', description: 'Safety limit for file size in bytes' }
        },
        required: ['repo', 'path']
      },
      defaults: { repo: '', path: 'README.md', maxBytes: 400000 }
    }
  ];
}

function abilitiesToolCatalog() {
  return [
    {
      name: 'resolve_abilities',
      description: 'Resolve persona + tagged rules (+ optional repo overlay) into a deterministic prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          persona: { type: 'string', description: 'Persona id or name (for example engineer or persona.engineer)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag list (for example backend, security)' },
          repo_id: { type: 'string', description: 'Optional repo overlay id' },
          trace: { type: 'boolean', description: 'Include resolution trace' }
        },
        required: ['persona']
      },
      defaults: { tags: [], trace: false }
    },
    {
      name: 'add_ability_block',
      description: 'Create a persona/rule/policy/style/repo markdown block in a target directory.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'persona|rule|policy|style|repo' },
          id: { type: 'string', description: 'Unique block id (for example rule.backend.base)' },
          relativeDir: { type: 'string', description: 'Optional directory under the type root (for example backend/python)' },
          fileName: { type: 'string', description: 'Optional file name without .md (defaults from id)' },
          tags: { type: 'array', items: { type: 'string' } },
          priority: { type: 'number' },
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          includes: { type: 'array', items: { type: 'string' } },
          body: { type: 'string', description: 'Markdown body content' },
          overwrite: { type: 'boolean' }
        },
        required: ['type', 'id', 'priority', 'body']
      },
      defaults: { type: 'rule', priority: 100, tags: [] }
    },
    {
      name: 'list_ability_blocks',
      description: 'List ability blocks, optionally filtered by type.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Optional type filter' }
        }
      },
      defaults: {}
    },
    {
      name: 'list_personas',
      description: 'List personas.',
      inputSchema: { type: 'object', properties: {} },
      defaults: {}
    },
    {
      name: 'list_repos',
      description: 'List repo overlays.',
      inputSchema: { type: 'object', properties: {} },
      defaults: {}
    },
    {
      name: 'list_rules',
      description: 'List rules.',
      inputSchema: { type: 'object', properties: {} },
      defaults: {}
    },
    {
      name: 'list_policies',
      description: 'List policies and styles.',
      inputSchema: { type: 'object', properties: {} },
      defaults: {}
    }
  ];
}

function mcpToolCatalog(mcpId) {
  return mcpId === MCP_ABILITIES.mcp_id ? abilitiesToolCatalog() : contextToolCatalog();
}

function fireAndForget(promise, onError) {
  Promise.resolve(promise).catch((error) => {
    if (typeof onError === 'function') onError(error);
  });
}

export function createApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const uiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui');
  const hotReloadEnabled = process.env.UI_HOT_RELOAD !== '0' && process.env.NODE_ENV !== 'test';
  const hotReloadClients = new Set();
  let hotReloadSeq = 0;
  let uiWatchTimer = null;

  const readVersion = options.readVersion || readSavantContextVersion;
  const indexRepo = options.indexRepository || indexRepository;
  const search = options.searchMemory || searchMemory;
  const read = options.readMemory || readMemory;
  const notifyWebhook = options.notifyWebhook || sendIndexWebhook;

  app.get('/', (_req, res) => {
    res.redirect('/ui/');
  });
  app.get('/ui/__hmr', (req, res) => {
    if (!hotReloadEnabled) {
      return res.status(404).end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write('event: ready\ndata: ok\n\n');

    hotReloadClients.add(res);
    req.on('close', () => {
      hotReloadClients.delete(res);
    });
    return undefined;
  });

  app.use('/ui', express.static(uiDir, {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));

  if (hotReloadEnabled && options.disableUiWatcher !== true) {
    fs.watch(uiDir, { persistent: false }, (_eventType, fileName) => {
      const name = String(fileName || '');
      if (!name || !/\.(css|js|html)$/i.test(name)) return;
      if (uiWatchTimer) clearTimeout(uiWatchTimer);
      uiWatchTimer = setTimeout(() => {
        hotReloadSeq += 1;
        const payload = `event: reload\ndata: ${hotReloadSeq}\n\n`;
        for (const client of hotReloadClients) {
          client.write(payload);
        }
      }, 80);
    });
  }

  app.use('/v1', (req, res, next) => {
    const verdict = validateGatewayAuth(req.headers.authorization);
    if (!verdict.ok) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized', verdict.reason, false);
    }
    return next();
  });

  app.get('/health', (_req, res) => {
    try {
      const version = readVersion();
      res.json({ ok: true, savantContextVersion: version });
    } catch (error) {
      res.status(503).json({ ok: false, message: String(error?.message || error) });
    }
  });

  app.post('/v1/index/repo', async (req, res) => {
    const repoId = String(req.body?.repo_id || '').trim();
    const repoPath = String(req.body?.path || '').trim();
    const name = String(req.body?.name || '').trim();
    const agentId = String(req.body?.agent_id || 'shared').trim();

    if (!repoId || !repoPath || !name) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'repo_id, path, and name are required');
    }

    try {
      const record = indexRepo({ repoId, path: repoPath, name, agentId });
      appendAudit({ at: new Date().toISOString(), tool: 'repo_index', repo: name, ok: true });
      fireAndForget(
        notifyWebhook({
          event: 'index.completed',
          repo_id: record.repoId,
          repo_name: record.repoName,
          status: 'indexed',
          indexed_at: record.indexedAt,
          file_count: (record.files || []).length,
          chunk_count: (record.files || []).reduce((sum, file) => sum + (file.chunks || []).length, 0)
        }),
        () => {},
      );
      return res.status(202).json({
        ok: true,
        data: {
          repo_name: record.repoName,
          repo_id: record.repoId,
          status: 'indexed',
          indexed_at: record.indexedAt,
          worktree_path: record.worktreePath,
          files_indexed: (record.files || []).length,
          chunks_indexed: (record.files || []).reduce((sum, file) => sum + (file.chunks || []).length, 0)
        }
      });
    } catch (error) {
      const message = String(error?.message || error);
      appendAudit({ at: new Date().toISOString(), tool: 'repo_index', repo: name, ok: false, error: message });
      fireAndForget(
        notifyWebhook({
          event: 'index.completed',
          repo_id: repoId,
          repo_name: name,
          status: 'failed',
          error: message
        }),
        () => {},
      );
      return errorResponse(
        res,
        500,
        'INDEX_FAILED',
        'Failed to index repository',
        message,
        true,
      );
    }
  });

  app.get('/v1/status/:repo_name', (req, res) => {
    const repoName = String(req.params.repo_name || '').trim();
    const repo = getRepoIndex(repoName);
    if (!repo) return errorResponse(res, 404, 'NOT_FOUND', 'Repo index not found');

    return res.json({
      ok: true,
      data: {
        status: 'indexed',
        last_updated: repo.indexedAt
      }
    });
  });

  app.get('/v1/index/repos', (_req, res) => {
    const repos = listRepoIndexes();
    const data = repos.map(toRepoSummary);
    return res.json({
      ok: true,
      data: {
        total: data.length,
        repos: data
      }
    });
  });

  app.get('/v1/mcps', (_req, res) => {
    const repos = listRepoIndexes().map(toRepoSummary);
    const fileCount = repos.reduce((sum, repo) => sum + Number(repo.files_indexed || 0), 0);
    const chunkCount = repos.reduce((sum, repo) => sum + Number(repo.chunks_indexed || 0), 0);
    const latestIndexedAt = repos
      .map((repo) => repo.indexed_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const abilities = abilitiesSummary();
    const mcps = [
      {
        ...MCP_CONTEXT,
        status: 'active',
        repo_count: repos.length,
        files_indexed: fileCount,
        chunks_indexed: chunkCount,
        indexed_at: latestIndexedAt
      },
      {
        ...MCP_ABILITIES,
        status: 'active',
        repo_count: Number(abilities.counts.repos || 0),
        files_indexed: Number(abilities.total || 0),
        chunks_indexed: Number(abilities.counts.rules || 0) + Number(abilities.counts.policies || 0) + Number(abilities.counts.styles || 0),
        indexed_at: abilities.indexed_at
      }
    ];
    return res.json({
      ok: true,
      data: {
        total: mcps.length,
        mcps
      }
    });
  });

  app.get('/v1/mcps/:mcp_id', (req, res) => {
    const mcpId = String(req.params.mcp_id || '').trim();
    if (mcpId === MCP_CONTEXT.mcp_id) {
      const repos = listRepoIndexes().map(toRepoSummary);
      const fileCount = repos.reduce((sum, repo) => sum + Number(repo.files_indexed || 0), 0);
      const chunkCount = repos.reduce((sum, repo) => sum + Number(repo.chunks_indexed || 0), 0);
      const latestIndexedAt = repos
        .map((repo) => repo.indexed_at)
        .filter(Boolean)
        .sort()
        .at(-1) || null;
      const recentAudit = listAuditEntries(200)
        .filter((entry) => String(entry?.tool || '').startsWith('memory_') || String(entry?.tool || '').startsWith('repo_'))
        .slice(0, 20);
      return res.json({
        ok: true,
        data: {
          ...MCP_CONTEXT,
          status: 'active',
          repo_count: repos.length,
          files_indexed: fileCount,
          chunks_indexed: chunkCount,
          indexed_at: latestIndexedAt,
          repos,
          dashboard: {
            status: latestIndexedAt ? 'indexed' : 'ready',
            last_updated: latestIndexedAt,
            recent_audit: recentAudit
          }
        }
      });
    }

    if (mcpId === MCP_ABILITIES.mcp_id) {
      const summary = abilitiesSummary();
      const blocks = listAbilityBlocks();
      const recentAudit = listAuditEntries(200)
        .filter((entry) => String(entry?.tool || '').startsWith('ability_'))
        .slice(0, 20);
      return res.json({
        ok: true,
        data: {
          ...MCP_ABILITIES,
          status: 'active',
          repo_count: Number(summary.counts.repos || 0),
          files_indexed: Number(summary.total || 0),
          chunks_indexed: Number(summary.counts.rules || 0) + Number(summary.counts.policies || 0) + Number(summary.counts.styles || 0),
          indexed_at: summary.indexed_at,
          abilities: {
            ...summary,
            blocks
          },
          dashboard: {
            status: summary.total > 0 ? 'indexed' : 'ready',
            last_updated: summary.indexed_at,
            recent_audit: recentAudit
          }
        }
      });
    }

    return errorResponse(res, 404, 'NOT_FOUND', 'MCP not found');
  });

  app.get('/v1/mcps/:mcp_id/tools', (req, res) => {
    const mcpId = String(req.params.mcp_id || '').trim();
    if (mcpId !== MCP_CONTEXT.mcp_id && mcpId !== MCP_ABILITIES.mcp_id) return errorResponse(res, 404, 'NOT_FOUND', 'MCP not found');
    return res.json({
      ok: true,
      data: {
        mcp_id: mcpId,
        tools: mcpToolCatalog(mcpId)
      }
    });
  });

  app.post('/v1/mcps/:mcp_id/tools/:tool_name/run', (req, res) => {
    const mcpId = String(req.params.mcp_id || '').trim();
    const toolName = String(req.params.tool_name || '').trim();
    const args = req.body?.arguments || {};

    try {
      if (mcpId === MCP_ABILITIES.mcp_id) {
        if (toolName === 'resolve_abilities') {
          const data = resolveAbilities({
            persona: args?.persona,
            tags: args?.tags || [],
            repo_id: args?.repo_id,
            trace: args?.trace === true
          });
          appendAudit({ at: new Date().toISOString(), tool: 'ability_resolve', repo: String(args?.repo_id || ''), ok: true });
          return res.json({ ok: true, data });
        }

        if (toolName === 'add_ability_block') {
          const data = addAbilityBlock(args || {});
          appendAudit({ at: new Date().toISOString(), tool: 'ability_add_block', repo: String(data?.id || ''), ok: true });
          return res.json({ ok: true, data });
        }

        if (toolName === 'list_ability_blocks') {
          const data = listAbilityBlocks({ type: args?.type });
          appendAudit({ at: new Date().toISOString(), tool: 'ability_list_blocks', repo: String(args?.type || ''), ok: true });
          return res.json({ ok: true, data });
        }

        if (toolName === 'list_personas') {
          return res.json({ ok: true, data: listAbilityBlocks({ type: 'persona' }) });
        }

        if (toolName === 'list_repos') {
          return res.json({ ok: true, data: listAbilityBlocks({ type: 'repo' }) });
        }

        if (toolName === 'list_rules') {
          return res.json({ ok: true, data: listAbilityBlocks({ type: 'rule' }) });
        }

        if (toolName === 'list_policies') {
          const policies = [
            ...listAbilityBlocks({ type: 'policy' }),
            ...listAbilityBlocks({ type: 'style' })
          ];
          return res.json({ ok: true, data: policies });
        }

        return errorResponse(res, 400, 'UNSUPPORTED_TOOL', `Unsupported tool: ${toolName}`);
      }

      if (mcpId !== MCP_CONTEXT.mcp_id) return errorResponse(res, 404, 'NOT_FOUND', 'MCP not found');

      if (toolName === 'memory_search') {
        const repoName = String(args?.repo || '').trim();
        if (!repoName) return errorResponse(res, 400, 'VALIDATION_ERROR', 'repo is required');
        if (!getRepoIndex(repoName)) return errorResponse(res, 404, 'NOT_FOUND', 'Repo index not found');
        const query = String(args?.query || '').trim();
        if (!query) return errorResponse(res, 400, 'VALIDATION_ERROR', 'query is required');
        const rows = search({ query, repo: repoName, limit: args?.limit });
        appendAudit({ at: new Date().toISOString(), tool: toolName, repo: repoName, ok: true });
        return res.json({ ok: true, data: rows });
      }

      if (toolName === 'memory_read') {
        const repoName = String(args?.repo || '').trim();
        if (!repoName) return errorResponse(res, 400, 'VALIDATION_ERROR', 'repo is required');
        if (!getRepoIndex(repoName)) return errorResponse(res, 404, 'NOT_FOUND', 'Repo index not found');
        const filePath = String(args?.path || '').trim();
        if (!filePath) return errorResponse(res, 400, 'VALIDATION_ERROR', 'path is required');
        const content = read({ path: filePath, repo: repoName });
        appendAudit({ at: new Date().toISOString(), tool: toolName, repo: repoName, ok: true });
        return res.json({ ok: true, data: { path: filePath, content } });
      }

      if (toolName === 'code_search') {
        const repoName = String(args?.repo || '').trim();
        if (!repoName) return errorResponse(res, 400, 'VALIDATION_ERROR', 'repo is required');
        if (!getRepoIndex(repoName)) return errorResponse(res, 404, 'NOT_FOUND', 'Repo index not found');
        const query = String(args?.query || '').trim();
        if (!query) return errorResponse(res, 400, 'VALIDATION_ERROR', 'query is required');
        const rows = searchCode({ repo: repoName, query, limit: args?.limit });
        appendAudit({ at: new Date().toISOString(), tool: toolName, repo: repoName, ok: true });
        return res.json({ ok: true, data: rows });
      }

      if (toolName === 'code_read') {
        const repoName = String(args?.repo || '').trim();
        if (!repoName) return errorResponse(res, 400, 'VALIDATION_ERROR', 'repo is required');
        if (!getRepoIndex(repoName)) return errorResponse(res, 404, 'NOT_FOUND', 'Repo index not found');
        const filePath = String(args?.path || '').trim();
        if (!filePath) return errorResponse(res, 400, 'VALIDATION_ERROR', 'path is required');
        const file = readCode({ repo: repoName, path: filePath, maxBytes: args?.maxBytes });
        appendAudit({ at: new Date().toISOString(), tool: toolName, repo: repoName, ok: true });
        return res.json({ ok: true, data: file });
      }

      return errorResponse(res, 400, 'UNSUPPORTED_TOOL', `Unsupported tool: ${toolName}`);
    } catch (error) {
      const message = String(error?.message || error);
      appendAudit({ at: new Date().toISOString(), tool: toolName || 'unknown', repo: mcpId, ok: false, error: message });
      return errorResponse(res, 500, 'TOOL_EXECUTION_FAILED', 'Tool execution failed', message, true);
    }
  });

  app.get('/v1/audit', (req, res) => {
    const limit = Number(req.query.limit || 200);
    const entries = listAuditEntries(limit);
    return res.json({
      ok: true,
      data: {
        total: entries.length,
        entries
      }
    });
  });

  app.delete('/v1/index/repo/:repo_name', (req, res) => {
    const repoName = String(req.params.repo_name || '').trim();
    if (!repoName) return errorResponse(res, 400, 'VALIDATION_ERROR', 'repo_name is required');

    const removed = deleteRepoIndex(repoName);
    if (!removed.deleted) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Repo index not found');
    }

    appendAudit({ at: new Date().toISOString(), tool: 'repo_index_delete', repo: repoName, ok: true });
    return res.json({
      ok: true,
      data: {
        deleted: true,
        repo_name: repoName,
        repo_id: removed.record?.repoId || null
      }
    });
  });

  app.post('/v1/mcp/query', (req, res) => {
    const tool = String(req.body?.tool || '').trim();
    const args = req.body?.arguments || {};

    try {
      if (tool === 'resolve_abilities') {
        const data = resolveAbilities({
          persona: args?.persona,
          tags: args?.tags || [],
          repo_id: args?.repo_id,
          trace: args?.trace === true
        });
        appendAudit({ at: new Date().toISOString(), tool, repo: String(args?.repo_id || ''), ok: true });
        return res.json({ ok: true, data });
      }

      if (tool === 'add_ability_block') {
        const data = addAbilityBlock(args || {});
        appendAudit({ at: new Date().toISOString(), tool, repo: String(data?.id || ''), ok: true });
        return res.json({ ok: true, data });
      }

      if (tool === 'list_ability_blocks') {
        const data = listAbilityBlocks({ type: args?.type });
        appendAudit({ at: new Date().toISOString(), tool, repo: String(args?.type || ''), ok: true });
        return res.json({ ok: true, data });
      }

      if (tool === 'memory_search') {
        const rows = search({
          query: String(args?.query || ''),
          repo: String(args?.repo || ''),
          limit: args?.limit
        });
        appendAudit({ at: new Date().toISOString(), tool, repo: String(args?.repo || ''), ok: true });
        return res.json({ ok: true, data: rows });
      }

      if (tool === 'memory_read') {
        const content = read({
          path: String(args?.path || ''),
          repo: String(args?.repo || '')
        });
        appendAudit({ at: new Date().toISOString(), tool, repo: String(args?.repo || ''), ok: true });
        return res.json({ ok: true, data: { path: String(args?.path || ''), content } });
      }

      if (tool === 'code_search') {
        const rows = searchCode({
          repo: String(args?.repo || ''),
          query: String(args?.query || ''),
          limit: args?.limit
        });
        appendAudit({ at: new Date().toISOString(), tool, repo: String(args?.repo || ''), ok: true });
        return res.json({ ok: true, data: rows });
      }

      if (tool === 'code_read') {
        const file = readCode({
          repo: String(args?.repo || ''),
          path: String(args?.path || ''),
          maxBytes: args?.maxBytes
        });
        appendAudit({ at: new Date().toISOString(), tool, repo: String(args?.repo || ''), ok: true });
        return res.json({ ok: true, data: file });
      }

      return errorResponse(res, 400, 'UNSUPPORTED_TOOL', `Unsupported tool: ${tool}`);
    } catch (error) {
      const message = String(error?.message || error);
      appendAudit({ at: new Date().toISOString(), tool: tool || 'unknown', repo: String(args?.repo || ''), ok: false, error: message });
      return errorResponse(res, 500, 'TOOL_EXECUTION_FAILED', 'Tool execution failed', message, true);
    }
  });

  return app;
}
