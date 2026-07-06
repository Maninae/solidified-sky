/* primitives/molecules.js - the per-species molecule drawers behind
   drawMolecule.

   Every schematic reads identically wherever it appears (the Molecule
   Color Law): shaded balls for co2/h2o/o2, a bright burst for atp, a
   glossy capsule for nadph, a facetted hexagon for glucose, a small
   three-in-a-row for G3P, a gold streak for photon, a comet head + tail
   for electron, a soft glowing dot for proton, and a bright ringed gem
   for the tagged carbon.

   Every drawer follows the same visual grammar:
     1. an additive outer halo (soft bloom) so the species reads as lit,
     2. a spherical (or lengthwise) shaded body with light from the
        top-left,
     3. a rim tone at the terminator, and
     4. a small bright specular pip near the light source.

   The atlas margin in particles.js is ~ spec.r × 3 + 12 from center, so
   every halo/streak here stays within about 2.5× spec.r to render crisp.
   drawMolecule dispatches on the type key into one of the private drawers
   below; each drawer runs in a local frame already translated to (x,y)
   and rotated/scaled per opts by the shared `begin` helper. */

import { COLORS, MOLECULES } from '../tokens.js';
import { lighten, darken, withAlpha } from '../util.js';
import { begin } from './shapes.js';

/* ------------------------------------------------------------------------ */

/* The one entry point stations use for any species. */
export function drawMolecule(ctx, type, x, y, opts = {}) {
  const spec = MOLECULES[type];
  if (!spec) return;
  const { glow = true } = opts;
  begin(ctx, x, y, opts);
  if (glow) { ctx.shadowColor = spec.glow; ctx.shadowBlur = 12; }
  switch (type) {
    case 'atp':      drawBurst(ctx, spec); break;
    case 'nadph':    drawCapsule(ctx, spec); break;
    case 'glucose':  drawHexagon(ctx, spec); break;
    case 'g3p':      drawTriad(ctx, spec); break;
    case 'photon':   drawPhoton(ctx, spec); break;
    case 'electron': drawElectron(ctx, spec); break;
    case 'proton':   drawDot(ctx, spec); break;
    case 'carbon':   drawTagged(ctx, spec); break;
    default:
      if (spec.atoms) drawAtomsBall(ctx, spec);
      else drawDot(ctx, spec);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ---- shared helpers -------------------------------------------------- */

/* Paint an additive circular bloom centered at (cx, cy). Local variant so
   this module doesn't need the shapes.js helper (kept tight for cache). */
function haloAt(ctx, cx, cy, R, color, strength) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0,   withAlpha(color, strength));
  g.addColorStop(0.5, withAlpha(color, strength * 0.35));
  g.addColorStop(1,   withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Paint a small additive white specular pip near the light source. */
function specPip(ctx, cx, cy, R, alpha = 0.75) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---- species drawers ------------------------------------------------- */

/* Ball-and-stick for co2 / h2o / o2 - just the balls, since sticks vanish
   at particle scale. Each atom gets a soft halo, a top-left-lit sphere
   body, and a small specular pip. */
function drawAtomsBall(ctx, spec) {
  for (const a of spec.atoms) {
    // Additive glow halo tinted the atom color.
    haloAt(ctx, a.dx, a.dy, a.r * 2.1, a.color, 0.42);
    // Sphere body - light offset toward top-left of the atom.
    const lx = a.dx - a.r * 0.4;
    const ly = a.dy - a.r * 0.4;
    const body = ctx.createRadialGradient(lx, ly, 0, a.dx, a.dy, a.r * 1.02);
    body.addColorStop(0,    lighten(a.color, 0.60));
    body.addColorStop(0.35, lighten(a.color, 0.15));
    body.addColorStop(0.75, a.color);
    body.addColorStop(1,    darken(a.color, 0.4));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(a.dx, a.dy, a.r, 0, Math.PI * 2);
    ctx.fill();
    // Specular pip.
    specPip(ctx, lx, ly, a.r * 0.55, 0.7);
  }
}

/* ATP - an 8-spike energy burst with a hot core and a soft additive bloom. */
function drawBurst(ctx, spec) {
  const R = spec.r;
  const path = new Path2D();
  const spikes = 8;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? R : R * 0.48;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
  }
  path.closePath();

  // Outer additive bloom - carries the "energy" halo.
  haloAt(ctx, 0, 0, R * 1.9, COLORS.atp, 0.55);

  // Burst body - white core → warm gold → deep amber shadow.
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0,    '#ffffff');
  g.addColorStop(0.22, '#fff3b8');
  g.addColorStop(0.60, spec.color);
  g.addColorStop(1,    darken(spec.color, 0.4));
  ctx.fillStyle = g;
  ctx.fill(path);

  // Thin darker outline on the spikes so they read sharp against the halo.
  ctx.strokeStyle = withAlpha(darken(spec.color, 0.35), 0.55);
  ctx.lineWidth = 0.8;
  ctx.stroke(path);

  // Bright inner-core pip.
  specPip(ctx, 0, 0, R * 0.45, 0.9);
}

