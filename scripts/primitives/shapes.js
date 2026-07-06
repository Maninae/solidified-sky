/* primitives/shapes.js - organic-shape helpers plus the small lighting
   utilities every primitive draw function shares.

   Two responsibilities live here so both siblings (organelles + molecules)
   can share one convention:

     * shape helpers   - blobPath, superellipsePath, roundedLeafPath. Each
                         returns a Path2D centered at (cx, cy) so callers can
                         fill/stroke/clip it themselves.
     * light helpers   - sphereFill, additiveHalo, speckGrain. These are the
                         glue that gives every schematic body a consistent
                         3D read: light from the top-left, warm ambient at
                         the bottom, a soft additive halo, and optional grain.

   `mulberry32` and `begin` are also exported so sibling modules share the
   same seeded RNG and the standard save/translate/rotate/scale opts
   convention. Neither is part of the intended public API, but re-exporting
   from the barrel is harmless. */

import { COLORS } from '../tokens.js';
import { withAlpha, lighten, darken } from '../util.js';

/* -------------------------------------------------------------------------
   Seeded RNG. mulberry32 gives us stable-across-reloads blobs. */

export function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Apply the standard opts before body drawing. The caller MUST match with
   a ctx.restore() at the end. Kept here so shapes, organelles, and molecules
   can share the same {scale, alpha, rot} convention. */
export function begin(ctx, x, y, opts) {
  const { scale = 1, alpha = 1, rot = 0 } = opts || {};
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
}

/* -------------------------------------------------------------------------
   Shape helpers. Each returns a Path2D centered at (cx, cy). */

/* A wobbly closed blob - a circle whose radius is perturbed by a small sum
   of sines with per-harmonic amplitude falloff so higher harmonics never
   dominate. Seeded so the shape is stable across reloads. */
export function blobPath(cx, cy, r0, { harmonics = 3, amp = 0.12, seed = 1, points = 64 } = {}) {
  const rng = mulberry32(seed);
  const freqs = [], phases = [], amps = [];
  for (let i = 0; i < harmonics; i++) {
    freqs.push(2 + Math.floor(rng() * 3));
    phases.push(rng() * Math.PI * 2);
    // 1/(i+1) falloff: the primary wobble carries the shape, later harmonics
    // just add a hint of natural irregularity.
    amps.push(1 / (i + 1));
  }
  const ampSum = amps.reduce((a, b) => a + b, 0);
  const path = new Path2D();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    let n = 0;
    for (let k = 0; k < harmonics; k++) n += amps[k] * Math.sin(a * freqs[k] + phases[k]);
    const r = r0 * (1 + amp * (n / ampSum));
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/* A superellipse |x/a|^n + |y/b|^n = 1. n≈2.6 gives the soft-square lozenge
   the chloroplast uses. */
export function superellipsePath(cx, cy, a, b, n = 2.6) {
  const path = new Path2D();
  const steps = 128;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = cx + Math.sign(c) * Math.pow(Math.abs(c), 2/n) * a;
    const y = cy + Math.sign(s) * Math.pow(Math.abs(s), 2/n) * b;
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/* A rounded leaf silhouette - vesica-like with a slightly pointed tip so it
   reads as a leaf, not a lens. Symmetric around cy. w, h are the full
   width and height. */
export function roundedLeafPath(cx, cy, w, h) {
  const hw = w / 2, hh = h / 2;
  const path = new Path2D();
  // Two symmetric Bézier arcs from left tip to right tip and back. The
  // control points sit high above and below the midline so the curve fills
  // the (w, h) box while the tips at cx±hw stay pinched.
  path.moveTo(cx - hw, cy);
  path.bezierCurveTo(cx - hw * 0.55, cy - hh * 1.05,
                     cx + hw * 0.55, cy - hh * 1.05,
                     cx + hw,        cy);
  path.bezierCurveTo(cx + hw * 0.55, cy + hh * 1.05,
                     cx - hw * 0.55, cy + hh * 1.05,
                     cx - hw,        cy);
  path.closePath();
  return path;
}

/* -------------------------------------------------------------------------
   Lighting helpers. Shared by organelles.js and molecules.js so every
   schematic body reads the same way in the light: warm top-left key,
   darker bottom-right ambient, a soft additive halo, optional grain.

   Convention: the "key light" comes from the upper-left, angle -3π/4. */

const KEY = -Math.PI * 0.75;

/* Build a "3D sphere" radial gradient centered at (cx, cy), radius r,
   base color `color`. The highlight center sits at (offset·r) from the
   center along the key-light angle so the ball reads lit from top-left.
   `contrast` scales how far the light/shadow endpoints push. Returns a
   CanvasGradient the caller uses as fillStyle. */
export function sphereFill(ctx, cx, cy, r, color, opts = {}) {
  const { contrast = 1, angle = KEY, offset = 0.4 } = opts;
  const lx = cx + Math.cos(angle) * r * offset;
  const ly = cy + Math.sin(angle) * r * offset;
  const g = ctx.createRadialGradient(lx, ly, 0, cx, cy, r);
  g.addColorStop(0,    lighten(color, 0.55 * contrast));
  g.addColorStop(0.30, lighten(color, 0.20 * contrast));
  g.addColorStop(0.70, color);
  g.addColorStop(1,    darken(color, 0.40 * contrast));
  return g;
}

/* Paint an additive circular bloom centered at (cx, cy) with outer radius R
   in tint `color`. `strength` (0..1) scales alpha at the core. This wraps
   the globalCompositeOperation switch so callers stay one line. */
export function additiveHalo(ctx, cx, cy, R, color, strength = 0.4) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0,    withAlpha(color, strength));
  g.addColorStop(0.5,  withAlpha(color, strength * 0.35));
  g.addColorStop(1,    withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Sprinkle very-low-alpha specks in a (w × h) rectangle centered at the
   origin. Callers set the local transform first (they're drawn in whatever
   frame ctx is in). Used to add a hint of grain to interior fills without
   ever reading as a texture. */
export function speckGrain(ctx, w, h, seed, count = 60, opts = {}) {
  const { alpha = 0.10, color = COLORS.specular, rMin = 0.4, rMax = 1.1 } = opts;
  const rng = mulberry32(seed);
  ctx.save();
  ctx.fillStyle = withAlpha(color, alpha);
  for (let i = 0; i < count; i++) {
    const rx = (rng() - 0.5) * w;
    const ry = (rng() - 0.5) * h;
    const r = rMin + rng() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
