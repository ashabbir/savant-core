import { useEffect, useMemo, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import Select from 'react-select';
import { io } from 'socket.io-client';
import { BrowserRouter, useLocation, useNavigate, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { apiGet, apiPost, apiPatch, apiDelete, apiReportClientError, setApiErrorCallback } from './api';
import './cyber-onyx.css';
import './app.css';
import './themes.css';
import { projectCode, colorForProject } from './utils';
import FilterSection from './components/FilterSection';
import ControlNav from './components/ControlNav';
import FilterDrawer from './components/FilterDrawer';
import CardEditDrawer from './components/CardEditDrawer';
import BoardHeader from './components/BoardHeader';
import StoryBoard from './components/StoryBoard';
import EpicBoard from './components/EpicBoard';
import AppHeader from './components/AppHeader';
import AppFooter from './components/AppFooter';
import ActivityDrawer from './components/ActivityDrawer';
import AgentsPage from './components/AgentsPage';
import LLMProvidersPage from './components/LLMProvidersPage';
import RoutingRulesPanel from './components/RoutingRulesPanel';
import UserEditDrawer from './components/UserEditDrawer';
import LLMRegistryPage from './components/LLMRegistryPage';
import ProfilePage from './components/ProfilePage';
import CommandBar from './components/CommandBar';

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inCode = false;
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine ?? '';
    if (line.trim().startsWith('```')) {
      if (!inCode) {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        html.push('<pre><code>');
        inCode = true;
      } else {
        html.push('</code></pre>');
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      html.push(`<h${level}>${escapeHtml(content)}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${escapeHtml(listMatch[1])}</li>`);
      continue;
    }

    if (inList) {
      html.push('</ul>');
      inList = false;
    }

    if (!line.trim()) {
      html.push('<br/>');
      continue;
    }

    const withInlineCode = escapeHtml(line).replace(/`([^`]+)`/g, '<code>$1</code>');
    html.push(`<p>${withInlineCode}</p>`);
  }

  if (inList) html.push('</ul>');
  if (inCode) html.push('</code></pre>');
  return html.join('\n');
}

function ProjectSettingsDrawer({ project, onClose, onSave, onDelete, isSaving, agents, isAdmin, onNotify }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('meta');
  const [name, setName] = useState(project?.name || '');
  const [code, setCode] = useState(project?.code || '');
  const [description, setDescription] = useState(project?.description || '');
  const [active, setActive] = useState(project?.active ?? true);
  const [color, setColor] = useState(project?.color || '#f97316');

  const allLanes = ['Backlog', 'Todo', 'Inprogress', 'Done'];
  const [enabledLanes, setEnabledLanes] = useState(() => {
    if (project?.columns) {
      return project.columns.filter(c => c.enabled).map(c => c.name);
    }
    return allLanes;
  });

  const [showRepoModal, setShowRepoModal] = useState(false);
  const [repoInput, setRepoInput] = useState({ repoName: '', repoPath: '' });
  const [selectedAnalysisFile, setSelectedAnalysisFile] = useState('');

  const reposQuery = useQuery({
    queryKey: ['context-repos', project?.id],
    queryFn: () => apiGet('/api/context/repos').then(res => (res.data || []).filter(r => r.projectId === project?.id)),
    enabled: !!project?.id && activeTab === 'repo'
  });

  const analysisQuery = useQuery({
    queryKey: ['project-analysis', project?.id],
    queryFn: () => apiGet(`/api/projects/${project?.id}/analysis`).then(res => res.data || null),
    enabled: !!project?.id && activeTab === 'analysis',
    refetchInterval: (query) => {
      const status = query?.state?.data?.status;
      return status === 'queued' || status === 'running' ? 2500 : false;
    }
  });

  const runAnalysisMutation = useMutation({
    mutationFn: () => apiPost(`/api/projects/${project?.id}/analysis/run`, {}).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-analysis', project?.id] });
      queryClient.invalidateQueries({ queryKey: ['context-repos', project?.id] });
      onNotify?.('Javis Analysis started. You can continue working.', 'info');
    },
    onError: (err) => onNotify?.(`Javis Analysis failed: ${err.message}`, 'error')
  });

  const createRepoMutation = useMutation({
    mutationFn: (payload) => apiPost('/api/context/repos', payload).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['context-repos', project?.id] });
      setShowRepoModal(false);
      setRepoInput({ repoName: '', repoPath: '' });
    },
    onError: (err) => alert(`Add repository failed: ${err.message}`)
  });

  const reindexRepoMutation = useMutation({
    mutationFn: (repoName) => apiPost(`/api/context/repos/${encodeURIComponent(repoName)}/reindex`).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['context-repos', project?.id] });
    },
    onError: (err) => alert(`Reindex failed: ${err.message}`)
  });

  const deleteRepoMutation = useMutation({
    mutationFn: (repoName) => apiDelete(`/api/context/repos/${encodeURIComponent(repoName)}`).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['context-repos', project?.id] });
    },
    onError: (err) => alert(`Delete failed: ${err.message}`)
  });

  const handleSuggestCode = (newName) => {
    setName(newName);
    if (!project) {
      setCode(projectCode(newName));
    }
  };

  const handleSave = () => {
    onSave({
      name,
      code: code.toUpperCase(),
      description,
      active,
      enabledColumns: enabledLanes,
      color
    });
  };

  const contextRepos = reposQuery.data || [];
  const analysisFiles = analysisQuery.data?.files || [];
  const selectedFileObj = analysisFiles.find((f) => f.filePath === selectedAnalysisFile) || analysisFiles[0] || null;
  const analysisStatus = String(analysisQuery.data?.status || 'idle').toLowerCase();
  const lastAnalysisStateRef = useRef({ status: analysisStatus, jobId: analysisQuery.data?.jobId || '' });

  useEffect(() => {
    if (activeTab !== 'analysis') return;
    if (!analysisFiles.length) {
      setSelectedAnalysisFile('');
      return;
    }
    if (!selectedAnalysisFile || !analysisFiles.some((f) => f.filePath === selectedAnalysisFile)) {
      setSelectedAnalysisFile(analysisFiles[0].filePath);
    }
  }, [activeTab, selectedAnalysisFile, analysisFiles]);

  useEffect(() => {
    if (activeTab !== 'analysis') return;
    const prev = lastAnalysisStateRef.current;
    const next = { status: analysisStatus, jobId: analysisQuery.data?.jobId || '' };
    const wasWorking = prev.status === 'queued' || prev.status === 'running';
    if (wasWorking && next.status === 'complete') {
      onNotify?.('Analysis complete', 'success');
    } else if (wasWorking && next.status === 'failed') {
      onNotify?.(`Analysis failed${analysisQuery.data?.lastError ? `: ${analysisQuery.data.lastError}` : ''}`, 'error');
    }
    lastAnalysisStateRef.current = next;
  }, [activeTab, analysisStatus, analysisQuery.data?.jobId, analysisQuery.data?.lastError, onNotify]);

  return (
    <aside className="details">
      <div className="detailsHeader">
        <div className="detailsTitleRow" style={{ gap: 12 }}>
          {activeTab === 'meta' ? (
            <>
              <input
                className="detailsTitleInput"
                value={name}
                onChange={(e) => handleSuggestCode(e.target.value)}
                placeholder="Project Name"
                style={{ flex: 3 }}
              />
              <input
                className="detailsInput"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="CODE"
                style={{ flex: 1, fontSize: 16, fontWeight: 700, height: 38 }}
              />
              <input
                type="color"
                className="detailsInput"
                style={{ width: 44, height: 38, padding: '2px', cursor: 'pointer', flexShrink: 0 }}
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </>
          ) : (
            <div className="detailsTitle" style={{ flex: 1 }}>{project?.name || 'Project'} Context</div>
          )}
          <div className="detailsTitleActions">
            {activeTab === 'meta' && (
              <button className="primary" onClick={handleSave} disabled={isSaving || !name.trim() || !code.trim() || enabledLanes.length === 0}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
            <button className="closeBtn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="detailsTabs">
          <button className={`tabBtn ${activeTab === 'meta' ? 'active' : ''}`} onClick={() => setActiveTab('meta')}>Meta</button>
          <button className={`tabBtn ${activeTab === 'repo' ? 'active' : ''}`} onClick={() => setActiveTab('repo')}>Repo</button>
          {project?.id && (
            <button className={`tabBtn ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>Analysis</button>
          )}
        </div>
      </div>

      <div className="detailsBody">
        {activeTab === 'meta' && (
          <>
            <div className="detailsField">
              <label className="detailsLabel">Description</label>
              <textarea
                className="detailsTextarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                style={{ minHeight: 80 }}
              />
            </div>

            <div className="detailsField">
              <label className="detailsLabel">Board Lanes</label>
              <div className="pillInputContainer detailsInput" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 42, alignItems: 'center', padding: '6px 10px' }}>
                {enabledLanes.map((lane, idx) => (
                  <div key={`${lane}-${idx}`} className="lanePill" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 12, fontSize: 13 }}>
                    {lane}
                    <span
                      style={{ cursor: 'pointer', opacity: 0.6, fontSize: 14, lineHeight: 1 }}
                      onClick={() => setEnabledLanes(prev => prev.filter((_, i) => i !== idx))}
                    >
                      ×
                    </span>
                  </div>
                ))}
                <input
                  type="text"
                  placeholder={enabledLanes.length === 0 ? "Add lane..." : ""}
                  style={{ border: 'none', background: 'transparent', color: 'inherit', outline: 'none', flex: 1, minWidth: 100, fontSize: 13 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      const val = e.target.value.trim().replace(/,/g, '');
                      if (val && !enabledLanes.includes(val)) {
                        setEnabledLanes(prev => [...prev, val]);
                        e.target.value = '';
                      }
                    } else if (e.key === 'Backspace' && !e.target.value && enabledLanes.length > 0) {
                      setEnabledLanes(prev => prev.slice(0, -1));
                    }
                  }}
                />
              </div>
            </div>

            {project?.id && (
              <div className="detailsField">
                <label className="detailsLabel">Automation Rules</label>
                <RoutingRulesPanel projectId={project.id} agents={agents} isAdmin={isAdmin} />
              </div>
            )}

            {project && (
              <div className="dangerZone">
                <div className="detailsLabel">Danger Zone</div>
                <div className="row">
                  <button
                    className={active ? "danger" : "success"}
                    onClick={() => setActive(!active)}
                  >
                    {active ? 'Deactivate Project' : 'Activate Project'}
                  </button>
                  <button
                    className="danger secondary"
                    onClick={() => {
                      if (window.confirm('Delete this project? This only works if the project has no tasks.')) onDelete(project);
                    }}
                    disabled={isSaving}
                  >
                    Delete Project
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'repo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="detailsLabel" style={{ margin: 0 }}>Project Repositories</label>
              <button className="primary tiny" onClick={() => setShowRepoModal(true)}>+ Add Repo</button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="agentsTable">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th>Path</th>
                    <th>Status</th>
                    <th>Index Details</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contextRepos.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', opacity: 0.6, padding: 18 }}>No repositories associated.</td>
                    </tr>
                  ) : (
                    contextRepos.map((r) => (
                      <tr key={r.id || r.repoName}>
                        <td><strong>{r.repoName}</strong></td>
                        <td className="mono" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.repoPath}</td>
                        <td>
                          {String(r.indexStatus || '').toUpperCase() === 'FAILED' || r.lastError ? (
                            <span className="badge danger">Failed</span>
                          ) : String(r.indexStatus || '').toUpperCase() === 'INDEXED' || r.lastIndexedAt ? (
                            <span className="badge success">Indexed</span>
                          ) : String(r.indexStatus || '').toUpperCase() === 'INDEXING' ? (
                            <span className="badge">Indexing</span>
                          ) : (
                            <span className="badge">Queued</span>
                          )}
                        </td>
                        <td style={{ minWidth: 260 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 12, opacity: 0.9 }}>
                              Files: <strong>{Number(r.lastFileCount || 0)}</strong> · Chunks: <strong>{Number(r.lastChunkCount || 0)}</strong>
                            </span>
                            <span style={{ fontSize: 12, opacity: 0.75 }}>
                              Last indexed: {r.lastIndexedAt ? new Date(r.lastIndexedAt).toLocaleString() : 'Never'}
                            </span>
                            {r.lastError ? (
                              <span style={{ fontSize: 12, color: '#fca5a5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(r.lastError)}>
                                Error: {String(r.lastError)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 8 }}>
                            <button className="secondary small" onClick={() => reindexRepoMutation.mutate(r.repoName)} disabled={reindexRepoMutation.isPending}>Sync</button>
                            <button className="secondary small" onClick={() => {
                              if (window.confirm(`Delete repository ${r.repoName}?`)) deleteRepoMutation.mutate(r.repoName);
                            }} disabled={deleteRepoMutation.isPending}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {showRepoModal && (
              <div className="modalBackdrop">
                <div className="card modal premiumModal" style={{ maxWidth: 600 }}>
                  <header className="modalHeader">
                    <div className="modalTitle">
                      <h2>Add Project Repository</h2>
                      <p className="modalSubtitle">Register and index a repository for this project.</p>
                    </div>
                    <button className="closeBtn" onClick={() => setShowRepoModal(false)}>✕</button>
                  </header>
                  <div className="modalBody">
                    <div className="inputGroup">
                      <label>Repository Name</label>
                      <input className="detailsInput" value={repoInput.repoName} onChange={(e) => setRepoInput({ ...repoInput, repoName: e.target.value })} placeholder="savant-core" autoFocus />
                    </div>
                    <div className="inputGroup" style={{ marginTop: 12 }}>
                      <label>Path</label>
                      <input className="detailsInput" value={repoInput.repoPath} onChange={(e) => setRepoInput({ ...repoInput, repoPath: e.target.value })} placeholder="/Users/ahmedshabbir/code/savant-core" />
                    </div>
                  </div>
                  <div className="modalActions">
                    <button className="secondary" onClick={() => setShowRepoModal(false)}>Cancel</button>
                    <button
                      className="primary"
                      disabled={createRepoMutation.isPending || !repoInput.repoName.trim() || !repoInput.repoPath.trim()}
                      onClick={() => createRepoMutation.mutate({
                        repoName: repoInput.repoName.trim(),
                        repoPath: repoInput.repoPath.trim(),
                        projectId: project?.id
                      })}
                    >
                      {createRepoMutation.isPending ? 'Saving...' : 'Save & Index'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analysis' && project?.id && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="detailsLabel" style={{ marginBottom: 4 }}>Project Analysis</div>
                <div className="helperText" style={{ opacity: 0.8 }}>
                  Generate a shared repo report for agents and developers.
                </div>
              </div>
              <button
                className="primary"
                onClick={() => runAnalysisMutation.mutate()}
                disabled={runAnalysisMutation.isPending || analysisStatus === 'queued' || analysisStatus === 'running'}
              >
                {runAnalysisMutation.isPending || analysisStatus === 'queued' || analysisStatus === 'running'
                  ? 'Analysis Running...'
                  : 'Javis Analysis'}
              </button>
            </div>

            <div className="card" style={{ padding: 14 }}>
              {analysisQuery.isLoading ? (
                <div className="detailsValue">Loading analysis...</div>
              ) : analysisQuery.data ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span className="badge">Generated: {analysisQuery.data.generatedAt ? new Date(analysisQuery.data.generatedAt).toLocaleString() : '—'}</span>
                    <span className="badge">By: {analysisQuery.data.generatedBy || '—'}</span>
                    <span className="badge">Model: {analysisQuery.data.model || '—'}</span>
                    <span className={`badge ${analysisStatus === 'failed' ? 'danger' : analysisStatus === 'complete' ? 'success' : ''}`.trim()}>
                      Status: {analysisStatus}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, minHeight: 420 }}>
                    <div className="detailsInput" style={{ overflow: 'auto', padding: 8 }}>
                      <div className="detailsLabel" style={{ marginBottom: 8 }}>Files</div>
                      {analysisFiles.length === 0 && (
                        <div className="detailsValue">No files found.</div>
                      )}
                      {analysisFiles.map((file) => (
                        <button
                          key={file.id || file.filePath}
                          type="button"
                          className={`secondary ${selectedFileObj?.filePath === file.filePath ? 'active' : ''}`.trim()}
                          style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6, padding: '8px 10px' }}
                          onClick={() => setSelectedAnalysisFile(file.filePath)}
                          title={file.filePath}
                        >
                          {file.filePath}
                        </button>
                      ))}
                    </div>
                    <div
                      className="detailsInput"
                      style={{ overflow: 'auto', padding: 14, lineHeight: 1.5 }}
                    >
                      {selectedFileObj ? (
                        <>
                          <div className="detailsLabel" style={{ marginBottom: 10 }}>{selectedFileObj.title || selectedFileObj.filePath}</div>
                          <div
                            className="markdownViewer"
                            dangerouslySetInnerHTML={{ __html: markdownToHtml(selectedFileObj.contentMarkdown || '') }}
                          />
                        </>
                      ) : (
                        <div className="detailsValue">No file selected.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="detailsValue">No analysis yet. Click Javis Analysis to generate one.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

import TaskModal from './components/TaskModal';

function ProjectSelector({ projects, onSelect, onNewProject, onEditProject, usersByProject, statsByProject }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects || []).filter(p => {
      if (statusFilter !== 'all') {
        const status = p.active ? 'active' : 'disabled';
        if (status !== statusFilter) return false;
      }
      if (!q) return true;
      const hay = `${p.code || ''} ${p.name || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search, statusFilter]);

  return (
    <div className="layout">
      <aside className="filters">
        <div className="filtersTop">
          <div className="filtersTopTitle">Filters</div>
        </div>
        <FilterSection title="Search">
          <div className="filtersInputRow">
            <input
              className="detailsInput"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </FilterSection>
        <FilterSection title="Status">
          <div className="filtersInputRow">
            <select
              className="detailsInput"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </FilterSection>
      </aside>
      <div className="container projectSelectorContainer">
        <div className="projectSelectorHeader">
          <h1>Projects</h1>
          <div className="row" style={{ gap: 8 }}>
            <button className="tiny secondary" onClick={() => setViewMode(v => v === 'table' ? 'cards' : 'table')} title="Toggle view">
              {viewMode === 'table' ? '▦' : '≡'}
            </button>
            <button onClick={onNewProject}>+ New Project</button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
                  <th style={{ padding: '8px 6px' }}>Code</th>
                  <th style={{ padding: '8px 6px' }}>Project</th>
                  <th style={{ padding: '8px 6px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const projectColor = p.color || colorForProject(p.id).solid;
                  const code = p.code || projectCode(p.name);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                      <td style={{ padding: '10px 6px' }}>
                        <span className="dot" style={{ background: projectColor, marginRight: 8 }} />
                        <strong>{code}</strong>
                      </td>
                      <td style={{ padding: '10px 6px', cursor: 'pointer' }} onClick={() => onSelect(p.id)}>{p.name}</td>
                      <td style={{ padding: '10px 6px', display: 'flex', gap: 6 }}>
                        <button className="tiny secondary" onClick={() => onSelect(p.id)}>Open</button>
                        <button className="tiny" onClick={() => onEditProject(p)} title="Settings">Settings</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="projectGrid">
            {filtered.map(p => {
              const projectColor = p.color || colorForProject(p.id).solid;
              const code = p.code || projectCode(p.name);
              const stats = statsByProject?.[p.id] || {};
              const userCount = usersByProject?.[p.id] || 0;
              return (
                <div
                  key={p.id}
                  className="projectCard"
                  onClick={() => onSelect(p.id)}
                  style={{ borderLeft: `6px solid ${projectColor}` }}
                >
                  <div className="projectCardContent">
                    <div className="projectCardTop">
                      <span className="dot" style={{ background: projectColor }} />
                      <span className="projectCardCode">{code}</span>
                    </div>
                    <div className="projectCardName" style={{ color: projectColor }}>{p.name}</div>
                    <div className="taskBadges compact" style={{ marginTop: 8 }}>
                      <span className="badge">Users:{userCount}</span>
                      <span className="badge">Epics:{stats.epics || 0}</span>
                      <span className="badge">Stories:{stats.stories || 0}</span>
                      <span className="badge">Bugs:{stats.bugs || 0}</span>
                      <span className="badge">Done:{stats.percentDone || 0}%</span>
                    </div>
                  </div>
                  <button
                    className="tiny projectSettingsBtn"
                    onClick={(e) => { e.stopPropagation(); onEditProject(p); }}
                    title="Settings"
                  >
                    ⚙
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function useClientErrorReporting() {
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    const ignoreResizeObserver = (msg) =>
      typeof msg === 'string' && msg.includes('ResizeObserver loop completed');

    const onError = (event) => {
      const message = event?.message || 'Unknown error';
      if (ignoreResizeObserver(message)) return;
      const stack = event?.error?.stack;
      const payload = { message, stack, extra: { source: event?.filename, line: event?.lineno, col: event?.colno } };
      setLastError(payload);
      apiReportClientError(payload);
    };

    const onRejection = (event) => {
      const reason = event?.reason;
      const message = reason?.message || String(reason || 'Unhandled rejection');
      if (ignoreResizeObserver(message)) return;
      const stack = reason?.stack;
      const payload = { message, stack, extra: { type: 'unhandledrejection' } };
      setLastError(payload);
      apiReportClientError(payload);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return lastError;
}

function AdminUsersPage({ users, onRefresh, collapsed, isLoading, isError, agents, projects }) {
  const isMainAgent = (agent) => {
    const name = String(agent?.name || '').trim().toLowerCase();
    const talonId = String(agent?.talonAgentId || '').trim().toLowerCase();
    return agent?.type === 'main' || !!agent?.isMain || name === 'jarvis' || talonId === 'jarvis';
  };

  const safeUsers = Array.isArray(users)
    ? users
    : (users && Array.isArray(users.data) ? users.data : []);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [password, setPassword] = useState('');
  const [preferredAgentId, setPreferredAgentId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [isErrorLocal, setIsErrorLocal] = useState(false);
  const [draftById, setDraftById] = useState({});
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [editingUserId, setEditingUserId] = useState(null);
  const [resetModal, setResetModal] = useState(null); // { title, value }
  const [viewMode, setViewMode] = useState('cards');

  useEffect(() => {
    const next = {};
    for (const u of (safeUsers || [])) {
      next[u.id] = {
        displayName: u.displayName || '',
        role: u.role || 'MEMBER',
        active: !!u.active,
        projectIds: (u.projects || []).map(p => p.id),
        preferredAgentId: u.preferredAgentId || '',
        monthlyTokenLimit: u.monthlyTokenLimit,
        monthlyCostLimit: u.monthlyCostLimit
      };
    }
    setDraftById(next);
  }, [safeUsers]);

  const projectOptions = useMemo(() => (
    (projects || []).map(p => ({ value: p.id, label: `${p.code} — ${p.name}` }))
  ), [projects]);

  const agentOptions = useMemo(() => {
    return (agents || [])
      .filter(a => (a.status === 'active' || a.status === 'idle') && !isMainAgent(a))
      .map(a => ({ value: a.id, label: `${a.name}${a.status ? ` · ${a.status}` : ''}` }));
  }, [agents]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return (safeUsers || []).filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all') {
        const active = u.active ? 'active' : 'disabled';
        if (active !== statusFilter) return false;
      }
      if (projectFilter !== 'all') {
        const ids = (u.projects || []).map(p => p.id);
        if (!ids.includes(projectFilter)) return false;
      }
      if (!q) return true;
      const hay = `${u.username || ''} ${u.displayName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [safeUsers, userSearch, roleFilter, statusFilter, projectFilter]);

  const updateDraft = (id, patch) => {
    setDraftById(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch }
    }));
  };

  const generatePassword = (len = 12) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  const create = async () => {
    setMsg(null); setIsErrorLocal(false);
    try {
      const r = await apiPost('/api/admin/users', {
        username,
        displayName,
        role,
        password,
        preferredAgentId: preferredAgentId || undefined
      });
      setMsg(`Created ${r.data.username}. API key: ${r.data.apiKey} (copy now)`);
      setUsername(''); setDisplayName(''); setRole('MEMBER'); setPassword(''); setPreferredAgentId('');
      onRefresh();
      setCreateOpen(false);
    } catch (e) {
      setIsErrorLocal(true);
      setMsg(e.message || 'Create user failed');
    }
  };

  return (
    <div className={(collapsed ? 'layout leftCollapsed' : 'layout') + (editingUserId ? ' withRight' : '')}>
      <aside className="filters">
        <div className="filtersTop">
          <div className="filtersTopTitle">Users</div>
        </div>
        <FilterSection title="Search" initialOpen={true}>
          <div className="filtersInputRow">
            <input
              className="detailsInput"
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
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
              <option value="ADMIN">ADMIN</option>
              <option value="MEMBER">MEMBER</option>
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
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </FilterSection>
        <FilterSection title="Project">
          <div className="filtersInputRow">
            <select
              className="detailsInput"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="all">All projects</option>
              {(projects || []).map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
        </FilterSection>
      </aside>
      <div className="container">
        {isLoading ? (
          <div style={{ padding: 20 }}>Loading users…</div>
        ) : isError ? (
          <div style={{ padding: 20, color: '#ef4444' }}>Error loading users.</div>
        ) : (
          <>
            <div className="header">
              <h1 style={{ margin: 0 }}>Users</h1>
              <div className="row" style={{ gap: 10 }}>
                <button
                  className="tiny secondary"
                  onClick={() => setViewMode(v => v === 'table' ? 'cards' : 'table')}
                  title="Toggle view"
                  style={{ padding: '6px 10px', height: 32 }}
                >
                  {viewMode === 'table' ? '▦ Cards' : '≡ Table'}
                </button>
                <button className="primary" onClick={() => { setMsg(null); setIsErrorLocal(false); setCreateOpen(true); }}>+ New User</button>
              </div>
            </div>

            {msg ? (
              <div className={isErrorLocal ? 'callout error' : 'callout success'} style={{ marginTop: 14 }}>{msg}</div>
            ) : null}

            {viewMode === 'table' ? (
              <div className="card" style={{ marginTop: 14 }}>
                <h3 style={{ marginTop: 0 }}>Users ({safeUsers.length})</h3>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
                          <th style={{ padding: '8px 6px' }}>User</th>
                          <th style={{ padding: '8px 6px' }}>Display name</th>
                          <th style={{ padding: '8px 6px' }}>Role</th>
                          <th style={{ padding: '8px 6px' }}>Status</th>
                          <th style={{ padding: '8px 6px' }}>Projects</th>
                          <th style={{ padding: '8px 6px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(filteredUsers || []).length ? (
                          (filteredUsers || []).map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                              <td style={{ padding: '10px 6px' }}><strong>{u.username}</strong></td>
                              <td style={{ padding: '10px 6px' }}>{u.displayName || '—'}</td>
                              <td style={{ padding: '10px 6px' }}>{u.role}</td>
                              <td style={{ padding: '10px 6px' }}>{u.active ? 'active' : 'disabled'}</td>
                              <td style={{ padding: '10px 6px' }}>{(u.projects || []).length}</td>
                              <td style={{ padding: '10px 6px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button className="tiny secondary" onClick={() => setEditingUserId(u.id)}>Edit</button>
                                <button
                                  className="tiny secondary"
                                  onClick={async () => {
                                    const nextActive = !u.active;
                                    await apiPatch(`/api/admin/users/${u.id}`, { active: nextActive });
                                    updateDraft(u.id, { active: nextActive });
                                    onRefresh();
                                  }}
                                >
                                  {u.active ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                  className="tiny"
                                  onClick={async () => {
                                    const r = await apiPost(`/api/admin/users/${u.id}/api-key`, {});
                                    setResetModal({ title: `New API key for ${u.username}`, value: r.data.apiKey });
                                  }}
                                >
                                  Reset Key
                                </button>
                                <button
                                  className="tiny"
                                  onClick={async () => {
                                    const pw = generatePassword();
                                    await apiPost(`/api/admin/users/${u.id}/password`, { password: pw });
                                    setResetModal({ title: `New password for ${u.username}`, value: pw });
                                  }}
                                >
                                  Reset Pwd
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} style={{ padding: '12px 6px', fontSize: 12, opacity: 0.7 }}>
                              No users match the current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="projectGrid">
                {(filteredUsers || []).map(u => {
                  const statusColor = u.active ? '#22c55e' : '#94a3b8';
                  return (
                    <div
                      key={u.id}
                      className="projectCard"
                      onClick={() => setEditingUserId(u.id)}
                      style={{ borderLeft: `6px solid ${statusColor}` }}
                    >
                      <div className="projectCardContent">
                        <div className="projectCardTop">
                          <span className="dot" style={{ background: statusColor }} />
                          <span className="projectCardCode">{String(u.username).slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="projectCardName" style={{ color: statusColor }}>{u.username}</div>
                        <div className="taskBadges compact" style={{ marginTop: 8 }}>
                          <span className="badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}>{u.role}</span>
                          <span className="badge" style={{ backgroundColor: 'rgba(167, 139, 250, 0.1)', color: '#a78bfa', border: '1px solid rgba(167, 139, 250, 0.2)' }}>{u.active ? 'Active' : 'Disabled'}</span>
                          <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>Projects: {(u.projects || []).length}</span>
                        </div>
                      </div>
                      <button
                        className="tiny projectSettingsBtn"
                        onClick={(e) => { e.stopPropagation(); setEditingUserId(u.id); }}
                        title="Edit User"
                      >
                        ⚙
                      </button>
                    </div>
                  );
                })}
                {(filteredUsers || []).length === 0 ? (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, opacity: 0.5 }}>No users found</div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {createOpen ? (
        <div className="modalBackdrop">
          <div className="card modal premiumModal">
            <header className="modalHeader">
              <div className="modalTitle">
                <h2>Create User</h2>
                <p className="modalSubtitle">Add a new user account</p>
              </div>
              <button className="closeBtn" onClick={() => setCreateOpen(false)}>✕</button>
            </header>
            <div className="modalBody">
              {msg ? (
                <div style={{ marginBottom: 15, padding: '10px', borderRadius: 4, background: isErrorLocal ? 'rgba(255,0,0,0.1)' : 'rgba(0,255,0,0.1)', color: isErrorLocal ? 'salmon' : 'lightgreen', whiteSpace: 'pre-wrap' }}>{msg}</div>
              ) : null}

              <div className="inputGroup">
                <label>Username (immutable)</label>
                <input className="detailsInput" value={username} onChange={e => setUsername(e.target.value)} />
              </div>

              <div className="inputGroup" style={{ marginTop: 15 }}>
                <label>Display name</label>
                <input className="detailsInput" value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>

              <div className="inputGroup" style={{ marginTop: 15 }}>
                <label>Role</label>
                <select className="detailsInput" value={role} onChange={e => setRole(e.target.value)}>
                  <option value="MEMBER">MEMBER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="inputGroup" style={{ marginTop: 15 }}>
                <label>Preferred agent</label>
                <select className="detailsInput" value={preferredAgentId} onChange={(e) => setPreferredAgentId(e.target.value)}>
                  <option value="">None</option>
                  {agentOptions.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="inputGroup" style={{ marginTop: 15 }}>
                <label>Temporary password</label>
                <input type="password" className="detailsInput" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="modalActions">
              <button className="secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="primary" onClick={create}>Create</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingUserId ? (() => {
        const user = (safeUsers || []).find(u => u.id === editingUserId);
        if (!user) return null;
        return (
          <div className="detailsOverlay">
            <div className="detailsBackdrop" onClick={() => setEditingUserId(null)} />
            <UserEditDrawer
              user={user}
              draftById={draftById}
              updateDraft={updateDraft}
              projectOptions={projectOptions}
              agentOptions={agentOptions}
              onClose={() => setEditingUserId(null)}
              onSave={async (user, draft) => {
                await apiPatch(`/api/admin/users/${user.id}`, {
                  displayName: draft.displayName || '',
                  role: draft.role || 'MEMBER',
                  active: !!draft.active,
                  preferredAgentId: draft.preferredAgentId || null,
                  monthlyTokenLimit: draft.monthlyTokenLimit ?? undefined,
                  monthlyCostLimit: draft.monthlyCostLimit ?? undefined,
                  color: draft.color || undefined
                });
                await apiPost(`/api/admin/users/${user.id}/projects`, { projectIds: draft.projectIds || [] });
                onRefresh();
                setEditingUserId(null);
              }}
            />
          </div>
        );
      })() : null}

      {resetModal ? (
        <div className="modalBackdrop">
          <div className="card modal premiumModal">
            <header className="modalHeader">
              <div className="modalTitle">
                <h2>{resetModal.title}</h2>
                <p className="modalSubtitle">Copy and store this securely</p>
              </div>
              <button className="closeBtn" onClick={() => setResetModal(null)}>✕</button>
            </header>
            <div className="modalBody">
              <div className="inputGroup">
                <label>Value</label>
                <input className="detailsInput" readOnly value={resetModal.value || ''} />
              </div>
            </div>
            <div className="modalActions">
              <button className="secondary" onClick={() => setResetModal(null)}>Close</button>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resetModal.value || '');
                    setMsg('Copied to clipboard');
                    setIsErrorLocal(false);
                  } catch {
                    setMsg('Copy failed');
                    setIsErrorLocal(true);
                  }
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  return (
    <div className="container loginContainer">
      <div className="card" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Sign in</h3>
        {error ? <div style={{ color: 'salmon', marginBottom: 10 }}>{error}</div> : null}
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <input className="detailsInput" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          <input className="detailsInput" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          <button onClick={async () => {
            setError(null);
            try {
              const r = await apiPost('/api/login', { username, password });
              localStorage.setItem('task_api_key', r.data.apiKey);
              localStorage.setItem('task_username', r.data.username);
              if (r.data.role) localStorage.setItem('task_role', normalizeRole(r.data.role));
              onLoggedIn();
            } catch (e) {
              setError(e.message || 'Login failed');
            }
          }}>Login</button>
        </div>
      </div>
    </div>
  );
}

function Board() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [authed, setAuthed] = useState(!!localStorage.getItem('task_api_key'));
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_BASE || 'http://localhost:3333');

    socket.on('connect', () => console.log('WebSocket connected'));

    socket.on('task.create', () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['epics'] });
    });

    socket.on('task.move', () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['epics'] });
    });

    socket.on('task.update', () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['epics'] });
    });

    socket.on('task.comment', ({ taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    });

    return () => socket.disconnect();
  }, [queryClient]);

  const [notifications, setNotifications] = useState([]);
  const pushNotification = (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, type === 'error' ? 10000 : 6000);
  };

  useEffect(() => {
    setApiErrorCallback((msg) => {
      pushNotification(msg, 'error');
    });
  }, []);
  const [currentUserRole, setCurrentUserRole] = useState(() => {
    const stored = localStorage.getItem('task_role');
    return stored ? normalizeRole(stored) : '';
  });
  const isAdmin = normalizeRole(currentUserRole) === 'ADMIN';
  const lastError = useClientErrorReporting();
  const pathname = location.pathname || '/';

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light-mode' : '';
  }, [theme]);

  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/projects').then(r => r.data),
    enabled: authed
  });

  const usersQ = useQuery({
    queryKey: ['users', currentUserRole],
    queryFn: () => {
      const role = normalizeRole(currentUserRole);
      return apiGet(role === 'ADMIN' ? '/api/admin/users' : '/api/users').then(r => r.data);
    },
    enabled: authed
  });

  useEffect(() => {
    const projects = projectsQ.data || [];
    if (!projects.length) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(projects.map(async (p) => {
        try {
          const res = await apiGet(`/api/projects/${p.id}/epics`).then(r => r.data);
          return { projectId: p.id, epics: res.epics || [] };
        } catch {
          return { projectId: p.id, epics: [] };
        }
      }));
      if (cancelled) return;
      const next = {};
      for (const r of results) {
        const epics = r.epics || [];
        let stories = 0;
        let bugs = 0;
        let total = 0;
        let done = 0;
        for (const e of epics) {
          for (const s of (e.stories || [])) {
            total += 1;
            if ((s.type || 'story') === 'bug') bugs += 1; else stories += 1;
            const status = s.columnName || '';
            if (status.toLowerCase() === 'done') done += 1;
          }
        }
        next[r.projectId] = {
          epics: epics.length,
          stories,
          bugs,
          percentDone: total ? Math.round((done / total) * 100) : 0
        };
      }
      setProjectStatsById(next);
    })();
    return () => { cancelled = true; };
  }, [projectsQ.data]);

  const [projectModal, setProjectModal] = useState(null); // {project: null | projectObject, open: boolean }
  const [projectStatsById, setProjectStatsById] = useState({});
  const [taskModal, setTaskModal] = useState({ open: false });

  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const currentView = useMemo(() => {
    if (pathname.startsWith('/profile')) return 'profile';
    if (pathname.startsWith('/users')) return 'adminUsers';
    if (pathname.startsWith('/agents')) return 'agents';
    if (pathname.startsWith('/providers')) return 'providers';
    if (pathname.startsWith('/llm')) return 'llm';
    if (pathname.startsWith('/logout')) return 'logout';
    if (pathname.match(/^\/projects\/[^/]+\/epics/)) return 'epics';
    if (pathname.match(/^\/projects\/[^/]+\/storyboard/)) return 'board';
    if (pathname === '/projects' || pathname === '/') return 'projects';
    return 'projects';
  }, [pathname]);

  // Sync project ID from URL
  useEffect(() => {
    const match = pathname.match(/^\/projects\/([^/]+)/);
    if (match) {
      if (selectedProjectId !== match[1]) setSelectedProjectId(match[1]);
    } else {
      if (selectedProjectId) setSelectedProjectId(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!currentUserRole) return;
    const admin = normalizeRole(currentUserRole) === 'ADMIN';
    if (currentView === 'adminUsers' && !admin) {
      navigate('/profile', { replace: true });
    }
    if (currentView === 'agents' && !admin) {
      navigate('/profile', { replace: true });
    }
    if (currentView === 'llm' && !admin) {
      navigate('/profile', { replace: true });
    }
  }, [currentView, currentUserRole, navigate]);
  const [selectedStatusNames, setSelectedStatusNames] = useState([]);
  const [dueMode, setDueMode] = useState('all');
  const [assignee, setAssignee] = useState([]);
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedEpicId, setSelectedEpicId] = useState('');
  const [selectedCreatedBy, setSelectedCreatedBy] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState(() => {
    const stored = localStorage.getItem('task_group_by') || '';
    const allowed = new Set(['none', 'priority', 'type', 'epic', 'assignee']);
    return allowed.has(stored) ? stored : 'epic';
  }); // none | priority | type | epic | assignee
  const [hideDone, setHideDone] = useState(false);

  const adminUsersQ = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiGet('/api/admin/users').then(r => r.data),
    enabled: authed && (currentView === 'adminUsers' || isAdmin || normalizeRole(localStorage.getItem('task_role')) === 'ADMIN')
  });
  const [epicSearch, setEpicSearch] = useState('');
  const [epicStatusFilter, setEpicStatusFilter] = useState('');
  const [epicAssigneeFilter, setEpicAssigneeFilter] = useState('');
  // Filters panel should be closed by default
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(true);

  const onToggleLeft = () => {
    if (leftCollapsed) {
      setLeftCollapsed(false);
      setRightCollapsed(true);
    } else {
      setLeftCollapsed(true);
    }
  };

  const onToggleRight = () => {
    if (rightCollapsed) {
      setRightCollapsed(false);
      setLeftCollapsed(true);
    } else {
      setRightCollapsed(true);
    }
  };

  useEffect(() => {
    if (currentView === 'board' || currentView === 'epics') {
      setLeftCollapsed(true);
      setRightCollapsed(true);
    }
  }, [currentView, selectedProjectId]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [commentAuthor, setCommentAuthor] = useState(localStorage.getItem('task_username') || 'User');
  // notifications state moved up to support pushNotification helper
  const seenActivityIdsRef = useRef(new Set());

  const selectedProject = useMemo(
    () => (projectsQ.data || []).find(p => p.id === selectedProjectId) || null,
    [projectsQ.data, selectedProjectId]
  );

  // Sync document title
  useEffect(() => {
    const base = 'Task Master';
    switch (currentView) {
      case 'profile':
        document.title = `${base} - Profile`;
        break;
      case 'adminUsers':
        document.title = `${base} - Users`;
        break;
      case 'agents':
        document.title = `${base} - Agents`;
        break;
      case 'epics':
        document.title = selectedProject ? `${selectedProject.code} - Epic Board` : `${base} - Epics`;
        break;
      case 'board':
        document.title = selectedProject ? `${selectedProject.code} - Story Board` : `${base} - Story Board`;
        break;
      case 'projects':
      default:
        document.title = `${base} - Projects`;
        break;
    }
  }, [currentView, selectedProject]);

  // card collapse state: default collapsed in Done; default open elsewhere
  const [collapsedById, setCollapsedById] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const boardsData = useMemo(() => {
    if (!projectsQ.data) return [];
    return projectsQ.data.map(p => ({
      project: p,
      columns: p.columns || [],
      tasks: (usersQ.data || []).flatMap(u => (u.tasks || []).filter(t => t.projectId === p.id))
    })).filter(b => b.tasks.length > 0 || (selectedProjectId && b.project.id === selectedProjectId));
  }, [projectsQ.data, usersQ.data, selectedProjectId]);

  const epicsQ = useQuery({
    queryKey: ['epics', selectedProjectId],
    queryFn: () => apiGet(`/api/projects/${selectedProjectId}/epics`).then(r => r.data),
    enabled: authed && !!selectedProjectId && (currentView === 'board' || currentView === 'epics')
  });

  const agentMessagesQ = useQuery({
    queryKey: ['agent-messages'],
    queryFn: () => apiGet('/api/activity').then(r => r.data), // placeholder
    enabled: authed
  });

  const activityFeedQ = useQuery({
    queryKey: ['activity-feed'],
    queryFn: () => apiGet('/api/activity').then(r => r.data),
    enabled: authed
  });

  const documentsQ = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiGet('/api/documents').then(r => r.data),
    enabled: authed
  });

  const agentsQ = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiGet('/api/jarvis/agents-hierarchy').then(r => r.data),
    enabled: authed
  });

  const commentsQ = useQuery({
    queryKey: ['comments', selectedTaskId],
    queryFn: () => apiGet(`/api/tasks/${selectedTaskId}/comments`).then(r => r.data),
    enabled: authed && !!selectedTaskId
  });

  const taskActivityQ = useQuery({
    queryKey: ['task-activity', selectedTaskId],
    queryFn: () => apiGet(`/api/tasks/${selectedTaskId}/activity`).then(r => r.data),
    enabled: authed && !!selectedTaskId
  });

  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [rightSectionOpen, setRightSectionOpen] = useState('feed');
  const [agentMessageAuthor, setAgentMessageAuthor] = useState(localStorage.getItem('task_username') || 'User');
  const [agentMessageDraft, setAgentMessageDraft] = useState('');
  const [activityActorFilter, setActivityActorFilter] = useState('all');
  const [selectedDocId, setSelectedDocId] = useState(null);

  const agentsList = agentsQ.data || [];

  const moveTask = useMutation({
    mutationFn: ({ task, targetColumnName }) => apiPatch(`/api/tasks/${task.id}/move`, { columnName: targetColumnName, order: 0 }),
    onSuccess: () => {
      projectsQ.refetch();
      usersQ.refetch();
      epicsQ.refetch();
    }
  });

  const reorderColumn = useMutation({
    mutationFn: ({ projectId, columnName, orderedTaskIds }) => apiPost('/api/columns/reorder', { projectId, columnName, orderedTaskIds }),
    onSuccess: () => {
      projectsQ.refetch();
      usersQ.refetch();
      epicsQ.refetch();
    }
  });

  const deleteTask = useMutation({
    mutationFn: (id) => apiDelete(`/api/tasks/${id}`),
    onSuccess: () => {
      projectsQ.refetch();
      usersQ.refetch();
      epicsQ.refetch();
    }
  });

  const updateTask = useMutation({
    mutationFn: ({ id, updates }) => apiPatch(`/api/tasks/${id}`, updates),
    onSuccess: () => {
      projectsQ.refetch();
      usersQ.refetch();
      epicsQ.refetch();
    }
  });

  const addComment = useMutation({
    mutationFn: ({ author, body }) => apiPost(`/api/tasks/${selectedTaskId}/comments`, { author, body }),
    onSuccess: () => {
      commentsQ.refetch();
      taskActivityQ.refetch();
    }
  });

  const sendAgentMessage = useMutation({
    mutationFn: (payload) => apiPost('/api/activity', payload), // placeholder
    onSuccess: () => {
      agentMessagesQ.refetch();
    }
  });

  const epicStatsFor = (epic) => {
    const stories = epic.stories || [];

    const byStatus = {};
    const byType = {};
    for (const s of stories) {
      const status = s.columnName || 'Unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
      const t = s.type || 'story';
      byType[t] = (byType[t] || 0) + 1;
    }

    const doneCount = Object.entries(byStatus).reduce((acc, [k, v]) => (
      String(k).toLowerCase() === 'done' ? acc + v : acc
    ), 0);
    const percentDone = stories.length ? Math.round((doneCount / stories.length) * 100) : 0;

    return { byStatus, byType, total: stories.length, doneCount, percentDone };
  };

  const merged = useMemo(() => {
    const stories = epicsQ.data?.stories || [];
    const users = usersQ.data || [];
    const userMap = new Map(users.map(u => [u.username, u]));

    const selectedProject = (projectsQ.data || []).find(p => p.id === selectedProjectId);
    const selectedProjectCode = selectedProject ? (selectedProject.code || projectCode(selectedProject.name)) : '';

    const allTasks = stories.map(t => ({
      ...t,
      projectCode: t.projectCode || selectedProjectCode,
      assigneeUser: userMap.get(t.assignee) || null
    }));

    const projectTasks = allTasks; // epicsQ is already filtered by projectId

    const visibleColNames = selectedProject ? selectedProject.columns.filter(c => c.enabled).map(c => c.name) : ['Backlog', 'Todo', 'Inprogress', 'Review', 'Done'];

    const filtered = projectTasks.filter(t => {
      if (hideDone && t.columnName.toLowerCase() === 'done') return false;
      if (selectedStatusNames.length && !selectedStatusNames.includes(t.columnName)) return false;
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (assignee.length && !assignee.some(a => a.value === t.assignee)) return false;
      if (selectedPriorities.length && !selectedPriorities.some(p => p.value === t.priority)) return false;
      if (selectedTypes.length && !selectedTypes.some(ty => ty.value === t.type)) return false;
      if (selectedCreatedBy.length && !selectedCreatedBy.some(c => c.value === t.createdBy)) return false;
      if (selectedEpicId && t.epicId !== selectedEpicId) return false;
      return true;
    });

    const tasksByColName = {};
    visibleColNames.forEach(c => tasksByColName[c] = []);
    filtered.forEach(t => {
      if (tasksByColName[t.columnName]) tasksByColName[t.columnName].push(t);
    });

    // sort within columns by order
    Object.keys(tasksByColName).forEach(c => {
      tasksByColName[c].sort((a, b) => (a.order || 0) - (b.order || 0));
    });

    return { visibleColNames, tasksByColName };
  }, [epicsQ.data, usersQ.data, projectsQ.data, selectedProjectId, hideDone, searchQuery, assignee, selectedPriorities, selectedTypes, selectedCreatedBy, selectedEpicId]);

  const grouped = useMemo(() => {
    const res = {};
    const visibleCols = merged.visibleColNames;
    const tasksByCol = merged.tasksByColName;

    visibleCols.forEach(colName => {
      const tasks = tasksByCol[colName] || [];
      const groups = {};
      const epicOrderByLabel = new Map();
      const epicColorById = new Map();

      tasks.forEach(t => {
        let label = 'Unassigned';
        if (groupBy === 'priority') {
          label = t.priority || 'medium';
        } else if (groupBy === 'type') {
          label = t.type || 'story';
        } else if (groupBy === 'assignee') {
          label = t.assignee || 'Unassigned';
        } else if (groupBy === 'epic') {
          const epic = (epicsQ.data?.epics || []).find(e => e.id === t.epicId);
          label = epic ? epic.title : 'No Epic';
          if (epic) {
            epicOrderByLabel.set(label, epic.order || 0);
            epicColorById.set(epic.id, epic.epicColor || '#f97316');
          }
        }

        if (!groups[label]) groups[label] = [];
        groups[label].push(t);
      });

      res[colName] = { groups, epicOrderByLabel, epicColorById };
    });

    return res;
  }, [merged, groupBy, epicsQ.data]);

  const epicsFiltered = useMemo(() => {
    const data = epicsQ.data?.epics || [];
    const allEpics = data.map(e => ({ ...e, _statusName: e.columnName }));
    return allEpics.filter(e => {
      if (hideDone && e.columnName.toLowerCase() === 'done') return false;
      if (epicSearch && !e.title.toLowerCase().includes(epicSearch.toLowerCase())) return false;
      if (epicStatusFilter && e.columnName !== epicStatusFilter) return false;
      if (epicAssigneeFilter && e.assignee !== epicAssigneeFilter) return false;
      return true;
    });
  }, [epicsQ.data, hideDone, epicSearch, epicStatusFilter, epicAssigneeFilter]);

  const epicBoardStatusNames = useMemo(() => {
    const project = (projectsQ.data || []).find(p => p.id === selectedProjectId);
    return project ? project.columns.filter(c => c.enabled).map(c => c.name) : ['Backlog', 'Todo', 'Inprogress', 'Review', 'Done'];
  }, [projectsQ.data, selectedProjectId]);

  const detailsOpen = !!selectedTaskId;
  const selectedTaskResolved = useMemo(() => {
    const allStories = epicsQ.data?.stories || [];
    const t = allStories.find(x => x.id === selectedTaskId) || (epicsQ.data?.epics || []).find(x => x.id === selectedTaskId);
    if (!t) return null;
    const project = (projectsQ.data || []).find(p => p.id === t.projectId);
    const assigneeUser = (usersQ.data || []).find(u => u.username === t.assignee);
    return { ...t, project, assigneeUser, _colName: t.columnName };
  }, [selectedTaskId, usersQ.data, epicsQ.data, projectsQ.data]);

  const agentChatUsers = useMemo(() => (usersQ.data || []).filter(u => u.preferredAgentId), [usersQ.data]);
  const assigneeOptions = useMemo(() => (usersQ.data || []).map(u => ({ value: u.username, label: u.displayName || u.username })), [usersQ.data]);

  const onNavigate = (view) => {
    if (view === 'logout') {
      localStorage.removeItem('task_api_key');
      localStorage.removeItem('task_username');
      localStorage.removeItem('task_role');
      setAuthed(false);
      navigate('/login');
      return;
    }
    if (view === 'board') {
      if (selectedProjectId) {
        navigate(`/projects/${selectedProjectId}/storyboard`);
      } else {
        navigate('/projects');
      }
      return;
    }
    if (view === 'epics') {
      if (selectedProjectId) {
        navigate(`/projects/${selectedProjectId}/epics`);
      } else {
        navigate('/projects');
      }
      return;
    }
    if (view === 'adminUsers') {
      navigate('/users');
      return;
    }
    navigate('/' + view);
  };

  if (!authed) {
    return <LoginScreen onLoggedIn={() => setAuthed(true)} />;
  }

  const moveNext = (task) => {
    const cols = merged.visibleColNames;
    const idx = cols.indexOf(task.columnName);
    if (idx < cols.length - 1) {
      moveTask.mutate({ task, targetColumnName: cols[idx + 1] });
    }
  };

  const movePrev = (task) => {
    const cols = merged.visibleColNames;
    const idx = cols.indexOf(task.columnName);
    if (idx > 0) {
      moveTask.mutate({ task, targetColumnName: cols[idx - 1] });
    }
  };

  const onSelectAllStatuses = () => {
    setSelectedStatusNames(merged.visibleColNames);
  };

  const onHideDoneToggle = (val) => {
    setHideDone(val);
    if (val) {
      // If we are hiding done, remove 'Done' from selected status names if present
      setSelectedStatusNames(prev => prev.filter(s => s.toLowerCase() !== 'done'));
    }
  };

  const showRightPanel = !rightCollapsed;

  return (
    <div className="app-shell">
      {notifications.length > 0 && (
        <div className="appNotifications">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notificationItem ${n.type === 'error' ? 'error' : n.type === 'success' ? 'success' : 'info'}`.trim()}
            >
              <span>{n.message}</span>
            </div>
          ))}
        </div>
      )}
      <ControlNav currentView={currentView} isAdmin={isAdmin} onToggleTheme={toggleTheme} onNavigate={onNavigate} theme={theme} />
      <div className="mainArea">
        <AppHeader
          leftCollapsed={leftCollapsed} onToggleLeft={onToggleLeft}
          rightCollapsed={rightCollapsed} onToggleRight={onToggleRight}
          selectedProjectId={selectedProjectId}
        />
        <div className={rightCollapsed ? "mainContent" : "mainContent withRight"}>
          <div className="viewContainer">
            {currentView === 'profile' ? (
              <ProfilePage currentUser={localStorage.getItem('task_username')} agents={agentsList} />
            ) : currentView === 'adminUsers' ? (
              <AdminUsersPage
                users={usersQ.data || []}
                isLoading={usersQ.isLoading}
                isError={usersQ.isError}
                onRefresh={() => usersQ.refetch()}
                collapsed={leftCollapsed}
                agents={agentsList}
                projects={projectsQ.data || []}
              />
            ) : currentView === 'agents' ? (
              <AgentsPage
                agents={agentsList}
                onRefresh={() => {
                  agentsQ.refetch();
                  usersQ.refetch();
                }}
                collapsed={leftCollapsed}
              />
            ) : currentView === 'providers' ? (
              <LLMProvidersPage collapsed={leftCollapsed} />
            ) : currentView === 'llm' ? (
              <LLMRegistryPage collapsed={leftCollapsed} />
            ) : currentView === 'epics' ? (
              <div className={leftCollapsed ? 'layout leftCollapsed' : 'layout'} style={{ height: '100%' }}>
                <FilterDrawer
                  mode="epics"
                  users={usersQ.data || []}
                  epicSearch={epicSearch}
                  setEpicSearch={setEpicSearch}
                  epicStatusFilter={epicStatusFilter}
                  setEpicStatusFilter={setEpicStatusFilter}
                  epicAssigneeFilter={epicAssigneeFilter}
                  setEpicAssigneeFilter={setEpicAssigneeFilter}
                  epicBoardStatusNames={epicBoardStatusNames}
                  hideDone={hideDone}
                  setHideDone={onHideDoneToggle}
                  collapsed={leftCollapsed}
                />
                <div className="container" style={{ margin: 0, maxWidth: 'none' }}>
                  <BoardHeader
                    title={selectedProject?.name + " - Epics"}
                    onBack={() => navigate('/projects')}
                    rightActions={(
                      <div className="row" style={{ gap: 12 }}>
                        <label className="row" style={{ gap: 6, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                          <input type="checkbox" checked={hideDone} onChange={(e) => onHideDoneToggle(e.target.checked)} />
                          <span>Hide Done</span>
                        </label>
                        <button className="primary" onClick={() => setTaskModal({ open: true, initialType: 'epic' })}>+ New Epic</button>
                      </div>
                    )}
                  />
                  <EpicBoard
                    epics={epicsQ.data?.epics || []}
                    epicsFiltered={epicsFiltered}
                    epicBoardStatusNames={epicBoardStatusNames}
                    epicStatsFor={epicStatsFor}
                    dragTaskId={dragTaskId}
                    setDragTaskId={setDragTaskId}
                    collapsedById={collapsedById}
                    setCollapsedById={setCollapsedById}
                    onMoveEpic={(task, col) => moveTask.mutate({ task, targetColumnName: col })}
                    onSelectEpic={setSelectedTaskId}
                  />
                </div>
              </div>
            ) : currentView === 'projects' ? (
              <ProjectSelector
                projects={projectsQ.data || []}
                onSelect={(id) => navigate(`/projects/${id}/storyboard`)}
                onNewProject={() => setProjectModal({ open: true })}
                onEditProject={(p) => setProjectModal({ open: true, project: p })}
                usersByProject={{}}
                statsByProject={projectStatsById}
              />
            ) : (
              <div className={leftCollapsed ? 'layout leftCollapsed' : 'layout'} style={{ height: '100%' }}>
                <FilterDrawer
                  epics={epicsQ.data?.epics || []}
                  selectedEpicId={selectedEpicId}
                  setSelectedEpicId={setSelectedEpicId}
                  statusNames={merged.visibleColNames}
                  selectedStatusNames={selectedStatusNames}
                  setSelectedStatusNames={setSelectedStatusNames}
                  onSelectAllStatuses={onSelectAllStatuses}
                  dueMode={dueMode}
                  setDueMode={setDueMode}
                  assignee={assignee}
                  setAssignee={setAssignee}
                  users={usersQ.data || []}
                  selectedPriorities={selectedPriorities}
                  setSelectedPriorities={setSelectedPriorities}
                  selectedTypes={selectedTypes}
                  setSelectedTypes={setSelectedTypes}
                  selectedCreatedBy={selectedCreatedBy}
                  setSelectedCreatedBy={setSelectedCreatedBy}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  hideDone={hideDone}
                  setHideDone={onHideDoneToggle}
                  collapsed={leftCollapsed}
                />
                <div className="container" style={{ margin: 0, maxWidth: 'none' }}>
                  <BoardHeader
                    title={selectedProject?.name + " - Stories"}
                    onBack={() => navigate('/projects')}
                    rightActions={(
                      <div className="row" style={{ gap: 12 }}>
                        <label className="row" style={{ gap: 6, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                          <input type="checkbox" checked={hideDone} onChange={(e) => onHideDoneToggle(e.target.checked)} />
                          <span>Hide Done</span>
                        </label>
                        <button className="primary" onClick={() => setTaskModal({ open: true, initialType: 'story' })}>+ New Task</button>
                      </div>
                    )}
                  />
                  <StoryBoard
                    merged={merged}
                    grouped={grouped}
                    groupBy={groupBy}
                    epics={epicsQ.data?.epics || []}
                    users={usersQ.data || []}
                    selectedProjectId={selectedProjectId}
                    selectedTaskId={selectedTaskId}
                    setSelectedTaskId={setSelectedTaskId}
                    dragTaskId={dragTaskId}
                    setDragTaskId={setDragTaskId}
                    collapsedById={collapsedById}
                    setCollapsedById={setCollapsedById}
                    collapsedGroups={collapsedGroups}
                    setCollapsedGroups={setCollapsedGroups}
                    onMoveTask={(task, col) => moveTask.mutate({ task, targetColumnName: col })}
                    onReorderColumn={(pid, col, ids) => reorderColumn.mutate({ projectId: pid, columnName: col, orderedTaskIds: ids })}
                    onDeleteTask={(id) => deleteTask.mutate(id)}
                    onPassTask={(task) => {
                      apiPost(`/api/tasks/${task.id}/comments`, { author: commentAuthor, body: 'Ticket was passed' });
                      moveNext(task);
                    }}
                    onFailTask={(task) => movePrev(task)}
                  />
                </div>
              </div>
            )}
          </div>
          {!rightCollapsed && (
            <ActivityDrawer
              agents={agentsList}
              selectedAgentId={selectedAgentId}
              setSelectedAgentId={setSelectedAgentId}
              rightSectionOpen={rightSectionOpen}
              setRightSectionOpen={setRightSectionOpen}
              agentMessages={agentMessagesQ.data || []}
              agentMessageAuthor={agentMessageAuthor}
              setAgentMessageAuthor={setAgentMessageAuthor}
              agentMessageDraft={agentMessageDraft}
              setAgentMessageDraft={setAgentMessageDraft}
              onSendAgentMessage={(payload) => sendAgentMessage.mutate(payload)}
              currentUser={localStorage.getItem('task_username')}
              chatUsers={agentChatUsers}
              assigneeOptions={assigneeOptions}
              activityFeed={activityFeedQ.data || []}
              activityActorFilter={activityActorFilter}
              setActivityActorFilter={setActivityActorFilter}
              documents={documentsQ.data || []}
              selectedDocId={selectedDocId}
              setSelectedDocId={setSelectedDocId}
            />
          )}
        </div>
        <AppFooter>
          <CommandBar inFooter />
        </AppFooter>
      </div>

      {detailsOpen && selectedTaskResolved && (
        <div className="detailsOverlay">
          <div className="detailsBackdrop" onClick={() => setSelectedTaskId(null)} />
          <CardEditDrawer
            task={selectedTaskResolved}
            users={usersQ.data || []}
            statusNames={epicBoardStatusNames}
            epics={epicsQ.data?.epics || []}
            onClose={() => setSelectedTaskId(null)}
            onMove={(t, col) => moveTask.mutate({ task: t, targetColumnName: col })}
            onUpdateTask={(updates) => updateTask.mutate({ id: selectedTaskId, updates })}
            onDelete={(t) => deleteTask.mutate(t.id)}
            comments={commentsQ.data || []}
            activity={taskActivityQ.data || []}
            onAddComment={(payload) => addComment.mutate(payload)}
            currentUser={localStorage.getItem('task_username')}
            onNavigateToTask={(id) => setSelectedTaskId(id)}
          />
        </div>
      )}

      {projectModal?.open && (
        <div className="detailsOverlay">
          <div className="detailsBackdrop" onClick={() => setProjectModal(null)} />
          <ProjectSettingsDrawer
            project={projectModal.project}
            onClose={() => setProjectModal(null)}
            isAdmin={isAdmin}
            agents={agentsList}
            onNotify={pushNotification}
            onSave={async (data) => {
              if (projectModal.project) {
                await apiPatch(`/api/projects/${projectModal.project.id}`, data);
              } else {
                await apiPost('/api/projects', data);
              }
              projectsQ.refetch();
              setProjectModal(null);
            }}
          />
        </div>
      )}

      {taskModal.open && (
        <TaskModal
          open={true}
          onClose={() => setTaskModal({ open: false })}
          initialProjectId={selectedProjectId}
          initialType={taskModal.initialType}
          initialColumnName={taskModal.initialColumnName}
          projects={projectsQ.data || []}
          epics={epicsQ.data?.epics || []}
          users={usersQ.data || []}
          onSave={async (data) => {
            await apiPost('/api/tasks', data);
            await Promise.all([projectsQ.refetch(), usersQ.refetch(), epicsQ.refetch()]);
            setTaskModal({ open: false });
          }}
        />
      )}
    </div>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Board />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
