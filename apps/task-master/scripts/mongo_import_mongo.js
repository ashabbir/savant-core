#!/usr/bin/env node
/**
 * Import JSON export into MongoDB using Prisma.
 *
 * Prereqs:
 * 1) prisma/schema.prisma datasource provider = "mongodb"
 * 2) DATABASE_URL points to Mongo
 * 3) Run: npx prisma db push
 * 4) Run: node scripts/mongo_import_mongo.js <path-to-export.json>
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const genId = () => crypto.randomBytes(12).toString('hex');

(async () => {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/mongo_import_mongo.js <export.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(input, 'utf-8');
  const data = JSON.parse(raw);

  const users = data.users || [];
  const projects = data.projects || [];
  const columns = data.columns || [];
  const tasks = data.tasks || [];
  const comments = data.comments || [];
  const activities = data.activities || [];
  const agents = data.agents || [];
  const documents = data.documents || [];
  const agentMessages = data.agentMessages || [];
  const userProjects = data.userProjects || [];

  const mapIds = (rows) => rows.reduce((acc, r) => {
    acc[r.id] = genId();
    return acc;
  }, {});

  const userMap = mapIds(users);
  const projectMap = mapIds(projects);
  const taskMap = mapIds(tasks);
  const commentMap = mapIds(comments);
  const activityMap = mapIds(activities);
  const agentMap = mapIds(agents);
  const documentMap = mapIds(documents);
  const agentMessageMap = mapIds(agentMessages);

  const columnNameById = columns.reduce((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  const columnsByProject = columns.reduce((acc, c) => {
    (acc[c.projectId] ||= []).push({
      name: c.name,
      order: c.order ?? 0,
      enabled: c.enabled !== false
    });
    return acc;
  }, {});

  const userProjectIds = userProjects.reduce((acc, up) => {
    (acc[up.userId] ||= []).push(up.projectId);
    return acc;
  }, {});

  const mapped = {
    users: users.map(u => {
      const mappedIds = (u.projectIds || []).map(pid => projectMap[pid]).filter(Boolean);
      const extraIds = (userProjectIds[u.id] || []).map(pid => projectMap[pid]).filter(Boolean);
      const projectIds = [...new Set([...mappedIds, ...extraIds])];
      return { ...u, id: userMap[u.id], projectIds };
    }),
    projects: projects.map(p => ({
      ...p,
      id: projectMap[p.id],
      columns: (columnsByProject[p.id] || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    })),
    tasks: tasks.map(t => ({
      ...t,
      id: taskMap[t.id],
      projectId: projectMap[t.projectId],
      columnName: t.columnName || columnNameById[t.columnId] || 'Backlog',
      epicId: t.epicId ? taskMap[t.epicId] : null
    })),
    comments: comments.map(c => ({ ...c, id: commentMap[c.id], taskId: taskMap[c.taskId] })),
    activities: activities.map(a => ({
      ...a,
      id: activityMap[a.id],
      projectId: a.projectId ? projectMap[a.projectId] : null,
      taskId: a.taskId ? taskMap[a.taskId] : null,
      fromColumnName: a.fromColumnName || columnNameById[a.fromColumnId] || null,
      toColumnName: a.toColumnName || columnNameById[a.toColumnId] || null
    })),
    agents: agents.map(a => ({
      ...a,
      id: agentMap[a.id],
      currentTaskId: a.currentTaskId ? taskMap[a.currentTaskId] : null
    })),
    documents: documents.map(d => ({
      ...d,
      id: documentMap[d.id],
      taskId: d.taskId ? taskMap[d.taskId] : null
    })),
    agentMessages: agentMessages.map(m => ({
      ...m,
      id: agentMessageMap[m.id],
      agentId: agentMap[m.agentId]
    }))
  };

  const importOrder = [
    'users',
    'projects',
    'tasks',
    'comments',
    'activities',
    'agents',
    'documents',
    'agentMessages'
  ];

  const inserters = {
    users: (row) => prisma.user.create({ data: row }),
    projects: (row) => prisma.project.create({ data: row }),
    tasks: (row) => prisma.task.create({ data: row }),
    comments: (row) => prisma.comment.create({ data: row }),
    activities: (row) => prisma.activity.create({ data: row }),
    agents: (row) => prisma.agent.create({ data: row }),
    documents: (row) => prisma.document.create({ data: row }),
    agentMessages: (row) => prisma.agentMessage.create({ data: row })
  };

  try {
    for (const key of importOrder) {
      const rows = mapped[key] || [];
      if (!rows.length) continue;
      for (const row of rows) {
        await inserters[key](row);
      }
      console.log(`Imported ${key}: ${rows.length}`);
    }
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
