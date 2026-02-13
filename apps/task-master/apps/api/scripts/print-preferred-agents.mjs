import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const users = await prisma.user.findMany({ select: { username: true, preferredAgentId: true } });
const agents = await prisma.agent.findMany({ select: { id: true, name: true } });
const byId = new Map(agents.map(a => [a.id, a.name]));
console.log(users.map(u => ({ user: u.username, preferredAgent: u.preferredAgentId ? byId.get(u.preferredAgentId) : null })));
await prisma.$disconnect();
