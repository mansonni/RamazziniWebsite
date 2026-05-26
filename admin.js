/* ============================================================
   Ramazzini · Control Panel
   ------------------------------------------------------------
   - Lock screen (shared password, plaintext compare = casual security)
   - Reads ./content.json, lets you edit every field
   - Publishes by committing content.json directly to GitHub
   - Cloudinary unsigned upload for images/video
   - Stores GitHub PAT + Cloudinary creds in localStorage only

   ⚠️  Change the shared password below before deploying.
   ============================================================ */
'use strict';

/* ---------- 0. Config you can change in one line -------------- */
const ADMIN_USERNAME = 'ramazzini';
const ADMIN_PASSWORD = '11041633';

/* ---------- 1. State + storage -------------------------------- */
const LS = {
  PAT:      'ramazzini.cms.gh_pat',
  OWNER:    'ramazzini.cms.gh_owner',
  REPO:     'ramazzini.cms.gh_repo',
  BRANCH:   'ramazzini.cms.gh_branch',
  CLOUD:    'ramazzini.cms.cd_cloud',
  PRESET:   'ramazzini.cms.cd_preset',
  UNLOCKED: 'ramazzini.cms.unlocked',
};
const settings = {
  get(k, d) { return localStorage.getItem(LS[k]) || d || ''; },
  set(k, v) { v ? localStorage.setItem(LS[k], v) : localStorage.removeItem(LS[k]); },
};

let content = null;       // working copy
let dirty = false;
let currentSection = 'site';

/* ---------- 2. Toast helper ----------------------------------- */
function toast(msg, kind) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (kind ? ' is-' + kind : '');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------- 3. Lock screen ------------------------------------ */
const lockForm = document.getElementById('lockForm');
const lockEl   = document.getElementById('lock');
const appEl    = document.getElementById('app');
const lockHint = document.getElementById('lockHint');

function unlock() {
  lockEl.hidden = true;
  appEl.hidden = false;
  sessionStorage.setItem(LS.UNLOCKED, '1');
  boot();
}
function lock() {
  sessionStorage.removeItem(LS.UNLOCKED);
  location.reload();
}
lockForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const user = document.getElementById('lockUser').value.trim();
  const pw = document.getElementById('lockPw').value;
  if (user === ADMIN_USERNAME && pw === ADMIN_PASSWORD) {
    unlock();
  } else {
    lockHint.textContent = 'Incorrect username or password.';
    lockHint.classList.add('is-error');
  }
});
if (sessionStorage.getItem(LS.UNLOCKED) === '1') unlock();

/* ---------- 4. Settings dialog -------------------------------- */
const settingsDialog = document.getElementById('settingsDialog');
const settingsFields = ['ghOwner', 'ghRepo', 'ghBranch', 'ghToken', 'cdCloud', 'cdPreset'];
const settingsToKey = {
  ghOwner: 'OWNER', ghRepo: 'REPO', ghBranch: 'BRANCH',
  ghToken: 'PAT',   cdCloud: 'CLOUD', cdPreset: 'PRESET',
};

function openSettings() {
  settingsDialog.hidden = false;
  Object.entries(settingsToKey).forEach(([id, key]) => {
    document.getElementById(id).value = settings.get(key);
  });
}
function closeSettings() { settingsDialog.hidden = true; }
function saveSettings() {
  Object.entries(settingsToKey).forEach(([id, key]) => {
    settings.set(key, document.getElementById(id).value.trim());
  });
  closeSettings();
  toast('Settings saved', 'success');
}

/* ---------- 5. Path helpers ----------------------------------- */
function dig(obj, path) {
  return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
}
function put(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  let cur = obj;
  for (const k of keys) { if (cur[k] == null) cur[k] = {}; cur = cur[k]; }
  cur[last] = val;
}

function markDirty() {
  dirty = true;
  const btn = document.getElementById('publishLabel');
  if (btn && !btn.querySelector('.dirty-dot')) {
    btn.insertAdjacentHTML('beforeend', '<span class="dirty-dot"></span>');
  }
}
function markClean() {
  dirty = false;
  document.querySelectorAll('.dirty-dot').forEach((d) => d.remove());
}

