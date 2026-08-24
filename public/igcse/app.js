import {
  SUBJECTS, PAPERS, SESSIONS,
  buildExam, randomExam, gradeFor,
  loadStore, saveAttempt, sessionLabel,
  subjectById, paperById, sessionById,
} from './core.js';

const root = document.getElementById('igcseView');

let exam = null;
let timerId = null;
const store = () => loadStore();

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
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

function bestChip(key) {
  const a = store().attempts[key];
  if (!a) return null;
  return h('span', { class: 'chip best' }, `Best ${Math.round(a.best)}% · ×${a.tries}`);
}

function go(path) {
  location.hash = path ? `#/${path}` : '#/';
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { subject: subjectById(parts[0]) && parts[0], paper: paperById(parts[1]) && parts[1], session: sessionById(parts[2]) && parts[2] };
}

function showIgcse(on) {
  root.hidden = !on;
  if (on) route();
  else stopTimer();
}
export { showIgcse };

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

/* ---------- views ---------- */

function renderHome() {
  stopTimer();
  const st = store();
  const done = Object.keys(st.attempts).length;
  root.replaceChildren(
    h('div', { class: 'ig-hero' },
      h('h1', {}, 'IGCSE Exam Hall'),
      h('p', {}, 'Cambridge-style practice papers · Physics 0625 · Chemistry 0620 · Biology 0610'),
      h('p', { class: 'ig-muted' }, 'Every paper comes from the 2023–2026 archive. P2 is auto-marked against its premade mark scheme; P4 & P6 are graded line-by-line by our AI examiner.'),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn primary', onclick: () => start(randomExam()) }, '🎲 Surprise me — random exam'),
        done ? h('span', { class: 'chip' }, `${done} exams attempted`) : null,
      ),
    ),
    h('div', { class: 'cards3' },
      SUBJECTS.map((s) =>
        h('button', { class: 'card subject-card', onclick: () => go(s.id) },
          h('span', { class: 'emoji' }, s.emoji),
          h('strong', {}, s.name),
          h('span', { class: 'code' }, s.code),
          h('span', { class: 'papers-line' }, 'Paper 2 · Paper 4 · Paper 6'),
          h('span', { class: 'sessions-count' }, `${SESSIONS.length} sessions · 2023–2026`),
        )),
    ),
    h('div', { class: 'legend' },
      PAPERS.map((p) => h('div', { class: 'legend-row' },
        h('span', { class: `ptag p-${p.id}` }, p.short.toUpperCase()),
        h('div', {},
          h('strong', {}, p.name.replace('— ', '')),
          h('p', {}, p.blurb)),
        h('span', { class: `chip ${p.marking === 'ai' ? 'ai-chip' : 'ms-chip'}` }, p.marking === 'ai' ? '✨ AI examiner' : '📋 Premade MS'),
      )),
    ),
  );
}

function renderSubject(subjectId) {
  stopTimer();
  const s = subjectById(subjectId);
  const st = store();
  root.replaceChildren(
    h('button', { class: 'back', onclick: () => go('') }, '← All subjects'),
    h('div', { class: 'ig-hero small' },
      h('h1', {}, `${s.emoji} IGCSE ${s.name}`),
      h('p', { class: 'ig-muted' }, `${s.code} · choose your paper`),
      h('button', { class: 'btn primary', onclick: () => start(randomExam({ subject: s.id })) }, `🎲 Random ${s.name} paper`),
    ),
    h('div', { class: 'cards3' },
      PAPERS.map((p) => {
        const attemptsDone = SESSIONS.filter((sess) => st.attempts[`${s.id}|${p.id}|${sess.id}`]).length;
        return h('button', { class: 'card paper-card', onclick: () => go(`${s.id}/${p.id}`) },
          h('span', { class: `ptag p-${p.id}` }, p.short.toUpperCase()),
          h('strong', {}, p.name.replace('— ', '')),
          h('span', { class: 'ig-muted meta' }, `${SESSIONS.length} exams · ${p.minutes} min`),
          h('span', { class: 'ig-muted meta' }, attemptsDone ? `✅ ${attemptsDone}/${SESSIONS.length} attempted` : 'Not attempted yet'),
        );
      }),
    ),
  );
}

