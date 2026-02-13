#!/usr/bin/env node
import { prisma } from '../src/db.js';

async function main() {
  const org = await prisma.org.findUnique({ where: { slug: 'savant' } });
  if (!org) throw new Error('Org savant not found. Run db:seed first.');

  const res = await prisma.project.updateMany({ where: { orgId: null }, data: { orgId: org.id } });
  console.log('backfilled projects orgId:', res.count);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
