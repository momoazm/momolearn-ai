import 'dotenv/config';
process.env.PORT = '0';
import express from 'express';
const { registerMbzuaiRoutes } = await import('../lib/mbzuai/routes.js');
const { callModel, hasKey, isCoolingDown, markCooldown } = await import('../server.js');

const app = express();
app.use(express.json());
registerMbzuaiRoutes(app, { callModel, hasKey, isCoolingDown, markCooldown });

const srv = app.listen(0, async () => {
  const port = srv.address().port;
  const base = `http://localhost:${port}`;
  const { token } = await (await fetch(`${base}/api/mbzuai/access`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'mz-jc5dkt4nxsodd85c724c507' }),
  })).json();
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const coach = await (await fetch(`${base}/api/mbzuai/coach`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ stats: {
      readiness: 42, target: 80, attempted: 58, accuracy: '71%', avgSecondsPerQuestion: 64,
      streakDays: 3, topicMastery: { Algebra: 66, Probability: 31, Programming: 55, Calculus: 20 },
      recentMocks: [48], dueMistakes: 5, daysUntilExam: 21,
    }}),
  })).json();
  console.log('COACH ok=' + coach.ok);
  if (coach.review) {
    console.log('summary:', coach.review.summary?.slice(0, 140));
    console.log('strengths:', JSON.stringify(coach.review.strengths));
    console.log('focus:', JSON.stringify(coach.review.focus));
    console.log('nextStep:', coach.review.nextStep);
  } else console.log('coach error:', coach.error);

  const cls = await (await fetch(`${base}/api/mbzuai/classify-mistake`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      q: { q: 'A fair coin is tossed 3 times. What is P(exactly 2 heads)?', topic: 'probability', diff: 1, kind: 'mcq',
           choices: ['1/8', '1/4', '3/8', '1/2'], answer: 2, est: 60,
           exp: 'C(3,2)/8 = 3/8.' },
      chosenDesc: 'chose "1/2"', ms: 12000,
    }),
  })).json();
  console.log('CLASSIFY ok=' + cls.ok, '->', cls.cls, '|', cls.why);

  srv.close();
  process.exit(0);
});
