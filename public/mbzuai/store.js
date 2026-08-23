const KEY = 'momo.mbzuai.state.v1';

export const AI_LIMITS = { gen: 6, tutor: 25 };

export function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function freshState() {
  return {
    v: 1,
    savedAt: 0,
    token: null,
    onboarded: false,
    settings: { examDate: '', targetScore: 80, hoursPerDay: 2 },
    mastery: {},
    topicStats: {},
    totals: { attempted: 0, correct: 0, timeMs: 0, byDiff: { 1: { c: 0, t: 0 }, 2: { c: 0, t: 0 }, 3: { c: 0, t: 0 } } },
    recent: [],
    streakDates: [],
    mistakes: {},
    sessions: [],
    mocks: [],
    diagnostic: null,
    plan: null,
    aiUsage: { date: todayStr(), gen: 0, tutor: 0 },
    genPool: [],
    seenQueue: [],
    aiReviews: {},
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    return { ...freshState(), ...parsed };
  } catch {
    return freshState();
  }
}

export function getState() {
  if (state.aiUsage.date !== todayStr()) state.aiUsage = { date: todayStr(), gen: 0, tutor: 0 };
  return state;
}

let saveTimer = null;
let persistListener = null;
let suppressNotify = false;

export function onPersist(fn) {
  persistListener = fn;
}

export function save() {
  state.savedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (persistListener && !suppressNotify) {
      try { persistListener(state); } catch {}
    }
  }, 120);
}

export function replaceLocal(next) {
  if (!next || typeof next !== 'object' || next.v !== 1) return false;
  const token = state.token;
  suppressNotify = true;
  state = { ...freshState(), ...next, token };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  suppressNotify = false;
  return true;
}

export function resetProgress() {
  const token = state.token;
  state = freshState();
  state.token = token;
  save();
}

export function markStreak() {
  const t = todayStr();
  if (!state.streakDates.includes(t)) state.streakDates.push(t);
  if (state.streakDates.length > 400) state.streakDates = state.streakDates.slice(-400);
  save();
}

export function currentStreak() {
  const days = new Set(state.streakDates);
  let streak = 0;
  const d = new Date();
  if (!days.has(todayStr(d))) d.setDate(d.getDate() - 1);
  while (days.has(todayStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function bumpAi(kind) {
  getState();
  state.aiUsage[kind] += 1;
  save();
}
