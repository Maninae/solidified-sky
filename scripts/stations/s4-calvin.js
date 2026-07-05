/* s4-calvin.js - the signature ride: "Follow One Carbon Atom."

   Idle: the Calvin cycle turns as a labeled wheel in the stroma
   (RuBP → 3-PGA → G3P → regenerate). Rubisco sits by the RuBP node.
   ATP + NADPH ambient particles drift in from the light-reactions side.

   Ride: spawn a bright tagged carbon on a CO₂ outside the leaf; camera-
   follow it through air → stoma → stroma → rubisco fixes it onto RuBP →
   split into 3-PGA → ATP + NADPH spent, becomes G3P → after 6 turns, exits
   into glucose. A gold trail marks the whole path; a 6-pip meter tracks
   the six carbons per glucose.

   Colors ONLY from tokens. Molecule color law respected: carbon = bright
   tagged, G3P and glucose brown, ATP yellow, NADPH violet, CO₂ red,
   rubisco teal. */

import { COLORS } from '../tokens.js';
import { mountStage } from '../engine.js';
import { ParticleSystem, catmullRom } from '../particles.js';
import { drawStroma, drawStoma, drawMolecule, blobPath } from '../primitives.js';

/* --- world layout (origin = wheel center). ---------------------------------
   Idle: camera at origin. Riding: camera follows the atom. */
const WHEEL = { r: 130 };
const STOMA = { x: -300, y:  60 };
const NODES = {
  rubp:  { x:    0, y: -130, label: 'RuBP',       sub: '5C',        color: COLORS.chloro },
  pga:   { x:  130, y:    0, label: '3-PGA',      sub: '3C × 2',    color: COLORS.sugar  },
  g3p:   { x:    0, y:  130, label: 'G3P',        sub: '3C',        color: COLORS.sugar  },
  regen: { x: -130, y:    0, label: 'regenerate', sub: '5 G3P → 3 RuBP', color: COLORS.chloro },
};
const RUBISCO_POS = { x:   0, y: -195 };
const ATP_SLOT    = { x: 105, y:   95 };
const NADPH_SLOT  = { x:  80, y:  115 };
const GLUCOSE_POS = { x: 250, y:  190 };

/* One scripted journey: 8 phases, each a Catmull-Rom path in world coords.
   `active` names the wheel node to spotlight during that phase. */
const PHASES = [
  { key: 'air',     dur: 2.0, active: null,   pts: [[-460,-60], [-400,-40], [-320, 55]],
    text: 'A CO₂ molecule drifts toward the leaf. Follow the bright atom.' },
  { key: 'stoma',   dur: 1.5, active: null,   pts: [[-320, 55], [-260, 20], [-180,  0]],
    text: 'In through a stoma - the tiny pore in the leaf surface.' },
  { key: 'stroma',  dur: 1.5, active: null,   pts: [[-180,  0], [ -90,-60], [ -10,-115]],
    text: 'Into the stroma - the fluid where the Calvin cycle turns.' },
  { key: 'rubisco', dur: 1.6, active: 'rubp', pts: [[ -10,-115], [   0,-132], [   0,-130]],
    text: 'Rubisco grabs it and fixes it onto RuBP - "carbon fixation."' },
  { key: 'pga',     dur: 1.4, active: 'pga',  pts: [[   0,-130], [  95, -75], [ 130,   0]],
    text: 'The 6-carbon intermediate splits into two 3-PGA molecules.' },
  { key: 'g3p',     dur: 2.0, active: 'g3p',  pts: [[ 130,   0], [  95,  80], [   0, 130]],
    text: 'ATP and NADPH power the conversion into G3P - a real sugar.' },
  { key: 'turn',    dur: 1.4, active: 'g3p',  pts: [[   0, 130], [   0, 130], [   0, 130]],
    text: 'One turn done. Six turns of the cycle build one glucose.' },
  { key: 'exit',    dur: 2.2, active: null,   pts: [[   0, 130], [ 140, 175], [ 250, 190]],
    text: 'Six carbons join up - your atom is now part of glucose. C₆H₁₂O₆.' },
];
const ENDING = 'Done. That atom is locked into glucose. Six turns of the wheel, one sugar. Rubisco does that on nearly every leaf on Earth, all day long.';

export function init(sectionEl) {
  try { boot(sectionEl); }
  catch (err) { console.warn('s4-calvin init failed:', err); }
}

