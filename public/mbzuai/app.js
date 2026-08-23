import {
  getState, save, resetProgress, currentStreak, markStreak, bumpAi, AI_LIMITS,
} from './store.js';
import {
  applyAnswer, setMistakeClass, readiness, rollingAccuracy, weakestTopics, strongestTopics,
  dueMistakeIds, pickQuestion, recommendNext, buildPlan, classifyDefault, masteryFor,
  carelessScore, avgSpeedRatio,
} from './engine.js';

const root = document.getElementById('mbzuaiView');
const chatApp = document.querySelector('.app');
let bank = null;
let bankById = {};
let topics = [];
let diagConfig = { minutes: 40, secondsPerQuestion: 90 };
let mockConfig = { count: 30, minutes: 45 };
let diagnosticIds = [];
let session = null;
let tickTimer = null;
let tutorCtxQ = null;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

async function api(path, opts = {}) {
  const s = getState();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (s.token) headers.Authorization = `Bearer ${s.token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 503) throw Object.assign(new Error(data.error || 'Locked'), { status: res.status, data });
  if (!res.ok && !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function ensureBank(force = false) {
  if (bank && !force) return bank;
  const data = await api('/api/mbzuai/bank');
  topics = data.topics;
  window.__mbkTopics = topics;
  const all = [...data.questions];
  const stored = getState();
  for (const gq of stored.genPool) {
    if (!all.some((x) => x.id === gq.id)) all.push(gq);
  }
  bank = all;
  bankById = Object.fromEntries(all.map((q) => [q.id, q]));
  window.__mbkById = bankById;
  diagConfig = data.diagnostic;
  mockConfig = data.mock;
  diagnosticIds = data.diagnosticIds;
  return bank;
}

function stopTick() {
  clearInterval(tickTimer);
  tickTimer = null;
}

export function showMbzuai(on) {
  chatApp.classList.toggle('hidden-app', on);
  root.hidden = !on;
  if (on) boot();
  else stopTick();
}

async function boot() {
  stopTick();
  if (!getState().token) {
    renderGate();
    return;
  }
  root.replaceChildren(h('div', { class: 'mz-loading' }, 'Loading MBZUAI Prep…'));
  try {
    await ensureBank();
    renderDashboard();
  } catch (e) {
    if (e.status === 401 || e.status === 503) renderGate(e);
    else renderError(e);
  }
}

function renderError(e) {
  root.replaceChildren(
    h('div', { class: 'mz-card mz-center' },
      h('h2', {}, 'Something went wrong'),
      h('p', { class: 'mz-muted' }, e.message),
      h('button', { class: 'btn primary', onclick: boot }, 'Retry'),
    ),
  );
}

function renderGate(err) {
  root.replaceChildren(
    h('div', { class: 'mz-gate' },
      h('div', { class: 'mz-card mz-center' },
        h('div', { class: 'mz-lock' }, '🔒'),
        h('h2', {}, 'MBZUAI Prep'),
        h('p', { class: 'mz-muted' },
          err?.message?.includes('not configured')
            ? 'This feature is locked on the server. The owner must set MBZUAI_ACCESS_CODE.'
            : 'Owner access only (private beta). Enter your access code to unlock.'),
        (() => {
          const input = h('input', { type: 'password', placeholder: 'Access code', id: 'gateCode' });
          const msg = h('div', { class: 'mz-error', hidden: true });
          const form = h('form', {
            onsubmit: async (ev) => {
              ev.preventDefault();
              msg.hidden = true;
              try {
                const r = await fetch('/api/mbzuai/access', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code: input.value }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || 'Invalid code');
                const st = getState();
                st.token = data.token;
                save();
                Notify.push({ title: 'MBZUAI Prep unlocked', body: 'Owner access granted.' });
                boot();
              } catch (e2) {
                msg.textContent = e2.message;
                msg.hidden = false;
              }
            },
          }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Unlock'), msg);
          return form;
        })(),
        h('p', { class: 'mz-foot' }, 'Independent practice tool. Not affiliated with MBZUAI; contains no official exam content.'),
      ),
    ),
  );
}

function topNav(active) {
  const items = [
    ['dash', 'Dashboard'],
    ['practice', 'Practice'],
    ['mock', 'Mock Exam'],
    ['mistakes', `Mistakes${dueMistakeCount() ? ` (${dueMistakeCount()})` : ''}`],
    ['plan', 'Study Plan'],
    ['progress', 'Progress'],
  ];
  return h('nav', { class: 'mz-nav' },
    items.map(([key, label]) =>
      h('button', {
        class: `mz-navlink${active === key ? ' active' : ''}`,
        onclick: () => ({ dash: renderDashboard, practice: renderPracticeSetup, mock: renderMockIntro, mistakes: renderMistakes, plan: renderPlan, progress: renderProgress }[key]()),
      }, label)),
  );
}

function dueMistakeCount() {
  return dueMistakeIds().length;
}

function renderDashboard() {
  stopTick();
  const s = getState();
  const ready = readiness();
  const target = s.settings.targetScore || 80;
  const acc = s.totals.attempted ? Math.round((s.totals.correct / s.totals.attempted) * 100) : null;
  const avgSec = s.totals.attempted ? Math.round(s.totals.timeMs / s.totals.attempted / 1000) : null;
  const rec = recommendNext();
  const strong = strongestTopics(3).filter((t) => t.seen > 0);
  const weak = weakestTopics(3).filter((t) => t.seen > 0);
  const lastMocks = s.mocks.slice(-5);

  const ring = h('div', { class: 'ring-wrap' },
    h('svg', { viewBox: '0 0 120 120', class: 'ring' },
      h('circle', { cx: 60, cy: 60, r: 52, class: 'ring-bg' }),
      h('circle', { cx: 60, cy: 60, r: 52, class: 'ring-fg', 'stroke-dasharray': `${(ready / 100) * 327} 327` }),
    ),
    h('div', { class: 'ring-label' }, h('strong', {}, `${ready}%`), h('span', {}, 'readiness')),
  );

  root.replaceChildren(
    topNav('dash'),
    h('div', { class: 'mz-grid' },
      h('div', { class: 'mz-card span2' },
        h('div', { class: 'row' }, ring,
          h('div', {},
            h('h2', {}, 'Overall readiness'),
            h('div', { class: 'mz-kv' }, `Preparation score: ${ready}% · Target: ${target}%`),
            h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, ready)}%` })),
            h('div', { class: 'mz-kv sub' }, s.onboarded ? '' : 'Take the diagnostic assessment to calibrate your plan.'),
          )),
        !s.onboarded && h('button', { class: 'btn primary big', onclick: renderDiagIntro }, 'Start Diagnostic Assessment'),
      ),
      statCard('Questions completed', s.totals.attempted),
      statCard('Accuracy', acc == null ? '—' : `${acc}%`),
      statCard('Avg solving time', avgSec == null ? '—' : `${avgSec}s`),
      statCard('Study streak', `${currentStreak()} day${currentStreak() === 1 ? '' : 's'}`),
      h('div', { class: 'mz-card rec' },
        h('div', { class: 'tag' }, 'Recommended next'),
        h('h3', {}, rec.label),
        h('p', { class: 'mz-muted' }, rec.why),
        h('button', { class: 'btn primary', onclick: () => runRecommendation(rec.key) }, 'Go'),
      ),
      listCard('Strongest topics', strong.map((t) => [t.name, `${t.m}%`])),
      listCard('Weakest topics', weak.map((t) => [t.name, `${t.m}%`])),
      h('div', { class: 'mz-card' },
        h('h3', {}, 'Recent practice'),
        s.recent.length === 0 ? h('p', { class: 'mz-muted' }, 'Nothing yet.') :
          h('ul', { class: 'mz-list' }, s.recent.slice(0, 6).map((r) => {
            const q = bankById[r.id];
            return h('li', {}, h('span', { class: r.correct ? 'ok' : 'bad' }, r.correct ? '✓' : '✗'), ` ${q ? q.sub : r.id}`, h('span', { class: 'mz-muted' }, ` · ${(r.ms / 1000).toFixed(0)}s`));
          }))),
      h('div', { class: 'mz-card' },
        h('h3', {}, 'Mock exams'),
        lastMocks.length === 0 ? h('p', { class: 'mz-muted' }, 'No mocks yet.') :
          h('ul', { class: 'mz-list' }, lastMocks.map((m) =>
            h('li', {}, `${m.pct}% · ${new Date(m.at).toLocaleDateString()}`, h('span', { class: 'mz-muted' }, ` · ${m.correct}/${m.total}`)))),
        h('button', { class: 'btn ghost', onclick: renderMockIntro }, 'New mock exam'),
      ),
    ),
    disclaimer(),
  );
}

