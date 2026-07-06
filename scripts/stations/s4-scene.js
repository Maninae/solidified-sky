/* s4-scene.js - the chloroplast interior for Station 4.

   This is the "place" the ride happens inside of. It exports:

     * LAYOUT   - world-coord positions of every landmark (stoma, rubisco
                  cluster, PGA/G3P spots, grana column, sugar store, and the
                  specific glucose the tagged atom will join).
     * PHASE_FOCUS_SPOT / labelAlpha  - small pure helpers the main controller
                                        uses to light up landmarks in step
                                        with the atom's journey.
     * drawIdleScene(...)  - one call that paints the whole chloroplast
                              interior for the current frame (envelope,
                              stroma, grana column, rubisco cluster, stoma,
                              sugar store, ambient particles, landmark
                              labels). The main file overlays the atom, its
                              trail, and the pip meter on top of this.

   All rendering is stateless and colors come from tokens.js only, per the
   Molecule Color Law. */

import { COLORS } from '../tokens.js';
import { withAlpha, lighten } from '../util.js';
import {
  drawStroma, drawStoma, drawThylakoidStack, drawMolecule,
  blobPath, superellipsePath,
} from '../primitives.js';

/* ---- world layout ---------------------------------------------------------
   Origin = idle camera center. The chloroplast interior fills the visible
   canvas; the ride's entry (a CO₂ from outside) starts well to the left of
   the envelope so the camera physically pans into the organelle. */

export const LAYOUT = {
  /* Chloroplast envelope, a soft-cornered lozenge (superellipse). */
  CHLORO: { hw: 420, hh: 240 },

  /* Stoma - the leaf-surface pore just outside the envelope on the left.
     Schematic: CO₂ actually enters the leaf here and then diffuses to a
     chloroplast, so this reads as the entry landmark. */
  STOMA: { x: -395, y: 30 },

  /* Rubisco cluster - 3 enzyme blobs in the upper-left of the stroma. */
  RUBISCO_CLUSTER: [
    { x: -195, y: -95, seed: 17 },
    { x: -155, y: -55, seed: 41 },
    { x: -140, y: -108, seed: 63 },
  ],
  /* Where RuBP + the new carbon meet - centered inside the rubisco cluster. */
  RUBP_ANCHOR: { x: -165, y: -70 },

  /* Where the 6-carbon splits into two 3-PGA - just downstream of rubisco. */
  PGA_SPOT: { x: -30, y: -30 },

  /* Where 3-PGA is reduced to G3P by ATP + NADPH streaming out of the grana. */
  G3P_SPOT: { x: 100, y: 55 },

  /* Where the cycle turns "off-camera" beat sits - down-left of the grana. */
  REGEN_SPOT: { x: -60, y: 150 },

  /* Grana column - the thylakoid stacks that make ATP + NADPH. On the right
     side of the stroma, so the carriers visibly stream FROM here into the
     atom during the reduction. */
  GRANA_POSITIONS: [
    { x: 305, y: -140 },
    { x: 320, y:  -10 },
    { x: 300, y:  135 },
  ],

  /* Sugar store - the chloroplast's accumulated glucose pool in the
     bottom-right corner. GLUCOSE_STORE_OFFSETS lists positions relative
     to SUGAR_STORE for the many glucose molecules already sitting there.
     The tagged atom lands in the one at CHOSEN_GLUCOSE_INDEX. */
  SUGAR_STORE: { x: 235, y: 175 },
  GLUCOSE_STORE_OFFSETS: [
    { x: -62, y: -22 }, { x: -32, y: -32 }, { x:  -6, y: -20 },
    { x:  24, y: -30 }, { x:  50, y: -14 }, { x:  70, y:  10 },
    { x: -48, y:   6 }, { x: -18, y:  12 }, { x:  12, y:   4 },
    { x:  40, y:  22 }, { x:  62, y:  32 }, { x: -68, y:  30 },
    { x: -30, y:  38 }, { x:  -2, y:  40 }, { x:  30, y:  46 },
  ],
  CHOSEN_GLUCOSE_INDEX: 8,
};
LAYOUT.CHOSEN_GLUCOSE_WORLD = {
  x: LAYOUT.SUGAR_STORE.x + LAYOUT.GLUCOSE_STORE_OFFSETS[LAYOUT.CHOSEN_GLUCOSE_INDEX].x,
  y: LAYOUT.SUGAR_STORE.y + LAYOUT.GLUCOSE_STORE_OFFSETS[LAYOUT.CHOSEN_GLUCOSE_INDEX].y,
};

