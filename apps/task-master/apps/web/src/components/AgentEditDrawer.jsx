import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

const TABS = [
    { key: 'metadata', label: 'Metadata' },
    { key: 'soul', label: 'Soul' },
    { key: 'bootstrap', label: 'Bootstrap' },
    { key: 'guardrails', label: 'Guardrails' },
    { key: 'context', label: 'Context' }
];

function AgentEditDrawer({ agent, onUpdate, onDelete, onClose, drafts = {}, setDrafts }) {
    const [activeTab, setActiveTab] = useState('metadata');
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [testError, setTestError] = useState('');
    const [connectivity, setConnectivity] = useState(null);

    const modelsQuery = useQuery({
        queryKey: ['llm-models-enabled'],
        queryFn: () => apiGet('/api/llm/models?enabled=true').then(r => r.data),
        staleTime: 5 * 60 * 1000
    });
    const availableModels = modelsQuery.data || [];

    if (!agent) return null;
    const isMainAgent = agent.type === 'main'
        || !!agent.isMain
        || String(agent.name || '').trim().toLowerCase() === 'jarvis'
        || String(agent.talonAgentId || '').trim().toLowerCase() === 'jarvis';

    const draft = drafts[agent.id] || {};

    const updateDraft = (patch) => {
        setDrafts(prev => ({
            ...prev,
            [agent.id]: { ...(prev[agent.id] || {}), ...patch }
        }));
    };

    const toCanonicalModel = (m) => {
        const providerType = String(m?.provider?.providerType || '').trim();
        const providerModelId = String(m?.providerModelId || '').trim();
        return providerType && providerModelId ? `${providerType}/${providerModelId}` : '';
    };

    const selectedPrimaryModel = draft.defaultModel ?? agent.defaultModel ?? agent.model ?? '';

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onUpdate(agent.id, {
                name: draft.name ?? agent.name,
                role: draft.role ?? agent.role ?? '',
                model: selectedPrimaryModel,
                modelId: draft.modelId !== undefined ? draft.modelId : agent.modelId,
                defaultModel: selectedPrimaryModel,
                fallbackModel: draft.fallbackModel ?? agent.fallbackModel ?? '',
                soul: draft.soul ?? agent.soul ?? '',
                guardrails: draft.guardrails ?? agent.guardrails ?? '',
                bootstrap: draft.bootstrap ?? agent.bootstrap ?? '',
                everyone: draft.everyone ?? agent.everyone ?? '',
                active: draft.active ?? agent.active ?? true
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        if (isMainAgent) {
            alert('Jarvis is system-defined and cannot be deleted.');
            return;
        }
        if (window.confirm(`Delete agent "${agent.name}"? This action cannot be undone.`)) {
            onDelete?.(agent);
        }
    };

    const handleTestAgent = async () => {
        setIsTesting(true);
        setTestError('');
        setTestResult(null);
        try {
            const res = await apiPost(`/api/agents/${agent.id}/test`, {});
            setTestResult(res?.data || null);
            setConnectivity('online');
        } catch (e) {
            setTestError(e?.message || 'Agent test failed');
            setConnectivity('offline');
        } finally {
            setIsTesting(false);
        }
    };

    const handleToggleActive = () => {
        const newActive = !(draft.active ?? agent.active ?? true);
        updateDraft({ active: newActive });
    };

    const isActive = draft.active ?? agent.active ?? true;
    const hasChanges = Object.keys(draft).length > 0;

    return (
        <aside className="details" style={{ width: '80vw', minWidth: '600px', maxWidth: '1400px' }}>
            <div className="detailsHeader">
                <div className="detailsTitleRow" style={{ gap: 12 }}>
                    <div style={{ flex: 1 }}>
                        <div className="detailsTitle" style={{ fontSize: 18, fontWeight: 600 }}>
                            {agent.name}
                        </div>
                        <p className="detailsDescriptionValue" style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                            {agent.talonAgentId || 'No Talon ID'}
                        </p>
                    </div>
                    <div className="detailsTitleActions">
                        <button
                            className="primary"
                            onClick={handleSave}
                            disabled={isSaving || !((draft.name ?? agent.name)?.trim()) || !selectedPrimaryModel}
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button className="closeBtn" onClick={onClose}>✕</button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="detailsTabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`tabBtn ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="detailsBody" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
                {/* Metadata Tab */}
                {activeTab === 'metadata' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1 }}>
                            <div className="detailsField">
                                <label className="detailsLabel">Name</label>
                                <input
                                    className="detailsInput"
                                    value={draft.name ?? agent.name}
                                    onChange={(e) => updateDraft({ name: e.target.value })}
                                    placeholder="Agent name"
                                    disabled={isMainAgent}
                                />
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">Role</label>
                                <input
                                    className="detailsInput"
                                    value={draft.role ?? agent.role ?? ''}
                                    onChange={(e) => updateDraft({ role: e.target.value })}
                                    placeholder="e.g. Developer, QA, Reviewer"
                                />
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">Primary Model</label>
                                <select
                                    className="detailsInput"
                                    value={selectedPrimaryModel}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const modelMatch = availableModels.find((m) => toCanonicalModel(m) === val) || null;
                                        updateDraft({
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

                            <div className="detailsField">
                                <label className="detailsLabel">Talon Agent ID</label>
                                <input
                                    className="detailsInput"
                                    value={agent.talonAgentId ?? ''}
                                    readOnly
                                    disabled
                                />
                                <span style={{ fontSize: 11, opacity: 0.5, marginTop: 4, display: 'block' }}>
                                    Auto-generated identifier used by Talon runtime
                                </span>
                                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                        className="secondary tiny"
                                        onClick={handleTestAgent}
                                        disabled={isTesting}
                                    >
                                        {isTesting ? 'Testing...' : 'Test Agent'}
                                    </button>
                                    {connectivity === 'online' ? (
                                        <span className="badge success">Online</span>
                                    ) : null}
                                    {connectivity === 'offline' ? (
                                        <span className="badge danger">Offline</span>
                                    ) : null}
                                </div>
                                {testError ? (
                                    <div className="callout error" style={{ marginTop: 10 }}>
                                        {testError}
                                    </div>
                                ) : null}
                                {testResult ? (
                                    <div className="callout success" style={{ marginTop: 10 }}>
                                        <div><strong>Status:</strong> {testResult.status || 'unknown'}</div>
                                        <div><strong>Latency:</strong> {testResult.latencyMs ?? 0} ms</div>
                                        <div><strong>Model:</strong> {testResult.model || 'n/a'}</div>
                                        <div><strong>Response:</strong> {testResult.text || '(empty)'}</div>
                                    </div>
                                ) : null}
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">Fallback Model</label>
                                <select
                                    className="detailsInput"
                                    value={draft.fallbackModel ?? agent.fallbackModel ?? ''}
                                    onChange={(e) => updateDraft({ fallbackModel: e.target.value })}
                                >
                                    <option value="">None</option>
                                    {availableModels.map(m => {
                                        const canonical = toCanonicalModel(m);
                                        return (
                                            <option key={m.id} value={canonical}>
                                                {m.providerModelId} ({m.provider.name})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            
                        </div>

                        {/* Danger Zone */}
                        <div className="dangerZone">
                            <div className="detailsLabel">Danger Zone</div>
                            <div className="row">
                                <button
                                    className={isActive ? "danger" : "success"}
                                    onClick={handleToggleActive}
                                    disabled={isMainAgent}
                                >
                                    {isActive ? 'Deactivate Agent' : 'Activate Agent'}
                                </button>
                                <button
                                    className="danger secondary"
                                    onClick={handleDelete}
                                    disabled={isSaving || isMainAgent}
                                >
                                    Delete Agent
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Soul Tab */}
                {activeTab === 'soul' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div className="detailsField" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <label className="detailsLabel">Agent Soul</label>
                            <span style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>
                                Define the agent's personality, expertise, and behavior patterns
                            </span>
                            <textarea
                                className="detailsTextarea"
                                style={{ flex: 1, minHeight: 300, resize: 'vertical' }}
                                value={draft.soul ?? agent.soul ?? ''}
                                onChange={(e) => updateDraft({ soul: e.target.value })}
                                placeholder="You are an expert software engineer specializing in..."
                            />
                        </div>
                    </div>
                )}

                {/* Bootstrap Tab */}
                {activeTab === 'bootstrap' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div className="detailsField" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <label className="detailsLabel">Bootstrap Command</label>
                            <span style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>
                                Command to run when starting the agent session (e.g., install dependencies, start dev server)
                            </span>
                            <textarea
                                className="detailsTextarea"
                                style={{ flex: 1, minHeight: 200, resize: 'vertical', fontFamily: 'monospace' }}
                                value={draft.bootstrap ?? agent.bootstrap ?? ''}
                                onChange={(e) => updateDraft({ bootstrap: e.target.value })}
                                placeholder="npm install && npm run dev"
                            />
                        </div>
                    </div>
                )}

                {/* Guardrails Tab */}
                {activeTab === 'guardrails' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div className="detailsField" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <label className="detailsLabel">Guardrails</label>
                            <span style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>
                                Define safety rules, boundaries, and restrictions for the agent
                            </span>
                            <textarea
                                className="detailsTextarea"
                                style={{ flex: 1, minHeight: 300, resize: 'vertical' }}
                                value={draft.guardrails ?? agent.guardrails ?? ''}
                                onChange={(e) => updateDraft({ guardrails: e.target.value })}
                                placeholder="- Never delete production data&#10;- Always create backups before migrations&#10;- Ask for confirmation before destructive operations"
                            />
                        </div>
                    </div>
                )}

                {/* Context Tab */}
                {activeTab === 'context' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div className="detailsField" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <label className="detailsLabel">Repository Context (EVERYONE)</label>
                            <span style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>
                                Shared context about the repository that all agents working on this project should know
                            </span>
                            <textarea
                                className="detailsTextarea"
                                style={{ flex: 1, minHeight: 300, resize: 'vertical' }}
                                value={draft.everyone ?? agent.everyone ?? ''}
                                onChange={(e) => updateDraft({ everyone: e.target.value })}
                                placeholder="This is a monorepo containing:&#10;- apps/api - Backend Express server&#10;- apps/web - React frontend&#10;- packages/shared - Shared utilities"
                            />
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}

export default AgentEditDrawer;
