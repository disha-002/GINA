/**
 * Loads backend/.env so DATABASE_URL is set (npm scripts do not load .env by default).
 * Then runs migrations in order via psql.
 */
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

config({ path: join(root, '.env'), quiet: true });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(
    'DATABASE_URL is missing. Add it to backend/.env (Supabase: Project Settings → Database → connection string).',
  );
  process.exit(1);
}

const migrationFiles = [
  '001_initial_schema.sql',
  '002_dataset_content_hash.sql',
  '003_semantic_states_dataset_overview.sql',
  '004_semantic_states_starter_questions_cache.sql',
];

for (const name of migrationFiles) {
  const migrationFile = join(root, 'migrations', name);
  const result = spawnSync('psql', [url, '-f', migrationFile], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });

  if (result.error) {
    console.error(
      'Could not run psql. Install PostgreSQL client tools and ensure psql is on your PATH.',
    );
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0 && result.status !== null) {
    process.exit(result.status);
  }
}

process.exit(0);
