import { describe, expect, it } from 'vitest';
import { localDatabaseOptions } from '../../scripts/local-db';

describe('local database launcher', () => {
  it('uses password authentication, loopback only, and persistent storage', () => {
    const options = localDatabaseOptions('postgres://postgres:local%40secret@127.0.0.1:54329/postgres');
    expect(options).toMatchObject({ password: 'local@secret', persistent: true, authMethod: 'scram-sha-256' });
    expect(options.postgresFlags).toEqual(['-h', '127.0.0.1']);
  });

  it.each([
    '',
    'postgres://postgres:secret@cloud.example:54329/postgres',
    'postgres://postgres:secret@127.0.0.1:5432/postgres',
    'postgres://postgres:secret@127.0.0.1:54329/school',
    'postgres://postgres@127.0.0.1:54329/postgres',
    'postgres://postgres:secret@127.0.0.1:54329/postgres?host=cloud.example',
  ])('rejects missing or unrelated database configuration: %s', (url) => {
    expect(() => localDatabaseOptions(url)).toThrow();
  });
});
