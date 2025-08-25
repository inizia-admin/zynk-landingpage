/* =========================
   Zynk — front-end logic
   ========================= */

/* 0) CONFIG */
const GAS_URL = 'https://script.google.com/a/macros/inizia.agency/s/AKfycbwMqmn9WKaiqaZp2QWq91WgflVsJibzG7lPowXuKwelPO62yb4nyVkSSKrJGni5QJkNKw/exec';

/* 1) UTILITIES */
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

// Fire-and-forget POST using text/plain to avoid CORS preflight
async function sendToSheet(payload) {
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // Queue locally and retry later
    const q = JSON.parse(localStorage.getItem('zynk_queue') || '[]');
    q.push(payload);
    localStorage.setItem('zynk_queue', JSON.stringify(q));
  }
}

async function flushQueue() {
  const q = JSON.parse(localStorage.getItem('zynk_queue') || '[]');
  if (!q.length) return;
  for (const payload of q) {
    try {
      await fetch(GAS_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // still failing; keep queue
      return;
    }
  }
  localStorage.removeItem('zynk_queue');
}
flushQueue();
window.addEventListener('online', flushQueue);

/* 2) FOOTER YEAR */
(function setYear(){
  const y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();
})();

/* 3) SIGNUP FORM HANDLER */
(function signupHandler(){
  const form = document.getElementById('interest-form');
  if (!form) return;
  const statusEl = document.getElementById('form-status');

  form.addEventListener('submit', async (e) => {
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

    // Local save (optional)
    const entries = JSON.parse(localStorage.getItem('zynk_interest') || '[]');
    entries.push({ name, email, date: new Date().toISOString(), ...pageContext() });
    localStorage.setItem('zynk_interest', JSON.stringify(entries));

    // Send to Google Sheet
    await sendToSheet({
      type: 'signup',
      name,
      email,
      ...pageContext()
    });

    if (statusEl){ statusEl.textContent = 'Thanks! You’re on the waitlist.'; statusEl.style.color = 'green'; }
    form.reset();
  });
})();

/* 4) CLICK / CTA TRACKING */
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
function attachTracking(){
  const clickable = document.querySelectorAll('a.btn, button.btn');
  clickable.forEach(el => {
    if (!el.dataset.tracked) {
      el.addEventListener('click', trackClickHandler);
      el.dataset.tracked = '1';
    }
  });
}
attachTracking();

/* 5) TESTIMONIALS: HIDE SCROLLBAR + AUTO-SCROLL IN LOOP */
(function autoScrollTestimonials(){
  const row = document.getElementById('trow');
  if (!row) return;

  // Hide scrollbar cross-browser with inline styles (in case CSS not loaded yet)
  row.style.overflowX = 'auto';
  row.style.scrollbarWidth = 'none';
  row.style.msOverflowStyle = 'none';
  row.addEventListener('wheel', () => {}, {passive:true});
  // WebKit
  const style = document.createElement('style');
  style.textContent = `
    #trow::-webkit-scrollbar{ display:none; }
  `;
  document.head.appendChild(style);

  // Duplicate children once for seamless wrap
  const kids = Array.from(row.children);
  row.append(...kids.map(n => n.cloneNode(true)));

  // Auto scroll
  let paused = false;
  let speed = 0.6; // px per frame
  function tick(){
    if (!paused){
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

/* 6) (Optional) Make preview cards link to register if clicked */
(function makePreviewsClickable(){
  const figs = document.querySelectorAll('#previews .phone-card');
  figs.forEach(fig => {
    fig.style.cursor = 'pointer';
    fig.addEventListener('click', () => {
      // track the click with a custom label
      sendToSheet({
        type: 'event',
        event: 'click',
        label: 'Preview Card',
        section: 'previews',
        href: '#register',
        ...pageContext()
      });
      // navigate
      location.hash = '#register';
    });
  });
})();
