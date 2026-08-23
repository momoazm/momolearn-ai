import fs from 'node:fs/promises';
import path from 'node:path';
import { kv } from '@vercel/kv';

const KEY = 'mbzuai-owner-state-v1';
const FILE = path.join(process.cwd(), 'data', 'mbzuai-state.json');
const MAX_BYTES = 512 * 1024;

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function syncBackend() {
  if (kvConfigured()) return 'kv';
  try {
    if (process.env.VERCEL) return 'none';
    void FILE;
    return 'file';
  } catch {
    return 'none';
  }
}

export async function loadOwnerState() {
  if (kvConfigured()) {
    try {
      const v = await kv.get(KEY);
      if (v) return { state: v, backend: 'kv' };
    } catch {}
  }
  if (!process.env.VERCEL) {
    try {
      const raw = await fs.readFile(FILE, 'utf8');
      return { state: JSON.parse(raw), backend: 'file' };
    } catch {}
  }
  return { state: null, backend: kvConfigured() ? 'kv' : process.env.VERCEL ? 'none' : 'file' };
}

export async function saveOwnerState(state) {
  const raw = JSON.stringify(state);
  if (Buffer.byteLength(raw) > MAX_BYTES) return { ok: false, reason: 'too-large', backend: syncBackend() };
  let backend = 'none';
  if (kvConfigured()) {
    try {
      await kv.set(KEY, state);
      backend = 'kv';
      return { ok: true, backend };
    } catch {}
  }
  if (!process.env.VERCEL) {
    try {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, raw, 'utf8');
      return { ok: true, backend: 'file' };
    } catch {}
  }
  return { ok: false, backend };
}
