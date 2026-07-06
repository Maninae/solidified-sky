/* s0-air.js - Station 00: "A Tree Is Made of Air."

   Purpose
     Overturn the everyday intuition that "plants eat soil." A tree's dry mass
     comes almost entirely from atmospheric CO₂ (the carbon) and from water
     (the hydrogen and oxygen). Soil-derived minerals are only a few percent.

   Interactive
     The reader drags #s0-soil to enter their GUESS for what % of the tree's
     dry mass came from soil. A vertical stacked bar shows their guess as a
     brown soil segment vs a green "air + water" segment above it. Pressing
     #s0-reveal animates the bar over ~1 s into the real breakdown: a tiny
     soil sliver (~3 %) at the bottom, a blue "H + O from water" band
     (~50 %), and a red "carbon from CO₂" band on top (~47 %). The readout
     surfaces van Helmont's ~1648 willow result (~74 kg tree gain, ~60 g
     soil loss over 5 years) and the punchline: the mass is solidified sky.

   Always-alive world
     CO₂ molecules drift down from the sky and are absorbed into the tree
     crown at ~2 per second regardless of interaction. Each arrival triggers
     a brief green halo pulse around the crown. The tree "breathes" with a
     subtle 1 % scale oscillation.

   Dependencies (one-way, per architecture)
     engine.js  → mountStage (DPR canvas + rAF + off-screen pause)
     primitives → drawTree, drawSun
     particles  → ParticleSystem, bezierPath
     tokens     → COLORS (no hex hardcoded outside dark-palette gradients) */

import { COLORS } from '../tokens.js';
import { mountStage } from '../engine.js';
import { drawTree, drawSun } from '../primitives.js';
import { ParticleSystem, bezierPath } from '../particles.js';
import { lerp, mixHex, withAlpha, lighten } from '../util.js';

// --- The pedagogical truth --------------------------------------------------
// Rough percentages of a tree's DRY mass. Standard plant-biochem values:
// ~45-50 % C, ~42-45 % O, ~6 % H, ~2-5 % mineral ash. We collapse O + H (both
// sourced from water) and round to a clean 47 / 50 / 3 that adds to 100.
// Where a tree's DRY mass actually comes from (standard textbook model).
// The key correction: the OXYGEN in wood comes from CO₂, not water - water's
// oxygen leaves as O₂ (the Ruben-Kamen point in Station 3). Only hydrogen is
// from water. So carbon + oxygen (~91%) both come from the AIR.
const TRUTH_CARBON   = 47;  // carbon, from CO₂ in the air
const TRUTH_OXYGEN   = 44;  // oxygen, ALSO from CO₂ in the air
const TRUTH_HYDROGEN = 6;   // hydrogen, from water
const TRUTH_SOIL     = 3;   // minerals, from soil
const TRUTH_AIR      = TRUTH_CARBON + TRUTH_OXYGEN;  // ~91% from thin air

// Van Helmont's willow experiment (~1648): ~74 kg gained by the tree, ~60 g
// lost by the soil over 5 years of watering. The famous demonstration that
// mass does NOT come from the ground.
const VH_TREE_KG    = 74;
const VH_SOIL_GRAMS = 60;

const REVEAL_DURATION = 1.0;   // seconds for the guess → truth snap
const SPAWN_PERIOD    = 0.45;  // seconds between CO₂ spawns (~2.2/s)
const ARRIVE_FLASH    = 0.6;   // seconds a green halo lingers after arrival

/* Mount the station: wire DOM, start the always-alive render loop. */
export function init(sectionEl) {
  try { mount(sectionEl); }
  catch (err) { console.error('[s0-air] init failed:', err); }
}

function mount(sectionEl) {
  const canvas   = sectionEl.querySelector('#s0-canvas');
  const slider   = sectionEl.querySelector('#s0-soil');
  const soilVal  = sectionEl.querySelector('#s0-soil-val');
  const revealBt = sectionEl.querySelector('#s0-reveal');
  const readout  = sectionEl.querySelector('#s0-readout');
  if (!canvas) { console.error('[s0-air] missing #s0-canvas'); return; }

  // State: reader's soil-% guess + reveal button/animation progress + CO₂
  // spawn timing and arrival bookkeeping (drives tree growth + halo pulse).
  const state = {
    guess: Number(slider?.value ?? 70),
    revealed: false, revealT: 0,
    spawnAcc: 0, lastArriveT: -10, arrivals: 0, tNow: 0,
  };

  const particles = new ParticleSystem(180);

  if (slider && soilVal) {
    soilVal.textContent = state.guess + '%';
    slider.addEventListener('input', () => {
      state.guess = Number(slider.value);
      soilVal.textContent = state.guess + '%';
      if (readout && !state.revealed) readout.textContent = guessBlurb(state.guess);
    });
  }
  if (revealBt) {
    revealBt.addEventListener('click', () => {
      if (state.revealed) return;
      state.revealed = true;
      state.revealT = 0;
      if (readout) readout.textContent = revealBlurb();
      revealBt.disabled = true;
      revealBt.textContent = 'Revealed';
    });
  }

  mountStage(canvas, (ctx, dt, t, W, H) => {
    renderFrame(ctx, dt, t, W, H, state, particles);
  }, { background: COLORS.bgDeep });
}