function statCard(label, value) {
  return h('div', { class: 'mz-card stat' }, h('div', { class: 'num' }, String(value)), h('div', { class: 'lbl' }, label));
}

function listCard(title, pairs) {
  return h('div', { class: 'mz-card' },
    h('h3', {}, title),
    pairs.length === 0 ? h('p', { class: 'mz-muted' }, 'Complete some practice first.') :
      h('ul', { class: 'mz-list' }, pairs.map(([n, v]) => h('li', {}, `${n} `, h('span', { class: 'mz-muted' }, v)))),
  );
}

function runRecommendation(key) {
  if (key === 'diagnostic') return renderDiagIntro();
  if (key === 'redo') return startSession({ mode: 'redo', ids: dueMistakeIds(), length: Math.min(dueMistakeIds().length, 10) });
  return startSession({ mode: key === 'timed' ? 'timed' : key, length: 10 });
}

function disclaimer() {
  return h('p', { class: 'mz-disclaimer' },
    'Scope grounded in publicly documented MBZUAI screening-exam topics (mbzuai.ac.ae admission pages). All questions are original MomoLearn practice material — no official or confidential MBZUAI questions. Scores are estimates for guidance only.');
}

const MODES = {
  practice: { label: 'Practice', desc: 'Adaptive mix with full explanations and hints.', icon: '🧠' },
  weakness: { label: 'Weakness Practice', desc: 'Questions targeting your three weakest areas.', icon: '🎯' },
  timed: { label: 'Timed Drill', desc: 'Strict per-question clock based on target solving time.', icon: '⏱️' },
  speed: { label: 'Speed Training', desc: 'Short questions, aggressive time limits.', icon: '⚡' },
  challenge: { label: 'Challenge', desc: 'Advanced-difficulty questions only.', icon: '🔥' },
};

function renderPracticeSetup() {
  stopTick();
  const s = getState();
  const genPanel = h('div', { class: 'mz-card' },
    h('h3', {}, 'AI question generator'),
    h('p', { class: 'mz-muted' }, `Generate fresh validated questions with your existing AI chain. Daily allowance: ${s.aiUsage.gen}/${AI_LIMITS.gen}.`),
    (() => {
      const sel = h('select', {}, topics.map((t) => h('option', { value: t.id }, t.name)));
      const diff = h('select', {},
        h('option', { value: 'mixed' }, 'Mixed difficulty'),
        h('option', { value: '1' }, 'Foundation'),
        h('option', { value: '2' }, 'Intermediate'),
        h('option', { value: '3' }, 'Advanced'));
      const out = h('div', {});
      const btn = h('button', {
        class: 'btn primary',
        onclick: async () => {
          btn.disabled = true;
          btn.textContent = 'Generating…';
          try {
            const st = getState();
            if (st.aiUsage.gen >= AI_LIMITS.gen) throw new Error(`Daily AI generation limit reached (${AI_LIMITS.gen}/day).`);
            const data = await api('/api/mbzuai/generate', {
              method: 'POST',
              body: JSON.stringify({ topic: sel.value, difficulty: diff.value, count: 5 }),
            });
            bumpAi('gen');
            st.genPool.push(...data.questions);
            for (const q of data.questions) {
              bank.push(q);
              bankById[q.id] = q;
            }
            save();
            out.replaceChildren(
              h('p', {}, `${data.questions.length} validated questions added.`),
              h('button', { class: 'btn primary', onclick: () => startSession({ mode: 'practice', ids: data.questions.map((q) => q.id), length: data.questions.length }) }, 'Practice these now'),
            );
          } catch (e) {
            out.replaceChildren(h('p', { class: 'mz-error' }, e.message));
          } finally {
            btn.disabled = false;
            btn.textContent = 'Generate 5 questions';
          }
        },
      }, 'Generate 5 questions');
      return h('div', { class: 'col' }, h('div', { class: 'row gap wrap' }, sel, diff, btn), out);
    })(),
  );

  root.replaceChildren(
    topNav('practice'),
    h('div', { class: 'mode-grid' },
      Object.entries(MODES).map(([key, m]) =>
        h('button', { class: 'mz-card mode', onclick: () => startSession({ mode: key, length: 10 }) },
          h('div', { class: 'icon' }, m.icon),
          h('h3', {}, m.label),
          h('p', { class: 'mz-muted' }, m.desc))),
      h('button', { class: 'mz-card mode accent', onclick: renderDiagIntro },
        h('div', { class: 'icon' }, '🩺'),
        h('h3', {}, 'Diagnostic Assessment'),
        h('p', { class: 'mz-muted' }, '26 questions across every exam area. Retake anytime to recalibrate.')),
    ),
    genPanel,
  );
}

