import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEEDS_DIR = path.join(__dirname, 'seeds');

async function main() {
  console.log('--- Starting Seed Runner ---');
  
  // Ensure we can reach the DB and SeedRecord model exists
  try {
    await prisma.seedRecord.count();
  } catch (err) {
    console.error('SeedRecord model not found or DB unreachable. Make sure "prisma db push" has run.');
    console.error(err.message);
    process.exit(1);
  }

  // Get all .js files in seeds directory, sorted by name
  if (!fs.existsSync(SEEDS_DIR)) {
    console.log('No seeds directory found. Skipping.');
    return;
  }

  const seedFiles = fs.readdirSync(SEEDS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  for (const file of seedFiles) {
    const record = await prisma.seedRecord.findUnique({ where: { name: file } });
    if (record) {
      console.log(`[SKIPPING] Seed "${file}" already ran on ${record.runAt}`);
      continue;
    }

    console.log(`[RUNNING] Seed "${file}"...`);
    try {
      const { default: seedFn } = await import(`./seeds/${file}`);
      if (typeof seedFn !== 'function') {
        throw new Error(`Seed file ${file} does not export a default function.`);
      }
      
      await seedFn(prisma);
      
      await prisma.seedRecord.create({ data: { name: file } });
      console.log(`[COMPLETED] Seed "${file}" recorded.`);
    } catch (err) {
      console.error(`[FAILED] Seed "${file}":`, err);
      // We don't record failed seeds so they can be retried
      process.exit(1);
    }
  }

  console.log('--- Seed Runner Finished ---');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
