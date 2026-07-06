/* stations/s1-zoom.js - Station 1: Zoom Into a Leaf.

   One continuous descent through six orders of magnitude - tree, leaf,
   layered tissue, one mesophyll cell packed with chloroplasts. Slider drives
   a global depth u ∈ [0,1]; four scenes crossfade at thresholds, and inside
   each scene the drawing scales inward, so the ride feels like flying down.

   Near cell scale a gentle gas flow runs: CO₂ (red) drifts IN through the
   stoma, O₂ (orange) drifts OUT. Colors come from tokens per the Molecule
   Color Law - never hardcoded.

   DOM contract inside sectionEl:
     canvas #s1-canvas, slider #s1-zoom (0-1000), label #s1-zoom-val,
     readout #s1-readout.
*/

import { mountStage } from '../engine.js';
import { COLORS } from '../tokens.js';
import {
  drawTree, drawLeafCrossSection, drawLeafCell, roundedLeafPath, drawSun,
} from '../primitives.js';
import { ParticleSystem, bezierPath } from '../particles.js';
import { clamp, smoothstep, roundRect, withAlpha, prefersReducedMotion } from '../util.js';

const REDUCED_MOTION = prefersReducedMotion();

/* Four semantic-zoom scenes. name → slider label; size + read → readout. */
const SCENES = [
  { key: 'tree',  name: 'whole tree',      size: '~5-10 m',
    read: 'A whole tree - a few meters of wood, twig, and leaf.' },
  { key: 'leaf',  name: 'one leaf',        size: '~10 cm',
    read: 'A single leaf - a flat solar panel, veins delivering water.' },
  { key: 'cross', name: 'inside the leaf', size: '~0.3 mm thick',
    read: 'Cross-section - cuticle, palisade cells, spongy layer, a stoma.' },
  { key: 'cell',  name: 'a single cell',   size: '~30-50 µm',
    read: 'One mesophyll cell - dozens of chloroplasts do the work.' },
];

// smoothstep + clamp hoisted to util.js. `rand` stays local; it's only used
// here for the CO₂/O₂ flow spawners at the bottom of this file.
const rand = (a, b) => a + Math.random() * (b - a);

/* Global u → per-scene weights (sum ≈ 1) and each scene's local depth. */
function sceneMix(u) {
  const t1 = smoothstep(0.15, 0.30, u);
  const t2 = smoothstep(0.45, 0.60, u);
  const t3 = smoothstep(0.70, 0.85, u);
  return {
    weights: {
      tree:  1 - t1,
      leaf:  t1 * (1 - t2),
      cross: t2 * (1 - t3),
      cell:  t3,
    },
    depths: {
      tree:  clamp(u / 0.25,           0, 1),
      leaf:  clamp((u - 0.20) / 0.30,  0, 1),
      cross: clamp((u - 0.50) / 0.30,  0, 1),
      cell:  clamp((u - 0.75) / 0.25,  0, 1),
    },
  };
}

/* ------------------------------------------------------------------------- */

export function init(sectionEl) {
  try { mount(sectionEl); }
  catch (err) { console.error('[s1-zoom] init failed:', err); }
  // Panel prose + slider survive; the canvas just stays dark.
}

