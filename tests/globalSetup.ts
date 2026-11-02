import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/**
 * One Postgres server for the run; every test file gets its own empty database on it. CI points
 * TEST_DATABASE_URL at its Postgres service; otherwise a throwaway server is started here.
 */
export default async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    project.provide('postgresUrl', process.env.TEST_DATABASE_URL);
    return;
  }

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = mkdtempSync(path.join(tmpdir(), 'fms-test-pg-'));
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: false,
    // Supabase databases are UTF-8; Windows would otherwise pick its own code page.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });
  await server.initialise();
  await server.start();
  project.provide('postgresUrl', `postgres://postgres:postgres@127.0.0.1:${port}/postgres`);

  return async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
