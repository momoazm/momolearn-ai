(() => {
  const LS = { token: 'mi.token', active: 'mi.active', tts: 'mi.tts' };
  const TYPES = {
    general: { label: 'General Interview', blurb: 'Balanced academic and personal questions.' },
    motivation: { label: 'Motivation Interview', blurb: 'Why AI? Why MBZUAI? Academic and career goals.' },
    technical: { label: 'Technical Interview', blurb: 'Math, probability, programming, algorithms, ML fundamentals.' },
    research: { label: 'Research Interview', blurb: 'Research interests, experience and scientific reasoning.' },
    behavioral: { label: 'Behavioral Interview', blurb: 'Leadership, teamwork, failure, conflict, adaptability.' },
    stress: { label: 'Stress Interview', blurb: 'Harder follow-ups and pressure. Stay composed.', tag: 'Advanced' },
    full: { label: 'Full Mock Interview', blurb: 'A complete realistic simulation of all categories.', tag: 'Most realistic' },
  };

  const $ = (id) => document.getElementById(id);
  const views = ['view-home', 'view-setup', 'view-interview', 'view-report'];
  const show = (name) => {
    views.forEach((v) => $(v).classList.toggle('hidden', v !== name));
    $('appHeader').classList.toggle('hidden', name === 'view-interview');
    window.scrollTo(0, 0);
  };

  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const FILLERS = /\b(um+|uh+|er+|ah+|like|you know|i mean|basically|actually|literally|sort of|kind of)\b/gi;
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const catLabel = (k) => (k || '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

  let profile = null;
  let history = [];
  let usage = { used: 0, limit: 15 };
  let session = null;
  let busy = false;
  let lastReportTranscript = [];
  let currentReportType = null;
  let pendingType = null;

  async function api(path, body, method) {
    const res = await fetch(`/api/${path}`, {
      method: method || (body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem(LS.token),
        ...(window.Byok ? Byok.headers() : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (data.needsKey) throw new Error(data.error + ' Open /keys.html to add one.');
      location.href = '/';
      throw new Error('Signed out');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function paintKeyLink() {
    const link = $('keyLink');
    if (!link || !window.Byok) return;
    const v = Byok.get();
    link.style.color = v ? 'var(--ok)' : '';
    link.title = v ? `Using your own AI key (${v.provider})` : 'Add your free AI key';
  }
  paintKeyLink();

  /* ---------- voice ---------- */
  let recog = null, recognizing = false, answerStartTs = 0, clockTimer = null, totalTimer = null;

  function initMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    $('micBtn').style.display = 'grid';
    recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    let baseLen = '';
    recog.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) baseLen += (baseLen && !baseLen.endsWith(' ') ? ' ' : '') + t;
        else interim += t;
      }
      $('answerInput').value = (baseLen + ' ' + interim).trim();
      updateVoiceMeta();
    };
    recog.onend = () => { recognizing = false; paintMic(); };
    recog.onerror = () => { recognizing = false; paintMic(); };
  }
  const paintMic = () => {
    $('micBtn').classList.toggle('rec', recognizing);
    $('micBtn').title = recognizing ? 'Stop dictation' : 'Dictate answer (voice input)';
  };
  function toggleMic() {
    if (!recog) return;
    if (recognizing) { recog.stop(); return; }
    try {
      recog.start();
      recognizing = true;
      paintMic();
    } catch {}
  }
  function voiceMetrics(text) {
    const durationSec = answerStartTs ? (Date.now() - answerStartTs) / 1000 : 0;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const fillers = (text.match(FILLERS) || []).length;
    const wpm = durationSec > 4 ? Math.round(words / (durationSec / 60)) : null;
    return { durationSec: Math.round(durationSec), words, fillers, wpm };
  }
  function updateVoiceMeta() {
    const m = voiceMetrics($('answerInput').value);
    $('voiceMeta').textContent = m.words ? `${m.words} words · ${m.fillers} fillers` : '';
  }

  const ttsOn = () => store.get(LS.tts, false);
  const paintTts = () => $('ttsToggle').classList.toggle('on', ttsOn());
  function speak(text) {
    if (!ttsOn() || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch {}
  }

  /* ---------- home ---------- */
  function renderProfileCard() {
    if (profile && (profile.degree || profile.academicBackground || profile.researchInterests)) {
      $('profName').textContent = [profile.degree, profile.researchInterests].filter(Boolean).join(' · ') || 'Candidate profile';
      $('profSub').textContent = 'Profile saved to your account — interviews are personalized from it.';
    } else {
      $('profName').textContent = 'No candidate profile yet';
      $('profSub').textContent = 'Set up your background so the interviewer can personalize questions.';
    }
  }

  function renderTypes() {
    const grid = $('typeGrid');
    grid.innerHTML = '';
    const left = Math.max(0, usage.limit - usage.used);
    Object.entries(TYPES).forEach(([id, t]) => {
      const b = document.createElement('button');
      b.className = 'type-card';
      b.innerHTML = `<div class="t-name">${t.label}</div><div class="t-blurb">${t.blurb}</div>
        <div class="t-meta">${t.tag ? t.tag + ' · ' : ''}${left <= 3 ? `${left} sessions left today` : ''}</div>`;
      b.addEventListener('click', () => startInterview(id));
      grid.appendChild(b);
    });
    $('usageNote').textContent = left <= 3 ? `(${left} of ${usage.limit} daily sessions left)` : '';
  }

  function renderHistory() {
    $('historyHint').textContent = history.length
      ? `${history.length} completed interview${history.length > 1 ? 's' : ''} · stored in your account`
      : 'Completed interviews will appear here with scores and progress over time.';
    const list = $('historyList');
    list.innerHTML = '';

    if (history.length >= 2) {
      const pts = [...history].reverse();
      const W = 640, H = 120, pad = 26;
      const xs = (i) => pad + (i * (W - pad * 2)) / Math.max(pts.length - 1, 1);
      const ys = (v) => H - pad - ((v / 100) * (H - pad * 2));
      const line = pts.map((h, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(h.overall).toFixed(1)}`).join(' ');
      const dots = pts.map((h, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(h.overall).toFixed(1)}" r="3.5" fill="${h.overall >= 70 ? '#34d399' : '#7c6cff'}"><title>${fmtDate(h.created_at)} · ${TYPES[h.type]?.label || h.type}: ${h.overall}</title></circle>`).join('');
      $('chartWrap').innerHTML = `<svg viewBox="0 0 ${W} ${H}">
        <line x1="${pad}" y1="${ys(50)}" x2="${W - pad}" y2="${ys(50)}" stroke="#232838" stroke-dasharray="4 4"/>
        <line x1="${pad}" y1="${ys(75)}" x2="${W - pad}" y2="${ys(75)}" stroke="#232838" stroke-dasharray="4 4"/>
        <path d="${line}" fill="none" stroke="#7c6cff" stroke-width="2"/>
        ${dots}
      </svg>`;
    } else {
      $('chartWrap').innerHTML = '';
    }

    history.forEach((h) => {
      const row = document.createElement('div');
      row.className = 'hist-row';
      const cats = Object.entries(h.report?.categories || {}).map(([k, v]) => [k, Number(v) || 0]).sort((a, b) => b[1] - a[1]);
      const strong = cats[0] ? catLabel(cats[0][0]) : '';
      const weak = cats.length > 1 ? catLabel(cats[cats.length - 1][0]) : '';
      row.innerHTML = `<span class="d">${fmtDate(h.created_at)}</span>
        <span class="t"><strong>${TYPES[h.type]?.label || h.type}</strong><br><span style="color:var(--muted);font-size:11.5px;">${strong ? `strong: ${strong}` : ''}${strong && weak ? ' · ' : ''}${weak ? `weak: ${weak}` : ''}${h.duration_sec ? ` · ${Math.max(1, Math.round(h.duration_sec / 60))} min` : ''}</span></span>
        <span class="hist-score" style="color:${h.overall >= 75 ? 'var(--ok)' : h.overall >= 55 ? 'var(--warn)' : 'var(--bad)'}">${h.overall}</span>`;
      row.title = h.report?.summary || '';
      row.addEventListener('click', async () => {
        try {
          const data = await api(`interviews?id=${h.id}`);
          lastReportTranscript = data.interview.transcript || [];
          currentReportType = h.type;
          renderReport(h.report, true);
        } catch (e) {
          NotifySafe(e.message);
        }
      });
      list.appendChild(row);
    });
  }

  function NotifySafe(msg) {
    if (window.Notify) Notify.push({ kind: 'warn', title: 'Error', body: msg });
    else alert(msg);
  }

  function renderResumeCard() {
    const a = store.get(LS.active, null);
    $('resumeCard').style.display = a ? 'flex' : 'none';
    if (a) $('resumeInfo').textContent = `${TYPES[a.type]?.label || a.type} · question ${a.state?.qCount || 1}`;
  }

  async function showHome() {
    renderProfileCard(); renderTypes(); renderHistory(); renderResumeCard(); paintTts();
    show('view-home');
  }

  /* ---------- profile ---------- */
  const PF_FIELDS = ['degree','academicBackground','programming','aiMlExperience','projects','research','internships','competitions','publications','researchInterests','careerGoals'];
  function openProfile() {
    PF_FIELDS.forEach((f) => { $(`pf_${f}`).value = profile?.[f] || ''; });
    show('view-setup');
  }
  async function saveProfile() {
    const p = {};
    PF_FIELDS.forEach((f) => { const v = $(`pf_${f}`).value.trim(); if (v) p[f] = v; });
    try {
      await api('profile', { data: p }, 'PUT');
      profile = p;
      if (window.Notify) Notify.push({ title: 'Profile saved', body: 'Stored in your account.' });
      showHome();
      if (pendingType) { const t = pendingType; pendingType = null; startInterview(t); }
    } catch (e) {
      NotifySafe(e.message);
    }
  }

  /* ---------- interview flow ---------- */
  async function startInterview(type, focus, targetQuestions) {
    if (!profile) {
      if (window.Notify) Notify.push({ kind: 'warn', title: 'Profile needed first', body: 'Tell the coach about your background once, then interview anytime.' });
      pendingType = type; openProfile(); return;
    }
    if (usage.used >= usage.limit) {
      NotifySafe(`Daily limit reached (${usage.limit} interviews per day).`);
      return;
    }
    const st = $('homeStatus');
    st.textContent = 'Preparing your interviewer…';
    document.querySelectorAll('#typeGrid .type-card').forEach((b) => (b.disabled = true));
    try {
      const data = await api('interview/start', { type, focus, targetQuestions, profile });
      usage.used++;
      session = {
        interviewId: data.interviewId,
        type,
        intro: data.intro,
        currentQuestion: data.question,
        category: data.category,
        state: data.state,
        transcript: [],
        startedAt: Date.now(),
        elapsedBefore: 0,
      };
      store.set(LS.active, session);
      enterInterviewView();
    } catch (e) {
      st.textContent = e.message;
      NotifySafe(e.message);
    } finally {
      st.textContent = '';
      document.querySelectorAll('#typeGrid .type-card').forEach((b) => (b.disabled = false));
    }
  }

  function enterInterviewView(resumed) {
    show('view-interview');
    $('ivType').textContent = TYPES[session.type]?.label || session.type;
    $('ivIntro').textContent = resumed ? 'Resumed session.' : session.intro || '';
    $('answerInput').value = '';
    updateVoiceMeta();
    paintQuestion(session.currentQuestion);
    session.turnStartedAt = Date.now();
    clearInterval(totalTimer);
    totalTimer = setInterval(() => {
      const total = (session.elapsedBefore || 0) + (Date.now() - session.turnStartedAt) / 1000;
      session.totalElapsed = total;
      $('ivClock').textContent = fmtClock(total);
    }, 1000);
    tickAnswerClock();
  }

  function paintQuestion(q) {
    const el = $('ivQuestion');
    el.innerHTML = '<span class="thinking"><span></span><span></span><span></span></span>';
    setTimeout(() => { el.textContent = q; speak(q); }, 350);
    $('ivProgress').style.width = `${Math.min(100, ((session.state.qCount - 1) / session.state.targetQs) * 100)}%`;
    $('ivCount').textContent = `Q ${Math.min(session.state.qCount, session.state.targetQs)}/${session.state.targetQs}`;
    answerStartTs = Date.now();
    tickAnswerClock();
  }

  function tickAnswerClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (!answerStartTs) return;
      $('answerTimer').textContent = `answering… ${fmtClock((Date.now() - answerStartTs) / 1000)}`;
    }, 1000);
  }

  async function submitAnswer() {
    const text = $('answerInput').value.trim();
    if (!text || busy) return;
    if (text.split(/\s+/).length < 3) {
      NotifySafe('Give the interviewer something to work with — a few sentences at least.');
      return;
    }
    busy = true;
    $('submitAnswerBtn').disabled = true;
    $('submitAnswerBtn').textContent = 'Analyzing…';
    if (recognizing && recog) recog.stop();
    const meta = voiceMetrics(text);
    const elapsedThisTurn = (Date.now() - session.turnStartedAt) / 1000;
    session.elapsedBefore = (session.elapsedBefore || 0) + elapsedThisTurn;
    clearInterval(clockTimer);

    const q = session.currentQuestion;
    try {
      const data = await api('interview/answer', {
        type: session.type,
        question: q,
        answer: text,
        meta,
        state: session.state,
        history: session.transcript.slice(-4),
        profile,
      });
      session.transcript.push({ question: q, answer: text, analysis: data.analysis, meta, category: session.category });
      session.state = data.state;
      if (data.done) {
        finishAndReport();
      } else {
        session.currentQuestion = data.nextQuestion;
        store.set(LS.active, session);
        $('answerInput').value = '';
        updateVoiceMeta();
        paintQuestion(data.nextQuestion);
      }
    } catch (e) {
      NotifySafe(`${e.message} Your answer is kept in the box — try again.`);
      session.elapsedBefore = Math.max(0, (session.elapsedBefore || 0) - elapsedThisTurn);
    } finally {
      busy = false;
      $('submitAnswerBtn').disabled = false;
      $('submitAnswerBtn').textContent = 'Submit';
    }
  }

  async function endEarly() {
    if (busy) return;
    if (!session.transcript.length) {
      store.del(LS.active); session = null; showHome(); return;
    }
    if (!confirm(`End the interview after ${session.transcript.length} answered question(s)? You will receive a report based on what was covered.`)) return;
    finishAndReport();
  }

  async function finishAndReport() {
    busy = true;
    $('ivProgress').style.width = '100%';
    $('ivQuestion').innerHTML = '<span class="thinking"><span></span><span></span><span></span></span>';
    const payload = {
      type: session.type,
      transcript: session.transcript,
      state: session.state,
      profile,
      durationSec: session.totalElapsed || session.elapsedBefore || 0,
    };
    try {
      const data = await api('interview/report', payload);
      store.del(LS.active);
      lastReportTranscript = payload.transcript;
      currentReportType = payload.type;
      renderReport(data.report);
      const list = await api('interviews');
      history = list.interviews || [];
      NotifySafeDone(`Interview complete — overall score: ${data.report.overall}/100`);
    } catch (e) {
      NotifySafe(e.message);
      showHome();
    } finally { busy = false; }
  }
  function NotifySafeDone(msg) {
    if (window.Notify) Notify.push({ title: 'Interview complete', body: msg });
  }

  /* ---------- report ---------- */
  const barClass = (v) => (v >= 75 ? 'good' : v >= 50 ? 'mid' : 'low');

  function renderReport(r) {
    r.__transcript = lastReportTranscript;
    r.__type = currentReportType;
    const C = 2 * Math.PI * 46;
    const dash = (r.overall / 100) * C;
    const catRows = Object.entries(r.categories || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
      const val = Math.round(Number(v) || 0);
      return `<div class="cat-row"><div class="cat-head"><b>${catLabel(k)}</b><span>${val}</span></div>
        <div class="bar-track"><div class="bar-fill ${barClass(val)}" style="width:${val}%"></div></div></div>`;
    }).join('');

    const qaBlock = (idx, note, cls) => {
      const t = r.__transcript?.[idx - 1];
      if (!t) return '';
      return `<div class="qa-block">
        <div class="q">Q${idx}. ${escapeHtml(t.question)}</div>
        <div class="a">${escapeHtml(t.answer)}</div>
        <button class="qa-more" data-idx="${idx}">show full answer ▾</button>
        <div style="margin-top:8px;font-size:12.5px;line-height:1.55;color:${cls === 'good' ? 'var(--ok)' : 'var(--warn)'};">${escapeHtml(note)}</div>
        <button class="btn ghost small coach-btn" data-idx="${idx}" style="margin-top:8px;">Improve My Answer</button>
      </div>`;
    };

    const flags = (r.redFlags || []).map((f) =>
      `<div class="flag"><span class="sev ${f.severity || 'low'}">${f.severity || 'low'}</span><span><b>${escapeHtml(f.type)}</b> — ${escapeHtml(f.evidence)}</span></div>`
    ).join('') || '<p class="hint">No red flags detected.</p>';

    const plan = (r.improvementPlan || []).map((p, i) =>
      `<div class="plan-item"><span class="n">${i + 1}.</span><span><b>${escapeHtml(p.area)}:</b> ${escapeHtml(p.exercise)}</span></div>`
    ).join('');

    $('view-report').innerHTML = `
      <div class="card">
        <div class="score-hero">
          <div class="ring">
            <svg width="110" height="110"><circle cx="55" cy="55" r="46" fill="none" stroke="#232838" stroke-width="9"/>
            <circle cx="55" cy="55" r="46" fill="none" stroke="${r.overall >= 75 ? '#34d399' : r.overall >= 55 ? '#7c6cff' : '#f59e0b'}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}"/></svg>
            <div class="val">${r.overall}<small>/100</small></div>
          </div>
          <div style="flex:1;">
            <h2>${TYPES[r.__type]?.label || ''} — Final Report</h2>
            <p class="hint" style="margin-top:6px;font-size:13px;color:var(--text);line-height:1.6;">${escapeHtml(r.summary)}</p>
          </div>
        </div>
        <div class="cat-grid">${catRows}</div>
      </div>

      ${(r.voiceNotes ? `<div class="card"><h2>Voice & delivery</h2><p class="hint" style="margin-top:6px;">${escapeHtml(r.voiceNotes)}</p></div>` : '')}

      <div class="card section-gap">
        <h2>Strongest answers</h2>${(r.strongestAnswers || []).map((s) => qaBlock(s.index, s.whatWorked, 'good')).join('') || '<p class="hint">—</p>'}
      </div>

      <div class="card section-gap">
        <h2>Weakest answers</h2>${(r.weakestAnswers || []).map((w) => qaBlock(w.index, `${w.issue} → ${w.improvement}`, 'warn')).join('') || '<p class="hint">—</p>'}
      </div>

      <div class="card section-gap">
        <h2>Red flags</h2><div style="margin-top:8px;">${flags}</div>
      </div>

      <div class="card section-gap">
        <h2>Improvement plan</h2><div style="margin-top:6px;">${plan}</div>
        <p class="hint" style="margin-top:10px;">Practice builds authentic skill — never memorize generated example answers. Rehearse constructing your own responses out loud.</p>
      </div>

      <div class="report-actions">
        <button class="btn" id="practiceWeakBtn">Practice weak areas</button>
        <button class="btn ghost" id="backHomeBtn">Back to overview</button>
      </div>
    `;
    show('view-report');

    $('view-report').addEventListener('click', function onReportClick(e) {
      const more = e.target.closest('.qa-more');
      if (more) {
        more.parentElement.classList.toggle('open');
        more.textContent = more.parentElement.classList.contains('open') ? 'hide ▴' : 'show full answer ▾';
        return;
      }
      const coach = e.target.closest('.coach-btn');
      if (coach) { openCoach(Number(coach.dataset.idx)); return; }
      if (e.target.id === 'practiceWeakBtn') {
        const pr = r.practiceRecommendation || {};
        startInterview(pr.type || weakestType(r), pr.focus || '');
        return;
      }
      if (e.target.id === 'backHomeBtn') showHome();
    });
  }

  function weakestType(r) {
    const entries = Object.entries(r.categories || {}).sort((a, b) => a[1] - b[1]);
    const k = entries[0]?.[0] || '';
    if (/tech/i.test(k)) return 'technical';
    if (/research/i.test(k)) return 'research';
    if (/motiv/i.test(k)) return 'motivation';
    if (/communicat|confiden/i.test(k)) return 'behavioral';
    return 'general';
  }

  async function openCoach(idx) {
    const source = lastReportTranscript[idx - 1];
    if (!source) return;
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal"><h3>Answer Coach</h3><p class="hint">Q${idx}: ${escapeHtml(source.question)}</p>
      <div id="coachBody" class="status-line">Analyzing your answer…</div>
      <div style="margin-top:16px;"><button class="btn ghost small" id="coachClose">Close</button></div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('#coachClose').addEventListener('click', close);

    try {
      const data = await api('interview/coach', { question: source.question, answer: source.answer, profile });
      const c = data.coaching;
      const lis = (arr) => (Array.isArray(arr) && arr.length ? `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="hint">—</p>');
      back.querySelector('#coachBody').outerHTML = `
        <div class="coach-sec"><h4>Problems</h4>${lis(c.problems)}</div>
        <div class="coach-sec"><h4>Missing information</h4>${lis(c.missing)}</div>
        <div class="coach-sec"><h4>Better structure</h4><p>${escapeHtml(c.betterStructure)}</p></div>
        <div class="coach-sec"><h4>Example of a strong answer (illustrative — replace with your own truth)</h4><div class="example-box">${escapeHtml(c.exampleAnswer)}</div></div>
        <div class="coach-sec"><h4>New similar question to practice</h4><p>${escapeHtml(c.newSimilarQuestion)}</p></div>
        <div class="coach-sec"><h4>Keep it authentic</h4><p style="color:var(--ok)">${escapeHtml(c.authenticityNote)}</p></div>`;
    } catch (e) {
      back.querySelector('#coachBody').textContent = e.message;
    }
  }

  /* ---------- wiring ---------- */
  $('profileBtn').addEventListener('click', openProfile);
  $('editProfileBtn').addEventListener('click', openProfile);
  $('saveProfileBtn').addEventListener('click', saveProfile);
  $('cancelProfileBtn').addEventListener('click', () => { pendingType = null; showHome(); });
  $('micBtn').addEventListener('click', toggleMic);
  $('submitAnswerBtn').addEventListener('click', submitAnswer);
  $('endEarlyBtn').addEventListener('click', endEarly);
  $('answerInput').addEventListener('input', updateVoiceMeta);
  $('ttsToggle').addEventListener('click', () => {
    store.set(LS.tts, !ttsOn());
    if (!ttsOn()) try { speechSynthesis.cancel(); } catch {}
    paintTts();
  });
  $('resumeBtn').addEventListener('click', () => {
    const a = store.get(LS.active, null);
    if (!a) return;
    session = a;
    enterInterviewView(true);
  });
  $('discardBtn').addEventListener('click', () => {
    if (!confirm('Discard the unfinished interview?')) return;
    store.del(LS.active); renderResumeCard();
  });
  $('logoutBtn').addEventListener('click', async () => {
    try { await api('auth/logout', {}); } catch {}
    localStorage.removeItem(LS.token);
    location.href = '/';
  });

  initMic();

  (async function boot() {
    const token = localStorage.getItem(LS.token);
    if (!token) { location.href = '/'; return; }
    try {
      const me = await api('auth/me');
      $('whoami').textContent = me.username;
      const cfg = await api('config').catch(() => ({ dailyLimit: 15 }));
      usage.limit = cfg.dailyLimit || 15;
      const prof = await api('profile');
      profile = prof.profile;
      const list = await api('interviews');
      history = list.interviews || [];
      usage.used = history.filter((h) => Date.now() - new Date(h.created_at).getTime() < 24 * 3600 * 1000).length;
      showHome();
    } catch (e) {
      if (e.message !== 'Signed out') NotifySafe(e.message);
    }
  })();
})();
