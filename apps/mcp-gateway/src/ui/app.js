function $(id) {
  return document.getElementById(id);
}

const state = {
  mcps: [],
  selectedMcpId: '',
  tools: []
};

const tokenInput = $('tokenInput');
const healthEl = $('health');
const mcpListEl = $('mcpList');
const mcpCountEl = $('mcpCount');
const mcpEmptyEl = $('mcpEmpty');
const selectedMcpTitleEl = $('selectedMcpTitle');
const dashboardSummaryEl = $('dashboardSummary');
const dashboardAuditRowsEl = $('dashboardAuditRows');
const dashboardMsgEl = $('dashboardMsg');
const deleteMcpBtn = $('deleteMcpBtn');

const repoIdInput = $('repoIdInput');
const repoNameInput = $('repoNameInput');
const repoPathInput = $('repoPathInput');
const agentIdInput = $('agentIdInput');
const indexMsgEl = $('indexMsg');

const toolsListEl = $('toolsList');
const toolSelectEl = $('toolSelect');
const toolArgsInputEl = $('toolArgsInput');
const runMsgEl = $('runMsg');
const runResultEl = $('runResult');
const connectBaseUrlEl = $('connectBaseUrl');
const connectMcpIdEl = $('connectMcpId');
const connectCmdListEl = $('connectCmdList');
const connectCmdToolsEl = $('connectCmdTools');
const connectCmdSearchEl = $('connectCmdSearch');
const connectCmdReadEl = $('connectCmdRead');

tokenInput.value = localStorage.getItem('mcp_gateway_token') || '';
tokenInput.addEventListener('change', () => {
  localStorage.setItem('mcp_gateway_token', tokenInput.value.trim());
  renderConnectInstructions();
});

function authHeaders() {
  const token = String(tokenInput.value || '').trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function setMsg(el, text, isError = false) {
  el.textContent = text || '';
  el.className = isError ? 'bad' : 'muted';
}

function renderConnectInstructions() {
  const baseUrl = window.location.origin || 'http://localhost:4444';
  const mcpId = state.selectedMcpId || '<mcp_id>';
  const token = String(tokenInput.value || '').trim();
  const authSegment = token ? ` -H 'Authorization: Bearer ${token}'` : '';

  connectBaseUrlEl.textContent = baseUrl;
  connectMcpIdEl.textContent = mcpId;
  connectCmdListEl.textContent = `curl -s${authSegment} '${baseUrl}/v1/mcps'`;
  connectCmdToolsEl.textContent = `curl -s${authSegment} '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools'`;
  connectCmdSearchEl.textContent =
`curl -s${authSegment} -H 'Content-Type: application/json' \\
  -X POST '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools/memory_search/run' \\
  -d '{"arguments":{"query":"auth flow","limit":5}}'`;
  connectCmdReadEl.textContent =
`curl -s${authSegment} -H 'Content-Type: application/json' \\
  -X POST '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools/memory_read/run' \\
  -d '{"arguments":{"path":"memory_bank/README.md"}}'`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function loadHealth() {
  const data = await fetchJson('/health');
  healthEl.textContent = `Gateway healthy • ${data.savantContextVersion || 'unknown version'}`;
  healthEl.className = 'ok';
}

function renderMcpList() {
  mcpListEl.innerHTML = '';
  mcpCountEl.textContent = String(state.mcps.length);
  mcpEmptyEl.style.display = state.mcps.length ? 'none' : 'block';
  for (const mcp of state.mcps) {
    const button = document.createElement('button');
    button.className = `mcpItem${state.selectedMcpId === mcp.mcp_id ? ' active' : ''}`;
    button.setAttribute('data-mcp-id', mcp.mcp_id);
    button.innerHTML = `
      <div class="mcpItemName">${mcp.mcp_name}</div>
      <div class="mcpItemMeta">files=${Number(mcp.files_indexed || 0)} chunks=${Number(mcp.chunks_indexed || 0)}</div>
      <div class="mcpItemMeta">${formatTime(mcp.indexed_at)}</div>
    `;
    mcpListEl.appendChild(button);
  }
}

function renderDashboard(data) {
  dashboardSummaryEl.innerHTML = '';
  const metrics = [
    { label: 'MCP', value: data.mcp_name },
    { label: 'Repo ID', value: data.repo_id },
    { label: 'Agent', value: data.agent_id },
    { label: 'Files', value: String(data.files_indexed) },
    { label: 'Chunks', value: String(data.chunks_indexed) },
    { label: 'Last Indexed', value: formatTime(data.indexed_at) },
    { label: 'Source', value: data.source_repo_path || '' },
    { label: 'Worktree', value: data.worktree_path || '' }
  ];

  for (const item of metrics) {
    const el = document.createElement('div');
    el.className = 'metric';
    el.innerHTML = `<div class="metricLabel">${item.label}</div><div class="metricValue">${item.value || '—'}</div>`;
    dashboardSummaryEl.appendChild(el);
  }

  dashboardAuditRowsEl.innerHTML = '';
  const rows = Array.isArray(data?.dashboard?.recent_audit) ? data.dashboard.recent_audit : [];
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatTime(row.at)}</td>
      <td class="mono">${row.tool || ''}</td>
      <td class="${row.ok ? 'ok' : 'bad'}">${row.ok ? 'true' : 'false'}</td>
      <td class="mono">${row.error || ''}</td>
    `;
    dashboardAuditRowsEl.appendChild(tr);
  }
}

function renderTools() {
  toolsListEl.innerHTML = '';
  toolSelectEl.innerHTML = '';
  for (const tool of state.tools) {
    const card = document.createElement('div');
    card.className = 'toolCard';
    card.innerHTML = `
      <div class="toolName">${tool.name}</div>
      <div class="toolDesc">${tool.description || ''}</div>
      <pre class="toolSchema mono">${JSON.stringify(tool.inputSchema || {}, null, 2)}</pre>
    `;
    toolsListEl.appendChild(card);

    const option = document.createElement('option');
    option.value = tool.name;
    option.textContent = tool.name;
    toolSelectEl.appendChild(option);
  }
}

function selectedTool() {
  const current = String(toolSelectEl.value || '');
  return state.tools.find((tool) => tool.name === current) || null;
}

function fillToolDefaults() {
  const tool = selectedTool();
  if (!tool) return;
  toolArgsInputEl.value = JSON.stringify(tool.defaults || {}, null, 2);
}

async function loadMcps() {
  const body = await fetchJson('/v1/mcps');
  state.mcps = Array.isArray(body?.data?.mcps) ? body.data.mcps : [];
  if (!state.selectedMcpId && state.mcps.length) {
    state.selectedMcpId = state.mcps[0].mcp_id;
  }
  if (state.selectedMcpId && !state.mcps.some((mcp) => mcp.mcp_id === state.selectedMcpId)) {
    state.selectedMcpId = state.mcps[0]?.mcp_id || '';
  }
  renderMcpList();
}

async function loadSelectedMcp() {
  const mcpId = state.selectedMcpId;
  if (!mcpId) {
    selectedMcpTitleEl.textContent = 'Select an MCP';
    dashboardSummaryEl.innerHTML = '';
    toolsListEl.innerHTML = '';
    toolSelectEl.innerHTML = '';
    dashboardAuditRowsEl.innerHTML = '';
    deleteMcpBtn.disabled = true;
    renderConnectInstructions();
    return;
  }

  const mcp = await fetchJson(`/v1/mcps/${encodeURIComponent(mcpId)}`);
  selectedMcpTitleEl.textContent = mcp?.data?.mcp_name || mcpId;
  renderDashboard(mcp.data || {});
  deleteMcpBtn.disabled = false;

  const tools = await fetchJson(`/v1/mcps/${encodeURIComponent(mcpId)}/tools`);
  state.tools = Array.isArray(tools?.data?.tools) ? tools.data.tools : [];
  renderTools();
  fillToolDefaults();
  renderConnectInstructions();
}

async function refreshAll() {
  try {
    await loadHealth();
    await loadMcps();
    await loadSelectedMcp();
    setMsg(indexMsgEl, '');
    setMsg(dashboardMsgEl, '');
    setMsg(runMsgEl, '');
  } catch (error) {
    setMsg(runMsgEl, String(error?.message || error), true);
  }
}

async function runTool() {
  if (!state.selectedMcpId) {
    setMsg(runMsgEl, 'Select an MCP first', true);
    return;
  }
  const tool = selectedTool();
  if (!tool) {
    setMsg(runMsgEl, 'Select a tool', true);
    return;
  }

  let args = {};
  try {
    args = JSON.parse(String(toolArgsInputEl.value || '{}'));
  } catch {
    setMsg(runMsgEl, 'Invalid JSON arguments', true);
    return;
  }

  try {
    setMsg(runMsgEl, 'Running...');
    const body = await fetchJson(`/v1/mcps/${encodeURIComponent(state.selectedMcpId)}/tools/${encodeURIComponent(tool.name)}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args })
    });
    runResultEl.textContent = JSON.stringify(body, null, 2);
    setMsg(runMsgEl, 'Done');
  } catch (error) {
    setMsg(runMsgEl, String(error?.message || error), true);
  }
}

