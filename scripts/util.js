/* util.js - small general-purpose math + color + DOM helpers shared across
   stations, primitives, and the engine. Each is behavior-identical to the
   local defs it replaces; hoisted here so no module carries its own copy. */

/* -------------------------------------------------------------------------
   Math. */

/** Linear interpolation from a to b at parameter t (unclamped). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Clamp value v into [lo, hi]. */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** GLSL-style smoothstep: 0 below edge0, 1 above edge1, cubic ease between. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* -------------------------------------------------------------------------
   Color math. Every helper works on "#RRGGBB" hex strings so tokens.js stays
   the one source of truth for color identity. */

/** Parse "#RRGGBB" (with or without leading #) into [r, g, b] channel ints. */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16),
          parseInt(h.slice(2, 4), 16),
          parseInt(h.slice(4, 6), 16)];
}

/** Return the hex color as an "rgba(r, g, b, a)" string for canvas use.
    The one clean way to alpha-blend a token color without hardcoding RGB. */
export function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Lighten hex toward white by fraction k∈[0,1]. Returns "rgb(...)" string. */
export function lighten(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${(r + (255 - r) * k) | 0}, ${(g + (255 - g) * k) | 0}, ${(b + (255 - b) * k) | 0})`;
}

/** Darken hex toward black by fraction k∈[0,1]. Returns "rgb(...)" string. */
export function darken(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${(r * (1 - k)) | 0}, ${(g * (1 - k)) | 0}, ${(b * (1 - k)) | 0})`;
}

/** Linear mix from hex a to hex b at t∈[0,1] in sRGB. Returns "rgb(...)".
    Good for UI chips / bar labels; not for scientific color interpolation. */
export function mixHex(a, b, t) {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  const r  = Math.round(ra + (rb - ra) * t);
  const g  = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/* -------------------------------------------------------------------------
   Canvas + DOM. */

/** Trace a rounded rectangle onto ctx as a fresh path, using arcTo for true
    circular corners. Callers do their own fill()/stroke() afterward. */
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

/** True when the user has requested reduced motion. Safe outside a browser
    (returns false). Callers typically cache this once at module load. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
         !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
