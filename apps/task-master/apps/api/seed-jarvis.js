import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const jarvis = await prisma.agent.findFirst({
    where: { name: 'Jarvis' }
  });

  if (!jarvis) {
    console.log('Creating Jarvis agent...');
    await prisma.agent.create({
      data: {
        name: 'Jarvis',
        role: 'Main Assistant',
        talonAgentId: 'jarvis',
        isMain: true, // Wait, I didn't add isMain yet, I'll add it to schema now
        soul: 'You are Jarvis, the primary system assistant.',
        status: 'active'
      }
    });
  }
}

main().finally(() => prisma.$disconnect());