function renderPaper(subjectId, paperId) {
  stopTimer();
  const s = subjectById(subjectId);
  const p = paperById(paperId);
  const byYear = {};
  SESSIONS.forEach((x) => { (byYear[x.year] ||= []).push(x); });

  root.replaceChildren(
    h('button', { class: 'back', onclick: () => go(s.id) }, `← ${s.name}`),
    h('div', { class: 'ig-hero small' },
      h('h1', {}, `${s.name} · ${p.name}`),
      h('p', { class: 'ig-muted' }, p.blurb),
      h('div', { class: 'hero-actions' },
        h('span', { class: `chip ${p.marking === 'ai' ? 'ai-chip' : 'ms-chip'}` }, p.markingLabel),
        h('button', { class: 'btn primary', onclick: () => start(randomExam({ subject: s.id, paper: p.id })) }, '🎲 Random session'),
      ),
    ),
    [2026, 2025, 2024, 2023].map((year) => byYear[year]
      ? h('section', { class: 'year-group' },
          h('h2', {}, year),
          h('div', { class: 'session-grid' },
            byYear[year].map((sess) =>
              h('button', {
                class: 'session-btn',
                onclick: () => go(`${s.id}/${p.id}/${sess.id}`),
              },
                h('strong', {}, `${sess.code} ${sess.year}`),
                h('span', { class: 'ig-muted meta' }, sess.label),
                bestChip(`${s.id}|${p.id}|${sess.id}`),
              )),
          ))
      : null),
  );
}

/* ---------- exam runner ---------- */

function start(built) {
  if (!built) { renderHome(); return; }
  go(`${built.subject.id}/${built.paper.id}/${built.session.id}`);
}

function openExam(subjectId, paperId, sessionId) {
  const built = buildExam(subjectId, paperId, sessionId);
  if (!built) { renderHome(); return; }
  stopTimer();
  exam = {
    data: built,
    answers: {},           // qNum -> index | string | {partIdx: text}
    results: {},           // qNum -> result object
    finished: false,
    aiBusy: false,
  };
  const msLeft = built.paper.minutes * 60_000;
  const deadline = Date.now() + msLeft;
  renderRunner();
  timerId = setInterval(() => {
    const left = deadline - Date.now();
    const tEl = document.getElementById('timer');
    if (tEl) {
      tEl.textContent = fmtTime(left);
      tEl.classList.toggle('danger', left < 300_000);
    }
    if (left <= 0) finishExam(true);
  }, 500);
}

function renderRunner() {
  const d = exam.data;
  const header = h('div', { class: 'runner-head' },
    h('button', { class: 'back', onclick: () => { go(`${d.subject.id}/${d.paper.id}`); } }, `← ${d.paper.short} papers`),
    h('div', { class: 'runner-title' },
      h('h1', {}, d.title),
      h('span', { class: 'ig-muted meta' }, `${d.questions.length} questions · ${d.totalMarks} marks · ${d.paper.minutes} min`)),
    h('div', { id: 'timer', class: 'timer' }, fmtTime(d.paper.minutes * 60_000)),
  );

  const body = d.paper.kind === 'mcq' ? mcqBody(d) : writtenBody(d);
  root.replaceChildren(header, body);
}

/* ----- Paper 2 (premade MS, auto-marked) ----- */

function mcqBody(d) {
  let cur = 0;
  const wrap = h('div', { class: 'mcq-wrap' });

  const paint = () => {
    const q = d.questions[cur];
    const chosen = exam.answers[q.num];
    wrap.replaceChildren(
      h('div', { class: 'q-progress' },
        h('span', {}, `Question ${cur + 1} of ${d.questions.length}`),
        h('span', { class: 'topic-chip' }, q.topic)),
      h('div', { class: 'q-card' },
        h('p', { class: 'q-text' }, q.q),
        h('div', { class: 'choices' },
          q.o.map((opt, i) =>
            h('button', {
              class: `choice${chosen === i ? ' sel' : ''}`,
              onclick: () => { exam.answers[q.num] = i; paint(); },
            },
              h('b', {}, String.fromCharCode(65 + i)), ' ', opt)))),
      h('div', { class: 'nav-grid' },
        d.questions.map((qq, i) =>
          h('button', {
            class: `nav-dot${i === cur ? ' cur' : ''}${exam.answers[qq.num] != null ? ' answered' : ''}`,
            onclick: () => { cur = i; paint(); },
          }, i + 1))),
      h('div', { class: 'runner-actions' },
        h('button', { class: 'btn ghost', disabled: cur === 0, onclick: () => { cur--; paint(); } }, '‹ Prev'),
        h('button', { class: 'btn ghost', disabled: cur === d.questions.length - 1, onclick: () => { cur++; paint(); } }, 'Next ›'),
        h('button', { class: 'btn primary', onclick: () => finishExam(false) }, 'Submit & mark ✓')),
    );
  };
  paint();
  return wrap;
}

