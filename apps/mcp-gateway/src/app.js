import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSavantContextVersion } from './savant-context.js';
import { appendAudit, deleteRepoIndex, getRepoIndex, listAuditEntries, listRepoIndexes } from './store.js';
import { indexRepository } from './indexer.js';
import { readMemory, searchMemory } from './memory-tools.js';
import { errorResponse } from './errors.js';
import { sendIndexWebhook } from './webhook.js';
import { validateGatewayAuth } from './auth.js';

function fireAndForget(promise, onError) {
  Promise.resolve(promise).catch((error) => {
    if (typeof onError === 'function') onError(error);
  });
}

export function createApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const uiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui');

  const readVersion = options.readVersion || readSavantContextVersion;
  const indexRepo = options.indexRepository || indexRepository;
  const search = options.searchMemory || searchMemory;
  const read = options.readMemory || readMemory;
  const notifyWebhook = options.notifyWebhook || sendIndexWebhook;

  app.get('/', (_req, res) => {
    res.redirect('/ui/');
  });
  app.use('/ui', express.static(uiDir));

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
    const data = repos.map((repo) => ({
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
    }));
    return res.json({
      ok: true,
      data: {
        total: data.length,
        repos: data
      }
    });
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

      return errorResponse(res, 400, 'UNSUPPORTED_TOOL', `Unsupported tool: ${tool}`);
    } catch (error) {
      const message = String(error?.message || error);
      appendAudit({ at: new Date().toISOString(), tool: tool || 'unknown', repo: String(args?.repo || ''), ok: false, error: message });
      return errorResponse(res, 500, 'TOOL_EXECUTION_FAILED', 'Tool execution failed', message, true);
    }
  });

  return app;
}
