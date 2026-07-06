/* stations/s2-chloroplast.js - Station 2: "Meet the Chloroplast".

   A large code-drawn chloroplast the reader can take apart. 2.5D parallax on
   mousemove (envelope holds still, grana slide most; touch devices auto-sway);
   clicking any granum, the stroma, or the envelope rim reveals an on-canvas
   label + a one-line caption in #s2-readout; the "Take the tour" button
   spotlights envelope → grana → stroma at ~2.5 s each, and "Reset labels"
   clears everything. Organelles from primitives.js, colors from tokens.js;
   a small ParticleSystem drifts H₂O and CO₂ through the stroma. */

import { COLORS } from '../tokens.js';
import { drawStroma, drawThylakoidStack, superellipsePath } from '../primitives.js';
import { mountStage } from '../engine.js';
import { ParticleSystem } from '../particles.js';
import { roundRect, withAlpha, prefersReducedMotion } from '../util.js';

const REDUCED_MOTION = prefersReducedMotion();
const IS_TOUCH       = typeof window !== 'undefined' &&
                       !!window.matchMedia?.('(hover: none)').matches;

/* Granum seat positions, as fractions of the chloroplast's half-a / half-b. */
const GRANA = [
  { nx: -0.62, ny: -0.10 }, { nx: -0.28, ny: 0.24 }, { nx: 0.02, ny: -0.28 },
  { nx:  0.32, ny:  0.22 }, { nx:  0.62, ny: -0.10 },
];

/* The three labelable parts. */
const PARTS = {
  envelope: { title: 'Outer envelope',
              body:  'A double membrane wraps the whole chloroplast in and out.' },
  grana:    { title: 'Thylakoids · grana',
              body:  'Flat green sacs stacked into piles - the light reactions run here.' },
  stroma:   { title: 'Stroma',
              body:  'The fluid around the thylakoids - where the Calvin cycle builds sugar.' },
};

const TOUR_ORDER   = ['envelope', 'grana', 'stroma'];
const TOUR_PHASE_S = 2.5;
const N_ENVELOPE   = 3.2;   // superellipse exponent; matches drawChloroplast
const N_DRIFTERS   = 12;

// First-arrival hint - a soft ring pulsing around one granum to say "these
// are clickable". Fades in over 1s, holds ~7s, fades out over 2s (total 10s),
// or dies the moment the reader clicks anything or starts the tour.
const HINT_GRANUM_IDX = 2;   // top-center granum in the GRANA layout
const HINT_TOTAL_S    = 10;
const HINT_FADE_IN_S  = 1;
const HINT_FADE_OUT_S = 2;

export function init(sectionEl) {
  try { mount(sectionEl); }
  catch (err) {
    console.error('[s2-chloroplast] init failed:', err);
    const readout = sectionEl.querySelector('#s2-readout');
    if (readout) readout.textContent = 'Static view - the chloroplast is still labeled below.';
  }
}

