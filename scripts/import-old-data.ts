// Copies everything from the old MongoDB database (or the even older data/ folder of JSON files)
// into the Supabase/Postgres database named by DATABASE_URL in .env.local:
//
//   npm run db:import -- --mongo "mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/fee_management"
//   npm run db:import -- --folder "C:\path\to\data"
//
// Add --dry-run to check everything and see the counts without saving. The target must be empty,
// unless --replace is given (which wipes it first). It all goes in one transaction: if anything
// is wrong, nothing is written and the problems are listed. The source is only read, never changed.

import dns from 'node:dns';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '../lib/db';
import {
  BACKUP_COLLECTIONS,
  LEGACY_SCHOOL_ID,
  checkRestoreSection,
  replaceSections,
  toId,
  type CollectionName,
} from '../lib/dbHandler';
import { DEFAULT_FEATURES, DEFAULT_MAX_STUDENTS } from '../lib/license';

type Doc = Record<string, unknown>;
type Source = Record<string, Doc[]>;

const SOURCE_NAMES = [...BACKUP_COLLECTIONS, 'config', 'licenses', 'audit_log'];
const APP_TABLES = ['school_settings', 'licenses', 'counters', 'audit_log', 'promotions', 'reminders', 'parent_logins', ...BACKUP_COLLECTIONS];

function parseArgs(argv: string[]) {
  const args = { mongo: '', folder: '', replace: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mongo') args.mongo = argv[++i] ?? '';
    else if (argv[i] === '--folder') args.folder = argv[++i] ?? '';
    else if (argv[i] === '--replace') args.replace = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown option "${argv[i]}"`);
  }
  if (!args.mongo === !args.folder) throw new Error('Give either --mongo "<connection string>" or --folder "<path to data folder>"');
  return args;
}

async function readMongo(uri: string): Promise<Source> {
  // Some ISP resolvers can't look up Atlas SRV records; Google DNS can.
  if (uri.startsWith('mongodb+srv://')) dns.setServers(['8.8.8.8', '8.8.4.4']);
  const { MongoClient } = await import('mongodb');
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 15000 }).connect();
  try {
    const db = client.db();
    const source: Source = {};
    for (const name of SOURCE_NAMES) {
      source[name] = (await db.collection(name).find({}).toArray()).map(({ _id, ...doc }) => ({ ...doc, _id: String(_id) }));
    }
    return source;
  } finally {
    await client.close();
  }
}

/** The single-school version kept one JSON file per collection; config.json was Brook Field's settings. */
function readFolder(dir: string): Source {
  const read = (name: string): unknown => {
    const file = path.join(dir, `${name}.json`);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  };
  const source: Source = {};
  for (const name of SOURCE_NAMES) {
    const data = read(name);
    source[name] = Array.isArray(data) ? data : [];
  }
  if (source.salaries_history.length === 0) {
    const older = read('salaries');
    if (Array.isArray(older)) source.salaries_history = older;
  }
  const config = read('config');
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    source.config = [{ key: `app_settings_${LEGACY_SCHOOL_ID}`, value: config }];
  }
  return source;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const schoolOf = (doc: Doc) => text(doc.schoolId) ?? LEGACY_SCHOOL_ID;

function plan(source: Source) {
  const problems: string[] = [];
  const warnings: string[] = [];

  // Each school's records.
  const schools = new Map<string, Map<CollectionName, Doc[]>>();
  for (const name of BACKUP_COLLECTIONS) {
    for (const doc of source[name]) {
      const school = schoolOf(doc);
      if (!schools.has(school)) schools.set(school, new Map());
      const sections = schools.get(school)!;
      sections.set(name, [...(sections.get(name) ?? []), doc]);
    }
  }
  for (const [school, sections] of schools) {
    for (const [name, docs] of sections) {
      const problem = checkRestoreSection(name, docs);
      if (problem) problems.push(`${school}: ${problem}`);
    }
    const unlinked = (sections.get('fees') ?? []).filter((f) => f.studentId != null && toId(f.studentId) === null).length;
    if (unlinked) warnings.push(`${school}: ${unlinked} voucher(s) point at a student id that isn't a number; they keep the name but lose the link`);
  }

  // Settings, from config documents keyed app_settings_<schoolId>.
  const settings = new Map<string, Doc>();
  let oldLicense: Doc | undefined;
  for (const doc of source.config) {
    const key = String(doc.key ?? '');
    const value = (doc.value && typeof doc.value === 'object' ? doc.value : {}) as Doc;
    if (key === 'software_license') oldLicense = value;
    else if (key.startsWith('app_settings_')) {
      const schoolId = key.slice('app_settings_'.length);
      settings.set(schoolId, {
        schoolId,
        adminUsername: text(value.adminUsername)?.toLowerCase() ?? null,
        adminPassword: text(value.adminPassword) ?? null,
        schoolName: text(value.schoolName) ?? null,
        superAdminPassword: text(value.superAdminPassword) ?? null,
        dueDays: Number.isInteger(value.dueDays) ? value.dueDays : null,
        lateFine: typeof value.lateFine === 'number' && value.lateFine >= 0 ? value.lateFine : null,
      });
    } else warnings.push(`Skipped config entry "${key}"`);
  }

  // Licenses: the single-school era used ids like client_1, or no schoolId at all.
  const licenses = new Map<string, Doc>();
  for (const doc of source.licenses) {
    const id = text(doc.id);
    const schoolId = id === 'client_1' ? LEGACY_SCHOOL_ID : (text(doc.schoolId) ?? id ?? LEGACY_SCHOOL_ID);
    if (licenses.has(schoolId)) {
      warnings.push(`Skipped a second license record for ${schoolId}`);
      continue;
    }
    licenses.set(schoolId, {
      schoolId,
      clientName: text(doc.clientName) ?? 'School System',
      adminUsername: text(doc.adminUsername)?.toLowerCase() ?? null,
      licenseKey: text(doc.licenseKey) ?? `KEY-${schoolId}`,
      status: doc.status === 'blocked' ? 'blocked' : 'active',
      maxStudents: toId(doc.maxStudents) ?? DEFAULT_MAX_STUDENTS,
      features: { ...DEFAULT_FEATURES, ...(doc.features && typeof doc.features === 'object' ? doc.features : {}) },
      createdAt: text(doc.createdAt) ?? new Date().toISOString(),
      lastSync: text(doc.lastSync) ?? new Date().toISOString(),
    });
  }
  if (oldLicense?.status === 'blocked') {
    const brookField = licenses.get(LEGACY_SCHOOL_ID);
    if (brookField) brookField.status = 'blocked';
    else warnings.push('The old single-school license said "blocked", but Brook Field has no license record; block it from the Super Admin page if needed');
  }

  // Usernames and license keys must be unique across schools.
  const seen = new Map<string, string>();
  const claim = (name: unknown, owner: string) => {
    const key = String(name ?? '').toLowerCase();
    if (!key) return;
    if (seen.has(key) && seen.get(key) !== owner) problems.push(`Username "${key}" is used by both ${seen.get(key)} and ${owner}; rename one first`);
    seen.set(key, owner);
  };
  for (const s of settings.values()) claim(s.adminUsername, `the principal of ${s.schoolId}`);
  for (const u of source.users) claim(u.username, `a user of ${schoolOf(u)}`);
  const keys = new Map<string, string>();
  for (const l of licenses.values()) {
    const key = String(l.licenseKey);
    if (keys.has(key)) problems.push(`License key "${key}" is used by both ${keys.get(key)} and ${l.schoolId}`);
    keys.set(key, String(l.schoolId));
  }

  const auditLog = source.audit_log.map((e) => ({
    schoolId: schoolOf(e),
    at: text(e.at) && !isNaN(Date.parse(String(e.at))) ? String(e.at) : new Date().toISOString(),
    username: text(e.username) ?? '',
    displayName: text(e.displayName) ?? null,
    role: text(e.role) ?? '',
    action: text(e.action) ?? '',
    summary: text(e.summary) ?? '',
  }));

  return { schools, settings: [...settings.values()], licenses: [...licenses.values()], auditLog, problems, warnings };
}

