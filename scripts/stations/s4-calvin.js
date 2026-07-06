/* s4-calvin.js - the signature ride: "Follow One Carbon Atom" through the
   interior of one chloroplast.

   Scene (drawn every frame in s4-scene.js): a chloroplast interior with a
   real place feel. A stoma pore on the left is the entry from outside the
   leaf. A rubisco cluster sits in the upper stroma. Grana stacks glow along
   the right side - the light-reactions neighborhood that hands out ATP and
   NADPH. A sugar store of many glucose molecules sits in the bottom-right
   corner. Landmark labels stay quiet until the ride visits them.

   Ride: a CO₂ drifts in from outside the chloroplast, camera locked to the
   bright tagged atom. It slips through the stoma into the stroma, gets
   caught by rubisco → welded onto RuBP → the 6-carbon splits into two
   3-PGA → the atom drifts toward the grana side where ATP + NADPH stream
   out and reduce 3-PGA into G3P → a short beat while the wheel turns five
   more times off-camera → the atom travels to the sugar store and merges
   into ONE glucose that lights up gold among the many. A 6-pip meter
   tracks the six carbons per glucose.

   Molecule Color Law: carbon = bright tagged, G3P and glucose brown, ATP
   yellow, NADPH violet, CO₂ red, rubisco teal, grana green. Colors ONLY
   from tokens.js. */

import { COLORS } from '../tokens.js';
import { mountStage } from '../engine.js';
import { ParticleSystem, catmullRom } from '../particles.js';
import { drawMolecule } from '../primitives.js';
import { withAlpha, prefersReducedMotion, clamp } from '../util.js';
import { LAYOUT, focusSpot, drawIdleScene, applyCamera } from './s4-scene.js';

/* One scripted journey, each phase a Catmull-Rom path in world coords.
   `focus` names the landmark the active-highlight ring should sit on
   during that phase, and drives which labels are lit up. */
const PHASES = [
  { key: 'air',     dur: 2.0, focus: 'stoma',
    pts: [[-620, -30], [-500, 0], [-410, 20]],
    text: 'Outside the leaf: a CO₂ molecule drifts toward a stoma - the tiny pore in the leaf skin.' },
  { key: 'stoma',   dur: 1.6, focus: 'stoma',
    pts: [[-410, 20], [-340, 8], [-270, -10]],
    text: 'Through the stoma pore and into a chloroplast - the leaf cell\'s sugar factory.' },
  { key: 'rubisco', dur: 1.7, focus: 'rubisco',
    pts: [[-270, -10], [-215, -45], [LAYOUT.RUBP_ANCHOR.x, LAYOUT.RUBP_ANCHOR.y]],
    text: 'Rubisco grabs the CO₂ and welds it onto RuBP - carbon fixation, the most-copied chemistry on Earth.' },
  { key: 'pga',     dur: 1.5, focus: 'pga',
    pts: [[LAYOUT.RUBP_ANCHOR.x, LAYOUT.RUBP_ANCHOR.y], [-95, -50], [LAYOUT.PGA_SPOT.x, LAYOUT.PGA_SPOT.y]],
    text: 'The six-carbon intermediate splits into two 3-PGA molecules. Your atom rides one of them.' },
  { key: 'g3p',     dur: 2.2, focus: 'g3p',
    pts: [[LAYOUT.PGA_SPOT.x, LAYOUT.PGA_SPOT.y], [35, 15], [LAYOUT.G3P_SPOT.x, LAYOUT.G3P_SPOT.y]],
    text: 'ATP and NADPH stream out of the grana next door. Their energy reduces 3-PGA into G3P - a real sugar.' },
  { key: 'cycle',   dur: 1.9, focus: 'regen',
    pts: [[LAYOUT.G3P_SPOT.x, LAYOUT.G3P_SPOT.y], [20, 105], [LAYOUT.REGEN_SPOT.x, LAYOUT.REGEN_SPOT.y]],
    text: 'The wheel turns five more times off-frame. Five of every six G3P recycle into fresh RuBP; one escapes.' },
  { key: 'store',   dur: 2.4, focus: 'store',
    pts: [[LAYOUT.REGEN_SPOT.x, LAYOUT.REGEN_SPOT.y], [90, 165], [LAYOUT.CHOSEN_GLUCOSE_WORLD.x, LAYOUT.CHOSEN_GLUCOSE_WORLD.y]],
    text: 'Six carbons captured. Two G3P stitch into one glucose - your atom slots into the store, among many.' },
];
const ENDING = 'Done. That atom is locked into glucose, one of many the chloroplast has already made. Rubisco is doing this on nearly every leaf on Earth right now.';

