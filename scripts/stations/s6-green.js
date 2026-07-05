/* s6-green.js - Station 6: "Why Green?"
   The bonus station of Solidified Sky. A leaf looks green because green is
   the band chlorophyll REFUSES to absorb: it drinks blue (~430) and red
   (~660) hard, and the ~550 gap in the curve is what reflects into your eye.

   Left panel: a leaf swatch (roundedLeafPath) lit by the current wavelength.
   Absorption dims the leaf; the reflected ray's brightness = (1 − absorbed).
   Right panel: chlorophyll's absorption curve (from tokens/CHLOROPHYLL_ABSORPTION)
   over a rainbow x-axis, with a draggable wavelength marker.
   Peaks referenced: chlorophyll a ~430 & ~662 nm, b ~453 & ~642 nm. */

import { COLORS, CHLOROPHYLL_ABSORPTION, wavelengthToRGB } from '../tokens.js';
import { mountStage } from '../engine.js';
import { roundedLeafPath } from '../primitives.js';
import { hexToRgb, withAlpha } from '../util.js';

/* Linear-interp the 10-nm sample table. */
function absorptionAt(nm) {
  const c = Math.max(400, Math.min(700, nm));
  const t = (c - 400) / 10, i = Math.floor(t), f = t - i;
  const a = CHLOROPHYLL_ABSORPTION[i] ?? 0;
  const b = CHLOROPHYLL_ABSORPTION[Math.min(i + 1, CHLOROPHYLL_ABSORPTION.length - 1)] ?? a;
  return a + (b - a) * f;
}

function bandName(nm) {
  if (nm < 430) return 'violet';
  if (nm < 490) return 'blue';
  if (nm < 510) return 'cyan';
  if (nm < 565) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 625) return 'orange';
  return 'red';
}

function readoutFor(nm, absorbed) {
  const band = bandName(nm);
  const pct = Math.round(absorbed * 100);
  if (absorbed > 0.75) return `${nm} nm - ${band}. Chlorophyll drinks about ${pct}% of this - it drives photosynthesis, and almost none escapes to your eye.`;
  if (absorbed < 0.25) return `${nm} nm - ${band}. Chlorophyll barely touches this (only ~${pct}%). Most of it reflects off the leaf - this is the color you see.`;
  return `${nm} nm - ${band}. Chlorophyll absorbs about ${pct}% here - the rest reflects.`;
}

export function init(sectionEl) {
  try { mount(sectionEl); }
  catch (err) { console.error('[s6-green] init failed:', err); }
  // The panel HTML still shows title/hint even when the canvas is dead.
}

function mount(sectionEl) {
  const canvas  = sectionEl.querySelector('#s6-canvas');
  const slider  = sectionEl.querySelector('#s6-wavelength');
  const wlLabel = sectionEl.querySelector('#s6-wl-val');
  const readout = sectionEl.querySelector('#s6-readout');
  if (!canvas || !slider) return;

  const state = { nm: Number(slider.value) || 550 };

  const syncDom = () => {
    const absorbed = absorptionAt(state.nm);
    if (wlLabel) wlLabel.textContent = `${state.nm} nm`;
    if (readout) readout.textContent = readoutFor(state.nm, absorbed);
  };
  syncDom();

  slider.addEventListener('input', () => {
    state.nm = Number(slider.value);
    syncDom();
  });

  mountStage(canvas, (ctx, dt, t, W, H) => render(ctx, W, H, state), {
    background: COLORS.bgDeep,
  });
}

/* -------------------------------------------------------------------------
   Rendering. Left panel: leaf + rays. Right panel: absorption curve. */

function render(ctx, W, H, state) {
  const drawW = Math.min(W, 900);
  const originX = (W - drawW) / 2;
  const stacked = W < 620;
  const leftW  = stacked ? drawW : drawW * 0.40;
  const rightW = stacked ? drawW : drawW * 0.60;
  const leftBox  = { x: originX,         y: 0, w: leftW,  h: stacked ? H * 0.42 : H };
  const rightBox = stacked
    ? { x: originX,           y: H * 0.42, w: drawW,  h: H * 0.58 }
    : { x: originX + leftW,   y: 0,        w: rightW, h: H };

  drawLeafPanel(ctx, leftBox, state);
  drawSpectrumPanel(ctx, rightBox, state);
}

