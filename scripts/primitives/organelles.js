/* primitives/organelles.js - the larger schematic bodies: chloroplast, grana,
   thylakoid membrane, stroma, stoma, mesophyll cell, leaf cross-section, tree,
   sun.

   Every body is built the same way and reads as one system:

     1. an outer additive halo (soft bloom, only when glow is on),
     2. a base body fill built from a radial gradient offset toward the
        upper-left key light,
     3. a deep ambient shadow tucked into the bottom-right,
     4. a very faint speck grain to break up the flat gradient,
     5. one or two crisp envelope strokes for structure,
     6. a bright rim highlight along the top edge (additive), and
     7. the interior detail (grana, guard cells, layers, etc.).

   The shared 3D read comes from shapes.js's lighting helpers (sphereFill,
   additiveHalo, speckGrain) so a chloroplast, a stroma blob, and a tree
   crown all fall into the same light. Colors come from tokens.js only. */

import { COLORS } from '../tokens.js';
import { withAlpha, lighten, darken } from '../util.js';
import {
  begin, mulberry32, blobPath, superellipsePath,
  additiveHalo, speckGrain,
} from './shapes.js';

/* -------------------------------------------------------------------------
   Chloroplast - a luminous green lozenge lit from the upper-left with a
   double envelope, subtle interior grain, and grana stacks inside. */

export function drawChloroplast(ctx, x, y, opts = {}) {
  begin(ctx, x, y, opts);
  const { glow = true } = opts;
  const w = 220, h = 120;
  const hw = w / 2, hh = h / 2;

  // Outer additive bloom - the "aliveness" glow.
  if (glow) additiveHalo(ctx, 0, 0, hw * 1.15, COLORS.chloro, 0.32);

  // Body: deep radial gradient offset toward the top-left key light.
  const outer = superellipsePath(0, 0, hw, hh, 3.2);
  const body = ctx.createRadialGradient(-hw * 0.35, -hh * 0.45, 4, 0, 0, hw);
  body.addColorStop(0,    withAlpha(lighten(COLORS.chloro, 0.35), 0.80));
  body.addColorStop(0.35, withAlpha(COLORS.chloro, 0.55));
  body.addColorStop(0.75, withAlpha(darken(COLORS.chloro, 0.25), 0.55));
  body.addColorStop(1,    withAlpha(darken(COLORS.chloro, 0.55), 0.32));
  ctx.fillStyle = body;
  ctx.fill(outer);

  // Ambient occlusion - a soft inner shadow tucked into the bottom-right,
  // clipped inside the body so it never spills over the edge.
  ctx.save();
  ctx.clip(outer);
  const ao = ctx.createRadialGradient(hw * 0.35, hh * 0.45, hh * 0.1,
                                      hw * 0.35, hh * 0.45, hw * 0.95);
  ao.addColorStop(0, withAlpha(darken(COLORS.chloro, 0.6), 0.45));
  ao.addColorStop(1, withAlpha(darken(COLORS.chloro, 0.6), 0));
  ctx.fillStyle = ao;
  ctx.fillRect(-hw, -hh, w, h);
  speckGrain(ctx, w * 0.85, h * 0.7, 91, 22, { alpha: 0.06 });
  ctx.restore();

  // Double envelope - the two membrane rings.
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.5), 0.42);
  ctx.stroke(outer);
  ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.2), 0.22);
  ctx.stroke(superellipsePath(0, 0, hw - 5, hh - 5, 3.2));

  // Bright rim highlight along the top - additive so it reads as glow.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(COLORS.specular, 0.55);
  ctx.lineWidth = 1.5;
  ctx.shadowColor = COLORS.chloro;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.ellipse(0, 0, hw * 0.9, hh * 0.88, 0, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();

  // Grana stacks - loosely arranged inside.
  const positions = [[-72, -8], [-30, 12], [16, -14], [56, 10], [86, -4]];
  for (const [gx, gy] of positions) {
    drawThylakoidStack(ctx, gx, gy, { scale: 0.55, glow: false });
  }
  ctx.restore();
}

