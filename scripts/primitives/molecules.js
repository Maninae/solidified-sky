/* primitives/molecules.js - the per-species molecule drawers behind
   drawMolecule. Every species's schematic reads identically wherever it
   appears (the Molecule Color Law): balls for co2/h2o/o2, a burst for atp,
   a capsule for nadph, a hexagon for glucose, three-in-a-row for G3P, a
   gold streak for photon, a glowing head+tail for electron, a soft dot for
   proton, a bright ring-tagged atom for carbon.

   drawMolecule dispatches on the type key into one of the private drawers
   below. Each drawer runs in a local frame already translated to (x,y) and
   rotated/scaled per opts by the shared `begin` helper. */

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

/* Ball-and-stick for co2 / h2o / o2 - just the balls, since sticks vanish at
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

/* ATP - an 8-spike energy burst with a bright core. */
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
  g.addColorStop(0,   '#fff8c8');         // bespoke bright ATP core
  g.addColorStop(0.6, spec.color);
  g.addColorStop(1,   darken(spec.color, 0.35));
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.fillStyle = '#fffde0';              // bespoke inner-core pip
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

/* NADPH - a violet capsule (rounded pill). */
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
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';   // bespoke highlight stroke
  ctx.lineWidth = 1;
  ctx.stroke(p);
}

/* Glucose - a brown hexagon ring. */
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
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';   // bespoke inner-ring hint
  ctx.lineWidth = 1;
  ctx.stroke(ring);
}

/* G3P - three brown balls in a row (a 3-carbon fragment). */
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

/* Photon - a horizontal gold streak (rotate at the callsite for direction). */
function drawPhoton(ctx, spec) {
  ctx.globalCompositeOperation = 'lighter';
  const R = spec.r;
  const streak = ctx.createLinearGradient(-R*2.4, 0, R*2.4, 0);
  // Fade from transparent-gold through a bright white spine and back.
  streak.addColorStop(0,   withAlpha(COLORS.photon, 0));
  streak.addColorStop(0.45,'rgba(255,240,140,0.9)');     // bespoke bright warm
  streak.addColorStop(0.55, COLORS.specular);
  streak.addColorStop(1,   withAlpha(COLORS.photon, 0));
  ctx.fillStyle = streak;
  ctx.fillRect(-R*2.4, -R*0.35, R*4.8, R*0.7);
  ctx.fillStyle = '#fff9d0';                             // bespoke photon core
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/* A soft glowing dot - used for H⁺ and any default "orb" molecule. */
function drawDot(ctx, spec) {
  const R = spec.r;
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.7);
  halo.addColorStop(0, COLORS.specular);
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

/* Electron - glowing cyan head with a short fading tail. Callers rotate the
   sprite by velocity so the tail always trails behind. */
function drawElectron(ctx, spec) {
  ctx.globalCompositeOperation = 'lighter';
  const R = spec.r;
  const tail = ctx.createLinearGradient(-R*3.5, 0, R, 0);
  tail.addColorStop(0,   withAlpha(COLORS.electron, 0));
  tail.addColorStop(0.5, withAlpha(COLORS.electron, 0.35));
  tail.addColorStop(1,   spec.color);
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.ellipse(-R * 1.2, 0, R * 3, R * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  const head = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.8);
  head.addColorStop(0,   '#eaffff');                     // bespoke bright head
  head.addColorStop(0.4, spec.color);
  head.addColorStop(1,   withAlpha(COLORS.electron, 0));
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/* The "carbon we're following" - a bright white orb ringed in gold. */
function drawTagged(ctx, spec) {
  const R = spec.r;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, COLORS.specular);
  g.addColorStop(1, '#d8d8d8');                          // bespoke pale grey
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