/* ---------- 6. Schema (drives the UI) ------------------------- */
/* Each section: { id, label, render(content) -> HTMLElement } */
const SCHEMA = [
  { id: 'site',     label: 'Site & SEO',  render: renderSite },
  { id: 'theme',    label: 'Theme colors', render: renderTheme },
  { id: 'nav',      label: 'Top navigation', render: renderNav },
  { id: 'pricing',  label: 'Pricing & seats', render: renderPricing },
  { id: 'hero',     label: 'Hero', render: renderHero },
  { id: 'how',      label: 'How it works', render: renderHow },
  { id: 'features', label: 'The Value (features)', render: renderFeatures },
  { id: 'roadmap',  label: 'Roadmap', render: renderRoadmap },
  { id: 'finalCta', label: 'Final CTA', render: renderFinalCta },
  { id: 'footer',   label: 'Footer', render: renderFooter },
  { id: 'faq',      label: 'FAQ', render: renderFaq },
];

/* ---------- 7. Field builders --------------------------------- */
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function textField(label, path, opts) {
  opts = opts || {};
  const input = el('input', {
    type: 'text',
    value: dig(content, path) || '',
    placeholder: opts.placeholder || '',
    oninput: (e) => { put(content, path, e.target.value); markDirty(); }
  });
  return el('label', { class: 'field' }, el('span', null, label), input);
}
function textArea(label, path, opts) {
  opts = opts || {};
  const ta = el('textarea', {
    placeholder: opts.placeholder || '',
    rows: opts.rows || 3,
    oninput: (e) => { put(content, path, e.target.value); markDirty(); }
  });
  ta.value = dig(content, path) || '';
  const wrap = el('label', { class: 'field' }, el('span', null, label), ta);
  if (opts.hint) wrap.appendChild(el('p', { class: 'hint' }, opts.hint));
  return wrap;
}
function numberField(label, path, opts) {
  opts = opts || {};
  const input = el('input', {
    type: 'number',
    value: dig(content, path) ?? '',
    min: opts.min, max: opts.max, step: opts.step || 1,
    oninput: (e) => { put(content, path, e.target.value === '' ? null : Number(e.target.value)); markDirty(); }
  });
  return el('label', { class: 'field' }, el('span', null, label), input);
}
function colorField(label, path) {
  const val = dig(content, path) || '#000000';
  const hex = el('input', { type: 'color', value: normalizeHex(val) });
  const txt = el('input', { type: 'text', value: val, spellcheck: 'false' });
  hex.addEventListener('input', () => { txt.value = hex.value; put(content, path, hex.value); markDirty(); });
  txt.addEventListener('input', () => {
    put(content, path, txt.value);
    if (/^#[0-9a-f]{6}$/i.test(txt.value)) hex.value = txt.value;
    markDirty();
  });
  return el('label', { class: 'field' },
    el('span', null, label),
    el('div', { class: 'color-row' }, hex, txt));
}
function normalizeHex(v) {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  return '#000000';
}
function toggleField(label, path) {
  const input = el('input', {
    type: 'checkbox',
    onchange: (e) => { put(content, path, e.target.checked); markDirty(); }
  });
  if (dig(content, path) !== false) input.checked = true;
  return el('label', { class: 'toggle' }, input, label);
}

/* ---------- 8. Image / video picker --------------------------- */
function imageField(label, path, opts) {
  opts = opts || {};
  const accept = opts.accept || 'image/*';
  const isVideo = accept.startsWith('video');

  const preview = el('div', { class: 'image-picker__preview' });
  const urlInput = el('input', {
    type: 'text', placeholder: 'https://… or relative path',
    value: dig(content, path) || '',
    oninput: (e) => { put(content, path, e.target.value); applyPreview(); markDirty(); }
  });
  const file = el('input', { type: 'file', accept: accept, hidden: true });
  const status = el('div', { class: 'image-picker__status' });
  const btn = el('button', {
    class: 'btn btn--small', type: 'button',
    onclick: () => file.click()
  }, 'Upload…');

  function applyPreview() {
    const v = urlInput.value;
    if (!v) { preview.style.background = ''; preview.textContent = ''; return; }
    if (isVideo) {
      preview.style.background = '#000';
      preview.textContent = '🎬';
      preview.style.display = 'grid';
      preview.style.placeItems = 'center';
      preview.style.color = '#fff';
      preview.style.fontSize = '24px';
    } else {
      preview.style.backgroundImage = `url(${JSON.stringify(v)})`;
    }
  }
  applyPreview();

  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    const cloud = settings.get('CLOUD'), preset = settings.get('PRESET');
    if (!cloud || !preset) {
      toast('Set Cloudinary cloud name + upload preset in Settings first.', 'error');
      openSettings();
      return;
    }
    status.textContent = 'Uploading…';
    try {
      const url = await cloudinaryUpload(file.files[0], cloud, preset, isVideo);
      urlInput.value = url;
      put(content, path, url);
      applyPreview();
      markDirty();
      status.textContent = 'Uploaded ✓';
    } catch (err) {
      console.error(err);
      status.textContent = 'Upload failed: ' + err.message;
      toast('Upload failed: ' + err.message, 'error');
    }
  });

  return el('div', { class: 'field' },
    el('span', null, label),
    el('div', { class: 'image-picker' },
      preview,
      el('div', { class: 'image-picker__controls' }, urlInput, btn, file, status)
    )
  );
}

