import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerAccountRoutes } from '../lib/accounts.js';
import { registerInterviewRoutes } from '../lib/interview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

registerAccountRoutes(app);
registerInterviewRoutes(app);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, site: 'MBZUAI Interview Coach' });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3100;
  app.listen(PORT, () => {
    console.log(`MBZUAI Interview Coach running on http://localhost:${PORT}`);
  });
}

export default app;
