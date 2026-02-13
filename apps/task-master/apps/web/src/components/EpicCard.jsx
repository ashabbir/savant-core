import React from 'react';

function EpicCard({ epic, stats, collapsed, onSelect, onDragStart, onExpand, onCollapse, onPass, onFail }) {
  const pct = stats.percentDone || 0;
  const pillBg = pct >= 100 ? 'rgba(34,197,94,0.18)' : pct <= 40 ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)';
  const pillColor = pct >= 100 ? '#22c55e' : pct <= 40 ? '#ef4444' : '#3b82f6';
  const statusLine = Object.entries(stats.byStatus);
  const typeLine = Object.entries(stats.byType);

  return (
    <div
      className="projectCard epicCard"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      style={{ borderLeft: `6px solid ${epic.epicColor || '#f97316'}` }}
    >
      <div className="projectCardContent">
        {collapsed ? (
          <>
            <div className="projectCardTop">
              <div className="epicId">{epic.ticketNumber ? `TM-${epic.ticketNumber}` : 'EPIC'}</div>
              <span className="dot" style={{ background: epic.epicColor || '#f97316' }} />
              <div className="epicTitle">{epic.title}</div>
              <button
                className="tiny"
                title="Expand card"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onExpand?.();
                }}
              >
                +
              </button>
            </div>
            <div className="projectCardMeta" style={{ marginTop: 8 }}>
              <span className="badge" style={{ background: pillBg, color: pillColor, borderColor: pillColor }}>
                Done {pct}%
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="projectCardTop">
              <div className="epicId">{epic.ticketNumber ? `TM-${epic.ticketNumber}` : 'EPIC'}</div>
              <span className="dot" style={{ background: epic.epicColor || '#f97316' }} />
              <div className="epicTitle">{epic.title}</div>
              <button
                className="tiny"
                title="Collapse card"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onCollapse?.();
                }}
              >
                –
              </button>
            </div>
            {epic.description ? <div className="projectCardMeta">{String(epic.description).slice(0, 90)}</div> : <div className="projectCardMeta">—</div>}
            <div className="taskBadges compact" style={{ marginTop: 8 }}>
              <span className="badge" style={{ background: pillBg, color: pillColor, borderColor: pillColor }}>
                Done {pct}%
              </span>
              {statusLine.map(([k, v]) => (
                <span key={`status-${k}`} className={`badge status ${String(k).toLowerCase()}`}>
                  {k}:{v}
                </span>
              ))}
            </div>

            <div className="taskActions" style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button
                className="tiny danger"
                title="Fail (Move back)"
                style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', fontSize: 14, padding: '2px 6px' }}
                onClick={(e) => { e.stopPropagation(); onFail?.(); }}
              >
                ✕
              </button>
              <button
                className="tiny success"
                title="Pass (Complete Epic)"
                disabled={pct < 100}
                style={{
                  background: 'transparent',
                  border: `1px solid ${pct < 100 ? '#64748b' : '#22c55e'}`,
                  color: pct < 100 ? '#64748b' : '#22c55e',
                  fontSize: 14,
                  padding: '2px 6px',
                  opacity: pct < 100 ? 0.5 : 1,
                  cursor: pct < 100 ? 'not-allowed' : 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pct < 100) return;
                  onPass?.();
                }}
              >
                ✔
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default EpicCard;
