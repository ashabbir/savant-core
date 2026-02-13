import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { username: 'amdsh' } });
  console.log(user?.apiKey);
}

main().finally(() => prisma.$disconnect());
