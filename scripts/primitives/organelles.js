/* primitives/organelles.js - the larger schematic bodies: chloroplast, grana,
   thylakoid membrane, stroma, stoma, mesophyll cell, leaf cross-section, tree,
   sun. All drawn with layered translucent fills + radial glows so each reads
   as an organic body, not a mechanical diagram.

   All draw functions are stateless: self-contained save()/restore(), take
   (ctx, x, y, opts) with x,y the CENTER in CSS px. Colors come from tokens.js
   (never hardcoded). */

import { COLORS } from '../tokens.js';
import { withAlpha } from '../util.js';
import { begin, mulberry32, blobPath, superellipsePath } from './shapes.js';

/* Chloroplast - soft green lozenge, double envelope, a few grana stacks. */
export function drawChloroplast(ctx, x, y, opts = {}) {
  begin(ctx, x, y, opts);
  const { glow = true } = opts;
  const w = 220, h = 120;

  if (glow) { ctx.shadowColor = COLORS.chloro; ctx.shadowBlur = 30; }
  const outer = superellipsePath(0, 0, w/2, h/2, 3.2);
  const fill = ctx.createRadialGradient(0, 0, 8, 0, 0, w/2);
  fill.addColorStop(0,   withAlpha(COLORS.chloro, 0.55));
  fill.addColorStop(0.7, withAlpha(COLORS.chloro, 0.30));
  fill.addColorStop(1,   withAlpha(COLORS.chloro, 0.10));
  ctx.fillStyle = fill;
  ctx.fill(outer);
  ctx.shadowBlur = 0;

  // Envelope - outer + inner membrane rings hint the double envelope.
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(200, 245, 215, 0.36)';
  ctx.stroke(outer);
  ctx.strokeStyle = 'rgba(200, 245, 215, 0.20)';
  ctx.stroke(superellipsePath(0, 0, w/2 - 5, h/2 - 5, 3.2));

  // Grana stacks arranged loosely inside.
  const positions = [[-72, -8], [-30, 12], [16, -14], [56, 10], [86, -4]];
  for (const [gx, gy] of positions) {
    drawThylakoidStack(ctx, gx, gy, { scale: 0.55, glow: false });
  }
  ctx.restore();
}