async function cloudinaryUpload(file, cloud, preset, isVideo) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', preset);
  const url = `https://api.cloudinary.com/v1_1/${cloud}/${isVideo ? 'video' : 'image'}/upload`;
  const r = await fetch(url, { method: 'POST', body: fd });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Cloudinary ' + r.status + ' ' + t.slice(0, 120));
  }
  const j = await r.json();
  return j.secure_url;
}

/* ---------- 9. List card builder ------------------------------ */
/*
   listEditor({
     path: 'roadmap.items',
     itemLabel: (item, i) => item.title || '#'+(i+1),
     defaults: () => ({ title:'', body:'', chip:'', icon:'…' }),
     fields: [
       { kind: 'text', label: 'Chip', key: 'chip' },
       { kind: 'text', label: 'Title', key: 'title' },
       { kind: 'textarea', label: 'Body', key: 'body' },
       { kind: 'toggle', label: 'Secret', key: 'secret' },
       { kind: 'textarea', label: 'Icon SVG', key: 'icon', hint: 'Inline SVG markup' }
     ]
   })
*/
function listEditor(opts) {
  const wrap = el('div');
  const arr = dig(content, opts.path) || [];
  if (!Array.isArray(dig(content, opts.path))) put(content, opts.path, arr);

  function rerender() { wrap.replaceWith(rebuild()); }
  function rebuild() {
    const w = el('div');
    arr.forEach((item, i) => {
      const card = el('div', { class: 'card' });
      const head = el('div', { class: 'card__head' },
        el('h4', null, opts.itemLabel(item, i)),
        el('div', { class: 'card__actions' },
          el('button', {
            class: 'btn btn--small', type: 'button',
            disabled: i === 0,
            onclick: () => { swap(arr, i, i - 1); markDirty(); rerender(); }
          }, '↑'),
          el('button', {
            class: 'btn btn--small', type: 'button',
            disabled: i === arr.length - 1,
            onclick: () => { swap(arr, i, i + 1); markDirty(); rerender(); }
          }, '↓'),
          el('button', {
            class: 'btn btn--small btn--danger', type: 'button',
            onclick: () => {
              if (!confirm('Delete this item?')) return;
              arr.splice(i, 1); markDirty(); rerender();
            }
          }, 'Delete'),
        )
      );
      card.appendChild(head);
      opts.fields.forEach((f) => {
        const fpath = opts.path + '.' + i + '.' + f.key;
        let node;
        if (f.kind === 'text') node = textField(f.label, fpath, f);
        else if (f.kind === 'textarea') node = textArea(f.label, fpath, f);
        else if (f.kind === 'toggle') node = el('div', { class: 'field' }, toggleField(f.label, fpath));
        else if (f.kind === 'image') node = imageField(f.label, fpath, f);
        if (node) card.appendChild(node);
      });
      w.appendChild(card);
    });
    w.appendChild(el('div', { class: 'add-row' },
      el('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => { arr.push(opts.defaults()); markDirty(); rerender(); }
      }, '+ Add ' + (opts.itemNoun || 'item'))
    ));
    return w;
  }
  const built = rebuild();
  wrap.appendChild(built);
  return wrap;
}
function swap(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }

