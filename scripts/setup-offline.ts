import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import { localDatabaseOptions } from './local-db';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(root, '.env.local');
if (!existsSync(envFile)) {
  if (existsSync(path.join(root, '.local-postgres', 'PG_VERSION'))) {
    throw new Error('Existing local data found without .env.local. Restore the original settings file; do not generate a new password.');
  }
  writeFileSync(envFile, [
    `DATABASE_URL=postgres://postgres:${randomBytes(24).toString('hex')}@127.0.0.1:54329/postgres`,
    `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    `SUPERADMIN_PASSWORD=${randomBytes(18).toString('hex')}`,
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Created private local settings in .env.local. Keep this file with your database backup.');
}
loadEnvConfig(root, true);
localDatabaseOptions(process.env.DATABASE_URL ?? '');
console.log('Local database configuration verified. Existing settings and data were preserved.');
