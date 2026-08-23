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
import { generateQuestions } from './generate.js';
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
