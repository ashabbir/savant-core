#!/usr/bin/env node
import { prisma } from '../src/db.js';

function inferPurpose(title = '') {
  const t = title.trim();
  if (!t) return 'Track and complete this task.';

  // common patterns: "Area: thing" or "Area - thing"
  if (t.includes(':')) {
    const [a, b] = t.split(/:(.+)/).map(s => s.trim());
    if (b) return `Work on ${b} (${a}).`;
  }
  if (t.includes(' - ')) {
    const [a, b] = t.split(/ - (.+)/).map(s => s.trim());
    if (b) return `Work on ${b} (${a}).`;
  }

  // default
  return `Complete: ${t}.`;
}

function inferDescription(title = '') {
  return `Purpose: ${inferPurpose(title)}`;
}

async function main() {
  const tasks = await prisma.task.findMany({
    include: { project: true, column: true, comments: true },
    orderBy: [{ createdAt: 'asc' }]
  });

  let updatedDesc = 0;
  let createdComments = 0;

  for (const task of tasks) {
    // Ensure description
    if (!task.description || task.description.trim() === '') {
      await prisma.task.update({
        where: { id: task.id },
        data: { description: inferDescription(task.title) }
      });
      updatedDesc++;
    }

    // Ensure at least one comment
    if (!task.comments || task.comments.length === 0) {
      const body = [
        `Imported into Task app for unified project tracking.`,
        `Project: ${task.project?.name || task.projectId}`,
        `Status: ${task.column?.name || '—'}`,
        `Purpose: ${inferPurpose(task.title)}`
      ].join('\n');

      await prisma.comment.create({
        data: {
          taskId: task.id,
          author: 'clawd',
          body
        }
      });

      await prisma.activity.create({
        data: {
          actor: 'system',
          action: 'comment.create',
          detail: `auto: ${task.title}`,
          projectId: task.projectId,
          taskId: task.id
        }
      });

      createdComments++;
    }
  }

  console.log(`updated descriptions: ${updatedDesc}`);
  console.log(`created comments: ${createdComments}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
