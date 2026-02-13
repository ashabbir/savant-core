import { prisma } from '../src/db.js';

async function run() {
  const all = await prisma.agent.findMany({ orderBy: { createdAt: 'asc' } });
  if (!all.length) {
    console.log('No agents found.');
    return;
  }

  const jarvis = all.find((a) => String(a.name || '').toLowerCase() === 'jarvis') || all[0];

  await prisma.agent.updateMany({ data: { isMain: false } });
  await prisma.agent.update({ where: { id: jarvis.id }, data: { isMain: true } });

  console.log(`Main agent set to: ${jarvis.name} (${jarvis.id})`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
