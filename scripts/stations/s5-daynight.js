/* s5-daynight.js — Station 5: The Whole Cycle, Running.
 *
 * A single leaf across one full day. The slider drives clock time (0..1440
 * min); sky, sun/moon arc, gas flow through the stomata, and the three
 * readouts all move with it. The point of the station:
 *
 *   Plants respire 24/7 (small constant O2 in / CO2 out for their own energy).
 *   Photosynthesis only runs on sunlight, a bell peaking at noon, zero at
 *   night. Day: photo >> resp, so NET flow is CO2 in / O2 out. Night: only
 *   resp is left, so the flow REVERSES to O2 in / CO2 out. Around dawn/dusk
 *   they roughly cancel — the compensation point.
 *
 * Model: photo(f) = sin(pi * dayPhase) in [SUNRISE,SUNSET] else 0;  resp
 * constant. netO2 = photo - resp;  netCO2 = -netO2.
 *
 * Interface: export function init(sectionEl). Safe if a control is missing
 * or a renderer throws — the panel survives.
 */

import { COLORS } from '../tokens.js';
import { mountStage } from '../engine.js';
import { ParticleSystem } from '../particles.js';
import { drawSun, drawStoma, roundedLeafPath } from '../primitives.js';

// ---- day-cycle model -----------------------------------------------------

const SUNRISE    = 0.25;                    // 6:00
const SUNSET     = 0.75;                    // 18:00
const DAY_SPAN   = SUNSET - SUNRISE;        // 0.5
const NIGHT_SPAN = 1 - DAY_SPAN;            // 0.5
const RESP_RATE  = 0.16;                    // constant respiration rate (rel units)

// Bell-shaped photosynthesis rate, peaks 1.0 at noon, 0 outside daylight.
function photoRate(f) {
  if (f < SUNRISE || f > SUNSET) return 0;
  return Math.sin(((f - SUNRISE) / DAY_SPAN) * Math.PI);
}

// Sun/moon arc positions. Return [xNorm, yNorm] with y in [0,1] where
// 0 = zenith, 1 = horizon; null if the body is below the horizon.
const arcXY = (p) => [0.10 + 0.80 * p, 1 - Math.sin(p * Math.PI)];
function sunArc(f)  { return (f < SUNRISE || f > SUNSET) ? null : arcXY((f - SUNRISE) / DAY_SPAN); }
function moonArc(f) {
  if (f >= SUNSET)      return arcXY((f - SUNSET) / NIGHT_SPAN);
  if (f < SUNRISE)      return arcXY((f + 1 - SUNSET) / NIGHT_SPAN);
  return null;
}

// Smooth 0..1 ambient light: 0 at midnight, 1 at midday, with soft twilight
// transitions (0.20–0.30 dawn, 0.70–0.80 dusk). Drives the star alpha.
function smoothstep(a, b, t) { const s = Math.max(0, Math.min(1, (t - a) / (b - a))); return s * s * (3 - 2 * s); }
const ambientLight = (f) => Math.max(0, smoothstep(0.20, 0.30, f) - smoothstep(0.70, 0.80, f));

// ---- sky palette ---------------------------------------------------------
// Zenith + horizon keyframes over the day; linear-interp then paint as a
// vertical gradient. Warm peach on the horizon at dawn/dusk sells the sunset.
const SKY_ZENITH = [
  [0.00, [  4,   8,  22]], [0.22, [ 14,  20,  46]], [0.30, [ 66,  58, 104]],
  [0.50, [ 52, 132, 200]], [0.70, [ 66,  58, 104]], [0.78, [ 14,  20,  46]],
  [1.00, [  4,   8,  22]],
];
const SKY_HORIZON = [
  [0.00, [ 10,  20,  34]], [0.22, [ 42,  32,  58]], [0.30, [230, 138, 100]],
  [0.50, [172, 214, 244]], [0.70, [230, 138, 100]], [0.78, [ 42,  32,  58]],
  [1.00, [ 10,  20,  34]],
];

function lerpKF(kf, t) {
  if (t <= kf[0][0]) return kf[0][1];
  const n = kf.length;
  for (let i = 0; i < n - 1; i++) {
    if (t <= kf[i + 1][0]) {
      const [t0, c0] = kf[i], [t1, c1] = kf[i + 1];
      const s = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * s,
              c0[1] + (c1[1] - c0[1]) * s,
              c0[2] + (c1[2] - c0[2]) * s];
    }
  }
  return kf[n - 1][1];
}
const rgb = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;

// ---- formatting ----------------------------------------------------------

