/* glossary.js - click-to-open .gloss popups.

   Each .gloss term carries: data-title, data-body, data-link, data-linktext.
   We render an absolutely-positioned .gloss-pop (styled in base.css) near the
   term on click or Enter/Space. It flips above the term if it would overflow
   below, and clamps horizontally to stay in the viewport. Outside click or
   Escape closes it. One popup at a time. */

let currentPop = null;
let currentTerm = null;

export function initGlossary(root = document) {
  const terms = root.querySelectorAll('.gloss');
  for (const t of terms) wireTerm(t);

  // Global close handlers - installed once, but idempotent-safe if this fn
  // is called again with a different subtree (rewires just the new terms).
  if (!initGlossary._installed) {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true });
    initGlossary._installed = true;
  }
}

function wireTerm(term) {
  if (term.dataset.glossReady) return;
  term.dataset.glossReady = '1';
  if (!term.hasAttribute('tabindex'))     term.setAttribute('tabindex', '0');
  if (!term.hasAttribute('role'))         term.setAttribute('role', 'button');
  if (!term.hasAttribute('aria-haspopup'))term.setAttribute('aria-haspopup', 'true');
  term.setAttribute('aria-expanded', 'false');

  term.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle(term);
  });
  term.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggle(term);
    }
  });
}

function toggle(term) {
  if (currentTerm === term) { close(); return; }
  open(term);
}

function open(term) {
  close();
  const pop = document.createElement('div');
  pop.className = 'gloss-pop';
  pop.setAttribute('role', 'dialog');

  const title  = term.getAttribute('data-title')    || '';
  const body   = term.getAttribute('data-body')     || '';
  const link   = term.getAttribute('data-link')     || '';
  const linkT  = term.getAttribute('data-linktext') || 'Learn more';

  if (title) {
    const h = document.createElement('h5');
    h.textContent = title;
    pop.appendChild(h);
  }
  if (body) {
    const p = document.createElement('p');
    p.textContent = body;
    pop.appendChild(p);
  }
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = `${linkT} ↗`;   // arrow indicating external link
    pop.appendChild(a);
  }

  document.body.appendChild(pop);
  position(pop, term);

  currentPop = pop;
  currentTerm = term;
  term.setAttribute('aria-expanded', 'true');
}

function close() {
  if (!currentPop) return;
  currentPop.remove();
  currentTerm?.setAttribute('aria-expanded', 'false');
  currentPop = null;
  currentTerm = null;
}

/* Position the popup below the term by default, flipping above if it would
   overflow the viewport, and clamping horizontally. Uses document-space
   coordinates so the popup scrolls with the page. */
function position(pop, term) {
  const r  = term.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8;

  let top  = r.bottom + margin;
  let left = r.left + r.width / 2 - pw / 2;
  if (top + ph > vh - margin) top = r.top - ph - margin;
  if (top < margin) top = margin;
  left = Math.max(margin, Math.min(vw - pw - margin, left));

  pop.style.top  = (top  + window.scrollY) + 'px';
  pop.style.left = (left + window.scrollX) + 'px';
}

function reposition() {
  if (currentPop && currentTerm) position(currentPop, currentTerm);
}

function onDocClick(e) {
  if (!currentPop) return;
  if (currentPop.contains(e.target)) return;
  if (currentTerm && currentTerm.contains(e.target)) return;
  close();
}

function onDocKey(e) {
  if (e.key === 'Escape') close();
}
