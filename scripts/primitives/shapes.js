/* primitives/shapes.js - organic-shape helpers and the small utilities every
   primitive draw function shares.

   Each shape helper returns a Path2D so callers can fill/stroke/clip it.
   `mulberry32` and `begin` are exported so sibling modules (organelles,
   molecules) can share the same seeded RNG and the standard save/translate/
   rotate/scale opts convention. Neither is part of the intended public API,
   but re-exporting them from the barrel is harmless. */

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
   of sines. Seeded so the shape is stable across reloads. */
export function blobPath(cx, cy, r0, { harmonics = 3, amp = 0.12, seed = 1, points = 48 } = {}) {
  const rng = mulberry32(seed);
  const freqs = [];
  const phases = [];
  for (let i = 0; i < harmonics; i++) {
    freqs.push(2 + Math.floor(rng() * 3));
    phases.push(rng() * Math.PI * 2);
  }
  const path = new Path2D();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    let n = 0;
    for (let k = 0; k < harmonics; k++) n += Math.sin(a * freqs[k] + phases[k]);
    const r = r0 * (1 + amp * (n / harmonics));
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
  const steps = 96;
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

/* A rounded leaf silhouette - vesica-like, symmetric around cy. w,h are the
   full width and height. */
export function roundedLeafPath(cx, cy, w, h) {
  const hw = w / 2, hh = h / 2;
  const path = new Path2D();
  path.moveTo(cx - hw, cy);
  path.quadraticCurveTo(cx - hw * 0.35, cy - hh, cx, cy - hh * 0.85);
  path.quadraticCurveTo(cx + hw * 0.35, cy - hh, cx + hw, cy);
  path.quadraticCurveTo(cx + hw * 0.35, cy + hh, cx, cy + hh * 0.85);
  path.quadraticCurveTo(cx - hw * 0.35, cy + hh, cx - hw, cy);
  path.closePath();
  return path;
}