/* --------------------------------------------------------------------------
   Per-frame render. Splits the canvas into the tree scene (left / top) and
   the breakdown chart (right / bottom). At narrow widths (< 620 CSS px) the
   two stack vertically so labels never crowd the tree. */

function renderFrame(ctx, dt, t, W, H, state, particles) {
  state.tNow = t;

  if (state.revealed && state.revealT < 1) {
    state.revealT = Math.min(1, state.revealT + dt / REVEAL_DURATION);
  }

  const stacked = W < 620;
  const scene = stacked
    ? { x: 0, y: 0, w: W, h: Math.round(H * 0.62) }
    : { x: 0, y: 0, w: Math.round(W * 0.6), h: H };
  const chart = stacked
    ? { x: 0, y: scene.h, w: W, h: H - scene.h }
    : { x: scene.w, y: 0, w: W - scene.w, h: H };

  drawSky(ctx, scene);
  spawnCO2(scene, state, particles, dt);
  particles.update(dt);
  drawTreeScene(ctx, scene, t, state);
  particles.draw(ctx);          // CO₂ overlays the tree so arrivals read visually
  drawChart(ctx, chart, state);
}

/* Sky + ground background for the tree scene. Colors stay within the site's
   dark palette (bgSurface → bgElevated for the sky; a subtle brown wash on
   top of bgDeep for the ground). */
function drawSky(ctx, s) {
  const sky = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h * 0.78);
  sky.addColorStop(0, COLORS.bgSurface);
  sky.addColorStop(1, COLORS.bgElevated);
  ctx.fillStyle = sky;
  ctx.fillRect(s.x, s.y, s.w, s.h);

  const groundY = s.y + Math.round(s.h * 0.78);
  ctx.fillStyle = COLORS.bgDeep;
  ctx.fillRect(s.x, groundY, s.w, s.h - (groundY - s.y));
  // A faint warm wash on the soil so it reads as "earth", not just void.
  ctx.fillStyle = 'rgba(90, 60, 38, 0.22)';
  ctx.fillRect(s.x, groundY, s.w, s.h - (groundY - s.y));
}

