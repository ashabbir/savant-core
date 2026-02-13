import { PrismaClient } from '@prisma/client';

// DB path is defined in prisma/schema.prisma
export const prisma = new PrismaClient();
