import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgentIdFromRules } from '../src/routingRules.js';

test('resolveAgentIdFromRules matches by type/priority/assignee', () => {
  const rules = [
    { agentId: 'a1', type: 'story', priority: '', assignee: '', enabled: true, order: 1 },
    { agentId: 'a2', type: 'bug', priority: 'high', assignee: 'amdsh', enabled: true, order: 0 }
  ];
  const task = { type: 'bug', priority: 'high', assignee: 'amdsh' };
  assert.equal(resolveAgentIdFromRules({ rules, task }), 'a2');
});

test('resolveAgentIdFromRules returns empty when no match', () => {
  const rules = [{ agentId: 'a1', type: 'epic', priority: '', assignee: '', enabled: true, order: 0 }];
  const task = { type: 'story', priority: 'low', assignee: '' };
  assert.equal(resolveAgentIdFromRules({ rules, task }), '');
});
