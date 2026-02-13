import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const activities = await prisma.activity.findMany({
    where: {
      action: { in: ['task.move', 'task.move.auto', 'talon.response', 'talon.comment'] }
    },
    orderBy: { at: 'desc' },
    include: {
      // Task and Project names would be nice
    }
  });

  const tasks = await prisma.task.findMany({
    where: { id: { in: activities.map(a => a.taskId).filter(Boolean) } },
    include: { project: true }
  });

  const taskMap = new Map(tasks.map(t => [t.id, t]));

  console.log(JSON.stringify(activities.map(a => {
    const task = taskMap.get(a.taskId);
    return {
      ticketNumber: task ? `${task.project.code}-${task.ticketNumber}` : 'Unknown',
      action: a.action,
      from: a.fromColumnName,
      to: a.toColumnName,
      detail: a.detail,
      actor: a.actor,
      at: a.at
    };
  }), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
