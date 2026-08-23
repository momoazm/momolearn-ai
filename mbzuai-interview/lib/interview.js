import { db, dbConfigured } from './db.js';
import { accountForToken, tokenFrom } from './accounts.js';
import { runChain } from './ai.js';

export const INTERVIEW_TYPES = {
  general: {
    label: 'General Interview',
    blurb: 'Balanced academic and personal questions',
    targetQuestions: 8,
    focus: `A balanced admissions conversation: academic background, motivation for AI, why graduate school now, projects, goals, and general fit. Rotate naturally across topics instead of drilling one area.`,
  },
  motivation: {
    label: 'Motivation Interview',
    blurb: 'Why AI? Why MBZUAI? Goals',
    targetQuestions: 7,
    focus: `Why AI, why MBZUAI specifically (a graduate-level AI university in Abu Dhabi, UAE, founded 2019, focused on AI research and its applications - only use publicly known facts), academic goals, career goals, long-term vision, what drives them. Probe whether their motivation is genuine and specific or generic.`,
  },
  technical: {
    label: 'Technical Interview',
    blurb: 'Math, probability, programming, ML',
    targetQuestions: 9,
    focus: `Mathematics, probability, statistics, programming, algorithms, machine learning and AI fundamentals. Calibrate difficulty to the candidate's stated level from their profile and answers. Ask them to reason through problems, not just recite definitions. Include at least one quantitative/probabilistic reasoning question and one coding/algorithms question appropriate to their level.`,
  },
  research: {
    label: 'Research Interview',
    blurb: 'Interests, experience, scientific reasoning',
    targetQuestions: 8,
    focus: `Research interests, past research experience and projects, how they formulate questions, experimental design, reading literature, scientific reasoning, and future research directions. Test whether they think like a researcher: hypotheses, evidence, limitations, next steps.`,
  },
  behavioral: {
    label: 'Behavioral Interview',
    blurb: 'Leadership, teamwork, failure, adaptability',
    targetQuestions: 7,
    focus: `Leadership, teamwork, handling failure, conflict resolution, adaptability, time management under competing deadlines. Demand concrete specific examples (STAR-like structure) and push vague answers toward specifics.`,
  },
  stress: {
    label: 'Stress Interview',
    blurb: 'Pressure, challenges, composure',
    targetQuestions: 8,
    pressure: true,
    focus: `A deliberately challenging interview. Use more frequent probing follow-ups, mild pressure, skepticism about weak claims ("That's quite general", "Suppose that fails - then what?", "What evidence do you have?"). Stay professional and fair - never rude, never personal attacks. The goal is to train composure and analytical thinking under pressure.`,
  },
  full: {
    label: 'Full Mock Interview',
    blurb: 'Complete realistic simulation, all categories',
    targetQuestions: 14,
    mixed: true,
    focus: `A complete realistic admissions interview combining all categories in a natural arc: opening and background, motivation, academic readiness, technical depth, research potential, behavioral, and a closing "do you have questions for us" moment. Move between categories smoothly as a real interviewer would.`,
  },
};

const CORE_PERSONA = `You are an experienced, rigorous graduate-admissions interviewer conducting a practice interview for a student preparing to apply to an AI-focused graduate program such as MBZUAI (Mohamed bin Zayed University of Artificial Intelligence in Abu Dhabi).

RULES:
- Behave like a serious academic interviewer, NOT a chatbot.
- Ask exactly ONE question per turn. Keep questions conversational (under 70 spoken words).
- NEVER reveal scores, evaluations, rubrics, or that you are tracking anything.
- Base follow-ups on what the candidate ACTUALLY said: their words, claims, projects, gaps.
- Challenge weak, vague, or unsupported claims politely but firmly.
- If the candidate contradicts something they said earlier (check CLAIMS LEDGER), politely point it out and ask them to clarify, quoting their earlier statement.
- Do not lecture or teach during the interview. Do not answer your own question.
- Only use publicly available information about MBZUAI; never claim insider knowledge of its confidential admission procedures.
- If an answer is already strong and fully explored, move the interview forward with a fresh question rather than over-probing.`;