/* ---------- 10. Section renderers ----------------------------- */
function sectionShell(title, lede, ...children) {
  return el('div', null,
    el('h1', null, title),
    lede ? el('p', { class: 'lede' }, lede) : null,
    ...children
  );
}
function panel(...children) {
  return el('div', { class: 'section' }, ...children);
}

function renderSite() {
  return sectionShell('Site & SEO', 'Browser tab title and meta description.',
    panel(
      textField('Page title', 'meta.title'),
      textArea('Meta description', 'meta.description', { rows: 2 }),
    )
  );
}
function renderTheme() {
  return sectionShell('Theme colors', 'Hex values. Currently wired to a few CSS variables — most colors are still in styles.css; this is here so future tints can be CMS-controlled.',
    panel(
      colorField('Background', 'theme.background'),
      colorField('Primary', 'theme.primary'),
      colorField('Accent', 'theme.accent'),
    )
  );
}
function renderNav() {
  return sectionShell('Top navigation', 'Brand mark + nav link labels.',
    panel(
      el('div', { class: 'field--row' },
        textField('Brand name', 'nav.brand'),
        textField('Brand suffix', 'nav.brandSuffix', { placeholder: ' AI' }),
      ),
      textField('Link 1 label', 'nav.link1'),
      textField('Link 2 label', 'nav.link2'),
      textField('Link 3 label', 'nav.link3'),
      textField('Link 4 label', 'nav.link4'),
      textField('Sign-in label', 'nav.signin'),
      textField('Header CTA label', 'nav.ctaLabel'),
    )
  );
}
function renderPricing() {
  return sectionShell('Pricing & seats', 'Amount and currency shown on all CTAs. Seat count drives the counter, eyebrow, and the lower band.',
    panel(
      el('h3', null, 'Pricing'),
      el('div', { class: 'field--row' },
        textField('Amount', 'pricing.amount', { placeholder: '14.99' }),
        textField('Currency', 'pricing.currency', { placeholder: 'CAD' }),
      ),
      el('h3', null, 'Seats'),
      el('div', { class: 'field--row' },
        numberField('Total seats', 'seats.total', { min: 1 }),
        numberField('Seats remaining', 'seats.remaining', { min: 0 }),
      ),
    )
  );
}
function renderHero() {
  return sectionShell('Hero', 'Top of the page. Eyebrow, headline, subtitle, video, and the Founding-cohort card.',
    panel(
      toggleField('Hero section visible', 'hero.visible'),
    ),
    panel(
      el('h3', null, 'Eyebrow'),
      el('div', { class: 'field--row' },
        textField('Prefix (before seat count)', 'hero.eyebrowPrefix'),
        textField('Suffix (after seat count)', 'hero.eyebrowSuffix'),
      ),
      el('h3', null, 'Headline'),
      textField('Line 1', 'hero.headlineLine1'),
      el('div', { class: 'field--row' },
        textField('Line 2 prefix', 'hero.headlineLine2Prefix'),
        textField('Accent word', 'hero.headlineAccent'),
      ),
      textField('Line 2 suffix', 'hero.headlineLine2Suffix'),
      el('h3', null, 'Subtitle'),
      textArea('Subtitle (HTML allowed)', 'hero.subtitle', { rows: 3, hint: 'You can use <strong>, <em>, <br>.' }),
      el('h3', null, 'CTA labels'),
      el('div', { class: 'field--row' },
        textField('Primary CTA', 'hero.ctaPrimary'),
        textField('Secondary CTA', 'hero.ctaSecondary'),
      ),
      el('h3', null, 'Demo video'),
      imageField('Video URL', 'hero.videoSrc', { accept: 'video/*' }),
    ),
    panel(
      el('h3', null, 'Founding cohort card'),
      textField('Card label', 'hero.betaCardLabel'),
      textField('Card chip', 'hero.betaCardChip'),
      el('div', { class: 'field--row' },
        textField('Counter top line', 'hero.betaCardMetaTop'),
        textField('Counter bottom line', 'hero.betaCardMetaBottom'),
      ),
      textField('Card CTA', 'hero.betaCardCta'),
    )
  );
}
function renderHow() {
  return sectionShell('How it works', 'Three-step explainer. Step count is fixed — edit each below.',
    panel(toggleField('Section visible', 'how.visible')),
    panel(
      textField('Eyebrow', 'how.eyebrow'),
      textArea('Title (HTML allowed)', 'how.title', { rows: 2 }),
      textArea('Subtitle', 'how.subtitle', { rows: 2 }),
    ),
    panel(
      el('h3', null, 'Step 1'),
      textField('Number label', 'how.steps.0.num'),
      textField('Title', 'how.steps.0.title'),
      textArea('Body', 'how.steps.0.body'),
    ),
    panel(
      el('h3', null, 'Step 2'),
      textField('Number label', 'how.steps.1.num'),
      textField('Title', 'how.steps.1.title'),
      textArea('Body', 'how.steps.1.body'),
    ),
    panel(
      el('h3', null, 'Step 3'),
      textField('Number label', 'how.steps.2.num'),
      textField('Title', 'how.steps.2.title'),
      textArea('Body', 'how.steps.2.body'),
    ),
  );
}
function renderFeatures() {
  return sectionShell('The Value (features)', 'The 6-up benefits grid. Add / remove / reorder freely.',
    panel(toggleField('Section visible', 'features.visible')),
    panel(
      textField('Eyebrow', 'features.eyebrow'),
      textArea('Title (HTML allowed)', 'features.title', { rows: 2 }),
      textArea('Subtitle', 'features.subtitle', { rows: 2 }),
    ),
    listEditor({
      path: 'features.items',
      itemNoun: 'feature',
      itemLabel: (it, i) => it.title || `Feature ${i + 1}`,
      defaults: () => ({ icon: defaultIcon(), title: 'New feature', body: '', stat: '' }),
      fields: [
        { kind: 'text',     label: 'Title (HTML allowed)', key: 'title' },
        { kind: 'textarea', label: 'Body', key: 'body' },
        { kind: 'text',     label: 'Stat line (HTML allowed)', key: 'stat',
          hint: 'e.g. "⏱  <b>6–10 hrs</b> · saved per report"' },
        { kind: 'textarea', label: 'Icon SVG (inline)', key: 'icon',
          hint: 'Inline <svg>…</svg> — keep viewBox 0 0 24 24 and stroke="currentColor".' },
      ],
    })
  );
}
function renderRoadmap() {
  return sectionShell('Roadmap', 'Future / cooking-on-the-stove cards. Order = display order.',
    panel(toggleField('Section visible', 'roadmap.visible')),
    panel(
      textField('Eyebrow', 'roadmap.eyebrow'),
      textArea('Title (HTML allowed)', 'roadmap.title', { rows: 2 }),
      textArea('Subtitle', 'roadmap.subtitle', { rows: 2 }),
    ),
    listEditor({
      path: 'roadmap.items',
      itemNoun: 'roadmap item',
      itemLabel: (it, i) => it.title || `Item ${i + 1}`,
      defaults: () => ({ icon: defaultIcon(), chip: 'TBD', title: 'New item', body: '', secret: false }),
      fields: [
        { kind: 'text',     label: 'Chip label', key: 'chip' },
        { kind: 'text',     label: 'Title', key: 'title' },
        { kind: 'textarea', label: 'Body', key: 'body' },
        { kind: 'toggle',   label: 'Render as "secret menu" style', key: 'secret' },
        { kind: 'textarea', label: 'Icon SVG (inline)', key: 'icon' },
      ],
    })
  );
}
function renderFinalCta() {
  return sectionShell('Final CTA', 'The closing panel before the footer.',
    panel(toggleField('Section visible', 'finalCta.visible')),
    panel(
      textArea('Title (HTML allowed)', 'finalCta.title', { rows: 2 }),
      textArea('Subtitle', 'finalCta.subtitle', { rows: 2 }),
      el('div', { class: 'field--row' },
        textField('Primary CTA', 'finalCta.ctaPrimary'),
        textField('Secondary CTA', 'finalCta.ctaSecondary'),
      ),
      textField('Hint (after seat count)', 'finalCta.hint'),
    )
  );
}
function renderFooter() {
  return sectionShell('Footer', 'Copyright line and the contact email.',
    panel(
      textField('Copyright line', 'footer.copyright'),
      textField('Contact email', 'footer.contactEmail', { placeholder: 'support@…' }),
    )
  );
}
function renderFaq() {
  return sectionShell('FAQ', 'Questions and answers shown on /faq.html. Items are grouped by the Group field — leave it blank for ungrouped items.',
    panel(
      listEditor({
        path: 'faq',
        itemNoun: 'question',
        itemLabel: (it, i) => it.question || `Q ${i + 1}`,
        defaults: () => ({ group: '', question: '', answer: '' }),
        fields: [
          { kind: 'text',     label: 'Group (heading)', key: 'group', hint: 'Items with the same group cluster together. Leave empty for no heading.' },
          { kind: 'text',     label: 'Question', key: 'question' },
          { kind: 'textarea', label: 'Answer (HTML allowed)', key: 'answer', rows: 4 },
        ],
      })
    )
  );
}

