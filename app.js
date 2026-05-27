/* Ramazzini landing — app glue
   - Mounts shader canvases (hero, gallery tiles, final CTA, lightbox)
   - Drives the How-it-works step rotation
   - In-view reveals + nav scroll state
   - Beta counter + Tweaks panel
*/
(function () {
  'use strict';

  /* ---------- Tweakable defaults (host can rewrite this block) ---------- */
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "heroShader": "aurora",
    "ctaShader": "topography",
    "seatsRemaining": 25
  }/*EDITMODE-END*/;

  /* ---------- Backend integration config ----------
     Developers: see HANDOFF.md for full wiring instructions.

     PUBLIC_STRIPE_PRICE_ID  → the Stripe Price (one-time, $14.99 USD) that
                              the backend `/api/checkout` route uses to
                              create a Checkout Session and return its URL.
     SEATS_ENDPOINT          → GET returns { remaining: <int 0..25> }.
                              Front-end polls this every 30s so the counter
                              stays live as new sign-ups come in.
     CHECKOUT_ENDPOINT       → POST. Server creates a Stripe Checkout Session
                              and returns { url } to redirect to.
     GOOGLE_AUTH_ENDPOINT    → GET. Kicks off Google OAuth, then redirects
                              back to the post-payment success page.
  */
  const API = {
    SEATS_ENDPOINT:       '/api/seats',
    CHECKOUT_ENDPOINT:    '/api/checkout',
    GOOGLE_AUTH_ENDPOINT: '/auth/google',
    PUBLIC_STRIPE_PRICE_ID: 'price_REPLACE_ME',
  };

  let state = Object.assign({}, TWEAK_DEFAULTS);

  /* ---------- Shader instances ---------- */
  const instances = {};

  function mountHero() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    instances.hero = new window.ShaderCanvas(canvas, { shader: state.heroShader });
  }

  function mountFinalCta() {
    // Final CTA is now a flat panel — no shader backdrop. Intentionally a no-op.
    // If you want the animated shader back, re-add <canvas id="finalCtaCanvas"> to
    // index.html and uncomment the block below.
    // const canvas = document.getElementById('finalCtaCanvas');
    // if (!canvas) return;
    // instances.cta = new window.ShaderCanvas(canvas, { shader: state.ctaShader });
  }

  /* ---------- How it works — scroll-driven step rotation ----------
     The demo is `position: sticky` and stays pinned while the user scrolls
     past each step. We find whichever step's center is closest to the
     viewport center and mark it active.                                  */
  function setupHow() {
    const steps = Array.from(document.querySelectorAll('.step'));
    const mocks = Array.from(document.querySelectorAll('.mock'));
    const demoTitle = document.getElementById('demoTitle');
    const genPct = document.getElementById('genPct');
    const titles = [
      'ramazzini.app  /  upload',
      'ramazzini.app  /  context',
      'ramazzini.app  /  generate',
    ];
    let current = -1;

    function setActive(i) {
      if (i === current) return;
      current = i;
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
      mocks.forEach((m, k) => m.classList.toggle('is-active', k === i));
      if (demoTitle) demoTitle.textContent = titles[i] || titles[0];

      // restart progress text for gen step
      clearInterval(window.__genTick);
      if (i === 2 && genPct) {
        let v = 0;
        window.__genTick = setInterval(() => {
          v = Math.min(100, v + Math.random() * 9);
          genPct.textContent = Math.round(v) + '%';
          if (v >= 100) clearInterval(window.__genTick);
        }, 80);
      }
    }

    function pickActive() {
      const targetY = window.innerHeight / 2;
      let bestI = 0, bestD = Infinity;
      steps.forEach((s, k) => {
        const r = s.getBoundingClientRect();
        const c = r.top + r.height / 2;
        const d = Math.abs(c - targetY);
        if (d < bestD) { bestD = d; bestI = k; }
      });
      setActive(bestI);
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { pickActive(); ticking = false; });
    }

    // also allow click to jump to that step
    steps.forEach((s, k) => s.addEventListener('click', () => {
      const r = s.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 2 + r.height / 2, behavior: 'smooth' });
    }));

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    pickActive();
  }

  /* ---------- In-view reveals ---------- */
  function setupReveals() {
    const io = new IntersectionObserver((ents) => {
      ents.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    function observeAll() {
      document.querySelectorAll('.reveal:not(.is-in)').forEach(el => {
        if (!el.dataset.revealObserved) {
          el.dataset.revealObserved = '1';
          io.observe(el);
        }
      });
    }
    observeAll();
    // Re-scan after CMS injects templated cards (features grid, roadmap, FAQ items).
    window.addEventListener('cms:applied', observeAll);
  }

  /* ---------- Nav scrolled state ---------- */
  function setupNav() {
    const nav = document.getElementById('nav');
    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 30);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Beta counter + dynamic user-initial stack ---------- */
  /* Plausible initial-pair pool. The backend will replace this with real
     initials derived from each buyer's name (Google sign-in / Stripe metadata).
     See HANDOFF.md § "Granting beta access".                                  */
  const FAKE_INITIALS = [
    'MR','CD','AY','JL','TS','KP','RN','EH','SO','BV',
    'NW','GF','LM','DH','PA','ZK','QT','IB','VC','HG',
    'YS','XO','UJ','OE','FN','RD','LP','MA','SC','TT',
  ];
  /* persist who has "joined" in this demo so a refresh doesn't wipe the stack */
  function loadJoined() {
    try { return JSON.parse(localStorage.getItem('ram_joined') || '[]'); }
    catch { return []; }
  }
  function saveJoined(arr) {
    try { localStorage.setItem('ram_joined', JSON.stringify(arr)); } catch {}
  }
  function pickInitials(existing) {
    const used = new Set(existing);
    const pool = FAKE_INITIALS.filter(i => !used.has(i));
    if (!pool.length) return 'U' + (existing.length + 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* Render the avatar stack from the array of joined initials. */
  function renderUserStack() {
    const joined = loadJoined();
    const wrap    = document.getElementById('userStack');
    const inner   = document.getElementById('userStackInner');
    const count   = document.getElementById('userStackCount');
    if (!wrap || !inner) return;

    if (joined.length === 0) { wrap.hidden = true; return; }
    wrap.hidden = false;

    // Show the most-recent 3 initials, then a "+N" chip if more.
    const recent = joined.slice(-3).reverse();
    const extra  = Math.max(0, joined.length - 3);
    inner.innerHTML = '';
    recent.forEach((ini) => {
      const av = document.createElement('span');
      av.className = 'av';
      av.textContent = ini;
      inner.appendChild(av);
    });
    if (extra > 0) {
      const more = document.createElement('span');
      more.className = 'av av--more';
      more.textContent = '+' + extra;
      inner.appendChild(more);
    }
    if (count) count.textContent = joined.length + ' user' + (joined.length === 1 ? '' : 's');
  }

  function setupCounter() {
    const num = document.getElementById('counterNum');
    const eyebrow = document.getElementById('beta-eyebrow-count');
    const final = document.getElementById('finalCount');
    const bar = document.getElementById('progressBar');
    const v = Math.max(0, Math.min(25, state.seatsRemaining|0));
    if (num) num.textContent = v;
    if (eyebrow) eyebrow.textContent = v;
    if (final) final.textContent = v;
    if (bar) bar.style.width = ((25 - v) / 25 * 100) + '%';
    renderUserStack();
  }

  /* ---------- Feature card mouse-glow ---------- */
  function setupFeatGlow() {
    document.querySelectorAll('.feat').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top)  + 'px');
      });
    });
  }

  /* ---------- Join Beta clicks → open modal ---------- */
  function setupJoin() {
    document.querySelectorAll('[data-action="join"]').forEach((el) => {
      el.addEventListener('click', () => openJoinModal());
    });
  }

  /* ---------- Watch demo → scroll to hero + autoplay
                Expand icon → fullscreen lightbox ---------- */
  function setupWatchDemo() {
    const heroVideo = document.getElementById('heroDemoVideo');
    const heroDemo  = document.getElementById('heroDemo');
    const lightbox  = document.getElementById('demoLightbox');
    const lbVideo   = document.getElementById('demoLightboxVideo');
    if (!heroVideo || !lightbox || !lbVideo) return;

    function playHero() {
      try {
        heroVideo.currentTime = heroVideo.currentTime || 0;
        const p = heroVideo.play();
        if (p && p.catch) p.catch(() => { /* autoplay blocked → user can hit play */ });
      } catch (e) { /* noop */ }
    }
    heroVideo.addEventListener('play',  () => heroDemo.classList.add('is-playing'));
    heroVideo.addEventListener('pause', () => heroDemo.classList.remove('is-playing'));
    heroVideo.addEventListener('ended', () => heroDemo.classList.remove('is-playing'));

    // Browser autoplay policies sometimes silently block the `autoplay`
    // attribute even when the video is muted. Kick playback ourselves on
    // init, and again once metadata is loaded for safety.
    function kickAutoplay() {
      // ensure muted so the browser's autoplay policy is satisfied
      heroVideo.muted = true;
      const p = heroVideo.play();
      if (p && p.catch) p.catch(() => { /* still blocked — overlay covers it */ });
    }
    kickAutoplay();
    heroVideo.addEventListener('loadedmetadata', kickAutoplay, { once: true });
    heroVideo.addEventListener('canplay',        kickAutoplay, { once: true });

    // Any "Watch demo" button (or the centered play overlay):
    // smooth-scroll to hero, then play.
    document.querySelectorAll('[data-action="watch-demo"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const rect = heroDemo.getBoundingClientRect();
        const nav  = document.getElementById('nav');
        const offset = (nav ? nav.offsetHeight : 0) + 16;
        // If already in view, skip the scroll
        const inView = rect.top > 80 && rect.top < (window.innerHeight - 200);
        if (!inView) {
          window.scrollTo({ top: window.scrollY + rect.top - offset, behavior: 'smooth' });
          setTimeout(playHero, 650);
        } else {
          playHero();
        }
      });
    });

    // Expand icon → fullscreen lightbox
    function openLightbox() {
      // pause hero so we only have one audio source
      try { heroVideo.pause(); } catch (e) {}
      lbVideo.currentTime = heroVideo.currentTime || 0;
      lightbox.hidden = false;
      requestAnimationFrame(() => lightbox.classList.add('is-open'));
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('demo-open');
      const p = lbVideo.play();
      if (p && p.catch) p.catch(() => {});
    }
    function closeLightbox() {
      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('demo-open');
      try { lbVideo.pause(); } catch (e) {}
      setTimeout(() => { lightbox.hidden = true; }, 240);
    }

    document.querySelectorAll('[data-action="expand-demo"]').forEach((btn) => {
      btn.addEventListener('click', openLightbox);
    });
    document.querySelectorAll('[data-action="close-demo"]').forEach((btn) => {
      btn.addEventListener('click', closeLightbox);
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('is-open')) closeLightbox();
    });
  }

  /* ---------- Join Beta modal ---------- */
  function setupJoinModal() {
    const modal     = document.getElementById('joinModal');
    const closeBtn  = document.getElementById('joinClose');
    const backdrop  = document.getElementById('joinBackdrop');
    const stripeBtn = document.getElementById('joinStripeBtn');
    const googleBtn = document.getElementById('joinGoogleBtn');
    const seatBig   = document.getElementById('joinSeatCount');

    function refreshSeatCount() {
      if (seatBig) seatBig.textContent = state.seatsRemaining;
    }
    refreshSeatCount();

    // Stripe Checkout — hosted Payment Link
    stripeBtn.addEventListener('click', () => {
      stripeBtn.disabled = true;
      stripeBtn.innerHTML = stripeBtn.innerHTML.replace(/Pay \$14\.99 with Stripe/, 'Redirecting\u2026');
      window.location.href = 'https://buy.stripe.com/dRmbJ11vugR2gO17ouaEE01';
    });

    // Google OAuth — dev: replace with real redirect to /auth/google
    googleBtn.addEventListener('click', () => {
      // === REAL IMPLEMENTATION ===
      // window.location.href = API.GOOGLE_AUTH_ENDPOINT;
      // === END REAL ===

      // demo: just close the modal and toast
      closeJoinModal();
      console.info('[demo] Google sign-in clicked. Wire up /auth/google in HANDOFF.md.');
    });

    function open() {
      refreshSeatCount();
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    window.openJoinModal  = open;
    window.closeJoinModal = close;
  }

  /* Simulate a successful payment (DEMO ONLY).
     The real backend will decrement seats and notify all clients;
     this just fakes it for the static demo. */
  function simulatePaymentSuccess() {
    if (state.seatsRemaining > 0) state.seatsRemaining -= 1;
    const joined = loadJoined();
    joined.push(pickInitials(joined));
    saveJoined(joined);
    setupCounter();
    closeJoinModal();
    toast('You\'re in! Check your inbox for next steps. \ud83c\udf3f');
  }

  /* ---------- Tiny toast ---------- */
  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', left: '50%', bottom: '32px',
      transform: 'translateX(-50%) translateY(20px)',
      background: 'hsl(150 40% 10%)', color: 'white',
      padding: '14px 22px', borderRadius: '9999px',
      fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: '600',
      boxShadow: '0 20px 50px -16px hsl(150 40% 10% / 0.5)',
      zIndex: '400', opacity: '0',
      transition: 'opacity 280ms ease, transform 280ms cubic-bezier(0.34,1.56,0.64,1)',
    });
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => t.remove(), 320);
    }, 3000);
  }

  /* ---------- Poll backend for seat count ----------
     Disabled in demo (no backend). Uncomment in production. */
  // function pollSeats() {
  //   fetch(API.SEATS_ENDPOINT).then(r => r.json()).then(({ remaining }) => {
  //     state.seatsRemaining = remaining;
  //     setupCounter();
  //   }).catch(() => {});
  // }
  // setInterval(pollSeats, 30000); pollSeats();

  /* ---------- Tweaks panel ---------- */
  function setupTweaks() {
    let panel = null;
    function buildPanel() {
      if (panel) return;
      panel = document.createElement('div');
      panel.id = 'tweaks-panel';
      panel.innerHTML = `
        <style>
          #tweaks-panel { position: fixed; right: 24px; bottom: 24px; z-index: 300;
            width: 280px; padding: 16px; border-radius: 18px;
            background: hsl(140 30% 98% / 0.94);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid hsl(var(--border));
            box-shadow: 0 24px 64px -20px hsl(152 45% 35% / 0.35);
            font-family: var(--font-sans);
            animation: tweaksIn 250ms var(--ease-out); }
          @keyframes tweaksIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          #tweaks-panel .tw-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
          #tweaks-panel .tw-title { font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: hsl(var(--primary)); }
          #tweaks-panel .tw-close { width: 24px; height: 24px; border: 0; border-radius: 50%; background: hsl(var(--secondary)); cursor: pointer; display: grid; place-items: center; color: hsl(var(--primary)); }
          #tweaks-panel .tw-section { margin-bottom: 12px; }
          #tweaks-panel .tw-label { font-size: 11px; font-weight: 600; color: hsl(var(--muted-foreground)); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
          #tweaks-panel .tw-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
          #tweaks-panel .tw-chip {
            font-size: 10px; font-weight: 700; padding: 8px 4px;
            border-radius: 9px; border: 1px solid hsl(var(--border));
            background: white; cursor: pointer;
            transition: background 200ms, color 200ms, border-color 200ms;
            color: hsl(var(--muted-foreground));
            text-align: center;
          }
          #tweaks-panel .tw-chip:hover { border-color: hsl(var(--primary) / 0.4); }
          #tweaks-panel .tw-chip.is-on {
            background: linear-gradient(135deg, hsl(152 45% 35%), hsl(160 55% 48%));
            color: white; border-color: transparent;
          }
          #tweaks-panel .tw-slider { display: flex; align-items: center; gap: 10px; }
          #tweaks-panel input[type=range] { flex: 1; accent-color: hsl(var(--primary)); }
          #tweaks-panel .tw-val { font-size: 12px; font-weight: 700; min-width: 32px; text-align: right; color: hsl(var(--foreground)); font-variant-numeric: tabular-nums; }
        </style>
        <div class="tw-head">
          <span class="tw-title">Tweaks</span>
          <button class="tw-close" aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="tw-section">
          <div class="tw-label">Hero wallpaper</div>
          <div class="tw-row" data-knob="heroShader">
            <button class="tw-chip" data-v="aurora">Aurora</button>
            <button class="tw-chip" data-v="liquid">Liquid</button>
            <button class="tw-chip" data-v="ripple">Ripple</button>
            <button class="tw-chip" data-v="topography">Topo</button>
            <button class="tw-chip" data-v="constellation">Const</button>
          </div>
        </div>

        <div class="tw-section">
          <div class="tw-label">Seats remaining</div>
          <div class="tw-slider">
            <input type="range" id="tw-seats" min="0" max="25" step="1" />
            <span class="tw-val" id="tw-seats-val"></span>
          </div>
        </div>
      `;
      document.body.appendChild(panel);

      function refresh() {
        panel.querySelectorAll('[data-knob]').forEach((row) => {
          const k = row.dataset.knob;
          row.querySelectorAll('.tw-chip').forEach((b) => {
            b.classList.toggle('is-on', b.dataset.v === state[k]);
          });
        });
        const s = panel.querySelector('#tw-seats');
        const sv = panel.querySelector('#tw-seats-val');
        s.value = state.seatsRemaining;
        sv.textContent = state.seatsRemaining + ' / 25';
      }
      refresh();

      panel.querySelectorAll('.tw-chip').forEach((b) => {
        b.addEventListener('click', () => {
          const k = b.parentElement.dataset.knob;
          state[k] = b.dataset.v;
          refresh();
          if (k === 'heroShader' && instances.hero) instances.hero.setShader(state[k]);
          if (k === 'ctaShader'  && instances.cta)  instances.cta.setShader(state[k]);
          window.parent?.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: state[k] } }, '*');
        });
      });
      panel.querySelector('#tw-seats').addEventListener('input', (e) => {
        state.seatsRemaining = +e.target.value;
        refresh();
        setupCounter();
        window.parent?.postMessage({ type: '__edit_mode_set_keys', edits: { seatsRemaining: state.seatsRemaining } }, '*');
      });
      panel.querySelector('.tw-close').addEventListener('click', () => {
        panel.remove(); panel = null;
        window.parent?.postMessage({ type: '__edit_mode_dismissed' }, '*');
      });
    }
    window.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode')   buildPanel();
      if (d.type === '__deactivate_edit_mode') { panel?.remove(); panel = null; }
    });
    window.parent?.postMessage({ type: '__edit_mode_available' }, '*');
  }

  /* ---------- Sign-in modal ---------- */
  function setupSigninModal() {
    const modal     = document.getElementById('signinModal');
    if (!modal) return;
    const closeBtn  = document.getElementById('signinClose');
    const backdrop  = document.getElementById('signinBackdrop');
    const googleBtn = document.getElementById('signinGoogleBtn');
    const form      = document.getElementById('signinForm');
    const submitLbl = document.getElementById('signinSubmitLabel');
    const heading   = document.getElementById('signinHeading');
    const sub       = document.getElementById('signinSub');
    const swapHint  = document.getElementById('signinSwapHint');
    const tabs      = modal.querySelectorAll('.signin-tab');

    modal.dataset.mode = 'signin';

    function setMode(mode) {
      modal.dataset.mode = mode;
      tabs.forEach((t) => t.classList.toggle('is-on', t.dataset.mode === mode));
      if (mode === 'signup') {
        heading.innerHTML = 'Create your <em>account.</em>';
        sub.textContent   = "Set up your Ramazzini login. Already have one? Sign in instead.";
        submitLbl.textContent = 'Create account';
        swapHint.innerHTML = 'Already have an account? <a href="#" data-swap="signin">Sign in</a>.';
      } else {
        heading.innerHTML = 'Welcome <em>back.</em>';
        sub.textContent   = 'Sign in to your Ramazzini beta account.';
        submitLbl.textContent = 'Sign in';
        swapHint.innerHTML = 'No account yet? <a href="#" data-swap="signup">Create one</a>.';
      }
    }
    tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
    swapHint.addEventListener('click', (e) => {
      const link = e.target.closest('[data-swap]');
      if (!link) return;
      e.preventDefault();
      setMode(link.dataset.swap);
    });

    // Form submit — DEMO. Real backend: POST /api/auth/login or /api/auth/signup
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // === REAL IMPLEMENTATION ===
      // const data = new FormData(form);
      // const endpoint = modal.dataset.mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      // const res  = await fetch(endpoint, { method: 'POST', body: data });
      // const json = await res.json();
      // if (res.ok) location.href = '/app';
      // else        showError(json.error);
      // === END REAL ===

      // demo
      close();
      toast(modal.dataset.mode === 'signup' ? 'Account created — check your email to verify.' : 'Signed in!');
    });

    googleBtn.addEventListener('click', () => {
      // === REAL: window.location.href = API.GOOGLE_AUTH_ENDPOINT; ===
      close();
      toast('Continuing with Google…');
    });

    function open() {
      setMode('signin');
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Sign-in trigger from the nav
    document.querySelectorAll('[data-action="signin"]').forEach((el) => {
      el.addEventListener('click', (e) => { e.preventDefault(); open(); });
    });

    window.openSigninModal  = open;
    window.closeSigninModal = close;
  }

  /* ---------- Init ---------- */
  function init() {
    // CMS sync — if cms-loader is present, mirror seat count from content.json
    if (typeof window.__SEATS_REMAINING === 'number') {
      state.seatsRemaining = window.__SEATS_REMAINING;
    }
    window.addEventListener('cms:applied', (e) => {
      const c = e.detail || {};
      if (c.seats && typeof c.seats.remaining === 'number') {
        state.seatsRemaining = c.seats.remaining;
        setupCounter();
      }
    });
    mountHero();
    mountFinalCta();
    setupHow();
    setupReveals();
    setupNav();
    setupCounter();
    setupFeatGlow();
    setupJoin();
    setupWatchDemo();
    setupJoinModal();
    setupSigninModal();
    setupTweaks();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