function mount(sectionEl) {
  const canvas   = sectionEl.querySelector('#s1-canvas');
  const slider   = sectionEl.querySelector('#s1-zoom');
  const valLabel = sectionEl.querySelector('#s1-zoom-val');
  const readout  = sectionEl.querySelector('#s1-readout');
  if (!canvas || !slider) return;

  const system = new ParticleSystem(120);
  let u = slider.valueAsNumber / 1000;

  // First-two-molecules teaching aid at cell scale: label the first couple of
  // drifting CO₂ particles so the red pairs pin back to Station 0's "tree
  // from air" and the sidebar legend. Once the two have been assigned, no
  // more labels appear (this is a one-shot orient, not perpetual chrome).
  //
  // Slot-recycling is real: after a particle dies, its id may be reused by
  // any species. We store {id, seed} at spawn time (pathSeed is set to
  // Math.random() then) and drop the label the moment the seed no longer
  // matches - which guarantees we never label a stranger.
  const MAX_CO2_LABELS = 2;
  const labeledCO2 = [];       // live entries: [{ id, seed }, ...]
  let co2LabelsAssigned = 0;   // monotonic - never resets while mounted

  const updateReadout = () => {
    const { weights } = sceneMix(u);
    let best = SCENES[0], bestW = -1;
    for (const s of SCENES) if (weights[s.key] > bestW) { bestW = weights[s.key]; best = s; }
    if (valLabel) valLabel.textContent = best.name;
    if (readout)  readout.textContent  = `${best.size} - ${best.read}`;
  };
  updateReadout();

  /* CO₂/O₂ flow spawner - only fires while scenes 3-4 are on-screen. */
  let flowClock = 0;
  const trySpawnFlow = (dt, W, H, weights) => {
    if (REDUCED_MOTION) return;
    const active = weights.cross + weights.cell;
    if (active < 0.15) { flowClock = 0; return; }
    flowClock += dt;
    while (flowClock >= 0.55) {
      flowClock -= 0.55;
      if (weights.cross > weights.cell) {
        spawnCrossFlow(system, W, H);
      } else {
        // spawnCellFlow returns the CO₂ id so we can label the first couple.
        const co2Id = spawnCellFlow(system, W, H);
        if (co2LabelsAssigned < MAX_CO2_LABELS && co2Id >= 0) {
          labeledCO2.push({ id: co2Id, seed: system.pathSeed[co2Id] });
          co2LabelsAssigned++;
        }
      }
    }
  };

  const stage = mountStage(canvas, (ctx, dt, t, W, H) => {
    const { weights, depths } = sceneMix(u);
    const viewW = Math.min(W, 900);
    const viewH = H;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    if (weights.tree  > 0.01) drawTreeScene (ctx, viewW, viewH, depths.tree,  weights.tree,  t);
    if (weights.leaf  > 0.01) drawLeafScene (ctx, viewW, viewH, depths.leaf,  weights.leaf );
    if (weights.cross > 0.01) drawCrossScene(ctx, viewW, viewH, depths.cross, weights.cross);
    if (weights.cell  > 0.01) drawCellScene (ctx, viewW, viewH, depths.cell,  weights.cell );

    // Only the dominant scene's labels draw, so they never collide.
    let bestKey = 'tree', bestW = 0;
    for (const s of SCENES) if (weights[s.key] > bestW) { bestW = weights[s.key]; bestKey = s.key; }
    drawLabels(ctx, viewW, viewH, bestKey, bestW);
    ctx.restore();

    // Particles use canvas-absolute coords (they don't share our transform).
    trySpawnFlow(dt, W, H, weights);
    system.update(dt);
    system.draw(ctx);

    // "CO₂" tags on the first couple of drifting particles at cell scale.
    // Filter recycled slots defensively via the stored pathSeed.
    if (labeledCO2.length) {
      for (let i = labeledCO2.length - 1; i >= 0; i--) {
        const { id, seed } = labeledCO2[i];
        if (!system.alive[id] || system.pathSeed[id] !== seed) {
          labeledCO2.splice(i, 1);
        }
      }
      drawCO2Labels(ctx, system, labeledCO2);
    }
  }, { background: COLORS.bgDeep });

  // prefers-reduced-motion: Stage paints once. Repaint on scrub.
  slider.addEventListener('input', () => {
    u = slider.valueAsNumber / 1000;
    updateReadout();
    if (REDUCED_MOTION) stage.renderStatic();
  });
}

/* -------- scenes --------
   All draw in coords centered on the canvas. d ∈ [0,1] is local zoom
   progress (0 = just entered, 1 = about to hand off). */

function drawTreeScene(ctx, W, H, d, alpha, t) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawSun(ctx, W * 0.32, -H * 0.32, { r: 22, intensity: 0.9 });

  // Horizon.
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-W * 0.5, H * 0.32);
  ctx.lineTo( W * 0.5, H * 0.32);
  ctx.stroke();

  // Tree grows as we fly closer.
  const treeH = H * 0.62 * (1 + d * 0.55);
  drawTree(ctx, 0, H * 0.32, { height: treeH, seed: 11, glow: true });

  // A pulsing leaf in the crown marks our destination.
  const hx = -treeH * 0.05, hy = H * 0.32 - treeH * 0.72;
  const pulse = 0.65 + 0.35 * Math.sin(t * 2.4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 22 * pulse;
  ctx.fillStyle = 'rgba(200, 255, 210, 0.95)';
  ctx.fill(roundedLeafPath(hx, hy, 16, 9));
  ctx.restore();

  ctx.restore();
}

