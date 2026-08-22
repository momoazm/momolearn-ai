const Notify = (() => {
  const KEY = 'momo.notifications';
  let enabled = false;
  try { enabled = localStorage.getItem(KEY) === 'on'; } catch {}

  const host = document.createElement('div');
  host.className = 'notify-host';
  document.body.appendChild(host);

  let audioCtx;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [880, 1318].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + i * 0.13);
        g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.13 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.13 + 0.28);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + i * 0.13);
        o.stop(t + i * 0.13 + 0.32);
      });
    } catch {}
  }

  function native(title, body, kind) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body,
        tag: 'momo-chat',
        renotify: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  }

  function toast(title, body, kind) {
    const el = document.createElement('div');
    el.className = `notify ${kind}`;
    el.setAttribute('role', 'status');

    const h = document.createElement('strong');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    const close = document.createElement('button');
    close.className = 'notify-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '\u00d7';

    el.append(h, p, close);
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    let timer = setTimeout(kill, 6000);
    function kill() {
      clearTimeout(timer);
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }
    close.addEventListener('click', kill);
    el.addEventListener('click', (e) => {
      if (e.target === close) return;
      kill();
      window.focus();
      if (typeof input !== 'undefined') input.focus();
    });
  }

  function push({ title, body = '', kind = 'ok' }) {
    toast(title, body, kind);
    if (!enabled || !document.hidden) return;
    chime();
    native(title, body, kind);
  }

  async function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    if (on && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    return enabled;
  }

  return {
    push,
    setEnabled,
    get enabled() { return enabled; },
  };
})();
