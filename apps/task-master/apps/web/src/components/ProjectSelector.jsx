import React, { useMemo, useState } from 'react';
import { colorForProject, projectCode } from '../utils';
import FilterSection from './FilterSection';

function ProjectSelector({ projects, onSelect, onNewProject, onEditProject, usersByProject, statsByProject, collapsed }) {
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
      <aside className={`filters${collapsed ? ' collapsed' : ''}`}>
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
                  const c = colorForProject(p.id);
                  const code = p.code || projectCode(p.name);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                      <td style={{ padding: '10px 6px' }}>
                        <span className="dot" style={{ background: c.solid, marginRight: 8 }} />
                        <strong style={{ marginRight: 8 }}>{code}</strong>
                        <span className={`badge status-${p.active ? 'active' : 'disabled'}`} style={{ fontSize: 10 }}>
                          {p.active ? 'Active' : 'Disabled'}
                        </span>
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
                  style={{ borderLeft: `4px solid ${projectColor}` }}
                >
                  <div className="projectCardContent">
                    <div className="projectCardTop">
                      <span className="dot" style={{ background: projectColor }} />
                      <span className="projectCardCode">{code}</span>
                    </div>
                    <div className="projectCardName">{p.name}</div>
                    <div className="taskBadges compact" style={{ marginTop: 8 }}>
                      <span className={`badge status-${p.active ? 'active' : 'disabled'}`}>
                        {p.active ? 'Active' : 'Disabled'}
                      </span>
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

export default ProjectSelector;
