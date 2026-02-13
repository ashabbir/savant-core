import React, { useState, useEffect, useRef } from 'react';
import { apiPost, apiGet, apiDelete } from '../api';

function CommandBar({ inFooter = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [status, setStatus] = useState({ state: 'unknown', defaultModel: '', fallbackModel: '', reason: '' });
  const [showStatusReason, setShowStatusReason] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const transcriptRequestRef = useRef(0);
  const historyBySessionRef = useRef(new Map());
  const selectedSessionExists = sessions.some(s => s.key === selectedSessionKey);

  const sortedSessions = [...sessions].sort((a, b) => {
    const left = Number(a.updatedAt || 0);
    const right = Number(b.updatedAt || 0);
    return right - left;
  });

  const handleNewSession = () => {
    const newKey = `openai:jarvis:session:${Date.now()}`;
    setSelectedSessionKey(newKey);
    setHistory([]);
    historyBySessionRef.current.set(newKey, []);
    setIsEditingLabel(true);
    setNewLabel('New Chat');

    setSessions(prev => [{
      key: newKey,
      label: 'New Chat',
      updatedAt: Date.now()
    }, ...prev.filter(s => s.key !== newKey)]);
  };

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await apiGet('/api/jarvis/sessions');
      const sessionList = res.data || [];
      setSessions(sessionList);

      if (!selectedSessionKey && sessionList.length > 0) {
        setSelectedSessionKey(sessionList[0].key);
      } else if (!selectedSessionKey && sessionList.length === 0) {
        handleNewSession();
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    apiGet('/api/jarvis/status')
      .then(r => setStatus({
        state: r.data.status === 'up' ? 'up' : 'down',
        defaultModel: r.data.defaultModel || '',
        fallbackModel: r.data.fallbackModel || '',
        reason: r.data.reason || ''
      }))
      .catch((err) => setStatus(prev => ({ ...prev, state: 'down', reason: err?.message || 'unknown-error' })));

    fetchSessions();
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, selectedSessionKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    if (!selectedSessionKey || !isOpen) return;

    if (!selectedSessionExists) {
      const cached = historyBySessionRef.current.get(selectedSessionKey) || [];
      setHistory(cached);
      return;
    }

    const fetchTranscript = async () => {
      const requestId = ++transcriptRequestRef.current;
      const sessionKey = selectedSessionKey;
      setIsLoadingTranscript(true);
      try {
        const res = await apiGet(`/api/jarvis/sessions/transcript?sessionKey=${sessionKey}`);
        if (requestId === transcriptRequestRef.current && sessionKey === selectedSessionKey) {
          const serverHistory = res.data || [];
          const cachedHistory = historyBySessionRef.current.get(sessionKey) || [];
          const nextHistory = serverHistory.length > 0 || cachedHistory.length === 0
            ? serverHistory
            : cachedHistory;
          historyBySessionRef.current.set(sessionKey, nextHistory);
          setHistory(nextHistory);
        }
      } catch (err) {
        console.error('Failed to fetch transcript:', err);
        if (requestId === transcriptRequestRef.current && sessionKey === selectedSessionKey) {
          const cached = historyBySessionRef.current.get(sessionKey) || [];
          setHistory(cached);
        }
      } finally {
        if (requestId === transcriptRequestRef.current) {
          setIsLoadingTranscript(false);
        }
      }
    };

    fetchTranscript();
  }, [selectedSessionKey, isOpen, selectedSessionExists]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!message.trim() || isSending || !selectedSessionKey) return;

    const activeSessionKey = selectedSessionKey;
    const userMsg = { role: 'user', content: message.trim() };
    const nextWithUser = [...history, userMsg];
    historyBySessionRef.current.set(activeSessionKey, nextWithUser);
    setHistory(nextWithUser);
    setMessage('');
    setIsSending(true);

    setSessions(prev => prev.map(s => (
      s.key === activeSessionKey
        ? { ...s, updatedAt: Date.now() }
        : s
    )));

    try {
      const res = await apiPost('/api/jarvis/chat', {
        message: userMsg.content,
        sessionKey: activeSessionKey
      });

      const botMsg = { role: 'jarvis', content: res.data.text, model: res.data.model };
      if (activeSessionKey === selectedSessionKey) {
        setHistory(prev => {
          const next = [...prev, botMsg];
          historyBySessionRef.current.set(activeSessionKey, next);
          return next;
        });
      } else {
        const cached = historyBySessionRef.current.get(activeSessionKey) || [];
        historyBySessionRef.current.set(activeSessionKey, [...cached, botMsg]);
      }

      const isExisting = sessions.some(s => s.key === activeSessionKey);
      if (!isExisting) {
        fetchSessions();
      }
    } catch (err) {
      if (activeSessionKey === selectedSessionKey) {
        setHistory(prev => {
          const next = [...prev, { role: 'error', content: `Failed to reach Jarvis: ${err.message}` }];
          historyBySessionRef.current.set(activeSessionKey, next);
          return next;
        });
      } else {
        const cached = historyBySessionRef.current.get(activeSessionKey) || [];
        historyBySessionRef.current.set(activeSessionKey, [...cached, { role: 'error', content: `Failed to reach Jarvis: ${err.message}` }]);
      }
    } finally {
      setIsSending(false);
    }
  };

  const selectSession = (sessionKey) => {
    setSelectedSessionKey(sessionKey);
    const cached = historyBySessionRef.current.get(sessionKey) || [];
    setHistory(cached);
    setIsEditingLabel(false);
  };

  const saveLabel = async () => {
    if (!newLabel.trim() || !selectedSessionKey) return;

    setSessions(prev => prev.map(s => (
      s.key === selectedSessionKey ? { ...s, label: newLabel.trim() } : s
    )));

    try {
      await apiPost('/api/jarvis/sessions/label', {
        sessionKey: selectedSessionKey,
        label: newLabel.trim()
      });
      setIsEditingLabel(false);
      fetchSessions();
    } catch (err) {
      console.error('Failed to save label:', err);
    }
  };

  const deleteSession = async (sessionKey) => {
    if (!sessionKey) return;

    try {
      await apiDelete(`/api/jarvis/sessions?sessionKey=${encodeURIComponent(sessionKey)}`);

      const nextSessions = sessions.filter((s) => s.key !== sessionKey);
      setSessions(nextSessions);

      if (selectedSessionKey === sessionKey) {
        if (nextSessions.length > 0) {
          setSelectedSessionKey(nextSessions[0].key);
          const cached = historyBySessionRef.current.get(nextSessions[0].key) || [];
          setHistory(cached);
        } else {
          handleNewSession();
        }
      }

      historyBySessionRef.current.delete(sessionKey);
      setIsEditingLabel(false);
      await fetchSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
      alert(`Failed to delete chat: ${err.message}`);
    }
  };

  if (!isOpen) {
    return (
      <button
        className={`jarvisToggle ${inFooter ? 'jarvisToggleFooter' : ''}`.trim()}
        onClick={() => setIsOpen(true)}
        title="Open Command Bar (Cmd+K)"
      >
        <span className="jarvisPulse" />
        Jarvis
      </button>
    );
  }

  const currentSession = sessions.find(s => s.key === selectedSessionKey);
  const selectedTitle = currentSession?.label || 'New Chat';

  return (
    <div className="jarvisOverlay">
      <div className="jarvisModal">
        <aside className="jarvisSidebar">
          <div className="jarvisSidebarTop">
            <button className="jarvisNewSessionBtn" onClick={handleNewSession}>
              + New Chat
            </button>
            <button className="closeBtn jarvisCloseMobile" onClick={() => setIsOpen(false)} aria-label="Close Jarvis">
              ✕
            </button>
          </div>

          <div className="jarvisSidebarLabel">Chats</div>
          <div className="jarvisSessionList">
            {isLoadingSessions && sessions.length === 0 && <div className="jarvisSessionEmpty">Loading chats...</div>}
            {!isLoadingSessions && sortedSessions.length === 0 && <div className="jarvisSessionEmpty">No chats yet</div>}
            {sortedSessions.map((s) => (
              <div
                key={s.key}
                className={`jarvisSessionItem ${s.key === selectedSessionKey ? 'active' : ''}`}
                title={s.label}
              >
                <button
                  type="button"
                  className="jarvisSessionSelectBtn"
                  onClick={() => selectSession(s.key)}
                >
                  <span className="jarvisSessionItemTitle">{s.label || 'Untitled Chat'}</span>
                </button>
                <button
                  type="button"
                  className="jarvisSessionDeleteBtn"
                  onClick={() => deleteSession(s.key)}
                  aria-label={`Delete ${s.label || 'session'}`}
                  title="Delete chat"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="jarvisSidebarFooter">
            <button
              type="button"
              className="jarvisStatusBtn"
              onClick={() => setShowStatusReason(prev => !prev)}
              title={status.state === 'down' ? 'Show down reason' : 'Talon is healthy'}
            >
              <span className={`jarvisStatusDot ${status.state}`} />
              <span className="jarvisSidebarStatus">Talon {status.state}</span>
            </button>
            {showStatusReason && status.state === 'down' && (
              <div className="jarvisStatusReason">
                Reason: {status.reason || 'unknown'}
              </div>
            )}
          </div>
        </aside>

        <section className="jarvisMain">
          <div className="jarvisHeader">
            <div className="jarvisHeaderTitleWrap">
              <div className="jarvisTitle">{selectedTitle}</div>
              {isEditingLabel ? (
                <div className="jarvisLabelEditRow">
                  <input
                    className="jarvisLabelInput"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="Chat name"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveLabel()}
                  />
                  <button className="jarvisLabelBtn" onClick={saveLabel}>Save</button>
                  <button className="jarvisLabelBtn cancel" onClick={() => setIsEditingLabel(false)}>Cancel</button>
                </div>
              ) : (
                <button
                  className="jarvisRenameBtn"
                  onClick={() => {
                    setNewLabel(currentSession?.label || '');
                    setIsEditingLabel(true);
                  }}
                >
                  Rename
                </button>
              )}
            </div>
            <button className="closeBtn jarvisCloseDesktop" onClick={() => setIsOpen(false)} aria-label="Close Jarvis">
              ✕
            </button>
          </div>

          <div className="jarvisHistory" ref={scrollRef}>
            {history.length === 0 && !isLoadingTranscript && (
              <div className="jarvisEmpty">
                Start a conversation with Jarvis...
                <br />
                Try: <code>/repos</code>, <code>/search savant-core createContextMcpTool</code>, <code>/read savant-core README.md</code>
              </div>
            )}

            {history.map((msg, i) => (
              <div key={i} className={`jarvisMsg ${msg.role}`}>
                <div className="jarvisRole">{msg.role === 'jarvis' ? 'Jarvis' : msg.role === 'user' ? 'You' : 'Error'}</div>
                <div className="jarvisContent">{msg.content}</div>
                {msg.model && <div className="jarvisMeta">{msg.model}</div>}
              </div>
            ))}

            {isLoadingTranscript && (
              <div className="jarvisMsg jarvis loading">
                <div className="jarvisRole">Jarvis</div>
                <div className="jarvisContent">Loading chat...</div>
              </div>
            )}

            {isSending && (
              <div className="jarvisMsg jarvis loading">
                <div className="jarvisRole">Jarvis</div>
                <div className="jarvisContent">Thinking...</div>
              </div>
            )}
          </div>

          <form className="jarvisInputArea" onSubmit={handleSend}>
            <textarea
              ref={inputRef}
              className="jarvisInput"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message Jarvis... (/search <repo> <query>)"
              disabled={isSending}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            <button className="primary jarvisSendBtn" type="submit" disabled={!message.trim() || isSending}>
              Send
            </button>
          </form>

          <div className="jarvisFooter">
            <button
              type="button"
              className="jarvisTinyInfoBtn"
              onClick={() => setShowInfo(prev => !prev)}
              title="Tiny info"
            >
              i
            </button>
            {showInfo && (
              <span className="jarvisTinyInfoText">
                model: {status.defaultModel || 'n/a'} · fallback: {status.fallbackModel || 'none'} · session: {(selectedSessionKey || 'none').slice(-10)}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default CommandBar;
