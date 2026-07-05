/* main.js - boot + integration glue.
   Builds the hero, wires the sidebar/scrollspy/progress bar, initializes the
   glossary, and lazily mounts each station when it nears the viewport. Station
   internals live in scripts/stations/*; here we only call their init(section). */

import { EQUATION, MOLECULES, COLORS } from './tokens.js';
import { mountStage } from './engine.js';
import { ParticleSystem } from './particles.js';
import { initGlossary } from './glossary.js';

import { init as initS0 } from './stations/s0-air.js';
import { init as initS1 } from './stations/s1-zoom.js';
import { init as initS2 } from './stations/s2-chloroplast.js';
import { init as initS3 } from './stations/s3-light.js';
import { init as initS4 } from './stations/s4-calvin.js';
import { init as initS5 } from './stations/s5-daynight.js';
import { init as initS6 } from './stations/s6-green.js';

const STATIONS = {
  s0: initS0, s1: initS1, s2: initS2, s3: initS3,
  s4: initS4, s5: initS5, s6: initS6,
};

/* ---------- hero equation (colored per the Molecule Color Law) ---------- */
function buildEquation() {
  const el = document.getElementById('hero-equation');
  if (!el) return;
  for (const part of EQUATION) {
    const span = document.createElement('span');
    span.textContent = part.t;
    if (part.cls) span.className = part.cls;
    el.appendChild(span);
  }
}

/* ---------- hero ambient: drifting photons + faint molecules ---------- */
function buildHero() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ps = new ParticleSystem(320);
  const species = ['photon', 'photon', 'photon', 'co2', 'h2o', 'o2', 'electron'];
  let acc = 0;

  mountStage(canvas, (ctx, dt, t, W, H) => {
    // dark radial wash so the title reads
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(20,48,32,0.55)');
    g.addColorStop(1, 'rgba(4,16,11,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // spawn drifting particles from the top-left (sunlight coming in)
    acc += dt;
    while (acc > 0.09 && ps.count < 300) {
      acc -= 0.09;
      const type = species[(Math.random() * species.length) | 0];
      const fromTop = Math.random() < 0.6;
      const x = fromTop ? Math.random() * W : -20;
      const y = fromTop ? -20 : Math.random() * H;
      ps.spawn(type, x, y, {
        vx: 26 + Math.random() * 30,
        vy: 20 + Math.random() * 26,
        life: 12,
        scale: type === 'photon' ? 1 : 0.8,
      });
    }
    // recycle particles that leave the canvas
    ps.update(dt);
    ps.draw(ctx);
  }, { background: null });
}

/* ---------- progress bar ---------- */
function wireProgress() {
  const bar = document.getElementById('progress');
  if (!bar) return;
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- scrollspy: highlight active TOC entry ---------- */
function wireScrollspy() {
  const links = [...document.querySelectorAll('.toc a')];
  const byId = new Map(links.map(a => [a.dataset.target, a]));
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        links.forEach(a => a.classList.remove('active'));
        const a = byId.get(e.target.id);
        if (a) a.classList.add('active');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('section.station').forEach(s => obs.observe(s));
}

/* ---------- mobile sidebar toggle ---------- */
function wireMenu() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  sidebar.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => sidebar.classList.remove('open')));
}

/* ---------- lazy-mount each station near the viewport ---------- */
function wireStations() {
  const mounted = new Set();
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || mounted.has(e.target.id)) continue;
      const init = STATIONS[e.target.id];
      if (!init) continue;
      mounted.add(e.target.id);
      try {
        init(e.target);
      } catch (err) {
        console.error('Station ' + e.target.id + ' failed to init:', err);
      }
    }
  }, { rootMargin: '250px 0px 250px 0px' });
  document.querySelectorAll('section.station').forEach(s => obs.observe(s));
}

/* ---------- boot ---------- */
buildEquation();
buildHero();
wireProgress();
wireScrollspy();
wireMenu();
wireStations();
initGlossary(document);
