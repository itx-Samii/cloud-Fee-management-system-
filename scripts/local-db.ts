import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** Flush PostgreSQL normally on Windows instead of the dependency's force-kill fallback. */
class PersistentLocalPostgres extends EmbeddedPostgres {
  private started = false;
  private stopping?: Promise<void>;

  override async start() {
    await super.start();
    this.started = true;
  }

  override async stop(): Promise<void> {
    if (!this.started) return;
    this.stopping ??= (async () => {
      if (process.platform === 'win32') {
        const packageName = '@embedded-postgres/windows-x64';
        const { pg_ctl } = await import(packageName) as { pg_ctl: string };
        await promisify(execFile)(pg_ctl, ['-D', this.options.databaseDir, 'stop', '-m', 'fast', '-w', '-t', '20'], { windowsHide: true });
      } else {
        await super.stop();
      }
      this.started = false;
    })();
    return this.stopping;
  }
}

/** Only the dedicated local cluster may be started by this command. */
export function localDatabaseOptions(connectionString: string) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Set DATABASE_URL to the local Postgres connection described in README.md.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '54329'
    || url.pathname !== '/postgres' || url.username !== 'postgres'
    || !url.password || url.search || url.hash) {
    throw new Error('db:local requires postgres://postgres:PASSWORD@127.0.0.1:54329/postgres.');
  }
  return {
    user: 'postgres', password: decodeURIComponent(url.password), port: 54329,
    persistent: true, authMethod: 'scram-sha-256' as const,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1'],
  };
}

export async function startLocalDatabase(root: string, connectionString: string) {
  const options = localDatabaseOptions(connectionString);
  const probe = postgres(connectionString, { max: 1, connect_timeout: 2 });
  try {
    await probe`select 1`;
    return { owned: false, stop: async () => {} };
  } catch (error) {
    if ((error as { code?: string }).code !== 'ECONNREFUSED') {
      throw new Error('Cannot connect to local PostgreSQL. Keep the original database password and check local access.');
    }
  } finally {
    await probe.end({ timeout: 1 });
  }
  const databaseDir = path.join(root, '.local-postgres');
  const server = new PersistentLocalPostgres({
    ...options,
    databaseDir,
    onLog: () => {},
    onError: () => console.error('Local Postgres reported an error.'),
  });
  // Reuse the same cluster on every run; never initialise over existing data.
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await server.initialise();
  await server.start();
  const client = server.getPgClient('postgres', '127.0.0.1');
  try {
    await client.connect();
    await client.query('select 1');
  } catch {
    await server.stop();
    throw new Error('Local database authentication failed. Keep the original database password in .env.local.');
  } finally {
    await client.end();
  }
  return { owned: true, stop: () => server.stop() };
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  loadEnvConfig(root, true);
  const server = await startLocalDatabase(root, process.env.DATABASE_URL ?? '');
  if (!server.owned) console.log('Reusing the running local database.');
  console.log('Local database ready at 127.0.0.1:54329. Run npm run dev in another terminal.');
  console.log('Data stays in .local-postgres after stopping. Press Ctrl+C to stop.');
  // embedded-postgres handles process exit and preserves this persistent cluster.
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Could not start local Postgres. Check that port 54329 is free.');
    process.exitCode = 1;
  });
}