/* -------------------------------------------------------------------------
   Thylakoid stack (granum) - a short pile of flat green discs. Each disc
   has a top-lit vertical gradient and a thin top-rim highlight, and the
   whole stack sits inside a soft additive bloom so it reads as glowing. */

export function drawThylakoidStack(ctx, x, y, opts = {}) {
  begin(ctx, x, y, opts);
  const { glow = true, count = 5 } = opts;
  const w = 46, h = 8, gap = 12;
  const topY = -((count - 1) * gap) / 2;
  const totalH = (count - 1) * gap + h;

  // Soft additive bloom around the whole stack.
  if (glow) additiveHalo(ctx, 0, 0, Math.max(w, totalH) * 0.9, COLORS.chloro, 0.28);

  for (let i = 0; i < count; i++) {
    const cy = topY + i * gap;

    // Thin drop shadow beneath the disc, so stacked discs read as stacked.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, cy + h * 0.55, w / 2 * 0.95, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body - vertical linear gradient for shading, top-lit.
    const g = ctx.createLinearGradient(0, cy - h/2, 0, cy + h/2);
    g.addColorStop(0,    withAlpha(lighten(COLORS.chloro, 0.55), 0.95));
    g.addColorStop(0.5,  withAlpha(COLORS.chloro, 0.95));
    g.addColorStop(1,    withAlpha(darken(COLORS.chloro, 0.35), 0.95));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Top rim highlight - a thin bright arc.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(COLORS.specular, 0.45);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, cy - 0.4, w / 2 * 0.88, h / 2 * 0.75, 0,
                Math.PI * 1.10, Math.PI * 1.90);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/* -------------------------------------------------------------------------
   Thylakoid membrane band - the wide cross-section station 3 zooms into.
   Two dark lipid bands sandwich a bright translucent lumen; the lumen has
   a soft central glow, and periodic bumps hint at embedded proteins. */

export function drawThylakoidMembrane(ctx, x, y, opts = {}) {
  const { width = 700, height = 90 } = opts;
  begin(ctx, x, y, opts);
  const hh = height / 2;

  // Lumen wash - the translucent interior with a gentle central glow.
  const lumen = ctx.createLinearGradient(0, -hh, 0, hh);
  lumen.addColorStop(0,   withAlpha(COLORS.chloro, 0.05));
  lumen.addColorStop(0.5, withAlpha(lighten(COLORS.chloro, 0.35), 0.18));
  lumen.addColorStop(1,   withAlpha(COLORS.chloro, 0.05));
  ctx.fillStyle = lumen;
  ctx.fillRect(-width/2, -hh, width, height);

  // Soft additive lumen glow along the centerline.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createLinearGradient(0, -hh * 0.4, 0, hh * 0.4);
  glow.addColorStop(0,   withAlpha(COLORS.chloro, 0));
  glow.addColorStop(0.5, withAlpha(COLORS.chloro, 0.18));
  glow.addColorStop(1,   withAlpha(COLORS.chloro, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-width/2, -hh * 0.4, width, hh * 0.8);
  ctx.restore();

  // Lipid bilayer bands, top and bottom, each with a bright rim on its
  // membrane-facing side.
  const band = 12;
  const topBand = ctx.createLinearGradient(0, -hh, 0, -hh + band);
  topBand.addColorStop(0,   withAlpha(darken(COLORS.chloro, 0.55), 0.85));
  topBand.addColorStop(0.6, withAlpha(COLORS.chloro, 0.55));
  topBand.addColorStop(1,   withAlpha(lighten(COLORS.chloro, 0.4), 0.75));
  ctx.fillStyle = topBand;
  ctx.fillRect(-width/2, -hh, width, band);

  const botBand = ctx.createLinearGradient(0, hh - band, 0, hh);
  botBand.addColorStop(0, withAlpha(lighten(COLORS.chloro, 0.4), 0.75));
  botBand.addColorStop(0.4, withAlpha(COLORS.chloro, 0.55));
  botBand.addColorStop(1, withAlpha(darken(COLORS.chloro, 0.55), 0.85));
  ctx.fillStyle = botBand;
  ctx.fillRect(-width/2, hh - band, width, band);

  // Periodic embedded-protein bumps along both membranes - very small so
  // they never dominate the schematic.
  ctx.fillStyle = withAlpha(lighten(COLORS.chloro, 0.5), 0.25);
  const step = 42;
  const rng = mulberry32(17);
  for (let x0 = -width/2 + step; x0 < width/2 - step; x0 += step) {
    const jitter = (rng() - 0.5) * 8;
    ctx.beginPath();
    ctx.ellipse(x0 + jitter, -hh + band * 0.5, 5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x0 - jitter, hh - band * 0.5, 5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* -------------------------------------------------------------------------
   Stroma - the fluid interior, a wobbly blob of pale green wash with a
   subtle radial glow and a fine speck grain. */

export function drawStroma(ctx, x, y, opts = {}) {
  const { w = 300, h = 180, seed = 3, glow = true } = opts;
  begin(ctx, x, y, opts);
  const R = Math.min(w, h) / 2;
  const path = blobPath(0, 0, R, { harmonics: 4, amp: 0.14, seed, points: 72 });

  if (glow) additiveHalo(ctx, 0, 0, R * 1.15, COLORS.chloro, 0.20);

  const g = ctx.createRadialGradient(-w * 0.15, -h * 0.20, 10,
                                     0, 0, Math.max(w, h) / 2);
  g.addColorStop(0,    withAlpha(lighten(COLORS.chloro, 0.3), 0.30));
  g.addColorStop(0.55, withAlpha(COLORS.chloro, 0.14));
  g.addColorStop(1,    withAlpha(darken(COLORS.chloro, 0.3), 0.05));
  ctx.fillStyle = g;
  ctx.fill(path);

  // Interior grain, clipped to the blob so specks don't spill.
  ctx.save();
  ctx.clip(path);
  speckGrain(ctx, w * 0.9, h * 0.8, seed + 91, 44,
             { alpha: 0.14, color: lighten(COLORS.chloro, 0.5) });
  ctx.restore();

  ctx.restore();
}

/* -------------------------------------------------------------------------
   Stoma - a leaf pore. Two sphere-shaded crescent guard cells hug a dark
   central slit; opts.openness ∈ [0,1] widens the pore. */

export function drawStoma(ctx, x, y, opts = {}) {
  const { openness = 1, glow = true } = opts;
  begin(ctx, x, y, opts);
  const w = 44;
  const gap = 2 + openness * 8;

  if (glow) additiveHalo(ctx, 0, 0, w * 0.7, COLORS.chloro, 0.28);

  // Two crescent guard cells with a lengthwise linear gradient to shade
  // them as half-tori.
  const drawGuard = (yc, flip) => {
    const grad = ctx.createLinearGradient(0, yc - 4 * flip, 0, yc + 4 * flip);
    grad.addColorStop(0, withAlpha(lighten(COLORS.chloro, 0.45), 0.9));
    grad.addColorStop(0.5, withAlpha(COLORS.chloro, 0.85));
    grad.addColorStop(1, withAlpha(darken(COLORS.chloro, 0.35), 0.85));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, yc, w / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bright top rim on the outward face of each guard cell.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(COLORS.specular, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const arc0 = flip < 0 ? Math.PI * 1.1 : Math.PI * 0.1;
    const arc1 = flip < 0 ? Math.PI * 1.9 : Math.PI * 0.9;
    ctx.ellipse(0, yc - flip * 0.5, w / 2 * 0.85, 3.2, 0, arc0, arc1);
    ctx.stroke();
    ctx.restore();
  };
  drawGuard(-gap / 2 - 4, -1);
  drawGuard( gap / 2 + 4,  1);

  // The pore itself - a dark oval with a soft radial fade so it reads deep.
  const poreW = (w / 2 - 4) * openness + 3;
  const poreH = gap / 2 + 0.5;
  const pore = ctx.createRadialGradient(0, 0, 0, 0, 0, poreW);
  pore.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  pore.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = pore;
  ctx.beginPath();
  ctx.ellipse(0, 0, poreW, poreH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* -------------------------------------------------------------------------
   Mesophyll cell - a blobby cell wall with chloroplasts scattered inside
   and a soft interior wash so the cell reads as a translucent volume. */

export function drawLeafCell(ctx, x, y, opts = {}) {
  const { w = 180, h = 110, seed = 5, chloroplasts = 6 } = opts;
  begin(ctx, x, y, opts);
  const R = Math.min(w, h) / 2;
  const cell = blobPath(0, 0, R, { harmonics: 3, amp: 0.10, seed, points: 56 });

  // Body wash - dim chloroplast tint that suggests interior fluid.
  const wash = ctx.createRadialGradient(-w * 0.2, -h * 0.25, 4, 0, 0, R * 1.1);
  wash.addColorStop(0,   withAlpha(lighten(COLORS.chloro, 0.3), 0.14));
  wash.addColorStop(0.7, withAlpha(COLORS.chloro, 0.07));
  wash.addColorStop(1,   withAlpha(darken(COLORS.chloro, 0.4), 0.05));
  ctx.fillStyle = wash;
  ctx.fill(cell);

  // Cell wall - a soft rule stroke, with a brighter top-side rim on top.
  ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.3), 0.42);
  ctx.lineWidth = 1.3;
  ctx.stroke(cell);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(COLORS.specular, 0.18);
  ctx.lineWidth = 1;
  ctx.shadowColor = COLORS.chloro;
  ctx.shadowBlur = 4;
  ctx.stroke(cell);
  ctx.restore();

  // Chloroplasts scattered inside, seeded so they stay put across reloads.
  const rng = mulberry32(seed + 12);
  for (let i = 0; i < chloroplasts; i++) {
    const a = rng() * Math.PI * 2;
    const r = (0.15 + rng() * 0.55) * R;
    const cx = Math.cos(a) * r;
    const cy = Math.sin(a) * r;
    drawChloroplast(ctx, cx, cy, { scale: 0.14, rot: rng() * Math.PI * 2, glow: false });
  }
  ctx.restore();
}

/* -------------------------------------------------------------------------
   Leaf cross-section - the layered leaf anatomy the zoom station falls
   through. Each layer gets a vertical gradient so the whole slab reads
   as illuminated from above. */

export function drawLeafCrossSection(ctx, x, y, opts = {}) {
  const { w = 700, h = 220, seed = 7 } = opts;
  begin(ctx, x, y, opts);

  const layers = [
    { h: 6,  a: 'rgba(210, 245, 210, 0.36)', b: 'rgba(160, 220, 180, 0.30)' }, // cuticle
    { h: 20, a: 'rgba(150, 220, 170, 0.38)', b: 'rgba(110, 190, 140, 0.30)' }, // upper epidermis
    { h: 62, a: withAlpha(lighten(COLORS.chloro, 0.15), 0.20),
             b: withAlpha(darken(COLORS.chloro, 0.20), 0.16) },                // palisade
    { h: 78, a: withAlpha(COLORS.chloro, 0.13),
             b: withAlpha(darken(COLORS.chloro, 0.35), 0.10) },                // spongy
    { h: 20, a: 'rgba(110, 190, 140, 0.30)', b: 'rgba(150, 220, 170, 0.38)' }, // lower epidermis
    { h: 6,  a: 'rgba(160, 220, 180, 0.30)', b: 'rgba(210, 245, 210, 0.36)' }, // bottom cuticle
  ];
  let y0 = -h / 2;
  for (const L of layers) {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + L.h);
    g.addColorStop(0, L.a);
    g.addColorStop(1, L.b);
    ctx.fillStyle = g;
    ctx.fillRect(-w/2, y0, w, L.h);
    y0 += L.h;
  }

  // Rule strokes between layers - very subtle.
  ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.4), 0.14);
  ctx.lineWidth = 0.6;
  let yr = -h / 2;
  for (const L of layers) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, yr);
    ctx.lineTo( w / 2, yr);
    ctx.stroke();
    yr += L.h;
  }

  const rng = mulberry32(seed);
  // Palisade cells - tall, tightly packed columns.
  const palY = -h/2 + 6 + 20 + 31;
  for (let i = 0; i < 8; i++) {
    const cx = -w/2 + 40 + i * (w - 80) / 7;
    ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.3), 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, palY, 32, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let j = 0; j < 3; j++) {
      drawChloroplast(ctx, cx + (rng()-0.5)*40, palY + (rng()-0.5)*30,
                      { scale: 0.08, rot: rng()*Math.PI*2, glow: false });
    }
  }
  // Spongy cells - irregular blobs with air gaps between.
  const sponY = -h/2 + 6 + 20 + 62 + 40;
  for (let i = 0; i < 12; i++) {
    const cx = -w/2 + 30 + rng() * (w - 60);
    const cy = sponY + (rng() - 0.5) * 40;
    const p = blobPath(cx, cy, 14 + rng()*10, { harmonics: 3, amp: 0.15, seed: seed + i });
    ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.25), 0.32);
    ctx.stroke(p);
    drawChloroplast(ctx, cx, cy, { scale: 0.07, glow: false });
  }
  drawStoma(ctx, -w * 0.25, h/2 - 6, { scale: 0.9, openness: 0.7, glow: false });
  drawStoma(ctx,  w * 0.25, h/2 - 6, { scale: 0.9, openness: 0.7, glow: false });
  ctx.restore();
}