/* NADPH - a violet capsule (rounded pill) with a top-lit lengthwise
   gradient body and a bright top rim. */
function drawCapsule(ctx, spec) {
  const w = spec.r * 2.4, h = spec.r * 1.3;
  const r = h / 2;
  const p = new Path2D();
  p.moveTo(-w/2 + r, -r);
  p.lineTo( w/2 - r, -r);
  p.arc(   w/2 - r, 0, r, -Math.PI/2, Math.PI/2);
  p.lineTo(-w/2 + r,  r);
  p.arc(  -w/2 + r, 0, r,  Math.PI/2, -Math.PI/2);
  p.closePath();

  // Additive halo.
  haloAt(ctx, 0, 0, w * 0.7, spec.color, 0.35);

  // Body - top-lit vertical gradient.
  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0,    lighten(spec.color, 0.50));
  body.addColorStop(0.5,  spec.color);
  body.addColorStop(1,    darken(spec.color, 0.3));
  ctx.fillStyle = body;
  ctx.fill(p);

  // Bottom-edge terminator - a soft darker line for depth.
  ctx.strokeStyle = withAlpha(darken(spec.color, 0.45), 0.55);
  ctx.lineWidth = 1;
  ctx.stroke(p);

  // Bright top rim - an additive white sheen along the top face.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sheen = ctx.createLinearGradient(0, -r, 0, 0);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, w * 0.38, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Specular pip near top-left.
  specPip(ctx, -w * 0.12, -r * 0.35, r * 0.5, 0.55);
}

/* Glucose - a brown hexagon ring with a shaded body, a bright top-arc
   rim, and a hint of interior ring. */
function drawHexagon(ctx, spec) {
  const R = spec.r;
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = Math.cos(a) * R, py = Math.sin(a) * R;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
  p.closePath();

  // Additive halo.
  haloAt(ctx, 0, 0, R * 1.65, spec.color, 0.35);

  // Body - radial gradient with the light offset toward top-left.
  const body = ctx.createRadialGradient(-R * 0.35, -R * 0.35, 0, 0, 0, R * 1.1);
  body.addColorStop(0,    lighten(spec.color, 0.45));
  body.addColorStop(0.6,  spec.color);
  body.addColorStop(1,    darken(spec.color, 0.35));
  ctx.fillStyle = body;
  ctx.fill(p);

  // Facet stroke - the crisp hex edge.
  ctx.strokeStyle = withAlpha(darken(spec.color, 0.4), 0.9);
  ctx.lineWidth = 1.4;
  ctx.stroke(p);

  // Top rim highlight - a bright arc along the upper half.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(COLORS.specular, 0.4);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.94, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();

  // Inner ring hint - the pyranose feel.
  const ring = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = Math.cos(a) * R * 0.55, py = Math.sin(a) * R * 0.55;
    if (i === 0) ring.moveTo(px, py); else ring.lineTo(px, py);
  }
  ring.closePath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1;
  ctx.stroke(ring);

  // Small specular pip.
  specPip(ctx, -R * 0.4, -R * 0.4, R * 0.4, 0.5);
}

