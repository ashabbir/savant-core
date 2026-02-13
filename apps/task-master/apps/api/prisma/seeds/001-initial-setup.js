import crypto from 'node:crypto';
import { DEFAULT_COLUMNS } from '../../src/seedDefaults.js';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export default async function seed(prisma) {
  // 1. Core infrastructure (Always ensure these exist, non-destructively)
  
  // Seed admin user
  const admin = await prisma.user.upsert({
    where: { username: 'amdsh' },
    update: { role: 'ADMIN', active: true },
    create: {
      username: 'amdsh',
      role: 'ADMIN',
      passwordHash: hashPassword('password'),
      apiKey: crypto.randomBytes(24).toString('hex'),
      projectIds: []
    }
  });

  const member = await prisma.user.upsert({
    where: { username: 'member' },
    update: { role: 'MEMBER', active: true },
    create: {
      username: 'member',
      role: 'MEMBER',
      passwordHash: hashPassword('password'),
      apiKey: crypto.randomBytes(24).toString('hex'),
      projectIds: []
    }
  });

  // Ensure TA and TM projects exist
  const talonProject = await prisma.project.upsert({
    where: { code: 'TA' },
    update: {},
    create: {
      name: 'Talon',
      code: 'TA',
      columns: DEFAULT_COLUMNS.map((name, i) => ({ name, order: i, enabled: true })),
      description: 'The AI agent execution platform.',
      repoPath: 'apps/talon'
    }
  });

  const tmProject = await prisma.project.upsert({
    where: { code: 'TM' },
    update: {},
    create: {
      name: 'Task Master',
      code: 'TM',
      columns: DEFAULT_COLUMNS.map((name, i) => ({ name, order: i, enabled: true })),
      description: 'The task management UI and API.',
      repoPath: 'apps/task-master'
    }
  });

  // Assign projects to users
  await prisma.user.update({ 
    where: { id: admin.id }, 
    data: { projectIds: { set: [talonProject.id, tmProject.id] } } 
  });
  await prisma.user.update({ 
    where: { id: member.id }, 
    data: { projectIds: { set: [talonProject.id, tmProject.id] } } 
  });

  // Seed default agents
  const openaiAgent = await prisma.agent.upsert({
    where: { name: 'openai-codex' }, 
    update: {},
    create: {
      name: 'openai-codex',
      role: 'Default',
      status: 'active',
      sessionKey: 'agent:openai-codex:main',
      model: 'openai-codex/gpt-5.2-codex',
      talonAgentId: 'openai-codex' // Ensure talonAgentId is set
    }
  });

  const geminiAgent = await prisma.agent.upsert({
    where: { name: 'gemini-cli' },
    update: {},
    create: {
      name: 'gemini-cli',
      role: 'Gemini',
      status: 'idle',
      sessionKey: 'agent:gemini-cli:main',
      model: 'google-gemini-cli/gemini-3-pro-preview',
      talonAgentId: 'gemini-cli' // Ensure talonAgentId is set
    }
  });

  await prisma.user.update({ where: { id: admin.id }, data: { preferredAgentId: openaiAgent.id } });
  await prisma.user.update({ where: { id: member.id }, data: { preferredAgentId: geminiAgent.id } });

  // Seed Epics & Stories (Non-destructively)
  const seedTask = async (data) => {
    const existing = await prisma.task.findFirst({
        where: { projectId: data.projectId, ticketNumber: data.ticketNumber }
    });
    if (existing) return existing;
    return await prisma.task.create({ data });
  };

  const epic1 = await seedTask({
    projectId: talonProject.id,
    columnName: 'Backlog',
    title: 'Epic 1: Dynamic Agent Management via API',
    description: 'Allow external systems (Task Master) to create and configure agents over HTTP.',
    type: 'epic',
    order: 0,
    ticketNumber: 1,
    createdBy: 'system',
    assignee: 'member',
    priority: 'medium'
  });

  await seedTask({
    projectId: talonProject.id,
    columnName: 'Todo',
    title: 'Story 1.1: Agent Registry Service',
    description: 'Implement a service to store and retrieve agent configurations from a persistent store (JSON file or DB).',
    type: 'story',
    epicId: epic1.id,
    order: 0,
    ticketNumber: 2,
    createdBy: 'system',
    assignee: 'amdsh',
    priority: 'medium'
  });

  await seedTask({
    projectId: talonProject.id,
    columnName: 'Todo',
    title: 'Story 1.2: Agent Management Endpoints',
    description: 'Implement HTTP PUT/GET methods (PUT /v1/agents/:id, GET /v1/agents) to manage agents.',
    type: 'story',
    epicId: epic1.id,
    order: 1,
    ticketNumber: 3,
    createdBy: 'system',
    assignee: 'amdsh',
    priority: 'medium'
  });

  const epic3 = await seedTask({
    projectId: tmProject.id,
    columnName: 'Backlog',
    title: 'Epic 3: Agent Configuration UI',
    description: 'Enable users to define AI agents within the Task Master interface.',
    type: 'epic',
    order: 0,
    ticketNumber: 1,
    createdBy: 'system',
    assignee: 'member',
    priority: 'medium'
  });

  await seedTask({
    projectId: tmProject.id,
    columnName: 'Todo',
    title: 'Story 3.1: Agent Editor Enhancements',
    description: 'Add fields for "Soul", "Bootstrap Command", and "Repository Context" in the Agent Create/Edit form.',
    type: 'story',
    epicId: epic3.id,
    order: 0,
    ticketNumber: 2,
    createdBy: 'system',
    assignee: 'amdsh',
    priority: 'medium'
  });

  await seedTask({
    projectId: tmProject.id,
    columnName: 'Todo',
    title: 'Story 3.2: Sync to Talon',
    description: 'Automatically push Agent config changes to Talon via API on save.',
    type: 'story',
    epicId: epic3.id,
    order: 1,
    ticketNumber: 3,
    createdBy: 'system',
    assignee: 'amdsh',
    priority: 'medium'
  });

  const docCount = await prisma.document.count();
  if (docCount === 0) {
    await prisma.document.createMany({
      data: [
        { title: 'Mission Control MVP Outline', type: 'deliverable', content: 'Initial layout + board + agents + activity + docs', createdBy: 'system' },
        { title: 'Agent Roles', type: 'protocol', content: 'Short descriptions for each agent role.', createdBy: 'system' }
      ]
    });
  }
}