const CLOCK_LABELS = ['night','night','night','night','night','dawn','dawn','morning','morning','morning','morning','morning','noon','afternoon','afternoon','afternoon','afternoon','evening','evening','evening','night','night','night','night'];
function fmtClock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${CLOCK_LABELS[h]}`;
}
const fmtSigned = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
function statusFor(f) {
  const photo = photoRate(f);
  if (photo <= 0.02) return 'night — respiring only';
  if (photo > RESP_RATE + 0.14) return 'daytime — net producing';
  return f < 0.5 ? 'dawn — near balance' : 'dusk — near balance';
}

// Deterministic star field — cheap hash on index so the set survives resize.
function buildStars(W, groundY, n = 80) {
  const stars = new Array(n);
  const h = (i, k) => { const v = Math.sin((i + 1) * k) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < n; i++) {
    stars[i] = { x: h(i, 12.9898) * W, y: h(i, 78.233) * groundY * 0.9,
                 r: 0.4 + h(i, 45.164) * 1.3, phase: h(i, 91.729) * Math.PI * 2 };
  }
  return stars;
}

// Gas spawns through a stoma. IN: rises from air below the leaf into the
// stoma. OUT: emerges from the stoma and drifts down + outward into the air.
function spawnIn(ps, type, stom) {
  const x0 = stom.x + (Math.random() - 0.5) * 60, y0 = stom.y + 40 + Math.random() * 50, life = 1.6;
  ps.spawn(type, x0, y0, { vx: (stom.x - x0) / life, vy: (stom.y - y0) / life,
                           life, scale: 0.65 + Math.random() * 0.25 });
}
function spawnOut(ps, type, stom) {
  const a = Math.PI / 2 + (Math.random() - 0.5) * 0.7, sp = 24 + Math.random() * 22;
  ps.spawn(type, stom.x, stom.y + 4, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                        life: 1.8, drag: 0.6, scale: 0.65 + Math.random() * 0.25 });
}

// ---- decor draws ---------------------------------------------------------

function drawLeaf(ctx, cx, cy, w, h, glowK) {
  ctx.save();
  ctx.shadowColor = COLORS.chloro;
  ctx.shadowBlur = 10 + 20 * glowK;
  const leaf = roundedLeafPath(cx, cy, w, h);
  const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, w / 2);
  g.addColorStop(0,   `rgba(140, 245, 175, ${0.35 + 0.45 * glowK})`);
  g.addColorStop(0.7, `rgba(74, 222, 128, ${0.30 + 0.30 * glowK})`);
  g.addColorStop(1,   'rgba(24, 100, 55, 0.55)');
  ctx.fillStyle = g;
  ctx.fill(leaf);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(200, 245, 215, 0.42)';
  ctx.lineWidth = 1.4;
  ctx.stroke(leaf);
  ctx.strokeStyle = 'rgba(20, 70, 40, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, cy);
  ctx.lineTo(cx + w * 0.42, cy);
  ctx.stroke();
  ctx.restore();
}

function drawMoon(ctx, x, y, r) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  halo.addColorStop(0, 'rgba(220, 230, 255, 0.35)');
  halo.addColorStop(1, 'rgba(220, 230, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const body = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, '#f8fbff'); body.addColorStop(1, '#a9b9d8');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  // Nudge a soft shadow onto one side so it reads as a moon, not a bright dot.
  ctx.fillStyle = 'rgba(20, 30, 60, 0.30)';
  ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.15, r * 0.72, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Badge that says "always respiring" with a small heart-beat pulse.
// Placed in the ground band so it never occludes the leaf art.
function drawRespirationBadge(ctx, x, y, pulse) {
  ctx.save();
  const beat = Math.max(0, Math.sin(pulse * Math.PI * 2));
  ctx.strokeStyle = 'rgba(210, 220, 220, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COLORS.textPrimary;
  ctx.beginPath(); ctx.arc(x, y, 3 + beat * 3, 0, Math.PI * 2); ctx.fill();
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = COLORS.textSecondary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('respiration always on', x + 16, y);
  ctx.restore();
}

// ---- station init --------------------------------------------------------

export function init(sectionEl) {
  try {
    const canvas    = sectionEl.querySelector('#s5-canvas');
    const slider    = sectionEl.querySelector('#s5-time');
    const timeLabel = sectionEl.querySelector('#s5-time-val');
    const o2El      = sectionEl.querySelector('#s5-o2');
    const co2El     = sectionEl.querySelector('#s5-co2');
    const stateEl   = sectionEl.querySelector('#s5-state');
    if (!canvas || !slider) return;

    const ps = new ParticleSystem(360);
    let stars = null;
    const state = { dayFrac: (+slider.value) / 1440, spawnAcc: 0, pulse: 0 };

    const updateReadouts = () => {
      const photo = photoRate(state.dayFrac);
      const netO2 = photo - RESP_RATE;
      const netCO2 = -netO2;
      if (o2El)  { o2El.textContent  = fmtSigned(netO2);  o2El.style.color  = COLORS.o2; }
      if (co2El) { co2El.textContent = fmtSigned(netCO2); co2El.style.color = COLORS.co2; }
      if (stateEl) stateEl.textContent = statusFor(state.dayFrac);
    };
    const onSlider = () => {
      state.dayFrac = Math.max(0, Math.min(1, (+slider.value) / 1440));
      if (timeLabel) timeLabel.textContent = fmtClock(+slider.value);
      updateReadouts();
    };
    slider.addEventListener('input', onSlider);
    onSlider();

    mountStage(canvas, (ctx, dt, t, W, H) => {
      // Layout: sky above, ground band below, leaf straddling the horizon.
      const groundY = Math.round(H * 0.68);
      if (!stars || stars._W !== W || stars._H !== H) {
        stars = buildStars(W, groundY);
        stars._W = W; stars._H = H;
      }

      // ---- sky gradient ----
      const zen = lerpKF(SKY_ZENITH, state.dayFrac);
      const hor = lerpKF(SKY_HORIZON, state.dayFrac);
      const sky = ctx.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, rgb(zen));
      sky.addColorStop(1, rgb(hor));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, groundY);

      // ---- stars (fade with ambient light) ----
      const ambient = ambientLight(state.dayFrac);
      const nightness = 1 - ambient;
      if (nightness > 0.02) {
        ctx.fillStyle = '#eaf3ff';
        for (const s of stars) {
          const tw = 0.55 + 0.45 * Math.sin(t * 1.4 + s.phase);
          ctx.globalAlpha = nightness * tw;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // ---- sun / moon on arc ----
      const arcTop = 46, arcBot = groundY - 20;
      const s = sunArc(state.dayFrac);
      if (s) {
        const px = s[0] * W, py = arcTop + s[1] * (arcBot - arcTop);
        drawSun(ctx, px, py, { intensity: 0.35 + 0.65 * photoRate(state.dayFrac), r: 30 });
      }
      const m = moonArc(state.dayFrac);
      if (m) {
        const px = m[0] * W, py = arcTop + m[1] * (arcBot - arcTop);
        drawMoon(ctx, px, py, 22);
      }

      // ---- ground band ----
      const ground = ctx.createLinearGradient(0, groundY, 0, H);
      ground.addColorStop(0, `rgba(6, 18, 12, ${0.55 + 0.30 * nightness})`);
      ground.addColorStop(1, 'rgba(2, 10, 6, 0.95)');
      ctx.fillStyle = ground;
      ctx.fillRect(0, groundY, W, H - groundY);

      // ---- hero leaf + stomata ----
      const leafW = Math.min(W * 0.42, 320);
      const leafH = leafW * 0.38;
      const leafCx = W * 0.5;
      const leafCy = groundY - leafH * 0.55;
      drawLeaf(ctx, leafCx, leafCy, leafW, leafH, ambient);

      const stomataY = leafCy + leafH * 0.42;
      const stomA = { x: leafCx - leafW * 0.20, y: stomataY };
      const stomB = { x: leafCx + leafW * 0.20, y: stomataY };
      drawStoma(ctx, stomA.x, stomA.y, { openness: 0.9, scale: 0.55, glow: false });
      drawStoma(ctx, stomB.x, stomB.y, { openness: 0.9, scale: 0.55, glow: false });

      // ---- particle spawn: net direction determines species + direction ----
      const photo = photoRate(state.dayFrac);
      const netO2 = photo - RESP_RATE;                  // + day, - night
      const mag   = Math.abs(netO2);
      // spawnEvery: fast at peak day, slow at twilight/night.
      const spawnEvery = 1 / (2.5 + mag * 32);
      state.spawnAcc += dt;
      while (state.spawnAcc > spawnEvery && ps.count < 340) {
        state.spawnAcc -= spawnEvery;
        const stom = Math.random() < 0.5 ? stomA : stomB;
        if (netO2 > 0) {
          if (Math.random() < 0.5) spawnIn(ps, 'co2', stom);
          else                     spawnOut(ps, 'o2', stom);
        } else {
          if (Math.random() < 0.5) spawnIn(ps, 'o2', stom);
          else                     spawnOut(ps, 'co2', stom);
        }
      }

      // ---- always-respiring badge, tucked into the ground band ----
      state.pulse = (state.pulse + dt * 1.4) % 1;
      drawRespirationBadge(ctx, 20, H - 22, state.pulse);

      // ---- particles on top ----
      ps.update(dt);
      ps.draw(ctx);
    }, { background: COLORS.bgDeep });
  } catch (e) {
    console.error('s5-daynight failed to init:', e);
  }
}