/* Map a phase's `focus` key to the world point the active-highlight ring
   should sit on. `inside` returns null - the whole stroma is "the place"
   during that beat, so no single ring makes sense. */
export function focusSpot(focus) {
  const L = LAYOUT;
  switch (focus) {
    case 'stoma':   return L.STOMA;
    case 'rubisco': return { x: L.RUBP_ANCHOR.x, y: L.RUBP_ANCHOR.y };
    case 'pga':     return L.PGA_SPOT;
    case 'g3p':     return L.G3P_SPOT;
    case 'regen':   return L.REGEN_SPOT;
    case 'store':   return L.SUGAR_STORE;
    default:        return null;
  }
}

/* Label alpha per phase index. Landmarks stay quiet until the atom's tour
   arrives at each one, so the idle diagram reads calm and the ride teaches
   the parts in order. Reduced-motion mode returns full brightness for all
   labels so the static frame is fully readable. */
const DIM_LABEL = 0.28;
export function labelAlpha(state, phases) {
  const a = { outside: DIM_LABEL, stoma: DIM_LABEL, inside: DIM_LABEL,
              rubisco: DIM_LABEL, pga: DIM_LABEL, g3p: DIM_LABEL,
              grana: DIM_LABEL, regen: DIM_LABEL, store: DIM_LABEL };
  if (state.staticDiagram) { for (const k in a) a[k] = 1; return a; }
  if (!state.riding && !state.done) return a;
  const idx = state.phaseIdx;
  // Phase order: 0 air, 1 stoma, 2 rubisco, 3 pga, 4 g3p, 5 cycle, 6 store.
  if (idx >= 0) { a.outside = 1; a.stoma = 1; a.grana = 0.5; }
  if (idx >= 1) a.inside = 1;
  if (idx >= 2) a.rubisco = 1;
  if (idx >= 3) a.pga = 1;
  if (idx >= 4) { a.g3p = 1; a.grana = 1; }
  if (idx >= 5) a.regen = 1;
  if (idx >= 6 || state.done) a.store = 1;
  return a;
}

/* World is designed at 900×500. Narrower canvases (mobile) get a uniform
   scale-down so the whole chloroplast still fits when idle. Returned so
   the main controller can apply the same transform to its ride overlay. */
export const DESIGN_W = 900;
export const DESIGN_H = 500;
export function worldScale(W, H) {
  return Math.min(W / DESIGN_W, H / DESIGN_H, 1);
}

/* Apply the standard camera transform: origin at canvas center, world scale
   applied, then panned by camX/camY (world coords). Callers must ctx.save()
   before and ctx.restore() after. */
export function applyCamera(ctx, W, H, camX, camY) {
  const s = worldScale(W, H);
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-camX, -camY);
}

/* ---- one entry point: draw the whole idle interior ------------------------
   `camX,camY` shift the world so the atom stays centered while riding. */

export function drawIdleScene(ctx, W, H, state, particles, camX = 0, camY = 0) {
  ctx.save();
  applyCamera(ctx, W, H, camX, camY);

  drawEnvelope(ctx);
  // Stroma fluid fills most of the envelope. Wider than the envelope so the
  // grain feathers to the edges instead of ending in a hard line.
  drawStroma(ctx, 0, 10, { w: LAYOUT.CHLORO.hw * 1.85,
                           h: LAYOUT.CHLORO.hh * 1.75, seed: 4 });
  drawGranaColumn(ctx, state.idleTheta);
  drawRubiscoCluster(ctx, state);
  drawStoma(ctx, LAYOUT.STOMA.x, LAYOUT.STOMA.y,
            { openness: 0.85, scale: 1.05 });
  drawSugarStore(ctx, state);
  drawLandmarkLabels(ctx, state);
  particles.draw(ctx);
  ctx.restore();
}