function defaultIcon() {
  return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/></svg>";
}

/* ---------- 11. Sidebar + render router ----------------------- */
function buildSidebar() {
  const side = document.getElementById('sidebar');
  side.innerHTML = '';
  SCHEMA.forEach((s) => {
    const b = el('button', {
      class: 'side__item' + (s.id === currentSection ? ' is-on' : ''),
      type: 'button',
      onclick: () => { currentSection = s.id; render(); }
    }, s.label);
    side.appendChild(b);
  });
}
function render() {
  buildSidebar();
  const c = document.getElementById('content');
  c.innerHTML = '';
  const def = SCHEMA.find((s) => s.id === currentSection) || SCHEMA[0];
  c.appendChild(def.render(content));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------- 12. Load + publish -------------------------------- */
async function loadContent() {
  // Try fetching content.json from the same origin (works on GitHub Pages).
  try {
    const r = await fetch('content.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) return r.json();
  } catch (e) { /* ignore */ }

  // Try GitHub raw / API (works cross-origin, useful if running admin.html locally).
  const owner = settings.get('OWNER'), repo = settings.get('REPO'),
        branch = settings.get('BRANCH', 'main'), pat = settings.get('PAT');
  if (owner && repo) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/content.json?ref=${branch || 'main'}`;
      const headers = { Accept: 'application/vnd.github+json' };
      if (pat) headers.Authorization = 'Bearer ' + pat;
      const r = await fetch(url, { headers });
      if (r.ok) {
        const j = await r.json();
        const decoded = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))));
        return JSON.parse(decoded);
      }
    } catch (e) { /* ignore */ }
  }

  // Final fallback: inline JSON seed embedded in admin.html (first-load defaults).
  const seed = document.getElementById('cms-seed');
  if (seed) {
    try { return JSON.parse(seed.textContent); } catch (e) { /* ignore */ }
  }

  toast('Could not load content.json — using empty draft. Set GitHub credentials in Settings.', 'error');
  return {};
}

async function publish() {
  if (!dirty) {
    toast('No changes to publish.', 'success');
    return;
  }
  const owner = settings.get('OWNER'), repo = settings.get('REPO'),
        branch = settings.get('BRANCH', 'main'), pat = settings.get('PAT');
  if (!owner || !repo || !pat) {
    toast('Set GitHub repo + PAT in Settings first.', 'error');
    openSettings();
    return;
  }
  const label = document.getElementById('publishLabel');
  label.dataset.state = 'busy';
  label.textContent = 'Publishing';
  try {
    const path = 'content.json';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // 1. Get current SHA (required when updating an existing file).
    let sha;
    const getR = await fetch(url + '?ref=' + branch, {
      headers: { Authorization: 'Bearer ' + pat, Accept: 'application/vnd.github+json' }
    });
    if (getR.ok) {
      sha = (await getR.json()).sha;
    } else if (getR.status !== 404) {
      throw new Error('GitHub GET ' + getR.status + ' — check repo + PAT');
    }

    // 2. PUT new content.
    const body = {
      message: 'Content update via control panel',
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n'))),
      branch,
    };
    if (sha) body.sha = sha;

    const putR = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + pat, Accept: 'application/vnd.github+json' },
      body: JSON.stringify(body),
    });
    if (!putR.ok) {
      const t = await putR.text();
      throw new Error('GitHub PUT ' + putR.status + ' — ' + t.slice(0, 200));
    }
    markClean();
    label.textContent = 'Publish to live site';
    label.dataset.state = '';
    toast('Published. GitHub Pages will rebuild in ~30s.', 'success');
  } catch (err) {
    console.error(err);
    label.textContent = 'Publish to live site';
    label.dataset.state = '';
    toast(err.message, 'error');
  }
}

/* ---------- 13. Export / import / preview --------------------- */
function exportJson() {
  const blob = new Blob([JSON.stringify(content, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'content.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importJsonFile() {
  const input = document.getElementById('importFile');
  input.value = '';
  input.click();
}
function handleImport(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      content = JSON.parse(reader.result);
      markDirty();
      render();
      toast('Imported. Review and Publish to commit.', 'success');
    } catch (err) {
      toast('Invalid JSON: ' + err.message, 'error');
    }
  };
  reader.readAsText(f);
}

/* ---------- 14. Boot ------------------------------------------ */
async function boot() {
  document.getElementById('publishBtn').addEventListener('click', publish);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  document.getElementById('settingsSave').addEventListener('click', saveSettings);
  document.querySelectorAll('[data-close="settings"]').forEach((b) => b.addEventListener('click', closeSettings));
  document.getElementById('exportBtn').addEventListener('click', exportJson);
  document.getElementById('importBtn').addEventListener('click', importJsonFile);
  document.getElementById('importFile').addEventListener('change', handleImport);
  document.getElementById('previewBtn').addEventListener('click', () => window.open('index.html', '_blank'));
  document.getElementById('lockBtn').addEventListener('click', lock);
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  content = await loadContent();
  // Ensure expected branches exist so the UI doesn't crash on a fresh skeleton.
  ensureSkeleton(content);
  render();
}

function ensureSkeleton(c) {
  const def = {
    meta: { title: '', description: '' },
    theme: { background: '#0b0d0c', primary: '#7BD389', accent: '#7BD389' },
    nav: {},
    pricing: { amount: '14.99', currency: 'CAD' },
    seats: { total: 25, remaining: 25 },
    hero: { visible: true },
    how: { visible: true, steps: [{}, {}, {}] },
    features: { visible: true, items: [] },
    roadmap: { visible: true, items: [] },
    finalCta: { visible: true },
    footer: {},
    faq: [],
  };
  for (const k of Object.keys(def)) {
    if (c[k] == null) c[k] = def[k];
  }
  if (!Array.isArray(c.how.steps)) c.how.steps = [{}, {}, {}];
  while (c.how.steps.length < 3) c.how.steps.push({});
  if (!Array.isArray(c.features.items)) c.features.items = [];
  if (!Array.isArray(c.roadmap.items)) c.roadmap.items = [];
  if (!Array.isArray(c.faq)) c.faq = [];
}
