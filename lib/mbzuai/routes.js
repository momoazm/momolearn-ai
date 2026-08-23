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
        { topic, difficulty, count: req.body?.count },
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
