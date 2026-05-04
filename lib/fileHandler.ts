import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');

// --- Cache with TTL (30 seconds) ---
const CACHE_TTL_MS = 30_000;
interface CacheEntry {
  data: any;
  timestamp: number;
}
let cache: Record<string, CacheEntry> = {};

function getCached(key: string): any | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete cache[key];
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any) {
  cache[key] = { data, timestamp: Date.now() };
}

// --- File Locking (per-file mutex) ---
const locks: Record<string, Promise<void>> = {};

async function withFileLock<T>(fileName: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this file, then acquire
  const existing = locks[fileName] || Promise.resolve();
  let releaseLock: () => void;
  locks[fileName] = new Promise<void>((resolve) => { releaseLock = resolve; });

  try {
    await existing;
    return await fn();
  } finally {
    releaseLock!();
    // Clean up if nothing else is waiting
    if (locks[fileName] === locks[fileName]) {
      delete locks[fileName];
    }
  }
}

// --- Password Hashing (Node.js crypto scrypt) ---
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  // Support legacy plaintext passwords (no colon = not hashed)
  if (!stored.includes(':')) {
    return password === stored;
  }
  const [salt, storedHash] = stored.split(':');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// --- File Utilities ---
async function ensureFileExists(filePath: string) {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.access(filePath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(filePath, '[]', 'utf8');
    } else {
      throw err;
    }
  }
}

export async function readData<T>(fileName: string): Promise<T[]> {
  // Return cached data if available and not stale
  const cached = getCached(fileName);
  if (cached) {
    return cached;
  }

  const filePath = path.join(DATA_DIR, fileName);
  await ensureFileExists(filePath);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data || '[]');
    const result = Array.isArray(parsed) ? parsed : [parsed];

    // Store in cache with timestamp
    setCache(fileName, result);
    return result;
  } catch (err) {
    console.error(`Error reading ${fileName}:`, err);
    return [];
  }
}

export async function readConfig(): Promise<any> {
  // Always read from disk for security settings to avoid cache issues
  const filePath = path.join(DATA_DIR, 'config.json');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return parsed;
  } catch (err) {
    console.error(`CRITICAL: Could not read config.json at ${filePath}`, err);
    // If file doesn't exist, create with hashed default password
    const defaultConfig = { adminPassword: hashPassword('admin123') };
    try {
      await fs.writeFile(filePath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      return defaultConfig;
    } catch (writeErr) {
      console.error(`CRITICAL: Could not create default config.json`, writeErr);
      return defaultConfig;
    }
  }
}

export async function writeConfig(config: any): Promise<void> {
  const filePath = path.join(DATA_DIR, 'config.json');
  try {
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
    setCache('config.json', config);
  } catch (err) {
    console.error(`Error writing config:`, err);
    throw new Error(`Failed to save configuration.`);
  }
}

export async function writeData<T>(fileName: string, data: T[]): Promise<void> {
  return withFileLock(fileName, async () => {
    const filePath = path.join(DATA_DIR, fileName);
    await ensureFileExists(filePath);
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      // Update cache
      setCache(fileName, data);
    } catch (err) {
      console.error(`Error writing to ${fileName}:`, err);
      throw new Error(`Failed to save data. Please check file permissions.`);
    }
  });
}

export async function generateId(fileName: string): Promise<number> {
  const data = await readData<{ id: number }>(fileName);
  if (data.length === 0) return 1;
  const maxId = Math.max(...data.map(item => item.id || 0));
  return maxId + 1;
}

export function clearCache() {
  cache = {};
}
