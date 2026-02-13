import React from 'react';
import EpicCard from './EpicCard';

function EpicBoard({
  epics,
  epicsFiltered,
  epicBoardStatusNames,
  epicStatsFor,
  dragTaskId,
  setDragTaskId,
  collapsedById,
  setCollapsedById,
  onMoveEpic,
  onSelectEpic,
  isLoading
}) {
  if (isLoading) {
    return <div className="card">Loading epics…</div>;
  }

  return (
    <div className="boardScroll">
      <div
        className="board"
        style={{
          gridTemplateColumns: `repeat(${epicBoardStatusNames.length}, minmax(240px, 1fr))`,
          minWidth: epicBoardStatusNames.length * 250
        }}
      >
        {epicBoardStatusNames.map(colName => (
          <div key={colName} className="column">
            <div className="columnHeader">
              <h3>
                {colName}
                <span style={{ marginLeft: 6, opacity: 0.65 }}>({epicsFiltered.filter(e => e._statusName === colName).length})</span>
              </h3>
            </div>
            <div
              className="tasks"
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = (() => {
                  try { return e.dataTransfer.getData('text/task-id'); } catch { return ''; }
                })() || dragTaskId;
                if (!fromId) return;

                const epic = (epics || []).find(x => x.id === fromId);
                if (!epic) return;

                if (String(colName).toLowerCase() === 'done') {
                  const stats = epicStatsFor(epic);
                  if ((stats.percentDone || 0) < 100) {
                    alert('Cannot move Epic to Done: all stories must be completed first.');
                    return;
                  }
                }

                onMoveEpic({ id: fromId, projectId: epic.projectId }, colName);
                setDragTaskId(null);
              }}
            >
              {(epicsFiltered.filter(e => e._statusName === colName)).map(e => {
                const stats = epicStatsFor(e);
                const collapsed = collapsedById[e.id] || false;
                return (
                  <EpicCard
                    key={e.id}
                    epic={e}
                    stats={stats}
                    collapsed={collapsed}
                    onSelect={() => onSelectEpic(e.id)}
                    onDragStart={(ev) => {
                      setDragTaskId(e.id);
                      try { ev.dataTransfer.setData('text/task-id', e.id); } catch { /* ignore */ }
                    }}
                    onExpand={() => setCollapsedById((prev) => ({ ...prev, [e.id]: false }))}
                    onCollapse={() => setCollapsedById((prev) => ({ ...prev, [e.id]: true }))}
                    onPass={() => {
                      if (stats.percentDone < 100) {
                        alert('Cannot complete Epic: all stories must be Done.');
                        return;
                      }
                      onMoveEpic({ id: e.id, projectId: e.projectId }, 'Done');
                    }}
                    onFail={() => {
                      const idx = epicBoardStatusNames.indexOf(colName);
                      if (idx > 0) {
                        onMoveEpic({ id: e.id, projectId: e.projectId }, epicBoardStatusNames[idx - 1]);
                      }
                    }}
                  />
                );
              })}
              {!epicsFiltered.filter(e => e._statusName === colName).length ? (
                <div className="card">No epics</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default EpicBoard;