function renderDiagIntro() {
  root.replaceChildren(
    topNav('practice'),
    h('div', { class: 'mz-card mz-narrow' },
      h('h2', {}, 'Diagnostic Assessment'),
      h('p', {}, `26 questions across all publicly documented MBZUAI screening areas: math (algebra, functions, probability, statistics, matrices, calculus, discrete math), logic & patterns, quantitative reasoning, programming, algorithms, CS fundamentals, and data/AI reasoning.`),
      h('p', { class: 'mz-muted' }, `${diagConfig.minutes} minute cap · ${diagConfig.secondsPerQuestion}s soft limit per question · hints off · results generate your personalized study plan.`),
      h('button', { class: 'btn primary big', onclick: () => startSession({ mode: 'diagnostic' }) }, 'Begin'),
    ),
  );
}

function renderMockIntro() {
  root.replaceChildren(
    topNav('mock'),
    h('div', { class: 'mz-card mz-narrow' },
      h('h2', {}, 'Mock Exam'),
      h('p', {}, `${mockConfig.count} mixed questions · ${mockConfig.minutes} minutes · randomized topics & difficulty mirroring the public syllabus spread.`),
      h('ul', { class: 'mz-rules' },
        h('li', {}, 'No hints during the exam'),
        h('li', {}, 'Flag questions to revisit'),
        h('li', {}, 'Auto-submit when time expires'),
        h('li', {}, 'Detailed analysis afterwards')),
      h('button', { class: 'btn primary big', onclick: () => startSession({ mode: 'mock' }) }, 'Start Mock Exam'),
    ),
  );
}

function startSession(cfg) {
  const s = getState();
  let queue = [];
  if (cfg.mode === 'diagnostic') {
    queue = diagnosticIds.map((id) => bankById[id]).filter(Boolean);
  } else if (cfg.mode === 'mock') {
    queue = sampleMock();
  } else if (cfg.ids) {
    queue = cfg.ids.map((id) => bankById[id]).filter(Boolean);
  } else {
    for (let i = 0; i < (cfg.length || 10); i++) {
      const opts = cfg.mode === 'weakness' ? { topics: weakestTopics(3).map((t) => t.id) } : {};
      if (cfg.mode === 'challenge') opts.minDiff = 3;
      queue.push(pickQuestion(bank, cfg.mode, opts));
    }
  }
  if (!queue.length) {
    Notify.push({ kind: 'warn', title: 'Nothing to practice', body: 'No questions matched this mode yet.' });
    return;
  }

  session = {
    mode: cfg.mode,
    queue,
    idx: 0,
    answers: [],
    startedAt: Date.now(),
    qStartedAt: Date.now(),
    limitPerQMs: null,
    flags: new Set(),
    hintLevel: 0,
    usedHint: false,
  };
  if (cfg.mode === 'timed') session.limitPerQMs = 90_000;
  if (cfg.mode === 'speed') session.limitPerQMs = 45_000;
  if (cfg.mode === 'diagnostic') session.limitPerQMs = diagConfig.secondsPerQuestion * 1000;
  if (cfg.mode === 'mock') {
    session.totalLimitMs = mockConfig.minutes * 60_000;
    session.limitPerQMs = null;
  }
  if (cfg.mode !== 'mock') markStreak();
  renderQuestion();
}

function sampleMock() {
  const byTopic = new Map(topics.map((t) => [t.id, []]));
  for (const q of bank) {
    if (byTopic.has(q.topic)) byTopic.get(q.topic).push(q);
  }
  const picked = [];
  let guard = 0;
  while (picked.length < mockConfig.count && guard++ < 500) {
    for (const t of topics) {
      if (picked.length >= mockConfig.count) break;
      const pool = byTopic.get(t.id).filter((q) => !picked.includes(q));
      if (pool.length) picked.push(pool[Math.floor(Math.random() * pool.length)]);
    }
  }
  return picked.sort(() => Math.random() - 0.5);
}

function renderQuestion() {
  stopTick();
  const q = session.queue[session.idx];
  const isExamLike = session.mode === 'mock' || session.mode === 'diagnostic';
  const answered = session.answers[session.idx];

  const header = h('header', { class: 'sess-head' },
    h('button', { class: 'btn ghost', onclick: confirmExit }, 'Exit'),
    h('div', { class: 'prog' },
      h('div', { class: 'prog-bar' }, h('i', { style: `width:${Math.round(((session.idx + (answered ? 1 : 0)) / session.queue.length) * 100)}%` })),
      h('span', {}, `Question ${session.idx + 1} of ${session.queue.length}`)),
    h('div', { class: 'timers' },
      session.totalLimitMs ? h('span', { class: 'timer total', id: 'totalTimer' }, fmtTime(session.startedAt + session.totalLimitMs - Date.now())) : null,
      h('span', { class: 'timer', id: 'qTimer' }, '0:00')),
  );

  const body = h('div', { class: 'sess-body' });

  if (answered) {
    body.append(renderFeedback(q, answered));
  } else {
    const qCard = h('div', { class: 'mz-card' },
      h('div', { class: 'row gap wrap' },
        h('span', { class: 'chip' }, topicName(q.topic)),
        h('span', { class: 'chip dim' }, `D${q.diff} · est ${q.est}s`),
        q.source === 'ai' ? h('span', { class: 'chip ai' }, 'AI-generated') : null,
        h('span', { class: 'flex1' }),
        isExamLike ? null : h('button', { class: 'btn ghost sm', onclick: toggleFlag }, session.flags.has(session.idx) ? '★ Flagged' : '☆ Flag'),
      ),
      h('div', { class: 'qtext' }, q.q),
    );
    const answerArea = h('div', { class: 'mz-card' });

    if (q.kind === 'mcq') {
      answerArea.append(h('div', { class: 'choices' }, q.choices.map((c, i) =>
        h('button', {
          class: 'choice',
          onclick: (ev) => {
            answerArea.querySelectorAll('.choice').forEach((el) => el.classList.remove('sel'));
            ev.currentTarget.classList.add('sel');
          },
        }, h('span', { class: 'key' }, String.fromCharCode(65 + i)), c))));
    } else {
      const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Your numeric answer', class: 'numin' });
      answerArea.append(inp);
      answerArea.dataset.numin = '1';
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(); });
    }

    const actions = h('div', { class: 'row gap' },
      h('button', { class: 'btn primary', onclick: submitAnswer }, session.idx + 1 === session.queue.length ? 'Submit & finish' : 'Submit'),
      !isExamLike ? h('button', { class: 'btn ghost', onclick: giveHint }, session.hintLevel === 0 ? 'Hint' : 'Another hint') : null,
      !isExamLike ? h('button', { class: 'btn ghost', onclick: () => openTutor(q) }, 'Ask AI tutor') : null,
      session.mode === 'mock' ? h('span', { class: 'mz-muted self-end' }, 'Answered: ') : null,
    );

    if (session.mode === 'mock') {
      const navGrid = h('div', { class: 'mock-nav' }, session.queue.map((_, i) =>
        h('button', {
          class: `mn${session.answers[i] != null ? ' done' : ''}${session.flags.has(i) ? ' flag' : ''}${i === session.idx ? ' cur' : ''}`,
          onclick: () => { persistDraft(); session.idx = i; session.qStartedAt = Date.now(); session.hintLevel = 0; renderQuestion(); },
        }, String(i + 1))));
      body.append(qCard, answerArea, actions, h('div', { class: 'mz-card' }, h('h3', {}, 'Navigator'), navGrid,
        h('div', { class: 'row gap' },
          h('button', { class: 'btn ghost', onclick: () => step(-1) }, '← Prev'),
          h('button', { class: 'btn ghost', onclick: () => step(1) }, 'Next →'),
          h('span', { class: 'flex1' }),
          h('button', { class: 'btn warn', onclick: finishMockEarly }, 'Submit exam'))));
    } else {
      body.append(qCard, answerArea, actions);
    }
  }

  root.replaceChildren(header, body);
  startTicks();
  restoreDraft();

  function toggleFlag() {
    if (session.flags.has(session.idx)) session.flags.delete(session.idx);
    else session.flags.add(session.idx);
    renderQuestion();
  }
  function step(d) {
    const n = session.idx + d;
    if (n < 0 || n >= session.queue.length) return;
    persistDraft();
    session.idx = n;
    session.qStartedAt = Date.now();
    session.hintLevel = 0;
    renderQuestion();
  }
}