/* -------------------------------------------------------------------------
   Tree - trunk plus overlapping crown blobs, each shaded with a top-left
   key light so the canopy reads as volumetric, not decal-flat. */

export function drawTree(ctx, x, y, opts = {}) {
  const { seed = 11, height = 240, glow = true } = opts;
  begin(ctx, x, y, opts);
  const trunkH = height * 0.45;
  const trunkW = height * 0.08;

  // Trunk body - wood gradient across the width.
  const trunk = ctx.createLinearGradient(-trunkW, 0, trunkW, 0);
  trunk.addColorStop(0,    COLORS.wood.edge);
  trunk.addColorStop(0.45, COLORS.wood.mid);
  trunk.addColorStop(1,    COLORS.wood.shadow);
  ctx.fillStyle = trunk;
  ctx.beginPath();
  ctx.moveTo(-trunkW/2, 0);
  ctx.quadraticCurveTo(-trunkW*0.8, -trunkH*0.5, -trunkW*0.4, -trunkH);
  ctx.lineTo(trunkW*0.4, -trunkH);
  ctx.quadraticCurveTo(trunkW*0.8, -trunkH*0.5, trunkW/2, 0);
  ctx.closePath();
  ctx.fill();
  // Trunk top-front highlight - a thin bright ridge that sells the roundness.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const ridge = ctx.createLinearGradient(-trunkW*0.35, 0, trunkW*0.1, 0);
  ridge.addColorStop(0, 'rgba(255, 235, 200, 0)');
  ridge.addColorStop(0.5, 'rgba(255, 235, 200, 0.35)');
  ridge.addColorStop(1, 'rgba(255, 235, 200, 0)');
  ctx.fillStyle = ridge;
  ctx.beginPath();
  ctx.moveTo(-trunkW*0.3, 0);
  ctx.quadraticCurveTo(-trunkW*0.35, -trunkH*0.5, -trunkW*0.2, -trunkH);
  ctx.lineTo(-trunkW*0.05, -trunkH);
  ctx.quadraticCurveTo(-trunkW*0.1, -trunkH*0.5, -trunkW*0.1, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Crown - four overlapping blobs, each shaded independently.
  const crownCY = -trunkH - height * 0.12;
  const blobs = [
    { cx: 0,               cy: 0,             r: height * 0.28, seed: seed + 1 },
    { cx: -height * 0.18,  cy: height * 0.08, r: height * 0.20, seed: seed + 2 },
    { cx:  height * 0.18,  cy: height * 0.08, r: height * 0.20, seed: seed + 3 },
    { cx: 0,               cy:-height * 0.12, r: height * 0.22, seed: seed + 4 },
  ];

  // One additive bloom behind the whole crown - the "aliveness" halo.
  if (glow) additiveHalo(ctx, 0, crownCY, height * 0.42, COLORS.chloro, 0.32);

  for (const b of blobs) {
    const bx = b.cx, by = crownCY + b.cy;
    const p = blobPath(bx, by, b.r,
                       { harmonics: 3, amp: 0.18, seed: b.seed });
    // Base fill - deep green wash so the blob has an "underside".
    ctx.fillStyle = withAlpha(darken(COLORS.chloro, 0.4), 0.6);
    ctx.fill(p);
    // Top-lit radial gradient - the actual body shading.
    const g = ctx.createRadialGradient(bx - b.r * 0.35, by - b.r * 0.45, 0,
                                       bx, by, b.r);
    g.addColorStop(0,    withAlpha(lighten(COLORS.chloro, 0.45), 0.85));
    g.addColorStop(0.45, withAlpha(COLORS.chloro, 0.75));
    g.addColorStop(0.85, withAlpha(darken(COLORS.chloro, 0.3), 0.55));
    g.addColorStop(1,    withAlpha(darken(COLORS.chloro, 0.55), 0.2));
    ctx.fillStyle = g;
    ctx.fill(p);
    // Bright top rim - an additive arc along the upper crest.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(COLORS.specular, 0.32);
    ctx.lineWidth = 1.4;
    ctx.shadowColor = COLORS.chloro;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.ellipse(bx - b.r * 0.05, by - b.r * 0.05, b.r * 0.85, b.r * 0.72, 0,
                Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/* -------------------------------------------------------------------------
   Sun - a hot bright core with a two-layer bloom and faint radiating rays.
   opts.intensity ∈ [0,1] scales bloom brightness. */

export function drawSun(ctx, x, y, opts = {}) {
  const { intensity = 1, r = 40 } = opts;
  begin(ctx, x, y, opts);
  ctx.globalCompositeOperation = 'lighter';

  // Far halo - the widest, softest corona.
  const farR = r * (3.6 + intensity * 2.6);
  const far = ctx.createRadialGradient(0, 0, 0, 0, 0, farR);
  far.addColorStop(0,   `rgba(255, 230, 130, ${0.12 * intensity})`);
  far.addColorStop(0.5, `rgba(255, 213, 74, ${0.06 * intensity})`);
  far.addColorStop(1,   'rgba(255, 213, 74, 0)');
  ctx.fillStyle = far;
  ctx.beginPath();
  ctx.arc(0, 0, farR, 0, Math.PI * 2);
  ctx.fill();

  // Near halo - the punchier bloom right around the disc.
  const nearR = r * (2.0 + intensity * 1.4);
  const near = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, nearR);
  near.addColorStop(0,   `rgba(255, 244, 180, ${0.5 * intensity})`);
  near.addColorStop(0.5, `rgba(255, 213, 90, ${0.20 * intensity})`);
  near.addColorStop(1,   'rgba(255, 213, 74, 0)');
  ctx.fillStyle = near;
  ctx.beginPath();
  ctx.arc(0, 0, nearR, 0, Math.PI * 2);
  ctx.fill();

  // Faint radiating rays - eight soft wedges, additive so they add to the
  // bloom without ever looking like hard lines.
  const rayR = r * (2.6 + intensity * 2.0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ray = ctx.createLinearGradient(0, 0,
                                         Math.cos(a) * rayR, Math.sin(a) * rayR);
    ray.addColorStop(0,   `rgba(255, 240, 160, ${0.22 * intensity})`);
    ray.addColorStop(1,   'rgba(255, 213, 74, 0)');
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(r * 0.8, 0);
    ctx.lineTo(rayR, -r * 0.14);
    ctx.lineTo(rayR,  r * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Body - hot white core through gold to warm shadow.
  ctx.globalCompositeOperation = 'source-over';
  const body = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
  body.addColorStop(0,    '#ffffff');
  body.addColorStop(0.35, '#fff2b0');
  body.addColorStop(0.75, COLORS.photon);
  body.addColorStop(1,    '#f6b93b');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Tiny specular pip near the top-left - the last touch of realism.
  ctx.globalCompositeOperation = 'lighter';
  const pip = ctx.createRadialGradient(-r * 0.4, -r * 0.4, 0,
                                       -r * 0.4, -r * 0.4, r * 0.35);
  pip.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
  pip.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = pip;
  ctx.beginPath();
  ctx.arc(-r * 0.4, -r * 0.4, r * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
