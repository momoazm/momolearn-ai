import { getState, save, markStreak, todayStr } from './store.js';

const K = 0.25;
const DIFF_WEIGHT = { 1: 1, 2: 1.25, 3: 1.5 };

export function masteryFor(topic) {
  return getState().mastery[topic] ?? 0;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function applyAnswer(q, correct, ms) {
  const s = getState();
  const stats = (s.topicStats[q.topic] = s.topicStats[q.topic] || { seen: 0, correct: 0, timeMs: 0 });
  stats.seen += 1;
  stats.timeMs += ms;
  if (correct) stats.correct += 1;

  s.totals.attempted += 1;
  s.totals.timeMs += ms;
  const bd = s.totals.byDiff[q.diff];
  bd.t += 1;
  if (correct) bd.c += 1;

  const speedBonus = correct && q.est && ms < q.est * 1000 ? 8 : 0;
  const score = correct ? Math.min(115, DIFF_WEIGHT[q.diff] * 72 + speedBonus) : 0;
  const cur = masteryFor(q.topic);
  s.mastery[q.topic] = clamp(Math.round(cur + K * (score - cur)), 0, 100);

  s.recent.unshift({ id: q.id, topic: q.topic, diff: q.diff, correct, ms, t: Date.now() });
  if (s.recent.length > 200) s.recent.length = 200;

  s.seenQueue = [q.id, ...s.seenQueue.filter((x) => x !== q.id)].slice(0, 12);

  markStreak();

  if (!correct && !q.id.startsWith('diag-')) {
    const m = s.mistakes[q.id] || { count: 0, dueAt: 0, intervalDays: 1, cls: null };
    m.count += 1;
    m.lastAt = Date.now();
    m.intervalDays = 1;
    m.dueAt = Date.now() + 24 * 3600 * 1000;
    s.mistakes[q.id] = m;
  } else if (correct && s.mistakes[q.id]) {
    const m = s.mistakes[q.id];
    m.intervalDays = Math.min(Math.round(m.intervalDays * 2.4), 35);
    m.dueAt = Date.now() + m.intervalDays * 24 * 3600 * 1000;
  }
  save();
}

export function setMistakeClass(qId, cls) {
  const s = getState();
  if (s.mistakes[qId]) {
    s.mistakes[qId].cls = cls;
    save();
  }
}

export function readiness() {
  const s = getState();
  if (!window.__mbkTopics) return 0;
  let sum = 0;
  let wsum = 0;
  for (const t of window.__mbkTopics) {
    sum += masteryFor(t.id) * t.weight;
    wsum += t.weight;
  }
  return wsum ? Math.round(sum / wsum) : 0;
}

export function rollingAccuracy(n = 6) {
  const s = getState();
  const win = s.recent.slice(0, n);
  if (!win.length) return null;
  return win.filter((r) => r.correct).length / win.length;
}

export function avgSpeedRatio() {
  const s = getState();
  const win = s.recent.slice(0, 10);
  if (win.length < 6 || !window.__mbkById) return null;
  let ratio = 0;
  let n = 0;
  for (const r of win) {
    const q = window.__mbkById[r.id];
    if (!q || !q.est) continue;
    ratio += r.ms / (q.est * 1000);
    n++;
  }
  return n ? ratio / n : null;
}

export function carelessScore() {
  const s = getState();
  const win = s.recent.slice(0, 12);
  let c = 0;
  for (const r of win) {
    const q = window.__mbkById && window.__mbkById[r.id];
    if (!r.correct && q && q.est && r.ms < q.est * 500 && q.diff === 1) c++;
  }
  return c;
}

export function weakestTopics(k = 3) {
  if (!window.__mbkTopics) return [];
  return [...window.__mbkTopics]
    .map((t) => ({ ...t, m: masteryFor(t.id), seen: getState().topicStats[t.id]?.seen || 0 }))
    .sort((a, b) => a.m - b.m)
    .slice(0, k);
}

export function strongestTopics(k = 3) {
  if (!window.__mbkTopics) return [];
  return [...window.__mbkTopics]
    .map((t) => ({ ...t, m: masteryFor(t.id), seen: getState().topicStats[t.id]?.seen || 0 }))
    .sort((a, b) => b.m - a.m)
    .slice(0, k);
}

export function dueMistakeIds() {
  const s = getState();
  const now = Date.now();
  return Object.entries(s.mistakes)
    .filter(([, m]) => m.dueAt <= now)
    .map(([id]) => id);
}

function targetDifficulty(mode) {
  const acc = rollingAccuracy(6);
  let d = 2;
  if (acc != null) {
    if (acc >= 0.83) d = 3;
    else if (acc <= 0.4) d = 1;
  }
  if (mode === 'challenge') return 3;
  if (mode === 'speed') return Math.min(d, 2);
  return d;
}

function scoreCandidate(q, mode, weakIds) {
  const s = getState();
  const m = masteryFor(q.topic);
  let score = (100 - m) + 10;
  if (weakIds.includes(q.topic)) score += 45;
  const mistake = s.mistakes[q.id];
  if (mistake && mistake.dueAt <= Date.now()) score += 60;
  const recentIdx = s.seenQueue.indexOf(q.id);
  if (recentIdx >= 0) score -= (12 - recentIdx) * 14;
  if (q.diff === targetDifficulty(mode)) score += 30;
  else score -= Math.abs(q.diff - targetDifficulty(mode)) * 22;
  if (mode === 'speed' && q.est <= 75) score += 20;
  if (mode === 'timed' && q.est >= 60) score += 8;
  return score + Math.random() * 6;
}

export function pickQuestion(bank, mode, opts = {}) {
  const weakIds = weakestTopics(3).map((t) => t.id);
  let pool = bank.filter((q) => {
    if (opts.topics && !opts.topics.includes(q.topic)) return false;
    if (opts.ids && !opts.ids.includes(q.id)) return false;
    if (opts.minDiff && q.diff < opts.minDiff) return false;
    return true;
  });
  if (!pool.length) pool = bank;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < Math.min(pool.length, 40); i++) {
    const q = pool[Math.floor(Math.random() * pool.length)];
    const sc = scoreCandidate(q, mode, weakIds);
    if (sc > bestScore) {
      bestScore = sc;
      best = q;
    }
  }
  return best || pool[0];
}