let draftValue = undefined;

function persistDraft() {
  const inp = root.querySelector('.numin');
  if (inp) { draftValue = inp.value; return; }
  const sel = root.querySelector('.choices .choice.sel');
  draftValue = sel ? [...root.querySelectorAll('.choices .choice')].indexOf(sel) : undefined;
}

function restoreDraft() {
  if (draftValue === undefined || draftValue === '') return;
  const inp = root.querySelector('.numin');
  if (inp) { inp.value = draftValue; return; }
  const btn = root.querySelectorAll('.choices .choice')[Number(draftValue)];
  if (btn) btn.classList.add('sel');
}

function startTicks() {
  stopTick();
  tickTimer = setInterval(() => {
    const qt = document.getElementById('qTimer');
    if (qt && session) qt.textContent = fmtTime(Date.now() - session.qStartedAt);
    const tt = document.getElementById('totalTimer');
    if (tt && session && session.totalLimitMs) {
      const left = session.startedAt + session.totalLimitMs - Date.now();
      tt.textContent = fmtTime(left);
      if (left <= 0) {
        Notify.push({ kind: 'warn', title: 'Time is up', body: 'Your exam was submitted automatically.' });
        finalizeMock(true);
      }
    }
    if (session && session.limitPerQMs && !session.answers[session.idx]) {
      const left = session.qStartedAt + session.limitPerQMs - Date.now();
      if (qt) {
        qt.textContent = fmtTime(left);
        qt.classList.toggle('danger', left < 10_000);
      }
      if (left <= 0) {
        recordAnswer({ timeout: true });
        Notify.push({ kind: 'warn', title: 'Out of time', body: 'That one counted as missed. Moving on.' });
      }
    }
  }, 250);
}

function submitAnswer() {
  const q = session.queue[session.idx];
  if (q.kind === 'mcq') {
    const btns = [...root.querySelectorAll('.choices .choice')];
    const chosen = btns.findIndex((b) => b.classList.contains('sel'));
    if (chosen < 0) {
      Notify.push({ kind: 'warn', title: 'Pick an answer', body: 'Select a choice before submitting.' });
      return;
    }
    recordAnswer({ chosen });
  } else {
    const inp = root.querySelector('.numin');
    const v = parseFloat(inp.value.replace(',', '.'));
    if (Number.isNaN(v)) {
      Notify.push({ kind: 'warn', title: 'Enter an answer', body: 'Type a number before submitting.' });
      return;
    }
    recordAnswer({ num: v });
  }
}

function recordAnswer({ chosen, num, timeout = false }) {
  const q = session.queue[session.idx];
  const ms = Date.now() - session.qStartedAt;
  const correct = !timeout && (q.kind === 'mcq'
    ? chosen === q.answer
    : Math.abs(num - Number(q.answer)) <= Math.max(1e-9, Math.abs(Number(q.answer)) * 0.001));

  const entry = {
    qId: q.id, topic: q.topic, diff: q.diff, concept: q.concept,
    correct, chosen: timeout ? null : (q.kind === 'mcq' ? chosen : num),
    ms, flagged: session.flags.has(session.idx),
    usedHint: session.usedHint, cls: timeout ? 'time pressure' : classifyDefault(q, ms, session.usedHint),
  };
  session.answers[session.idx] = entry;
  draftValue = undefined;

  if (session.mode !== 'mock') applyAnswer(q, correct, ms);

  if (session.mode === 'diagnostic' || session.mode === 'mock') {
    stopTick();
    if (session.idx + 1 >= session.queue.length) {
      session.mode === 'diagnostic' ? finalizeDiagnostic() : finalizeMock(false);
    } else {
      session.idx += 1;
      session.qStartedAt = Date.now();
      renderQuestion();
    }
    return;
  }
  renderQuestion();
}

function giveHint() {
  const q = session.queue[session.idx];
  session.hintLevel++;
  session.usedHint = true;
  const box = root.querySelector('.hintbox') || (() => {
    const b = h('div', { class: 'hintbox' });
    root.querySelector('.sess-body').appendChild(b);
    return b;
  })();
  const levels = [
    ['Nudge', `Focus on: ${q.concept}.`],
    ['Trap warning', q.trap],
    ['Method', q.faster],
  ];
  const lvl = Math.min(session.hintLevel - 1, levels.length - 1);
  box.replaceChildren(
    h('div', { class: 'hint' },
      h('span', { class: 'tag' }, `Hint ${session.hintLevel} — ${levels[lvl][0]}`),
      h('p', {}, levels[lvl][1]),
      session.hintLevel >= 3
        ? h('button', { class: 'btn ghost sm', onclick: () => openTutor(q, 'Give me a deeper hint without revealing the final answer.') }, 'Deeper hint (AI)')
        : h('button', { class: 'btn ghost sm', onclick: giveHint }, 'Another hint')),
  );
}

