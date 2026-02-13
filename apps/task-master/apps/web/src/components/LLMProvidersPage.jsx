import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';
import FilterSection from './FilterSection';

function StatusIndicator({ connected }) {
  const color = connected ? '#22c55e' : '#94a3b8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {connected ? 'Connected' : 'Disconnected'}
    </div>
  );
}

function ProviderDiscoveryPanel({ providerId, providerName }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['talon-models'],
    queryFn: () => apiGet('/api/talon/providers/models').then(res => res.data)
  });

  const syncMutation = useMutation({
    mutationFn: () => apiPost('/api/talon/providers/sync').then(res => res.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['llm-models-enabled'] });
      alert(`Synced ${data.syncedCount} models to registry!`);
    },
    onError: (err) => alert(`Sync failed: ${err.message}`)
  });

  const normalizeProvider = (v) => {
    const raw = String(v || '').toLowerCase();
    if (raw.startsWith('google')) return 'google';
    return raw;
  };

  if (query.isLoading) return <div style={{ opacity: 0.6, fontSize: 12 }}>Scanning {providerName} models...</div>;
  const allModels = query.data?.data || [];
  const target = normalizeProvider(providerId);
  const models = allModels.filter((m) => normalizeProvider(m.provider) === target);

  if (models.length === 0) {
    return <div style={{ opacity: 0.5, marginTop: 8, fontSize: 12 }}>No discovered models under this provider yet.</div>;
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 12, opacity: 0.8 }}>Discovered Models</strong>
        <button className="secondary small" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          {syncMutation.isPending ? 'Syncing...' : 'Sync to Registry'}
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="agentsTable">
          <thead>
            <tr>
              <th>Model ID</th>
              <th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m, i) => (
              <tr key={`${m.provider}-${m.id}-${i}`}>
                <td className="mono" style={{ fontSize: 12 }}>{m.id}</td>
                <td style={{ textAlign: 'right' }}><span className="badge success">Available</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LLMProvidersPage({ collapsed }) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('cards');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [removedProviders, setRemovedProviders] = useState([]);

  const [isAdding, setIsAdding] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  const [editingProviderId, setEditingProviderId] = useState(null);
  const [activeTab, setActiveTab] = useState('metadata');
  const [authInput, setAuthInput] = useState({ apiKey: '', baseUrl: '' });

  const providersQuery = useQuery({
    queryKey: ['talon-providers'],
    queryFn: () => apiGet('/api/talon/auth/providers').then(res => res.data)
  });

  const getBackendProviderId = (providerId) => {
    const raw = String(providerId || '').trim().toLowerCase();
    if (raw === 'google') return 'google-gemini-cli';
    if (raw === 'google-api') return 'google';
    return raw;
  };

  const connectMutation = useMutation({
    mutationFn: async (provider) => {
      const res = await apiPost('/api/talon/auth/start', { provider });
      return res.data;
    },
    onSuccess: (data) => {
      const authUrl = data?.data?.authUrl || data?.authUrl;
      if (authUrl) {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open(authUrl, 'Connect Provider', `width=${width},height=${height},left=${left},top=${top}`);
      }
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['talon-providers'] }), 4000);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['talon-models'] }), 4000);
      setIsAdding(false);
      setSelectedProviderId(null);
      setEditingProviderId(null);
      const target = editingProviderId || selectedProviderId;
      if (target) {
        const canonical = getBackendProviderId(target);
        setRemovedProviders((prev) => prev.filter((id) => id !== canonical));
      }
    }
  });

  const exchangeMutation = useMutation({
    mutationFn: (data) => apiPost('/api/talon/auth/exchange', data).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talon-providers'] });
      queryClient.invalidateQueries({ queryKey: ['talon-models'] });
      const target = editingProviderId || selectedProviderId;
      if (target) {
        const canonical = getBackendProviderId(target);
        setRemovedProviders((prev) => prev.filter((id) => id !== canonical));
      }
      alert('Connected successfully!');
      setIsAdding(false);
      setSelectedProviderId(null);
      setEditingProviderId(null);
      setAuthInput({ apiKey: '', baseUrl: '' });
    },
    onError: (err) => alert(`Exchange failed: ${err.message}`)
  });

  const deleteProviderMutation = useMutation({
    mutationFn: (provider) => apiPost('/api/talon/auth/remove', { provider }).then(res => res.data),
    onSuccess: (_data, provider) => {
      queryClient.setQueryData(['talon-providers'], (prev) => {
        if (!prev || typeof prev !== 'object') return prev;
        const next = { ...prev };
        if (provider && next[provider]) {
          next[provider] = {
            ...next[provider],
            connected: false,
            hasOauth: false,
            hasApiKey: false,
            profileCount: 0,
            email: undefined,
            baseUrl: undefined,
          };
        }
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['talon-providers'] });
      queryClient.invalidateQueries({ queryKey: ['talon-models'] });
      queryClient.invalidateQueries({ queryKey: ['llm-models-enabled'] });
      setRemovedProviders((prev) => (prev.includes(provider) ? prev : [...prev, provider]));
      alert('Provider deleted.');
      setEditingProviderId(null);
    },
    onError: (err) => {
      const inUseBy = err?.payload?.details?.inUseBy;
      if (Array.isArray(inUseBy) && inUseBy.length) {
        const names = inUseBy.map((a) => a?.name || a?.talonAgentId || 'unknown').join(', ');
        alert(`Cannot delete provider. It is used by: ${names}`);
        return;
      }
      alert(`Delete failed: ${err.message}`);
    }
  });

  const providerList = [
    { id: 'google', name: 'Google Gemini (OAuth)', type: 'oauth', description: 'Connect via Google OAuth for Antigravity & Gemini 1.5.' },
    { id: 'openai-codex', name: 'OpenAI Codex (OAuth)', type: 'oauth', description: 'Connect using ChatGPT/Codex OAuth subscription auth.' },
    { id: 'google-api', name: 'Google Gemini (API Key)', type: 'key', description: 'Connect using your Google AI Studio API Key.' },
    { id: 'openai', name: 'OpenAI', type: 'key', description: 'Connect using your OpenAI API Key.' },
    { id: 'anthropic', name: 'Anthropic', type: 'key', description: 'Connect using your Anthropic API Key.' },
    { id: 'ollama', name: 'Ollama', type: 'local', description: 'Connect to a local Ollama instance.' },
  ];

  const connectionStatus = providersQuery.data || {};
  
  const getStatus = (p) => {
    const backendProviderId = getBackendProviderId(p.id);
    const data = connectionStatus[backendProviderId] || { connected: false };
    if (p.type === 'oauth') return { connected: data.hasOauth, email: data.email };
    if (p.type === 'key' || p.type === 'local') return { connected: data.hasApiKey, baseUrl: data.baseUrl };
    return data;
  };

  const selectedProvider = providerList.find(p => p.id === selectedProviderId);
  const editingProvider = providerList.find(p => p.id === editingProviderId) || null;

  const handleAuthSubmit = () => {
    const provider = getBackendProviderId(editingProviderId || selectedProviderId);
    exchangeMutation.mutate({ 
      provider,
      apiKey: authInput.apiKey,
      baseUrl: authInput.baseUrl
    });
  };

  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providerList.filter(p => {
      if (removedProviders.includes(getBackendProviderId(p.id))) return false;
      const status = getStatus(p);
      if (statusFilter === 'connected' && !status.connected) return false;
      if (statusFilter === 'disconnected' && status.connected) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    });
  }, [providerList, search, statusFilter, connectionStatus, removedProviders]);

  return (
    <div className={(collapsed ? 'layout leftCollapsed' : 'layout') + (editingProviderId ? ' withRight' : '')}>
      <aside className={collapsed ? "filters collapsed" : "filters"}>
        <div className="filtersTop">
          <div className="filtersTopTitle">LLM Providers</div>
        </div>
        <FilterSection title="Search" initialOpen={true}>
          <div className="filtersInputRow">
            <input
              className="detailsInput"
              placeholder="Search providers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </FilterSection>
        <FilterSection title="Status" initialOpen={true}>
          <div className="filtersInputRow">
            <select
              className="detailsInput"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All providers</option>
              <option value="connected">Connected</option>
              <option value="disconnected">Disconnected</option>
            </select>
          </div>
        </FilterSection>
      </aside>

      <div className="container">
        <header className="page-header" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0 }}>LLM Providers</h1>
            <p style={{ margin: '8px 0 0', opacity: 0.6 }}>Bridge your management layer to the AI runtime.</p>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button
              className="tiny secondary"
              onClick={() => setViewMode(v => v === 'table' ? 'cards' : 'table')}
              title="Toggle view"
              style={{ padding: '6px 10px', height: 32 }}
            >
              {viewMode === 'table' ? '▦ Cards' : '≡ Table'}
            </button>
            <button className="primary" onClick={() => setIsAdding(true)}>+ Add Provider</button>
          </div>
        </header>

        <div className="page-content" style={{ padding: 32 }}>
          {viewMode === 'table' ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="agentsTable">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Type</th>
                    <th>Identity / URL</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProviders.map((p) => {
                    const status = getStatus(p);
                    return (
                      <tr key={p.id} onClick={() => setEditingProviderId(p.id)} style={{ cursor: 'pointer' }}>
                        <td><strong>{p.name}</strong></td>
                        <td><span className="badge">{p.type}</span></td>
                        <td className="mono" style={{ fontSize: 12, opacity: 0.8 }}>
                          {status.email || status.baseUrl || '—'}
                        </td>
                        <td><StatusIndicator connected={status.connected} /></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="secondary small" onClick={(e) => { e.stopPropagation(); setEditingProviderId(p.id); }}>Edit</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="projectGrid entityCardGrid">
              {filteredProviders.map(p => {
                const status = getStatus(p);
                const statusColor = status.connected ? '#22c55e' : '#94a3b8';
                return (
                  <div key={p.id} className="projectCard entityCard clickable" onClick={() => setEditingProviderId(p.id)} style={{ borderLeft: `6px solid ${statusColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{p.name}</h3>
                        <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>{p.type}</p>
                      </div>
                      <StatusIndicator connected={status.connected} />
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 20 }}>
                      {status.email ? `Connected as: ${status.email}` : status.baseUrl ? `URL: ${status.baseUrl}` : p.description}
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', gap: 8, borderTop: '1px solid var(--border-primary)', paddingTop: 16 }}>
                      <button className="secondary small">Settings</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="modalBackdrop">
          <div className="card modal premiumModal" style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0 }}>{selectedProviderId ? `Connect ${selectedProvider.name}` : 'Select Provider'}</h2>
              <button className="closeBtn" onClick={() => { setIsAdding(false); setSelectedProviderId(null); }}>✕</button>
            </div>

            {!selectedProviderId ? (
              <div className="projectGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {providerList.map(p => (
                  <div 
                    key={p.id} 
                    className="projectCard clickable" 
                    style={{ padding: 20, cursor: 'pointer', border: '1px solid var(--border)' }}
                    onClick={() => setSelectedProviderId(p.id)}
                  >
                    <h3 style={{ margin: '0 0 8px' }}>{p.name}</h3>
                    <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{p.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ maxWidth: 500 }}>
                <div style={{ marginBottom: 24 }}>
                  <button className="secondary tiny" onClick={() => setSelectedProviderId(null)} style={{ marginBottom: 12 }}>← Back to selection</button>
                  <p style={{ opacity: 0.7 }}>{selectedProvider.description}</p>
                </div>

                {selectedProvider.type === 'oauth' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p>You will be redirected to {selectedProvider.name} to authorize Task Master.</p>
                    <button 
                      className="primary" 
                      onClick={() => connectMutation.mutate(getBackendProviderId(selectedProvider.id))}
                      disabled={connectMutation.isPending}
                    >
                      {connectMutation.isPending ? 'Starting...' : 'Connect Account'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {selectedProvider.id === 'ollama' ? (
                      <div className="detailsField">
                        <label className="detailsLabel">Base URL</label>
                        <input 
                          className="detailsInput" 
                          placeholder="http://localhost:11434" 
                          value={authInput.baseUrl}
                          onChange={e => setAuthInput({ ...authInput, baseUrl: e.target.value })}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="detailsField">
                        <label className="detailsLabel">API Key</label>
                        <input 
                          type="password"
                          className="detailsInput" 
                          placeholder={selectedProvider.id.startsWith('google') ? 'AI Studio API Key' : 'sk-...'}
                          value={authInput.apiKey}
                          onChange={e => setAuthInput({ ...authInput, apiKey: e.target.value })}
                          autoFocus
                        />
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button 
                        className="primary" 
                        onClick={() => handleAuthSubmit()}
                        disabled={exchangeMutation.isPending || (!authInput.apiKey && !authInput.baseUrl)}
                      >
                        {exchangeMutation.isPending ? 'Connecting...' : 'Save & Connect'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {editingProvider && (
        <div className="detailsOverlay">
          <div className="detailsBackdrop" onClick={() => setEditingProviderId(null)} />
          <aside className="details" style={{ width: 'min(720px, 90vw)' }}>
            <div className="detailsHeader">
              <div className="detailsTitleRow">
                <div className="detailsTitle">Provider: {editingProvider.name}</div>
                <div className="detailsTitleActions">
                  <button className="closeBtn" onClick={() => setEditingProviderId(null)}>✕</button>
                </div>
              </div>

              <div className="detailsTabs">
                <button className={`tabBtn ${activeTab === 'metadata' ? 'active' : ''}`} onClick={() => setActiveTab('metadata')}>Metadata</button>
                <button className={`tabBtn ${activeTab === 'registry' ? 'active' : ''}`} onClick={() => setActiveTab('registry')}>Model Registry</button>
              </div>
            </div>

            <div className="detailsBody" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {activeTab === 'metadata' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <p style={{ opacity: 0.7, margin: 0 }}>Update credentials for this provider.</p>
                  {editingProvider.type === 'oauth' ? (
                    <button className="primary" onClick={() => connectMutation.mutate(getBackendProviderId(editingProvider.id))} disabled={connectMutation.isPending}>
                      {connectMutation.isPending ? 'Starting...' : 'Reconnect OAuth'}
                    </button>
                  ) : editingProvider.id === 'ollama' ? (
                    <>
                      <div className="detailsField">
                        <label className="detailsLabel">Base URL</label>
                        <input className="detailsInput" placeholder="http://localhost:11434" value={authInput.baseUrl} onChange={e => setAuthInput({ ...authInput, baseUrl: e.target.value })} />
                      </div>
                      <button className="primary" onClick={() => handleAuthSubmit()} disabled={!authInput.baseUrl || exchangeMutation.isPending}>
                        {exchangeMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="detailsField">
                        <label className="detailsLabel">API Key</label>
                        <input type="password" className="detailsInput" placeholder="Enter API key" value={authInput.apiKey} onChange={e => setAuthInput({ ...authInput, apiKey: e.target.value })} />
                      </div>
                      <button className="primary" onClick={() => handleAuthSubmit()} disabled={!authInput.apiKey || exchangeMutation.isPending}>
                        {exchangeMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  )}
                  <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border-primary)' }}>
                    <button
                      className="danger secondary"
                      onClick={() => {
                        const provider = getBackendProviderId(editingProvider.id);
                        if (!window.confirm(`Delete provider "${editingProvider.name}"? This will remove saved credentials and provider models that are not in use.`)) return;
                        deleteProviderMutation.mutate(provider);
                      }}
                      disabled={deleteProviderMutation.isPending}
                    >
                      {deleteProviderMutation.isPending ? 'Deleting...' : 'Delete Provider'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'registry' && (
                <div>
                  <ProviderDiscoveryPanel providerId={getBackendProviderId(editingProvider.id)} providerName={editingProvider.name} />
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
