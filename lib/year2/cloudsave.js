import { put, head } from '@vercel/blob';
import { resolveIdentity, year2Cors } from './session.js';

// Per-Google-account cloud save for momomath-year2 (GitHub Pages static app).
//
// Why this exists: the year2 app runs on https://momoazm.github.io/momomath-year2/
// with no server of its own, so player progress lived in per-device localStorage.
// Signing in with the same Google account on a second device started from zero.
// momolearn.space does not have this problem because its APIs verify the Google
// identity server-side and key every row by the Google account id (`sub`).
//
// This module brings the same model to year2:
//   - The browser signs in once via POST /api/year2/session (see session.js)
//     and gets a first-party HMAC session (90 days). Sync calls carry it as
//     `Authorization: Bearer <session>`.
//   - During the frontend rollout a raw Google ID token is still accepted
//     (verified with Google's tokeninfo endpoint, `aud` checked); after the
//     rollout the session becomes the only path.
//   - The save is stored at `year2/saves/<sub>.json` on Vercel Blob, so every
//     device signed into the same Google account reads/writes the same object.
//   - The client identity (`sub`) ALWAYS comes from the verified credential,
//     never from the request body. A forged `sub` in the JSON payload is ignored.
//
// Endpoints (registered on the shared momolearn-ai express app):
//   GET /api/year2/cloudsave  -> { ok, save | null }      (null = first run)
//   PUT /api/year2/cloudsave  -> { ok, save }              (merged + stored)

const SAVE_PREFIX = 'year2/saves/';
const MAX_BODY_BYTES = 512_000; // adaptive tracker (500 attempts) needs headroom
const WRITE_COOLDOWN_MS = 1500;

const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby', 'Emerald', 'Amethyst', 'Diamond'];
const SUBJECTS = new Set(['math', 'english', 'science', 'german', 'arabic', 'religion', 'social']);
const MASCOTS = new Set([
  'sonic', 'tails', 'knuckles', 'amy', 'shadow', 'silver', 'metal',
  'cream', 'blaze', 'rouge', 'eggman', 'charmy', 'big', 'ray',
  'vector', 'espio', 'omega', 'jet', 'super',
]);
const ADAPTIVE_REASONS = new Set([
  'mastery-deficit', 'spaced-review-due', 'recommendation-accepted',
  'cold-start', 'curriculum-default', 'in-lesson', 'unknown',
]);

// In-memory cache per server instance (Blob reads lag writes, same as leaderboard).
const cache = new Map(); // sub -> save
const lastWriteAt = new Map(); // ip -> ms

