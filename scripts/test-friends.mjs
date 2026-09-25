// Hermetic route tests for /api/year2/friends/* (PLAN Phase 17, step 81).
// Run: node scripts/test-friends.mjs
// Uses the __testHooks seam in lib/year2/friends.js (in-memory Blob fake),
// so it needs no BLOB_READ_WRITE_TOKEN and never touches the network.

import { registerYear2FriendsRoutes, __testHooks } from '../lib/year2/friends.js';

const fails = [];
let n = 0;
const check = (id, ok) => {
  n++;
  if (!ok) fails.push(id);
};

// --- in-memory Blob fake ----------------------------------------------------
const files = new Map();
const fakeStorage = {
  head: async (path) => {
    if (!files.has(path)) {
      const e = new Error('does not exist');
      e.name = 'BlobNotFoundError';
      throw e;
    }
    return { url: `memory://${path}` };
  },
  put: async (path, data) => {
    files.set(path, data);
  },
  read: async (path) => (files.has(path) ? JSON.parse(files.get(path)) : null),
};

// --- fake express app -------------------------------------------------------
const routes = new Map();
const app = {
  get: (p, h) => routes.set(`GET ${p}`, h),
  post: (p, h) => routes.set(`POST ${p}`, h),
  options: (p, h) => routes.set(`OPTIONS ${p}`, h),
};
registerYear2FriendsRoutes(app);
__testHooks.setStorage(fakeStorage);

