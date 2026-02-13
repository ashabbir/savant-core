function $(id) {
  return document.getElementById(id);
}

function initHotReload() {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') return;
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
  const source = new EventSource('/ui/__hmr');
  source.addEventListener('reload', () => {
    window.location.reload();
  });
}

const state = {
  mcps: [],
  selectedMcpId: '',
  tools: [],
  repos: [],
  abilities: []
};

const tokenInput = $('tokenInput');
const healthEl = $('health');
const mcpListEl = $('mcpList');
const mcpCountEl = $('mcpCount');
const mcpEmptyEl = $('mcpEmpty');
const selectedMcpTitleEl = $('selectedMcpTitle');
const dashboardSummaryEl = $('dashboardSummary');
const dashboardAuditRowsEl = $('dashboardAuditRows');
const dashboardRepoRowsEl = $('dashboardRepoRows');
const dashboardMsgEl = $('dashboardMsg');
const contextRepoCardEl = $('contextRepoCard');
const contextIndexCardEl = $('contextIndexCard');
const abilitiesBlocksCardEl = $('abilitiesBlocksCard');
const abilitiesCreateCardEl = $('abilitiesCreateCard');
const abilitiesRowsEl = $('abilitiesRows');
const abilityTypeInput = $('abilityTypeInput');
const abilityPriorityInput = $('abilityPriorityInput');
const abilityIdInput = $('abilityIdInput');
const abilityDirInput = $('abilityDirInput');
const abilityTagsInput = $('abilityTagsInput');
const abilityNameInput = $('abilityNameInput');
const abilityBodyInput = $('abilityBodyInput');
const abilityMsgEl = $('abilityMsg');

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
const connectCmdCodeSearchEl = $('connectCmdCodeSearch');
const connectCmdCodeReadEl = $('connectCmdCodeRead');

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
  const mcpId = state.selectedMcpId || 'context';
  const repoName = state.repos[0]?.repo_name || '<repo_name>';
  const token = String(tokenInput.value || '').trim();
  const authSegment = token ? ` -H 'Authorization: Bearer ${token}'` : '';

  connectBaseUrlEl.textContent = baseUrl;
  connectMcpIdEl.textContent = mcpId;
  connectCmdListEl.textContent = `curl -s${authSegment} '${baseUrl}/v1/mcps'`;
  connectCmdToolsEl.textContent = `curl -s${authSegment} '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools'`;
  const searchTool = mcpId === 'abilities' ? 'resolve_abilities' : 'memory_search';
  const readTool = mcpId === 'abilities' ? 'list_ability_blocks' : 'memory_read';
  const codeSearchTool = mcpId === 'abilities' ? 'add_ability_block' : 'code_search';
  const codeReadTool = mcpId === 'abilities' ? 'list_rules' : 'code_read';

  connectCmdSearchEl.textContent =
`curl -s${authSegment} -H 'Content-Type: application/json' \\
  -X POST '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools/${searchTool}/run' \\
  -d '${mcpId === 'abilities' ? '{"arguments":{"persona":"engineer","tags":["backend"]}}' : `{"arguments":{"repo":"${repoName}","query":"auth flow","limit":5}}`}'`;
  connectCmdReadEl.textContent =
`curl -s${authSegment} -H 'Content-Type: application/json' \\
  -X POST '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools/${readTool}/run' \\
  -d '${mcpId === 'abilities' ? '{"arguments":{"type":"rule"}}' : `{"arguments":{"repo":"${repoName}","path":"memory_bank/README.md"}}`}'`;
  connectCmdCodeSearchEl.textContent =
`curl -s${authSegment} -H 'Content-Type: application/json' \\
  -X POST '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools/${codeSearchTool}/run' \\
  -d '${mcpId === 'abilities' ? '{"arguments":{"type":"rule","id":"rule.backend.base","relativeDir":"backend","priority":100,"tags":["backend"],"body":"# Backend rule"}}' : `{"arguments":{"repo":"${repoName}","query":"TODO","limit":10}}`}'`;
  connectCmdCodeReadEl.textContent =