function profileBlock(profile) {
  if (!profile) return 'No profile provided yet.';
  const p = profile;
  const lines = [
    p.academicBackground && `Academic background: ${p.academicBackground}`,
    p.degree && `Degree/Major: ${p.degree}`,
    p.programming && `Programming experience: ${p.programming}`,
    p.aiMlExperience && `AI/ML experience: ${p.aiMlExperience}`,
    p.projects && `Projects: ${p.projects}`,
    p.research && `Research experience: ${p.research}`,
    p.internships && `Internships: ${p.internships}`,
    p.competitions && `Competitions: ${p.competitions}`,
    p.publications && `Publications: ${p.publications}`,
    p.researchInterests && `Research interests: ${p.researchInterests}`,
    p.careerGoals && `Career goals: ${p.careerGoals}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : 'Profile is empty.';
}

function stateBlock(state) {
  const s = state || {};
  const claims = (s.claims || []).slice(-15).map((c) => `- [${c.topic}] ${String(c.text).slice(0, 160)}`).join('\n');
  const asked = (s.asked || []).slice(-10).map((q) => `- ${String(q).slice(0, 120)}`).join('\n');
  const cats = Object.entries(s.categories || {}).map(([k, v]) => `${k}: avg ${(v.sum / Math.max(v.n, 1)).toFixed(1)} (${v.n} answers)`).join(', ');
  return [
    `Questions asked so far: ${s.qCount ?? 0} of target ${s.targetQs ?? 8}.`,
    cats ? `Running performance by category: ${cats}` : '',
    s.digest ? `Summary of the interview so far:\n${String(s.digest).slice(0, 1200)}` : '',
    asked ? `Recent questions you asked (do NOT repeat these):\n${asked}` : '',
    claims ? `CLAIMS LEDGER (statements the candidate made earlier):\n${claims}` : '',
  ].filter(Boolean).join('\n\n');
}

function recentTurns(turns = [], n = 3) {
  return turns.slice(-n).map((t, i) => `[Turn ${t.qCount ?? i}] INTERVIEWER: ${t.question}\nCANDIDATE: ${t.answer}`).join('\n\n');
}

const EVAL_DIMS = ['relevance', 'accuracy', 'depth', 'specificity', 'structure', 'communication', 'confidence', 'criticalThinking', 'authenticity', 'technicalUnderstanding'];

const TURN_SCHEMA = `Respond with ONLY a valid JSON object (no markdown fences, no commentary):
{
  "digest": "one short paragraph updating your running summary of this interview so far",
  "newClaims": [{"topic": "short topic tag e.g. project-x|ml-experience|career-goal", "text": "exact notable claim the candidate just made"}],
  "contradiction": null or {"earlierClaim": "...", "note": "how the new statement conflicts"},
  "scores": {${EVAL_DIMS.map((d) => `"${d}": <0-10>`).join(', ')}},
  "turnScore": <0-10 overall for THIS answer>,
  "flags": ["generic"|"memorized-sounding"|"unsupported-claim"|"technical-error"|"too-short"|"too-long"|"poor-structure"|"off-topic"],
  "decision": {"kind": "followup"|"advance", "reason": "why"},
  "question": "your single next question (the follow-up OR the next topic question)",
  "finish": false
}
Decision policy: choose "followup" when the answer was vague, contains an interesting/unsupported claim worth probing, contains a possible contradiction, has a technical gap, or when a deeper probe trains the candidate better. Choose "advance" when the point is exhausted or you have enough on this topic. Set "finish": true only when the target number of questions is reached AND the current thread is complete.`;

function buildTurnMessages({ config, profile, state, history, question, answer, meta, focus }) {
  const hasVoiceMeta = meta && typeof meta.durationSec === 'number' && typeof meta.words === 'number';
  const system = [
    CORE_PERSONA,
    `\nINTERVIEW TYPE: ${config.label}\n${config.focus}`,
    focus ? `\nSPECIAL FOCUS FOR THIS SESSION (weave in naturally): ${focus}` : '',
    config.pressure ? '\nThis is a STRESS-mode interview: apply noticeably more pressure through skeptical probing while remaining professional.' : '',
    `\nCANDIDATE PROFILE:\n${profileBlock(profile)}`,
    `\nINTERVIEW STATE:\n${stateBlock(state)}`,
    hasVoiceMeta ? `\nDELIVERY METRICS for the latest answer (from optional voice mode): spoke ~${meta.words} words in ${Math.round(meta.durationSec)}s (${meta.wpm} wpm), filler words detected: ${meta.fillers}. Consider communication quality factually; do NOT draw psychological conclusions beyond delivery habits.` : '',
    `\n${TURN_SCHEMA}`,
  ].filter(Boolean).join('\n');

  const user = [
    history?.length ? `RECENT EXCHANGES:\n${recentTurns(history)}` : 'This is the first question of the interview.',
    `\nYOUR LAST QUESTION: ${question}`,
    `\nCANDIDATE'S ANSWER:\n${String(answer).slice(0, 4000)}`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function extractJSON(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.indexOf('{');
  if (start === -1) throw new Error('no json found');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(t.slice(start, i + 1));
        } catch {}
        break;
      }
    }
  }
  try {
    return JSON.parse(t.slice(start));
  } catch {
    throw new Error('unparseable json');
  }
}