/* G3P - three shaded brown balls in a row (a 3-carbon fragment). */
function drawTriad(ctx, spec) {
  const r = spec.r * 0.55;
  const gap = spec.r * 0.9;
  for (let i = -1; i <= 1; i++) {
    const cx = i * gap;
    haloAt(ctx, cx, 0, r * 2.0, spec.color, 0.35);
    const lx = cx - r * 0.4;
    const ly = -r * 0.4;
    const g = ctx.createRadialGradient(lx, ly, 0, cx, 0, r * 1.02);
    g.addColorStop(0,    lighten(spec.color, 0.55));
    g.addColorStop(0.35, lighten(spec.color, 0.15));
    g.addColorStop(0.75, spec.color);
    g.addColorStop(1,    darken(spec.color, 0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, 0, r, 0, Math.PI * 2);
    ctx.fill();
    specPip(ctx, lx, ly, r * 0.5, 0.6);
  }
}

/* Photon - a horizontal gold streak with a hot white spine and a radial
   bloom at the head. Rotate at the callsite to point along travel. */
function drawPhoton(ctx, spec) {
  ctx.globalCompositeOperation = 'lighter';
  const R = spec.r;
  // Long streak with a white spine in the middle.
  const streak = ctx.createLinearGradient(-R * 2.6, 0, R * 2.6, 0);
  streak.addColorStop(0,    withAlpha(COLORS.photon, 0));
  streak.addColorStop(0.35, withAlpha(COLORS.photon, 0.55));
  streak.addColorStop(0.5,  'rgba(255, 255, 255, 0.95)');
  streak.addColorStop(0.65, withAlpha(COLORS.photon, 0.55));
  streak.addColorStop(1,    withAlpha(COLORS.photon, 0));
  ctx.fillStyle = streak;
  ctx.fillRect(-R * 2.6, -R * 0.4, R * 5.2, R * 0.8);

  // Radial bloom around the center.
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.8);
  halo.addColorStop(0,   'rgba(255, 250, 220, 0.9)');
  halo.addColorStop(0.4, withAlpha(COLORS.photon, 0.5));
  halo.addColorStop(1,   withAlpha(COLORS.photon, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Bright core dot.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

/* A soft glowing dot - used for H⁺ and any default "orb" molecule. */
function drawDot(ctx, spec) {
  const R = spec.r;
  // Additive glow halo.
  haloAt(ctx, 0, 0, R * 2.2, spec.color, 0.55);
  // Body - top-lit sphere.
  const lx = -R * 0.35, ly = -R * 0.35;
  const body = ctx.createRadialGradient(lx, ly, 0, 0, 0, R * 1.05);
  body.addColorStop(0,    lighten(spec.color, 0.5));
  body.addColorStop(0.5,  spec.color);
  body.addColorStop(1,    darken(spec.color, 0.3));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  // Specular pip.
  specPip(ctx, lx, ly, R * 0.55, 0.75);
}

/* Electron - a hot cyan head with a long additive tail. Callers rotate the
   sprite by velocity so the tail always trails behind. */
function drawElectron(ctx, spec) {
  ctx.globalCompositeOperation = 'lighter';
  const R = spec.r;
  // Long tapered tail.
  const tail = ctx.createLinearGradient(-R * 4.2, 0, R * 0.5, 0);
  tail.addColorStop(0,    withAlpha(COLORS.electron, 0));
  tail.addColorStop(0.55, withAlpha(COLORS.electron, 0.30));
  tail.addColorStop(0.90, withAlpha(COLORS.electron, 0.75));
  tail.addColorStop(1,    spec.color);
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.ellipse(-R * 1.6, 0, R * 3.5, R * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head halo bloom.
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.2);
  halo.addColorStop(0,   withAlpha(COLORS.electron, 0.85));
  halo.addColorStop(0.4, withAlpha(COLORS.electron, 0.3));
  halo.addColorStop(1,   withAlpha(COLORS.electron, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, R * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Hot head core.
  const head = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.1);
  head.addColorStop(0,   '#ffffff');
  head.addColorStop(0.45,lighten(spec.color, 0.3));
  head.addColorStop(1,   spec.color);
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.05, 0, Math.PI * 2);
  ctx.fill();
}

/* The "carbon we're following" - a bright pearl orb with a gold aura and a
   crisp gold ring around it. */
function drawTagged(ctx, spec) {
  const R = spec.r;

  // Additive gold aura - the "we're tracking this one" glow.
  haloAt(ctx, 0, 0, R * 2.8, COLORS.accent2, 0.55);

  // Body - top-lit pearl white with a warm bottom shadow.
  const body = ctx.createRadialGradient(-R * 0.35, -R * 0.35, 0, 0, 0, R * 1.05);
  body.addColorStop(0,    '#ffffff');
  body.addColorStop(0.55, '#f6f2df');
  body.addColorStop(1,    '#c8a870');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();

  // Gold ring - additive so it glows.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = COLORS.accent2;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = COLORS.accent2;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(0, 0, R + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Bright specular pip.
  specPip(ctx, -R * 0.35, -R * 0.35, R * 0.45, 0.85);
}
