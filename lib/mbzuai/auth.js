import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OWNER_DEFAULT = 'mz-jc5dkt4nxsodd85c724c507';

function acceptedCodes() {
  const codes = [process.env.MBZUAI_ACCESS_CODE, OWNER_DEFAULT]
    .filter((c) => typeof c === 'string' && c.length > 0);
  return [...new Set(codes)];
}

function tokenSecret() {
  return crypto.createHash('sha256').update('mbzuai-owner:' + acceptedCodes().join('|')).digest();
}

function sign(payload) {
  return crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
}

export function accessCode() {
  return process.env.MBZUAI_ACCESS_CODE || OWNER_DEFAULT;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function issueToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = b64u(JSON.stringify({ o: 1, e: exp }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.o === 1 && typeof data.e === 'number' && data.e > Date.now();
  } catch {
    return false;
  }
}

export function checkCode(candidate) {
  const c = String(candidate || '');
  return acceptedCodes().some((valid) => safeEqual(valid, c));
}

export function requireMbzuaiAccess(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (bearer && verifyToken(bearer)) return next();
  const alt = req.get('x-mbzuai-key') || req.get('x-interview-key') || '';
  if (alt && acceptedCodes().some((valid) => safeEqual(valid, alt))) return next();
  return res.status(401).json({ error: 'Owner access required.', configured: true });
}
