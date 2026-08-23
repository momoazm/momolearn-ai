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

export async function generateQuestions(callModel, { topic, difficulty, count }, helpers = {}) {
  const { hasKey, isCoolingDown, markCooldown } = helpers;
  const n = Math.min(Math.max(Number(count) || 5, 1), 10);
  const diffText =
    difficulty === 'mixed'
      ? 'mix difficulties: some 1 (foundation), some 2 (intermediate), some 3 (advanced)'
      : `all questions difficulty ${Number(difficulty)} (1 foundation, 2 intermediate, 3 advanced)`;

  const messages = [
    {
      role: 'system',
      content:
        'You are an expert exam-item writer for AI-university admissions screening prep ' +
        '(math, logic, programming, data reasoning). You write ORIGINAL questions in the style of ' +
        'undergraduate/graduate screening exams: precise wording, one unambiguous correct answer, ' +
        'plausible distractors, complete worked explanations. You output STRICT JSON only.',
    },
    {
      role: 'user',
      content:
        `Write ${n} original practice questions for topic "${topic}". ${diffText}.\n${SCHEMA_HINT}\n` +
        `For every "kind":"num" question you MUST include "verify" whose expression evaluates exactly to the answer.\n` +
        `Keep every question self-contained and solvable without a calculator.`,
    },
  ];

  const { chain } = fullRoute('reasoning');
  const attempts = [];
  let lastErr = 'no model available';
  for (const entry of chain) {
    if (hasKey && !hasKey(entry.provider)) continue;
    if (isCoolingDown && isCoolingDown(entry.label)) {
      attempts.push({ model: entry.label, status: 'cooldown' });
      continue;
    }
    try {
      const text = await callModel(entry, messages, { temperature: 0.6 });
      attempts.push({ model: entry.label, status: 'ok' });
      const arr = extractJsonArray(text);
      if (!Array.isArray(arr)) { lastErr = `${entry.label}: no JSON array in response`; continue; }
      const valid = [];
      for (const raw of arr.slice(0, n)) {
        const err = validateGeneratedQuestion(raw);
        if (!err) valid.push(raw);
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
