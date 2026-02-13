import React, { useMemo, useState } from 'react';
import Select from 'react-select';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';

const TABS = [
    { key: 'metadata', label: 'Metadata' },
    { key: 'history', label: 'History' },
    { key: 'activity', label: 'Activity' }
];

function UserEditDrawer({
    user,
    draftById,
    updateDraft,
    onSave,
    onClose,
    projectOptions,
    agentOptions
}) {
    const [activeTab, setActiveTab] = useState('metadata');

    const historyQuery = useQuery({
        queryKey: ['user-history', user?.username],
        queryFn: async () => {
            if (!user?.username) return { tasks: [] };
            const tasksRes = await apiGet(`/api/tasks?assignee=${user.username}`);
            return {
                tasks: tasksRes.data || []
            };
        },
        enabled: !!user?.username && activeTab === 'history'
    });

    const activityQuery = useQuery({
        queryKey: ['user-activity', user?.username],
        queryFn: async () => {
            if (!user?.username) return { activity: [] };
            const activityRes = await apiGet(`/api/activity?actor=${user.username}`);
            return {
                activity: activityRes.data || []
            };
        },
        enabled: !!user?.username && activeTab === 'activity'
    });

    if (!user) return null;
    const draft = draftById[user.id] || {};

    const origIds = (user.projects || []).map(p => p.id).slice().sort().join(',');
    const draftIds = (draft.projectIds || []).slice().sort().join(',');
    const changed = (draft.displayName || '') !== (user.displayName || '')
        || (draft.role || '') !== (user.role || '')
        || (draft.color || '') !== (user.color || '') // Compare color
        || (!!draft.active) !== (!!user.active)
        || draftIds !== origIds
        || (draft.preferredAgentId || '') !== (user.preferredAgentId || '')
        || (draft.monthlyTokenLimit ?? null) !== (user.monthlyTokenLimit ?? null)
        || (draft.monthlyCostLimit ?? null) !== (user.monthlyCostLimit ?? null);

    const historyData = historyQuery.data || { tasks: [] };
    const activityData = activityQuery.data || { activity: [] };

    return (
        <aside className="details" style={{ width: '80vw', minWidth: '600px', maxWidth: '1400px' }}>
            <div className="detailsHeader">
                <div className="detailsTitleRow">
                    <div className="detailsTitle">Edit User: {user.username}</div>
                    <div className="detailsTitleActions">
                        {activeTab === 'metadata' && (
                            <button
                                className="primary"
                                disabled={!changed}
                                onClick={() => onSave(user, draft)}
                            >
                                Save Changes
                            </button>
                        )}
                        <button className="closeBtn" onClick={onClose} title="Close">✕</button>
                    </div>
                </div>

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

            <div className="detailsBody" style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 0, flex: 1 }}>

                {activeTab === 'metadata' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, minHeight: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            <div className="detailsField">
                                <label className="detailsLabel">Display Name</label>
                                <input
                                    className="detailsInput"
                                    value={draft.displayName || ''}
                                    onChange={(e) => updateDraft(user.id, { displayName: e.target.value })}
                                    placeholder="User's full name"
                                />
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">Role</label>
                                <select
                                    className="detailsInput"
                                    value={draft.role || 'MEMBER'}
                                    onChange={(e) => updateDraft(user.id, { role: e.target.value })}
                                >
                                    <option value="MEMBER">MEMBER</option>
                                    <option value="ADMIN">ADMIN</option>
                                </select>
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">Preferred Agent</label>
                                <select
                                    className="detailsInput"
                                    value={draft.preferredAgentId || ''}
                                    onChange={(e) => updateDraft(user.id, { preferredAgentId: e.target.value })}
                                >
                                    <option value="">None</option>
                                    {agentOptions.map(a => (
                                        <option key={a.value} value={a.value}>{a.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">User Color</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={draft.color ?? user.color ?? '#3b82f6'}
                                        onChange={(e) => updateDraft(user.id, { color: e.target.value })}
                                        style={{ width: 40, height: 30, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: 13, opacity: 0.7 }}>{draft.color ?? user.color ?? '#3b82f6'}</span>
                                </div>
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">Monthly Token Limit</label>
                                <input
                                    className="detailsInput"
                                    type="number"
                                    min="0"
                                    value={draft.monthlyTokenLimit ?? user.monthlyTokenLimit ?? ''}
                                    onChange={(e) => updateDraft(user.id, { monthlyTokenLimit: e.target.value === '' ? null : Number(e.target.value) })}
                                    placeholder="e.g. 1000000"
                                />
                            </div>

                            <div className="detailsField">
                                <label className="detailsLabel">Monthly Cost Limit (USD)</label>
                                <input
                                    className="detailsInput"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={draft.monthlyCostLimit ?? user.monthlyCostLimit ?? ''}
                                    onChange={(e) => updateDraft(user.id, { monthlyCostLimit: e.target.value === '' ? null : Number(e.target.value) })}
                                    placeholder="e.g. 50.00"
                                />
                            </div>
                        </div>

                        <div className="detailsField">
                            <label className="detailsLabel">Assigned Projects</label>
                            <Select
                                classNamePrefix="select"
                                className="filtersSelect"
                                isMulti
                                placeholder="Select projects..."
                                options={projectOptions}
                                value={projectOptions.filter(p => (draft.projectIds || []).includes(p.value))}
                                onChange={(opts) => updateDraft(user.id, { projectIds: (opts || []).map(o => o.value) })}
                                styles={{
                                    control: (base) => ({
                                        ...base,
                                        background: 'var(--input-background)',
                                        borderColor: 'var(--border-primary)',
                                        borderRadius: '8px',
                                        minHeight: '42px'
                                    }),
                                    menu: (base) => ({
                                        ...base,
                                        background: 'var(--card-background)',
                                        border: '1px solid var(--border-primary)'
                                    }),
                                    option: (base, state) => ({
                                        ...base,
                                        background: state.isFocused ? 'var(--input-background)' : 'transparent',
                                        color: 'var(--text-primary)'
                                    }),
                                    multiValue: (base) => ({
                                        ...base,
                                        background: 'rgba(99, 102, 241, 0.1)',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(99, 102, 241, 0.2)'
                                    }),
                                    multiValueLabel: (base) => ({
                                        ...base,
                                        color: 'var(--text-primary)'
                                    }),
                                    multiValueRemove: (base) => ({
                                        ...base,
                                        color: 'var(--text-secondary)',
                                        ':hover': {
                                            background: 'rgba(99, 102, 241, 0.2)',
                                            color: 'white'
                                        }
                                    })
                                }}
                            />
                        </div>

                        {/* Danger Zone */}
                        <div className="dangerZone">
                            <div className="detailsLabel">Danger Zone</div>
                            <div className="row">
                                <button
                                    className={(draft.active ?? user.active ?? true) ? "danger" : "success"}
                                    onClick={() => updateDraft(user.id, { active: !(draft.active ?? user.active ?? true) })}
                                >
                                    {(draft.active ?? user.active ?? true) ? 'Deactivate User' : 'Activate User'}
                                </button>
                                <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 12, alignSelf: 'center' }}>
                                    Deactivated users cannot log in or perform actions.
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, flex: 1, minHeight: 0 }}>
                        {/* Assigned Tickets & Epics */}
                        <div className="detailsField" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
                            <label className="detailsLabel">Assigned Tickets & Epics</label>
                            {historyQuery.isLoading ? (
                                <div className="detailsValue">Loading tasks...</div>
                            ) : (
                                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 8, background: 'rgba(0,0,0,0.1)' }}>
                                    <table className="agentsTable" style={{ margin: 0, width: '100%' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--background-secondary)', zIndex: 1 }}>
                                            <tr>
                                                <th>Project</th>
                                                <th>Ticket</th>
                                                <th>Title</th>
                                                <th>Type</th>
                                                <th>Priority</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyData.tasks.length > 0 ? (
                                                historyData.tasks.map(task => (
                                                    <tr key={task.id}>
                                                        <td>{task.project?.code || '—'}</td>
                                                        <td className="mono">{task.project?.code}-{task.ticketNumber}</td>
                                                        <td>{task.title}</td>
                                                        <td>
                                                            <span className={`badge type ${task.type}`}>
                                                                {task.type}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={`badge pri ${task.priority || 'medium'}`}>
                                                                {task.priority || 'medium'}
                                                            </span>
                                                        </td>
                                                        <td>{task.columnName}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={6} style={{ textAlign: 'center', opacity: 0.5, padding: 20 }}>
                                                        No tasks assigned to this user.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="detailsField" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <label className="detailsLabel">Recent Activity</label>
                        {activityQuery.isLoading ? (
                            <div className="detailsValue">Loading activity...</div>
                        ) : (
                            <div className="comments" style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
                                {activityData.activity.length > 0 ? (
                                    activityData.activity.slice(0, 20).map((a, idx) => (
                                        <div key={a.id} className="comment" style={{ opacity: idx >= 5 ? 0.7 : 1 }}>
                                            <div className="commentMeta">
                                                {new Date(a.at).toLocaleString()} · {a.action}
                                            </div>
                                            <div className="commentBody">
                                                {a.detail}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="detailsValue">— No activity found —</div>
                                )}
                            </div>
                        )}
                    </div>

                )}
            </div>
        </aside>
    );
}

export default UserEditDrawer;
