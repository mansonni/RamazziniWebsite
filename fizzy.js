/* Fizzy button JS — populates .fizzy elements with their orbit spots,
   and adds a soft click ripple. Idempotent. */
(function () {
  'use strict';
  function makeFizzy(el, count) {
    if (el.dataset.fizzyReady) return;
    el.dataset.fizzyReady = '1';
    const well = document.createElement('span');
    well.className = 'fizzy__well';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = 'fizzy__spot';
      well.appendChild(dot);
    }
    el.appendChild(well);

    el.addEventListener('click', (e) => {
      const r = document.createElement('span');
      r.className = 'fizzy-ripple';
      const rect = el.getBoundingClientRect();
      r.style.left = (e.clientX - rect.left) + 'px';
      r.style.top  = (e.clientY - rect.top ) + 'px';
      el.appendChild(r);
      setTimeout(() => r.remove(), 700);
    });
  }
  function init(root = document) {
    root.querySelectorAll('.fizzy').forEach((el) => {
      const c = el.classList.contains('fizzy--sm') ? 24 : 52;
      makeFizzy(el, c);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else { init(); }
  window.FizzyInit = init;
})();
