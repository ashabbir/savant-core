import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const agents = await prisma.agent.findMany();
  console.log(JSON.stringify(agents, null, 2));
}
main().finally(() => prisma.$disconnect());
