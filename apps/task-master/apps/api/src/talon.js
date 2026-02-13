export function buildSessionKey(agentKey, taskId) {
  return `agent:${agentKey}:task:${taskId}`;
}

export function resolveAgentId({ assignee, agents = [], defaultAgentId = '', preferredAgentId = '' }) {
  if (preferredAgentId) {
    const preferred = agents.find(a => a.id === preferredAgentId);
    if (preferred?.id) return preferred.id;
  }
  if (assignee) {
    const match = agents.find(a => a.name === assignee || a.id === assignee || a.talonId === assignee);
    if (match?.id) return match.id;
  }
  if (defaultAgentId) return defaultAgentId;
  return agents[0]?.id || '';
}

export function resolveAgentKey(agent) {
  if (!agent) return '';
  return agent.talonAgentId || agent.talonId || agent.name || agent.id || '';
}

export function shouldTriggerOnAssignment(prevAssignee, nextAssignee) {
  if (!nextAssignee) return false;
  return prevAssignee !== nextAssignee;
}

export function shouldTriggerOnTodoMove(fromColumnName, toColumnName, assignee) {
  if (!assignee) return false;
  if (!toColumnName) return false;
  if (String(fromColumnName || '').toLowerCase() === String(toColumnName || '').toLowerCase()) return false;
  return String(toColumnName).toLowerCase() === 'todo';
}

export function buildTalonBody({ agentKey, task, project, sessionKey, context, comment }) {
  const projectContext = context || {
    description: project?.description || '',
    repoPath: project?.repoPath || '',
    localPath: project?.localPath || '',
    notes: project?.notes || ''
  };

  const taskSummary = [
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : null,
    task.type ? `Type: ${task.type}` : null,
    task.priority ? `Priority: ${task.priority}` : null,
    task.assignee ? `Assignee: ${task.assignee}` : null,
    task.projectId ? `ProjectId: ${task.projectId}` : null,
    task.id ? `TaskId: ${task.id}` : null,
    `Project: ${project?.name || ''} (${project?.code || ''})`
  ].filter(Boolean).join('\n');

  const contextSummary = [
    `Project Description: ${projectContext.description || '—'}`,
    `Repo Path: ${projectContext.repoPath || '—'}`,
    `Local Path: ${projectContext.localPath || '—'}`,
    `Notes: ${projectContext.notes || '—'}`
  ].join('\n');

  const messages = [
    {
      role: 'user',
      content: [
        'You are a senior software developer assigned a Task Master task. Use the Task Master API to update status and post comments.',
        'When you start work, move the task to Inprogress. When you finish, move it to the next column (typically Review or Done).',
        '',
        'CONTEXT:',
        taskSummary,
        '',
        'PROJECT DETAILS:',
        contextSummary
      ].join('\n')
    }
  ];

  if (comment) {
    messages.push({
      role: 'user',
      content: `NEW COMMENT from ${comment.author}:\n${comment.body}`
    });
  }

  return {
    model: `talon:${agentKey}`,
    messages,
    metadata: {
      sessionKey
    }
  };
}

export function buildTalonRequest({ gatewayUrl, token, agentId, sessionKey, task, project, context, comment }) {
  const url = new URL('/v1/chat/completions', gatewayUrl).toString();
  return {
    url,
    headers: {
      Authorization: token ? `Bearer ${token}` : undefined,
      'Content-Type': 'application/json',
      'x-talon-agent-id': agentId,
      'x-talon-session-key': sessionKey
    },
    body: buildTalonBody({ agentKey: agentId, task, project, sessionKey, context, comment })
  };
}

export function buildTalonAgentUrl(gatewayUrl, agentId = '') {
  const path = agentId ? `/v1/agents/${agentId}` : '/v1/agents';
  return new URL(path, gatewayUrl).toString();
}

function coerceString(value) {
  return typeof value === 'string' ? value : '';
}

function extractContentParts(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.input_text === 'string') return part.input_text;
      return '';
    }).filter(Boolean).join('\n');
  }
  return '';
}

export function extractTalonResponseText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const msg = first.message || {};
  const content = extractContentParts(msg.content);
  return coerceString(content).trim();
}

export function extractTalonResponseModel(payload, fallback = '') {
  if (!payload || typeof payload !== 'object') return fallback;
  const model = coerceString(payload.model);
  return model || fallback;
}

export function extractTalonUsage(payload) {
  if (!payload || typeof payload !== 'object') {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const usage = payload.usage || {};
  const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || 0) || 0;
  const outputTokens = Number(usage.completion_tokens || usage.output_tokens || 0) || 0;
  const totalTokens = Number(usage.total_tokens || usage.tokens || inputTokens + outputTokens) || 0;
  return { inputTokens, outputTokens, totalTokens };
}
