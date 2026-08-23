import crypto from 'node:crypto';
import { db, dbConfigured } from './db.js';

const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const test = crypto.scryptSync(password, salt, 64);
    const known = Buffer.from(hash, 'hex');
    return known.length === test.length && crypto.timingSafeEqual(known, test);
  } catch {
    return false;
  }
}

const newToken = () => crypto.randomBytes(32).toString('hex');

export async function createSession(accountId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  await db.insert('sessions', { token, account_id: accountId, expires_at: expires });
  return token;
}

export async function accountForToken(token) {
  if (!token) return null;
  const rows = await db.select('sessions', {
    token: `eq.${token}`,
    expires_at: `gt.${new Date().toISOString()}`,
    select: 'account_id',
    limit: '1',
  });
  if (!rows?.length) return null;
  const accounts = await db.select('accounts', { id: `eq.${rows[0].account_id}`, limit: '1' });
  return accounts?.[0] || null;
}

export function tokenFrom(req) {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export function requireOwner(req, res) {
  if (!dbConfigured()) {
    res.status(503).json({ error: 'Database not configured.' });
    return null;
  }
  return tokenFrom(req);
}

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export function registerAccountRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      if (!dbConfigured()) return res.status(503).json({ error: 'Database not configured.' });
      const username = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-24 chars: a-z, 0-9, _.' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

      const existing = await db.select('accounts', { username: `eq.${username}`, limit: '1' });
      if (existing?.length) return res.status(409).json({ error: 'That username is taken.' });

      const count = await db.select('accounts', { select: 'id', limit: '1' });
      const role = count?.length === 0 ? 'owner' : 'user';
      const created = await db.insert('accounts', { username, password_hash: hashPassword(password), role });
      const account = created[0];
      const token = await createSession(account.id);
      res.json({ ok: true, token, username: account.username, role: account.role });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      if (!dbConfigured()) return res.status(503).json({ error: 'Database not configured.' });
      const username = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const rows = await db.select('accounts', { username: `eq.${username}`, limit: '1' });
      const account = rows?.[0];
      if (!account || !verifyPassword(password, account.password_hash)) {
        return res.status(401).json({ error: 'Wrong username or password.' });
      }
      const token = await createSession(account.id);
      res.json({ ok: true, token, username: account.username, role: account.role });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const token = tokenFrom(req);
      if (token) await db.delete('sessions', { token: `eq.${token}` });
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      if (!dbConfigured()) return res.status(503).json({ error: 'Database not configured.' });
      const account = await accountForToken(tokenFrom(req));
      if (!account) return res.status(401).json({ error: 'Not signed in.' });
      res.json({ username: account.username, role: account.role });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
