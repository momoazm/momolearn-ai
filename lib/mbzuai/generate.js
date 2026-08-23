import { fullRoute } from '../router.js';

const SCHEMA_HINT = `Return ONLY a JSON array (no markdown, no commentary).
Each element:
{
  "topic": "<topic id>",
  "sub": "<subtopic>",
  "diff": 1|2|3,
  "skill": "<skill tested>",
  "est": <seconds a student should need>,
  "kind": "mcq" | "num",
  "q": "<question text>",
  "choices": ["a","b","c","d"],
  "answer": <0-3 index for mcq> | <number for num>,
  "exp": "<step-by-step solution>",
  "wrong": {"0":"why choice 0 is wrong", "1":"...", "3":"..."},
  "faster": "<shortcut method>",
  "trap": "<common mistake>",
  "concept": "<core concept>",
  "verify": "<arithmetic expression with digits + - * / ( ) that equals the numeric answer>"
}`;

function safeEval(expr) {
  if (typeof expr !== 'string') return null;
  const cleaned = expr.replace(/\s+/g, '').replace(/\^/g, '**');
  if (!/^[0-9+\-*/().*]+$/.test(cleaned)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict";return (${cleaned})`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function validateGeneratedQuestion(raw) {
  if (!raw || typeof raw !== 'object') return 'not an object';
  for (const f of ['topic', 'sub', 'q', 'exp', 'faster', 'trap', 'concept']) {
    if (typeof raw[f] !== 'string' || !raw[f].trim()) return `missing ${f}`;
  }
  raw.diff = Number(raw.diff);
  if (![1, 2, 3].includes(raw.diff)) return 'bad diff';
  raw.est = Number(raw.est);
  if (!(raw.est >= 20 && raw.est <= 600)) return 'bad est';

  if (raw.kind === 'mcq') {
    if (!Array.isArray(raw.choices) || raw.choices.length !== 4) return 'need 4 choices';
    if (new Set(raw.choices.map((c) => String(c).trim())).size !== 4) return 'duplicate choices';
    const idx = Number(raw.answer);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return 'bad answer index';
    raw.answer = idx;
    if (!raw.wrong || typeof raw.wrong !== 'object') raw.wrong = {};
  } else if (raw.kind === 'num') {
    raw.choices = null;
    raw.answer = Number(raw.answer);
    if (!Number.isFinite(raw.answer)) return 'non-numeric answer';
    raw.wrong = {};
  } else {
    return 'bad kind';
  }

  if (raw.verify != null && raw.kind === 'num') {
    const v = safeEval(String(raw.verify));
    if (v == null || Math.abs(v - Number(raw.answer)) > 1e-6 * Math.max(1, Math.abs(v))) {
      return 'verification failed: expression does not equal stated answer';
    }
  }
  return null;
}

function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function generateQuestions(callModel, opts, helpers = {}) {
  const { hasKey, isCoolingDown, markCooldown } = helpers;
  const { difficulty, avoidTexts = [], maxModels = Infinity, preferredProvider, deadline } = opts;
  const perTopic = Array.isArray(opts.topics)
    ? opts.topics
    : [{ id: opts.topic, count: opts.count ?? 5 }];
  const allowedIds = perTopic.map((t) => t.id);
  const capFor = (id) => perTopic.find((t) => t.id === id)?.count ?? 999;
  const totalWanted = perTopic.reduce((s, t) => s + t.count, 0);
  const n = Math.min(Math.max(totalWanted, 1), 30);
  const diffText =
    difficulty === 'mixed'
      ? 'mix difficulties: some 1 (foundation), some 2 (intermediate), some 3 (advanced)'
      : `all questions difficulty ${Number(difficulty)} (1 foundation, 2 intermediate, 3 advanced)`;
  const topicLine = perTopic.map((t) => `${t.count} question(s) for topic "${t.id}"`).join(', ');
  const avoidBlock = avoidTexts.length
    ? `\nDo NOT repeat or trivially reword these existing questions:\n${avoidTexts.map((t) => `- ${t}`).join('\n')}`
    : '';

  const messages = [
    {
      role: 'system',
      content:
        'You are an expert exam-item writer for MBZUAI (Mohamed Bin Zayed University of Artificial Intelligence, Abu Dhabi) admissions screening preparation. '
        + 'All items MUST fit the official publicly documented MBZUAI screening-exam scope: '
        + 'Math (algebra, functions, probability, statistics, matrices & vectors, calculus, discrete mathematics); '
        + 'Computational Thinking & Logic (logic, pattern recognition, quantitative word problems); '
        + 'Programming Fundamentals (algorithmic problem solving, basic syntax concepts, basic data structures); '
        + 'Data & AI Reasoning (data interpretation, basic machine learning concepts). '
        + 'Write ORIGINAL questions: precise wording, one unambiguous correct answer, plausible distractors, complete worked explanations. '
        + 'You output STRICT JSON only.',
    },
    {
      role: 'user',
      content:
        `Write exactly ${n} original practice questions covering: ${topicLine}.\n${diffText}\n${SCHEMA_HINT}\n` +
        `Each item's "topic" MUST be one of: ${allowedIds.join(', ')} — match the requested per-topic counts exactly.\n` +
        `For every "kind":"num" question you MUST include "verify" whose expression evaluates exactly to the answer.\n` +
        `Keep every question self-contained and solvable without a calculator.${avoidBlock}`,
    },
  ];

  let { chain } = fullRoute('reasoning');
  if (preferredProvider) {
    chain = [...chain.filter((e) => e.provider === preferredProvider), ...chain.filter((e) => e.provider !== preferredProvider)];
  }
  const attempts = [];
  const usedTopicsTally = {};
  let lastErr = 'no model available';
  for (const entry of chain.slice(0, maxModels)) {
    if (deadline && Date.now() > deadline) {
      attempts.push({ status: 'deadline' });
      break;
    }
    if (hasKey && !hasKey(entry.provider)) continue;
    if (isCoolingDown && isCoolingDown(entry.label)) {
      attempts.push({ model: entry.label, status: 'cooldown' });
      continue;
    }
    try {
      let text;
      try {
        text = await callModel(entry, messages, { temperature: 0.7, maxTokens: 6000 });
      } catch (e2) {
        if (e2.status === 400 || e2.status === 413) {
          text = await callModel(entry, messages, { temperature: 0.7 });
        } else if (e2.status === 429) {
          await new Promise((r) => setTimeout(r, 3000));
          text = await callModel(entry, messages, { temperature: 0.7, maxTokens: 6000 });
        } else { throw e2; }
      }
      attempts.push({ model: entry.label, status: 'ok' });
      const arr = extractJsonArray(text);
      if (!Array.isArray(arr)) { lastErr = `${entry.label}: no JSON array in response`; continue; }
      const valid = [];
      for (const raw of arr) {
        if (!allowedIds.includes(raw?.topic)) continue;
        if ((usedTopicsTally[raw.topic] || 0) >= capFor(raw.topic)) continue;
        const err = validateGeneratedQuestion(raw);
        if (!err) {
          valid.push(raw);
          usedTopicsTally[raw.topic] = (usedTopicsTally[raw.topic] || 0) + 1;
        }
      }
      if (valid.length) return { questions: valid, attempts };
      lastErr = `${entry.label}: ${arr.length - valid.length}/${arr.length} items failed validation`;
    } catch (e) {
      const status = e.status ?? (e.name === 'AbortError' ? 408 : 0);
      if (status === 429 || status >= 500 || status === 408 || status === 0) {
        markCooldown?.(entry.label);
      }
      attempts.push({ model: entry.label, status: `fail:${status}` });
      lastErr = `${entry.label}: ${e.message}`;
    }
  }
  throw Object.assign(new Error(`Generation failed. ${lastErr}`), { attempts });
}
