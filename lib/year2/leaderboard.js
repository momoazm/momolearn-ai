import { put, head } from '@vercel/blob';

const BLOB_PATHNAME = 'year2/leaderboard-v1.json';
const MAX_ENTRIES = 500;
const PRUNE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const WRITE_COOLDOWN_MS = 1500;

const ALLOWED_ORIGINS = new Set([
  'https://momoazm.github.io',
  'https://momolearn.space',
  'http://localhost:3200',
  'http://localhost:3000',
  'http://127.0.0.1:3200',
]);

const LEAGUE_NAMES = new Set([
  'Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby', 'Emerald', 'Amethyst', 'Diamond',
]);

const lastWriteAt = new Map();

// Blob reads lag writes (eventual consistency), so keep a warm in-memory copy
// per server instance. Union-merge by id (newest updatedAt wins) heals races
// between overlapping reads and concurrent writers.
let cache = [];

function newerWinner(a, b) {
  return (Number(b?.updatedAt) || 0) > (Number(a?.updatedAt) || 0) ? b : a;
}

function unionById(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || typeof e.id !== 'string') continue;
      byId.set(e.id, newerWinner(byId.get(e.id), e));
    }
  }
  return [...byId.values()];
}

function cors(res, origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : null;
  res.setHeader('Access-Control-Allow-Origin', allow ?? '');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim();
  const name = String(raw.name ?? '').trim().slice(0, 24);
  const xp = Number(raw.xp);
  const league = String(raw.league ?? '');
  const mascot = String(raw.mascot ?? '').slice(0, 24);
  const week = String(raw.week ?? '');
  if (!id || id.length > 64 || !/^[\w:-]+$/.test(id)) return null;
  if (!name) return null;
  if (!Number.isFinite(xp) || xp < 0 || xp > 100000) return null;
  if (!LEAGUE_NAMES.has(league)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  return { id, name, xp: Math.round(xp), league, mascot, week };
}

async function loadEntries() {
  try {
    const meta = await head(BLOB_PATHNAME);
    if (meta) {
      const res = await fetch(meta.downloadUrl ?? meta.url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        cache = unionById([cache, data]);
        return prune(cache);
      }
    }
  } catch (err) {
    const notFound =
      err?.name === 'BlobNotFoundError' || /does not exist/i.test(String(err?.message ?? ''));
    if (!notFound) {
      console.error('[year2-leaderboard] load failed:', err?.name, String(err?.message ?? err).slice(0, 200));
    }
  }
  return prune(cache);
}

function prune(entries) {
  const now = Date.now();
  return entries
    .filter((e) => now - (Number(e.updatedAt) || 0) < PRUNE_MS)
    .sort((a, b) => (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0))
    .slice(-MAX_ENTRIES);
}

async function saveEntries(entries) {
  cache = entries;
  await put(BLOB_PATHNAME, JSON.stringify(entries), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

export function registerYear2LeaderboardRoutes(app) {
  app.options('/api/year2/leaderboard', (req, res) => {
    cors(res, req.headers.origin);
    res.status(204).end();
  });

  app.get('/api/year2/leaderboard', async (req, res) => {
    cors(res, req.headers.origin);
    try {
      const entries = await loadEntries();
      res.json({ ok: true, entries });
    } catch {
      res.json({ ok: true, entries: [], backend: 'unavailable' });
    }
  });

  app.put('/api/year2/leaderboard', async (req, res) => {
    cors(res, req.headers.origin);
    const entry = sanitizeEntry(req.body?.entry);
    if (!entry) {
      return res.status(400).json({ ok: false, error: 'Invalid leaderboard entry.' });
    }
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'local';
    const now = Date.now();
    const last = lastWriteAt.get(ip) ?? 0;
    if (now - last < WRITE_COOLDOWN_MS) {
      return res.status(429).json({ ok: false, error: 'Slow down a little.' });
    }
    lastWriteAt.set(ip, now);
    try {
      const current = await loadEntries();
      const merged = unionById([current, [{ ...entry, updatedAt: now }]]);
      const saved = prune(merged);
      await saveEntries(saved);
      res.json({ ok: true, entries: saved });
    } catch (err) {
      console.error('[year2-leaderboard] save failed:', err?.name, String(err?.message ?? err).slice(0, 200));
      res.status(503).json({ ok: false, error: 'Leaderboard storage unavailable, try again later.' });
    }
  });
}
