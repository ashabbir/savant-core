import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FilterSection from './FilterSection';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api';

export default function LLMRegistryPage({ collapsed }) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const queryClient = useQueryClient();

    // Queries
    const providersQuery = useQuery({
        queryKey: ['llm-providers'],
        queryFn: () => apiGet('/api/llm/providers').then(res => res.data)
    });

    const modelsQuery = useQuery({
        queryKey: ['llm-models'],
        queryFn: () => apiGet('/api/llm/models').then(res => res.data)
    });

    // Mutations
    const testConnectionMutation = useMutation({
        mutationFn: (id) => apiPost(`/api/llm/providers/${id}/test`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
            alert('Connection successful!');
        },
        onError: (err) => {
            console.error('Connection test failed:', err);
            alert(`Connection failed: ${err.message}${err.payload?.error ? ` (${err.payload.error})` : ''}`);
        }
    });

    const discoverModelsMutation = useMutation({
        mutationFn: async (id) => {
            const res = await apiGet(`/api/llm/providers/${id}/discover`);
            return { models: res.data, providerId: id };
        },
        onSuccess: (data) => {
            if (data.models.length === 0) {
                alert('No models found.');
                return;
            }
            setDiscoveredModels(data.models);
            setDiscoveryProviderId(data.providerId);
            setIsDiscoveryModalOpen(true);
        },
        onError: (err) => {
            console.error('Model discovery failed:', err);
            alert(`Discovery failed: ${err.message}. Check API logs for details.`);
        }
    });

    const deleteModelMutation = useMutation({
        mutationFn: (id) => apiDelete(`/api/llm/models/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-models'] }),
        onError: (err) => alert(`Failed to delete model: ${err.message}`)
    });

    // Local state for modals/drawers
    const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
    const [editingProviderId, setEditingProviderId] = useState(null);
    const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);
    const [discoveredModels, setDiscoveredModels] = useState([]);
    const [discoveryProviderId, setDiscoveryProviderId] = useState(null);
    const [viewMode, setViewMode] = useState('cards');

    const filteredProviders = (providersQuery.data || []).filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.providerType.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        const matchesType = typeFilter === 'all' || p.providerType === typeFilter;

        return matchesSearch && matchesType && matchesStatus;
    });

    return (
        <div className={(collapsed ? 'layout leftCollapsed' : 'layout') + (editingProviderId ? ' hasDetails' : '')}>
            <aside className={collapsed ? "filters collapsed" : "filters"}>
                <div className="filtersTop">
                    <div className="filtersTopTitle">Registry</div>
                </div>
                <FilterSection title="Search" initialOpen={true}>
                    <div className="filtersInputRow">
                        <input
                            className="detailsInput"
                            placeholder="Find providers..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </FilterSection>
                <FilterSection title="Type" initialOpen={true}>
                    <div className="filtersInputRow">
                        <select
                            className="detailsInput"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="all">All Types</option>
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="google">Google Gemini</option>
                            <option value="azure">Azure OpenAI</option>
                            <option value="ollama">Ollama</option>
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
                            <option value="all">All Status</option>
                            <option value="valid">Connected</option>
                            <option value="invalid">Failed</option>
                            <option value="unknown">Unknown</option>
                        </select>
                    </div>
                </FilterSection>
            </aside>

            <div className="container">
                <main className="boardScroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--background-secondary)' }}>
                    <header className="page-header" style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '24px 32px', borderBottom: '1px solid var(--border)', background: 'var(--background-secondary)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                            <h1 style={{ margin: 0 }}>LLM Registry</h1>
                        </div>

                        <div className="header-actions" style={{ display: 'flex', gap: 12 }}>
                            <button
                                className="tiny secondary"
                                onClick={() => setViewMode(v => v === 'table' ? 'cards' : 'table')}
                                title="Toggle view"
                                style={{ height: 32, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                {viewMode === 'table' ? '▦' : '≡'}
                            </button>
                            <button className="primary" onClick={() => setIsProviderModalOpen(true)}>+ Add Provider</button>
                        </div>
                    </header>

                    <div className="page-content" style={{ padding: 32, overflowY: 'auto' }}>
                        <ProvidersTab
                            providers={filteredProviders}
                            isLoading={providersQuery.isLoading}
                            viewMode={viewMode}
                            onTest={(id) => testConnectionMutation.mutate(id)}
                            onDiscover={(id) => discoverModelsMutation.mutate(id)}
                            onEdit={(id) => setEditingProviderId(id)}
                            isDiscovering={discoverModelsMutation.isPending}
                        />
                    </div>
                </main>
            </div>

            {/* Modals & Drawers */}
            {isProviderModalOpen && (
                <ProviderModal
                    onClose={() => setIsProviderModalOpen(false)}
                    onSuccess={() => {
                        setIsProviderModalOpen(false);
                        queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
                    }}
                />
            )}

            {editingProviderId && (
                <div className="detailsOverlay">
                    <div className="detailsBackdrop" onClick={() => setEditingProviderId(null)} />
                    <ProviderEditDrawer
                        providerId={editingProviderId}
                        onClose={() => setEditingProviderId(null)}
                        onSuccess={() => {
                            setEditingProviderId(null);
                            queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
                            queryClient.invalidateQueries({ queryKey: ['llm-models'] });
                        }}
                    />
                </div>
            )}

            {isDiscoveryModalOpen && (
                <DiscoveredModelsModal
                    models={discoveredModels}
                    providerId={discoveryProviderId}
                    onClose={() => setIsDiscoveryModalOpen(false)}
                    onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['llm-models'] });
                        queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
                    }}
                />
            )}
        </div>
    );
}

function ProvidersTab({ providers, isLoading, viewMode, onTest, onDiscover, onEdit, isDiscovering }) {
    if (isLoading) return <div className="card">Loading providers...</div>;
    if (providers.length === 0) return (
        <div className="empty-state" style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>
            <p>No LLM providers configured yet.</p>
        </div>
    );

    if (viewMode === 'table') {
        return (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="agentsTable">
                    <thead>
                        <tr>
                            <th>Provider</th>
                            <th>Type</th>
                            <th>Endpoint</th>
                            <th>Status</th>
                            <th>Models</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {providers.map(p => (
                            <tr key={p.id} onClick={() => onEdit(p.id)} style={{ cursor: 'pointer' }}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="dot" style={{ background: p.color || '#6366f1' }} />
                                        <strong>{p.name}</strong>
                                    </div>
                                </td>
                                <td><span className="badge">{p.providerType}</span></td>
                                <td className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{p.baseUrl || '(default)'}</td>
                                <td><StatusBadge status={p.status} /></td>
                                <td>{p.modelCount || 0}</td>
                                <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                    <button className="tiny secondary" onClick={() => onTest(p.id)}>Test</button>
                                    <button className="tiny secondary" onClick={() => onDiscover(p.id)} disabled={isDiscovering}>
                                        {isDiscovering ? 'Scanning...' : 'Scan'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="projectGrid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20
        }}>
            {providers.map(p => (
                <div key={p.id} className="projectCard" onClick={() => onEdit(p.id)} style={{
                    display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 16,
                    border: '1px solid var(--border-primary)', borderLeft: `6px solid ${p.color || '#6366f1'}`, background: 'var(--card-background)', gap: 20, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    overflow: 'hidden', position: 'relative'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span className="badge" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--background-tertiary)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{p.providerType}</span>
                                {p.modelCount > 0 && <span className="badge" style={{ background: 'rgba(57, 45, 100, 0.2)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)', fontSize: 10, fontWeight: 700 }}>{p.modelCount} MODELS</span>}
                            </div>
                            <div className="projectCardName" style={{ margin: '8px 0 0', color: p.color || 'var(--text-primary)' }}>{p.name}</div>
                        </div>
                        <StatusBadge status={p.status} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, opacity: 0.8, padding: '16px 0', borderTop: '1px solid var(--border-primary)', borderBottom: '1px solid var(--border-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ opacity: 0.5 }}>Endpoint</span>
                            <span className="mono" style={{ opacity: 0.9, fontSize: 11 }}>{p.baseUrl || '(default)'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ opacity: 0.5 }}>Last Sync</span>
                            <span style={{ opacity: 0.9 }}>{p.lastValidatedAt ? new Date(p.lastValidatedAt).toLocaleDateString() : 'Never'}</span>
                        </div>
                    </div>

                    <div className="actions" style={{ marginTop: 'auto', display: 'flex', gap: 10 }} onClick={e => e.stopPropagation()}>
                        <button className="secondary small" onClick={() => onTest(p.id)} style={{ flex: 1, height: 32 }}>Test Connection</button>
                        <button className="primary small" onClick={() => onDiscover(p.id)} disabled={isDiscovering} style={{ flex: 1, height: 32 }}>
                            {isDiscovering ? 'Scanning...' : 'Scan Models'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function StatusBadge({ status }) {
    const isVal = status === 'valid';
    const isErr = status === 'invalid';
    const color = isVal ? 'var(--status-success)' : isErr ? 'var(--status-error)' : 'var(--text-tertiary)';
    const bg = isVal ? 'rgba(0, 200, 117, 0.1)' : isErr ? 'rgba(242, 45, 70, 0.1)' : 'rgba(255, 255, 255, 0.05)';

    return (
        <span style={{
            color: color,
            background: bg,
            padding: '4px 10px',
            borderRadius: '999px',
            border: `1px solid ${color}44`,
            fontWeight: 700,
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap'
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
            {status === 'valid' ? 'Connected' : status === 'invalid' ? 'Failed' : 'Unknown'}
        </span>
    );
}

function ProviderEditDrawer({ providerId, onClose, onSuccess }) {
    const [activeTab, setActiveTab] = useState('metadata');
    const queryClient = useQueryClient();

    const { data: provider, isLoading } = useQuery({
        queryKey: ['llm-provider', providerId],
        queryFn: () => apiGet(`/api/llm/providers/${providerId}`).then(res => res.data)
    });

    const { data: models = [] } = useQuery({
        queryKey: ['llm-models'],
        queryFn: () => apiGet('/api/llm/models').then(res => res.data)
    });

    const providerModels = models.filter(m => m.provider?.id === providerId || m.providerId === providerId);

    const [formData, setFormData] = React.useState({
        name: '',
        baseUrl: '',
        apiKeySecret: '',
        orgId: '',
        deploymentId: '',
        color: '#6366f1'
    });

    React.useEffect(() => {
        if (provider) {
            setFormData({
                name: provider.name || '',
                baseUrl: provider.baseUrl || '',
                orgId: provider.orgId || '',
                deploymentId: provider.deploymentId || '',
                color: provider.color || '#6366f1',
                apiKeySecret: ''
            });
        }
    }, [provider]);

    const updateMutation = useMutation({
        mutationFn: (data) => apiPatch(`/api/llm/providers/${providerId}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
            queryClient.invalidateQueries({ queryKey: ['llm-provider', providerId] });
            onSuccess();
        },
        onError: (err) => alert(err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: () => apiDelete(`/api/llm/providers/${providerId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
            onSuccess();
        },
        onError: (err) => alert(err.message)
    });

    const deleteModelMutation = useMutation({
        mutationFn: (id) => apiDelete(`/api/llm/models/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-models'] })
    });

    if (isLoading || !provider) return <aside className="details" style={{ width: '80vw' }}><div className="detailsLoading">Loading...</div></aside>;

    return (
        <aside className="details" style={{ width: '80vw', minWidth: '600px', maxWidth: '1400px' }}>
            <div className="detailsHeader">
                <div className="detailsTitleRow" style={{ gap: 12 }}>
                    <div className="detailsTitle" style={{ flex: 1 }}>Edit {provider.name}</div>
                    <input
                        type="color"
                        value={formData.color || '#6366f1'}
                        onChange={e => setFormData({ ...formData, color: e.target.value })}
                        style={{ width: 44, height: 38, padding: 2, background: 'transparent', border: '1px solid var(--border-primary)', borderRadius: 8, cursor: 'pointer' }}
                        title="Provider Color"
                    />
                    <div className="detailsTitleActions">
                        <button className="primary" onClick={() => {
                            const { apiKeySecret, ...rest } = formData;
                            updateMutation.mutate({ ...rest, apiKey: apiKeySecret });
                        }} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button className="closeBtn" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="detailsTabs">
                    <button className={`tabBtn ${activeTab === 'metadata' ? 'active' : ''}`} onClick={() => setActiveTab('metadata')}>Metadata</button>
                    <button className={`tabBtn ${activeTab === 'models' ? 'active' : ''}`} onClick={() => setActiveTab('models')}>
                        Models <span style={{ opacity: 0.6, fontSize: '0.8.em', marginLeft: 4 }}>{providerModels.length}</span>
                    </button>
                </div>
            </div>

            <div className="detailsBody">
                {activeTab === 'metadata' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div className="detailsGrid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="detailsField">
                                <label className="detailsLabel">Display Name</label>
                                <input className="detailsInput" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="detailsField">
                                <label className="detailsLabel">Provider Type</label>
                                <input className="detailsInput" value={provider.providerType} disabled style={{ opacity: 0.6 }} />
                            </div>
                        </div>

                        <div className="detailsField">
                            <label className="detailsLabel">Base URL (optional)</label>
                            <input className="detailsInput" value={formData.baseUrl} onChange={e => setFormData({ ...formData, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
                        </div>

                        <div className="detailsField">
                            <label className="detailsLabel">API Key {provider.hasApiKey ? '(Key set, enter new one to rotate)' : ''}</label>
                            <input className="detailsInput" type="password" value={formData.apiKeySecret} onChange={e => setFormData({ ...formData, apiKeySecret: e.target.value })} placeholder="••••••••••••••••" />
                        </div>

                        <div className="detailsGrid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="detailsField">
                                <label className="detailsLabel">Organization ID (OpenAI/Azure)</label>
                                <input className="detailsInput" value={formData.orgId} onChange={e => setFormData({ ...formData, orgId: e.target.value })} />
                            </div>
                            <div className="detailsField">
                                <label className="detailsLabel">Deployment ID (Azure)</label>
                                <input className="detailsInput" value={formData.deploymentId} onChange={e => setFormData({ ...formData, deploymentId: e.target.value })} />
                            </div>
                        </div>

                        <div className="dangerZone" style={{ marginTop: 40 }}>
                            <div className="detailsLabel">Danger Zone</div>
                            <button className="danger secondary" onClick={() => { if (confirm('Delete this provider and all its models?')) deleteMutation.mutate(); }}>Delete Provider</button>
                        </div>
                    </div>
                )}

                {activeTab === 'models' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {providerModels.length === 0 ? (
                            <div className="empty-state" style={{ textAlign: 'center', padding: 32, opacity: 0.5 }}>
                                <p>No registered models. Use the "Scan" action on the provider card to discovery models.</p>
                            </div>
                        ) : (
                            <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead style={{ background: 'var(--background-tertiary)' }}>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>
                                            <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.7 }}>Name</th>
                                            <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.7 }}>Model ID</th>
                                            <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.7 }}>Size / Params</th>
                                            <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.7 }}>Quantization</th>
                                            <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.7 }}>Modality</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'right', width: 40 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {providerModels.map(m => (
                                            <tr key={m.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{m.displayName}</td>
                                                <td style={{ padding: '10px 12px', fontFamily: 'monospace', opacity: 0.7, fontSize: 12 }}>{m.providerModelId}</td>
                                                <td style={{ padding: '10px 12px', fontSize: 12 }}>
                                                    {m.meta?.size ? `${Math.round(m.meta.size / 1024 / 1024 / 1024 * 10) / 10}GB` : '-'}
                                                    {m.meta?.parameter_size ? ` • ${m.meta.parameter_size}` : ''}
                                                </td>
                                                <td style={{ padding: '10px 12px', fontSize: 12, opacity: 0.8 }}>{m.meta?.quantization_level || '-'}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    {m.modality?.map(mod => (
                                                        <span key={mod} className="badge" style={{ fontSize: 9, padding: '2px 4px', marginRight: 4 }}>{mod}</span>
                                                    )) || '-'}
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                    <button
                                                        className="tiny danger secondary"
                                                        onClick={() => {
                                                            if (confirm('Delete this model?')) deleteModelMutation.mutate(m.id);
                                                        }}
                                                        title="Delete Model"
                                                        style={{ padding: 4 }}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M3 6h18"></path>
                                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}

function ProviderModal({ onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        name: '',
        providerType: 'google',
        baseUrl: '',
        apiKey: '',
        color: '#6366f1'
    });

    const mutation = useMutation({
        mutationFn: (data) => apiPost('/api/llm/providers', data),
        onSuccess: onSuccess,
        onError: (err) => {
            console.error('Failed to create provider:', err);
            alert(`Failed to add provider: ${err.message}${err.payload?.details ? ` - ${JSON.stringify(err.payload.details)}` : ''}`);
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        mutation.mutate(formData);
    };

    return (
        <div className="modalBackdrop">
            <div className="card modal premiumModal" style={{ maxWidth: 600 }}>
                <div className="modalHeader">
                    <div className="modalTitle">
                        <h2>Add Provider</h2>
                        <p className="modalSubtitle">Connect a new AI model provider</p>
                    </div>
                    <button className="closeBtn" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} className="modalBody" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                        <div className="inputGroup">
                            <label>Provider Name</label>
                            <input className="detailsInput" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Google Gemini" required />
                        </div>
                        <div className="inputGroup">
                            <label>Color</label>
                            <input type="color" className="detailsInput" style={{ width: 60, height: 42, padding: 4, cursor: 'pointer' }} value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} />
                        </div>
                    </div>

                    <div className="inputGroup">
                        <label>Type</label>
                        <select className="detailsInput" value={formData.providerType} onChange={e => setFormData({ ...formData, providerType: e.target.value })}>
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="google">Google Gemini</option>
                            <option value="azure">Azure OpenAI</option>
                            <option value="ollama">Ollama</option>
                        </select>
                    </div>

                    <div className="inputGroup">
                        <label>Base URL (optional)</label>
                        <input className="detailsInput" value={formData.baseUrl} onChange={e => setFormData({ ...formData, baseUrl: e.target.value })} placeholder="https://..." />
                    </div>

                    <div className="inputGroup">
                        <label>API Key</label>
                        <input className="detailsInput" type="password" value={formData.apiKey} onChange={e => setFormData({ ...formData, apiKey: e.target.value })} required={formData.providerType !== 'ollama'} />
                    </div>

                    <div className="modalActions" style={{ marginTop: 24 }}>
                        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Connecting...' : 'Connect Provider'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function DiscoveredModelsModal({ models, providerId, onClose, onSuccess }) {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: (payload) => apiPost('/api/llm/models', payload),
        onSuccess: () => {
            onSuccess();
            onClose();
        },
        onError: (err) => {
            console.error('Model registration failed:', err);
            alert(`Model registration failed: ${err.message}${err.payload?.details ? ` - ${JSON.stringify(err.payload.details)}` : ''}`);
        }
    });

    const handleRegister = () => {
        mutation.mutate({
            providerId,
            models: models.map(m => ({
                providerModelId: m.providerModelId,
                displayName: m.displayName,
                modality: m.modality,
                meta: m.meta
            }))
        });
    };

    return (
        <div className="modalBackdrop">
            <div className="card modal premiumModal" style={{ maxWidth: 700 }}>
                <div className="modalHeader">
                    <div className="modalTitle">
                        <h2>Discovered Models</h2>
                        <p className="modalSubtitle">{models.length} models found on the provider</p>
                    </div>
                    <button className="closeBtn" onClick={onClose}>✕</button>
                </div>
                <div className="modalBody" style={{ maxHeight: '60vh', overflowY: 'auto', padding: 0 }}>
                    <table className="agentsTable">
                        <thead>
                            <tr>
                                <th>Model ID</th>
                                <th>Modality</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {models.map((m, i) => (
                                <tr key={i}>
                                    <td className="mono" style={{ fontSize: 12 }}>{m.providerModelId}</td>
                                    <td>
                                        {m.modality?.map(mod => (
                                            <span key={mod} className="badge" style={{ fontSize: 9, padding: '2px 4px', marginRight: 4 }}>{mod}</span>
                                        ))}
                                    </td>
                                    <td style={{ fontSize: 11, opacity: 0.7 }}>
                                        {m.meta?.parameter_size} {m.meta?.quantization_level}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="modalActions">
                    <button className="secondary" onClick={onClose}>Cancel</button>
                    <button className="primary" onClick={handleRegister} disabled={mutation.isPending}>
                        {mutation.isPending ? 'Registering...' : 'Register All Models'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ModelEditModal({ model, onClose, onSuccess }) {
    const [formData, setFormData] = React.useState({
        displayName: model.displayName,
        contextWindow: model.contextWindow || 0
    });

    const mutation = useMutation({
        mutationFn: (data) => apiPatch(`/api/llm/models/${model.id}`, data),
        onSuccess: onSuccess,
        onError: (err) => alert(err.message)
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        mutation.mutate({
            displayName: formData.displayName,
            contextWindow: Number(formData.contextWindow)
        });
    };

    return (
        <div className="modalBackdrop">
            <div className="card modal premiumModal" style={{ maxWidth: 500 }}>
                <div className="modalHeader">
                    <div className="modalTitle">
                        <h2>Edit Model</h2>
                        <p className="modalSubtitle">{model.providerModelId}</p>
                    </div>
                    <button className="closeBtn" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} className="modalBody">
                    <div className="inputGroup">
                        <label>Display Name</label>
                        <input className="detailsInput" value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} required />
                    </div>
                    <div className="inputGroup" style={{ marginTop: 15 }}>
                        <label>Context Window (tokens)</label>
                        <input className="detailsInput" type="number" value={formData.contextWindow} onChange={e => setFormData({ ...formData, contextWindow: e.target.value })} />
                    </div>
                    <div className="modalActions" style={{ marginTop: 24 }}>
                        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