/* A single granum - a stack of flat green thylakoid discs. */
export function drawThylakoidStack(ctx, x, y, opts = {}) {
  begin(ctx, x, y, opts);
  const { glow = true, count = 5 } = opts;
  const w = 46, h = 8, gap = 12;
  const topY = -((count - 1) * gap) / 2;
  if (glow) { ctx.shadowColor = COLORS.chloro; ctx.shadowBlur = 10; }
  for (let i = 0; i < count; i++) {
    const cy = topY + i * gap;
    const g = ctx.createLinearGradient(0, cy - h/2, 0, cy + h/2);
    g.addColorStop(0, 'rgba(140, 255, 180, 0.85)');   // lighter chloro tint
    g.addColorStop(1, 'rgba(40, 170,  95, 0.85)');    // darker chloro shade
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, cy, w/2, h/2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* A wide membrane band for station 3's cross-section into the thylakoid.
   Two darker lipid bands sandwich a thin translucent lumen. */
export function drawThylakoidMembrane(ctx, x, y, opts = {}) {
  const { width = 700, height = 90 } = opts;
  begin(ctx, x, y, opts);
  ctx.fillStyle = withAlpha(COLORS.chloro, 0.08);
  ctx.fillRect(-width/2, -height/2, width, height);
  const band = 10;
  const top = ctx.createLinearGradient(0, -height/2, 0, -height/2 + band);
  top.addColorStop(0, withAlpha(COLORS.chloro, 0.55));
  top.addColorStop(1, withAlpha(COLORS.chloro, 0.15));
  ctx.fillStyle = top;
  ctx.fillRect(-width/2, -height/2, width, band);
  const bot = ctx.createLinearGradient(0, height/2 - band, 0, height/2);
  bot.addColorStop(0, withAlpha(COLORS.chloro, 0.15));
  bot.addColorStop(1, withAlpha(COLORS.chloro, 0.55));
  ctx.fillStyle = bot;
  ctx.fillRect(-width/2, height/2 - band, width, band);
  ctx.restore();
}

/* Stroma - fluid fill blob with a very subtle grain of specks. */
export function drawStroma(ctx, x, y, opts = {}) {
  const { w = 300, h = 180, seed = 3 } = opts;
  begin(ctx, x, y, opts);
  const path = blobPath(0, 0, Math.min(w, h) / 2, { harmonics: 4, amp: 0.14, seed, points: 64 });
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(w, h)/2);
  g.addColorStop(0, 'rgba(150, 220, 180, 0.22)');       // bespoke pale-green wash
  g.addColorStop(1, withAlpha(COLORS.chloro, 0.05));
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.fillStyle = 'rgba(210, 245, 220, 0.10)';          // bespoke speck highlight
  const rng = mulberry32(seed + 91);
  for (let i = 0; i < 40; i++) {
    const rx = (rng() - 0.5) * w * 0.85;
    const ry = (rng() - 0.5) * h * 0.75;
    ctx.beginPath();
    ctx.arc(rx, ry, 0.8 + rng() * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* Stoma - a leaf pore. Two crescent guard cells hug a central slit;
   opts.openness ∈ [0,1] widens the pore. */
export function drawStoma(ctx, x, y, opts = {}) {
  const { openness = 1, glow = true } = opts;
  begin(ctx, x, y, opts);
  const w = 44;
  const gap = 2 + openness * 8;
  if (glow) { ctx.shadowColor = COLORS.chloro; ctx.shadowBlur = 10; }
  ctx.fillStyle = withAlpha(COLORS.chloro, 0.75);       // guard cells
  ctx.beginPath();
  ctx.ellipse(0, -gap/2 - 4, w/2, 4, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, gap/2 + 4, w/2, 4, 0, 0, Math.PI);
  ctx.fill();
  ctx.shadowBlur = 0;
  // The pore itself - dark oval between the guard cells.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.ellipse(0, 0, (w/2 - 4) * openness + 3, gap/2 + 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* A mesophyll cell - blobby cell wall with chloroplasts scattered inside. */
export function drawLeafCell(ctx, x, y, opts = {}) {
  const { w = 180, h = 110, seed = 5, chloroplasts = 6 } = opts;
  begin(ctx, x, y, opts);
  const cell = blobPath(0, 0, Math.min(w, h) / 2, { harmonics: 3, amp: 0.10, seed, points: 48 });
  ctx.fillStyle = withAlpha(COLORS.chloro, 0.06);
  ctx.fill(cell);
  ctx.strokeStyle = 'rgba(150, 200, 170, 0.35)';        // rule-family cell wall
  ctx.lineWidth = 1.2;
  ctx.stroke(cell);
  const rng = mulberry32(seed + 12);
  for (let i = 0; i < chloroplasts; i++) {
    const a = rng() * Math.PI * 2;
    const r = (0.15 + rng() * 0.55) * Math.min(w, h) / 2;
    const cx = Math.cos(a) * r;
    const cy = Math.sin(a) * r;
    drawChloroplast(ctx, cx, cy, { scale: 0.14, rot: rng() * Math.PI * 2, glow: false });
  }
  ctx.restore();
}

/* A leaf cross-section - the layered anatomy the zoom station drops through. */
export function drawLeafCrossSection(ctx, x, y, opts = {}) {
  const { w = 700, h = 220, seed = 7 } = opts;
  begin(ctx, x, y, opts);
  const layers = [
    { h: 6,  fill: 'rgba(200, 240, 200, 0.30)'   }, // cuticle (bespoke pale)
    { h: 20, fill: 'rgba(120, 200, 140, 0.35)'   }, // upper epidermis (bespoke)
    { h: 62, fill: withAlpha(COLORS.chloro, 0.16) }, // palisade layer
    { h: 78, fill: withAlpha(COLORS.chloro, 0.09) }, // spongy layer
    { h: 20, fill: 'rgba(120, 200, 140, 0.35)'   }, // lower epidermis (bespoke)
    { h: 6,  fill: 'rgba(200, 240, 200, 0.30)'   }, // bottom cuticle (bespoke)
  ];
  let y0 = -h / 2;
  for (const L of layers) { ctx.fillStyle = L.fill; ctx.fillRect(-w/2, y0, w, L.h); y0 += L.h; }

  const rng = mulberry32(seed);
  // Palisade cells - tall, tightly packed.
  const palY = -h/2 + 6 + 20 + 31;
  for (let i = 0; i < 8; i++) {
    const cx = -w/2 + 40 + i * (w - 80) / 7;
    ctx.strokeStyle = 'rgba(150, 200, 170, 0.35)';
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
    ctx.strokeStyle = 'rgba(150, 200, 170, 0.30)';
    ctx.stroke(p);
    drawChloroplast(ctx, cx, cy, { scale: 0.07, glow: false });
  }
  drawStoma(ctx, -w * 0.25, h/2 - 6, { scale: 0.9, openness: 0.7, glow: false });
  drawStoma(ctx,  w * 0.25, h/2 - 6, { scale: 0.9, openness: 0.7, glow: false });
  ctx.restore();
}

/* A schematic tree - brown trunk plus a few overlapping green crown blobs. */
export function drawTree(ctx, x, y, opts = {}) {
  const { seed = 11, height = 240, glow = true } = opts;
  begin(ctx, x, y, opts);
  const trunkH = height * 0.45;
  const trunkW = height * 0.08;
  const trunk = ctx.createLinearGradient(-trunkW, 0, trunkW, 0);
  trunk.addColorStop(0,   COLORS.wood.edge);
  trunk.addColorStop(0.5, COLORS.wood.mid);
  trunk.addColorStop(1,   COLORS.wood.shadow);
  ctx.fillStyle = trunk;
  ctx.beginPath();
  ctx.moveTo(-trunkW/2, 0);
  ctx.quadraticCurveTo(-trunkW*0.8, -trunkH*0.5, -trunkW*0.4, -trunkH);
  ctx.lineTo(trunkW*0.4, -trunkH);
  ctx.quadraticCurveTo(trunkW*0.8, -trunkH*0.5, trunkW/2, 0);
  ctx.closePath();
  ctx.fill();

  if (glow) { ctx.shadowColor = COLORS.chloro; ctx.shadowBlur = 20; }
  const crownCY = -trunkH - height * 0.12;
  const blobs = [
    { cx: 0,               cy: 0,             r: height * 0.28, seed: seed + 1 },
    { cx: -height * 0.18,  cy: height * 0.08, r: height * 0.20, seed: seed + 2 },
    { cx:  height * 0.18,  cy: height * 0.08, r: height * 0.20, seed: seed + 3 },
    { cx: 0,               cy:-height * 0.12, r: height * 0.22, seed: seed + 4 },
  ];
  for (const b of blobs) {
    const p = blobPath(b.cx, crownCY + b.cy, b.r, { harmonics: 3, amp: 0.18, seed: b.seed });
    const g = ctx.createRadialGradient(b.cx, crownCY + b.cy, 0, b.cx, crownCY + b.cy, b.r);
    // Bespoke crown-blob gradient - lighter chloro-adjacent tint to darker
    // green shadow. Keeps the tree's overall look distinct from a chloroplast.
    g.addColorStop(0, 'rgba(120, 240, 160, 0.85)');
    g.addColorStop(1, 'rgba(30, 120, 60, 0.65)');
    ctx.fillStyle = g;
    ctx.fill(p);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* A sun disc with a soft halo. opts.intensity ∈ [0,1] scales halo + brightness. */
export function drawSun(ctx, x, y, opts = {}) {
  const { intensity = 1, r = 40 } = opts;
  begin(ctx, x, y, opts);
  ctx.globalCompositeOperation = 'lighter';
  const haloR = r * (2.6 + intensity * 2.4);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
  // Bespoke halo stops - warm-white core, gold mid, transparent edge.
  halo.addColorStop(0,   `rgba(255, 224, 102, ${0.35 * intensity})`);
  halo.addColorStop(0.4, `rgba(255, 213, 74, ${0.14 * intensity})`);
  halo.addColorStop(1,   'rgba(255, 213, 74, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  body.addColorStop(0,    '#fff7c2');            // bespoke sun highlight
  body.addColorStop(0.55, COLORS.photon);        // gold token = sun body
  body.addColorStop(1,    '#f6b93b');            // bespoke sun shadow
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