export function recommendNext() {
  const s = getState();
  if (!s.onboarded) {
    return { key: 'diagnostic', label: 'Start your diagnostic assessment', why: 'A 26-question sweep builds your baseline across every exam area.' };
  }
  const due = dueMistakeIds().length;
  if (due > 0) {
    return { key: 'redo', label: `Redo ${due} due mistake${due > 1 ? 's' : ''}`, why: 'Spaced repetition: these concepts are slipping and are scheduled today.' };
  }
  const slow = avgSpeedRatio();
  if (slow != null && slow > 1.4) {
    return { key: 'timed', label: 'Timed drill', why: 'You are accurate but slower than target pace — practice under the clock.' };
  }
  if (carelessScore() >= 3) {
    return { key: 'weakness', label: 'Accuracy exercise (Weakness Practice)', why: 'Several fast misses on easy questions — slow down with hint-first practice.' };
  }
  const w = weakestTopics(1)[0];
  if (w && w.m < 50) {
    return { key: 'weakness', label: `Weakness Practice — ${w.name}`, why: `Lowest mastery (${w.m}%). Targeted questions will lift it fastest.` };
  }
  if (rollingAccuracy(6) != null && rollingAccuracy(6) >= 0.83) {
    return { key: 'challenge', label: 'Challenge set', why: 'Consistently strong — push into advanced difficulty.' };
  }
  return { key: 'practice', label: 'Adaptive practice session', why: 'Mixed adaptive questions to keep every area moving.' };
}

export function buildPlan({ examDate, hoursPerDay }) {
  const s = getState();
  if (!window.__mbkTopics || !examDate) return null;
  const start = new Date(todayStr());
  const end = new Date(examDate);
  const days = Math.max(0, Math.round((end - start) / 86400000));
  const perDay = Math.max(20, Math.round(Number(hoursPerDay) * 60 * 0.85));
  const plan = { generatedAt: Date.now(), examDate, hoursPerDay, items: [] };

  const ranked = [...window.__mbkTopics]
    .map((t) => ({ ...t, m: masteryFor(t.id) }))
    .sort((a, b) => a.m - b.m);

  let dayOffset = 0;
  while (dayOffset < days || dayOffset < 7) {
    const date = new Date(start);
    date.setDate(date.getDate() + dayOffset);
    const blocks = [];
    let minutesLeft = perDay;
    const isMockDay = dayOffset > 0 && dayOffset % 7 === 0;
    if (isMockDay && minutesLeft >= 45) {
      blocks.push({ kind: 'mock', label: 'Full mock exam + review', min: 55 });
      minutesLeft -= 55;
    }
    const picks = [ranked[dayOffset % ranked.length], ranked[(dayOffset + 1) % ranked.length], ranked[(dayOffset + 4) % ranked.length]];
    const perBlock = Math.max(15, Math.floor(minutesLeft / (picks.length + 1)));
    for (const p of picks) {
      if (minutesLeft <= 0) break;
      const min = Math.min(perBlock, minutesLeft);
      blocks.push({ kind: 'topic', topic: p.id, label: `${p.name} practice`, min });
      minutesLeft -= min;
    }
    if (minutesLeft >= 15) {
      blocks.push({ kind: dayOffset % 2 === 0 ? 'drill' : 'speed', label: dayOffset % 2 === 0 ? 'Timed drill' : 'Speed training', min: 15 });
      minutesLeft -= 15;
    }
    plan.items.push({ date: todayStr(date), done: false, blocks });
    dayOffset++;
    if (dayOffset >= 60) break;
  }
  s.plan = plan;
  save();
  return plan;
}

export function classifyDefault(q, ms, usedHint) {
  const sec = ms / 1000;
  if (sec < q.est * 0.5) return 'careless';
  if (sec > q.est * 1.6) return 'time pressure';
  if (usedHint) return 'conceptual';
  return 'conceptual';
}