`curl -s${authSegment} -H 'Content-Type: application/json' \\
  -X POST '${baseUrl}/v1/mcps/${encodeURIComponent(mcpId)}/tools/${codeReadTool}/run' \\
  -d '${mcpId === 'abilities' ? '{"arguments":{}}' : `{"arguments":{"repo":"${repoName}","path":"README.md"}}`}'`;
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
      <div class="mcpItemMeta">repos=${Number(mcp.repo_count || 0)} files=${Number(mcp.files_indexed || 0)} chunks=${Number(mcp.chunks_indexed || 0)}</div>
      <div class="mcpItemMeta">${formatTime(mcp.indexed_at)}</div>
    `;
    mcpListEl.appendChild(button);
  }
}

function renderDashboard(data) {
  const isAbilities = state.selectedMcpId === 'abilities';
  contextRepoCardEl.style.display = isAbilities ? 'none' : '';
  contextIndexCardEl.style.display = isAbilities ? 'none' : '';
  abilitiesBlocksCardEl.style.display = isAbilities ? '' : 'none';
  abilitiesCreateCardEl.style.display = isAbilities ? '' : 'none';

  dashboardSummaryEl.innerHTML = '';
  const metrics = [
    { label: 'MCP', value: data.mcp_name },
    { label: 'Status', value: data.status || 'active' },
    { label: 'Repos', value: String(data.repo_count || 0) },
    { label: 'Files', value: String(data.files_indexed || 0) },
    { label: 'Chunks', value: String(data.chunks_indexed || 0) },
    { label: 'Last Indexed', value: formatTime(data.indexed_at) },
    { label: 'Description', value: data.description || '' }
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

  if (isAbilities) {
    abilitiesRowsEl.innerHTML = '';
    const blocks = Array.isArray(data?.abilities?.blocks) ? data.abilities.blocks : [];
    for (const block of blocks) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${block.id || ''}</td>
        <td class="mono">${block.type || ''}</td>
        <td>${Number(block.priority || 0)}</td>
        <td class="mono">${Array.isArray(block.tags) ? block.tags.join(', ') : ''}</td>
        <td class="mono">${block.path || ''}</td>
        <td>${formatTime(block.updated_at)}</td>
      `;
      abilitiesRowsEl.appendChild(tr);
    }
  } else {
    dashboardRepoRowsEl.innerHTML = '';
    const repos = Array.isArray(data?.repos) ? data.repos : [];
    for (const repo of repos) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${repo.repo_name || ''}</td>
        <td class="mono">${repo.repo_id || ''}</td>
        <td class="mono">${repo.agent_id || ''}</td>
        <td>${Number(repo.files_indexed || 0)}</td>
        <td>${Number(repo.chunks_indexed || 0)}</td>
        <td>${formatTime(repo.indexed_at)}</td>
        <td class="mono">${repo.source_repo_path || ''}</td>
        <td><button class="btn danger" data-delete-repo="${repo.repo_name || ''}">Delete</button></td>
      `;
      dashboardRepoRowsEl.appendChild(tr);
    }
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
  const defaults = { ...(tool.defaults || {}) };
  if (!defaults.repo && state.repos[0]?.repo_name) defaults.repo = state.repos[0].repo_name;
  toolArgsInputEl.value = JSON.stringify(defaults, null, 2);
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
    dashboardRepoRowsEl.innerHTML = '';
    state.repos = [];
    renderConnectInstructions();
    return;
  }

  const mcp = await fetchJson(`/v1/mcps/${encodeURIComponent(mcpId)}`);
  selectedMcpTitleEl.textContent = mcp?.data?.mcp_name || mcpId;
  state.repos = Array.isArray(mcp?.data?.repos) ? mcp.data.repos : [];
  state.abilities = Array.isArray(mcp?.data?.abilities?.blocks) ? mcp.data.abilities.blocks : [];
  renderDashboard(mcp.data || {});

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
    state.selectedMcpId = 'context';
    setMsg(indexMsgEl, 'Indexed');
    await refreshAll();
  } catch (error) {
    setMsg(indexMsgEl, String(error?.message || error), true);
  }
}

async function addAbilityBlockFromForm() {
  const payload = {
    type: String(abilityTypeInput.value || '').trim(),
    id: String(abilityIdInput.value || '').trim(),
    relativeDir: String(abilityDirInput.value || '').trim(),
    tags: String(abilityTagsInput.value || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    priority: Number(abilityPriorityInput.value || 0),
    name: String(abilityNameInput.value || '').trim(),
    body: String(abilityBodyInput.value || '').trim()
  };

  if (!payload.type || !payload.id || !payload.body || !Number.isFinite(payload.priority)) {
    setMsg(abilityMsgEl, 'type, id, priority, and body are required', true);
    return;
  }

  try {
    setMsg(abilityMsgEl, 'Adding...');
    await fetchJson('/v1/mcps/abilities/tools/add_ability_block/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: payload })
    });
    setMsg(abilityMsgEl, 'Added');
    await loadSelectedMcp();
  } catch (error) {
    setMsg(abilityMsgEl, String(error?.message || error), true);
  }
}

async function deleteRepo(repoName) {
  const target = String(repoName || '').trim();
  if (!target) return;
  const confirmed = window.confirm(`Delete indexed repository "${target}" from Context MCP?`);
  if (!confirmed) return;
  try {
    setMsg(dashboardMsgEl, 'Deleting...');
    await fetchJson(`/v1/index/repo/${encodeURIComponent(target)}`, { method: 'DELETE' });
    setMsg(dashboardMsgEl, 'Deleted');
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
$('runPresetBtn').addEventListener('click', fillToolDefaults);
$('runToolBtn').addEventListener('click', runTool);
$('toolSelect').addEventListener('change', fillToolDefaults);
$('abilityAddBtn').addEventListener('click', addAbilityBlockFromForm);

mcpListEl.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-mcp-id]');
  if (!target) return;
  state.selectedMcpId = target.getAttribute('data-mcp-id');
  renderMcpList();
  await loadSelectedMcp();
});

dashboardRepoRowsEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-delete-repo]');
  if (!button) return;
  await deleteRepo(button.getAttribute('data-delete-repo'));
});

refreshAll();
renderConnectInstructions();
initHotReload();
