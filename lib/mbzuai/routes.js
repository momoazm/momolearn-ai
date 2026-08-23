import {
  accessCode,
  checkCode,
  issueToken,
  requireMbzuaiAccess,
} from './auth.js';
import {
  TOPICS,
  QUESTIONS,
  DIAGNOSTIC_CONFIG,
  MOCK_CONFIG,
  diagnosticBlueprint,
} from './bank.js';
import { generateQuestions, askStructured } from './generate.js';
import { loadOwnerState, saveOwnerState, syncBackend } from './state-store.js';

export const FULL_TEST_BLUEPRINT = {
  algebra: 3, functions: 2, probability: 3, statistics: 2,
  linear: 2, calculus: 1, discrete: 1,
  logic: 3, quant: 2,
  programming: 3, algo: 3, csf: 2,
  dat: 3,
};

const GENRE_BATCHES = [
  ['Math A', [['algebra', 3], ['functions', 2]]],
  ['Math B', [['probability', 3], ['statistics', 2]]],
  ['Math C', [['linear', 2], ['calculus', 1], ['discrete', 1]]],
  ['Computational Thinking & Logic', [['logic', 3], ['quant', 2]]],
  ['Programming A', [['programming', 3], ['algo', 3]]],
  ['Programming B & Data', [['csf', 2], ['dat', 3]]],
];