/* One turn of the Calvin cycle consumes 3 ATP + 2 NADPH (per fixed CO₂).
   Stagger them across the g3p phase so the reduction reads as a small burst,
   not a blizzard. Each entry: fraction of phase at which to fire, carrier. */
const SPEND_SCHEDULE = [
  { at: 0.10, type: 'atp'   },
  { at: 0.26, type: 'nadph' },
  { at: 0.44, type: 'atp'   },
  { at: 0.60, type: 'nadph' },
  { at: 0.76, type: 'atp'   },
];

const IDLE_READY = 'Press play to grab a CO₂ from the air outside the leaf.';

export function init(sectionEl) {
  try { mount(sectionEl); }
  catch (err) { console.error('[s4-calvin] init failed:', err); }
}

function mount(sectionEl) {
  const canvas   = sectionEl.querySelector('#s4-canvas');
  const btnRide  = sectionEl.querySelector('#s4-ride');
  const btnReset = sectionEl.querySelector('#s4-reset');
  const speed    = sectionEl.querySelector('#s4-speed');
  const speedVal = sectionEl.querySelector('#s4-speed-val');
  const readout  = sectionEl.querySelector('#s4-readout');
  if (!canvas) return;
  const reducedMotion = prefersReducedMotion();

  const state = {
    riding: false, done: false,
    phaseIdx: 0, phaseT: 0,
    speed: 1.0,
    atomVisible: false,
    atomWorld: { x: PHASES[0].pts[0][0], y: PHASES[0].pts[0][1] },
    trail: [],
    turnsShown: 0,
    spentPhase: -1,
    spendIdx: 0,
    idleTheta: 0,
    camBlend: 0,
    chosenGlucoseGlow: 0,
    activeFocus: null,               // read by scene renderers for pulse effects
    staticDiagram: reducedMotion,
  };
  const particles = new ParticleSystem(240);
  const paths = PHASES.map(p => catmullRom(p.pts));

  function setSpeed() {
    state.speed = clamp(+speed.value / 100, 0.5, 2.0);
    speedVal.textContent = state.speed.toFixed(1) + '×';
  }
  setSpeed();
  speed.addEventListener('input', setSpeed);

  function startRide() {
    Object.assign(state, {
      riding: true, done: false, phaseIdx: 0, phaseT: 0,
      atomVisible: true, turnsShown: 0, spentPhase: -1, spendIdx: 0,
      camBlend: 0, chosenGlucoseGlow: 0, activeFocus: PHASES[0].focus,
    });
    state.atomWorld.x = PHASES[0].pts[0][0];
    state.atomWorld.y = PHASES[0].pts[0][1];
    state.trail.length = 0;
    particles.clear();
    readout.textContent = PHASES[0].text;
  }
  function resetRide() {
    Object.assign(state, {
      riding: false, done: false, phaseIdx: 0, phaseT: 0,
      atomVisible: false, turnsShown: 0, spentPhase: -1, spendIdx: 0,
      camBlend: 0, chosenGlucoseGlow: 0, activeFocus: null,
    });
    state.trail.length = 0;
    particles.clear();
    readout.textContent = IDLE_READY;
  }
  btnRide.addEventListener('click', startRide);
  btnReset.addEventListener('click', resetRide);

  mountStage(canvas, (ctx, dt, t, W, H) => {
    if (reducedMotion) { drawStaticFallback(ctx, W, H, state, particles); return; }

    /* ---- update ---- */
    const rideDt = dt * (state.riding ? state.speed : 1);
    state.idleTheta += dt * 0.35;
    particles.update(rideDt);
    seedAmbient(particles, dt);
    if (state.riding) advanceRide(state, paths, readout, rideDt);
    maybeSpendCarriers(state, particles);

    // Camera ease and chosen-glucose glow ease. Both target 0 or 1 and glide.
    const camTarget = (state.riding || state.done) ? 1 : 0;
    state.camBlend += (camTarget - state.camBlend) * Math.min(1, dt * 3);
    const glowTarget = (state.done ||
      (state.riding && PHASES[state.phaseIdx].key === 'store' && state.phaseT > 0.65))
      ? 1 : 0;
    state.chosenGlucoseGlow += (glowTarget - state.chosenGlucoseGlow) * Math.min(1, dt * 4);

    const camX = state.atomWorld.x * state.camBlend;
    const camY = state.atomWorld.y * state.camBlend;

    /* ---- draw: scene first, then a soft dim, then atom + trail on top ---- */
    drawIdleScene(ctx, W, H, state, particles, camX, camY);
    if (state.riding || state.done) {
      ctx.save();
      ctx.fillStyle = withAlpha(COLORS.bgDeep, 0.38);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      applyCamera(ctx, W, H, camX, camY);
      drawActiveHighlight(ctx, state);
      drawTrail(ctx, state);
      if (state.atomVisible) {
        drawMolecule(ctx, 'carbon', state.atomWorld.x, state.atomWorld.y,
                     { scale: 1.7, glow: true });
      }
      ctx.restore();
    }
    drawPips(ctx, W, H, state);
  }, { background: COLORS.bgDeep });
}