function mount(sectionEl) {
  const canvas   = sectionEl.querySelector('#s2-canvas');
  const btnTour  = sectionEl.querySelector('#s2-tour');
  const btnReset = sectionEl.querySelector('#s2-reset');
  const readout  = sectionEl.querySelector('#s2-readout');
  if (!canvas || !btnTour || !btnReset || !readout) return;

  const particles = new ParticleSystem(24);

  // chloroplast half-width/height, granum centers, parallax targets, labels, tour
  const state = {
    W: 0, H: 0, cx: 0, cy: 0, a: 0, b: 0, granaXY: [],
    parallax: { tx: 0, ty: 0, cx: 0, cy: 0 },
    labels: new Set(),
    tour: null,   // { phase, t } while active
    hint: { active: true, elapsed: 0 },  // dies on first click / tour start
  };

  const layout = (W, H) => {
    state.W = W; state.H = H;
    state.cx = W / 2; state.cy = H / 2;
    state.a = Math.min(W * 0.42, 340);
    state.b = Math.min(H * 0.38, state.a * 0.60);
    state.granaXY = GRANA.map(g => [state.cx + g.nx * state.a * 0.85,
                                    state.cy + g.ny * state.b * 0.85]);
    particles.clear();
    for (let i = 0; i < N_DRIFTERS; i++) spawnDrifter();
  };

  const spawnDrifter = () => {
    for (let tries = 0; tries < 8; tries++) {
      const rx = (Math.random() * 2 - 1) * state.a * 0.72;
      const ry = (Math.random() * 2 - 1) * state.b * 0.72;
      if (!inSuperellipse(rx, ry, state.a * 0.72, state.b * 0.72)) continue;
      particles.spawn(Math.random() < 0.55 ? 'h2o' : 'co2',
        state.cx + rx, state.cy + ry, {
          vx: (Math.random() * 2 - 1) * 7, vy: (Math.random() * 2 - 1) * 5,
          life: 6 + Math.random() * 6, scale: 0.38, drag: 0.08,
        });
      return;
    }
  };

  /* One frame. All draws in CSS pixels; the Stage handles DPR. */
  const render = (ctx, dt, t, W, H) => {
    if (W !== state.W || H !== state.H) layout(W, H);

    // Parallax targeting - mouse when hovering, gentle sway on touch, still on reduced-motion.
    if (!REDUCED_MOTION && IS_TOUCH) {
      state.parallax.tx = 0.35 * Math.sin(t * 0.35);
      state.parallax.ty = 0.22 * Math.sin(t * 0.5 + 1.1);
    }
    const ease = REDUCED_MOTION ? 0 : Math.min(1, 6 * dt);
    state.parallax.cx += (state.parallax.tx - state.parallax.cx) * ease;
    state.parallax.cy += (state.parallax.ty - state.parallax.cy) * ease;

    // depth-scaled offsets: envelope least, grana most (2.5D)
    const px = state.parallax.cx, py = state.parallax.cy;
    const OFF = { env: 4, stro: 10, mol: 14, gran: 22 };

    // 1. Stroma fluid (deepest interior).
    ctx.save();
    ctx.translate(state.cx + px * OFF.stro, state.cy + py * OFF.stro);
    drawStroma(ctx, 0, 0, { w: state.a * 1.85, h: state.b * 1.85, seed: 3 });
    ctx.restore();

    // 2. Drifting H₂O / CO₂ - top the pool up each frame (bounded, never spins).
    for (let n = particles.count; n < N_DRIFTERS; n++) spawnDrifter();
    if (!REDUCED_MOTION) particles.update(dt);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.translate(px * OFF.mol, py * OFF.mol);
    particles.draw(ctx);
    ctx.restore();

    // 3. Grana - synchronized glow pulse.
    const pulse = REDUCED_MOTION ? 1 : 0.75 + 0.25 * Math.sin(t * 1.6);
    for (let i = 0; i < state.granaXY.length; i++) {
      const [gx, gy] = state.granaXY[i];
      ctx.save();
      ctx.globalAlpha = pulse;
      drawThylakoidStack(ctx, gx + px * OFF.gran, gy + py * OFF.gran,
        { scale: 0.9, rot: ((i % 2) - 0.5) * 0.14, glow: true, count: 5 });
      ctx.restore();
    }

    // 4. Envelope - radial wash + double stroke.
    drawEnvelope(ctx, state.cx + px * OFF.env, state.cy + py * OFF.env, state.a, state.b);

    // 4a. First-arrival "click me" pulse around one granum (fades on interact).
    if (state.hint.active) {
      let alpha;
      if (REDUCED_MOTION) {
        // Reduced motion: single static frame. Show the hint at a mild fixed
        // alpha so the affordance is visible without any pulsing.
        alpha = 0.55;
      } else {
        state.hint.elapsed += dt;
        alpha = hintAlpha(state.hint.elapsed);
        if (alpha <= 0) state.hint.active = false;
      }
      if (alpha > 0) {
        const [gx, gy] = state.granaXY[HINT_GRANUM_IDX];
        drawHintPulse(ctx, gx + px * OFF.gran, gy + py * OFF.gran, t, alpha);
      }
    }

    // 5. Advance the tour, then spotlight-dim if one is active.
    if (state.tour) {
      state.tour.t += dt;
      if (state.tour.t >= TOUR_PHASE_S) {
        state.tour.t = 0;
        state.tour.phase++;
        if (state.tour.phase >= TOUR_ORDER.length) stopTour();
        else {
          const p = TOUR_ORDER[state.tour.phase];
          state.labels.add(p); setReadout(PARTS[p]);
        }
      }
      if (state.tour) drawSpotlight(ctx, state, TOUR_ORDER[state.tour.phase]);
    }

    // 6. Labels + leader lines on top (readable through any spotlight dim).
    drawLabels(ctx, state);
  };

  const stage = mountStage(canvas, render, { background: COLORS.bgDeep });

  const setReadout = (p) => { readout.innerHTML = `<strong>${p.title}.</strong> ${p.body}`; };
  const resetReadout = () => { readout.textContent = 'Click a part, or take the tour.'; };

  const startTour = () => {
    state.labels.clear();
    state.tour = { phase: 0, t: 0 };
    state.labels.add(TOUR_ORDER[0]);
    setReadout(PARTS[TOUR_ORDER[0]]);
    state.hint.active = false;
    btnTour.textContent = 'Stop tour';
    if (REDUCED_MOTION) stage.renderStatic();
  };
  const stopTour = () => { state.tour = null; btnTour.textContent = 'Take the tour'; };
  const resetAll = () => { stopTour(); state.labels.clear(); resetReadout(); stage.renderStatic(); };

  btnTour.addEventListener('click', () => { state.tour ? stopTour() : startTour(); });
  btnReset.addEventListener('click', resetAll);

  canvas.addEventListener('mousemove', (e) => {
    if (REDUCED_MOTION || IS_TOUCH) return;
    const r = canvas.getBoundingClientRect();
    state.parallax.tx = ((e.clientX - r.left) / r.width)  * 2 - 1;
    state.parallax.ty = ((e.clientY - r.top)  / r.height) * 2 - 1;
  });
  canvas.addEventListener('mouseleave', () => { state.parallax.tx = 0; state.parallax.ty = 0; });

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const hit = hitTest(state, e.clientX - r.left, e.clientY - r.top);
    if (!hit) return;
    if (state.tour) stopTour();          // manual clicks abort a running tour
    state.hint.active = false;           // any real interaction ends the hint
    state.labels.add(hit);
    setReadout(PARTS[hit]);
    if (REDUCED_MOTION) stage.renderStatic();
  });

  // Prime layout + a static first frame in case Stage's initial box was zero.
  layout(stage.width || canvas.clientWidth || 860,
         stage.height || canvas.clientHeight || 480);
  if (REDUCED_MOTION) stage.renderStatic();
}