async function callStructured(messages, temperature = 0.4) {
  const { content, model } = await runChain(messages, { temperature });
  return { data: extractJSON(content), model };
}

const clamp10 = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v * 10) / 10)) : null;
};
const pct = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.min(100, Math.round(Number(n)))) : 0);

function updateCategories(cats, category, score) {
  const c = { ...(cats || {}) };
  const cat = category || 'general';
  if (typeof score !== 'number' || Number.isNaN(score)) return c;
  if (!c[cat]) c[cat] = { sum: 0, n: 0 };
  c[cat] = { sum: c[cat].sum + clamp10(score), n: c[cat].n + 1 };
  return c;
}

function sanitizeScores(scores) {
  const out = {};
  for (const d of EVAL_DIMS) out[d] = clamp10(scores?.[d]);
  return out;
}

function normalizeReport(r) {
  return {
    overall: pct(r.overall),
    categories: r.categories && typeof r.categories === 'object' ? r.categories : {},
    summary: String(r.summary || ''),
    strongestAnswers: Array.isArray(r.strongestAnswers) ? r.strongestAnswers : [],
    weakestAnswers: Array.isArray(r.weakestAnswers) ? r.weakestAnswers : [],
    redFlags: Array.isArray(r.redFlags) ? r.redFlags : [],
    improvementPlan: Array.isArray(r.improvementPlan) ? r.improvementPlan : [],
    voiceNotes: String(r.voiceNotes || ''),
    practiceRecommendation: r.practiceRecommendation && INTERVIEW_TYPES[r.practiceRecommendation.type]
      ? r.practiceRecommendation
      : { type: 'general', focus: '', reason: '' },
  };
}

async function authedAccount(req, res) {
  if (!dbConfigured()) {
    res.status(503).json({ error: 'Database not configured.' });
    return null;
  }
  const token = tokenFrom(req);
  if (!token) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  try {
    const account = await accountForToken(token);
    if (!account) {
      res.status(401).json({ error: 'Not signed in.' });
      return null;
    }
    return account;
  } catch (e) {
    res.status(500).json({ error: e.message });
    return null;
  }
}

const dailyLimit = () => Math.max(1, Number(process.env.MBZUAI_DAILY_LIMIT) || 15);

async function usedToday(accountId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = await db.select('interviews', {
    account_id: `eq.${accountId}`,
    created_at: `gte.${since}`,
    select: 'id',
  });
  return rows?.length || 0;
}