class DryRun extends Error {}

async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Put your Supabase connection string in .env.local first.');

  console.log(args.mongo ? 'Reading the MongoDB database...' : `Reading ${args.folder}...`);
  const source = args.mongo ? await readMongo(args.mongo) : readFolder(path.resolve(args.folder));
  const { schools, settings, licenses, auditLog, problems, warnings } = plan(source);

  for (const w of warnings) console.log(`  note: ${w}`);
  if (problems.length) {
    console.error('\nNothing was imported. Fix these in the old data first:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log('Writing to the new database...');
  const db = await getDb();
  try {
    await db.begin(async (tx) => {
      const counts = await tx`
        select (select count(*) from students) + (select count(*) from fees) + (select count(*) from users)
             + (select count(*) from school_settings) + (select count(*) from licenses) as total`;
      if (Number(counts[0].total) > 0) {
        if (!args.replace) throw new Error('The new database already has data. Run again with --replace to wipe it and import afresh.');
        await tx`truncate table ${tx(APP_TABLES)}`;
      }

      for (const [schoolId, sections] of schools) await replaceSections(tx, schoolId, [...sections]);
      if (settings.length) {
        await tx`insert into school_settings ${tx(settings as Record<string, string>[], 'schoolId', 'adminUsername', 'adminPassword', 'schoolName', 'superAdminPassword', 'dueDays', 'lateFine')}`;
      }
      for (const l of licenses) {
        await tx`
          insert into licenses (school_id, client_name, admin_username, license_key, status, max_students, features, created_at, last_sync)
          values (${String(l.schoolId)}, ${String(l.clientName)}, ${l.adminUsername as string | null}, ${String(l.licenseKey)}, ${String(l.status)},
                  ${l.maxStudents as number}, ${tx.json(l.features as Record<string, boolean>)}, ${String(l.createdAt)}, ${String(l.lastSync)})`;
      }
      for (let i = 0; i < auditLog.length; i += 1000) {
        await tx`insert into audit_log ${tx(auditLog.slice(i, i + 1000) as Record<string, string>[], 'schoolId', 'at', 'username', 'displayName', 'role', 'action', 'summary')}`;
      }

      console.log('');
      for (const [schoolId, sections] of schools) {
        console.log(`  ${schoolId}: ${[...sections].map(([name, docs]) => `${docs.length} ${name}`).join(', ')}`);
      }
      console.log(`  ${settings.length} school setting(s), ${licenses.length} license(s), ${auditLog.length} activity log line(s)`);
      if (args.dryRun) throw new DryRun();
    });
    console.log('\nDone. Everything above is now in the new database.');
  } catch (err) {
    if (err instanceof DryRun) console.log('\nDry run: all of the above checked out, but nothing was saved. Run again without --dry-run to import.');
    else throw err;
  }
}

main()
  .catch((err) => {
    console.error(`\nImport failed, nothing was saved: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
