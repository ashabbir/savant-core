#!/usr/bin/env node
import { prisma } from '../src/db.js';

// Goal: normalize all projects to 4 columns: Backlog / Todo / Inprogress / Done
// Mapping:
// - Next -> Todo
// - Waiting on Ahmed -> Inprogress
// - Doing -> Inprogress
// Existing Backlog/Done preserved.

const TARGET = ['Backlog', 'Todo', 'Inprogress', 'Done'];

async function main() {
  const projects = await prisma.project.findMany();
  for (const p of projects) {
    const columns = Array.isArray(p.columns) ? p.columns : [];
    const byName = new Map(columns.map(c => [c.name, c]));

    // Move tasks from legacy columns into new ones
    if (byName.has('Next')) {
      await prisma.task.updateMany({ where: { projectId: p.id, columnName: 'Next' }, data: { columnName: 'Todo' } });
    }

    if (byName.has('Waiting on Ahmed')) {
      await prisma.task.updateMany({ where: { projectId: p.id, columnName: 'Waiting on Ahmed' }, data: { columnName: 'Inprogress' } });
    }

    if (byName.has('Doing')) {
      await prisma.task.updateMany({ where: { projectId: p.id, columnName: 'Doing' }, data: { columnName: 'Inprogress' } });
    }

    // Reset project columns to target set
    await prisma.project.update({
      where: { id: p.id },
      data: { columns: TARGET.map((name, i) => ({ name, order: i, enabled: true })) }
    });

    console.log(`normalized: ${p.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
