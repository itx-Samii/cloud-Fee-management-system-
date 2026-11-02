import { NextResponse } from 'next/server';

export type Body = Record<string, unknown>;

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Parses a JSON object body; anything else (bad JSON, arrays, primitives) gives null. */
export async function readBody(request: Request): Promise<Body | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/** Like toNumber, but keeps "not sent" distinct from zero so partial updates leave fields alone. */
export function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null || value === '' ? undefined : toNumber(value);
}

export function toText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function withoutUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