/* -------- envelope + interior wash ----------------------------------------- */

function drawEnvelope(ctx) {
  const outer = superellipsePath(0, 0, LAYOUT.CHLORO.hw, LAYOUT.CHLORO.hh, 3.2);
  const inner = superellipsePath(0, 0, LAYOUT.CHLORO.hw - 10,
                                       LAYOUT.CHLORO.hh - 10, 3.2);
  ctx.save();
  // Faint interior wash so the envelope reads as a filled body, not a hoop.
  const wash = ctx.createRadialGradient(-60, -40, 20, 0, 0, LAYOUT.CHLORO.hw);
  wash.addColorStop(0,   withAlpha(lighten(COLORS.chloro, 0.25), 0.10));
  wash.addColorStop(0.7, withAlpha(COLORS.chloro, 0.045));
  wash.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = wash;
  ctx.fill(outer);
  // Outer + inner membrane strokes (the chloroplast's double envelope).
  ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.4), 0.55);
  ctx.lineWidth = 2;
  ctx.stroke(outer);
  ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.2), 0.32);
  ctx.lineWidth = 1;
  ctx.stroke(inner);
  ctx.restore();
}

/* -------- grana stacks along the right side --------------------------------
   A subtle dashed line strings them together suggesting the thylakoid
   network; the dash offset animates so the "light reactions next door"
   feel alive even when the ride isn't running. */