/* -------- ride advancement -------------------------------------------------- */

function advanceRide(state, paths, readout, dt) {
  const phase = PHASES[state.phaseIdx];
  state.phaseT = Math.min(1, state.phaseT + dt / phase.dur);
  const p = paths[state.phaseIdx](state.phaseT);
  state.atomWorld.x = p[0]; state.atomWorld.y = p[1];
  state.activeFocus = phase.focus;

  // Trail crumbs - one every few px so the gold thread doesn't clot.
  const last = state.trail[state.trail.length - 1];
  if (!last || Math.hypot(p[0] - last.x, p[1] - last.y) > 5) {
    state.trail.push({ x: p[0], y: p[1], age: 0 });
    if (state.trail.length > 200) state.trail.shift();
  }
  for (const c of state.trail) c.age += dt;

  // Pip meter: 1 pip after fixation lands, ramps to 6 during the cycle beat,
  // stays at 6 through the store phase so the payoff idea holds.
  if (phase.key === 'rubisco' && state.phaseT >= 0.85) {
    state.turnsShown = Math.max(state.turnsShown, 1);
  }
  if (phase.key === 'cycle') {
    state.turnsShown = Math.min(6, 1 + Math.floor(state.phaseT * 5.5));
  }
  if (phase.key === 'store') state.turnsShown = 6;

  if (state.phaseT >= 1) {
    if (phase.key === 'cycle') state.turnsShown = 6;
    state.phaseIdx++;
    state.phaseT = 0;
    state.spentPhase = -1;
    if (state.phaseIdx >= PHASES.length) {
      state.riding = false; state.done = true;
      state.phaseIdx = PHASES.length - 1;
      state.activeFocus = 'store';
      readout.textContent = ENDING;
      return;
    }
    readout.textContent = PHASES[state.phaseIdx].text;
  }
}

/* -------- ambient particles + the ATP/NADPH reduction spend ---------------- */

/* Ambient carriers drift out of the grana into the surrounding stroma so
   the "light reactions next door make ATP + NADPH" idea is always readable,
   even when the ride isn't running. Emit rate is thin on purpose. */
function seedAmbient(particles, dt) {
  if (particles.count > 32 || Math.random() > dt * 1.1) return;
  const pick = Math.random() < 0.5 ? 'atp' : 'nadph';
  const g = LAYOUT.GRANA_POSITIONS[Math.floor(Math.random() * LAYOUT.GRANA_POSITIONS.length)];
  const start = [g.x - 20 + Math.random() * 10, g.y + (Math.random() - 0.5) * 30];
  const midX  = start[0] - 60 - Math.random() * 40;
  const midY  = start[1] + (Math.random() - 0.5) * 40;
  const endX  = midX - 40 - Math.random() * 70;
  const endY  = midY + (Math.random() - 0.5) * 80;
  particles.spawnOnPath(pick,
    catmullRom([start, [midX, midY], [endX, endY]]),
    { duration: 3.0 + Math.random() * 1.4, scale: 0.55, jitter: 3 });
}

