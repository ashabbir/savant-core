import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost, apiPatch, apiDelete, apiGet } from '../api';
import FilterSection from './FilterSection';
import AgentEditDrawer from './AgentEditDrawer';

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function isMainAgent(agent) {
  const name = String(agent?.name || '').trim().toLowerCase();
  const talonId = String(agent?.talonAgentId || '').trim().toLowerCase();
  return agent?.type === 'main' || !!agent?.isMain || name === 'jarvis' || talonId === 'jarvis';
}

const CREATE_TABS = [
  { key: 'metadata', label: 'Metadata' },
  { key: 'soul', label: 'Soul' },
  { key: 'guardrails', label: 'Guardrails' },
  { key: 'bootstrap', label: 'Bootstrap' },
  { key: 'context', label: 'Context' }
];

function AgentsPage({ agents, onRefresh, collapsed, isLoading = false, isError = false }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createTab, setCreateTab] = useState('metadata');
  const [editingAgentId, setEditingAgentId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [isErrorLocal, setIsErrorLocal] = useState(false);

  const [drafts, setDrafts] = useState({});

  const [viewMode, setViewMode] = useState('cards');

  const modelsQuery = useQuery({
    queryKey: ['llm-models-enabled'],
    queryFn: () => apiGet('/api/llm/models?enabled=true').then(r => r.data),
    staleTime: 5 * 60 * 1000
  });
  const availableModels = modelsQuery.data || [];

  const toCanonicalModel = (m) => {
    const providerType = String(m?.provider?.providerType || '').trim();
    const providerModelId = String(m?.providerModelId || '').trim();
    return providerType && providerModelId ? `${providerType}/${providerModelId}` : '';
  };

  const mainAgent = useMemo(() => (agents || []).find(a => isMainAgent(a)) || null, [agents]);
  const subAgents = useMemo(() => (agents || []).filter(a => !isMainAgent(a)), [agents]);

  const roleOptions = useMemo(() => {
    const roles = new Set();
    subAgents.forEach(a => {
      if (a.role) roles.add(a.role);
    });
    return Array.from(roles).sort();
  }, [subAgents]);

  const modelOptions = useMemo(() => {
    const models = new Set();
    subAgents.forEach(a => {
      const primary = a.defaultModel || a.model;
      if (primary) models.add(primary);
    });
    return Array.from(models).sort();
  }, [subAgents]);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subAgents.filter(a => {
      const primary = a.defaultModel || a.model || '';
      if (roleFilter !== 'all' && (normalizeRole(a.role) || '') !== normalizeRole(roleFilter)) return false;
      if (statusFilter !== 'all' && (a.status || 'idle') !== statusFilter) return false;
      if (modelFilter !== 'all' && primary !== modelFilter) return false;
      if (!q) return true;
      const hay = `${a.name || ''} ${a.talonAgentId || ''} ${a.role || ''} ${primary} ${a.fallbackModel || ''} ${a.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [subAgents, search, roleFilter, statusFilter, modelFilter]);

  const updateDraft = (id, next) => {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...next } }));
  };

  const refreshAgents = () => {
    queryClient.invalidateQueries({ queryKey: ['agents'] });
    onRefresh?.();
  };

  const handleCreate = async (payload) => {
    setMsg(null); setIsErrorLocal(false);
    try {
      const res = await apiPost('/api/agents', payload);
      const created = res?.data;
      if (created?.id) {
        queryClient.setQueryData(['agents'], (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          return [...list.filter((a) => a?.id !== created.id), created];
        });
      }
      setCreateOpen(false);
      setCreateTab('metadata');
      setDrafts(prev => ({ ...prev, create: {} }));
      refreshAgents();
      setMsg('Agent created');
    } catch (e) {
      setIsErrorLocal(true);
      setMsg(e.message || 'Create failed');
    }
  };

  const handleUpdate = async (id, payload) => {
    setMsg(null); setIsErrorLocal(false);
    try {
      const res = await apiPatch(`/api/agents/${id}`, payload);
      const updated = res?.data;
      if (updated?.id) {
        queryClient.setQueryData(['agents'], (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          return list.map((a) => (a?.id === updated.id ? { ...a, ...updated } : a));
        });
      }
      setEditingAgentId(null);
      refreshAgents();
      setMsg('Agent updated');
    } catch (e) {
      setIsErrorLocal(true);
      setMsg(e.message || 'Update failed');
    }
  };

  const handleDelete = async (agent) => {
    if (!agent) return;
    if (!window.confirm(`Delete agent ${agent.name}?`)) return;
    setMsg(null); setIsErrorLocal(false);
    try {
      await apiDelete(`/api/agents/${agent.id}`);
      queryClient.setQueryData(['agents'], (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.filter((a) => a?.id !== agent.id);
      });
      refreshAgents();
      setMsg('Agent deleted');
    } catch (e) {
      setIsErrorLocal(true);
      setMsg(e.message || 'Delete failed');
    }
  };

  const createDraft = drafts.create || {};
  const editingAgent = (agents || []).find(a => a.id === editingAgentId);

  return (
    <div className={(collapsed ? 'layout leftCollapsed' : 'layout') + (editingAgentId ? ' withRight' : '')}>
      <aside className={collapsed ? "filters collapsed" : "filters"}>
        <div className="filtersTop">
          <div className="filtersTopTitle">Subagents</div>
        </div>
        <FilterSection title="Search" initialOpen={true}>
          <div className="filtersInputRow">
            <input
              className="detailsInput"
              placeholder="Search subagents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </FilterSection>
        <FilterSection title="Role" initialOpen={true}>
          <div className="filtersInputRow">
            <select
              className="detailsInput"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All roles</option>
              {roleOptions.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        </FilterSection>
        <FilterSection title="Status" initialOpen={true}>
          <div className="filtersInputRow">
            <select
              className="detailsInput"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All status</option>
              <option value="idle">Idle</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        </FilterSection>
        <FilterSection title="Model">
          <div className="filtersInputRow">
            <select
              className="detailsInput"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <option value="all">All models</option>
              {modelOptions.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
        </FilterSection>
      </aside>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 20 }}>Loading agents…</div>
        ) : isError ? (
          <div style={{ padding: 20, color: '#ef4444' }}>Error loading agents.</div>
        ) : (
          <>
            <div className="pageHeader">
              <h1>Subagents</h1>
              <div className="row" style={{ gap: 10 }}>
                <button
                  className="tiny secondary"
                  onClick={() => setViewMode(v => v === 'table' ? 'cards' : 'table')}
                  title="Toggle view"
                  style={{ padding: '6px 10px', height: 32 }}
                >
                  {viewMode === 'table' ? '▦ Cards' : '≡ Table'}
                </button>
                <button className="primary" onClick={() => setCreateOpen(true)}>+ New Subagent</button>
              </div>
            </div>

            <div className="pageContent">
              {msg ? (
                <div className={isErrorLocal ? 'callout error' : 'callout success'} style={{ marginTop: 0, marginBottom: 14 }}>{msg}</div>
              ) : null}

              {mainAgent && (
                <div className="card" style={{ marginTop: 0, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.7 }}>Main Agent</div>
                      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{mainAgent.name}</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className="badge">ID: {mainAgent.talonAgentId || 'jarvis'}</span>
                        <span className="badge">Model: {mainAgent.defaultModel || mainAgent.model || '—'}</span>
                      </div>
                    </div>
                    <button className="tiny secondary" onClick={() => setEditingAgentId(mainAgent.id)}>Edit Main Agent</button>
                  </div>
                </div>
              )}

              {viewMode === 'table' ? (
                <div className="card" style={{ marginTop: 0 }}>
                  <div className="agentsTableWrap">
                    <table className="agentsTable">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Talon ID</th>
                          <th>Role</th>
                          <th>Primary Model</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(filteredAgents || []).map(agent => (
                          <tr key={agent.id}>
                            <td><strong>{agent.name}</strong></td>
                            <td className="mono" style={{ opacity: 0.75 }}>{agent.talonAgentId || '—'}</td>
                            <td>{agent.role || '—'}</td>
                            <td>{agent.defaultModel || agent.model || '—'}</td>
                            <td>{agent.status || 'idle'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="tiny secondary" onClick={() => setEditingAgentId(agent.id)}>Edit</button>
                              <button className="tiny" onClick={() => handleDelete(agent)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                        {(filteredAgents || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="agentsEmpty">No agents found</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="projectGrid entityCardGrid">
                  {(filteredAgents || []).map(agent => {
                    const statusColor = agent.status === 'active' ? '#22c55e' : agent.status === 'blocked' ? '#ef4444' : '#94a3b8';
                    return (
                      <div
                        key={agent.id}
                        className="projectCard entityCard"
                        onClick={() => setEditingAgentId(agent.id)}
                        style={{ borderLeft: `6px solid ${statusColor}` }}
                      >
                        <div className="projectCardContent">
                          <div className="projectCardTop">
                            <span className="dot" style={{ background: statusColor }} />
                            <span className="projectCardCode">{agent.talonAgentId || 'NO-ID'}</span>
                          </div>
                          <div className="projectCardName" style={{ color: statusColor }}>{agent.name}</div>
                          <div className="taskBadges compact" style={{ marginTop: 8 }}>
                            <span className="badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}>{agent.role || '—'}</span>
                            <span className="badge" style={{ backgroundColor: 'rgba(167, 139, 250, 0.1)', color: '#a78bfa', border: '1px solid rgba(167, 139, 250, 0.2)' }}>Primary: {agent.defaultModel || agent.model || '—'}</span>
                            {agent.fallbackModel ? (
                              <span className="badge" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' }}>Fallback: {agent.fallbackModel}</span>
                            ) : null}
                          </div>
                        </div>
                        <button
                          className="tiny projectSettingsBtn"
                          onClick={(e) => { e.stopPropagation(); setEditingAgentId(agent.id); }}
                          title="Edit Agent"
                        >
                          ⚙
                        </button>
                      </div>
                    );
                  })}
                  {(filteredAgents || []).length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, opacity: 0.5 }}>No agents found</div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {editingAgentId ? (
        <div className="detailsOverlay">
          <div className="detailsBackdrop" onClick={() => setEditingAgentId(null)} />
          <AgentEditDrawer
            agent={editingAgent}
            onUpdate={handleUpdate}
            onDelete={(agent) => {
              handleDelete(agent);
              setEditingAgentId(null);
            }}
            onClose={() => setEditingAgentId(null)}
            drafts={drafts}
            setDrafts={setDrafts}
          />
        </div>
      ) : null}

      {createOpen ? (
        <div className="modalBackdrop">
          <div className="card modal premiumModal">
            <div className="modalHeader">
              <div>
                <h2>Create Subagent</h2>
                <p className="modalSubtitle">Add a new subagent under Jarvis</p>
              </div>
              <button className="closeBtn" onClick={() => { setCreateOpen(false); setCreateTab('metadata'); }}>✕</button>
            </div>
            <div className="detailsTabs" style={{ marginBottom: 16 }}>
              {CREATE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`tabBtn ${createTab === tab.key ? 'active' : ''}`}
                  onClick={() => setCreateTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="modalBody">
              {createTab === 'metadata' ? (
                <>
                  <div className="inputGroup">
                    <label>Name</label>
                    <input
                      className="detailsInput"
                      value={createDraft.name || ''}
                      onChange={(e) => updateDraft('create', { name: e.target.value })}
                    />
                  </div>
                  <div className="inputGroup">
                    <label>Role</label>
                    <input
                      className="detailsInput"
                      value={createDraft.role || ''}
                      onChange={(e) => updateDraft('create', { role: e.target.value })}
                    />
                  </div>
                  <div className="inputGroup">
                    <label>Primary Model</label>
                    <select
                      className="detailsInput"
                      value={createDraft.defaultModel || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const modelMatch = availableModels.find((m) => toCanonicalModel(m) === val) || null;
                        updateDraft('create', {
                          model: val,
                          defaultModel: val,
                          modelId: modelMatch?.id || null
                        });
                      }}
                    >
                      <option value="">Select primary model</option>
                      {availableModels.map(m => (
                        <option key={m.id} value={toCanonicalModel(m)}>
                          {m.providerModelId} ({m.provider.name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="inputGroup">
                    <label>Fallback Model</label>
                    <select
                      className="detailsInput"
                      value={createDraft.fallbackModel || ''}
                      onChange={(e) => updateDraft('create', { fallbackModel: e.target.value })}
                    >
                      <option value="">None</option>
                      {availableModels.map(m => (
                        <option key={m.id} value={toCanonicalModel(m)}>
                          {m.providerModelId} ({m.provider.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
              {createTab === 'soul' ? (
                <div className="inputGroup">
                  <label>SOUL</label>
                  <textarea
                    className="detailsTextarea"
                    rows={8}
                    value={createDraft.soul || ''}
                    onChange={(e) => updateDraft('create', { soul: e.target.value })}
                  />
                </div>
              ) : null}
              {createTab === 'guardrails' ? (
                <div className="inputGroup">
                  <label>Guardrails</label>
                  <textarea
                    className="detailsTextarea"
                    rows={8}
                    value={createDraft.guardrails || ''}
                    onChange={(e) => updateDraft('create', { guardrails: e.target.value })}
                  />
                </div>
              ) : null}
              {createTab === 'bootstrap' ? (
                <div className="inputGroup">
                  <label>Bootstrap</label>
                  <textarea
                    className="detailsTextarea"
                    rows={6}
                    value={createDraft.bootstrap || ''}
                    onChange={(e) => updateDraft('create', { bootstrap: e.target.value })}
                    placeholder="npm install && npm run dev"
                  />
                </div>
              ) : null}
              {createTab === 'context' ? (
                <div className="inputGroup">
                  <label>Context (EVERYONE)</label>
                  <textarea
                    className="detailsTextarea"
                    rows={8}
                    value={createDraft.everyone || ''}
                    onChange={(e) => updateDraft('create', { everyone: e.target.value })}
                  />
                </div>
              ) : null}
            </div>
            <div className="modalActions">
              <button className="secondary" onClick={() => { setCreateOpen(false); setCreateTab('metadata'); }}>Cancel</button>
              <button
                className="primary"
                disabled={!createDraft.name || !createDraft.defaultModel}
                onClick={() => handleCreate({
                  name: createDraft.name || '',
                  role: createDraft.role || '',
                  model: createDraft.defaultModel || createDraft.model || '',
                  modelId: createDraft.modelId,
                  defaultModel: createDraft.defaultModel || createDraft.model || '',
                  fallbackModel: createDraft.fallbackModel || '',
                  soul: createDraft.soul || '',
                  guardrails: createDraft.guardrails || '',
                  bootstrap: createDraft.bootstrap || '',
                  everyone: createDraft.everyone || ''
                })}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AgentsPage;