/* ---------- geometry ---------- */

function inSuperellipse(x, y, a, b, n = N_ENVELOPE) {
  return Math.pow(Math.abs(x)/a, n) + Math.pow(Math.abs(y)/b, n) <= 1;
}

/* Which part the click hit - grana first (small circles), then envelope rim
 * band, then stroma interior. Each layer's parallax offset is subtracted so
 * hotspots track the visible art. */
function hitTest(state, px, py) {
  const { parallax: p, cx, cy, a, b } = state;
  for (const [gx, gy] of state.granaXY) {
    const dx = px - (gx + p.cx * 22), dy = py - (gy + p.cy * 22);
    if (dx*dx + dy*dy <= 34 * 34) return 'grana';
  }
  const ex = px - (cx + p.cx * 4), ey = py - (cy + p.cy * 4);
  if (!inSuperellipse(ex, ey, a - 10, b - 10) &&
       inSuperellipse(ex, ey, a + 10, b + 10)) return 'envelope';
  const sx = px - (cx + p.cx * 10), sy = py - (cy + p.cy * 10);
  if (inSuperellipse(sx, sy, a - 6, b - 6)) return 'stroma';
  return null;
}

/* ---------- drawing helpers ---------- */

function drawEnvelope(ctx, cx, cy, a, b) {
  ctx.save();
  ctx.translate(cx, cy);
  // Faint outer halo so the whole organelle glows.
  const halo = ctx.createRadialGradient(0, 0, Math.min(a, b) * 0.55, 0, 0, Math.max(a, b) * 1.15);
  halo.addColorStop(0, withAlpha(COLORS.chloro, 0));
  halo.addColorStop(1, withAlpha(COLORS.chloro, 0.14));
  ctx.fillStyle = halo;
  ctx.fill(superellipsePath(0, 0, a + 6, b + 6, N_ENVELOPE));
  // Outer membrane (bright rim) then inner (thinner, offset inward).
  ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(200, 245, 215, 0.55)';
  ctx.stroke(superellipsePath(0, 0, a,     b,     N_ENVELOPE));
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(200, 245, 215, 0.30)';
  ctx.stroke(superellipsePath(0, 0, a - 8, b - 8, N_ENVELOPE));
  ctx.restore();
}

/* Envelope for the first-arrival hint alpha: fade in, hold, fade out. */
function hintAlpha(elapsed) {
  if (elapsed < HINT_FADE_IN_S)                     return elapsed / HINT_FADE_IN_S;
  if (elapsed < HINT_TOTAL_S - HINT_FADE_OUT_S)     return 1;
  if (elapsed < HINT_TOTAL_S)                       return (HINT_TOTAL_S - elapsed) / HINT_FADE_OUT_S;
  return 0;
}