/* -------- LEFT PANEL --------------------------------------------------- */

function drawLeafPanel(ctx, box, state) {
  const { x, y, w, h } = box;
  const cx = x + w / 2, cy = y + h / 2;
  const nm = state.nm;
  const absorbed = absorptionAt(nm);
  const reflected = 1 - absorbed;
  const lightColor = wavelengthToRGB(nm);

  const leafW = Math.min(w * 0.62, 200);
  const leafH = leafW * 0.62;
  const leafPath = roundedLeafPath(cx, cy + 6, leafW, leafH);

  // Base color: chlorophyll green dimmed by absorption, then tinted toward the
  // reflected light. Green light → the leaf glows green. Blue/red light →
  // near-black because chlorophyll is drinking almost everything.
  const [gr, gg, gb] = hexToRgb(COLORS.chloro);
  const dim = 0.35 + 0.65 * reflected;
  const [lr, lg, lb] = parseRgb(lightColor);
  const mix = reflected * 0.55;
  const baseFill = `rgb(${(gr*dim)*(1-mix) + lr*mix | 0}, ${(gg*dim)*(1-mix) + lg*mix | 0}, ${(gb*dim)*(1-mix) + lb*mix | 0})`;

  ctx.save();
  ctx.shadowColor = lightColor;
  ctx.shadowBlur  = 8 + 34 * reflected;
  ctx.fillStyle = baseFill;
  ctx.fill(leafPath);
  ctx.shadowBlur = 0;
  // Midrib - sells it as a leaf, not a pea.
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - leafW / 2 + 6, cy + 6);
  ctx.lineTo(cx + leafW / 2 - 6, cy + 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 245, 215, 0.30)';
  ctx.lineWidth = 1.2;
  ctx.stroke(leafPath);
  ctx.restore();

  // Incident ray in, reflected ray out. Incident brightness is fixed
  // (sunlight is what it is); reflected brightness scales with (1 − absorbed).
  const inStart = { x: cx - leafW * 0.55, y: cy - leafH * 0.9 - 30 };
  const hit     = { x: cx - leafW * 0.15, y: cy - leafH * 0.32 };
  const outEnd  = { x: cx + leafW * 0.55, y: cy - leafH * 0.9 - 30 };
  drawRay(ctx, inStart, hit, lightColor, 1.0);
  drawRay(ctx, hit, outEnd, lightColor, 0.15 + 0.85 * reflected);

  ctx.fillStyle = lightColor;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(inStart.x, inStart.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('LEAF UNDER LIGHT', x + 14, y + 12);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '12px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`reflects ${Math.round(reflected * 100)}% of ${nm} nm`, cx, y + h - 12);
}

function drawRay(ctx, a, b, color, brightness) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * brightness + 2;
  ctx.globalAlpha = 0.25 + 0.65 * brightness;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

/* -------- RIGHT PANEL: absorption curve -------------------------------- */

