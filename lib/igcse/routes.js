import { askStructured } from '../mbzuai/generate.js';

export function registerIgcseRoutes(app, { callModel, hasKey, isCoolingDown, markCooldown }) {
  app.post('/api/igcse/mark', async (req, res) => {
    const b = req.body || {};
    const maxMarks = Math.max(1, Math.min(20, Number(b.maxMarks) || 0));
    const question = typeof b.question === 'string' ? b.question.slice(0, 1200) : '';
    const answer = typeof b.answer === 'string' ? b.answer.slice(0, 3000) : '';
    const scheme = Array.isArray(b.markscheme)
      ? b.markscheme.map((m) => String(m).slice(0, 400)).filter(Boolean).slice(0, 14)
      : [];
    if (!question.trim() || !scheme.length || !answer.trim()) {
      return res.status(400).json({ error: 'question, markscheme[] and answer are required.' });
    }

    const messages = [
      {
        role: 'system',
        content:
          `You are a Cambridge IGCSE examiner marking ONE student answer against its official-style mark scheme. Mark strictly but fairly: award a credit point only if the student's answer genuinely expresses that scientific idea in their own words (equivalent wording is fine; wrong science is not). Never exceed ${maxMarks} total. If the answer is blank, off-topic or nonsense, award 0. Reply with STRICT JSON only and no other text: {"awarded": integer between 0 and ${maxMarks}, "matched": [indices of scheme points credited], "missed": [indices of scheme points NOT credited], "feedback": string of at most 45 words telling the student what earned marks and the single most valuable missing idea}.`,
      },
      {
        role: 'user',
        content: JSON.stringify({ question, maxMarks, markschemePoints: scheme.map((p, i) => `[${i}] ${p}`), studentAnswer: answer }),
      },
    ];

    try {
      const out = await askStructured(callModel, messages, { hasKey, isCoolingDown, markCooldown }, { preferredProvider: 'gemini', maxModels: 5 });
      const awarded = Math.max(0, Math.min(maxMarks, Math.round(Number(out?.awarded ?? -1))));
      if (out == null || Number.isNaN(Number(out?.awarded))) throw new Error('unusable response');
      res.json({
        ok: true,
        awarded,
        maxMarks,
        matched: Array.isArray(out.matched) ? out.matched.map(Number).filter((n) => n >= 0 && n < scheme.length) : [],
        missed: Array.isArray(out.missed) ? out.missed.map(Number).filter((n) => n >= 0 && n < scheme.length) : [],
        feedback: String(out.feedback || '').slice(0, 400),
      });
    } catch (e) {
      res.status(502).json({ ok: false, error: String(e.message).slice(0, 140) });
    }
  });

  app.get('/api/igcse/status', (req, res) => {
    res.json({
      ok: true,
      aiAvailable: Boolean(hasKey('gemini')) || Boolean(hasKey('groq')) || Boolean(hasKey('openrouter')),
    });
  });
}
