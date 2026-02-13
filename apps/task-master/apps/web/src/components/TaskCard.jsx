import React from 'react';

function TaskCard({
  task,
  colName,
  selected,
  collapsed,
  epic,
  onSelect,
  onDragStart,
  onDrop,
  onKeyDown,
  onExpand,
  onCollapse,
  onDelete,
  onPass,
  onFail
}) {
  return (
    <div
      className={selected ? "task selected" : "task"}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      style={{
        borderLeft: (task.assigneeUser && task.assigneeUser.color) ? `5px solid ${task.assigneeUser.color}` : (task.epicId ? `5px solid ${epic?.epicColor || '#f97316'}` : 'none'),
        position: 'relative'
      }}
    >
      <button
        className="tiny deleteBtn"
        title="Delete task"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'transparent',
          color: 'rgba(255,255,255,0.3)',
          padding: 2,
          border: 'none',
          zIndex: 10
        }}
        onMouseEnter={(e) => e.target.style.color = '#ef4444'}
        onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.3)'}
      >
        🗑
      </button>

      {collapsed ? (
        <div className="taskCardCollapsed" style={{ paddingRight: 20 }}>
          <div className="taskTop">
            <div className="taskId">{task.projectCode}-{task.ticketNumber || '?'}</div>
            {task.assigneeUser ? (
              <span
                className="userDot"
                title={`${task.assigneeUser.displayName} (${task.assigneeUser.active ? 'Active' : 'Inactive'})`}
                style={{ background: task.assigneeUser.color || '#3b82f6', boxShadow: `0 0 0 2px ${task.assigneeUser.active ? 'rgba(59, 130, 246, 0.55)' : 'rgba(239, 68, 68, 0.55)'}` }}
              />
            ) : null}
            {task.epicId ? (
              <span
                className="epicDot"
                title={epic ? `${epic.ticketNumber ? `TM-${epic.ticketNumber}` : 'EPIC'}: ${epic.title}` : 'Epic'}
                style={{ background: epic?.epicColor || '#f97316' }}
              />
            ) : null}
            <div className="taskTitle truncated">{task.title}</div>
            <button
              className="uncollapseBtn"
              onClick={(e) => {
                e.stopPropagation();
                onExpand?.();
              }}
            >
              +
            </button>
          </div>
          <div className="taskMetaLine">
            {task.assignee ? <span className="metaItem">@{task.assignee}</span> : null}
            {task.dueAt ? <span className="metaItem"> due {new Date(task.dueAt).toLocaleDateString()}</span> : null}
            {task.type ? <span className={"metaItem type " + task.type}> {task.type}</span> : null}
            <span
              className={"metaItem pri " + (task.priority || 'medium')}
              style={{
                color: (task.priority || 'medium').toLowerCase() === 'high' ? '#ef4444' :
                  (task.priority || 'medium').toLowerCase() === 'medium' ? '#22c55e' :
                    (task.priority || 'medium').toLowerCase() === 'low' ? '#eab308' : undefined
              }}
            >
              {task.priority || 'medium'}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="taskTop" style={{ paddingRight: 20 }}>
            <div className="taskId">{task.projectCode}-{task.ticketNumber || '?'}</div>
            {task.assigneeUser ? (
              <span
                className="userDot"
                title={`${task.assigneeUser.displayName} (${task.assigneeUser.active ? 'Active' : 'Inactive'})`}
                style={{ background: task.assigneeUser.color || '#3b82f6', boxShadow: `0 0 0 2px ${task.assigneeUser.active ? 'rgba(59, 130, 246, 0.55)' : 'rgba(239, 68, 68, 0.55)'}` }}
              />
            ) : null}
            {task.epicId ? (
              <span
                className="epicDot"
                title="Epic"
                style={{ background: epic?.epicColor || '#f97316' }}
              />
            ) : null}
            <div className="taskTitle">{task.title}</div>
            <button
              className="tiny"
              title="Collapse card"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse?.();
              }}
            >
              –
            </button>
          </div>

          {task.description ? (
            <div className="taskDesc">{String(task.description).slice(0, 90)}</div>
          ) : null}
          <div className="taskBadges">
            {task.assignee ? <span className="badge">@{task.assignee}</span> : null}
            {task.dueAt ? <span className="badge">due {new Date(task.dueAt).toLocaleDateString()}</span> : null}
            {task.type ? <span className={"badge type " + task.type}>{task.type}</span> : null}
            <span
              className={"badge pri " + (task.priority || 'medium')}
              style={{
                borderColor: (task.priority || 'medium').toLowerCase() === 'high' ? '#ef4444' :
                  (task.priority || 'medium').toLowerCase() === 'medium' ? '#22c55e' :
                    (task.priority || 'medium').toLowerCase() === 'low' ? '#eab308' : undefined,
                color: (task.priority || 'medium').toLowerCase() === 'high' ? '#ef4444' :
                  (task.priority || 'medium').toLowerCase() === 'medium' ? '#22c55e' :
                    (task.priority || 'medium').toLowerCase() === 'low' ? '#eab308' : undefined
              }}
            >
              {task.priority || 'medium'}
            </span>
          </div>

          <div className="taskActions" style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button
              className="tiny danger"
              title="Fail"
              style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', fontSize: 14, padding: '2px 6px' }}
              onClick={(e) => { e.stopPropagation(); onFail?.(); }}
            >
              ✕
            </button>
            <button
              className="tiny success"
              title="Pass (Move to next)"
              style={{ background: 'transparent', border: '1px solid #22c55e', color: '#22c55e', fontSize: 14, padding: '2px 6px' }}
              onClick={(e) => { e.stopPropagation(); onPass?.(); }}
            >
              ✔
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default TaskCard;
