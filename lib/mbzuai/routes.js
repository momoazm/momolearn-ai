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