function drawGranaColumn(ctx, theta) {
  ctx.save();
  ctx.strokeStyle = withAlpha(COLORS.chloro, 0.28);
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -theta * 22;
  ctx.beginPath();
  for (let i = 0; i < LAYOUT.GRANA_POSITIONS.length; i++) {
    const g = LAYOUT.GRANA_POSITIONS[i];
    if (i === 0) ctx.moveTo(g.x, g.y); else ctx.lineTo(g.x, g.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  for (const g of LAYOUT.GRANA_POSITIONS) {
    drawThylakoidStack(ctx, g.x, g.y, { scale: 0.85, count: 5 });
  }
}

/* -------- rubisco cluster --------------------------------------------------
   Three teal blobs, tightly packed. The whole cluster pulses when the ride's
   focus is on rubisco. A small RuBP node marker sits at the anchor point so
   the "welded onto RuBP" step reads as arriving at a specific spot. */

function drawRubiscoCluster(ctx, state) {
  const active = state.activeFocus === 'rubisco';
  const pulse = active ? 0.55 + 0.4 * Math.sin(state.idleTheta * 6) : 0.55;
  for (const b of LAYOUT.RUBISCO_CLUSTER) {
    const path = blobPath(b.x, b.y, 22, { harmonics: 3, amp: 0.20, seed: b.seed });
    ctx.save();
    ctx.shadowColor = COLORS.rubisco;
    ctx.shadowBlur = active ? 22 : 10;
    ctx.fillStyle = withAlpha(COLORS.rubisco, pulse * 0.7);
    ctx.fill(path);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = COLORS.rubisco;
    ctx.lineWidth = 1.3;
    ctx.stroke(path);
    ctx.restore();
  }
  // RuBP marker — a small green ring where the atom will dock.
  ctx.save();
  ctx.fillStyle = withAlpha(COLORS.chloro, 0.24);
  ctx.beginPath();
  ctx.arc(LAYOUT.RUBP_ANCHOR.x, LAYOUT.RUBP_ANCHOR.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(COLORS.chloro, 0.7);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/* -------- sugar store: the chloroplast's accumulated glucose pool ----------
   A warm radial wash pooling in the corner, plus many glucose hexagons the
   atom is going to join. The chosen glucose is drawn separately with an
   accent2 gold ring that pulses as the atom arrives. */

function drawSugarStore(ctx, state) {
  const S = LAYOUT.SUGAR_STORE;
  const revealed = state.phaseIdx >= 5 || state.done;

  ctx.save();
  const wash = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, 130);
  wash.addColorStop(0, withAlpha(COLORS.sugar, revealed ? 0.24 : 0.10));
  wash.addColorStop(1, withAlpha(COLORS.sugar, 0));
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.arc(S.x, S.y, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Dim the store early; brighten it once the atom is on the exit leg so the
  // "one among many" reveal lands with the payoff.
  const baseAlpha = revealed ? 0.95 : 0.32;
  const offs = LAYOUT.GLUCOSE_STORE_OFFSETS;
  for (let i = 0; i < offs.length; i++) {
    if (i === LAYOUT.CHOSEN_GLUCOSE_INDEX) continue; // drawn separately
    ctx.save();
    ctx.globalAlpha = baseAlpha * (0.55 + 0.45 * ((i * 37) % 7) / 6);
    drawMolecule(ctx, 'glucose', S.x + offs[i].x, S.y + offs[i].y,
                 { scale: 0.85, glow: revealed });
    ctx.restore();
  }

  // The chosen glucose — always present, but only glows when the atom lands.
  const c = offs[LAYOUT.CHOSEN_GLUCOSE_INDEX];
  const glow = state.chosenGlucoseGlow;
  ctx.save();
  ctx.globalAlpha = baseAlpha;
  drawMolecule(ctx, 'glucose', S.x + c.x, S.y + c.y,
               { scale: 0.95 + 0.20 * glow, glow: true });
  if (glow > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(COLORS.accent2, 0.7 * glow);
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.accent2;
    ctx.shadowBlur = 14 * glow;
    ctx.beginPath();
    ctx.arc(S.x + c.x, S.y + c.y, 20, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/* -------- landmark labels --------------------------------------------------
   Placed spatially so the reader can tie each label to the thing it names.
   Alphas from labelAlpha() so we brighten in step with the ride. */

function drawLandmarkLabels(ctx, state) {
  const la = labelAlpha(state);
  // Spatial labels for the landmarks. Placed to never collide with each
  // other (staggered vertically where possible) and to sit inside the
  // envelope where they name something inside it.
  label(ctx, LAYOUT.STOMA.x + 10, LAYOUT.STOMA.y - 22, 'stoma', COLORS.textSecondary, la.stoma);
  label(ctx, -330, -218, 'outside the leaf', COLORS.textMuted, la.outside);
  label(ctx, -30, -218, 'chloroplast interior · stroma', COLORS.textMuted, la.inside);
  label(ctx, LAYOUT.RUBISCO_CLUSTER[0].x - 26, LAYOUT.RUBISCO_CLUSTER[0].y - 32, 'rubisco', COLORS.rubisco, la.rubisco);
  // RuBP label sits clear below-right of the enzyme cluster so the third
  // rubisco blob's glow never eats the first letter.
  label(ctx, LAYOUT.RUBP_ANCHOR.x + 60, LAYOUT.RUBP_ANCHOR.y + 44, 'RuBP', COLORS.chloro, la.rubisco);
  label(ctx, LAYOUT.PGA_SPOT.x, LAYOUT.PGA_SPOT.y - 20, '3-PGA', COLORS.sugar, la.pga);
  label(ctx, LAYOUT.G3P_SPOT.x, LAYOUT.G3P_SPOT.y - 22, 'G3P', COLORS.sugar, la.g3p);
  label(ctx, 300, LAYOUT.GRANA_POSITIONS[0].y - 46, 'grana · ATP + NADPH', COLORS.chloro, la.grana);
  label(ctx, LAYOUT.REGEN_SPOT.x, LAYOUT.REGEN_SPOT.y - 22, 'cycle turns', COLORS.textMuted, la.regen);
  // Sugar store label sits ABOVE the store cluster so it stays inside the
  // canvas even at the tight 500px design height.
  label(ctx, LAYOUT.SUGAR_STORE.x, LAYOUT.SUGAR_STORE.y - 62, 'sugar store', COLORS.sugar, la.store);
}

function label(ctx, x, y, text, color, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.fillStyle = withAlpha(color, alpha);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.restore();
}
