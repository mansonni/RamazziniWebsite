/* ============================================================
   Ramazzini CMS Loader
   Reads content.json at startup and applies all values to the
   DOM. Markers:
     data-cms="path"           → set textContent
     data-cms-html="path"      → set innerHTML
     data-cms-src="path"       → set src attribute
     data-cms-href="path"      → set href attribute
     data-cms-mailto="path"    → set href="mailto:..."
     data-cms-show="path"      → hide the element when value is false
     data-cms-list="path"      → repeat the child <template> for each item;
                                  inside, data-cms paths are relative to the item
   Theme colors are written to CSS custom properties on :root.
   ============================================================ */
(function () {
  'use strict';

  // Allow admin panel to inject in-memory content via window.__CMS_CONTENT
  // so preview reflects unsaved edits.
  function getContent() {
    if (window.__CMS_CONTENT) return Promise.resolve(window.__CMS_CONTENT);
    const url = (document.currentScript && document.currentScript.dataset.src) || 'content.json';
    return fetch(url + '?t=' + Date.now())
      .then((r) => {
        if (!r.ok) throw new Error('content.json HTTP ' + r.status);
        return r.json();
      })
      .catch((err) => {
        // Fallback: inline JSON for sandboxed previews or first-load before content.json exists.
        const inline = document.getElementById('cms-content');
        if (inline) {
          try { return JSON.parse(inline.textContent); }
          catch (e) { console.warn('[CMS] inline #cms-content JSON parse failed', e); }
        }
        throw err;
      });
  }

  function dig(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
  }

  function applyTo(root, content) {
    // text
    root.querySelectorAll('[data-cms]').forEach((el) => {
      const v = dig(content, el.dataset.cms);
      if (v != null) el.textContent = v;
    });
    // html
    root.querySelectorAll('[data-cms-html]').forEach((el) => {
      const v = dig(content, el.dataset.cmsHtml);
      if (v != null) el.innerHTML = v;
    });
    // src
    root.querySelectorAll('[data-cms-src]').forEach((el) => {
      const v = dig(content, el.dataset.cmsSrc);
      if (v) el.setAttribute('src', v);
    });
    // href
    root.querySelectorAll('[data-cms-href]').forEach((el) => {
      const v = dig(content, el.dataset.cmsHref);
      if (v) el.setAttribute('href', v);
    });
    // mailto
    root.querySelectorAll('[data-cms-mailto]').forEach((el) => {
      const v = dig(content, el.dataset.cmsMailto);
      if (v) el.setAttribute('href', 'mailto:' + v);
    });
    // visibility
    root.querySelectorAll('[data-cms-show]').forEach((el) => {
      const v = dig(content, el.dataset.cmsShow);
      el.hidden = v === false;
      if (v === false) el.style.display = 'none';
      else el.style.removeProperty('display');
    });
  }

  function renderLists(content) {
    document.querySelectorAll('[data-cms-list]').forEach((host) => {
      const tmpl = host.querySelector('template');
      if (!tmpl) return;
      const path = host.dataset.cmsList;
      const arr = dig(content, path);
      if (!Array.isArray(arr)) return;
      // Remove previously rendered items (anything that isn't the template)
      [...host.children].forEach((c) => {
        if (c.tagName !== 'TEMPLATE') c.remove();
      });
      arr.forEach((item, i) => {
        const frag = tmpl.content.cloneNode(true);
        applyItemBindings(frag, item, i);
        host.appendChild(frag);
      });
    });
    // Grouped lists: group items by a key, with a group-header template + item template.
    document.querySelectorAll('[data-cms-grouped-list]').forEach((host) => {
      const path = host.dataset.cmsGroupedList;
      const key = host.dataset.cmsGroupBy || 'group';
      const arr = dig(content, path);
      if (!Array.isArray(arr)) return;
      const gtmpl = host.querySelector('template[data-template="group"]');
      const itmpl = host.querySelector('template[data-template="item"]');
      if (!itmpl) return;
      [...host.children].forEach((c) => { if (c.tagName !== 'TEMPLATE') c.remove(); });
      // Preserve original order; collect groups in encounter order.
      const groups = [];
      const byGroup = new Map();
      arr.forEach((item) => {
        const g = item[key] || '';
        if (!byGroup.has(g)) { byGroup.set(g, []); groups.push(g); }
        byGroup.get(g).push(item);
      });
      groups.forEach((g) => {
        if (gtmpl && g) {
          const gf = gtmpl.content.cloneNode(true);
          applyItemBindings(gf, { [key]: g, label: g }, 0);
          host.appendChild(gf);
        }
        byGroup.get(g).forEach((item, i) => {
          const f = itmpl.content.cloneNode(true);
          applyItemBindings(f, item, i);
          host.appendChild(f);
        });
      });
    });
  }

  function applyItemBindings(frag, item, i) {
    frag.querySelectorAll('[data-cms]').forEach((el) => {
      const v = dig(item, el.dataset.cms);
      if (v != null) el.textContent = v;
    });
    frag.querySelectorAll('[data-cms-html]').forEach((el) => {
      const v = dig(item, el.dataset.cmsHtml);
      if (v != null) el.innerHTML = v;
    });
    frag.querySelectorAll('[data-cms-class]').forEach((el) => {
      const [k, cls] = el.dataset.cmsClass.split(':');
      if (item[k]) el.classList.add(cls);
    });
    frag.querySelectorAll('[data-cms-stagger]').forEach((el) => {
      el.setAttribute('data-delay', String((i % 3) + 1));
    });
  }

  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement.style;
    if (theme.background) root.setProperty('--cms-bg', theme.background);
    if (theme.primary) root.setProperty('--cms-primary', theme.primary);
    if (theme.accent) root.setProperty('--cms-accent', theme.accent);
  }

  function applyPricingAndSeats(content) {
    const price = content.pricing && content.pricing.amount;
    const cur = content.pricing && content.pricing.currency;
    if (price) {
      document.querySelectorAll('.price-pill').forEach((el) => {
        const small = el.querySelector('small');
        el.firstChild && (el.firstChild.nodeValue = '$' + price);
        if (small) small.textContent = cur || '';
      });
      // Join modal headline price
      const amt = document.querySelector('.join-modal__amount');
      if (amt) {
        const [whole, cents] = String(price).split('.');
        amt.innerHTML = '<span class="cur">$</span>' + whole + (cents ? '<span class="cents">.' + cents + '</span>' : '');
      }
      // Stripe button label
      const stripeBtn = document.getElementById('joinStripeBtn');
      if (stripeBtn) {
        const txt = stripeBtn.lastChild;
        if (txt && txt.nodeType === 3) txt.nodeValue = ' Pay $' + price + ' with Stripe';
      }
    }
    const seats = content.seats || {};
    if (seats.remaining != null) {
      ['beta-eyebrow-count', 'counterNum', 'finalCount', 'joinSeatCount'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = seats.remaining;
      });
      // Tell app.js what the starting count is, in case it uses one.
      window.__SEATS_REMAINING = seats.remaining;
      window.__SEATS_TOTAL = seats.total;
    }
    if (seats.total != null) {
      document.querySelectorAll('[data-seat-total]').forEach((el) => {
        el.textContent = seats.total;
      });
    }
  }

  function apply(content) {
    if (!content) return;
    document.title = (content.meta && content.meta.title) || document.title;
    const md = document.querySelector('meta[name="description"]');
    if (md && content.meta && content.meta.description) md.setAttribute('content', content.meta.description);
    applyTheme(content.theme);
    renderLists(content);
    applyTo(document, content);
    applyPricingAndSeats(content);
    // Notify (admin uses this to re-bind any custom JS).
    window.dispatchEvent(new CustomEvent('cms:applied', { detail: content }));
  }

  // Expose for the admin panel.
  window.__CMS = { apply, getContent };

  document.addEventListener('DOMContentLoaded', () => {
    getContent().then(apply).catch((err) => {
      console.warn('[CMS] content.json missing or invalid — using static fallback.', err);
    });
  });
})();
