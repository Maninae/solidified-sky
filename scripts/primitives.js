/* primitives.js — the code-drawn art library. Every organic shape, organelle,
   and molecule species used across the page is drawn here.

   All draw functions are stateless: self-contained save()/restore(), take
   (ctx, x, y, opts) with x,y the CENTER in CSS px. Colors come from tokens.js
   (never hardcoded). Shapes stay SCHEMATIC so they read at small sizes.

   Standard opts: { scale=1, alpha=1, rot=0, glow=true }. Extra params are
   documented per function. */

import { COLORS, MOLECULES } from './tokens.js';

/* -------------------------------------------------------------------------
   Small helpers: seeded RNG, hex color math. Kept private to this module. */

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function lighten(hex, k) {
  const [r,g,b] = hexRgb(hex);
  return `rgb(${(r + (255-r)*k)|0}, ${(g + (255-g)*k)|0}, ${(b + (255-b)*k)|0})`;
}
function darken(hex, k) {
  const [r,g,b] = hexRgb(hex);
  return `rgb(${(r*(1-k))|0}, ${(g*(1-k))|0}, ${(b*(1-k))|0})`;
}

/* Apply the standard opts before body drawing. Returns nothing; use with a
   matching ctx.restore() at the end. */
function begin(ctx, x, y, opts) {
  const { scale = 1, alpha = 1, rot = 0 } = opts || {};
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
}

/* -------------------------------------------------------------------------
   Organic shape helpers. Return Path2D so callers can fill/stroke/clip them. */

/* A wobbly closed blob — a circle whose radius is perturbed by a small sum
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

/* A rounded leaf silhouette — vesica-like, symmetric around cy. w,h are the
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

/* -------------------------------------------------------------------------
   Organelles and larger structures. Layered translucent fills + radial glows
   so each reads as an organic body, not a mechanical diagram. */

