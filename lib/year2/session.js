import { createHmac, timingSafeEqual } from 'node:crypto';

// First-party session for momomath-year2 (GitHub Pages static app).
//
// The momolearn.space model (CS-site api/_auth.py + gate.py): the browser
// signs in with Google ONCE, the server verifies that Google ID token and
// mints OUR OWN HMAC-SHA256 session (90 days). Every later sync carries the
// session instead of the raw Google credential, so:
//   - Google is contacted only at sign-in (sync verification is offline), and
//   - the kid stays signed in for months instead of re-tapping every ~1h
//     when the Google ID token expires.
//
// Any verified Google account may get a session (open signup — kids app, no
// email allow-list, unlike the CS-site gate). Guest mode is unchanged: no
// session -> localStorage only, and cloudsave still accepts a raw Google ID
// token during the frontend rollout (back-compat), session-only after.
//
// Endpoints (registered on the shared momolearn-ai express app):
//   POST /api/year2/session  { idToken } -> { ok, session, user, expiresAt }
//
// Env (fail-closed — without these, session issue AND sync refuse auth):
//   YEAR2_GOOGLE_CLIENT_ID  (= the frontend's VITE_GOOGLE_CLIENT_ID)
//   YEAR2_SESSION_SECRET    (random 32+ bytes, server-side only, never shipped)

const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days: fewer kid re-taps

export const YEAR2_ALLOWED_ORIGINS = new Set([
  'https://momoazm.github.io',
  'https://momolearn.space',
  'http://localhost:3200',
  'http://localhost:3000',
  'http://127.0.0.1:3200',
]);

export function year2Cors(res, origin) {
  const allow = YEAR2_ALLOWED_ORIGINS.has(origin) ? origin : null;
  res.setHeader('Access-Control-Allow-Origin', allow ?? '');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function expectedAudience() {
  // Same OAuth client id the year2 frontend uses for its GIS button
  // (VITE_GOOGLE_CLIENT_ID). Set it on Vercel as YEAR2_GOOGLE_CLIENT_ID.
  return process.env.YEAR2_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
}

function sessionSecret() {
  return process.env.YEAR2_SESSION_SECRET || '';
}

/** Verify a Google ID token -> { sub, email, name, picture } or null. */
export async function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 8000) return null;
  const aud = expectedAudience();
  if (!aud) {
    console.error('[year2-session] YEAR2_GOOGLE_CLIENT_ID is not set — refusing auth.');
    return null;
  }
  let d;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(TOKENINFO + encodeURIComponent(idToken), {
        headers: { 'User-Agent': 'momolearn-year2-session' },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      d = await res.json();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
  if (d?.aud !== aud) return null;
  if (d?.iss !== 'accounts.google.com' && d?.iss !== 'https://accounts.google.com') return null;
  if (String(d?.email_verified).toLowerCase() !== 'true' && d?.email_verified !== true) return null;
  const sub = String(d?.sub ?? '');
  const email = String(d?.email ?? '').toLowerCase();
  if (!sub || !email || !/^[\w-]+$/.test(sub)) return null;
  return {
    sub,
    email,
    name: String(d?.name ?? email.split('@')[0] ?? 'Player').slice(0, 64),
    picture: typeof d?.picture === 'string' ? d.picture.slice(0, 512) : undefined,
  };
}

const b64uEncode = (buf) =>
  Buffer.from(buf).toString('base64url');
const b64uDecode = (s) =>
  Buffer.from(String(s || ''), 'base64url');

/** Mint a first-party session for an already-verified identity. Null when misconfigured. */
export function makeSession(identity, ttlMs = SESSION_TTL_MS) {
  const secret = sessionSecret();
  if (!secret) {
    console.error('[year2-session] YEAR2_SESSION_SECRET is not set — refusing to sign sessions.');
    return null;
  }
  const body = {
    sub: identity.sub,
    email: identity.email,
    exp: Date.now() + ttlMs,
  };
  const payload = b64uEncode(JSON.stringify(body));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return { session: `${payload}.${sig}`, expiresAt: body.exp };
}

/** Offline-verify a first-party session -> { sub, email, exp } or null. */
export function verifySession(token) {
  const secret = sessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1 || dot > 4096) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let good;
  try {
    good = createHmac('sha256', secret).update(payload).digest('base64url');
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let d;
  try {
    d = JSON.parse(b64uDecode(payload).toString('utf8'));
  } catch {
    return null;
  }
  const sub = String(d?.sub ?? '');
  const email = String(d?.email ?? '').toLowerCase();
  if (!sub || !email || !/^[\w-]+$/.test(sub)) return null;
  if (!Number.isFinite(d?.exp) || d.exp <= Date.now()) return null;
  return { sub, email, exp: d.exp };
}

export function bearerToken(req) {
  const h = String(req.headers.authorization ?? '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/**
 * Resolve the caller to a { sub, email, via } identity or null.
 * Primary: our own session (offline HMAC verify). Back-compat during the
 * frontend rollout: a raw Google ID token (verified with Google).
 */
export async function resolveIdentity(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const sess = verifySession(token);
  if (sess) return { sub: sess.sub, email: sess.email, via: 'session' };
  // Back-compat: raw Google credential until the frontend ships sessions.
  // A forged `sub` in the JSON payload is always ignored — identity comes
  // from the verified token only.
  const g = await verifyGoogleIdToken(token);
  if (g) return { sub: g.sub, email: g.email, via: 'google' };
  return null;
}

const sessionCooldown = new Map(); // ip -> ms (cheap abuse brake on the exchange)

export function registerYear2SessionRoutes(app) {
  app.options('/api/year2/session', (req, res) => {
    year2Cors(res, req.headers.origin);
    res.status(204).end();
  });

  app.post('/api/year2/session', async (req, res) => {
    year2Cors(res, req.headers.origin);
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'local';
    const now = Date.now();
    if (now - (sessionCooldown.get(ip) ?? 0) < 1500) {
      return res.status(429).json({ ok: false, error: 'Slow down a little.' });
    }
    sessionCooldown.set(ip, now);
    const idToken = req.body?.idToken;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ ok: false, error: 'idToken required.' });
    }
    const identity = await verifyGoogleIdToken(idToken);
    if (!identity) {
      return res.status(401).json({ ok: false, error: 'Sign in with Google again.' });
    }
    const minted = makeSession(identity);
    if (!minted) {
      return res.status(503).json({ ok: false, error: 'Sign-in unavailable, try again later.' });
    }
    res.json({
      ok: true,
      session: minted.session,
      expiresAt: minted.expiresAt,
      user: {
        sub: identity.sub,
        email: identity.email,
        name: identity.name,
        ...(identity.picture ? { picture: identity.picture } : {}),
      },
    });
  });
}
