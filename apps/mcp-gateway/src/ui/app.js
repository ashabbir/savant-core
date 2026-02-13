function $(id) {
  return document.getElementById(id);
}

const tokenInput = $('tokenInput');
const healthEl = $('health');
const repoSummaryEl = $('repoSummary');
const repoRowsEl = $('repoRows');
const auditRowsEl = $('auditRows');
const indexMsgEl = $('indexMsg');

const repoIdInput = $('repoIdInput');
const repoNameInput = $('repoNameInput');
const repoPathInput = $('repoPathInput');
const agentIdInput = $('agentIdInput');
const auditLimitInput = $('auditLimitInput');

tokenInput.value = localStorage.getItem('mcp_gateway_token') || '';
tokenInput.addEventListener('change', () => {
  localStorage.setItem('mcp_gateway_token', tokenInput.value.trim());
});

function authHeaders() {
  const token = String(tokenInput.value || '').trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function formatTs(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function setMessage(text, isError = false) {
  indexMsgEl.textContent = text || '';
  indexMsgEl.className = isError ? 'bad' : 'muted';
}

async function loadHealth() {
  const body = await fetchJson('/health');
  healthEl.textContent = `OK • ${body.savantContextVersion || 'unknown version'}`;
  healthEl.className = 'ok';
}

function renderRepos(items) {
  repoRowsEl.innerHTML = '';
  for (const repo of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${repo.repo_name || ''}</td>
      <td class="mono">${repo.repo_id || ''}</td>
      <td class="mono">${repo.agent_id || ''}</td>
      <td>${Number(repo.files_indexed || 0)}</td>
      <td>${Number(repo.chunks_indexed || 0)}</td>
      <td>${formatTs(repo.indexed_at)}</td>
      <td class="mono">${repo.source_repo_path || ''}</td>
      <td class="mono">${repo.worktree_path || ''}</td>
      <td><button class="btn danger" data-delete="${repo.repo_name || ''}">Delete</button></td>
    `;
    repoRowsEl.appendChild(tr);
  }
}

async function loadRepos() {
  const body = await fetchJson('/v1/index/repos');
  const repos = Array.isArray(body?.data?.repos) ? body.data.repos : [];
  repoSummaryEl.textContent = `${repos.length} indexed repo(s)`;
  renderRepos(repos);
}

function renderAudit(entries) {
  auditRowsEl.innerHTML = '';
  for (const e of entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatTs(e.at)}</td>
      <td class="mono">${e.tool || ''}</td>
      <td class="mono">${e.repo || ''}</td>
      <td class="${e.ok ? 'ok' : 'bad'}">${e.ok ? 'true' : 'false'}</td>
      <td class="mono">${e.error || ''}</td>
    `;
    auditRowsEl.appendChild(tr);
  }
}

async function loadAudit() {
  const limit = Number(auditLimitInput.value || 100);
  const body = await fetchJson(`/v1/audit?limit=${encodeURIComponent(String(limit))}`);
  renderAudit(Array.isArray(body?.data?.entries) ? body.data.entries : []);
}

async function doIndex() {
  const payload = {
    repo_id: String(repoIdInput.value || '').trim(),
    name: String(repoNameInput.value || '').trim(),
    path: String(repoPathInput.value || '').trim(),
    agent_id: String(agentIdInput.value || '').trim() || 'shared'
  };
  if (!payload.repo_id || !payload.name || !payload.path) {
    setMessage('repo_id, name, and path are required', true);
    return;
  }
  setMessage('Indexing...');
  await fetchJson('/v1/index/repo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  setMessage('Indexed');
}

async function doDelete(repoName) {
  if (!repoName) return;
  if (!window.confirm(`Delete index for ${repoName}?`)) return;
  await fetchJson(`/v1/index/repo/${encodeURIComponent(repoName)}`, { method: 'DELETE' });
}

async function refreshAll() {
  try {
    await loadHealth();
    await loadRepos();
    await loadAudit();
    setMessage('');
  } catch (err) {
    setMessage(String(err.message || err), true);
  }
}

$('refreshBtn').addEventListener('click', () => {
  refreshAll();
});

$('reloadAuditBtn').addEventListener('click', () => {
  loadAudit().catch((err) => setMessage(String(err.message || err), true));
});

$('indexBtn').addEventListener('click', async () => {
  try {
    await doIndex();
    await refreshAll();
  } catch (err) {
    setMessage(String(err.message || err), true);
  }
});

repoRowsEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-delete]');
  if (!button) return;
  const repoName = button.getAttribute('data-delete');
  try {
    await doDelete(repoName);
    await refreshAll();
  } catch (err) {
    setMessage(String(err.message || err), true);
  }
});

refreshAll();
