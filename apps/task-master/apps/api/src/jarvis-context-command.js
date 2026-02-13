const DEFAULT_TOOL_TIMEOUT_MS = 15000;
const READ_MAX_CHARS = 12000;

export const JARVIS_CONTEXT_COMMAND_HELP = [
  'Context commands:',
  '/repos',
  '/search <repo> <query>  (alias: /code-search)',
  '/read <repo> <path>     (alias: /code-read)',
  '/memory-search <repo> <query>',
  '/memory-read <repo> <path>'
].join('\n');

function splitFirstWord(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { head: '', tail: '' };
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace < 0) return { head: trimmed, tail: '' };
  return {
    head: trimmed.slice(0, firstSpace).trim(),
    tail: trimmed.slice(firstSpace + 1).trim()
  };
}

function parseRepoAndRest(value) {
  const { head: repo, tail: rest } = splitFirstWord(value);
  return {
    repo: String(repo || '').trim(),
    rest: String(rest || '').trim()
  };
}

export function parseJarvisContextCommand(message) {
  const raw = String(message || '').trim();
  if (!raw.startsWith('/')) return null;

  const { head: command, tail } = splitFirstWord(raw);
  const normalized = command.toLowerCase();

  if (normalized === '/context-help' || normalized === '/help-context') {
    return { type: 'help' };
  }

  if (normalized === '/repos') {
    return { type: 'tool', tool: 'list_repos', args: {} };
  }

  if (
    normalized === '/search' ||
    normalized === '/code-search' ||
    normalized === '/memory-search' ||
    normalized === '/read' ||
    normalized === '/code-read' ||
    normalized === '/memory-read'
  ) {
    const { repo, rest } = parseRepoAndRest(tail);
    if (!repo || !rest) {
      return {
        type: 'help',
        error: `Usage: ${command} <repo> ${normalized.includes('read') ? '<path>' : '<query>'}`
      };
    }

    if (normalized === '/memory-search') {
      return { type: 'tool', tool: 'memory_search', args: { repo, query: rest } };
    }
    if (normalized === '/memory-read') {
      return { type: 'tool', tool: 'memory_read', args: { repo, path: rest } };
    }
    if (normalized === '/read' || normalized === '/code-read') {
      return { type: 'tool', tool: 'code_read', args: { repo, path: rest } };
    }
    return { type: 'tool', tool: 'code_search', args: { repo, query: rest } };
  }

  return null;
}

function truncate(value, maxChars = READ_MAX_CHARS) {
  const text = String(value || '');
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

function lineForSearchRow(row, idx) {
  const file = String(row?.file || row?.path || row?.source || 'unknown');
  const line = Number(row?.line || row?.startLine || row?.lineNumber || 0);
  const snippet = String(row?.snippet || row?.text || row?.content || '').replace(/\s+/g, ' ').trim();
  const score = Number(row?.score || 0);
  const scoreText = Number.isFinite(score) && score > 0 ? ` [score ${score.toFixed(3)}]` : '';
  const lineText = line > 0 ? `:${line}` : '';
  return `${idx + 1}. ${file}${lineText}${scoreText}${snippet ? `\n   ${snippet}` : ''}`;
}

export function formatJarvisContextCommandResult(command, data) {
  if (command?.type === 'help') {
    return [command.error || null, JARVIS_CONTEXT_COMMAND_HELP].filter(Boolean).join('\n\n');
  }

  if (command?.tool === 'list_repos') {
    const repos = Array.isArray(data?.repos) ? data.repos : [];
    if (!repos.length) return 'No indexed repos found.';
    const lines = repos.map((repo, idx) => {
      const name = String(repo?.repo_name || `repo-${idx + 1}`);
      const files = Number(repo?.files_indexed || 0);
      const chunks = Number(repo?.chunks_indexed || 0);
      const indexedAt = String(repo?.indexed_at || 'never');
      return `${idx + 1}. ${name}\n   Files: ${files} · Chunks: ${chunks} · Indexed: ${indexedAt}`;
    });
    return [`Indexed repos (${repos.length}):`, ...lines].join('\n');
  }

  if (command?.tool === 'code_search' || command?.tool === 'memory_search') {
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      return `No matches found for "${command.args?.query || ''}" in ${command.args?.repo || 'repo'}.`;
    }
    const title = `${command.tool === 'code_search' ? 'Code' : 'Memory'} search matches (${rows.length}):`;
    return [title, ...rows.slice(0, 20).map((row, idx) => lineForSearchRow(row, idx))].join('\n');
  }

  if (command?.tool === 'code_read' || command?.tool === 'memory_read') {
    const path = String(data?.path || command.args?.path || '');
    const rawText = String(data?.content || data?.text || '');
    const { text, truncated } = truncate(rawText);
    const suffix = truncated ? '\n\n[truncated]' : '';
    return [`${command.tool} ${path}`.trim(), text + suffix].join('\n\n');
  }

  return JSON.stringify(data, null, 2);
}

export async function executeJarvisContextCommand(params) {
  const gatewayUrl = String(params?.gatewayUrl || 'http://localhost:4444').trim();
  const gatewayToken = String(params?.gatewayToken || '').trim();
  const command = params?.command;
  const fetchImpl = params?.fetchImpl || fetch;
  const timeoutMs = Number(params?.timeoutMs || DEFAULT_TOOL_TIMEOUT_MS);

  if (!command || command.type !== 'tool') {
    return { ok: false, error: 'Invalid command' };
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {})
  };

  const request = command.tool === 'list_repos'
    ? {
        method: 'GET',
        url: new URL('/v1/index/repos', gatewayUrl),
        body: null
      }
    : {
        method: 'POST',
        url: new URL(`/v1/mcps/context/tools/${encodeURIComponent(command.tool)}/run`, gatewayUrl),
        body: JSON.stringify({ arguments: command.args || {} })
      };

  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers,
      body: request.body,
      signal: AbortSignal.timeout(Math.max(1000, timeoutMs))
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.message || payload?.error || `gateway responded ${response.status}`;
      return { ok: false, status: response.status, error: detail };
    }
    return { ok: true, data: payload?.data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
