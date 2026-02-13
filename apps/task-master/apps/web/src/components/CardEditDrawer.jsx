import React, { useEffect, useRef, useState } from 'react';
import Select from 'react-select';
import { dateOnlyToISO, toDateOnlyValue } from '../date';
import { projectCode } from '../utils';
import { apiGet, apiPost } from '../api';

const TICKET_AGENT_CHAT_CACHE_KEY = 'task_master_ticket_agent_chat_cache_v1';
const ticketAgentChatCache = new Map();

function loadTicketAgentCache() {
  try {
    const raw = localStorage.getItem(TICKET_AGENT_CHAT_CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return new Map();
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function persistTicketAgentCache(cacheMap) {
  try {
    const plain = Object.fromEntries(cacheMap.entries());
    localStorage.setItem(TICKET_AGENT_CHAT_CACHE_KEY, JSON.stringify(plain));
  } catch {
    // ignore local storage write failures
  }
}

function CardEditDrawer({
  task,
  users,
  statusNames,
  epics,
  activity,
  onClose,
  onMove,
  onUpdateTask,
  onDelete,
  onCreateStory,
  comments,
  onAddComment,
  currentUser,
  onNavigateToTask
}) {
  const [commentBody, setCommentBody] = useState('');
  const [editing, setEditing] = useState(null); // 'title' | 'assignee' | 'createdBy' | 'dueAt' | 'tags' | 'description'
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [detailsTab, setDetailsTab] = useState('meta');
  const [agentHistory, setAgentHistory] = useState([]);
  const [agentMessage, setAgentMessage] = useState('');
  const [agentMeta, setAgentMeta] = useState({ sessionKey: '', agentName: '', agentKey: '' });
  const [isLoadingAgentTranscript, setIsLoadingAgentTranscript] = useState(false);
  const [isSendingAgentMessage, setIsSendingAgentMessage] = useState(false);
  const [isTestingAgent, setIsTestingAgent] = useState(false);
  const [isResettingAgent, setIsResettingAgent] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentChatError, setAgentChatError] = useState('');
  const agentTranscriptRequestRef = useRef(0);
  const agentHistoryRef = useRef(null);
  const cacheHydratedRef = useRef(false);

  useEffect(() => {
    if (cacheHydratedRef.current) return;
    cacheHydratedRef.current = true;
    const fromStorage = loadTicketAgentCache();
    for (const [key, value] of fromStorage.entries()) {
      ticketAgentChatCache.set(key, value);
    }
  }, []);

  useEffect(() => {
    if (!task) return;
    setEditing(null);
    setDraftTitle(task.title || '');
    setDraftTags(task.tags || '');
    setDraftDesc(task.description || '');
    setDetailsTab('meta');
    const cached = ticketAgentChatCache.get(task.id);
    setAgentHistory(cached?.history || []);
    setAgentMessage('');
    setAgentMeta(cached?.meta || { sessionKey: '', agentName: '', agentKey: '' });
    setAgentStatus(cached?.status || null);
    setAgentChatError('');
    setIsResettingAgent(false);
  }, [task?.id]);

  useEffect(() => {
    if (!task?.id) return;
    ticketAgentChatCache.set(String(task.id), {
      history: agentHistory,
      meta: agentMeta,
      status: agentStatus
    });
    persistTicketAgentCache(ticketAgentChatCache);
  }, [task?.id, agentHistory, agentMeta, agentStatus]);

  useEffect(() => {
    if (!task?.id || detailsTab !== 'agent' || !task.assignee) return;
    const requestId = ++agentTranscriptRequestRef.current;
    setIsLoadingAgentTranscript(true);
    setAgentChatError('');

    apiGet(`/api/tasks/${task.id}/agent-chat/transcript`)
      .then((res) => {
        if (requestId !== agentTranscriptRequestRef.current) return;
        const payload = res.data || {};
        const normalized = (payload.messages || []).map((msg, idx) => {
          const roleRaw = String(msg?.role || '').toLowerCase();
          const role = roleRaw === 'assistant' || roleRaw === 'jarvis'
            ? 'agent'
            : roleRaw === 'user'
              ? 'user'
              : 'system';
          const content = typeof msg?.content === 'string'
            ? msg.content
            : Array.isArray(msg?.content)
              ? msg.content.map(part => part?.text || part?.input_text || '').filter(Boolean).join('\n')
              : '';
          return {
            id: `${payload.sessionKey || task.id}-${idx}`,
            role,
            content
          };
        });
        setAgentMeta({
          sessionKey: payload.sessionKey || '',
          agentName: payload.agentName || '',
          agentKey: payload.agentKey || ''
        });
        setAgentHistory(normalized);
      })
      .catch((err) => {
        if (requestId !== agentTranscriptRequestRef.current) return;
        setAgentChatError(err.message || 'Failed to load transcript');
      })
      .finally(() => {
        if (requestId === agentTranscriptRequestRef.current) {
          setIsLoadingAgentTranscript(false);
        }
      });
  }, [detailsTab, task?.id, task?.assignee]);

  useEffect(() => {
    if (agentHistoryRef.current) {
      agentHistoryRef.current.scrollTop = agentHistoryRef.current.scrollHeight;
    }
  }, [agentHistory, isLoadingAgentTranscript, isSendingAgentMessage]);

  if (!task) return null;

  const people = (users || []).map(u => u.username);
  const safeUser = currentUser || 'User';
  const statusList = Array.isArray(statusNames) ? statusNames : [];
  const statusChoices = statusList;
  const safeColName = statusChoices.includes(task._colName) ? task._colName : (statusChoices[0] || '');

  const currentStatusIndex = statusChoices.indexOf(safeColName);
  const isFirstStatus = currentStatusIndex <= 0;
  const isLastStatus = currentStatusIndex >= statusChoices.length - 1;

  const epicStories = task.type === 'epic'
    ? ((epics || []).find(e => e.id === task.id)?.stories || [])
    : [];
  const epicIdentifierPrefix = task.project?.code || projectCode(task.projectName);
  const sortedComments = [...(comments || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const sortedActivity = [...(activity || [])].sort((a, b) => new Date(b.at) - new Date(a.at));

  const normalizePhase = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const isReviewLikePhase = (value) => {
    const normalized = normalizePhase(value);
    return normalized.includes('review') || normalized.includes('testing') || normalized.includes('qa');
  };
  const isFailableType = task.type === 'story' || task.type === 'bug';
  const canFail = isFailableType && isReviewLikePhase(task._colName || safeColName);
  const isFailComment = (value) => /^fail\b/i.test(String(value || '').trim());

  const Field = ({ label, children, onClick }) => (
    <div className={onClick ? 'detailsField clickable' : 'detailsField'} onClick={onClick}>
      <div className="detailsLabel">{label}</div>
      {children}
    </div>
  );

  return (
    <aside className="details">
      <div className="detailsHeader">
        <div className="detailsTitleRow">
          <span className="detailsCode" style={{ marginRight: '0.5rem', fontSize: '1.2rem', fontWeight: 'bold', color: '#64748b' }}>
            {task.project?.code || projectCode(task.projectName)}-{task.id.slice(-4).toUpperCase()}:
          </span>
          {editing === 'title' ? (
            <input
              className="detailsTitleInput"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => {
                const next = draftTitle.trim();
                if (next && next !== task.title) onUpdateTask({ title: next });
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const next = draftTitle.trim();
                  if (next && next !== task.title) onUpdateTask({ title: next });
                  setEditing(null);
                }
              }}
              autoFocus
            />
          ) : (
            <div className="detailsTitle" onClick={() => setEditing('title')}>{task.title}</div>
          )}
          <div className="detailsTitleActions">
            {task.type === 'epic' ? (
              <>
                <button
                  className="tiny secondary"
                  onClick={() => onCreateStory && onCreateStory(task)}
                  title="Create story"
                >
                  New Story
                </button>
                {(() => {
                  const epic = (epics || []).find(e => e.id === task.id);
                  const hasStories = (epic?.stories || []).length > 0;
                  return (
                    <button
                      className="tiny secondary"
                      disabled={hasStories}
                      onClick={() => {
                        if (hasStories) return;
                        if (!onDelete) return;
                        if (window.confirm('Delete this epic? This will unassign its stories.')) onDelete(task);
                      }}
                      title={hasStories ? 'Cannot delete epic with stories attached' : 'Delete epic'}
                    >
                      Delete
                    </button>
                  );
                })()}
              </>
            ) : null}
            <button className="tiny" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className="detailsStatusControl">
          {canFail ? (
            <button
              className="danger small"
              title="Fail"
              onClick={() => {
                const reason = window.prompt('Why is this ticket failing?');
                if (!reason || !reason.trim()) return;
                const author = task._commentAuthor || safeUser;
                if (onAddComment) onAddComment({ author, body: `fail: ${reason.trim()}` });
                const idx = statusChoices.indexOf(safeColName);
                if (idx > 0) {
                  const targetIdx = Math.max(0, idx - 2);
                  onMove(task, statusChoices[targetIdx]);
                }
              }}
              style={{ marginRight: 12, gap: 4 }}
            >
              <span>✕</span> Fail
            </button>
          ) : null}
          <button
            className="secondary small"
            title="First status"
            aria-label="First status"
            disabled={isFirstStatus}
            onClick={() => {
              if (!isFirstStatus) onMove(task, statusChoices[0]);
            }}
          >
            &laquo;
          </button>
          <button
            className="secondary small"
            title="Previous status"
            aria-label="Previous status"
            disabled={isFirstStatus}
            onClick={() => {
              if (!isFirstStatus) onMove(task, statusChoices[currentStatusIndex - 1]);
            }}
          >
            &lsaquo;
          </button>
          <span className="badge" style={{ fontSize: '0.95em', margin: '0 12px', padding: '4px 12px' }}>{safeColName || '—'}</span>
          <button
            className="secondary small"
            title="Next status"
            aria-label="Next status"
            disabled={isLastStatus}
            onClick={() => {
              if (!isLastStatus) onMove(task, statusChoices[currentStatusIndex + 1]);
            }}
          >
            &rsaquo;
          </button>
          <button
            className="secondary small"
            title="Last status"
            aria-label="Last status"
            disabled={isLastStatus}
            onClick={() => {
              if (!isLastStatus) onMove(task, statusChoices[statusChoices.length - 1]);
            }}
          >
            &raquo;
          </button>
          {canFail ? (
            <button
              className="success small"
              title="Pass"
              onClick={() => {
                const author = task._commentAuthor || safeUser;
                if (onAddComment) onAddComment({ author, body: 'ticket was passed' });
                const idx = statusChoices.indexOf(safeColName);
                if (idx >= 0 && idx < statusChoices.length - 1) {
                  onMove(task, statusChoices[idx + 1]);
                }
              }}
              style={{ marginLeft: 12, gap: 4 }}
            >
              <span>✓</span> Pass
            </button>
          ) : null}
        </div>

        <div className="detailsDescriptionRow" onClick={() => setEditing('description')}>
          {editing === 'description' ? (
            <textarea
              className="detailsTextarea"
              dir="ltr"
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              onBlur={() => { onUpdateTask({ description: draftDesc }); setEditing(null); }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={task.description ? 'detailsDescriptionValue' : 'detailsDescriptionValue detailsDescriptionEmpty'}>
              {task.description || '—'}
            </div>
          )}
        </div>
      </div>

      <div className="detailsBody">
        <div className="detailsTabs" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`detailsTab ${detailsTab === 'meta' ? 'active' : ''}`}
            onClick={() => setDetailsTab('meta')}
          >
            Meta
          </button>
          {task.type === 'epic' && (
            <button
              type="button"
              className={`detailsTab ${detailsTab === 'tickets' ? 'active' : ''}`}
              onClick={() => setDetailsTab('tickets')}
            >
              Tickets
            </button>
          )}
          <button
            type="button"
            className={`detailsTab ${detailsTab === 'comments' ? 'active' : ''}`}
            onClick={() => setDetailsTab('comments')}
          >
            Comments
          </button>
          <button
            type="button"
            className={`detailsTab ${detailsTab === 'history' ? 'active' : ''}`}
            onClick={() => setDetailsTab('history')}
          >
            History
          </button>
          <button
            type="button"
            className={`detailsTab ${detailsTab === 'agent' ? 'active' : ''}`}
            onClick={() => setDetailsTab('agent')}
          >
            Agent Chat
          </button>
        </div>

        {detailsTab === 'meta' && (
          <div className="detailsGrid">
            <Field label="Assigned to" onClick={() => setEditing('assignee')}>
              {editing === 'assignee' ? (
                <select
                  autoFocus
                  value={task.assignee || ''}
                  onChange={(e) => { onUpdateTask({ assignee: e.target.value }); setEditing(null); }}
                  onBlur={() => setEditing(null)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">—</option>
                  {people.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <div className="detailsValue">{task.assignee || '—'}</div>
              )}
            </Field>

            <Field label="Created by" onClick={() => setEditing('createdBy')}>
              {editing === 'createdBy' ? (
                <select
                  autoFocus
                  value={task.createdBy || safeUser}
                  onChange={(e) => { onUpdateTask({ createdBy: e.target.value }); setEditing(null); }}
                  onBlur={() => setEditing(null)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {people.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <div className="detailsValue">{task.createdBy || safeUser}</div>
              )}
            </Field>

            <Field label="Due date" onClick={() => setEditing('dueAt')}>
              {editing === 'dueAt' ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <input
                    className="detailsInput"
                    type="date"
                    value={toDateOnlyValue(task.dueAt)}
                    onChange={(e) => onUpdateTask({ dueAt: e.target.value ? dateOnlyToISO(e.target.value) : null })}
                    autoFocus
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="tiny" onClick={() => { onUpdateTask({ dueAt: null }); setEditing(null); }}>Clear</button>
                    <button className="tiny" onClick={() => setEditing(null)}>Done</button>
                  </div>
                </div>
              ) : (
                <div className="detailsValue">{task.dueAt ? new Date(task.dueAt).toLocaleString() : '—'}</div>
              )}
            </Field>

            <Field label="Priority" onClick={() => setEditing('priority')}>
              {editing === 'priority' ? (
                <select
                  autoFocus
                  value={task.priority || ''}
                  onChange={(e) => { onUpdateTask({ priority: e.target.value }); setEditing(null); }}
                  onBlur={() => setEditing(null)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">—</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              ) : (
                <div className="detailsValue">{task.priority || '—'}</div>
              )}
            </Field>

            <Field label="Created at">
              <div className="detailsValue">{task.createdAt ? new Date(task.createdAt).toLocaleString() : '—'}</div>
            </Field>

            <Field label="Type" onClick={() => setEditing('type')}>
              {editing === 'type' ? (
                <select
                  autoFocus
                  value={task.type || ''}
                  onChange={(e) => { onUpdateTask({ type: e.target.value }); setEditing(null); }}
                  onBlur={() => setEditing(null)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">—</option>
                  <option value="story">story</option>
                  <option value="bug">bug</option>
                  <option value="epic">epic</option>
                </select>
              ) : (
                <div className="detailsValue">{task.type || '—'}</div>
              )}
            </Field>

            <Field label="Tags" onClick={() => setEditing('tags')}>
              {editing === 'tags' ? (
                <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(draftTags || '').split(',').filter(t => t.trim()).map(tag => (
                      <span key={tag} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {tag.trim()}
                        <span
                          style={{ cursor: 'pointer', opacity: 0.6, fontSize: '1.2em', lineHeight: 1 }}
                          onClick={() => {
                            const newTags = draftTags.split(',').filter(t => t.trim() !== tag.trim()).join(', ');
                            setDraftTags(newTags);
                            onUpdateTask({ tags: newTags });
                          }}
                        >
                          &times;
                        </span>
                      </span>
                    ))}
                  </div>
                  <input
                    className="detailsInput"
                    placeholder="Add a tag and press Enter..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const tag = e.target.value.trim();
                        if (tag) {
                          const existing = draftTags.split(',').map(t => t.trim()).filter(Boolean);
                          if (!existing.includes(tag)) {
                            const next = existing.length ? `${existing.join(', ')}, ${tag}` : tag;
                            setDraftTags(next);
                            onUpdateTask({ tags: next });
                          }
                          e.target.value = '';
                        }
                      }
                    }}
                    autoFocus
                  />
                  <button className="tiny" onClick={() => setEditing(null)}>Done</button>
                </div>
              ) : (
                <div className="detailsValue" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {task.tags ? task.tags.split(',').map(tag => (
                    <span key={tag} className="badge">{tag.trim()}</span>
                  )) : '—'}
                </div>
              )}
            </Field>

            {task.type !== 'epic' ? (
              <Field label="Epic" onClick={() => setEditing('epic')}>
                {editing === 'epic' ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Select
                      classNamePrefix="select"
                      className="filtersSelect"
                      isClearable
                      placeholder="(No epic)"
                      options={(epics || []).map(e => ({ value: e.id, label: `${e.ticketNumber ? `TM-${e.ticketNumber} ` : ''}${e.title}` }))}
                      value={task.epicId ? ({ value: task.epicId, label: ((epics || []).find(e => e.id === task.epicId)?.title || '') }) : null}
                      onChange={(opt) => { onUpdateTask({ epicId: opt?.value || null }); setEditing(null); }}
                    />
                  </div>
                ) : (
                  <div
                    className="detailsValue"
                    style={task.epicId ? { color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' } : {}}
                    onClick={(e) => {
                      if (task.epicId) {
                        e.stopPropagation();
                        onNavigateToTask?.(task.epicId, 'epic');
                      }
                    }}
                    title={task.epicId ? 'Go to this epic' : ''}
                  >
                    {task.epicId ? ((epics || []).find(e => e.id === task.epicId)?.title || '—') : '—'}
                  </div>
                )}
              </Field>
            ) : (
              <Field label="Epic Color" onClick={() => setEditing('epicColor')}>
                {editing === 'epicColor' ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={task.epicColor || '#f97316'}
                      onChange={(e) => onUpdateTask({ epicColor: e.target.value })}
                      style={{ width: 40, height: 30, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                    />
                    <button className="tiny" onClick={() => setEditing(null)}>Done</button>
                  </div>
                ) : (
                  <div className="row" style={{ gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: task.epicColor || '#f97316' }}></div>
                    <div className="detailsValue">{task.epicColor || '#f97316'}</div>
                  </div>
                )}
              </Field>
            )}
          </div>
        )}

        {detailsTab === 'tickets' && task.type === 'epic' && (
          <div className="detailsField">
            <div className="detailsLabel">Sub tickets</div>
            {epicStories.length ? (
              <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 120px 120px', gap: 8, padding: '8px 10px', fontSize: 12, opacity: 0.7 }}>
                  <div>ID</div>
                  <div>Title</div>
                  <div>Type</div>
                  <div>Assignee</div>
                  <div>Status</div>
                </div>
                {epicStories.map(s => (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 120px 120px', gap: 8, padding: '8px 10px', borderTop: '1px solid rgba(148,163,184,0.12)' }}>
                    <div
                      className="mono"
                      style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToTask?.(s.id, 'story');
                      }}
                      title="Go to this story"
                    >
                      {epicIdentifierPrefix}-{s.ticketNumber || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.title}>{s.title}</div>
                    </div>
                    <div>{s.type || '—'}</div>
                    <div>{s.assignee || '—'}</div>
                    <div>{s.columnName || '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="detailsValue">—</div>
            )}
          </div>
        )}

        {(detailsTab === 'comments' || detailsTab === 'history') && (
          <div className="detailsField">
            {detailsTab === 'history' ? (
              <div className="comments">
                {sortedActivity.length ? sortedActivity.slice(0, 50).map(a => (
                  <div key={a.id} className="comment">
                    <div className="commentMeta">{a.actor} · {new Date(a.at).toLocaleString()}</div>
                    <div className="commentBody">{a.action}{a.detail ? ` — ${a.detail}` : ''}</div>
                  </div>
                )) : (
                  <div className="detailsValue">—</div>
                )}
              </div>
            ) : (
              <>
                <div className="comments">
                  {sortedComments.length ? sortedComments.map(c => (
                    <div key={c.id} className="comment">
                      <div className="commentMeta">{c.author} · {new Date(c.createdAt).toLocaleString()}</div>
                      <div className={`commentBody ${isFailComment(c.body) ? 'commentBodyFail' : ''}`}>
                        {c.body}
                      </div>
                    </div>
                  )) : (
                    <div className="detailsValue">—</div>
                  )}
                </div>

                <div className="commentComposer" onClick={(e) => e.stopPropagation()}>
                  <select className="detailsInput" value={task._commentAuthor || safeUser} onChange={(e) => onUpdateTask({ _commentAuthor: e.target.value })}>
                    {people.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <textarea
                    className="detailsTextarea"
                    dir="ltr"
                    placeholder="Add a comment…"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                  />
                  <button onClick={() => {
                    const body = commentBody.trim();
                    if (!body) return;
                    onAddComment({ author: task._commentAuthor || safeUser, body });
                    setCommentBody('');
                  }}>Add Comment</button>
                </div>
              </>
            )}
          </div>
        )}

        {detailsTab === 'agent' && (
          <div className="ticketAgentChat">
            {!task.assignee ? (
              <div className="ticketAgentEmpty">
                Assign this ticket to a user with a preferred agent to start ticket-scoped chat.
              </div>
            ) : (
              <>
                <div className="ticketAgentHeader">
                  <div className="ticketAgentMeta">
                    <div className="ticketAgentTitle">{agentMeta.agentName || 'Assigned Agent'}</div>
                    <div className="ticketAgentSub">
                      user: {task.assignee} {agentMeta.agentKey ? `· key: ${agentMeta.agentKey}` : ''}
                    </div>
                  </div>
                  <div className="ticketAgentActions">
                    {agentStatus && (
                      <span className={`ticketAgentStatus ${agentStatus.status}`}>
                        {agentStatus.status}
                      </span>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        setIsResettingAgent(true);
                        setAgentChatError('');
                        try {
                          await apiPost(`/api/tasks/${task.id}/agent-chat/reset`, {});
                          ticketAgentChatCache.delete(String(task.id));
                          persistTicketAgentCache(ticketAgentChatCache);
                          setAgentHistory([]);
                          setAgentMessage('');
                          setAgentMeta({ sessionKey: '', agentName: '', agentKey: '' });
                          setAgentStatus(null);
                        } catch (err) {
                          setAgentChatError(err.message || 'Failed to reset chat');
                        } finally {
                          setIsResettingAgent(false);
                        }
                      }}
                      disabled={isResettingAgent || isSendingAgentMessage || isLoadingAgentTranscript}
                    >
                      {isResettingAgent ? 'Restarting...' : 'Restart Chat'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        setIsTestingAgent(true);
                        try {
                          const result = await apiPost(`/api/tasks/${task.id}/agent-chat/test`, {});
                          const status = result?.data?.status === 'online' ? 'online' : 'offline';
                          setAgentStatus({
                            status,
                            reason: result?.data?.reason || '',
                            checkedAt: Date.now()
                          });
                        } catch (err) {
                          setAgentStatus({ status: 'offline', reason: err.message || 'test failed', checkedAt: Date.now() });
                        } finally {
                          setIsTestingAgent(false);
                        }
                      }}
                      disabled={isTestingAgent}
                    >
                      {isTestingAgent ? 'Testing...' : 'Test Agent'}
                    </button>
                  </div>
                </div>

                <div className="ticketAgentHistory" ref={agentHistoryRef}>
                  {agentHistory.length === 0 && !isLoadingAgentTranscript && !agentChatError && (
                    <div className="ticketAgentEmpty">
                      No conversation yet. Start by sending a message to this ticket agent.
                    </div>
                  )}

                  {agentHistory.map((msg) => (
                    <div key={msg.id} className={`ticketAgentMsg ${msg.role}`}>
                      <div className="ticketAgentRole">{msg.role === 'agent' ? 'Agent' : msg.role === 'user' ? 'You' : 'System'}</div>
                      <div className="ticketAgentContent">{msg.content}</div>
                    </div>
                  ))}

                  {isLoadingAgentTranscript && (
                    <div className="ticketAgentMsg system">
                      <div className="ticketAgentRole">System</div>
                      <div className="ticketAgentContent">Loading conversation...</div>
                    </div>
                  )}

                  {agentChatError && (
                    <div className="ticketAgentMsg system">
                      <div className="ticketAgentRole">System</div>
                      <div className="ticketAgentContent">Error: {agentChatError}</div>
                    </div>
                  )}

                  {isSendingAgentMessage && (
                    <div className="ticketAgentMsg agent">
                      <div className="ticketAgentRole">Agent</div>
                      <div className="ticketAgentContent">Thinking...</div>
                    </div>
                  )}
                </div>

                <form
                  className="ticketAgentComposer"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const next = agentMessage.trim();
                    if (!next || isSendingAgentMessage || isResettingAgent) return;

                    const userMsg = { id: `user-${Date.now()}`, role: 'user', content: next };
                    setAgentHistory(prev => [...prev, userMsg]);
                    setAgentMessage('');
                    setIsSendingAgentMessage(true);
                    setAgentChatError('');

                    try {
                      const result = await apiPost(`/api/tasks/${task.id}/agent-chat`, { message: next });
                      const botMsg = {
                        id: `agent-${Date.now()}`,
                        role: 'agent',
                        content: result?.data?.text || ''
                      };
                      setAgentMeta(prev => ({
                        sessionKey: result?.data?.sessionKey || prev.sessionKey,
                        agentName: result?.data?.agentName || prev.agentName,
                        agentKey: result?.data?.agentKey || prev.agentKey
                      }));
                      setAgentHistory(prev => [...prev, botMsg]);
                    } catch (err) {
                      setAgentChatError(err.message || 'Failed to send message');
                      setAgentHistory(prev => [
                        ...prev,
                        { id: `err-${Date.now()}`, role: 'system', content: `Failed to send: ${err.message || 'unknown error'}` }
                      ]);
                    } finally {
                      setIsSendingAgentMessage(false);
                    }
                  }}
                >
                  <textarea
                    className="ticketAgentInput"
                    value={agentMessage}
                    onChange={(e) => setAgentMessage(e.target.value)}
                    placeholder={`Message ${agentMeta.agentName || 'agent'} about this ticket...`}
                    disabled={isSendingAgentMessage || isResettingAgent}
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button type="submit" className="primary" disabled={!agentMessage.trim() || isSendingAgentMessage || isResettingAgent}>
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default CardEditDrawer;