function maybeSpendCarriers(state, particles) {
  if (!state.riding || PHASES[state.phaseIdx].key !== 'g3p') return;
  // First frame of this g3p phase: arm the schedule fresh.
  if (state.spentPhase !== state.phaseIdx) {
    state.spentPhase = state.phaseIdx;
    state.spendIdx = 0;
  }
  // Fire every scheduled carrier whose time-in-phase has passed. Each spawn
  // originates at the nearest grana stack so the reduction visibly reads as
  // "the grana are handing over their currency."
  while (state.spendIdx < SPEND_SCHEDULE.length &&
         state.phaseT >= SPEND_SCHEDULE[state.spendIdx].at) {
    const type = SPEND_SCHEDULE[state.spendIdx++].type;
    const from = nearestGrana(state.atomWorld);
    const dest = [state.atomWorld.x, state.atomWorld.y];
    particles.spawnOnPath(type,
      catmullRom([[from.x, from.y],
                  [(from.x + dest[0]) / 2, (from.y + dest[1]) / 2 - 24],
                  dest]),
      { duration: 0.85, scale: 0.85, jitter: 1.4 });
  }
}

function nearestGrana(pos) {
  let best = LAYOUT.GRANA_POSITIONS[0];
  let bestD = Infinity;
  for (const g of LAYOUT.GRANA_POSITIONS) {
    const dx = g.x - pos.x, dy = g.y - pos.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

/* -------- ride overlays: active-landmark ring, gold trail, pip meter ------- */

function drawActiveHighlight(ctx, state) {
  const phase = PHASES[state.phaseIdx];
  const spot = focusSpot(phase?.focus);
  if (!spot) return;
  ctx.save();
  ctx.strokeStyle = COLORS.accent2;
  ctx.lineWidth = 2;
  const r = 34 + Math.sin(state.idleTheta * 5) * 3;
  ctx.beginPath();
  ctx.arc(spot.x, spot.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTrail(ctx, state) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const c of state.trail) {
    const a = Math.max(0, 1 - c.age / 6) * 0.7;
    if (a <= 0.01) continue;
    ctx.fillStyle = withAlpha(COLORS.photon, a);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPips(ctx, W, H, state) {
  const y = H - 26;
  const gap = 22;
  const x0 = W / 2 - (5 * gap) / 2;
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = COLORS.textSecondary;
  ctx.textAlign = 'center';
  ctx.fillText('6 carbons → 1 glucose', W / 2, y - 14);
  for (let i = 0; i < 6; i++) {
    const filled = i < state.turnsShown;
    ctx.beginPath();
    ctx.arc(x0 + i * gap, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = filled ? COLORS.sugar : withAlpha(COLORS.sugar, 0.18);
    ctx.fill();
    ctx.strokeStyle = filled ? COLORS.sugar : COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/* -------- reduced-motion fallback ------------------------------------------
   One static, fully labeled frame with the atom sitting in its final glucose.
   No motion, no camera pan, no ambient particles. */

function drawStaticFallback(ctx, W, H, state, particles) {
  state.staticDiagram = true;
  state.phaseIdx = PHASES.length - 1;
  state.chosenGlucoseGlow = 1;
  state.turnsShown = 6;
  state.activeFocus = null;
  drawIdleScene(ctx, W, H, state, particles);
  ctx.save();
  applyCamera(ctx, W, H, 0, 0);
  drawMolecule(ctx, 'carbon',
               LAYOUT.CHOSEN_GLUCOSE_WORLD.x - 22,
               LAYOUT.CHOSEN_GLUCOSE_WORLD.y - 12,
               { scale: 1.7, glow: true });
  ctx.restore();
  drawPips(ctx, W, H, state);
}
