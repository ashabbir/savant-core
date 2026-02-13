#!/usr/bin/env node
import { prisma } from '../src/db.js';

// Assign Task.ticketNumber sequentially per project, using createdAt order.
// Safe to re-run: only fills tasks where ticketNumber is null.

async function main() {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' } });
  for (const p of projects) {
    // Get existing max
    const max = await prisma.task.aggregate({
      where: { projectId: p.id, ticketNumber: { not: null } },
      _max: { ticketNumber: true }
    });
    let next = (max._max.ticketNumber ?? 0) + 1;

    const tasks = await prisma.task.findMany({
      where: { projectId: p.id, ticketNumber: null },
      orderBy: { createdAt: 'asc' }
    });

    if (!tasks.length) continue;

    await prisma.$transaction(
      tasks.map((t) => {
        const n = next++;
        return prisma.task.update({ where: { id: t.id }, data: { ticketNumber: n } });
      })
    );

    console.log(`backfilled ${tasks.length} tasks in ${p.code} (${p.name})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
