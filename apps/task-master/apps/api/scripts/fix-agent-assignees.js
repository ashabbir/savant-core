import { prisma } from '../src/db.js';

async function main() {
  const agents = await prisma.agent.findMany();

  let totalUpdated = 0;
  for (const agent of agents) {
    const candidates = [agent.id, agent.openclawId].filter(Boolean);
    if (!candidates.length) continue;
    const result = await prisma.task.updateMany({
      where: { assignee: { in: candidates } },
      data: { assignee: agent.name }
    });
    if (result.count) {
      totalUpdated += result.count;
      console.log(`Updated ${result.count} task(s) for agent ${agent.name}.`);
    }
  }

  console.log(`Updated ${totalUpdated} task assignee(s).`);
}

main()
  .catch((err) => {
    console.error('Failed to fix assignees', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