function renderFeedback(q, a) {
  const wrongKeys = q.kind === 'mcq' && !a.correct && a.chosen != null ? [a.chosen] : [];
  return h('div', { class: 'mz-card feedback' },
    h('div', { class: 'verdict ' + (a.correct ? 'ok' : a.timeout ? 'slow' : 'bad') },
      a.timeout ? '⏱ Out of time' : a.correct ? '✓ Correct' : '✗ Incorrect',
      h('span', { class: 'mz-muted' }, ` ${topicName(q.topic)} · D${q.diff} · ${(a.ms / 1000).toFixed(1)}s`)),
    h('div', { class: 'sol' },
      h('strong', {}, 'Solution'),
      h('p', {}, q.exp),
      q.kind === 'mcq' ? h('p', {}, h('strong', {}, 'Answer: '), q.choices[q.answer]) : h('p', {}, h('strong', {}, 'Answer: '), String(q.answer))),
    !a.correct && wrongKeys.length && q.wrong && q.wrong[String(wrongKeys[0])]
      ? h('div', { class: 'whywrong' }, h('strong', {}, 'Why your choice was wrong'), h('p', {}, q.wrong[String(wrongKeys[0])]))
      : null,
    h('div', { class: 'meta-grid' },
      metaCell('Faster method', q.faster),
      metaCell('Common trap', q.trap),
      metaCell('Related concept', q.concept)),
    !a.correct ? mistakeClassifier(a) : null,
    h('div', { class: 'row gap end' },
      h('button', { class: 'btn ghost', onclick: () => openTutor(q, a.correct ? 'Give me a similar question.' : `Why did I get this wrong? My answer was ${a.chosen ?? '(timeout)'}.`) }, 'Ask AI tutor'),
      h('button', { class: 'btn ghost', onclick: () => openTutor(q, 'Show me the fastest method for this exact problem.') }, 'Fastest method'),
      h('button', { class: 'btn primary', onclick: nextAfterFeedback }, session.idx + 1 >= session.queue.length ? 'Finish' : 'Next question →')),
  );

  function metaCell(t, v) {
    return h('div', { class: 'meta' }, h('strong', {}, t), h('p', {}, v));
  }
  function mistakeClassifier(entry) {
    const options = ['conceptual', 'calculation', 'misreading', 'careless', 'time pressure', 'guessed'];
    const def = entry.cls || 'conceptual';
    const row = h('div', { class: 'cls-row' },
      h('span', { class: 'mz-muted' }, 'I made this mistake because:'),
      options.map((o) => h('button', {
        class: `chip-btn${o === def ? ' sel' : ''}`,
        onclick: (ev) => {
          row.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('sel'));
          ev.currentTarget.classList.add('sel');
          setMistakeClass(entry.qId, o);
        },
      }, o)));
    return row;
  }
}

function nextAfterFeedback() {
  if (session.idx + 1 >= session.queue.length) {
    if (session.mode === 'redo' || session.mode === 'practice' || session.mode === 'weakness' ||
        session.mode === 'timed' || session.mode === 'speed' || session.mode === 'challenge') {
      finishPractice();
    }
    return;
  }
  session.idx += 1;
  session.qStartedAt = Date.now();
  session.hintLevel = 0;
  session.usedHint = false;
  renderQuestion();
}

function confirmExit(ev) {
  ev.preventDefault();
  if (confirm('Leave this session? Progress in it will be saved up to this point.')) {
    if (session.mode === 'mock') {
      if (session.answers.filter(Boolean).length > 0) finalizeMock(false);
      else renderMockIntro();
    } else if (['practice', 'weakness', 'timed', 'speed', 'challenge', 'redo'].includes(session.mode)) {
      if (session.answers.filter(Boolean).length > 0) finishPractice();
      else renderDashboard();
    } else {
      renderDashboard();
    }
  }
}

function finishPractice() {
  stopTick();
  const s = getState();
  const ans = session.answers.filter(Boolean);
  const correct = ans.filter((a) => a.correct).length;
  const msTotal = ans.reduce((n, a) => n + a.ms, 0);
  s.sessions.push({
    mode: session.mode, at: Date.now(), total: ans.length, correct,
    avgMs: ans.length ? Math.round(msTotal / ans.length) : 0,
  });
  if (s.sessions.length > 200) s.sessions = s.sessions.slice(-200);
  save();
  const acc = ans.length ? Math.round((correct / ans.length) * 100) : 0;
  const slow = avgSpeedRatio();

  root.replaceChildren(
    topNav('practice'),
    h('div', { class: 'mz-card mz-narrow mz-center' },
      h('h2', {}, 'Session complete'),
      h('div', { class: 'big-stat' }, `${correct}/${ans.length}`),
      h('p', { class: 'mz-muted' }, `${acc}% accuracy · average ${(msTotal / Math.max(1, ans.length) / 1000).toFixed(1)}s per question`),
      slow != null && slow > 1.4 ? h('p', { class: 'mz-note' }, 'You are accurate but slower than target pace — try a Timed Drill next.') : null,
      h('div', { class: 'row gap center' },
        h('button', { class: 'btn primary', onclick: renderPracticeSetup }, 'Keep practicing'),
        h('button', { class: 'btn ghost', onclick: renderDashboard }, 'Back to dashboard')),
    ),
  );
}

function finalizeDiagnostic() {
  stopTick();
  const s = getState();
  const ans = session.answers.filter(Boolean);
  const byTopic = {};
  for (const a of ans) {
    byTopic[a.topic] = byTopic[a.topic] || { c: 0, t: 0, ms: 0 };
    byTopic[a.topic].t += 1;
    if (a.correct) byTopic[a.topic].c += 1;
    byTopic[a.topic].ms += a.ms;
  }
  const overall = Math.round((ans.filter((a) => a.correct).length / Math.max(1, session.queue.length)) * 100);
  const entries = Object.entries(byTopic).map(([tid, v]) => ({
    topic: tid, name: topicName(tid), pct: Math.round((v.c / v.t) * 100), avgMs: v.ms / v.t, seen: v.t,
  }));
  const weak = entries.filter((e) => e.pct < 50).sort((a, b) => a.pct - b.pct);
  const strong = entries.filter((e) => e.pct >= 75).sort((a, b) => b.pct - a.pct);
  const byDiff = { 1: { c: 0, t: 0 }, 2: { c: 0, t: 0 }, 3: { c: 0, t: 0 } };
  for (const a of ans) {
    byDiff[a.diff].t += 1;
    if (a.correct) byDiff[a.diff].c += 1;
  }
  const timedOut = ans.filter((a) => a.cls === 'time pressure').length;
  s.diagnostic = { at: Date.now(), overall, topics: entries, weak, strong, byDiff, timedOut };
  s.onboarded = true;
  save();

  const diffRows = Object.entries(byDiff).map(([d, v]) =>
    h('li', {}, `Difficulty ${d}: ${v.t ? Math.round((v.c / v.t) * 100) : 0}% (${v.c}/${v.t})`));

  root.replaceChildren(
    topNav('dash'),
    h('div', { class: 'mz-card mz-narrow' },
      h('h2', {}, 'Diagnostic Report'),
      h('div', { class: 'big-stat' }, `${overall}%`),
      h('p', { class: 'mz-muted' }, `Overall performance across ${entries.length} areas · ${timedOut} question${timedOut === 1 ? '' : 's'} lost to time`),
      h('h3', {}, 'Topic performance'),
      h('table', { class: 'table' },
        h('tr', {}, h('th', {}, 'Topic'), h('th', {}, 'Score'), h('th', {}, 'Avg time')),
        entries.sort((a, b) => a.pct - b.pct).map((e) =>
          h('tr', {}, h('td', {}, e.name), h('td', {}, barPct(e.pct)), h('td', {}, `${(e.avgMs / 1000).toFixed(0)}s`)))),
      h('h3', {}, 'Difficulty performance'),
      h('ul', { class: 'mz-list' }, diffRows),
      h('h3', {}, 'Areas to strengthen'),
      weak.length ? h('ul', { class: 'mz-list' }, weak.map((e) => h('li', {}, `${e.name} — ${e.pct}%`)))
        : h('p', { class: 'mz-muted' }, 'No area below 50%. Nice baseline!'),
      h('h3', {}, 'Strong areas'),
      strong.length ? h('ul', { class: 'mz-list' }, strong.map((e) => h('li', {}, `${e.name} — ${e.pct}%`)))
        : h('p', { class: 'mz-muted' }, 'None above 75% yet — the adaptive engine will get you there.'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: renderPlan }, 'View my study plan'),
        h('button', { class: 'btn ghost', onclick: renderDashboard }, 'To dashboard')),
      h('p', { class: 'mz-note' }, 'Your preparation plan updates automatically as you practice and take mocks.'),
    ),
  );
  Notify.push({ title: 'Diagnostic complete', body: `${overall}% overall — study plan generated.` });
}