const num = (v, min, max, fallback = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const int = (v, min, max, fallback = 0) => Math.round(num(v, min, max, fallback));
const prob = (v, fallback = 0) => num(v, 0, 1, fallback);

const str = (v, max) => String(v ?? '').slice(0, max);
const bool = (v) => v === true;
const dayStr = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');

/** Whitelist + cap every field so one client can never blow up the store. */
export function sanitizeSave(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lessonProgress = {};
  const lp = raw.lessonProgress;
  if (lp && typeof lp === 'object') {
    for (const [k, v] of Object.entries(lp).slice(0, 1000)) {
      if (!/^[\w:-]{1,64}$/.test(k) || !v || typeof v !== 'object') continue;
      lessonProgress[k] = {
        crown: int(v.crown, 0, 3),
        bestAccuracy: int(v.bestAccuracy, 0, 100),
        completions: int(v.completions, 0, 1_000_000),
      };
    }
  }
  const achievements = Array.isArray(raw.achievements)
    ? [...new Set(raw.achievements.map((a) => str(a, 48)).filter(Boolean))].slice(0, 200)
    : [];
  // cardStars: per-character TOTAL copies (uncapped — 5★ = 21 copies). The old
  // cardCollection string[] migrates to 3 copies each, mirroring the client.
  const cardStars = {};
  const cs = raw.cardStars;
  if (cs && typeof cs === 'object') {
    for (const [k, v] of Object.entries(cs).slice(0, 500)) {
      if (!/^[\w:-]{1,64}$/.test(k)) continue;
      cardStars[k] = int(v, 0, 999_999);
    }
  }
  if (Array.isArray(raw.cardCollection)) {
    for (const id of raw.cardCollection.slice(0, 500)) {
      const k = str(id, 64);
      if (!/^[\w:-]{1,64}$/.test(k) || !k) continue;
      cardStars[k] = Math.max(cardStars[k] ?? 0, 3);
    }
  }
  const shopInventory = {};
  const si = raw.shopInventory;
  if (si && typeof si === 'object') {
    for (const [k, v] of Object.entries(si).slice(0, 200)) {
      if (!/^[\w:-]{1,48}$/.test(k)) continue;
      shopInventory[k] = int(v, 0, 9999);
    }
  }
  const leagueHistory = Array.isArray(raw.leagueHistory)
    ? raw.leagueHistory.slice(-10).map((h) => ({
        weekKey: dayStr(h?.weekKey),
        league: LEAGUES.includes(h?.league) ? h.league : 'Bronze',
        outcome: ['promoted', 'demoted', 'stayed'].includes(h?.outcome) ? h.outcome : 'stayed',
        xp: int(h?.xp, 0, 100000),
      })).filter((h) => h.weekKey)
    : [];
  const league = LEAGUES.includes(raw.currentLeague) ? raw.currentLeague : 'Bronze';
  const subject = SUBJECTS.has(raw.subject) ? raw.subject : 'math';
  const lastActiveDay = dayStr(raw.lastActiveDay) || null;
  const weeklyXpWeek = dayStr(raw.weeklyXpWeek);
  return {
    name: str(raw.name, 24) || 'Champion',
    mascot: MASCOTS.has(raw.mascot) ? raw.mascot : 'sonic',
    subject,
    xpTotal: int(raw.xpTotal, 0, 10_000_000),
    gems: int(raw.gems, 0, 10_000_000),
    streakCurrent: int(raw.streakCurrent, 0, 100000),
    streakLongest: int(raw.streakLongest, 0, 100000),
    lastActiveDay,
    dailyGoal: [15, 30, 50].includes(Number(raw.dailyGoal)) ? Number(raw.dailyGoal) : 30,
    weeklyXpWeek,
    weeklyXp: int(raw.weeklyXp, 0, 100000),
    currentLeague: league,
    leagueHistory,
    lessonProgress,
    achievements,
    cardStars,
    shopInventory,
    streakSavers: int(raw.streakSavers, 0, 9999),
    doubleXpLessons: int(raw.doubleXpLessons, 0, 9999),
    luckyTickets: int(raw.luckyTickets, 0, 9999),
    chestBoost: bool(raw.chestBoost),
    megaChest: bool(raw.megaChest),
    adaptive: sanitizeAdaptive(raw.adaptive),
    updatedAt: int(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

function sanitizeSkill(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    pL: prob(s.pL),
    attempts: int(s.attempts, 0, 1_000_000),
    correct: int(s.correct, 0, 1_000_000),
    incorrect: int(s.incorrect, 0, 1_000_000),
    recent: Array.isArray(s.recent) ? s.recent.slice(0, 32).map((r) => r === true) : [],
    trend: prob(s.trend),
    lastPracticedAt: int(s.lastPracticedAt, 0, Number.MAX_SAFE_INTEGER),
    avgResponseMs: int(s.avgResponseMs, 0, 3_600_000),
    difficulty: [1, 2, 3].includes(Number(s.difficulty)) ? Number(s.difficulty) : 1,
    streakCorrect: int(s.streakCorrect, 0, 1_000_000),
    streakWrong: int(s.streakWrong, 0, 1_000_000),
    firstSeenAt: int(s.firstSeenAt, 0, Number.MAX_SAFE_INTEGER),
  };
}

function sanitizeAttempt(e) {
  if (!e || typeof e !== 'object') return null;
  // The full question snapshot (`q`) is kept only when small — wrong-answer
  // retries carry the whole question and would otherwise blow the body cap.
  let q = null;
  if (e.q && typeof e.q === 'object') {
    try {
      const qs = JSON.stringify(e.q);
      if (qs.length <= 4096) q = JSON.parse(qs);
    } catch { q = null; }
  }
  return {
    ts: int(e.ts, 0, Number.MAX_SAFE_INTEGER),
    lessonId: str(e.lessonId, 64),
    objectiveCode: str(e.objectiveCode, 32),
    kind: str(e.kind, 32),
    difficulty: [1, 2, 3].includes(Number(e.difficulty)) ? Number(e.difficulty) : 1,
    answer: str(e.answer, 500),
    correct: bool(e.correct),
    responseTimeMs: int(e.responseTimeMs, 0, 3_600_000),
    masteryBefore: prob(e.masteryBefore),
    masteryAfter: prob(e.masteryAfter),
    reason: ADAPTIVE_REASONS.has(e.reason) ? e.reason : 'unknown',
    prompt: str(e.prompt, 2000),
    correctAnswer: str(e.correctAnswer, 2000),
    q,
    mistakeKind: e.mistakeKind == null ? null : str(e.mistakeKind, 48),
    rushed: bool(e.rushed),
  };
}

/** Learning-tracker slice. Null on old saves — passed through, never crashes. */
export function sanitizeAdaptive(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : {};
  const skills = {};
  const skillsIn = snap.skills && typeof snap.skills === 'object' ? snap.skills : {};
  for (const [code, s] of Object.entries(skillsIn).slice(0, 1000)) {
    if (!/^[\w.+-]{1,32}$/.test(code)) continue;
    const clean = sanitizeSkill(s);
    if (clean) skills[code] = clean;
  }
  const seenCodes = Array.isArray(snap.seenCodes)
    ? [...new Set(snap.seenCodes.map((c) => str(c, 32)).filter(Boolean))].slice(0, 2000)
    : [];
  const recentPicks = Array.isArray(snap.recentPicks)
    ? snap.recentPicks.map((c) => str(c, 32)).filter(Boolean).slice(0, 8)
    : [];
  const lr = snap.lastRecommendation;
  const lastRecommendation = lr && typeof lr === 'object' ? {
    objectiveCode: str(lr.objectiveCode, 32),
    lessonId: lr.lessonId == null ? null : str(lr.lessonId, 64),
    difficulty: [1, 2, 3].includes(Number(lr.difficulty)) ? Number(lr.difficulty) : 1,
    reasonCode: ADAPTIVE_REASONS.has(lr.reasonCode) ? lr.reasonCode : 'unknown',
    reasonText: str(lr.reasonText, 500),
    mastery: prob(lr.mastery),
    trend: prob(lr.trend),
  } : null;
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts.slice(-500).map(sanitizeAttempt).filter(Boolean)
    : [];
  const masteryHistory = {};
  const mh = raw.masteryHistory && typeof raw.masteryHistory === 'object' ? raw.masteryHistory : {};
  for (const [code, series] of Object.entries(mh).slice(0, 1000)) {
    if (!/^[\w.+-]{1,32}$/.test(code) || !Array.isArray(series)) continue;
    masteryHistory[code] = series.slice(-50)
      .map((p) => ({ ts: int(p?.ts, 0, Number.MAX_SAFE_INTEGER), pL: prob(p?.pL) }))
      .filter((p) => p.ts > 0);
  }
  const t = raw.telemetry && typeof raw.telemetry === 'object' ? raw.telemetry : {};
  return {
    snapshot: { skills, seenCodes, recentPicks, lastRecommendation },
    attempts,
    masteryHistory,
    telemetry: {
      llmRequests: int(t.llmRequests, 0, 1_000_000_000),
      llmHits: int(t.llmHits, 0, 1_000_000_000),
      llmFallbacks: int(t.llmFallbacks, 0, 1_000_000_000),
      lastLlmProvider: t.lastLlmProvider == null ? null : str(t.lastLlmProvider, 64),
      lastLlmLatencyMs: t.lastLlmLatencyMs == null ? null : int(t.lastLlmLatencyMs, 0, 3_600_000),
      recommended: int(t.recommended, 0, 1_000_000_000),
      recommendedAccepted: int(t.recommendedAccepted, 0, 1_000_000_000),
    },
  };
}

function maxMapLessons(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    if (!prev) {
      out[k] = v;
      continue;
    }
    out[k] = {
      crown: Math.max(prev.crown, v.crown),
      bestAccuracy: Math.max(prev.bestAccuracy, v.bestAccuracy),
      completions: Math.max(prev.completions, v.completions),
    };
  }
  return out;
}

function union(a = [], b = []) {
  return [...new Set([...a, ...b])];
}

function maxInventory(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

/** Star copies from either device survive: union of cards, max copies each. */
export function mergeCardStars(a = {}, b = {}) {
  const merged = { ...a };
  for (const [k, v] of Object.entries(b)) merged[k] = Math.max(merged[k] ?? -1, v);
  return merged;
}

/**
 * Learning-tracker merge (mirror of the client's mergeAdaptive): more
 * evidence wins per skill, attempt logs interleave by time, mastery curves
 * union. Never deletes — a question answered on ANY device survives.
 */
export function mergeAdaptive(a, b) {
  if (!a) return b;
  if (!b) return a;
  const skills = { ...a.snapshot.skills };
  for (const [code, sb] of Object.entries(b.snapshot.skills)) {
    const sa = skills[code];
    if (!sa) {
      skills[code] = sb;
    } else if (
      sb.attempts > sa.attempts ||
      (sb.attempts === sa.attempts && sb.lastPracticedAt > sa.lastPracticedAt)
    ) {
      skills[code] = sb;
    }
  }
  const seen = new Set();
  const attempts = [];
  for (const e of [...a.attempts, ...b.attempts]) {
    const key = `${e.ts}|${e.objectiveCode}|${e.answer}|${e.correct ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attempts.push(e);
  }
  attempts.sort((x, y) => x.ts - y.ts);
  const masteryHistory = {};
  for (const code of new Set([...Object.keys(a.masteryHistory), ...Object.keys(b.masteryHistory)])) {
    const pts = [...(a.masteryHistory[code] ?? []), ...(b.masteryHistory[code] ?? [])];
    const deduped = pts.filter(
      (p, i, arr) => arr.findIndex((qq) => qq.ts === p.ts && qq.pL === p.pL) === i,
    );
    deduped.sort((x, y) => x.ts - y.ts);
    masteryHistory[code] = deduped.slice(-50);
  }
  const ta = a.telemetry;
  const tb = b.telemetry;
  const useB = tb.llmRequests >= ta.llmRequests;
  return {
    snapshot: {
      skills,
      seenCodes: [...a.snapshot.seenCodes, ...b.snapshot.seenCodes.filter((c) => !a.snapshot.seenCodes.includes(c))],
      recentPicks: [...a.snapshot.recentPicks, ...b.snapshot.recentPicks.filter((c) => !a.snapshot.recentPicks.includes(c))].slice(0, 8),
      lastRecommendation: a.snapshot.lastRecommendation ?? b.snapshot.lastRecommendation,
    },
    attempts: attempts.slice(-500),
    masteryHistory,
    telemetry: {
      llmRequests: Math.max(ta.llmRequests, tb.llmRequests),
      llmHits: Math.max(ta.llmHits, tb.llmHits),
      llmFallbacks: Math.max(ta.llmFallbacks, tb.llmFallbacks),
      lastLlmProvider: useB ? tb.lastLlmProvider : ta.lastLlmProvider,
      lastLlmLatencyMs: useB ? tb.lastLlmLatencyMs : ta.lastLlmLatencyMs,
      recommended: Math.max(ta.recommended, tb.recommended),
      recommendedAccepted: Math.max(ta.recommendedAccepted, tb.recommendedAccepted),
    },
  };
}

/**
 * Merge two saves so progress earned on EITHER device survives.
 * Counters take the max (XP/gems/streaks only grow), collections union,
 * per-lesson progress takes per-field max, consumable flags and
 * identity/display fields follow the newest writer. Day counters (todayXp
 * etc.) are intentionally NOT synced — each device rolls its own day.
 */
export function mergeSaves(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newest = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  return {
    name: newest.name,
    mascot: newest.mascot,
    subject: newest.subject,
    dailyGoal: newest.dailyGoal,
    lastActiveDay: newest.lastActiveDay,
    weeklyXpWeek: newest.weeklyXpWeek,
    currentLeague: LEAGUES.indexOf(b.currentLeague) >= LEAGUES.indexOf(a.currentLeague)
      ? b.currentLeague
      : a.currentLeague,
    xpTotal: Math.max(a.xpTotal, b.xpTotal),
    gems: Math.max(a.gems, b.gems),
    streakCurrent: Math.max(a.streakCurrent, b.streakCurrent),
    streakLongest: Math.max(a.streakLongest, b.streakLongest),
    weeklyXp: newest.weeklyXpWeek && a.weeklyXpWeek === b.weeklyXpWeek
      ? Math.max(a.weeklyXp, b.weeklyXp)
      : (newest.weeklyXp ?? 0),
    leagueHistory: [...a.leagueHistory, ...b.leagueHistory]
      .filter((h, i, arr) => arr.findIndex((x) => x.weekKey === h.weekKey) === i)
      .sort((x, y) => (x.weekKey < y.weekKey ? -1 : 1))
      .slice(-10),
    lessonProgress: maxMapLessons(a.lessonProgress, b.lessonProgress),
    achievements: union(a.achievements, b.achievements),
    cardStars: mergeCardStars(a.cardStars, b.cardStars),
    shopInventory: maxInventory(a.shopInventory, b.shopInventory),
    streakSavers: Math.max(a.streakSavers, b.streakSavers),
    doubleXpLessons: Math.max(a.doubleXpLessons, b.doubleXpLessons),
    luckyTickets: Math.max(a.luckyTickets, b.luckyTickets),
    chestBoost: newest.chestBoost === true,
    megaChest: newest.megaChest === true,
    adaptive: mergeAdaptive(a.adaptive, b.adaptive),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, Date.now()),
  };
}

function savePath(sub) {
  return `${SAVE_PREFIX}${sub}.json`;
}

async function loadSave(sub) {
  if (cache.has(sub)) return cache.get(sub);
  try {
    const meta = await head(savePath(sub));
    if (meta) {
      const res = await fetch(meta.downloadUrl ?? meta.url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const clean = sanitizeSave(data);
        if (clean) {
          cache.set(sub, clean);
          return clean;
        }
      }
    }
  } catch (err) {
    const notFound =
      err?.name === 'BlobNotFoundError' || /does not exist/i.test(String(err?.message ?? ''));
    if (!notFound) {
      console.error('[year2-cloudsave] load failed:', err?.name, String(err?.message ?? err).slice(0, 200));
    }
  }
  return null;
}

async function storeSave(sub, save) {
  cache.set(sub, save);
  await put(savePath(sub), JSON.stringify(save), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

export function registerYear2CloudSaveRoutes(app) {
  app.options('/api/year2/cloudsave', (req, res) => {
    year2Cors(res, req.headers.origin);
    res.status(204).end();
  });

  app.get('/api/year2/cloudsave', async (req, res) => {
    year2Cors(res, req.headers.origin);
    const identity = await resolveIdentity(req);
    if (!identity) {
      return res.status(401).json({ ok: false, error: 'Sign in with Google again to sync.' });
    }
    try {
      const save = await loadSave(identity.sub);
      res.json({ ok: true, save });
    } catch {
      res.status(503).json({ ok: false, error: 'Sync storage unavailable, try again later.' });
    }
  });

  app.put('/api/year2/cloudsave', async (req, res) => {
    year2Cors(res, req.headers.origin);
    const identity = await resolveIdentity(req);
    if (!identity) {
      return res.status(401).json({ ok: false, error: 'Sign in with Google again to sync.' });
    }
    if (JSON.stringify(req.body ?? {}).length > MAX_BODY_BYTES) {
      return res.status(413).json({ ok: false, error: 'Save too large.' });
    }
    const incoming = sanitizeSave(req.body?.save);
    if (!incoming) {
      return res.status(400).json({ ok: false, error: 'Invalid save payload.' });
    }
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'local';
    const now = Date.now();
    if (now - (lastWriteAt.get(ip) ?? 0) < WRITE_COOLDOWN_MS) {
      return res.status(429).json({ ok: false, error: 'Slow down a little.' });
    }
    lastWriteAt.set(ip, now);
    try {
      const current = await loadSave(identity.sub);
      const merged = mergeSaves(current, incoming);
      await storeSave(identity.sub, merged);
      res.json({ ok: true, save: merged });
    } catch (err) {
      console.error('[year2-cloudsave] save failed:', err?.name, String(err?.message ?? err).slice(0, 200));
      res.status(503).json({ ok: false, error: 'Sync storage unavailable, try again later.' });
    }
  });
}
