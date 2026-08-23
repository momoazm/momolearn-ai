import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerAccountRoutes } from '../lib/accounts.js';
import { registerInterviewRoutes } from '../lib/interview.js';
import { byokMiddleware, runChain } from '../lib/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(byokMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public')));

registerAccountRoutes(app);
registerInterviewRoutes(app);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, site: 'MBZUAI Interview Coach' });
});

app.post('/api/key-test', async (req, res) => {
  try {
    const r = await runChain([{ role: 'user', content: 'Reply with exactly: OK' }], { temperature: 0 });
    res.json({ ok: true, model: r.model });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message).slice(0, 160) });
  }
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3100;
  app.listen(PORT, () => {
    console.log(`MBZUAI Interview Coach running on http://localhost:${PORT}`);
  });
}

export default app;