export function registerMbzuaiRoutes(app, { callModel, hasKey, isCoolingDown, markCooldown }) {
  app.post('/api/mbzuai/access', (req, res) => {
    if (!accessCode()) {
      return res.status(503).json({ error: 'MBZUAI_ACCESS_CODE is not configured on the server.', configured: false });
    }
    if (!checkCode(req.body?.code)) {
      return res.status(401).json({ error: 'Invalid access code.', configured: true });
    }
    res.json({ ok: true, token: issueToken() });
  });

  app.get('/api/mbzuai/bank', requireMbzuaiAccess, (req, res) => {
    res.json({
      ok: true,
      topics: TOPICS,
      questions: QUESTIONS,
      diagnostic: DIAGNOSTIC_CONFIG,
      mock: MOCK_CONFIG,
      fullTestBlueprint: FULL_TEST_BLUEPRINT,
      diagnosticIds: diagnosticBlueprint().map((q) => q.id),
    });
  });

  app.get('/api/mbzuai/state', requireMbzuaiAccess, async (req, res) => {
    const { state, backend } = await loadOwnerState();
    res.json({ ok: true, state, backend });
  });

  app.put('/api/mbzuai/state', requireMbzuaiAccess, async (req, res) => {
    const s = req.body?.state;
    if (!s || typeof s !== 'object' || typeof s.v !== 'number') {
      return res.status(400).json({ error: 'Invalid state payload.' });
    }
    if (typeof s.savedAt === 'number') s.savedAt = Math.min(s.savedAt, Date.now() + 60000);
    const out = await saveOwnerState(s);
    if (!out.ok && out.reason === 'too-large') {
      return res.status(413).json({ error: 'State exceeds size limit.' });
    }
    res.json({ ok: out.ok, backend: out.backend });
  });

  app.get('/api/mbzuai/sync-status', requireMbzuaiAccess, (req, res) => {
    res.json({ ok: true, backend: syncBackend() });
  });

  app.get('/api/mbzuai/full-test/:batchIndex', requireMbzuaiAccess, async (req, res) => {
    const idx = Number(req.params.batchIndex);
    const [genre, pairs] = GENRE_BATCHES[idx] || [];
    if (!genre) return res.status(400).json({ error: 'Unknown batch.' });
    const topics = pairs.map(([id, n]) => ({ id, count: FULL_TEST_BLUEPRINT[id] ?? n }));
    const avoidList = String(req.query?.avoid || '')
      .split('~~').filter((x) => x.trim()).slice(0, 10);
    try {
      const r = await generateQuestions(
        callModel,
        { topics,
          difficulty: 'mixed',
          avoidTexts: avoidList,
          maxModels: 6,
          preferredProvider: 'gemini',
          deadline: Date.now() + 42_000 },
        { hasKey },
      );
      const stamp = Date.now().toString(36);
      const tally = {};
      const questions = r.questions.map((q, i) => {
        tally[q.topic] = (tally[q.topic] || 0) + 1;
        return { ...q, id: `gen-${stamp}-${idx}-${i}`, source: 'ai' };
      });
      res.json({ ok: true, genre, questions, tally });
    } catch (err) {
      res.status(502).json({ ok: false, genre, error: String(err.message).slice(0, 120) });
    }
  });

  app.get('/api/mbzuai/full-test-blueprint', requireMbzuaiAccess, (req, res) => {
    res.json({ ok: true, blueprint: FULL_TEST_BLUEPRINT });
  });

  app.post('/api/mbzuai/coach', requireMbzuaiAccess, async (req, res) => {
    const stats = req.body?.stats && typeof req.body.stats === 'object' ? req.body.stats : null;
    if (!stats) return res.status(400).json({ error: 'stats object required' });
    const messages = [
      { role: 'system', content: 'You are MomoLearn AI\'s MBZUAI admissions-prep coach. You receive a candidate\'s real preparation statistics and reply with STRICT JSON only: {"summary": string (max 60 words, direct and specific), "strengths": string[] (0-3 short items), "focus": [{"area": string, "action": string}] (1-3 items, actions concrete), "nextStep": string (one immediate action), "motivation": string (max 15 words)}. Ground every statement in the provided numbers; never invent topics that are not listed.' },
      { role: 'user', content: 'Candidate stats: ' + JSON.stringify(stats).slice(0, 3500) },
    ];
    try {
      const out = await askStructured(callModel, messages, { hasKey, isCoolingDown, markCooldown }, { preferredProvider: 'gemini', maxModels: 4 });
      if (!out || !out.summary) throw new Error('unusable response');
      res.json({ ok: true, review: out });
    } catch (e) {
      res.status(502).json({ ok: false, error: String(e.message).slice(0, 140) });
    }
  });

  app.post('/api/mbzuai/classify-mistake', requireMbzuaiAccess, async (req, res) => {
    const b = req.body || {};
    const allowed = ['conceptual', 'calculation', 'misreading', 'careless', 'time pressure', 'guessed'];
    if (!b.q || !b.chosenDesc) return res.status(400).json({ error: 'q and chosenDesc required' });
    const messages = [
      { role: 'system', content: 'You classify why a student got an exam question wrong. Reply STRICT JSON only: {"cls": one of ["conceptual","calculation","misreading","careless","time pressure","guessed"], "why": string (max 15 words)}. Choose the single best label.' },
      { role: 'user', content: JSON.stringify({
        question: String(b.q.q || '').slice(0, 500),
        topic: b.q.topic, difficulty: b.q.diff,
        correctAnswer: b.q.kind === 'mcq' ? b.q.choices?.[b.q.answer] : b.q.answer,
        studentAnswer: b.chosenDesc, secondsTaken: Math.round((b.ms || 0) / 1000), estimatedSeconds: b.q.est,
        explanation: String(b.q.exp || '').slice(0, 300),
      }).slice(0, 1800) },
    ];
    try {
      const out = await askStructured(callModel, messages, { hasKey, isCoolingDown, markCooldown }, { preferredProvider: 'gemini', maxModels: 3 });
      if (!out || !allowed.includes(out.cls)) throw new Error('unusable response');
      res.json({ ok: true, cls: out.cls, why: String(out.why || '').slice(0, 120) });
    } catch (e) {
      res.status(502).json({ ok: false, error: String(e.message).slice(0, 140) });
    }
  });
  app.post('/api/mbzuai/generate', requireMbzuaiAccess, async (req, res) => {
    const topic = typeof req.body?.topic === 'string' ? req.body.topic : '';
    if (!TOPICS.some((t) => t.id === topic)) {
      return res.status(400).json({ error: 'Unknown topic.' });
    }
    const difficulty = ['1', '2', '3', 'mixed'].includes(String(req.body?.difficulty))
      ? String(req.body.difficulty)
      : 'mixed';
    try {
      const out = await generateQuestions(
        callModel,
        { topic, difficulty, count: req.body?.count, maxModels: 4 },
        { hasKey, isCoolingDown, markCooldown },
      );
      const stamp = Date.now().toString(36);
      const questions = out.questions.map((q, i) => ({
        ...q,
        id: `gen-${stamp}-${i}`,
        topic,
        source: 'ai',
      }));
      res.json({ ok: true, questions, attempts: out.attempts });
    } catch (e) {
      res.status(503).json({ error: e.message, attempts: e.attempts });
    }
  });
}
