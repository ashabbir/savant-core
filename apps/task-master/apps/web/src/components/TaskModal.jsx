import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { colorForEpic } from '../utils';

function TaskModal({ onClose, onSave, isSaving, projects, users, epics, initialProjectId, initialColumnName, initialType, initialEpicId, initialAssignee }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium'); // default
  const [type, setType] = useState(initialType || 'story');
  const [assignee, setAssignee] = useState(initialAssignee || '');
  const [epicId, setEpicId] = useState(initialEpicId || '');
  const [epicColor, setEpicColor] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId || (projects && projects[0]?.id) || '');
  const [status, setStatus] = useState(initialColumnName || '');

  const project = projects && projects.find(p => p.id === projectId);

  const statusOptions = useMemo(() => {
    if (project) {
      return project.columns.filter(c => c.enabled).map(c => c.name);
    }
    return ['Backlog', 'Todo', 'Inprogress', 'Done'];
  }, [project]);

  const defaultStatus = initialColumnName || statusOptions[0] || 'Backlog';
  const typeOptions = useMemo(() => {
    if (initialType === 'epic') return ['story'];
    if (initialType === 'story') return ['story', 'bug'];
    return ['story', 'bug', 'epic'];
  }, [initialType]);

  useEffect(() => {
    if (!typeOptions.includes(type)) {
      setType(typeOptions[0] || 'story');
    }
  }, [typeOptions, type]);

  useEffect(() => {
    if (!initialColumnName && status !== defaultStatus) {
      setStatus(defaultStatus);
    }
  }, [projectId, defaultStatus, initialColumnName]);

  useEffect(() => {
    if (initialEpicId) {
      setType('story');
      setEpicId(initialEpicId);
      if (initialAssignee) setAssignee(initialAssignee);
      setStatus(defaultStatus);
    }
  }, [initialEpicId, initialAssignee, defaultStatus]);

  const handleSubmit = () => {
    if (!title.trim() || !projectId) return;

    const available = statusOptions;
    const validColName = available.includes(status) ? status : available[0];
    if (!validColName) return;

    onSave({
      projectId,
      columnName: validColName,
      title,
      description,
      priority,
      type,
      assignee,
      epicId: (type === 'epic') ? null : (epicId || null),
      epicColor: (type === 'epic') ? (epicColor || colorForEpic(title)) : undefined
    });
  };

  return (
    <div className="modalBackdrop">
      <div className="card modal premiumModal">
        <header className="modalHeader">
          <div className="modalTitle">
            <h2>Create New Task</h2>
            <p className="modalSubtitle">Add a new task to your board</p>
          </div>
          <button className="closeBtn" onClick={onClose}>✕</button>
        </header>

        <div className="modalBody">
          <section className="modalSection">
            <div className="inputGroup">
              <label htmlFor="task-title">Task Title</label>
              <input
                id="task-title"
                className="detailsInput"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>

            <div className="inputGroup">
              <label htmlFor="task-desc">Description</label>
              <textarea
                id="task-desc"
                className="detailsTextarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more details..."
                rows={3}
              />
            </div>
          </section>

          <section className="modalSection">
            <div className="inputGroup row">
              <div className="field flex-1">
                <label htmlFor="task-project">Project</label>
                <select id="task-project" className="detailsInput" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!!initialProjectId}>
                  {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="field flex-1">
                <label htmlFor="task-status">Status</label>
                <select id="task-status" className="detailsInput" value={status} onChange={(e) => setStatus(e.target.value)} disabled>
                  {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="inputGroup row">
              <div className="field flex-1">
                <label htmlFor="task-type">Type</label>
                <select id="task-type" className="detailsInput" value={type} onChange={(e) => setType(e.target.value)}>
                  {typeOptions.includes('story') ? <option value="story">Story</option> : null}
                  {typeOptions.includes('bug') ? <option value="bug">Bug</option> : null}
                  {typeOptions.includes('epic') ? <option value="epic">Epic</option> : null}
                </select>
              </div>

              <div className="field flex-1">
                <label htmlFor="task-priority">Priority</label>
                <select id="task-priority" className="detailsInput" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="inputGroup row">
              {type === 'epic' ? (
                <div className="field flex-1">
                  <label htmlFor="task-epic-color">Epic color</label>
                  <input
                    id="task-epic-color"
                    className="detailsInput"
                    value={epicColor}
                    onChange={(e) => setEpicColor(e.target.value)}
                    placeholder="#f97316"
                  />
                </div>
              ) : (
                <div className="field flex-1">
                  <label htmlFor="task-epic">Epic</label>
                  <Select
                    inputId="task-epic"
                    classNamePrefix="select"
                    className="filtersSelect"
                    isClearable
                    placeholder="(No epic)"
                    options={(epics || []).map(e => ({ value: e.id, label: `${e.ticketNumber ? `TM-${e.ticketNumber} ` : ''}${e.title}` }))}
                    value={epicId ? ({ value: epicId, label: ((epics || []).find(e => e.id === epicId)?.title || '') }) : null}
                    onChange={(opt) => setEpicId(opt?.value || '')}
                  />
                </div>
              )}

              <div className="field flex-1">
                <label htmlFor="task-assignee">Assignee</label>
                <select id="task-assignee" className="detailsInput" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">(Unassigned)</option>
                  {(users || []).map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>

        <div className="modalActions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={isSaving || !title.trim() || !projectId}
          >
            {isSaving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskModal;