/* Two soft breathing rings around a granum, additive. Two phases offset in
 * time give it a heartbeat-y feel; alpha is scaled by the fade envelope so
 * the whole hint eases in and out cleanly. Uses tokens for the ring color. */
function drawHintPulse(ctx, gx, gy, t, alpha) {
  const rBase = 26;
  const phase1 = (Math.sin(t * 2.2)       + 1) / 2;
  const phase2 = (Math.sin(t * 2.2 + 1.5) + 1) / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Outer ring - wider swell, weaker line.
  ctx.strokeStyle = withAlpha(COLORS.accent, alpha * (0.55 - 0.40 * phase1));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(gx, gy, rBase + 14 * phase1, 0, Math.PI * 2);
  ctx.stroke();
  // Inner ring - tighter, offset for a "second beat".
  ctx.strokeStyle = withAlpha(COLORS.accent, alpha * (0.75 - 0.50 * phase2));
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(gx, gy, rBase + 6 * phase2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* Dim the whole canvas, then punch a soft hole around the tour target. */
function drawSpotlight(ctx, state, part) {
  const [tx, ty, tr] = spotlightTarget(state, part);
  ctx.save();
  ctx.fillStyle = withAlpha(COLORS.bgDeep, 0.55);
  ctx.fillRect(0, 0, state.W, state.H);
  const g = ctx.createRadialGradient(tx, ty, 4, tx, ty, tr);
  g.addColorStop(0,    'rgba(0,0,0,1)');
  g.addColorStop(0.65, 'rgba(0,0,0,1)');
  g.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function spotlightTarget(state, part) {
  const { cx, cy, a, b, parallax: p } = state;
  if (part === 'envelope') return [cx + p.cx * 4 + a * 0.75, cy + p.cy * 4 - b * 0.55, 110];
  if (part === 'grana') {
    const [gx, gy] = state.granaXY[Math.floor(state.granaXY.length / 2)];
    return [gx + p.cx * 22, gy + p.cy * 22, 62];
  }
  return [cx + p.cx * 10 + a * 0.35, cy + p.cy * 10 + b * 0.45, 82];
}

/* Fixed on-canvas anchor per part so the three labels can never overlap. */
function labelAnchor(state, part) {
  const { W, H, cx, cy, a, b, parallax: p } = state;
  const M = 16;
  if (part === 'envelope') return {
    label:  { x: W - M, y: M, align: 'right' },
    target: { x: cx + p.cx * 4 + a * 0.7, y: cy + p.cy * 4 - b * 0.92 },
  };
  if (part === 'grana') {
    const [gx, gy] = state.granaXY[0];
    return {
      label:  { x: M, y: H - M - 24, align: 'left' },
      target: { x: gx + p.cx * 22, y: gy + p.cy * 22 },
    };
  }
  return {
    label:  { x: W - M, y: H - M - 24, align: 'right' },
    target: { x: cx + p.cx * 10 + a * 0.4, y: cy + p.cy * 10 + b * 0.4 },
  };
}

function drawLabels(ctx, state) {
  ctx.save();
  ctx.font = '500 13px "Space Grotesk", system-ui, sans-serif';
  ctx.textBaseline = 'top';
  for (const key of state.labels) {
    const { label, target } = labelAnchor(state, key);
    const text = PARTS[key].title;
    const tw = ctx.measureText(text).width;
    const pillW = tw + 14, pillH = 22;
    const right = label.align === 'right';
    const bx = right ? label.x - pillW : label.x, by = label.y;
    const edgeX = right ? bx + pillW : bx, edgeY = by + pillH / 2;

    // Leader: target → midpoint → pill edge.
    ctx.strokeStyle = 'rgba(200, 245, 215, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(edgeX + (right ? -22 : 22), edgeY);
    ctx.lineTo(edgeX, edgeY);
    ctx.stroke();

    // Pill: fill + green outline + text.
    roundRect(ctx, bx, by, pillW, pillH, 6);
    ctx.fillStyle = 'rgba(8, 23, 15, 0.86)';           // bgSurface-family
    ctx.fill();
    ctx.strokeStyle = withAlpha(COLORS.chloro, 0.35);
    ctx.stroke();
    ctx.fillStyle = COLORS.textPrimary;
    ctx.fillText(text, bx + 7, by + 5);

    // Bright target dot.
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath(); ctx.arc(target.x, target.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