function boot(sectionEl) {
  const canvas   = sectionEl.querySelector('#s4-canvas');
  const btnRide  = sectionEl.querySelector('#s4-ride');
  const btnReset = sectionEl.querySelector('#s4-reset');
  const speed    = sectionEl.querySelector('#s4-speed');
  const speedVal = sectionEl.querySelector('#s4-speed-val');
  const readout  = sectionEl.querySelector('#s4-readout');
  if (!canvas) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const state = {
    riding: false, done: false,
    phaseIdx: 0, phaseT: 0,
    speed: 1.0,
    atomVisible: false,
    atomWorld: { x: -460, y: -60 },
    trail: [],           // {x, y, age} in world coords
    turnsShown: 0,       // 0..6 pips filled
    spentPhase: -1,      // guard so ATP + NADPH only fly in once per g3p phase
    idleTheta: 0,        // seconds, drives the wheel's ambient spin
    camBlend: 0,         // 0 = origin, 1 = follow atom (eases on ride start/stop)
  };
  const particles = new ParticleSystem(160);
  const paths = PHASES.map(p => catmullRom(p.pts));

  function setSpeed() {
    state.speed = Math.max(0.5, Math.min(2.0, +speed.value / 100));
    speedVal.textContent = state.speed.toFixed(1) + '×';
  }
  setSpeed();
  speed.addEventListener('input', setSpeed);

  function startRide() {
    Object.assign(state, {
      riding: true, done: false, phaseIdx: 0, phaseT: 0,
      atomVisible: true, turnsShown: 0, spentPhase: -1, camBlend: 0,
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
      atomVisible: false, turnsShown: 0, spentPhase: -1, camBlend: 0,
    });
    state.trail.length = 0;
    particles.clear();
    readout.textContent = 'Press play to grab a CO₂ from the air outside the leaf.';
  }
  btnRide.addEventListener('click', startRide);
  btnReset.addEventListener('click', resetRide);

  mountStage(canvas, (ctx, dt, t, W, H) => {
    if (reducedMotion) { drawIdleWorld(ctx, W, H, state, particles, /*fadeOverlay*/ false); return; }

    // ---- update ----
    const rideDt = dt * (state.riding ? state.speed : 1);
    state.idleTheta += dt * 0.35;
    particles.update(rideDt);
    seedAmbient(particles, dt);
    if (state.riding) advanceRide(state, paths, readout, rideDt);
    maybeSpendCarriers(state, particles);
    state.camBlend += ((state.riding || state.done ? 1 : 0) - state.camBlend) * Math.min(1, dt * 3);
    const camX = state.atomWorld.x * state.camBlend;
    const camY = state.atomWorld.y * state.camBlend;

    // ---- draw: idle world (behind spotlight), then relit atom on top ----
    drawIdleWorld(ctx, W, H, state, particles, /*fadeOverlay*/ false, camX, camY);
    if (state.riding || state.done) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 16, 11, 0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.translate(W / 2 - camX, H / 2 - camY);
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

  // Trail crumbs - skip while the atom is stationary (the 'turn' phase).
  if (phase.key !== 'turn') {
    const last = state.trail[state.trail.length - 1];
    if (!last || Math.hypot(p[0] - last.x, p[1] - last.y) > 5) {
      state.trail.push({ x: p[0], y: p[1], age: 0 });
      if (state.trail.length > 110) state.trail.shift();
    }
  }
  for (const c of state.trail) c.age += dt;

  // Fill pips: 1 after the first cycle turn, then the rest during 'exit', so
  // the "6 carbons → 1 glucose" idea lands as we merge into the sugar.
  if (phase.key === 'exit') {
    state.turnsShown = Math.min(6, 1 + Math.floor(state.phaseT * 5.5));
  }
  if (state.phaseT >= 1) {
    if (phase.key === 'turn') state.turnsShown = 1;
    if (phase.key === 'exit') state.turnsShown = 6;
    state.phaseIdx++;
    state.phaseT = 0;
    state.spentPhase = -1;
    if (state.phaseIdx >= PHASES.length) {
      state.riding = false; state.done = true;
      state.phaseIdx = PHASES.length - 1;
      readout.textContent = ENDING;
      return;
    }
    readout.textContent = PHASES[state.phaseIdx].text;
  }
}

/* -------- ambient particles + the ATP/NADPH spend --------------------------- */

function seedAmbient(particles, dt) {
  if (particles.count > 22 || Math.random() > dt * 0.9) return;
  const pick = Math.random() < 0.5 ? 'atp' : 'nadph';
  const slot = pick === 'atp' ? ATP_SLOT : NADPH_SLOT;
  const start = [slot.x + 80 - Math.random() * 30, slot.y + 70 + Math.random() * 20];
  particles.spawnOnPath(pick,
    catmullRom([start, [slot.x + 35, slot.y + 30], [slot.x, slot.y]]),
    { duration: 2.4 + Math.random() * 0.9, scale: 0.55, jitter: 3 });
}

function maybeSpendCarriers(state, particles) {
  if (!state.riding || PHASES[state.phaseIdx].key !== 'g3p') return;
  if (state.spentPhase === state.phaseIdx || state.phaseT < 0.15) return;
  state.spentPhase = state.phaseIdx;
  const dest = [state.atomWorld.x, state.atomWorld.y];
  for (const [type, from] of [['atp', ATP_SLOT], ['nadph', NADPH_SLOT]]) {
    particles.spawnOnPath(type,
      catmullRom([[from.x, from.y],
                  [(from.x + dest[0]) / 2, (from.y + dest[1]) / 2 - 20],
                  dest]),
      { duration: 0.85, scale: 0.75, jitter: 1.4 });
  }
}

/* -------- world rendering (idle scene) -------------------------------------- */

function drawIdleWorld(ctx, W, H, state, particles, _fade, camX = 0, camY = 0) {
  ctx.save();
  ctx.translate(W / 2 - camX, H / 2 - camY);

  drawStroma(ctx, 0, 0, { w: 460, h: 340, seed: 4 });
  drawLeafEdge(ctx);
  drawStoma(ctx, STOMA.x, STOMA.y, { openness: 0.9, scale: 1.1 });
  drawWheelRing(ctx, state.idleTheta);
  for (const key of Object.keys(NODES)) drawNode(ctx, NODES[key]);
  drawRubisco(ctx, state);
  drawCarrierSlot(ctx, ATP_SLOT,   'ATP',   COLORS.atp);
  drawCarrierSlot(ctx, NADPH_SLOT, 'NADPH', COLORS.nadph);

  // Glucose only appears once the atom is on the exit leg - the reveal is
  // part of the payoff.
  if (state.phaseIdx >= 6 || state.done) {
    drawMolecule(ctx, 'glucose', GLUCOSE_POS.x, GLUCOSE_POS.y, { scale: 1.3, glow: true });
    label(ctx, GLUCOSE_POS.x, GLUCOSE_POS.y + 20, 'glucose', COLORS.sugar);
  }
  particles.draw(ctx);
  ctx.restore();
}

function drawLeafEdge(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-360, -170);
  ctx.quadraticCurveTo(-260, 0, -360, 170);
  ctx.stroke();
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('outside the leaf', -455, -140);
  ctx.fillText('inside (stroma)',  -170, -160);
  ctx.restore();
}

function drawWheelRing(ctx, theta) {
  ctx.save();
  ctx.strokeStyle = 'rgba(150, 200, 170, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, WHEEL.r, 0, Math.PI * 2); ctx.stroke();
  // A dashed ring whose dash offset rotates - the wheel is always turning.
  ctx.strokeStyle = COLORS.chloro;
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 12]);
  ctx.lineDashOffset = -theta * 40;
  ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.arc(0, 0, WHEEL.r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawNode(ctx, node) {
  ctx.save();
  ctx.fillStyle = node.color;
  ctx.globalAlpha = 0.22;
  ctx.beginPath(); ctx.arc(node.x, node.y, 26, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = node.color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(node.label, node.x, node.y - 34);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = COLORS.textSecondary;
  ctx.fillText(node.sub, node.x, node.y + 44);
  ctx.restore();
}

function drawRubisco(ctx, state) {
  const active = PHASES[state.phaseIdx]?.active === 'rubp' && (state.riding || state.done);
  const pulse = active ? 0.6 + 0.4 * Math.sin(state.idleTheta * 6) : 0.6;
  const path = blobPath(RUBISCO_POS.x, RUBISCO_POS.y, 26,
                        { harmonics: 3, amp: 0.20, seed: 17 });
  ctx.save();
  ctx.shadowColor = COLORS.rubisco;
  ctx.shadowBlur = active ? 24 : 10;
  ctx.fillStyle = `rgba(94, 234, 212, ${pulse * 0.75})`;
  ctx.fill(path);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.rubisco;
  ctx.lineWidth = 1.4;
  ctx.stroke(path);
  ctx.restore();
  label(ctx, RUBISCO_POS.x, RUBISCO_POS.y - 42, 'rubisco', COLORS.rubisco);
}

function drawCarrierSlot(ctx, slot, name, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(slot.x, slot.y, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(name, slot.x, slot.y + 30);
  ctx.restore();
}

/* -------- ride overlays (active-node highlight, trail, pips) ---------------- */

function drawActiveHighlight(ctx, state) {
  const phase = PHASES[state.phaseIdx];
  if (!phase?.active) return;
  const node = NODES[phase.active];
  ctx.save();
  ctx.strokeStyle = COLORS.accent2;
  ctx.lineWidth = 2;
  const r = 30 + Math.sin(state.idleTheta * 5) * 2;
  ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawTrail(ctx, state) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const c of state.trail) {
    const a = Math.max(0, 1 - c.age / 6) * 0.7;
    if (a <= 0.01) continue;
    ctx.fillStyle = `rgba(255, 224, 102, ${a})`;
    ctx.beginPath(); ctx.arc(c.x, c.y, 2.4, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = filled ? COLORS.sugar : 'rgba(216, 161, 94, 0.18)';
    ctx.fill();
    ctx.strokeStyle = filled ? COLORS.sugar : COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function label(ctx, x, y, text, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.restore();
}
