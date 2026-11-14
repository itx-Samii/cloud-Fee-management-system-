import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import { startLocalDatabase } from './local-db';

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const development = process.argv.includes('--dev');
  loadEnvConfig(root, development);
  if (!development && !existsSync(path.join(root, '.next', 'BUILD_ID'))) {
    throw new Error('Build the app first with npm run build, or use npm run offline:dev.');
  }
  const database = await startLocalDatabase(root, process.env.DATABASE_URL ?? '');
  console.log('Offline database ready. Open http://localhost:3001. Keep this window open.');
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), development ? 'dev' : 'start', '-p', '3001', '-H', '127.0.0.1'], {
    cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NODE_ENV: development ? 'development' : 'production' },
  });
  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null) child.kill();
    await database.stop();
    process.exitCode = code;
  };
  child.once('error', () => { void stop(1); });
  child.once('exit', (code) => { void stop(code ?? 0); });
  process.once('SIGINT', () => { void stop(0); });
  process.once('SIGTERM', () => { void stop(0); });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not start the offline app.');
  process.exitCode = 1;
});