function barPct(pct) {
  const wrap = h('span', { class: 'mini-bar' });
  wrap.append(h('i', { style: `width:${pct}%` }), h('em', {}, `${pct}%`));
  return wrap;
}

function finalizeMock(auto) {
  stopTick();
  const s = getState();
  const ans = session.answers.slice();
  const total = session.queue.length;
  let correct = 0;
  const lostToTime = [];
  const wrong = [];
  const conceptStats = {};

  session.queue.forEach((q, i) => {
    const a = ans[i];
    conceptStats[q.concept] = conceptStats[q.concept] || { c: 0, t: 0 };
    if (!a) {
      lostToTime.push(i);
      conceptStats[q.concept].t += 1;
      return;
    }
    conceptStats[q.concept].t += 1;
    if (a.correct) {
      correct += 1;
      conceptStats[q.concept].c += 1;
      applyAnswer(q, true, a.ms);
    } else {
      wrong.push(i);
      applyAnswer(q, false, a.ms);
    }
  });

  const attempted = total - lostToTime.length;
  const pct = Math.round((correct / total) * 100);
  const avgMs = attempted ? Math.round(ans.reduce((n, a) => n + (a ? a.ms : 0), 0) / attempted) : 0;
  const concepts = Object.entries(conceptStats)
    .map(([name, v]) => ({ name, pct: v.t ? Math.round((v.c / v.t) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct);
  const weakestConcepts = concepts.filter((c) => c.pct < 60).slice(0, 5);
  const strongestConcepts = [...concepts].reverse().filter((c) => c.pct >= 80).slice(0, 5);

  const byTopicMap = {};
  session.queue.forEach((q, i) => {
    const a = ans[i];
    byTopicMap[q.topic] = byTopicMap[q.topic] || { c: 0, t: 0 };
    byTopicMap[q.topic].t += 1;
    if (a && a.correct) byTopicMap[q.topic].c += 1;
  });

  s.mocks.push({
    at: Date.now(), pct, correct, total, avgMs,
    lostToTime: lostToTime.length, mistakes: wrong.length,
  });
  if (s.mocks.length > 50) s.mocks = s.mocks.slice(-50);
  markStreak();
  save();

  const verdict = pct >= (s.settings.targetScore || 80) ? 'Target reached' : pct >= 60 ? 'Getting close' : 'Needs work';

  root.replaceChildren(
    topNav('mock'),
    h('div', { class: 'mz-card' },
      h('div', { class: 'row wrap gap between' },
        h('div', {},
          h('h2', {}, 'Performance Report'),
          h('p', { class: 'mz-muted' }, `${verdict} · ${auto ? 'auto-submitted (time expired)' : 'submitted manually'} · ${new Date().toLocaleString()}`)),
        h('div', { class: 'big-stat' }, `${pct}%`)),
      h('div', { class: 'stat-row' },
        statCard('Correct', `${correct}/${total}`),
        statCard('Avg time / question', `${(avgMs / 1000).toFixed(0)}s`),
        statCard('Lost to time', lostToTime.length),
        statCard('Lost to mistakes', wrong.length)),
      h('h3', {}, 'Topic scores'),
      h('table', { class: 'table' },
        h('tr', {}, h('th', {}, 'Topic'), h('th', {}, 'Score')),
        Object.entries(byTopicMap).sort((a, b) => (a[1].c / a[1].t) - (b[1].c / b[1].t))
          .map(([tid, v]) => h('tr', {}, h('td', {}, topicName(tid)), h('td', {}, barPct(Math.round((v.c / v.t) * 100)))))),
      h('h3', {}, 'Weakest concepts'),
      weakestConcepts.length ? h('ul', { class: 'mz-list' }, weakestConcepts.map((c) => h('li', {}, `${c.name} — ${c.pct}%`)))
        : h('p', { class: 'mz-muted' }, 'No concept below 60%.'),
      h('h3', {}, 'Strongest concepts'),
      strongestConcepts.length ? h('ul', { class: 'mz-list' }, strongestConcepts.map((c) => h('li', {}, `${c.name} — ${c.pct}%`)))
        : h('p', { class: 'mz-muted' }, 'Keep practicing to build standout areas.'),
      h('h3', {}, 'Recommended next steps'),
      h('ul', { class: 'mz-list' },
        weakestTopics(2).map((t) => h('li', {}, `Weakness Practice on ${t.name}`)),
        lostToTime.length > 3 ? h('li', {}, 'Timed drills — several questions were lost to the clock.') : null,
        wrong.length > lostToTime.length ? h('li', {}, 'Review your mistake notebook — most points were lost to errors.') : null,
        h('li', {}, `Regenerate your study plan to rebalance remaining days before ${s.settings.examDate || 'exam day'}.`)),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: renderPlan }, 'Update study plan'),
        h('button', { class: 'btn ghost', onclick: renderMistakes }, 'Open mistake notebook'),
        h('button', { class: 'btn ghost', onclick: renderDashboard }, 'Dashboard')),
    ),
  );
  Notify.push({ title: 'Mock exam graded', body: `${pct}% — report ready.` });
}

function finishMockEarly() {
  persistDraft();
  if (confirm('Submit the exam now? Unanswered questions count against you.')) finalizeMock(false);
}

