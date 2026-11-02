import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, inject, vi } from 'vitest';

// A fresh database for this test file.
const server = inject('postgresUrl');
const name = `fms_test_${randomUUID().slice(0, 8)}`;
const admin = postgres(server, { max: 1, onnotice: () => {} });
await admin.unsafe(`create database ${name} encoding 'UTF8' template template0`);
await admin.end();

const url = new URL(server);
url.pathname = `/${name}`;
process.env.DATABASE_URL = url.toString();
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
process.env.SUPERADMIN_PASSWORD = 'Super#Secret2026';

// Route handlers read cookies through next/headers, which only works inside a real Next.js request.
vi.mock('next/headers', async () => {
  const { cookieStore } = await import('./helpers');
  return { cookies: async () => cookieStore, headers: async () => new Headers() };
});

afterAll(async () => {
  const { closeDb } = await import('@/lib/db');
  await closeDb();
  const cleanup = postgres(server, { max: 1, onnotice: () => {} });
  await cleanup.unsafe(`drop database if exists ${name} with (force)`);
  await cleanup.end();
});