/* The tree, the sun, and the arrival-flash halo. */
function drawTreeScene(ctx, s, t, state) {
  const groundY = s.y + Math.round(s.h * 0.78);
  drawSun(ctx, s.x + s.w - 54, s.y + 54, { r: 26, intensity: 1 });

  const baseH = Math.min(260, Math.max(180, s.h * 0.72));
  // Slow, capped growth as CO₂ arrives. Ramps 0 → +6 % over the first ~60
  // arrivals, then holds - so the tree visibly gains a little mass from air.
  const growth = Math.min(1, state.arrivals / 60);
  const H = baseH * (1 + 0.06 * growth);
  const tx = s.x + Math.round(s.w * 0.42);
  const ty = groundY;

  // "Breathing" scale: ±1 % at ~0.4 Hz. Alive without being fidgety.
  const breath = 1 + 0.01 * Math.sin(t * 0.4 * Math.PI * 2);

  // Recent CO₂ arrival → brief green glow around the crown.
  const sinceArrive = t - state.lastArriveT;
  if (sinceArrive >= 0 && sinceArrive < ARRIVE_FLASH) {
    const a = (1 - sinceArrive / ARRIVE_FLASH) * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = tx, cy = ty - H * 0.7;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.55);
    halo.addColorStop(0, withAlpha(COLORS.chloro, a));
    halo.addColorStop(1, withAlpha(COLORS.chloro, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.restore();
  }

  drawTree(ctx, tx, ty, { height: H, scale: breath, glow: true, seed: 11 });

  // "soil" caption in the ground band (small so it doesn't crowd the tree).
  ctx.save();
  ctx.font = '500 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = COLORS.textMuted;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('soil', s.x + 14, groundY + 16);
  ctx.restore();
}

/* Paced CO₂ spawner: sky-edge start point → gentle Bezier arc → crown target. */
function spawnCO2(s, state, particles, dt) {
  if (dt <= 0) return;   // static frame - don't churn the pool
  state.spawnAcc += dt;
  const groundY = s.y + Math.round(s.h * 0.78);
  const H = Math.min(260, Math.max(180, s.h * 0.72));
  const treeX = s.x + Math.round(s.w * 0.42);
  const crownY = groundY - H * 0.7;

  while (state.spawnAcc >= SPAWN_PERIOD) {
    state.spawnAcc -= SPAWN_PERIOD;

    const edge = Math.random();
    let sx, sy;
    if (edge < 0.55) {                     // top edge - most CO₂ falls from above
      sx = s.x + 20 + Math.random() * (s.w - 40);
      sy = s.y + 8 + Math.random() * 36;
    } else if (edge < 0.8) {               // right edge
      sx = s.x + s.w - 12 - Math.random() * 28;
      sy = s.y + 40 + Math.random() * Math.max(20, (groundY - s.y - 80));
    } else {                               // left edge
      sx = s.x + 8 + Math.random() * 28;
      sy = s.y + 40 + Math.random() * Math.max(20, (groundY - s.y - 80));
    }
    const tx = treeX + (Math.random() - 0.5) * H * 0.35;
    const ty = crownY + (Math.random() - 0.5) * H * 0.25;
    const midX = (sx + tx) / 2 + (Math.random() - 0.5) * 60;
    const midY = Math.min(sy, ty) - 30 - Math.random() * 40;
    const path = bezierPath([sx, sy], [midX, midY], [midX, (midY + ty) / 2], [tx, ty]);

    particles.spawnOnPath('co2', path, {
      duration: 3.5 + Math.random() * 1.5,
      jitter: 4,
      scale: 0.85,
      onArrive: () => { state.lastArriveT = state.tNow; state.arrivals++; },
    });
  }
}

/* --------------------------------------------------------------------------
   The breakdown chart. Vertical stacked bar with animated color + segment
   heights, plus fade-crossed labels for pre- vs post-reveal. */

function drawChart(ctx, c, state) {
  const pad = 18;
  const inner = { x: c.x + pad, y: c.y + pad, w: c.w - pad * 2, h: c.h - pad * 2 };

  ctx.save();
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = COLORS.textSecondary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const title = state.revealed ? "The tree's dry mass" : 'Your guess';
  ctx.fillText(title, inner.x, inner.y);
  ctx.restore();

  const barTop = inner.y + 30;
  const barBot = inner.y + inner.h - 6;
  const barH   = Math.max(60, barBot - barTop);
  const barW   = 46;
  const barX   = inner.x;

  // Interpolated percentages. Pre-reveal: soil = guess, the rest is one green
  // "air + water" band. Post-reveal: soil animates toward 3 %, and the rest
  // splits into carbon + oxygen (both from CO₂ in the AIR) + hydrogen (water).
  const soilPct = lerp(state.guess, TRUTH_SOIL, state.revealT);
  const rest    = 100 - soilPct;                       // everything but soil
  const denom   = TRUTH_CARBON + TRUTH_OXYGEN + TRUTH_HYDROGEN;
  const carbPct = rest * TRUTH_CARBON   / denom;
  const oxyPct  = rest * TRUTH_OXYGEN   / denom;
  const hydPct  = rest * TRUTH_HYDROGEN / denom;

  // Colors: all start GREEN (fused "air + water" at revealT 0). Carbon and
  // oxygen resolve to reds (both from the air); hydrogen to blue (water).
  const airRed    = COLORS.co2;                 // carbon
  const airRedLt  = lighten(COLORS.co2, 0.26);  // oxygen - lighter red, still "air"
  const carbColor = mixHex(COLORS.accent, airRed,   state.revealT);
  const oxyColor  = mixHex(COLORS.accent, airRedLt, state.revealT);
  const hydColor  = mixHex(COLORS.accent, COLORS.h2o, state.revealT);
  const soilColor = COLORS.sugar;

  const hCarb = barH * (carbPct / 100);
  const hOxy  = barH * (oxyPct  / 100);
  const hHyd  = barH * (hydPct  / 100);
  const hSoil = barH * (soilPct / 100);

  let y = barTop;
  ctx.fillStyle = carbColor; ctx.fillRect(barX, y, barW, hCarb); y += hCarb;
  ctx.fillStyle = oxyColor;  ctx.fillRect(barX, y, barW, hOxy);  y += hOxy;
  ctx.fillStyle = hydColor;  ctx.fillRect(barX, y, barW, hHyd);  y += hHyd;
  ctx.fillStyle = soilColor; ctx.fillRect(barX, y, barW, hSoil);

  // Bracket the two air bands (post-reveal) - the punchline.
  if (state.revealT > 0.05) {
    ctx.save();
    ctx.globalAlpha = state.revealT;
    ctx.strokeStyle = COLORS.accent2;
    ctx.lineWidth = 2;
    const bx = barX - 7, y0 = barTop + 1, y1 = barTop + hCarb + hOxy - 1;
    ctx.beginPath();
    ctx.moveTo(bx + 4, y0); ctx.lineTo(bx, y0);
    ctx.lineTo(bx, y1); ctx.lineTo(bx + 4, y1);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = COLORS.ruleStrong;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, barTop + 0.5, barW, barH);

  // Labels on the right. The green "air + water" label fades OUT; the four
  // resolved labels fade IN. Soil stays visible throughout.
  const labelX = barX + barW + 18;
  const preA   = 1 - state.revealT;
  const postA  = state.revealT;

  // Stagger post-reveal labels so thin bands don't collide.
  const cMid = barTop + hCarb / 2;
  const oMid = Math.max(barTop + hCarb + hOxy / 2, cMid + 20);
  const hMid = Math.max(barTop + hCarb + hOxy + hHyd / 2, oMid + 20);
  drawSegLabel(ctx, labelX, cMid, airRed,       'Carbon - from the air', pctText(TRUTH_CARBON), postA);
  drawSegLabel(ctx, labelX, oMid, airRedLt,     'Oxygen - from the air', pctText(TRUTH_OXYGEN), postA);
  drawSegLabel(ctx, labelX, hMid, COLORS.h2o,   'Hydrogen - from water', pctText(TRUTH_HYDROGEN), postA);

  // Pre-reveal single label for the combined green band.
  const combinedMid = barTop + (hCarb + hOxy + hHyd) / 2;
  drawSegLabel(ctx, labelX, combinedMid, COLORS.accent, 'Air + water', pctText(rest), preA);

  // Soil label - nudged below the others.
  const soilMid = Math.max(barTop + hCarb + hOxy + hHyd + hSoil / 2, hMid + 20);
  drawSegLabel(ctx, labelX, soilMid, soilColor, 'Minerals - from soil', pctText(soilPct), 1);

  // Punchline tag at the top of the bar (post-reveal) - "91% from the air".
  if (state.revealT > 0.5) {
    ctx.save();
    ctx.globalAlpha = (state.revealT - 0.5) * 2;
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = COLORS.accent2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('↑ ' + TRUTH_AIR + '% from the air', labelX, barTop - 4);
    ctx.restore();
  }
}

/* One "chip + name + percent" row, drawn at a given alpha. Skipped when
   effectively invisible so the crossfade is cheap. */
function drawSegLabel(ctx, x, y, color, name, pct, alpha) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = color;
  ctx.fillRect(x, y - 5, 10, 10);

  ctx.font = '500 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = COLORS.textPrimary;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(name, x + 18, y);
  const nameW = ctx.measureText(name).width;

  ctx.font = '600 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText('  ' + pct, x + 18 + nameW, y);

  ctx.restore();
}

/* --------------------------------------------------------------------------
   Small helpers. lerp + mixHex live in util.js. */

function pctText(p) { return Math.round(p) + '%'; }

/* Readout copy - plain, declarative, no rhetorical questions. */

function guessBlurb(pct) {
  if (pct >= 60) return `You're guessing ${pct}% of the mass came out of the ground. Most people guess that high. Press reveal.`;
  if (pct >= 20) return `A middling guess: ${pct}% from soil. The real answer surprised botanists for centuries.`;
  return `${pct}% from soil? Bold. See what van Helmont's willow experiment actually found.`;
}

function revealBlurb() {
  return `Van Helmont grew a willow for five years, adding only water. It gained about ${VH_TREE_KG} kg; the soil lost only about ${VH_SOIL_GRAMS} g. But the real source is the air: about ${TRUTH_CARBON}% of a tree's dry mass is carbon and another ~${TRUTH_OXYGEN}% is oxygen - and BOTH are pulled from CO₂ in the air, not the ground. Only ~${TRUTH_HYDROGEN}% (the hydrogen) comes from water, and ~${TRUTH_SOIL}% from soil minerals. Over ${TRUTH_AIR}% of a tree is, atom by atom, assembled out of thin air.`;
}