/* Chloroplast — soft green lozenge, double envelope, a few grana stacks. */
export function drawChloroplast(ctx, x, y, opts = {}) {
  begin(ctx, x, y, opts);
  const { glow = true } = opts;
  const w = 220, h = 120;

  if (glow) { ctx.shadowColor = COLORS.chloro; ctx.shadowBlur = 30; }
  const outer = superellipsePath(0, 0, w/2, h/2, 3.2);
  const fill = ctx.createRadialGradient(0, 0, 8, 0, 0, w/2);
  fill.addColorStop(0,   'rgba(74, 222, 128, 0.55)');
  fill.addColorStop(0.7, 'rgba(74, 222, 128, 0.30)');
  fill.addColorStop(1,   'rgba(74, 222, 128, 0.10)');
  ctx.fillStyle = fill;
  ctx.fill(outer);
  ctx.shadowBlur = 0;

  // Envelope — outer + inner membrane rings hint the double envelope.
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

/* A single granum — a stack of flat green thylakoid discs. */
export function drawThylakoidStack(ctx, x, y, opts = {}) {
  begin(ctx, x, y, opts);
  const { glow = true, count = 5 } = opts;
  const w = 46, h = 8, gap = 12;
  const topY = -((count - 1) * gap) / 2;
  if (glow) { ctx.shadowColor = COLORS.chloro; ctx.shadowBlur = 10; }
  for (let i = 0; i < count; i++) {
    const cy = topY + i * gap;
    const g = ctx.createLinearGradient(0, cy - h/2, 0, cy + h/2);
    g.addColorStop(0, 'rgba(140, 255, 180, 0.85)');
    g.addColorStop(1, 'rgba(40, 170,  95, 0.85)');
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
  ctx.fillStyle = 'rgba(74, 222, 128, 0.08)';
  ctx.fillRect(-width/2, -height/2, width, height);
  const band = 10;
  const top = ctx.createLinearGradient(0, -height/2, 0, -height/2 + band);
  top.addColorStop(0, 'rgba(74, 222, 128, 0.55)');
  top.addColorStop(1, 'rgba(74, 222, 128, 0.15)');
  ctx.fillStyle = top;
  ctx.fillRect(-width/2, -height/2, width, band);
  const bot = ctx.createLinearGradient(0, height/2 - band, 0, height/2);
  bot.addColorStop(0, 'rgba(74, 222, 128, 0.15)');
  bot.addColorStop(1, 'rgba(74, 222, 128, 0.55)');
  ctx.fillStyle = bot;
  ctx.fillRect(-width/2, height/2 - band, width, band);
  ctx.restore();
}

/* Stroma — fluid fill blob with a very subtle grain of specks. */
export function drawStroma(ctx, x, y, opts = {}) {
  const { w = 300, h = 180, seed = 3 } = opts;
  begin(ctx, x, y, opts);
  const path = blobPath(0, 0, Math.min(w, h) / 2, { harmonics: 4, amp: 0.14, seed, points: 64 });
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(w, h)/2);
  g.addColorStop(0, 'rgba(150, 220, 180, 0.22)');
  g.addColorStop(1, 'rgba(74, 222, 128, 0.05)');
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.fillStyle = 'rgba(210, 245, 220, 0.10)';
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

/* Stoma — a leaf pore. Two crescent guard cells hug a central slit;
   opts.openness ∈ [0,1] widens the pore. */
export function drawStoma(ctx, x, y, opts = {}) {
  const { openness = 1, glow = true } = opts;
  begin(ctx, x, y, opts);
  const w = 44;
  const gap = 2 + openness * 8;
  if (glow) { ctx.shadowColor = COLORS.chloro; ctx.shadowBlur = 10; }
  ctx.fillStyle = 'rgba(74, 222, 128, 0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -gap/2 - 4, w/2, 4, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, gap/2 + 4, w/2, 4, 0, 0, Math.PI);
  ctx.fill();
  ctx.shadowBlur = 0;
  // The pore itself — dark oval between the guard cells.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.ellipse(0, 0, (w/2 - 4) * openness + 3, gap/2 + 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* A mesophyll cell — blobby cell wall with chloroplasts scattered inside. */
export function drawLeafCell(ctx, x, y, opts = {}) {
  const { w = 180, h = 110, seed = 5, chloroplasts = 6 } = opts;
  begin(ctx, x, y, opts);
  const cell = blobPath(0, 0, Math.min(w, h) / 2, { harmonics: 3, amp: 0.10, seed, points: 48 });
  ctx.fillStyle = 'rgba(74, 222, 128, 0.06)';
  ctx.fill(cell);
  ctx.strokeStyle = 'rgba(150, 200, 170, 0.35)';
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

/* A leaf cross-section — the layered anatomy the zoom station drops through. */
export function drawLeafCrossSection(ctx, x, y, opts = {}) {
  const { w = 700, h = 220, seed = 7 } = opts;
  begin(ctx, x, y, opts);
  const layers = [
    { h: 6,  fill: 'rgba(200, 240, 200, 0.30)' }, // cuticle
    { h: 20, fill: 'rgba(120, 200, 140, 0.35)' }, // upper epidermis
    { h: 62, fill: 'rgba(74, 222, 128, 0.16)'  }, // palisade layer
    { h: 78, fill: 'rgba(74, 222, 128, 0.09)'  }, // spongy layer
    { h: 20, fill: 'rgba(120, 200, 140, 0.35)' }, // lower epidermis
    { h: 6,  fill: 'rgba(200, 240, 200, 0.30)' }, // bottom cuticle
  ];
  let y0 = -h / 2;
  for (const L of layers) { ctx.fillStyle = L.fill; ctx.fillRect(-w/2, y0, w, L.h); y0 += L.h; }

  const rng = mulberry32(seed);
  // Palisade cells — tall, tightly packed.
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
  // Spongy cells — irregular blobs with air gaps between.
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

/* A schematic tree — brown trunk plus a few overlapping green crown blobs. */
export function drawTree(ctx, x, y, opts = {}) {
  const { seed = 11, height = 240, glow = true } = opts;
  begin(ctx, x, y, opts);
  const trunkH = height * 0.45;
  const trunkW = height * 0.08;
  const trunk = ctx.createLinearGradient(-trunkW, 0, trunkW, 0);
  trunk.addColorStop(0, '#3d2a1d');
  trunk.addColorStop(0.5, '#5b3c26');
  trunk.addColorStop(1, '#2a1c11');
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
  halo.addColorStop(0,   `rgba(255, 224, 102, ${0.35 * intensity})`);
  halo.addColorStop(0.4, `rgba(255, 213, 74, ${0.14 * intensity})`);
  halo.addColorStop(1,   'rgba(255, 213, 74, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  body.addColorStop(0,    '#fff7c2');
  body.addColorStop(0.55, '#ffe066');
  body.addColorStop(1,    '#f6b93b');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* -------------------------------------------------------------------------
   Molecules. drawMolecule is the ONE entry point stations use for any species;
   it dispatches on the type into per-shape drawers below. Each drawer runs in
   a local frame already translated to (x,y) and rotated/scaled per opts. */

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

/* Ball-and-stick for co2 / h2o / o2 — just the balls, since sticks vanish at
   particle scale. Each atom gets a shaded sphere. */
function drawAtomsBall(ctx, spec) {
  for (const a of spec.atoms) {
    const g = ctx.createRadialGradient(a.dx - a.r*0.35, a.dy - a.r*0.35, 0, a.dx, a.dy, a.r);
    g.addColorStop(0,   lighten(a.color, 0.5));
    g.addColorStop(0.7, a.color);
    g.addColorStop(1,   darken(a.color, 0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(a.dx, a.dy, a.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ATP — an 8-spike energy burst with a bright core. */
function drawBurst(ctx, spec) {
  const R = spec.r;
  const path = new Path2D();
  const spikes = 8;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? R : R * 0.5;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
  }
  path.closePath();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0,   '#fff8c8');
  g.addColorStop(0.6, spec.color);
  g.addColorStop(1,   darken(spec.color, 0.35));
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.fillStyle = '#fffde0';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

/* NADPH — a violet capsule (rounded pill). */
function drawCapsule(ctx, spec) {
  const w = spec.r * 2.4, h = spec.r * 1.3;
  const g = ctx.createLinearGradient(-w/2, 0, w/2, 0);
  g.addColorStop(0, lighten(spec.color, 0.35));
  g.addColorStop(1, darken(spec.color, 0.15));
  ctx.fillStyle = g;
  const p = new Path2D();
  const r = h / 2;
  p.moveTo(-w/2 + r, -r);
  p.lineTo( w/2 - r, -r);
  p.arc(   w/2 - r, 0, r, -Math.PI/2, Math.PI/2);
  p.lineTo(-w/2 + r,  r);
  p.arc(  -w/2 + r, 0, r,  Math.PI/2, -Math.PI/2);
  p.closePath();
  ctx.fill(p);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke(p);
}

/* Glucose — a brown hexagon ring. */
function drawHexagon(ctx, spec) {
  const R = spec.r;
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = Math.cos(a) * R, py = Math.sin(a) * R;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
  p.closePath();
  ctx.fillStyle = spec.color;
  ctx.fill(p);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = darken(spec.color, 0.3);
  ctx.stroke(p);
  const ring = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = Math.cos(a) * R * 0.55, py = Math.sin(a) * R * 0.55;
    if (i === 0) ring.moveTo(px, py); else ring.lineTo(px, py);
  }
  ring.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 1;
  ctx.stroke(ring);
}

/* G3P — three brown balls in a row (a 3-carbon fragment). */
function drawTriad(ctx, spec) {
  const r = spec.r * 0.55;
  const gap = spec.r * 0.9;
  for (let i = -1; i <= 1; i++) {
    const g = ctx.createRadialGradient(i*gap - r*0.35, -r*0.35, 0, i*gap, 0, r);
    g.addColorStop(0, lighten(spec.color, 0.4));
    g.addColorStop(1, darken(spec.color, 0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(i * gap, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* Photon — a horizontal gold streak (rotate at the callsite for direction). */
function drawPhoton(ctx, spec) {
  ctx.globalCompositeOperation = 'lighter';
  const R = spec.r;
  const streak = ctx.createLinearGradient(-R*2.4, 0, R*2.4, 0);
  streak.addColorStop(0,   'rgba(255,224,102,0)');
  streak.addColorStop(0.45,'rgba(255,240,140,0.9)');
  streak.addColorStop(0.55,'#ffffff');
  streak.addColorStop(1,   'rgba(255,224,102,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(-R*2.4, -R*0.35, R*4.8, R*0.7);
  ctx.fillStyle = '#fff9d0';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/* A soft glowing dot — used for H⁺ and any default "orb" molecule. */
function drawDot(ctx, spec) {
  const R = spec.r;
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.7);
  halo.addColorStop(0, '#ffffff');
  halo.addColorStop(0.4, spec.color);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = spec.color;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
}

/* Electron — glowing cyan head with a short fading tail. Callers rotate the
   sprite by velocity so the tail always trails behind. */
function drawElectron(ctx, spec) {
  ctx.globalCompositeOperation = 'lighter';
  const R = spec.r;
  const tail = ctx.createLinearGradient(-R*3.5, 0, R, 0);
  tail.addColorStop(0,   'rgba(56,224,208,0)');
  tail.addColorStop(0.5, 'rgba(56,224,208,0.35)');
  tail.addColorStop(1,   spec.color);
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.ellipse(-R * 1.2, 0, R * 3, R * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  const head = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.8);
  head.addColorStop(0,   '#eaffff');
  head.addColorStop(0.4, spec.color);
  head.addColorStop(1,   'rgba(56,224,208,0)');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/* The "carbon we're following" — a bright white orb ringed in gold. */
function drawTagged(ctx, spec) {
  const R = spec.r;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d8d8d8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.accent2;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R + 3, 0, Math.PI * 2);
  ctx.stroke();
}
