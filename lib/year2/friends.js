import { put, head } from '@vercel/blob';

// Test seam: swap the Blob backend for an in-memory fake and clear the
// per-IP/per-id cooldowns so scripts/test-friends.mjs can drive full route
// flows hermetically (no BLOB_READ_WRITE_TOKEN needed locally).
async function defaultRead(path) {
  const meta = await head(path);
  if (!meta) return null;
  const res = await fetch(meta.downloadUrl ?? meta.url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}
let storage = { head, put, read: defaultRead };
export const __testHooks = {
  setStorage(s) {
    storage = s ?? { head, put, read: defaultRead };
  },
  resetRateLimits() {
    lastWriteIp.clear();
    lastWriteId.clear();
    cache = null;
  },
};


// Friend network + referral codes for momomath-year2 (PLAN Phase 17).
//
// Design goals (PLAN step 79-80):
//   - Weekly XP stays on the existing leaderboard blob — friends compete on
//     numbers that are ALREADY synced, so this module only stores edges
//     (id + display name) and referral codes. Zero new score plumbing.
//   - No PII: a referral code is a one-way FNV-1a hash of the player id
//     (Crockford base32, 6 chars), never an email or token.
//   - Unauthenticated like /api/year2/leaderboard (kid game, no accounts to
//     steal); abuse is bounded by payload whitelists, per-IP + per-id cooldowns
//     and a 20-friend cap per player.
//
// Endpoints (registered on the shared momolearn-ai express app):
//   POST /api/year2/friends/code  { playerId, name, regenerate? }
//        -> { ok, code }          stable 6-char code; regenerate=true revokes
//                                  the old code for NEW joins (existing
//                                  friendships persist — no deletion).
//   POST /api/year2/friends/join  { playerId, name, code }
//        -> { ok, friendName, friendId, firstJoin }
//   GET  /api/year2/friends/list?playerId=...
//        -> { ok, friends: [{ id, name }] }  (client joins weekly XP in from
//                                  the existing leaderboard GET)

const BLOB_PATHNAME = 'year2/friends-v1.json';
const WRITE_COOLDOWN_MS = 1000; // per-IP
const ID_COOLDOWN_MS = 500; // per-playerId
const MAX_FRIENDS = 20;
const MAX_BODY_BYTES = 8_000;
const MAX_NAME = 24;
const MAX_ID = 64;
const MAX_REVOKED = 200;

const ALLOWED_ORIGINS = new Set([
  'https://momoazm.github.io',
  'https://momolearn.space',
  'http://localhost:3200',
  'http://localhost:3000',
  'http://127.0.0.1:3200',
]);

// Crockford base32: no I, L, O, U — kids reading codes aloud won't mix them up.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

const lastWriteIp = new Map();
const lastWriteId = new Map();

// Blob reads lag writes (eventual consistency) — warm cache per instance,
// same pattern as leaderboard.js/cloudsave.js.
let cache = null;

function cors(res, origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : null;
  res.setHeader('Access-Control-Allow-Origin', allow ?? '');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function emptyDoc() {
  return { version: 1, codes: {}, players: {}, edges: [], revoked: [] };
}

function sanitizePlayerId(raw) {
  const id = String(raw ?? '').trim();
  if (!id || id.length > MAX_ID || !/^[\w:-]+$/.test(id)) return '';
  return id;
}

function sanitizeName(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_NAME);
  return name;
}

/** Accepts user input with dashes/spaces/lowercase, returns canonical 6 chars. */
function normalizeCode(raw) {
  const code = String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
  return CODE_RE.test(code) ? code : '';
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** One-way 6-char code for playerId+salt. salt 0 = the stable default. */
function codeFor(playerId, salt) {
  const h = (fnv1a(playerId) ^ fnv1a(`${playerId}#${salt}`)) >>> 0;
  let out = '';
  let v = h;
  for (let i = 0; i < 6; i++) {
    out = ALPHABET[v % 32] + out;
    v = Math.floor(v / 32);
  }
  return out;
}

/**
 * Deterministic code that no one else owns. salt 0 first so the default code
 * is stable across devices; collisions bump the salt (stored server-side).
 */
function mintCode(doc, playerId, minSalt = 0, exclude = new Set()) {
  for (let salt = minSalt; salt < minSalt + 64; salt++) {
    const code = codeFor(playerId, salt);
    if (exclude.has(code) || doc.revoked.includes(code)) continue;
    const owner = doc.codes[code];
    if (!owner || owner === playerId) return { code, salt };
  }
  return null; // pathological — caller falls back to an error
}

function edgeKey(a, b) {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function edgesOf(doc, playerId) {
  return doc.edges.filter((e) => e.a === playerId || e.b === playerId);
}

function otherOf(edge, playerId) {
  return edge.a === playerId ? edge.b : edge.a;
}

/** Heal Blob read races: union edges (friendships must never vanish), union
 *  players/codes with newest-wins, drop any revoked code. */
function mergeDocs(a, b) {
  if (!a) return b;
  if (!b) return a;
  const edgesByKey = new Map();
  for (const e of [...a.edges, ...b.edges]) {
    if (!e || typeof e.a !== 'string' || typeof e.b !== 'string') continue;
    const key = edgeKey(e.a, e.b);
    const prev = edgesByKey.get(key);
    if (!prev || (Number(e.since) || 0) < (Number(prev.since) || 0)) {
      edgesByKey.set(key, prev ?? e);
    } else {
      edgesByKey.set(key, e);
    }
  }
  const players = { ...a.players };
  for (const [id, p] of Object.entries(b.players ?? {})) {
    if (!p || typeof p !== 'object') continue;
    const prev = players[id];
    if (!prev || (Number(p.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) players[id] = p;
  }
  const revoked = [...new Set([...(a.revoked ?? []), ...(b.revoked ?? [])])].slice(-MAX_REVOKED);
  const codes = {};
  for (const [code, id] of Object.entries({ ...a.codes, ...b.codes })) {
    if (revoked.includes(code)) continue;
    if (typeof id !== 'string') continue;
    // Conflict (same code, two players): the player who last touched their
    // profile owns it; the loser re-mints with a bumped salt.
    const owner = players[id];
    const rivalId = codes[code];
    if (rivalId && rivalId !== id) {
      const rival = players[rivalId];
      if ((Number(rival?.updatedAt) || 0) > (Number(owner?.updatedAt) || 0)) continue;
    }
    codes[code] = id;
  }
  return { version: 1, codes, players, edges: [...edgesByKey.values()], revoked };
}

async function loadDoc() {
  try {
    const data = await storage.read(BLOB_PATHNAME);
    if (data) {
      cache = mergeDocs(cache, sanitizeDoc(data));
      return cache;
    }
  } catch (err) {
    const notFound =
      err?.name === 'BlobNotFoundError' || /does not exist/i.test(String(err?.message ?? ''));
    if (!notFound) {
      console.error('[year2-friends] load failed:', err?.name, String(err?.message ?? err).slice(0, 200));
    }
  }
  return cache ?? emptyDoc();
}

async function saveDoc(doc) {
  cache = doc;
  await storage.put(BLOB_PATHNAME, JSON.stringify(doc), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

/** Shape-check whatever came back from Blob so corrupt data can't poison us. */
function sanitizeDoc(raw) {
  if (!raw || typeof raw !== 'object') return emptyDoc();
  const doc = emptyDoc();
  const codes = raw.codes && typeof raw.codes === 'object' ? raw.codes : {};
  for (const [code, id] of Object.entries(codes)) {
    if (CODE_RE.test(code) && sanitizePlayerId(id)) doc.codes[code] = id;
  }
  const players = raw.players && typeof raw.players === 'object' ? raw.players : {};
  for (const [id, p] of Object.entries(players)) {
    const pid = sanitizePlayerId(id);
    if (!pid || !p || typeof p !== 'object') continue;
    const name = sanitizeName(p.name);
    if (!name) continue;
    doc.players[pid] = {
      name,
      code: p.code && CODE_RE.test(String(p.code)) ? String(p.code) : null,
      salt: Number.isInteger(p.salt) ? p.salt : 0,
      updatedAt: Number(p.updatedAt) || 0,
    };
  }
  if (Array.isArray(raw.edges)) {
    for (const e of raw.edges.slice(0, 1000)) {
      const a = sanitizePlayerId(e?.a);
      const b = sanitizePlayerId(e?.b);
      if (!a || !b || a === b) continue;
      doc.edges.push({ a, b, since: Number(e.since) || 0 });
    }
  }
  if (Array.isArray(raw.revoked)) {
    doc.revoked = raw.revoked.filter((c) => CODE_RE.test(String(c))).slice(-MAX_REVOKED);
  }
  return doc;
}

function rateLimited(req, playerId) {
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'local';
  const now = Date.now();
  if (now - (lastWriteIp.get(ip) ?? 0) < WRITE_COOLDOWN_MS) return 'Slow down a little.';
  if (now - (lastWriteId.get(playerId) ?? 0) < ID_COOLDOWN_MS) return 'Slow down a little.';
  lastWriteIp.set(ip, now);
  lastWriteId.set(playerId, now);
  return '';
}

export function registerYear2FriendsRoutes(app) {
  app.options('/api/year2/friends/code', (req, res) => {
    cors(res, req.headers.origin);
    res.status(204).end();
  });
  app.options('/api/year2/friends/join', (req, res) => {
    cors(res, req.headers.origin);
    res.status(204).end();
  });
  app.options('/api/year2/friends/list', (req, res) => {
    cors(res, req.headers.origin);
    res.status(204).end();
  });

  // --- get (or regenerate) my referral code ---------------------------------
  app.post('/api/year2/friends/code', async (req, res) => {
    cors(res, req.headers.origin);
    if (JSON.stringify(req.body ?? {}).length > MAX_BODY_BYTES) {
      return res.status(413).json({ ok: false, error: 'Request too large.' });
    }
    const playerId = sanitizePlayerId(req.body?.playerId);
    const name = sanitizeName(req.body?.name);
    const regenerate = req.body?.regenerate === true;
    if (!playerId || !name) {
      return res.status(400).json({ ok: false, error: 'Invalid player.' });
    }
    const wait = rateLimited(req, playerId);
    if (wait) return res.status(429).json({ ok: false, error: wait });
    try {
      const doc = await loadDoc();
      const existing = doc.players[playerId];
      const currentCode = existing?.code && doc.codes[existing.code] === playerId ? existing.code : null;
      if (currentCode && !regenerate) {
        if (existing.name !== name) {
          doc.players[playerId] = { ...existing, name, updatedAt: Date.now() };
          await saveDoc(doc);
        }
        return res.json({ ok: true, code: currentCode, regenerated: false });
      }
      const minted = mintCode(
        doc,
        playerId,
        regenerate ? (existing?.salt ?? -1) + 1 : 0,
        regenerate && currentCode ? new Set([currentCode]) : new Set(),
      );
      if (!minted) {
        return res.status(503).json({ ok: false, error: 'Could not mint a code, try again.' });
      }
      if (currentCode) {
        // Revoking only blocks NEW joins — stored edges keep both players as
        // friends forever (no-deletion rule).
        delete doc.codes[currentCode];
        doc.revoked = [...new Set([...doc.revoked, currentCode])].slice(-MAX_REVOKED);
      }
      doc.codes[minted.code] = playerId;
      doc.players[playerId] = {
        name,
        code: minted.code,
        salt: minted.salt,
        updatedAt: Date.now(),
      };
      await saveDoc(doc);
      return res.json({ ok: true, code: minted.code, regenerated: regenerate && !!currentCode });
    } catch (err) {
      console.error('[year2-friends] code failed:', err?.name, String(err?.message ?? err).slice(0, 200));
      return res.status(503).json({ ok: false, error: 'Friends service unavailable, try again later.' });
    }
  });

  // --- join a friend by their code -----------------------------------------
  app.post('/api/year2/friends/join', async (req, res) => {
    cors(res, req.headers.origin);
    if (JSON.stringify(req.body ?? {}).length > MAX_BODY_BYTES) {
      return res.status(413).json({ ok: false, error: 'Request too large.' });
    }
    const playerId = sanitizePlayerId(req.body?.playerId);
    const name = sanitizeName(req.body?.name);
    const code = normalizeCode(req.body?.code);
    if (!playerId || !name || !code) {
      return res.status(400).json({ ok: false, error: "That code doesn't match — check the letters!" });
    }
    const wait = rateLimited(req, playerId);
    if (wait) return res.status(429).json({ ok: false, error: wait });
    try {
      const doc = await loadDoc();
      const targetId = doc.codes[code];
      if (!targetId) {
        return res.status(404).json({ ok: false, error: "That code doesn't match — check the letters!" });
      }
      if (targetId === playerId) {
        return res.status(400).json({ ok: false, error: "That's your own code — ask a friend for theirs!" });
      }
      const target = doc.players[targetId];
      if (!target) {
        return res.status(404).json({ ok: false, error: "That code doesn't match — check the letters!" });
      }
      const mine = edgesOf(doc, playerId);
      const key = edgeKey(playerId, targetId);
      if (doc.edges.some((e) => edgeKey(e.a, e.b) === key)) {
        return res.json({ ok: true, friendName: target.name, friendId: targetId, firstJoin: false, already: true });
      }
      if (mine.length >= MAX_FRIENDS) {
        return res.status(409).json({ ok: false, error: `Friend list is full (max ${MAX_FRIENDS}).` });
      }
      if (edgesOf(doc, targetId).length >= MAX_FRIENDS) {
        return res.status(409).json({ ok: false, error: 'That friend already has a full friend list.' });
      }
      const firstJoin = mine.length === 0;
      doc.edges.push({ a: playerId <= targetId ? playerId : targetId, b: playerId <= targetId ? targetId : playerId, since: Date.now() });
      const mineProfile = doc.players[playerId];
      doc.players[playerId] = { ...mineProfile, name, updatedAt: Date.now() };
      await saveDoc(doc);
      return res.json({ ok: true, friendName: target.name, friendId: targetId, firstJoin });
    } catch (err) {
      console.error('[year2-friends] join failed:', err?.name, String(err?.message ?? err).slice(0, 200));
      return res.status(503).json({ ok: false, error: 'Friends service unavailable, try again later.' });
    }
  });

  // --- my friends (id + display name only; XP comes from the leaderboard) ---
  app.get('/api/year2/friends/list', async (req, res) => {
    cors(res, req.headers.origin);
    const playerId = sanitizePlayerId(req.query?.playerId);
    if (!playerId) {
      return res.status(400).json({ ok: false, error: 'Invalid player.' });
    }
    try {
      const doc = await loadDoc();
      const friends = edgesOf(doc, playerId)
        .map((e) => {
          const id = otherOf(e, playerId);
          return { id, name: doc.players[id]?.name ?? 'Champion' };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.json({ ok: true, friends });
    } catch (err) {
      console.error('[year2-friends] list failed:', err?.name, String(err?.message ?? err).slice(0, 200));
      return res.status(503).json({ ok: false, error: 'Friends service unavailable, try again later.' });
    }
  });
}
