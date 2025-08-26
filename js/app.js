/* =========================
   Zynk — front-end logic
   ========================= */

/* CONFIG */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwMqmn9WKaiqaZp2QWq91WgflVsJibzG7lPowXuKwelPO62yb4nyVkSSKrJGni5QJkNKw/exec';

/* UTILITIES */
function pageContext() {
  return {
    page: location.pathname + location.search + location.hash,
    userAgent: navigator.userAgent,
    utm: getUTM()
  };
}
function getUTM() {
  const p = new URLSearchParams(location.search);
  const keys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref'];
  const out = {};
  keys.forEach(k => { if (p.get(k)) out[k] = p.get(k); });
  return out;
}

/* Fire-and-forget POST (beacon/fetch/queue) */
function sendToSheet(payload) {
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'text/plain' });

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(GAS_URL, blob);
    if (ok) return Promise.resolve();
  }

  return fetch(GAS_URL, {
    method: 'POST',
    mode: 'no-cors',
    keepalive: true,
    headers: { 'Content-Type': 'text/plain' },
    body: json
  }).catch(() => {
    try {
      const q = JSON.parse(localStorage.getItem('zynk_queue') || '[]');
      q.push(payload);
      localStorage.setItem('zynk_queue', JSON.stringify(q));
    } catch {}
  });
}

async function flushQueue() {
  let q;
  try { q = JSON.parse(localStorage.getItem('zynk_queue') || '[]'); } catch { q = []; }
  if (!q.length) return;
  const rest = [];
  for (const payload of q) {
    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
    } catch {
      rest.push(payload);
    }
  }
  if (rest.length) localStorage.setItem('zynk_queue', JSON.stringify(rest));
  else localStorage.removeItem('zynk_queue');
}
flushQueue();
window.addEventListener('online', flushQueue);

/* FOOTER YEAR */
(() => {
  const y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();
})();

/* MOBILE NAV TOGGLE + SMOOTH SCROLL WITH OFFSET */
(() => {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('main-nav');
  if (!toggle || !menu) return;

  const closeMenu = () => {
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    document.body.classList.remove('no-scroll');
  };

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('no-scroll', isOpen);
  });

  // Close when clicking a link
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu()));

  // Smooth scroll with sticky header offset
  const header = document.querySelector('header.nav');
  const headerH = () => (header?.offsetHeight || 0);

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - (headerH() + 12));
      window.scrollTo({ top, behavior: 'smooth' });
      history.replaceState(null, '', id);
    });
  });
})();

/* SIGNUP FORM */
(() => {
  const form = document.getElementById('interest-form');
  if (!form) return;
  const statusEl = document.getElementById('form-status');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (form.fullName?.value || '').trim();
    const email = (form.email?.value || '').trim();

    if (!name || !email) {
      if (statusEl){ statusEl.textContent = 'Please fill in all fields.'; statusEl.style.color = 'red'; }
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      if (statusEl){ statusEl.textContent = 'Enter a valid email.'; statusEl.style.color = 'red'; }
      return;
    }

    try {
      const entries = JSON.parse(localStorage.getItem('zynk_interest') || '[]');
      entries.push({ name, email, date: new Date().toISOString(), ...pageContext() });
      localStorage.setItem('zynk_interest', JSON.stringify(entries));
    } catch {}

    sendToSheet({ type: 'signup', name, email, ...pageContext() });

    if (statusEl){ statusEl.textContent = 'Thanks! You’re on the waitlist.'; statusEl.style.color = 'green'; }
    form.reset();
  });
})();

/* CLICK / CTA TRACKING */
function trackClickHandler(evt) {
  const el = evt.currentTarget;
  const label = el.getAttribute('data-label') || el.textContent.trim();
  const section = el.getAttribute('data-section') || el.closest('section')?.id || 'unknown';
  const href = el.getAttribute('href') || '';
  sendToSheet({
    type: 'event',
    event: 'click',
    label,
    section,
    href,
    ...pageContext()
  });
}
(function attachTracking(){
  const clickable = document.querySelectorAll('a.btn, button.btn, .phone-card[role="link"]');
  clickable.forEach(el => {
    if (!el.dataset.tracked) {
      el.addEventListener('click', trackClickHandler);
      el.dataset.tracked = '1';
    }
  });
})();

/* TESTIMONIALS AUTO-SCROLL (respects reduced motion) */
(() => {
  const row = document.getElementById('trow');
  if (!row) return;

  // Hide scrollbar cross-browser
  row.style.overflowX = 'auto';
  row.style.scrollbarWidth = 'none';
  row.style.msOverflowStyle = 'none';
  const style = document.createElement('style');
  style.textContent = `#trow::-webkit-scrollbar{ display:none; }`;
  document.head.appendChild(style);

  // Clone for seamless loop
  const kids = Array.from(row.children);
  row.append(...kids.map(n => n.cloneNode(true)));

  let paused = false;
  let speed = 0.6;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick(){
    if (!paused && !prefersReduced){
      row.scrollLeft += speed;
      const half = row.scrollWidth / 2;
      if (row.scrollLeft >= half){ row.scrollLeft -= half; }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const pause = () => paused = true;
  const resume = () => paused = false;
  row.addEventListener('mouseenter', pause);
  row.addEventListener('mouseleave', resume);
  row.addEventListener('touchstart', pause, {passive:true});
  row.addEventListener('touchend', () => setTimeout(resume, 800), {passive:true});
  row.addEventListener('focusin', pause);
  row.addEventListener('focusout', () => setTimeout(resume, 200));
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });
})();

/* PREVIEW CARDS → REGISTER (click + keyboard) */
(() => {
  const figs = document.querySelectorAll('#previews .phone-card');
  figs.forEach(fig => {
    fig.style.cursor = 'pointer';
    const go = () => {
      sendToSheet({
        type: 'event',
        event: 'click',
        label: 'Preview Card',
        section: 'previews',
        href: '#register',
        ...pageContext()
      });
      const header = document.querySelector('header.nav');
      const target = document.querySelector('#register');
      if (!target) return;
      const y = Math.max(0, target.getBoundingClientRect().top + window.scrollY - ((header?.offsetHeight || 0) + 12));
      window.scrollTo({ top: y, behavior: 'smooth' });
      history.replaceState(null, '', '#register');
    };
    fig.addEventListener('click', go);
    fig.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
})();

/* Tiny console test */
window._zynkTest = (label='console test') =>
  sendToSheet({ type:'event', event:'test', label, section:'console', href: location.href, ...pageContext() });
