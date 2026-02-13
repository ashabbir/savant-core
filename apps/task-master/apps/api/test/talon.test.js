/**
 * Talon Integration Helper Tests
 * 
 * Unit tests for Talon integration functions
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionKey,
  resolveAgentId,
  resolveAgentKey,
  shouldTriggerOnAssignment,
  shouldTriggerOnTodoMove,
  extractTalonResponseText,
  extractTalonResponseModel,
  extractTalonUsage,
  buildTalonAgentUrl,
  buildTalonBody,
  buildTalonRequest
} from '../src/talon.js';

// ============================================================================
// SESSION KEY TESTS
// ============================================================================

test('buildSessionKey uses agent + task ids', () => {
  assert.equal(buildSessionKey('agent-1', 'task-2'), 'agent:agent-1:task:task-2');
});

test('buildSessionKey handles empty values', () => {
  assert.equal(buildSessionKey('', ''), 'agent::task:');
});

// ============================================================================
// RESOLVE AGENT ID TESTS
// ============================================================================

test('resolveAgentId prefers preferred agent, then assignee match, then default, then first agent', () => {
  const agents = [{ id: 'a1', name: 'Jarvis' }, { id: 'a2', name: 'Friday' }];
  assert.equal(resolveAgentId({ assignee: 'Jarvis', agents, defaultAgentId: '' }), 'a1');
  assert.equal(resolveAgentId({ assignee: 'Nobody', agents, defaultAgentId: '' }), 'a1');
  assert.equal(resolveAgentId({ assignee: 'Friday', agents, defaultAgentId: 'override' }), 'a2');
  assert.equal(resolveAgentId({ assignee: 'Nobody', agents, preferredAgentId: 'a2', defaultAgentId: 'override' }), 'a2');
});

test('resolveAgentId returns default when no match', () => {
  const agents = [{ id: 'a1', name: 'Agent1' }];
  assert.equal(resolveAgentId({ assignee: 'Unknown', agents, defaultAgentId: 'default-id' }), 'default-id');
});

test('resolveAgentId matches by id', () => {
  const agents = [{ id: 'a1', name: 'Jarvis' }, { id: 'a2', name: 'Friday' }];
  assert.equal(resolveAgentId({ assignee: 'a2', agents }), 'a2');
});

test('resolveAgentId matches by talonId', () => {
  const agents = [{ id: 'a1', name: 'Jarvis', talonId: 'talon-jarvis' }];
  assert.equal(resolveAgentId({ assignee: 'talon-jarvis', agents }), 'a1');
});

test('resolveAgentId returns empty string when no agents', () => {
  assert.equal(resolveAgentId({ assignee: 'anyone', agents: [] }), '');
});

// ============================================================================
// RESOLVE AGENT KEY TESTS
// ============================================================================

test('resolveAgentKey prefers talonId', () => {
  const agent = { id: 'a1', name: 'Jarvis', talonId: 'talon-key' };
  assert.equal(resolveAgentKey(agent), 'talon-key');
});

test('resolveAgentKey falls back to name', () => {
  const agent = { id: 'a1', name: 'Jarvis' };
  assert.equal(resolveAgentKey(agent), 'Jarvis');
});

test('resolveAgentKey falls back to id', () => {
  const agent = { id: 'a1' };
  assert.equal(resolveAgentKey(agent), 'a1');
});

test('resolveAgentKey returns empty for null', () => {
  assert.equal(resolveAgentKey(null), '');
});

// ============================================================================
// TRIGGER CONDITIONS TESTS
// ============================================================================

test('shouldTriggerOnAssignment only when assignee changes to non-empty', () => {
  assert.equal(shouldTriggerOnAssignment('', 'amdsh'), true);
  assert.equal(shouldTriggerOnAssignment('amdsh', 'amdsh'), false);
  assert.equal(shouldTriggerOnAssignment('amdsh', ''), false);
  assert.equal(shouldTriggerOnAssignment('john', 'jane'), true);
});

test('shouldTriggerOnTodoMove only when moving into Todo with assignee', () => {
  assert.equal(shouldTriggerOnTodoMove('Backlog', 'Todo', 'amdsh'), true);
  assert.equal(shouldTriggerOnTodoMove('Todo', 'Todo', 'amdsh'), false);
  assert.equal(shouldTriggerOnTodoMove('Backlog', 'Inprogress', 'amdsh'), false);
  assert.equal(shouldTriggerOnTodoMove('Backlog', 'Todo', ''), false);
});

test('shouldTriggerOnTodoMove is case insensitive', () => {
  assert.equal(shouldTriggerOnTodoMove('backlog', 'TODO', 'user'), true);
  assert.equal(shouldTriggerOnTodoMove('BACKLOG', 'todo', 'user'), true);
});

test('shouldTriggerOnTodoMove handles null values', () => {
  assert.equal(shouldTriggerOnTodoMove(null, 'Todo', 'user'), true);
  assert.equal(shouldTriggerOnTodoMove('Backlog', null, 'user'), false);
  assert.equal(shouldTriggerOnTodoMove('Backlog', 'Todo', null), false);
});

// ============================================================================
// EXTRACT RESPONSE TEXT TESTS
// ============================================================================

test('extractTalonResponseText pulls first message content', () => {
  const payload = {
    choices: [{ message: { content: 'Hello world' } }]
  };
  assert.equal(extractTalonResponseText(payload), 'Hello world');
});

test('extractTalonResponseText handles array content', () => {
  const payload = {
    choices: [{
      message: {
        content: [
          { text: 'Part 1' },
          { text: 'Part 2' }
        ]
      }
    }]
  };
  assert.equal(extractTalonResponseText(payload), 'Part 1\nPart 2');
});

test('extractTalonResponseText handles input_text format', () => {
  const payload = {
    choices: [{
      message: {
        content: [{ input_text: 'Some input' }]
      }
    }]
  };
  assert.equal(extractTalonResponseText(payload), 'Some input');
});

test('extractTalonResponseText returns empty for null', () => {
  assert.equal(extractTalonResponseText(null), '');
  assert.equal(extractTalonResponseText(undefined), '');
  assert.equal(extractTalonResponseText({}), '');
});

test('extractTalonResponseText handles missing choices', () => {
  assert.equal(extractTalonResponseText({ choices: [] }), '');
  assert.equal(extractTalonResponseText({ choices: [{}] }), '');
});

// ============================================================================
// EXTRACT RESPONSE MODEL TESTS
// ============================================================================

test('extractTalonResponseModel returns model from payload', () => {
  const payload = { model: 'anthropic/claude-opus-4-6' };
  assert.equal(extractTalonResponseModel(payload), 'anthropic/claude-opus-4-6');
});

test('extractTalonResponseModel falls back when missing', () => {
  assert.equal(extractTalonResponseModel({}, 'talon:test'), 'talon:test');
  assert.equal(extractTalonResponseModel(null, 'fallback'), 'fallback');
});

// ============================================================================
// EXTRACT USAGE TESTS
// ============================================================================

test('extractTalonUsage reads token counts', () => {
  const payload = {
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 }
  };
  assert.deepEqual(extractTalonUsage(payload), { inputTokens: 12, outputTokens: 7, totalTokens: 19 });
});

test('extractTalonUsage handles alternate fields', () => {
  const payload = {
    usage: { input_tokens: 5, output_tokens: 6 }
  };
  assert.deepEqual(extractTalonUsage(payload), { inputTokens: 5, outputTokens: 6, totalTokens: 11 });
});

test('extractTalonUsage handles missing usage', () => {
  assert.deepEqual(extractTalonUsage({}), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  assert.deepEqual(extractTalonUsage(null), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
});

test('extractTalonUsage handles tokens field', () => {
  const payload = {
    usage: { tokens: 100 }
  };
  assert.deepEqual(extractTalonUsage(payload), { inputTokens: 0, outputTokens: 0, totalTokens: 100 });
});

// ============================================================================
// BUILD TALON AGENT URL TESTS
// ============================================================================

test('buildTalonAgentUrl builds agent endpoint', () => {
  assert.equal(buildTalonAgentUrl('https://example.com', ''), 'https://example.com/v1/agents');
  assert.equal(buildTalonAgentUrl('https://example.com', 'agent-1'), 'https://example.com/v1/agents/agent-1');
});

test('buildTalonAgentUrl handles trailing slash', () => {
  assert.equal(buildTalonAgentUrl('https://example.com/', 'agent-1'), 'https://example.com/v1/agents/agent-1');
});

// ============================================================================
// BUILD TALON BODY TESTS
// ============================================================================

test('buildTalonBody creates correct structure', () => {
  const result = buildTalonBody({
    agentKey: 'test-agent',
    task: { id: 't1', title: 'Test Task', description: 'Do something' },
    project: { description: 'Project desc' },
    sessionKey: 'session-123'
  });

  assert.equal(result.model, 'talon:test-agent');
  assert.ok(result.messages);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, 'user');
  assert.ok(result.messages[0].content.includes('Test Task'));
  assert.equal(result.metadata.sessionKey, 'session-123');
});

test('buildTalonBody includes task details', () => {
  const result = buildTalonBody({
    agentKey: 'agent',
    task: {
      id: 't1',
      projectId: 'p1',
      title: 'My Task',
      description: 'Description here',
      type: 'story',
      priority: 'high',
      assignee: 'john'
    },
    project: {},
    sessionKey: 'key'
  });

  const content = result.messages[0].content;
  assert.ok(content.includes('Task: My Task'));
  assert.ok(content.includes('Description: Description here'));
  assert.ok(content.includes('Type: story'));
  assert.ok(content.includes('Priority: high'));
  assert.ok(content.includes('Assignee: john'));
});

// ============================================================================
// BUILD TALON REQUEST TESTS
// ============================================================================

test('buildTalonRequest creates full request object', () => {
  const result = buildTalonRequest({
    gatewayUrl: 'https://talon.example.com',
    token: 'secret-token',
    agentId: 'agent-1',
    sessionKey: 'session-key',
    task: { id: 't1', title: 'Task' },
    project: {}
  });

  assert.ok(result.url);
  assert.ok(result.headers);
  assert.ok(result.body);
  assert.equal(result.url, 'https://talon.example.com/v1/chat/completions');
  assert.equal(result.headers.Authorization, 'Bearer secret-token');
  assert.equal(result.headers['Content-Type'], 'application/json');
  assert.equal(result.headers['x-talon-agent-id'], 'agent-1');
  assert.equal(result.headers['x-talon-session-key'], 'session-key');
});

test('buildTalonRequest omits Authorization when no token', () => {
  const result = buildTalonRequest({
    gatewayUrl: 'https://talon.example.com',
    token: '',
    agentId: 'agent-1',
    sessionKey: 'key',
    task: { id: 't1', title: 'Task' },
    project: {}
  });

  assert.equal(result.headers.Authorization, undefined);
});