function finishMcq(d) {
  let score = 0;
  d.questions.forEach((q) => { if (exam.answers[q.num] === q.a) score += 1; });
  const pct = Math.round((score / d.questions.length) * 100);
  saveAttempt(d.key, pct, score, d.questions.length);

  root.append(
    h('div', { class: 'result-panel' },
      h('div', { class: 'score-ring' },
        h('span', { class: 'big' }, `${score}/${d.questions.length}`),
        h('span', { class: 'pct' }, `${pct}%`),
        h('span', { class: `grade g${gradeFor(pct).replace('*', 's')}` }, `Grade ${gradeFor(pct)}`)),
      h('h2', {}, 'Mark scheme review'),
      d.questions.map((q) => {
        const mine = exam.answers[q.num];
        const right = mine === q.a;
        return h('details', { class: `ms-item ${mine == null ? 'skipped' : right ? 'correct' : 'wrong'}`, open: !right && mine != null },
          h('summary', {}, `Q${q.num} · ${mine != null ? String.fromCharCode(65 + mine) : '—'} · correct: ${String.fromCharCode(65 + q.a)} · ${q.topic}`),
          h('p', { class: 'q-text' }, q.q),
          q.o.map((opt, i) => h('p', { class: `opt-line${i === q.a ? ' good' : ''}${i === mine && i !== q.a ? ' bad' : ''}` },
            h('b', {}, String.fromCharCode(65 + i)), ' ', opt, i === q.a ? '  ✔ mark scheme answer' : '')));
      }),
      h('div', { class: 'runner-actions center' },
        h('button', { class: 'btn primary', onclick: () => openExam(d.subject.id, d.paper.id, d.session.id) }, 'Retry this paper'),
        h('button', { class: 'btn ghost', onclick: () => go(`${d.subject.id}/${d.paper.id}`) }, 'Back to sessions'),
        h('button', { class: 'btn ghost', onclick: () => start(randomExam({ subject: d.subject.id, paper: d.paper.id })) }, '🎲 Another paper'))),
  );
  document.querySelector('.result-panel')?.scrollIntoView({ behavior: 'smooth' });
}

/* ----- Papers 4 & 6 (AI examiner) ----- */

function writtenBody(d) {
  const wrap = h('div', { class: 'written-wrap' });
  wrap.append(
    h('div', { class: 'ai-note' },
      h('span', {}, '✨ Write your answers below, then mark each question with the AI examiner (or reveal the official-style mark scheme to self-mark).'),
    ),
  );

  d.questions.forEach((q) => {
    const card = buildWrittenCard(q);
    wrap.append(card);
  });

  wrap.append(
    h('div', { class: 'runner-actions center' },
      h('button', { class: 'btn primary big-btn', onclick: () => finishExam(false) }, 'Finish & see report 📊')),
  );
  return wrap;
}