function drawSpectrumPanel(ctx, box, state) {
  const { x, y, w, h } = box;
  // Gutters hold axis + peak labels so they never overlap the curve.
  const padL = 46, padR = 22, padT = 42, padB = 46;
  const chart = { x: x + padL, y: y + padT, w: Math.max(20, w - padL - padR), h: Math.max(20, h - padT - padB) };
  const nmToX = (nm) => chart.x + ((nm - 400) / 300) * chart.w;
  const absToY = (a) => chart.y + chart.h - a * chart.h;

  // Rainbow strip under the axis: real spectral colors 400..700 nm.
  const stripH = 12;
  const stripY = chart.y + chart.h + 4;
  for (let px = 0; px <= chart.w; px++) {
    const nm = 400 + (px / chart.w) * 300;
    ctx.fillStyle = wavelengthToRGB(nm);
    ctx.fillRect(chart.x + px, stripY, 1, stripH);
  }
  ctx.strokeStyle = 'rgba(200, 245, 215, 0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(chart.x + 0.5, stripY + 0.5, chart.w, stripH);

  // Faint gridlines at 0 / 0.5 / 1.
  ctx.strokeStyle = 'rgba(150, 200, 170, 0.10)';
  for (const a of [0, 0.5, 1]) {
    const gy = absToY(a);
    ctx.beginPath();
    ctx.moveTo(chart.x, gy);
    ctx.lineTo(chart.x + chart.w, gy);
    ctx.stroke();
  }

  // Filled absorption curve, then a crisp stroked outline over it.
  ctx.beginPath();
  ctx.moveTo(chart.x, chart.y + chart.h);
  for (let px = 0; px <= chart.w; px++) {
    const nm = 400 + (px / chart.w) * 300;
    ctx.lineTo(chart.x + px, absToY(absorptionAt(nm)));
  }
  ctx.lineTo(chart.x + chart.w, chart.y + chart.h);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, chart.y, 0, chart.y + chart.h);
  fill.addColorStop(0, withAlpha(COLORS.chloro, 0.55));
  fill.addColorStop(1, withAlpha(COLORS.chloro, 0.05));
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  for (let px = 0; px <= chart.w; px++) {
    const nm = 400 + (px / chart.w) * 300;
    const cxp = chart.x + px, cyp = absToY(absorptionAt(nm));
    if (px === 0) ctx.moveTo(cxp, cyp); else ctx.lineTo(cxp, cyp);
  }
  ctx.strokeStyle = COLORS.chloro;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Peak / trough labels - pinned above the chart so they never touch the curve.
  const marks = [
    { nm: 430, label: 'blue peak', align: 'left'   },
    { nm: 550, label: 'green gap', align: 'center' },
    { nm: 660, label: 'red peak',  align: 'right'  },
  ];
  ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
  for (const m of marks) {
    const mx = nmToX(m.nm);
    const my = absToY(absorptionAt(m.nm));
    const color = wavelengthToRGB(m.nm);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = m.align;
    ctx.textBaseline = 'bottom';
    const lx = m.align === 'left' ? mx - 8 : m.align === 'right' ? mx + 8 : mx;
    ctx.fillText(m.label, lx, chart.y - 6);
    ctx.fillText(`${m.nm} nm`, lx, chart.y - 20);
  }

  // Draggable wavelength marker.
  const mx = nmToX(state.nm);
  const my = absToY(absorptionAt(state.nm));
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx, chart.y);
  ctx.lineTo(mx, stripY + stripH);
  ctx.stroke();
  ctx.setLineDash([]);

  const markerColor = wavelengthToRGB(state.nm);
  ctx.fillStyle = markerColor;
  ctx.shadowColor = markerColor;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.specular;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Axis text lives in the gutters - no chance of curve overlap.
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const axisY = stripY + stripH + 4;
  for (const nm of [400, 500, 600, 700]) ctx.fillText(`${nm}`, nmToX(nm), axisY);
  ctx.fillText('WAVELENGTH (nm)', chart.x + chart.w / 2, axisY + 14);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('1.0', chart.x - 6, absToY(1));
  ctx.fillText('0.5', chart.x - 6, absToY(0.5));
  ctx.fillText('0',   chart.x - 6, absToY(0));

  ctx.save();
  ctx.translate(x + 14, chart.y + chart.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ABSORPTION', 0, 0);
  ctx.restore();
}

/* -------- tiny color utility (kept local) ------------------------------ */

/* Parse "rgb(r, g, b)" back to [r, g, b] ints. Local because it's only used
   to unpack wavelengthToRGB()'s string output; not a generic hex utility. */
function parseRgb(str) {
  const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(str);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [255, 255, 255];
}
