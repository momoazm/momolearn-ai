import PHYSICS from './banks/physics.js';
import CHEMISTRY from './banks/chemistry.js';
import BIOLOGY from './banks/biology.js';

export const SUBJECTS = [
  { id: 'physics', code: '0625', name: 'Physics', emoji: '⚛️' },
  { id: 'chemistry', code: '0620', name: 'Chemistry', emoji: '🧪' },
  { id: 'biology', code: '0610', name: 'Biology', emoji: '🧬' },
];

export const PAPERS = [
  {
    id: 'p2',
    name: 'Paper 2 — Multiple Choice',
    short: 'P2',
    kind: 'mcq',
    minutes: 45,
    count: 40,
    marking: 'premade-ms',
    markingLabel: 'Instant auto-marking · premade mark scheme',
    blurb: '40 multiple choice questions (45 min). Every question has a fixed, premade answer key — you get your score and the full mark scheme the moment you submit.',
  },
  {
    id: 'p4',
    name: 'Paper 4 — Extended Theory',
    short: 'P4',
    kind: 'written',
    minutes: 75,
    count: 10,
    marking: 'ai',
    markingLabel: 'AI examiner · marked against official-style markscheme',
    blurb: '10 structured theory questions (75 min, 80 marks). Type your answers and an AI examiner trained on the markscheme marks every part line-by-line.',
  },
  {
    id: 'p6',
    name: 'Paper 6 — Alternative to Practical',
    short: 'P6',
    kind: 'written',
    minutes: 60,
    count: 6,
    marking: 'ai',
    markingLabel: 'AI examiner · marked against official-style markscheme',
    blurb: '6 practical questions (60 min, 40 marks). The AI examiner grades each response against the markscheme credit points.',
  },
];

const SERIES = [
  { id: 'feb', label: 'Feb/March', code: 'F/M' },
  { id: 'may', label: 'May/June', code: 'M/J' },
  { id: 'oct', label: 'Oct/Nov', code: 'O/N' },
];

export const SESSIONS = [];
for (const y of [2023, 2024, 2025]) for (const s of SERIES) SESSIONS.push({ ...s, id: `${y}-${s.id}`, year: y });
for (const s of [SERIES[0], SERIES[1]]) SESSIONS.push({ ...s, id: `2026-${s.id}`, year: 2026 });

export const BANKS = { physics: PHYSICS, chemistry: CHEMISTRY, biology: BIOLOGY };

function strHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function subjectById(id) { return SUBJECTS.find((s) => s.id === id); }
export function paperById(id) { return PAPERS.find((p) => p.id === id); }
export function sessionById(id) { return SESSIONS.find((s) => s.id === id); }

export function sessionLabel(s) { return `${s.label} ${s.year}`; }

export function examKey(subjectId, paperId, sessionId) {
  return `${subjectId}|${paperId}|${sessionId}`;
}

export function buildExam(subjectId, paperId, sessionId) {
  const subject = subjectById(subjectId);
  const paper = paperById(paperId);
  const session = sessionById(sessionId);
  if (!subject || !paper || !session) return null;
  const bank = BANKS[subjectId][paperId];
  if (!Array.isArray(bank) || bank.length === 0) return null;

  const rng = mulberry32(strHash(`${subjectId}|${paperId}|${sessionId}|v1`));
  const idx = bank.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const take = Math.min(paper.count, bank.length);
  const questions = idx.slice(0, take).map((i) => ({ ...bank[i], num: 0 }));

  let totalMarks = 0;
  questions.forEach((q, i) => {
    q.num = i + 1;
    const partSum = Array.isArray(q.parts) ? q.parts.reduce((n, p) => n + p.marks, 0) : null;
    totalMarks += q.marks ?? partSum ?? 1;
  });

  return {
    key: examKey(subjectId, paperId, sessionId),
    subject, paper, session,
    title: `${subject.name} · ${paper.name} · ${sessionLabel(session)}`,
    questions,
    totalMarks,
  };
}

export function randomExam(filter = {}) {
  const subs = SUBJECTS.filter((s) => !filter.subject || s.id === filter.subject);
  const papers = PAPERS.filter((p) => !filter.paper || p.id === filter.paper);
  const s = subs[Math.floor(Math.random() * subs.length)];
  const p = papers[Math.floor(Math.random() * papers.length)];
  const sess = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
  return buildExam(s.id, p.id, sess.id);
}

export function gradeFor(pct) {
  if (pct >= 90) return 'A*';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 40) return 'E';
  return 'U';
}

const STORE_KEY = 'momolearn.igcse.v1';

export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { attempts: {} }; }
  catch { return { attempts: {} }; }
}

export function saveAttempt(key, pct, awarded, maxMarks) {
  const st = loadStore();
  const prev = st.attempts[key];
  st.attempts[key] = {
    best: prev ? Math.max(prev.best ?? 0, pct) : pct,
    last: pct,
    awarded, maxMarks,
    at: Date.now(),
    tries: (prev?.tries || 0) + 1,
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(st));
  return st.attempts[key];
}