function renderMistakes() {
  stopTick();
  const s = getState();
  const entries = Object.entries(s.mistakes)
    .map(([id, m]) => ({ id, ...m, q: bankById[id] }))
    .filter((e) => e.q)
    .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
  const due = entries.filter((e) => e.dueAt <= Date.now());
  const later = entries.filter((e) => e.dueAt > Date.now());

  const row = (e) => h('div', { class: 'mistake-row' },
    h('div', {},
      h('div', { class: 'qtext sm' }, e.q.q),
      h('div', { class: 'mz-muted' }, `${topicName(e.q.topic)} · ${e.count}× miss${e.cls ? ` · ${e.cls}` : ''} · ${e.dueAt <= Date.now() ? 'due today' : `next ${new Date(e.dueAt).toLocaleDateString()}`} (spaced repetition)`)),
    h('button', { class: 'btn ghost sm', onclick: () => startSession({ mode: 'redo', ids: [e.id], length: 1 }) }, 'Redo'));

  root.replaceChildren(
    topNav('mistakes'),
    due.length ? h('div', { class: 'row gap' },
      h('button', { class: 'btn primary', onclick: () => startSession({ mode: 'redo', ids: due.map((e) => e.id), length: due.length }) }, `Redo ${due.length} due mistakes`)) : null,
    h('div', { class: 'mz-card' },
      h('h3', {}, 'Due now'),
      due.length === 0 ? h('p', { class: 'mz-muted' }, 'Nothing scheduled. Mistakes reappear here via spaced repetition.') :
        h('div', { class: 'col gap' }, due.map(row))),
    h('div', { class: 'mz-card' },
      h('h3', {}, 'Scheduled'),
      later.length === 0 ? h('p', { class: 'mz-muted' }, 'Empty.') : h('div', { class: 'col gap' }, later.map(row))),
  );
}

function renderPlan() {
  stopTick();
  const s = getState();
  const settingsCard = h('div', { class: 'mz-card' },
    h('h3', {}, 'Settings'),
    (() => {
      const dateIn = h('input', { type: 'date', value: s.settings.examDate || '' });
      const targetIn = h('input', { type: 'number', min: 30, max: 100, value: s.settings.targetScore });
      const hoursIn = h('input', { type: 'number', min: 0.5, max: 12, step: 0.5, value: s.settings.hoursPerDay });
      const gen = h('button', {
        class: 'btn primary',
        onclick: () => {
          s.settings.examDate = dateIn.value;
          s.settings.targetScore = Number(targetIn.value) || 80;
          s.settings.hoursPerDay = Number(hoursIn.value) || 2;
          save();
          if (!dateIn.value) {
            Notify.push({ kind: 'warn', title: 'Pick an exam date', body: 'The plan needs a target date.' });
            return;
          }
          buildPlan({ examDate: dateIn.value, hoursPerDay: s.settings.hoursPerDay });
          Notify.push({ title: 'Study plan generated', body: 'Balanced toward your weakest topics.' });
          renderPlan();
        },
      }, 'Generate / refresh plan');
      return h('div', { class: 'row gap wrap' },
        labelWrap('Exam date', dateIn), labelWrap('Target %', targetIn), labelWrap('Hours/day', hoursIn), gen);
    })(),
    h('p', { class: 'mz-note' }, 'The plan auto-weights your weakest topics, schedules timed drills on alternate days and a full mock weekly.'),
  );

  const days = s.plan ? s.plan.items : [];
  const today = new Date().toISOString().slice(0, 10);

  root.replaceChildren(
    topNav('plan'),
    settingsCard,
    h('div', { class: 'mz-card' },
      h('h3', {}, s.plan ? `Daily plan — until ${s.plan.examDate}` : 'Daily plan'),
      !s.plan ? h('p', { class: 'mz-muted' }, 'Set your exam date above and generate your plan.') :
        h('div', { class: 'col gap' }, days.map((day, di) =>
          h('div', { class: `plan-day${day.date === today ? ' today' : ''}${day.done ? ' done' : ''}` },
            h('label', { class: 'row gap' },
              h('input', {
                type: 'checkbox',
                checked: day.done,
                onchange: (ev) => {
                  day.done = ev.currentTarget.checked;
                  if (day.done) markStreak();
                  save();
                  renderPlan();
                },
              }),
              h('strong', {}, day.date === today ? `Today — ${day.date}` : day.date)),
            h('ul', { class: 'mz-plan-blocks' },
              day.blocks.map((b) => h('li', {}, `${b.label} — ${b.min} min`)))))),
    ),
  );
}

function labelWrap(text, control) {
  return h('label', { class: 'field' }, h('span', { class: 'mz-muted' }, text), control);
}

function renderProgress() {
  stopTick();
  const s = getState();
  const sessSeries = s.sessions.slice(-20);
  const mockSeries = s.mocks.slice(-15);

  const accLine = h('canvas', { height: 160 });
  const speedLine = h('canvas', { height: 160 });
  const masteryBars = h('canvas', { height: 200 });

  const accData = sessSeries.map((x) => x.total ? Math.round((x.correct / x.total) * 100) : 0);
  const speedData = sessSeries.map((x) => Math.round(x.avgMs / 1000));

  setTimeout(() => {
    drawLine(accLine, accData, { max: 100, suffix: '%' });
    drawLine(speedLine, speedData, { lowerBetter: true, suffix: 's' });
    drawBars(masteryBars, topics.map((t) => [t.name, masteryFor(t.id)]));
  }, 0);

  const mockRows = mockSeries.slice().reverse().map((m) =>
    h('tr', {}, h('td', {}, new Date(m.at).toLocaleDateString()), h('td', {}, `${m.pct}%`),
      h('td', {}, `${m.correct}/${m.total}`), h('td', {}, `${(m.avgMs / 1000).toFixed(0)}s`),
      h('td', {}, String(m.lostToTime)), h('td', {}, String(m.mistakes))));

  root.replaceChildren(
    topNav('progress'),
    h('div', { class: 'grid2' },
      chartCard('Accuracy over time', accLine, accData.length ? null : 'Complete a practice session to see trends.'),
      chartCard('Speed over time (avg s/question)', speedLine, speedData.length ? null : 'Lower is better — watch it drop as you drill.')),
    h('div', { class: 'mz-card' },
      h('h3', {}, 'Topic mastery'),
      masteryBars,
      h('p', { class: 'mz-muted' }, 'Weighted by official public syllabus emphasis; updated after every answer.')),
    h('div', { class: 'mz-card' },
      h('h3', {}, 'Mock exam performance'),
      mockSeries.length === 0 ? h('p', { class: 'mz-muted' }, 'No mock exams yet.') :
        h('table', { class: 'table' },
          h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Score'), h('th', {}, 'Correct'), h('th', {}, 'Avg/Q'), h('th', {}, 'Time loss'), h('th', {}, 'Errors')),
          mockRows)),
    dangerZone(),
  );
}