export function registerInterviewRoutes(app) {
  app.get('/api/config', (req, res) => {
    res.json({ dailyLimit: dailyLimit() });
  });

  app.post('/api/interview/start', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    const type = INTERVIEW_TYPES[req.body.type] ? req.body.type : 'general';
    const config = INTERVIEW_TYPES[type];
    const profile = req.body.profile || null;
    const focus = typeof req.body.focus === 'string' ? req.body.focus.slice(0, 500) : '';
    const targetQuestions = Math.min(Number(req.body.targetQuestions) || config.targetQuestions, 20);

    try {
      const used = await usedToday(account.id);
      if (used >= dailyLimit()) {
        return res.status(429).json({ error: `Daily limit reached (${dailyLimit()} interviews per day).` });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    const messages = [
      {
        role: 'system',
        content: [
          CORE_PERSONA,
          `\nINTERVIEW TYPE: ${config.label}\n${config.focus}`,
          focus ? `\nSPECIAL FOCUS FOR THIS SESSION (weave in naturally): ${focus}` : '',
          `\nCANDIDATE PROFILE:\n${profileBlock(profile)}`,
          `\nOpen the interview naturally: greet briefly in one sentence, then ask your first question. The first question should fit the type${
            type === 'full' ? ' - start with a warm open question about their background and journey into AI' : ''
          }. Do not interrogate about data already richly covered in the profile; build on it.`,
          `\nRespond with ONLY valid JSON:
{"intro": "<one-sentence greeting>", "question": "<first question>", "category": "<motivation|academic|technical|research|behavioral>"}`,
        ].join('\n'),
      },
      { role: 'user', content: 'Begin the interview.' },
    ];

    try {
      const { data, model } = await callStructured(messages, 0.7);
      const state = {
        qCount: 1,
        targetQs: targetQuestions,
        digest: `Interview opened (${config.label}). First question asked about: ${String(data.category || 'background')}.`,
        claims: [],
        categories: {},
        asked: [data.question],
        flags: [],
      };
      res.json({
        ok: true,
        interviewId: `iv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        type,
        intro: data.intro || "Hello, let's begin.",
        question: data.question,
        category: data.category || 'general',
        state,
        answeredBy: model,
      });
    } catch (e) {
      res.status(503).json({ error: e.message, attempts: e.attempts });
    }
  });

  app.post('/api/interview/answer', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    const { type, question, answer } = req.body;
    if (!question || !answer || !String(answer).trim()) {
      return res.status(400).json({ error: 'question and answer required' });
    }
    const config = INTERVIEW_TYPES[type] || INTERVIEW_TYPES.general;
    const profile = req.body.profile || null;
    const state = req.body.state || {};
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-6) : [];
    const meta = req.body.meta || null;

    try {
      const { data, model } = await callStructured(buildTurnMessages({ config, profile, state, history, question, answer, meta }), 0.55);

      const newState = {
        qCount: (state.qCount || 1) + 1,
        targetQs: state.targetQs || config.targetQuestions,
        digest: String(data.digest || state.digest || '').slice(0, 1500),
        claims: [...(state.claims || []), ...(Array.isArray(data.newClaims) ? data.newClaims.slice(0, 3) : [])].slice(-25),
        categories: updateCategories(state.categories, data.category || (type === 'technical' ? 'technical' : 'general'), data.turnScore),
        asked: [...(state.asked || []), data.question].filter(Boolean).slice(-20),
        flags: [...(state.flags || []), ...(Array.isArray(data.flags) ? data.flags : [])].slice(-30),
      };

      const done = newState.qCount > newState.targetQs || data.finish === true;

      res.json({
        ok: true,
        analysis: {
          scores: sanitizeScores(data.scores),
          turnScore: clamp10(data.turnScore),
          flags: Array.isArray(data.flags) ? data.flags : [],
          contradiction: data.contradiction || null,
          decision: data.decision || { kind: 'advance', reason: '' },
          question: done ? null : data.question,
        },
        nextQuestion: done ? null : data.question,
        done,
        progress: { q: Math.min(newState.qCount, newState.targetQs), target: newState.targetQs },
        state: newState,
        answeredBy: model,
      });
    } catch (e) {
      res.status(503).json({ error: e.message, attempts: e.attempts });
    }
  });

  app.post('/api/interview/report', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    const transcript = Array.isArray(req.body.transcript) ? req.body.transcript : [];
    if (!transcript.length) return res.status(400).json({ error: 'transcript required' });
    const config = INTERVIEW_TYPES[req.body.type] || INTERVIEW_TYPES.general;
    const profile = req.body.profile || null;
    const state = req.body.state || {};
    const durationSec = Number(req.body.durationSec) || 0;

    const convo = transcript.map((t, i) =>
      [
        `Q${i + 1}${t.category ? ` (${t.category})` : ''}: ${t.question}`,
        `A${i + 1}: ${String(t.answer).slice(0, 2500)}`,
        t.meta && typeof t.meta.durationSec === 'number' ? `[delivery: ~${t.meta.words} words, ${Math.round(t.meta.durationSec)}s, ${t.meta.wpm} wpm, ${t.meta.fillers} fillers]` : '',
        t.analysis?.turnScore != null ? `[internal turn score: ${t.analysis.turnScore}/10]` : '',
      ].filter(Boolean).join('\n')
    ).join('\n\n');

    const messages = [
      {
        role: 'system',
        content: `You are a senior admissions coach evaluating a completed PRACTICE ${config.label} for a student preparing for AI-graduate-program interviews (e.g., MBZUAI-style). You previously acted as the interviewer. Now produce a detailed, honest, constructive assessment.

CANDIDATE PROFILE:
${profileBlock(profile)}

FULL TRANSCRIPT (with internal per-answer scores):
${convo.slice(0, 22000)}

Guidelines:
- Be honest and specific; quote the candidate's own words when explaining strengths or problems.
- Red flag types to detect: generic answers, memorized-sounding delivery, unsupported claims, technical inaccuracies, self-contradictions, lack of program-specific motivation, excessive verbosity, very short answers, poor structure.
- Improvement exercises must be concrete and actionable (e.g., "prepare three genuine reasons for choosing this university and connect each to a specific research goal").
- Recommend ONE follow-up practice session: pick the interview type that targets their weakest area.

Respond with ONLY valid JSON:
{
  "overall": <0-100>,
  "categories": {"motivation": <0-100>, "academicReadiness": <0-100>, "technicalKnowledge": <0-100>, "researchPotential": <0-100>, "problemSolving": <0-100>, "criticalThinking": <0-100>, "communication": <0-100>, "confidence": <0-100>, "specificity": <0-100>, "authenticity": <0-100>},
  "summary": "<2-4 sentence executive summary>",
  "strongestAnswers": [{"index": <transcript Q number>, "whatWorked": "<why it worked>"}],
  "weakestAnswers": [{"index": <transcript Q number>, "issue": "<what went wrong>", "improvement": "<how to fix>"}],
  "redFlags": [{"type": "<type>", "evidence": "<quote or description>", "severity": "low"|"medium"|"high"}],
  "improvementPlan": [{"area": "<area>", "exercise": "<specific exercise>"}],
  "voiceNotes": "<factual observations about pace/filler/duration if delivery metrics present, else empty string>",
  "practiceRecommendation": {"type": "${Object.keys(INTERVIEW_TYPES).join('|')}", "focus": "<specific topics to drill>", "reason": "<why>"}
}`,
      },
      { role: 'user', content: `Produce the final report now. Interview duration: ${Math.round(durationSec / 60)} minutes.` },
    ];

    try {
      const { data, model } = await callStructured(messages, 0.3);
      const report = normalizeReport(data);

      try {
        await db.insert('interviews', {
          account_id: account.id,
          type: req.body.type || 'general',
          overall: report.overall,
          report,
          transcript: transcript.slice(0, 40),
          duration_sec: Math.round(durationSec),
        });
      } catch {}

      res.json({ ok: true, report, answeredBy: model });
    } catch (e) {
      res.status(503).json({ error: e.message, attempts: e.attempts });
    }
  });

  app.post('/api/interview/coach', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'question and answer required' });
    const profile = req.body.profile || null;

    const messages = [
      {
        role: 'system',
        content: `You are an interview coach helping a student improve ONE answer from their practice graduate-AI-program interview (e.g., MBZUAI preparation).

CANDIDATE PROFILE:
${profileBlock(profile)}

QUESTION: ${question}

STUDENT'S ANSWER:
${String(answer).slice(0, 3000)}

Teach the student how to CONSTRUCT their own authentic answer - never encourage memorizing scripts. Show a strong example clearly labeled as illustrative, and emphasize they should replace details with their own truth.

Respond with ONLY valid JSON:
{
  "problems": ["<specific problem with the original answer>"],
  "missing": ["<information or angle the answer lacked>"],
  "betterStructure": "<a reusable skeleton/framework tailored to this question, e.g. 'Context -> Action -> Numbers -> Reflection'>",
  "exampleAnswer": "<an illustrative strong answer using placeholder specifics>",
  "newSimilarQuestion": "<a related but different question to practice the same skill>",
  "authenticityNote": "<one sentence reminding them what only THEY can honestly say>"
}`,
      },
      { role: 'user', content: 'Coach this answer.' },
    ];

    try {
      const { data, model } = await callStructured(messages, 0.4);
      res.json({ ok: true, coaching: data, answeredBy: model });
    } catch (e) {
      res.status(503).json({ error: e.message, attempts: e.attempts });
    }
  });

  app.get('/api/profile', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    try {
      const rows = await db.select('interview_profiles', { account_id: `eq.${account.id}`, limit: '1' });
      res.json({ ok: true, profile: rows?.[0]?.data || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/profile', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object required' });
    try {
      await db.upsert('interview_profiles', { account_id: account.id, data, updated_at: new Date().toISOString() }, 'account_id');
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/interviews', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    try {
      if (req.query.id) {
        const rows = await db.select('interviews', {
          account_id: `eq.${account.id}`,
          id: `eq.${req.query.id}`,
          limit: '1',
        });
        if (!rows?.length) return res.status(404).json({ error: 'Not found.' });
        return res.json({ ok: true, interview: rows[0] });
      }
      const rows = await db.select('interviews', {
        account_id: `eq.${account.id}`,
        order: 'created_at.desc',
        limit: '50',
        select: 'id,type,overall,report,duration_sec,created_at',
      });
      res.json({ ok: true, interviews: rows || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/usage', async (req, res) => {
    const account = await authedAccount(req, res);
    if (!account) return;
    try {
      res.json({ ok: true, used: await usedToday(account.id), limit: dailyLimit() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