function buildWrittenCard(q) {
  const res = exam.results[q.num] || { parts: {} };
  const card = h('div', { class: 'q-card written' , 'data-q': q.num });
  const statusEl = h('div', { class: 'mark-status' });

  const paintStatus = () => {
    const entries = q.parts.map((p, i) => res.parts[i]);
    const doneParts = entries.filter(Boolean).length;
    const awarded = entries.reduce((n, r) => n + (r ? r.awarded : 0), 0);
    const max = q.parts.reduce((n, p) => n + p.marks, 0);
    statusEl.replaceChildren(
      doneParts
        ? h('span', { class: `chip score-chip ${awarded >= max * 0.67 ? 'good' : awarded >= max * 0.34 ? 'mid' : 'bad'}` }, `${awarded}/${max} marked`)
        : h('span', { class: 'chip' }, `${max} marks`),
    );
  };

  card.append(
    h('div', { class: 'q-head' },
      h('span', {}, `Question ${q.num}`),
      h('span', { class: 'topic-chip' }, q.topic)),
    h('p', { class: 'stem' }, q.stem),
  );

  q.parts.forEach((part, pi) => {
    const ta = h('textarea', {
      rows: Math.min(8, 2 + Math.ceil(part.marks / 1.5)),
      placeholder: `Answer (${part.marks} mark${part.marks > 1 ? 's' : ''})…`,
      oninput: () => {
        exam.answers[q.num] ||= {};
        exam.answers[q.num][pi] = ta.value;
      },
    });
    if (exam.answers[q.num]?.[pi]) ta.value = exam.answers[q.num][pi];
    const partBox = h('div', { class: 'part' },
      h('p', { class: 'part-q' }, h('span', { class: 'marks-badge' }, `[${part.marks}]`), ' ', part.q),
      ta,
      h('div', { class: 'part-result' }));
    partBox.dataset.pi = pi;
    card.append(partBox);
  });

  const actions = h('div', { class: 'written-actions' },
    h('button', {
      class: 'btn primary',
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        await markWholeQuestion(q, card);
        ev.currentTarget.disabled = false;
      },
    }, '✨ Mark with AI'),
    h('button', {
      class: 'btn ghost',
      onclick: () => card.querySelector('.ms-reveal')?.classList.toggle('open'),
    }, '📋 Show mark scheme'),
  );
  card.append(actions, statusEl);

  card.append(h('div', { class: 'ms-reveal' },
    h('h4', {}, `Mark scheme — Question ${q.num}`),
    q.parts.map((part, pi) => h('div', { class: 'ms-part' },
      h('strong', {}, `${part.q} [${part.marks}]`),
      h('ul', {}, part.ms.map((m) => h('li', {}, m)))))));

  paintStatus();
  card.paintStatus = paintStatus;
  return card;
}