let ipSeq = 0;
function makeRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function call(method, path, { body, query, ip, keepRateLimits } = {}) {
  // Real cooldowns are time-based (1000ms/ip, 500ms/id) but tests run in
  // microseconds — clear them unless the test is explicitly probing them.
  if (!keepRateLimits) __testHooks.resetRateLimits();
  const handler = routes.get(`${method} ${path}`);
  if (!handler) throw new Error(`no route ${method} ${path}`);
  const req = {
    headers: { 'x-forwarded-for': ip ?? `t${++ipSeq}`, origin: 'https://momoazm.github.io' },
    body,
    query,
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

function fresh() {
  files.clear();
  __testHooks.resetRateLimits();
}

// --- tests ------------------------------------------------------------------

async function main() {
  // 1. Mint a code: 6 chars from the kid-safe alphabet, stable across calls.
  fresh();
  let r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'player-a', name: 'Amina' } });
  check('code-200', r.statusCode === 200 && r.body?.ok === true);
  const codeA = r.body?.code ?? '';
  check('code-6-chars', /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(codeA));
  check('code-cors', r.headers['Access-Control-Allow-Origin'] === 'https://momoazm.github.io');
  r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'player-a', name: 'Amina' } });
  check('code-stable', r.body?.code === codeA && r.body?.regenerated === false);

  // 2. Invalid payloads are rejected.
  r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'bad id!', name: 'X' } });
  check('code-bad-id-400', r.statusCode === 400 && r.body?.ok === false);
  r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'player-a', name: '' } });
  check('code-bad-name-400', r.statusCode === 400);
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'x', name: 'X', code: '??' } });
  check('join-bad-code-400', r.statusCode === 400 && /check the letters/.test(r.body?.error ?? ''));

  // 3. B joins A via the code (case/dash-insensitive input).
  r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'player-b', name: 'Bilal' } });
  const codeB = r.body?.code;
  const messy = `${codeA.slice(0, 3)}-${codeA.slice(3)}`.toLowerCase();
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-b', name: 'Bilal', code: messy } });
  check('join-ok', r.statusCode === 200 && r.body?.ok === true);
  check('join-friendName', r.body?.friendName === 'Amina');
  check('join-firstJoin', r.body?.firstJoin === true);

  // 4. Re-joining the same friend is idempotent, never a second reward.
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-b', name: 'Bilal', code: codeA } });
  check('join-already', r.statusCode === 200 && r.body?.already === true && r.body?.firstJoin === false);

  // 5. Both sides see each other (id + display name only).
  r = await call('GET', '/api/year2/friends/list', { query: { playerId: 'player-b' } });
  check('list-b-has-a', r.body?.ok === true && r.body.friends?.length === 1 && r.body.friends[0].name === 'Amina');
  r = await call('GET', '/api/year2/friends/list', { query: { playerId: 'player-a' } });
  check('list-a-has-b', r.body?.friends?.[0]?.name === 'Bilal');

  // 6. Own code and unknown codes are refused with friendly copy.
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-a', name: 'Amina', code: codeA } });
  check('join-own-400', r.statusCode === 400 && /own code/.test(r.body?.error ?? ''));
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-c', name: 'Chen', code: 'ZZZZZZ' } });
  check('join-unknown-404', r.statusCode === 404 && /check the letters/.test(r.body?.error ?? ''));

  // 7. Regenerating A's code revokes the OLD code for NEW joins, but the
  //    existing A-B friendship persists (no-deletion rule).
  r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'player-a', name: 'Amina', regenerate: true } });
  const codeA2 = r.body?.code;
  check('regen-new-code', r.body?.ok === true && r.body?.regenerated === true && codeA2 !== codeA);
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-c', name: 'Chen', code: codeA } });
  check('old-code-revoked', r.statusCode === 404);
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-c', name: 'Chen', code: codeA2 } });
  check('new-code-works', r.statusCode === 200 && r.body?.ok === true && r.body?.friendName === 'Amina');
  r = await call('GET', '/api/year2/friends/list', { query: { playerId: 'player-b' } });
  check('old-friendship-persists', r.body?.friends?.some((f) => f.name === 'Amina') === true);

  // 8. firstJoin is per-JOINER (their own first friendship = the one-time
  //    +30 gems + achievement); a second new friendship never re-triggers it.
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-d', name: 'Dana', code: codeA2 } });
  check('first-friend-is-firstJoin', r.statusCode === 200 && r.body?.firstJoin === true);
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-d', name: 'Dana', code: codeB } });
  check('second-joiner-not-first', r.statusCode === 200 && r.body?.firstJoin === false);
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'player-b', name: 'Bilal', code: codeA2 } });
  check('repeat-joiner-not-first', r.statusCode === 200 && r.body?.firstJoin === false);

  // 9. 20-friend cap.
  fresh();
  const hubMint = await call('POST', '/api/year2/friends/code', { body: { playerId: 'hub', name: 'Hub' } });
  const codeHub = hubMint.body?.code;
  check('hub-code', /^[0-9A-Z]{6}$/.test(codeHub ?? ''));
  let capBlocked = false;
  let joined = 0;
  for (let i = 0; i < 21; i++) {
    const pid = `filler-${i}`;
    await call('POST', '/api/year2/friends/code', { body: { playerId: pid, name: `Kid${i}` } });
    const j = await call('POST', '/api/year2/friends/join', { body: { playerId: pid, name: `Kid${i}`, code: codeHub } });
    if (j.statusCode === 409) {
      capBlocked = true;
      check('cap-409', /full/.test(j.body?.error ?? ''));
      break;
    }
    if (j.statusCode !== 200) {
      capBlocked = true;
      check('cap-unexpected', false);
      break;
    }
    joined++;
  }
  check('cap-allows-20', joined === 20);
  check('cap-blocks-21st', capBlocked);
  r = await call('GET', '/api/year2/friends/list', { query: { playerId: 'hub' } });
  check('cap-list-capped', r.body?.friends?.length === 20);

  // 10. Per-IP write cooldown returns 429 (cooldowns kept live for this probe).
  fresh();
  await call('POST', '/api/year2/friends/code', { body: { playerId: 'p1', name: 'One' }, ip: 'same-ip' });
  r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'p2', name: 'Two' }, ip: 'same-ip', keepRateLimits: true });
  check('ip-cooldown-429', r.statusCode === 429);

  // 11. Oversized body is refused.
  fresh();
  r = await call('POST', '/api/year2/friends/code', {
    body: { playerId: 'p1', name: 'One', junk: 'x'.repeat(9000) },
  });
  check('body-cap-413', r.statusCode === 413);

  // 12. Corrupt blob contents can't poison the store (sanitize on read).
  fresh();
  files.set('year2/friends-v1.json', JSON.stringify({ codes: 42, players: 'nope', edges: 'bad', revoked: [9] }));
  r = await call('POST', '/api/year2/friends/code', { body: { playerId: 'p1', name: 'One' } });
  check('corrupt-read-recover', r.statusCode === 200 && /^[0-9A-Z]{6}$/.test(r.body?.code ?? ''));
  r = await call('GET', '/api/year2/friends/list', { query: { playerId: 'p1' } });
  check('corrupt-read-list', r.statusCode === 200 && Array.isArray(r.body?.friends));

  // 13. Validation happens before the rate limiter consumes the slot
  //     (both calls keep cooldowns live: if rate-limiting ran first, the
  //     second would be 429 instead of the friendly 400).
  fresh();
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'x', name: 'X', code: '!!' }, ip: 'shared', keepRateLimits: true });
  check('bad-input-no-429', r.statusCode === 400);
  r = await call('POST', '/api/year2/friends/join', { body: { playerId: 'y', name: 'Y', code: '!!' }, ip: 'shared', keepRateLimits: true });
  check('bad-input-still-not-429', r.statusCode === 400);

  // 14. List endpoint is read-only: no cooldown, empty result is ok.
  fresh();
  r = await call('GET', '/api/year2/friends/list', { query: { playerId: 'nobody' } });
  check('list-empty-ok', r.statusCode === 200 && r.body?.ok === true && r.body.friends?.length === 0);
  r = await call('GET', '/api/year2/friends/list', { query: {} });
  check('list-missing-id-400', r.statusCode === 400);

  if (fails.length) {
    console.error(`FAILED ${fails.length}/${n}:`, fails.join(', '));
    process.exit(1);
  }
  console.log(`friends: all ${n} checks passed`);
}

main().catch((err) => {
  console.error('friends: threw', err);
  process.exit(1);
});
