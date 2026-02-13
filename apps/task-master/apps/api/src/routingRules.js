export function normalizeRuleValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function ruleMatchesTask(rule, task) {
  if (!rule || !task) return false;
  if (rule.enabled === false) return false;
  const type = normalizeRuleValue(rule.type).toLowerCase();
  const priority = normalizeRuleValue(rule.priority).toLowerCase();
  const assignee = normalizeRuleValue(rule.assignee);

  if (type && String(task.type || '').toLowerCase() !== type) return false;
  if (priority && String(task.priority || '').toLowerCase() !== priority) return false;
  if (assignee && String(task.assignee || '') !== assignee) return false;
  return true;
}

export function resolveAgentIdFromRules({ rules = [], task }) {
  const sorted = [...rules].sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : 0;
    const bo = typeof b.order === 'number' ? b.order : 0;
    if (ao !== bo) return ao - bo;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  const match = sorted.find(rule => ruleMatchesTask(rule, task));
  return match?.agentId || '';
}