async function createIndex() {
  const payload = {
    repo_id: String(repoIdInput.value || '').trim(),
    name: String(repoNameInput.value || '').trim(),
    path: String(repoPathInput.value || '').trim(),
    agent_id: String(agentIdInput.value || '').trim() || 'shared'
  };
  if (!payload.repo_id || !payload.name || !payload.path) {
    setMsg(indexMsgEl, 'repo_id, name, and path are required', true);
    return;
  }

  try {
    setMsg(indexMsgEl, 'Indexing...');
    await fetchJson('/v1/index/repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    state.selectedMcpId = payload.name;
    setMsg(indexMsgEl, 'Indexed');
    await refreshAll();
  } catch (error) {
    setMsg(indexMsgEl, String(error?.message || error), true);
  }
}

async function deleteSelectedMcp() {
  if (!state.selectedMcpId) return;
  const confirmed = window.confirm(`Delete MCP index "${state.selectedMcpId}"?`);
  if (!confirmed) return;
  try {
    setMsg(dashboardMsgEl, 'Deleting...');
    await fetchJson(`/v1/index/repo/${encodeURIComponent(state.selectedMcpId)}`, { method: 'DELETE' });
    setMsg(dashboardMsgEl, 'Deleted');
    state.selectedMcpId = '';
    await refreshAll();
  } catch (error) {
    setMsg(dashboardMsgEl, String(error?.message || error), true);
  }
}

function activateTab(tabName) {
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.panel').forEach((el) => {
    el.classList.toggle('active', el.id === `tab-${tabName}`);
  });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.getAttribute('data-tab')));
});

$('refreshBtn').addEventListener('click', refreshAll);
$('indexBtn').addEventListener('click', createIndex);
$('deleteMcpBtn').addEventListener('click', deleteSelectedMcp);
$('runPresetBtn').addEventListener('click', fillToolDefaults);
$('runToolBtn').addEventListener('click', runTool);
$('toolSelect').addEventListener('change', fillToolDefaults);

mcpListEl.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-mcp-id]');
  if (!target) return;
  state.selectedMcpId = target.getAttribute('data-mcp-id');
  renderMcpList();
  await loadSelectedMcp();
});

refreshAll();
renderConnectInstructions();
