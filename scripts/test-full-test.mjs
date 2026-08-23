import 'dotenv/config';
process.env.PORT = '0';
import 'dotenv/config';
import express from 'express';
import { registerMbzuaiRoutes } from '../lib/mbzuai/routes.js';
const { callModel, hasKey, isCoolingDown, markCooldown } = await import('../server.js');

const app = express();
app.use(express.json());
registerMbzuaiRoutes(app, { callModel, hasKey, isCoolingDown, markCooldown });

const srv = app.listen(0, async () => {
  const port = srv.address().port;
  const t0 = Date.now();
  try {
    const a = await fetch(`http://localhost:${port}/api/mbzuai/access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'mz-jc5dkt4nxsodd85c724c507' }),
    });
    const { token } = await a.json();
    const chosen = [];
    for (let bi = 0; bi < 6; bi++) {
      const rr = await fetch(`http://localhost:${port}/api/mbzuai/full-test/${bi}`, { headers: { Authorization: `Bearer ${token}` } });
      const jj = await rr.json().catch(() => ({ ok: false }));
      if (!rr.ok || !jj.ok) { console.log('batch', bi, 'FAIL:', String(jj.error || '').slice(0, 90), '| attempts:', JSON.stringify(jj.attempts || [])); continue; }
      for (const q of jj.questions) { q.id += "-" + bi; chosen.push(q); }
      console.log('batch', bi, jj.genre, '+', jj.questions.length);
    }
    const j = { generated: chosen, tally: chosen.reduce((m, q) => ((m[q.topic] = (m[q.topic] || 0) + 1), m), {}) };
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`elapsed=${secs}s generated=${j.generated.length}/30`);
    console.log('notes:', j.notes.join(' | '));
    console.log('tally:', JSON.stringify(j.tally));
    const want = { algebra: 3, functions: 2, probability: 3, statistics: 2, linear: 2, calculus: 1, discrete: 1, logic: 3, quant: 2, programming: 3, algo: 3, csf: 2, dat: 3 };
    const miss = [];
    for (const k of Object.keys(want)) if ((j.tally[k] || 0) < want[k]) miss.push(`${k} ${(j.tally[k] || 0)}/${want[k]}`);
    console.log(miss.length ? 'shortfalls: ' + miss.join(', ') : 'BLUEPRINT FULLY COVERED BY AI');
    j.generated.slice(0, 6).forEach((q) => console.log(`- [${q.topic}/d${q.diff}] ${q.q.slice(0, 64)}`));
  } catch (e) {
    console.log('ERR', e.message);
  }
  srv.close();
  process.exit(0);
});