async function markPart(part, questionText, answerText) {
  const res = await fetch('/api/igcse/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(window.Byok ? Byok.headers() : {}) },
    body: JSON.stringify({
      question: questionText,
      maxMarks: part.marks,
      markscheme: part.ms,
      answer: answerText,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

async function markWholeQuestion(q, card) {
  const answers = exam.answers[q.num] || {};
  exam.results[q.num] ||= { parts: {} };
  const res = exam.results[q.num];

  for (const [piStr, part] of q.parts.entries()) {
    const pi = Number(piStr);
    const box = card.querySelector(`.part[data-pi="${pi}"]`);
    const out = box.querySelector('.part-result');
    const ans = (answers[pi] || '').trim();
    box.classList.remove('marked');

    if (!ans) {
      res.parts[pi] = { awarded: 0, maxMarks: part.marks, feedback: 'No answer given.' };
      out.replaceChildren(h('p', { class: 'fb bad-fb' }, '— 0 marks · no answer'));
    } else {
      out.replaceChildren(h('p', { class: 'fb loading' }, `✨ Examiner marking part (${pi + 1})…`));
      try {
        const r = await markPart(
          part,
          `${exam.data.title}\nStem: ${q.stem}\nPart: ${part.q}`,
          ans,
        );
        res.parts[pi] = r;
        out.replaceChildren(renderPartResult(part, r));
      } catch (e) {
        out.replaceChildren(
          h('p', { class: 'fb err' }, `AI marking unavailable: ${e.message}`),
          /key/i.test(e.message)
            ? h('a', { href: '/keys.html', class: 'fix-link', target: '_blank' }, 'Add your free AI key → keys.html')
            : null,
          h('button', { class: 'btn tiny ghost', onclick: () => out.replaceChildren() }, 'Dismiss'),
        );
        continue;
      }
    }
    box.classList.add('marked');
    card.paintStatus();
  }
}

function renderPartResult(part, r) {
  const pct = r.awarded / part.marks;
  return h('div', {},
    h('p', { class: `fb ${pct >= 0.99 ? 'good-fb' : pct > 0 ? 'ok-fb' : 'bad-fb'}` },
      `Scored ${r.awarded}/${part.marks}${r.feedback ? ` · ${r.feedback}` : ''}`),
    Array.isArray(r.matched) && r.matched.length
      ? h('div', { class: 'pts' }, '✔ Credit earned: ', r.matched.map((i) => h('span', { class: 'pt good-pt' }, shortMs(part.ms[i]))))
      : null,
    Array.isArray(r.missed) && r.missed.length
      ? h('div', { class: 'pts' }, '✘ Missing: ', r.missed.filter((i) => !(r.matched || []).includes(i)).map((i) => h('span', { class: 'pt miss-pt' }, shortMs(part.ms[i]))))
      : null);
}

function shortMs(text, len = 70) {
  return text.length > len ? `${text.slice(0, len - 1)}…` : text;
}

/* ----- finish ----- */

function finishExam(auto) {
  if (!exam || exam.finished) return;
  const d = exam.data;
  exam.finished = true;
  stopTimer();
  if (d.paper.kind === 'mcq') return finishMcq(d);

  let awarded = 0, max = 0, markedCount = 0;
  d.questions.forEach((q) => {
    q.parts.forEach((p, pi) => {
      max += p.marks;
      const r = exam.results[q.num]?.parts?.[pi];
      if (r) { awarded += r.awarded; markedCount++; }
    });
  });
  const unmarked = d.questions.reduce((n, q) => n + q.parts.length, 0) - markedCount;
  const pct = max ? Math.round((awarded / max) * 100) : 0;

  saveAttempt(d.key, pct, awarded, max);

  root.append(
    h('div', { class: 'result-panel' },
      h('div', { class: 'score-ring' },
        h('span', { class: 'big' }, `${awarded}/${max}`),
        h('span', { class: 'pct' }, `${pct}%`),
        h('span', { class: `grade g${gradeFor(pct).replace('*', 's')}` }, `Grade ${gradeFor(pct)}`)),
      h('h2', {}, auto ? '⏰ Time up — report' : 'Examiner report'),
      unmarked > 0
        ? h('p', { class: 'warn-note' }, `${unmarked} part${unmarked > 1 ? 's were' : ' was'} not AI-marked (unanswered or skipped) and count as 0. Use “Mark with AI” on any question to update this report.`)
        : null,
      d.questions.map((q) => {
        const parts = q.parts.map((p, pi) => ({ p, r: exam.results[q.num]?.parts?.[pi], pi }));
        const got = parts.reduce((n, x) => n + (x.r?.awarded ?? 0), 0);
        const tot = q.parts.reduce((n, x) => n + x.p.marks, 0);
        return h('details', { class: 'ms-item', open: true },
          h('summary', {}, `Q${q.num} · ${got}/${tot} · ${q.topic}`),
          parts.map(({ p, r }) => r
            ? h('p', { class: 'fb ok-fb' }, `${p.q.slice(0, 60)}… → ${r.awarded}/${p.marks}`)
            : h('p', { class: 'fb muted-fb' }, `${p.q.slice(0, 60)}… → not marked (${p.marks} available)`)));
      }),
      h('div', { class: 'runner-actions center' },
        h('button', { class: 'btn primary', onclick: () => openExam(d.subject.id, d.paper.id, d.session.id) }, 'Retry this paper'),
        h('button', { class: 'btn ghost', onclick: () => go(`${d.subject.id}/${d.paper.id}`) }, 'Back to sessions'),
        h('button', { class: 'btn ghost', onclick: () => start(randomExam({ subject: d.subject.id })) }, '🎲 Random paper'))),
  );
  document.querySelector('.result-panel')?.scrollIntoView({ behavior: 'smooth' });
}

/* ---------- router ---------- */

function route() {
  const { subject, paper, session } = parseHash();
  if (!subject) return renderHome();
  if (!paper) return renderSubject(subject);
  if (!session) return renderPaper(subject, paper);
  openExam(subject, paper, session);
}

window.addEventListener('hashchange', () => { if (!root.hidden) route(); });
window.addEventListener('momo-view', (e) => showIgcse(e.detail.view === 'igcse'));

if (!root.hidden) route();