function drawLeafScene(ctx, W, H, d, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const w = Math.min(W * 0.66, 560) * (1 + d * 0.35);
  const h = w * 0.52;

  // Blade with a chlorophyll glow.
  ctx.save();
  ctx.shadowColor = COLORS.chloro;
  ctx.shadowBlur = 22;
  const g = ctx.createLinearGradient(-w/2, 0, w/2, 0);
  g.addColorStop(0,   'rgba(50, 160, 90, 0.60)');
  g.addColorStop(0.5, 'rgba(90, 220, 140, 0.75)');
  g.addColorStop(1,   'rgba(40, 140, 80, 0.55)');
  ctx.fillStyle = g;
  ctx.fill(roundedLeafPath(0, 0, w, h));
  ctx.restore();

  // Midrib + side veins.
  ctx.strokeStyle = 'rgba(220, 250, 225, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-w/2 + 6, 0); ctx.lineTo(w/2 - 6, 0); ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(220, 250, 225, 0.32)';
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const x = i * w * 0.11, sx = Math.sign(-i), sy = Math.sign(i);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + sx * w * 0.08, sy * h * 0.10,
                         x + sx * w * 0.15, sy * h * 0.30);
    ctx.stroke();
  }

  // Stomata on the underside.
  ctx.fillStyle = 'rgba(0, 30, 15, 0.6)';
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.ellipse(i * w * 0.075, h * 0.22, 2.4, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCrossScene(ctx, W, H, d, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const w = Math.min(W * 0.86, 780) * (1 + d * 0.20);
  const h = Math.min(H * 0.62, 260) * (1 + d * 0.30);
  drawLeafCrossSection(ctx, 0, 0, { w, h, seed: 7 });
  ctx.restore();
}

function drawCellScene(ctx, W, H, d, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const scale = 1.6 + d * 1.4;
  drawLeafCell(ctx, 0, 0, { w: 220, h: 140, seed: 5, chloroplasts: 10, scale });
  ctx.restore();
}

/* -------- labels --------
   Proportional (fx, fy) in [-0.5, 0.5] so labels scale with the viewport.
   Only the dominant scene's labels draw, so scenes never collide. */

const LABELS = {
  tree: [
    { fx: 0,     fy:  0.42, text: 'a tree - ~5-10 meters tall' },
  ],
  leaf: [
    { fx: 0,     fy: -0.38, text: 'one leaf - ~10 cm across' },
    { fx: -0.34, fy:  0.12, text: 'veins carry water in' },
    { fx:  0.28, fy:  0.24, text: 'stomata dot the underside' },
  ],
  cross: [
    { fx: -0.34, fy: -0.32, text: 'cuticle (waxy skin)' },
    { fx: -0.34, fy: -0.08, text: 'palisade cells' },
    { fx:  0.30, fy:  0.06, text: 'spongy layer (air gaps)' },
    { fx:  0.14, fy:  0.34, text: 'stoma - the gas pore' },
  ],
  cell: [
    { fx: -0.30, fy: -0.34, text: 'a mesophyll cell (~40 µm)' },
    { fx:  0.26, fy:  0.34, text: 'chloroplasts (~5 µm each)' },
  ],
};

function drawLabels(ctx, W, H, sceneKey, alpha) {
  const labels = LABELS[sceneKey];
  if (!labels) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '500 12px "Inter", system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const pad = 6;
  for (const L of labels) {
    const tw = ctx.measureText(L.text).width;
    // Center around (fx*W, fy*H), then clamp so nothing hides at edges.
    let x = clamp(L.fx * W - tw / 2, -W/2 + 8, W/2 - tw - 8);
    let y = clamp(L.fy * H,          -H/2 + 12, H/2 - 12);
    ctx.fillStyle = 'rgba(8, 22, 15, 0.78)';            // bespoke pill bg
    roundRect(ctx, x - pad, y - 10, tw + pad * 2, 20, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 200, 170, 0.28)';      // bespoke rule-family
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(232, 242, 234, 0.95)';        // textPrimary at α
    ctx.fillText(L.text, x, y);
  }
  ctx.restore();
}

/* -------- particle flows --------
   Paths run in canvas-absolute coords (particles.draw doesn't share our
   centered transform). Stoma positions are approximate but visibly line
   up with the cross-section pores across the depth range. */

function spawnCrossFlow(system, W, H) {
  const cx = W / 2, cy = H / 2;
  const stomaR = cx + W * 0.20;
  const stomaL = cx - W * 0.20;
  const stomaY = cy + Math.min(H * 0.30, 130);

  // CO2 IN - up from outside, through the right stoma, into the leaf.
  system.spawnOnPath('co2', bezierPath(
    [stomaR + rand(-40, 40), stomaY + 90],
    [stomaR + rand(-24, 24), stomaY + 30],
    [stomaR + rand(-18, 18), stomaY - 20],
    [stomaR + rand(-90, 90), stomaY - 100],
  ), { duration: 3.4, jitter: 4, scale: 0.7 });

  // O2 OUT - reverse, escaping through the left stoma.
  system.spawnOnPath('o2', bezierPath(
    [stomaL + rand(-90, 90), stomaY - 100],
    [stomaL + rand(-18, 18), stomaY - 20],
    [stomaL + rand(-24, 24), stomaY + 30],
    [stomaL + rand(-40, 40), stomaY + 90],
  ), { duration: 3.4, jitter: 4, scale: 0.7 });
}

/* Returns the CO₂ particle id (or -1) so the caller can label the first
 * couple of these drifters at cell scale. The O₂ id is discarded; it's the
 * red CO₂ that pins back to Station 0's "tree from air" story. */
function spawnCellFlow(system, W, H) {
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H) * 0.30;
  const aIn = Math.random() * Math.PI * 2;
  const aOut = Math.random() * Math.PI * 2;

  // CO2 drifts inward from off-canvas toward a chloroplast.
  const co2Id = system.spawnOnPath('co2', bezierPath(
    [cx + Math.cos(aIn) * R * 2.2, cy + Math.sin(aIn) * R * 2.2],
    [cx + Math.cos(aIn) * R * 1.4, cy + Math.sin(aIn) * R * 1.2],
    [cx + Math.cos(aIn) * R * 0.9, cy + Math.sin(aIn) * R * 0.7],
    [cx + rand(-30, 30),           cy + rand(-25, 25)],
  ), { duration: 3.0, jitter: 4, scale: 0.8 });

  // O2 drifts outward from the cell.
  system.spawnOnPath('o2', bezierPath(
    [cx + rand(-30, 30),             cy + rand(-25, 25)],
    [cx + Math.cos(aOut) * R * 0.9, cy + Math.sin(aOut) * R * 0.7],
    [cx + Math.cos(aOut) * R * 1.4, cy + Math.sin(aOut) * R * 1.2],
    [cx + Math.cos(aOut) * R * 2.2, cy + Math.sin(aOut) * R * 2.2],
  ), { duration: 3.0, jitter: 4, scale: 0.8 });

  return co2Id;
}

/* Tiny "CO₂" tags floating next to the first couple of red drifters. The
 * stroke gives the text a soft dark halo so it stays legible over the leaf
 * cell wash, and the fill uses the shared CO₂ token so the tag reads as
 * "same molecule as the sidebar legend". */
function drawCO2Labels(ctx, system, entries) {
  if (!entries.length) return;
  ctx.save();
  ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(4, 16, 11, 0.85)';
  const fill = withAlpha(COLORS.co2, 0.95);
  for (const { id } of entries) {
    const x = system.xs[id] + 10;
    const y = system.ys[id] - 8;
    ctx.strokeText('CO₂', x, y);
    ctx.fillStyle = fill;
    ctx.fillText('CO₂', x, y);
  }
  ctx.restore();
}
