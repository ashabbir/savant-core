import React from 'react';
import TaskCard from './TaskCard';

function StoryBoard({
  merged,
  grouped,
  groupBy,
  epics,
  users, // Pass users down
  selectedProjectId,
  selectedTaskId,
  setSelectedTaskId,
  dragTaskId,
  setDragTaskId,
  collapsedById,
  setCollapsedById,
  collapsedGroups,
  setCollapsedGroups,
  onMoveTask,
  onReorderColumn,
  onDeleteTask,
  onPassTask,
  onFailTask
}) {
  return (
    <div className="boardScroll">
      <div
        className="board"
        style={{
          gridTemplateColumns: `repeat(${merged.visibleColNames.length}, minmax(240px, 1fr))`,
          minWidth: merged.visibleColNames.length * 250
        }}
      >
        {merged.visibleColNames.map(colName => (
          <div key={colName} className="column">
            <div className="columnHeader">
              <h3>
                {colName}
                <span style={{ marginLeft: 6, opacity: 0.65 }}>({(merged.tasksByColName[colName] || []).length})</span>
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

                const colTasks = (merged.tasksByColName[colName] || []);
                const alreadyHere = colTasks.some(t => t.id === fromId);
                if (alreadyHere) return;

                onMoveTask({ id: fromId, projectId: selectedProjectId }, colName);
                setDragTaskId(null);
              }}
            >
              {(() => {
                const renderTask = (task) => {
                  const collapsed = (collapsedById[task.id] !== undefined)
                    ? collapsedById[task.id]
                    : (colName === 'Done');
                  const epic = (epics || []).find(e => e.id === task.epicId);
                  const assigneeUser = (users || []).find(u => u.username === task.assignee);
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      colName={colName}
                      epic={epic}
                      assigneeUser={assigneeUser} // Pass assigneeUser down
                      selected={selectedTaskId === task.id}
                      collapsed={collapsed}
                      onSelect={() => setSelectedTaskId(task.id)}
                      onDragStart={(e) => {
                        setDragTaskId(task.id);
                        try { e.dataTransfer.setData('text/task-id', task.id); } catch { /* ignore */ }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromId = (() => {
                          try { return e.dataTransfer.getData('text/task-id'); } catch { return ''; }
                        })() || dragTaskId;
                        const toId = task.id;
                        if (!fromId || fromId === toId) return;

                        const colTasks = (merged.tasksByColName[colName] || []).map(t => t.id);
                        const fromIdx = colTasks.indexOf(fromId);
                        const toIdx = colTasks.indexOf(toId);
                        if (fromIdx === -1 || toIdx === -1) return;

                        const next = colTasks.slice();
                        next.splice(fromIdx, 1);
                        next.splice(toIdx, 0, fromId);

                        onReorderColumn(task.projectId, colName, next);
                        setDragTaskId(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") setSelectedTaskId(task.id); }}
                      onExpand={() => setCollapsedById((prev) => ({ ...prev, [task.id]: false }))}
                      onCollapse={() => setCollapsedById((prev) => ({ ...prev, [task.id]: true }))}
                      onDelete={() => onDeleteTask && onDeleteTask(task.id)}
                      onPass={() => onPassTask && onPassTask(task)}
                      onFail={() => onFailTask && onFailTask(task)}
                    />
                  );
                };

                if (groupBy === 'none') {
                  return (merged.tasksByColName[colName] || []).map(renderTask);
                }

                const groupInfo = grouped[colName] || {};
                const entries = Object.entries(groupInfo.groups || {});
                const orderKey = (name) => {
                  if (name === 'Unassigned') return 10_000;
                  if (groupBy === 'priority') {
                    const m = { high: 1, medium: 2, low: 3 };
                    return m[String(name).toLowerCase()] || 999;
                  }
                  if (groupBy === 'type') {
                    const m = { epic: 1, bug: 2, story: 3 };
                    return m[String(name).toLowerCase()] || 999;
                  }
                  if (groupBy === 'epic') {
                    return groupInfo.epicOrderByLabel?.get(name) ?? 10_000;
                  }
                  return 100;
                };

                entries.sort((a, b) => {
                  const ak = orderKey(a[0]);
                  const bk = orderKey(b[0]);
                  if (ak !== bk) return ak - bk;
                  return String(a[0]).localeCompare(String(b[0]));
                });

                return entries.map(([groupName, tasks]) => {
                  const epicColor = (groupBy === 'epic' && tasks[0]?.epicId)
                    ? (groupInfo.epicColorById?.get(tasks[0].epicId) || '#f97316')
                    : null;
                  const typeKey = String(groupName || '').toLowerCase();
                  const typeColor = (groupBy === 'type')
                    ? (typeKey === 'story' ? '#22c55e' : typeKey === 'bug' ? '#ef4444' : typeKey === 'epic' ? '#a78bfa' : null)
                    : null;
                  const priKey = String(groupName || '').toLowerCase();
                  const priColor = (groupBy === 'priority')
                    ? (priKey === 'high' ? '#ef4444' : priKey === 'medium' ? '#f97316' : priKey === 'low' ? '#eab308' : null)
                    : null;
                  const laneColor = typeColor || priColor || epicColor;
                  const collapseKey = `${colName}::${groupName}`;
                  const isCollapsed = !!collapsedGroups[collapseKey];
                  return (
                    <div key={groupName} className="swimlane" style={laneColor ? { borderColor: laneColor } : undefined}>
                      <div
                        className="swimlaneHeader"
                        style={laneColor ? { color: laneColor } : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => setCollapsedGroups(prev => ({ ...prev, [collapseKey]: !prev[collapseKey] }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') setCollapsedGroups(prev => ({ ...prev, [collapseKey]: !prev[collapseKey] })); }}
                        title={isCollapsed ? 'Expand group' : 'Collapse group'}
                      >
                        {groupName}
                        <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 12 }}>
                          ({tasks.length}) {isCollapsed ? '▸' : '▾'}
                        </span>
                      </div>
                      {!isCollapsed ? tasks.map(renderTask) : null}
                    </div>
                  );
                });
              })()}
              {(merged.tasksByColName[colName] || []).length === 0 ? (
                <div className="card">No stories</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StoryBoard;
