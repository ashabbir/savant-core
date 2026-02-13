import React from 'react';

function ActivityDrawer({
  agents,
  selectedAgentId,
  setSelectedAgentId,
  rightSectionOpen,
  setRightSectionOpen,
  agentMessages,
  agentMessageAuthor,
  setAgentMessageAuthor,
  agentMessageDraft,
  setAgentMessageDraft,
  onSendAgentMessage,
  currentUser,
  chatUsers,
  assigneeOptions,
  activityFeed,
  activityActorFilter,
  setActivityActorFilter,
  documents,
  selectedDocId,
  setSelectedDocId
}) {
  console.log('ActivityDrawer render', { rightSectionOpen });
  return (
    <aside className="rightPanel">
      <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Activity & Agents</h3>
      </div>
      <section className="panelSection">
        <div className="panelHeader">
          <span>Agents</span>
          <button
            className="tiny secondary"
            onClick={() => setRightSectionOpen(v => (v === 'agents' ? null : 'agents'))}
          >
            {rightSectionOpen === 'agents' ? '−' : '+'}
          </button>
        </div>
        {rightSectionOpen === 'agents' ? (
          (agents || []).length ? (agents || []).map(a => (
            <div
              key={a.id}
              className={selectedAgentId === a.id ? 'agentCard active' : 'agentCard'}
              onClick={() => setSelectedAgentId(a.id)}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                <div className="agentMeta">{a.role || '—'}</div>
                {a.currentTask ? (
                  <div className="agentMeta">Working: {a.currentTask.title}</div>
                ) : null}
              </div>
              <span className="statusPill">{a.status || 'idle'}</span>
            </div>
          )) : (
            <div className="agentMeta">No agents yet</div>
          )
        ) : null}
      </section>

      <section className="panelSection" style={rightSectionOpen === 'feed' ? { minHeight: '200px' } : {}}>
        <div className="panelHeader">
          <span>Activity Feed</span>
          <button
            className="tiny secondary"
            onClick={() => setRightSectionOpen(v => (v === 'feed' ? null : 'feed'))}
          >
            {rightSectionOpen === 'feed' ? '−' : '+'}
          </button>
        </div>
        {rightSectionOpen === 'feed' ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <select
                className="detailsInput"
                value={activityActorFilter}
                onChange={(e) => setActivityActorFilter(e.target.value)}
              >
                <option value="all">All agents</option>
                {(assigneeOptions || []).map(u => (
                  <option key={u.username} value={u.username}>{u.username}</option>
                ))}
              </select>
            </div>
            <div className="activityFeedList">
              {(activityFeed || [])
                .filter(a => activityActorFilter === 'all' ? true : a.actor === activityActorFilter)
                .map(a => (
                  <div key={a.id} className="activityItem">
                    <div><strong>{a.actor}</strong> · {new Date(a.at).toLocaleString()}</div>
                    <div style={{ opacity: 0.7 }}>{a.action}{a.detail ? ` — ${a.detail}` : ''}</div>
                  </div>
                ))}
              {(!activityFeed || !activityFeed.length) ? (
                <div className="agentMeta">No activity yet</div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      <section className="panelSection">
        <div className="panelHeader">Documents</div>
        {(documents || []).map(d => (
          <div
            key={d.id}
            className={selectedDocId === d.id ? 'docItem active' : 'docItem'}
            onClick={() => setSelectedDocId(d.id)}
          >
            {d.title}
          </div>
        ))}
        {selectedDocId ? (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            {(documents || []).find(d => d.id === selectedDocId)?.content || '—'}
          </div>
        ) : null}
      </section>
    </aside>
  );
}

export default ActivityDrawer;