function chartCard(title, canvas, emptyNote) {
  return h('div', { class: 'mz-card' }, h('h3', {}, title), canvas, emptyNote ? h('p', { class: 'mz-muted' }, emptyNote) : null);
}

function dangerZone() {
  return h('details', { class: 'mz-card danger' },
    h('summary', {}, 'Reset MBZUAI Prep data'),
    h('p', { class: 'mz-muted' }, 'Clears progress, mistakes, plans and cached AI questions. Chat history and other site data are untouched.'),
    h('button', {
      class: 'btn warn',
      onclick: () => {
        if (confirm('Reset ALL MBZUAI Prep progress? This cannot be undone.')) {
          resetProgress();
          boot();
        }
      },
    }, 'Reset everything'),
  );
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function prepCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.parentElement.clientWidth || 300;
  const heightAttr = Number(cv.getAttribute('height')) || 160;
  cv.width = w * dpr;
  cv.height = heightAttr * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, hgt: heightAttr };
}

function drawLine(cv, data, opts = {}) {
  const { ctx, w, hgt } = prepCanvas(cv);
  const pad = 28;
  ctx.clearRect(0, 0, w, hgt);
  ctx.strokeStyle = cssColor('--border');
  ctx.fillStyle = cssColor('--muted');
  ctx.font = '11px system-ui';
  const max = opts.max ?? Math.max(10, ...data);
  for (const frac of [0, 0.5, 1]) {
    const y = pad + (hgt - 2 * pad) * (1 - frac);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(max * frac)) + (opts.suffix || ''), 2, y + 4);
  }
  if (data.length < 2) {
    ctx.fillText(opts.empty || 'Not enough data yet', pad + 10, hgt / 2);
    return;
  }
  const pts = data.map((v, i) => [
    pad + ((w - pad - 12) * i) / (data.length - 1),
    pad + (hgt - 2 * pad) * (1 - v / max),
  ]);
  const grad = ctx.createLinearGradient(0, pad, 0, hgt - pad);
  grad.addColorStop(0, cssColor('--accent') + '66');
  grad.addColorStop(1, cssColor('--accent') + '00');
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = cssColor('--accent');
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineTo(pts[pts.length - 1][0], hgt - pad);
  ctx.lineTo(pts[0][0], hgt - pad);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawBars(cv, pairs) {
  const { ctx, w, hgt } = prepCanvas(cv);
  ctx.clearRect(0, 0, w, hgt);
  const n = pairs.length;
  const bw = Math.max(8, Math.min(34, (w - 40) / n - 8));
  const gap = (w - 40) / n;
  ctx.font = '10px system-ui';
  pairs.forEach(([label, v], i) => {
    const x = 20 + i * gap + (gap - bw) / 2;
    const bh = ((hgt - 46) * v) / 100;
    ctx.fillStyle = cssColor('--accent');
    ctx.globalAlpha = 0.35 + 0.65 * (v / 100);
    ctx.fillRect(x, hgt - 22 - bh, bw, bh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssColor('--muted');
    ctx.save();
    ctx.translate(x + bw / 2, hgt - 8);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'right';
    ctx.fillText(shortName(label), 0, 0);
    ctx.restore();
  });
}

function shortName(n) {
  return n.length > 14 ? n.slice(0, 13) + '…' : n;
}

function topicName(id) {
  const t = topics.find((x) => x.id === id);
  return t ? t.name : id;
}

function openTutor(q, presetAsk) {
  tutorCtxQ = q || null;
  document.getElementById('tutorDrawer')?.remove();
  const log = h('div', { class: 'tutor-log', id: 'tutorLog' });
  const input = h('textarea', { rows: 2, placeholder: 'Ask about this question, or any concept…' });
  const quick = h('div', { class: 'quick' },
    ['Explain this differently.', 'Give me a hint.', 'Show me the fastest method.', 'Give me a similar question.', 'Why did I get this wrong?']
      .map((t) => h('button', { class: 'chip-btn', onclick: () => sendTutor(t, { input, log }) }, t)));

  const drawer = h('aside', { class: 'tutor-drawer', id: 'tutorDrawer' },
    h('header', { class: 'row gap between' },
      h('strong', {}, 'AI Tutor'),
      h('span', { class: 'mz-muted' }, `${getState().aiUsage.tutor}/${AI_LIMITS.tutor} today`),
      h('button', { class: 'btn ghost sm', onclick: () => drawer.remove() }, 'Close')),
    q ? h('div', { class: 'tutor-ctx' }, `Context: ${shortName(q.q.replace(/\n/g, ' '), 90)}`) : null,
    log,
    quick,
    h('footer', { class: 'row gap' }, input, h('button', {
      class: 'btn primary',
      onclick: () => sendTutor(null, { input, log }),
    }, 'Send')));

  root.appendChild(drawer);
  if (presetAsk) sendTutor(presetAsk, { input, log });
}

function appendTutor(log, role, text) {
  log.append(h('div', { class: `tmsg ${role}` }, text));
  log.scrollTop = log.scrollHeight;
}

async function sendTutor(preset, { input, log }) {
  const text = (preset || input.value).trim();
  if (!text) return;
  input.value = '';
  const s = getState();
  if (s.aiUsage.tutor >= AI_LIMITS.tutor) {
    appendTutor(log, 'bot', `Daily tutor limit reached (${AI_LIMITS.tutor}/day) to keep things fast for everyone.`);
    return;
  }
  appendTutor(log, 'user', text);
  bumpAi('tutor');

  const contextLines = [];
  contextLines.push('You are MomoLearn AI\'s MBZUAI Prep tutor. Explain clearly for an admissions-candidate level.');
  if (tutorCtxQ) {
    contextLines.push(`Current question:\n${tutorCtxQ.q}\nChoices: ${tutorCtxQ.choices ? tutorCtxQ.choices.join(' | ') : 'numeric answer'}\nCorrect answer: ${tutorCtxQ.choices ? tutorCtxQ.choices[tutorCtxQ.answer] : tutorCtxQ.answer}\nOfficial explanation: ${tutorCtxQ.exp}`);
  }
  contextLines.push(`Student request: ${text}`);

  const pending = h('div', { class: 'tmsg bot' }, '…');
  log.append(pending);
  log.scrollTop = log.scrollHeight;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: contextLines.join('\n\n') },
          { role: 'user', content: text },
        ],
      }),
    });
    const data = await res.json();
    pending.textContent = res.ok ? data.content : (data.error || 'The tutor is unavailable right now.');
  } catch {
    pending.textContent = 'Network error — check that the server is running.';
  }
  log.scrollTop = log.scrollHeight;
}

const tabButtons = document.querySelectorAll('.tabs .tab');
tabButtons.forEach((b) =>
  b.addEventListener('click', () => {
    tabButtons.forEach((x) => x.classList.toggle('active', x === b));
    showMbzuai(b.dataset.view === 'mbzuai');
  }));
