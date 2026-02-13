import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, apiDelete } from '../api';

const TABS = [
  { key: 'metadata', label: 'Metadata' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' }
];

function ProfilePage({ currentUser, agents }) {
  const isMainAgent = (agent) => {
    const name = String(agent?.name || '').trim().toLowerCase();
    const talonId = String(agent?.talonAgentId || '').trim().toLowerCase();
    return agent?.type === 'main' || !!agent?.isMain || name === 'jarvis' || talonId === 'jarvis';
  };

  const [activeTab, setActiveTab] = useState('metadata');
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState('');
  const [preferredAgentId, setPreferredAgentId] = useState('');
  const [userColor, setUserColor] = useState('#3b82f6');
  
  const [subscriptions, setSubscriptions] = useState([]);
  const [subChannel, setSubChannel] = useState('slack');
  const [subTarget, setSubTarget] = useState('');
  const [subMentionsOnly, setSubMentionsOnly] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet('/api/me');
        setDisplayName(r.data.displayName || '');
        setApiKey(r.data.apiKey || '');
        setPreferredAgentId(r.data.preferredAgentId || '');
        setEmail(r.data.email || '');
        setUserColor(r.data.color || '#3b82f6');
        const subs = await apiGet('/api/me/notifications');
        setSubscriptions(subs.data || []);
      } catch {
        // ignore
      }
    })();
  }, []);

  const saveProfile = async () => {
    setMsg(null);
    setIsError(false);
    try {
      await apiPatch('/api/me', { 
        displayName, 
        preferredAgentId: preferredAgentId || null, 
        email: email || undefined,
        color: userColor
      });
      setMsg('Profile updated');
    } catch (e) {
      setIsError(true);
      setMsg(e.message || 'Profile update failed');
    }
  };

  const addSubscription = async () => {
    setMsg(null);
    setIsError(false);
    try {
      const r = await apiPost('/api/me/notifications', {
        channel: subChannel,
        target: subTarget,
        mentionsOnly: subMentionsOnly
      });
      setSubscriptions(prev => [...prev, r.data]);
      setSubTarget('');
      setMsg('Notification added');
    } catch (e) {
      setIsError(true);
      setMsg(e.message || 'Notification setup failed');
    }
  };

  const deleteSubscription = async (id) => {
    setMsg(null);
    setIsError(false);
    try {
      await apiDelete(`/api/me/notifications/${id}`);
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      setMsg('Notification removed');
    } catch (e) {
      setIsError(true);
      setMsg(e.message || 'Notification removal failed');
    }
  };

  const rotateKey = async () => {
    setMsg(null);
    setIsError(false);
    try {
      const r = await apiPost('/api/me/api-key', {});
      setApiKey(r.data.apiKey);
      localStorage.setItem('task_api_key', r.data.apiKey);
      setMsg('API key rotated');
    } catch (e) {
      setIsError(true);
      setMsg(e.message || 'API key rotation failed');
    }
  };

  const handlePasswordSubmit = async () => {
    setMsg(null);
    setIsError(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMsg('Please fill all fields'); setIsError(true); return;
    }
    if (newPassword !== confirmPassword) {
      setMsg('Passwords do not match'); setIsError(true); return;
    }
    if (newPassword.length < 6) {
      setMsg('Password must be at least 6 characters'); setIsError(true); return;
    }

    try {
      await apiPost('/api/me/password', { currentPassword, newPassword });
      setMsg('Password updated successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setMsg(e.message || 'Password change failed');
      setIsError(true);
    }
  };

  return (
    <div className="profilePage" style={{ maxWidth: 1000 }}>
      <div className="header" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Profile: {currentUser}</h1>
        <div className="detailsTabs" style={{ marginTop: 0, borderBottom: 'none', marginLeft: 0, paddingLeft: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`tabBtn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(tab.key); setMsg(null); }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className={isError ? 'callout error' : 'callout success'} style={{ marginBottom: 20 }}>
          {msg}
        </div>
      )}

      <div className="detailsBody" style={{ minHeight: 400 }}>
        {activeTab === 'metadata' && (
          <div className="card compactEntityCard" style={{ marginTop: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="inputGroup">
                <label>Username (immutable)</label>
                <input className="detailsInput" value={currentUser} disabled />
              </div>

              <div className="inputGroup">
                <label>Display name</label>
                <input className="detailsInput" value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>

              <div className="inputGroup">
                <label>Email</label>
                <input className="detailsInput" value={email} onChange={e => setEmail(e.target.value)} />
              </div>

              <div className="inputGroup">
                <label>Preferred Agent</label>
                <select className="detailsInput" value={preferredAgentId} onChange={e => setPreferredAgentId(e.target.value)}>
                  <option value="">None</option>
                  {(agents || []).filter(a => !isMainAgent(a)).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div className="inputGroup">
                <label>User Color</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input 
                    type="color" 
                    value={userColor} 
                    onChange={e => setUserColor(e.target.value)} 
                    style={{ width: 50, height: 38, padding: 2, cursor: 'pointer', border: 'none', background: 'none' }}
                  />
                  <code style={{ opacity: 0.7 }}>{userColor}</code>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={saveProfile} style={{ minWidth: 120 }}>Save Changes</button>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="card compactEntityCard" style={{ marginTop: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="inputGroup">
                <label>Channel</label>
                <select className="detailsInput" value={subChannel} onChange={(e) => setSubChannel(e.target.value)}>
                  <option value="slack">Slack webhook</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div className="inputGroup">
                <label>Mentions only</label>
                <select className="detailsInput" value={subMentionsOnly ? 'mentions' : 'all'} onChange={(e) => setSubMentionsOnly(e.target.value === 'mentions')}>
                  <option value="mentions">Mentions only</option>
                  <option value="all">All updates</option>
                </select>
              </div>
            </div>
            
            <div className="inputGroup" style={{ marginTop: 15 }}>
              <label>Target</label>
              <input 
                className="detailsInput" 
                value={subTarget} 
                onChange={(e) => setSubTarget(e.target.value)} 
                placeholder={subChannel === 'email' ? 'you@example.com' : 'https://hooks.slack.com/...'} 
              />
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={addSubscription} disabled={!subTarget.trim()}>+ Add Subscription</button>
            </div>

            <div style={{ marginTop: 32, borderTop: '1px solid var(--border-primary)', paddingTop: 20 }}>
              <label className="detailsLabel" style={{ marginBottom: 12, display: 'block' }}>Active Subscriptions</label>
              {(subscriptions || []).length ? (
                <div className="notificationsList" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(subscriptions || []).map(sub => (
                    <div key={sub.id} className="comment" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
                      <div>
                        <span className="badge" style={{ marginRight: 10 }}>{sub.channel}</span>
                        <span style={{ fontSize: 13, opacity: 0.9 }}>{sub.target}</span>
                        <span style={{ marginLeft: 10, fontSize: 11, opacity: 0.5 }}>({sub.mentionsOnly ? 'mentions' : 'all'})</span>
                      </div>
                      <button className="tiny secondary" onClick={() => deleteSubscription(sub.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 13 }}>No notifications configured.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card compactEntityCard" style={{ marginTop: 0 }}>
              <label className="detailsLabel" style={{ marginBottom: 16, display: 'block' }}>Authentication</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="inputGroup">
                  <label>Current Password</label>
                  <input type="password" className="detailsInput" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                </div>
                <div />
                <div className="inputGroup">
                  <label>New Password</label>
                  <input type="password" className="detailsInput" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="inputGroup">
                  <label>Confirm Password</label>
                  <input type="password" className="detailsInput" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="primary" onClick={handlePasswordSubmit}>Update Password</button>
              </div>
            </div>

            <div className="card compactEntityCard">
              <label className="detailsLabel" style={{ marginBottom: 16, display: 'block' }}>API Access</label>
              <div className="inputGroup">
                <label>API key</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input className="detailsInput" value={apiKey} readOnly style={{ fontFamily: 'monospace' }} />
                  <button onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(apiKey);
                      setMsg('API key copied');
                      setIsError(false);
                    } catch {
                      setMsg('Copy failed');
                      setIsError(true);
                    }
                  }}>Copy</button>
                </div>
                <span className="helperText">Use this key for programmatic access to the Task Master API.</span>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="danger secondary" onClick={() => {
                  if (window.confirm('Are you sure you want to rotate your API key? All current integrations will break.')) rotateKey();
                }}>Rotate API Key</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
