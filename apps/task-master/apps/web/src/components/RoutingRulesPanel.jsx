import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api';

const TYPE_OPTIONS = ['', 'story', 'bug'];
const PRIORITY_OPTIONS = ['', 'high', 'medium', 'low'];

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function sanitizeOrder(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const num = Number(value);
  if (Number.isNaN(num)) return undefined;
  return num;
}

function buildDraft(rule) {
  return {
    agentId: rule.agentId || '',
    type: normalizeValue(rule.type),
    priority: normalizeValue(rule.priority),
    assignee: normalizeValue(rule.assignee),
    order: rule.order ?? 0,
    enabled: rule.enabled !== false
  };
}

function isRuleDirty(rule, draft) {
  if (!rule || !draft) return false;
  return (
    normalizeValue(rule.agentId) !== normalizeValue(draft.agentId)
    || normalizeValue(rule.type) !== normalizeValue(draft.type)
    || normalizeValue(rule.priority) !== normalizeValue(draft.priority)
    || normalizeValue(rule.assignee) !== normalizeValue(draft.assignee)
    || Number(rule.order ?? 0) !== Number(draft.order ?? 0)
    || (rule.enabled !== false) !== (draft.enabled !== false)
  );
}

export default function RoutingRulesPanel({ projectId, agents = [], isAdmin }) {
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [error, setError] = useState('');
  const [draftById, setDraftById] = useState({});
  const [newRule, setNewRule] = useState({
    agentId: '',
    type: '',
    priority: '',
    assignee: '',
    order: '',
    enabled: true
  });

  const agentOptions = useMemo(() => agents || [], [agents]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || !isAdmin) return undefined;
    setLoading(true);
    apiGet(`/api/projects/${projectId}/routing-rules`)
      .then(r => {
        if (cancelled) return;
        setRules(r.data || []);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load routing rules');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="routingRulesPanel">
        <div className="sectionHeader">Routing Rules</div>
        <div className="agentMeta">Admin access required to manage routing rules.</div>
      </div>
    );
  }

  const updateDraft = (id, patch) => {
    setDraftById(prev => ({
      ...prev,
      [id]: { ...(prev[id] || buildDraft(rules.find(r => r.id === id) || {})), ...patch }
    }));
  };

  const handleSave = async (rule) => {
    const draft = draftById[rule.id] || buildDraft(rule);
    const payload = {
      agentId: draft.agentId,
      type: draft.type,
      priority: draft.priority,
      assignee: draft.assignee,
      order: sanitizeOrder(draft.order),
      enabled: draft.enabled
    };
    const updated = await apiPatch(`/api/routing-rules/${rule.id}`, payload);
    setRules(prev => prev.map(r => (r.id === rule.id ? updated.data : r)));
    setDraftById(prev => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });
  };

  const handleDelete = async (rule) => {
    if (!window.confirm('Delete this routing rule?')) return;
    await apiDelete(`/api/routing-rules/${rule.id}`);
    setRules(prev => prev.filter(r => r.id !== rule.id));
  };

  const handleCreate = async () => {
    const payload = {
      agentId: newRule.agentId,
      type: newRule.type,
      priority: newRule.priority,
      assignee: newRule.assignee,
      order: sanitizeOrder(newRule.order),
      enabled: newRule.enabled
    };
    const created = await apiPost(`/api/projects/${projectId}/routing-rules`, payload);
    setRules(prev => [...prev, created.data]);
    setNewRule({ agentId: '', type: '', priority: '', assignee: '', order: '', enabled: true });
  };

  return (
    <div className="routingRulesPanel">
      <div className="sectionHeader">Routing Rules</div>
      <div className="sectionHint">Rules are evaluated top to bottom (lowest order first).</div>
      {error ? <div className="agentMeta" style={{ color: 'salmon' }}>{error}</div> : null}
      <div className="routingRulesList">
        <div className="routingRuleRow routingRuleHeader">
          <div>Agent</div>
          <div>Type</div>
          <div>Priority</div>
          <div>Assignee</div>
          <div>Order</div>
          <div>Enabled</div>
          <div>Actions</div>
        </div>
        {loading ? (
          <div className="agentMeta">Loading rules…</div>
        ) : rules.length ? (
          rules.map(rule => {
            const draft = draftById[rule.id] || buildDraft(rule);
            const dirty = isRuleDirty(rule, draft);
            return (
              <div key={rule.id} className="routingRuleRow">
                <select
                  className="detailsInput"
                  value={draft.agentId}
                  onChange={(e) => updateDraft(rule.id, { agentId: e.target.value })}
                >
                  <option value="">Select agent</option>
                  {agentOptions.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <select
                  className="detailsInput"
                  value={draft.type}
                  onChange={(e) => updateDraft(rule.id, { type: e.target.value })}
                >
                  {TYPE_OPTIONS.map(opt => (
                    <option key={opt || 'any'} value={opt}>{opt || 'Any'}</option>
                  ))}
                </select>
                <select
                  className="detailsInput"
                  value={draft.priority}
                  onChange={(e) => updateDraft(rule.id, { priority: e.target.value })}
                >
                  {PRIORITY_OPTIONS.map(opt => (
                    <option key={opt || 'any'} value={opt}>{opt || 'Any'}</option>
                  ))}
                </select>
                <input
                  className="detailsInput"
                  value={draft.assignee}
                  onChange={(e) => updateDraft(rule.id, { assignee: e.target.value })}
                  placeholder="username"
                />
                <input
                  className="detailsInput"
                  type="number"
                  min="0"
                  value={draft.order}
                  onChange={(e) => updateDraft(rule.id, { order: e.target.value === '' ? '' : Number(e.target.value) })}
                />
                <select
                  className="detailsInput"
                  value={draft.enabled ? 'yes' : 'no'}
                  onChange={(e) => updateDraft(rule.id, { enabled: e.target.value === 'yes' })}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <div className="routingRuleActions">
                  <button className="tiny secondary" onClick={() => handleDelete(rule)}>Delete</button>
                  <button className="tiny primary" disabled={!dirty || !draft.agentId} onClick={() => handleSave(rule)}>Save</button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="agentMeta">No routing rules yet.</div>
        )}
      </div>

      <div className="routingRuleNew">
        <div className="routingRuleRow">
          <select
            className="detailsInput"
            value={newRule.agentId}
            onChange={(e) => setNewRule(prev => ({ ...prev, agentId: e.target.value }))}
          >
            <option value="">Select agent</option>
            {agentOptions.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          <select
            className="detailsInput"
            value={newRule.type}
            onChange={(e) => setNewRule(prev => ({ ...prev, type: e.target.value }))}
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt || 'any'} value={opt}>{opt || 'Any'}</option>
            ))}
          </select>
          <select
            className="detailsInput"
            value={newRule.priority}
            onChange={(e) => setNewRule(prev => ({ ...prev, priority: e.target.value }))}
          >
            {PRIORITY_OPTIONS.map(opt => (
              <option key={opt || 'any'} value={opt}>{opt || 'Any'}</option>
            ))}
          </select>
          <input
            className="detailsInput"
            value={newRule.assignee}
            onChange={(e) => setNewRule(prev => ({ ...prev, assignee: e.target.value }))}
            placeholder="username"
          />
          <input
            className="detailsInput"
            type="number"
            min="0"
            value={newRule.order}
            onChange={(e) => setNewRule(prev => ({ ...prev, order: e.target.value === '' ? '' : Number(e.target.value) }))}
          />
          <select
            className="detailsInput"
            value={newRule.enabled ? 'yes' : 'no'}
            onChange={(e) => setNewRule(prev => ({ ...prev, enabled: e.target.value === 'yes' }))}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <div className="routingRuleActions">
            <button className="tiny primary" disabled={!newRule.agentId} onClick={handleCreate}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
