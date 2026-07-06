/* particles.js - a pooled, data-oriented particle engine.

   Every species has ONE cached sprite (rendered once with drawMolecule at
   construct time onto an offscreen canvas at devicePixelRatio). The frame
   loop only does drawImage - 10-100× faster than re-drawing shapes each
   frame - so 800+ molecules can move at 60fps.

   Particles come in two flavors:
     * free   - integrated with velocity + drag until their life runs out.
     * path   - ride a parametric curve (t)=>[x,y] over `duration` seconds,
                then die (and optionally fire onArrive).

   All data lives in parallel typed arrays so update() is one tight loop with
   no per-frame allocations. The Stage owns the rAF loop; the caller does
   `system.update(dt); system.draw(ctx)` from its render function. */

import { MOLECULES } from './tokens.js';
import { drawMolecule } from './primitives.js';

const MODE_FREE = 0;
const MODE_PATH = 1;

export class ParticleSystem {
  constructor(capacity = 900) {
    this.capacity = capacity;

    // Positional / motion state.
    this.xs   = new Float32Array(capacity);
    this.ys   = new Float32Array(capacity);
    this.vxs  = new Float32Array(capacity);
    this.vys  = new Float32Array(capacity);

    // Life bookkeeping. Semantics differ per mode:
    //   free: life counts DOWN from maxLife → 0 (Infinity means immortal).
    //   path: life counts UP from 0 → 1, using maxLife as the duration.
    this.life    = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);

    // Per-particle render / physics knobs.
    this.scale = new Float32Array(capacity);
    this.drag  = new Float32Array(capacity);
    this.rot   = new Float32Array(capacity);

    // Type index into this._typeNames.
    this.type   = new Uint8Array(capacity);
    // Whether this slot holds a live particle.
    this.alive  = new Uint8Array(capacity);
    // MODE_FREE / MODE_PATH.
    this.mode   = new Uint8Array(capacity);
    // If 1, orient rot by direction of travel each frame.
    this.orient = new Uint8Array(capacity);

    // Path particles need heap-object refs (functions + callbacks), so keep
    // them in parallel plain arrays.
    this.pathFn    = new Array(capacity).fill(null);
    this.pathJit   = new Float32Array(capacity);
    this.pathSeed  = new Float32Array(capacity);
    this.onArrive  = new Array(capacity).fill(null);

    // Round-robin allocation cursor.
    this._cursor = 0;
    this._count = 0;

    // Type index tables (MOLECULES key ↔ integer).
    this._typeNames = Object.keys(MOLECULES);
    this._typeIdx = {};
    this._typeNames.forEach((t, i) => { this._typeIdx[t] = i; });

    // Bake sprite atlas ONCE, at DPR resolution for crisp retina rendering.
    this._atlas = buildAtlas(this._typeNames);
  }

  get count() { return this._count; }

  /* -------- allocation -------- */

  _alloc() {
    // Scan forward from the cursor for a free slot. O(capacity) worst case
    // but typically finds one immediately.
    for (let n = 0; n < this.capacity; n++) {
      const i = (this._cursor + n) % this.capacity;
      if (!this.alive[i]) {
        this._cursor = (i + 1) % this.capacity;
        this.alive[i] = 1;
        this._count++;
        return i;
      }
    }
    return -1;
  }

  _free(i) {
    this.alive[i] = 0;
    this.pathFn[i] = null;
    this.onArrive[i] = null;
    this._count--;
  }

  /* -------- spawn -------- */

  /* Spawn a free particle at (x,y). Options:
       vx, vy   initial velocity px/s.
       life     lifespan in seconds (Infinity for immortal).
       scale    sprite scale multiplier.
       drag     first-order drag: vx *= (1 - drag*dt) each frame.
       rot      initial rotation in radians.
       orient   'velocity' → auto-rotate to face velocity each frame.
     Returns the particle id, or -1 if the pool is full. */
  spawn(type, x, y, { vx = 0, vy = 0, life = Infinity, scale = 1, drag = 0, rot = 0, orient = 'fixed' } = {}) {
    const i = this._alloc();
    if (i < 0) return -1;
    this.mode[i]    = MODE_FREE;
    this.xs[i]      = x;
    this.ys[i]      = y;
    this.vxs[i]     = vx;
    this.vys[i]     = vy;
    this.life[i]    = life;
    this.maxLife[i] = life;
    this.scale[i]   = scale;
    this.drag[i]    = drag;
    this.rot[i]     = rot;
    this.orient[i]  = orient === 'velocity' ? 1 : 0;
    this.type[i]    = this._typeIdx[type];
    return i;
  }

  /* Spawn a particle riding a path over `duration` seconds.
       path       (t)=>[x,y] with t ∈ [0,1], or an array of control points
                  passed to catmullRom().
       duration   seconds to traverse the path.
       jitter     perpendicular wobble in px (0 = perfectly on the curve).
       scale      sprite scale.
       onArrive   callback(id) fired at t=1 just before the particle dies.
       orient     'path' → face tangent each frame; 'fixed' otherwise.
     Returns the particle id, or -1 if the pool is full. */
  spawnOnPath(type, path, { duration = 2, jitter = 3, scale = 1, onArrive = null, orient = 'fixed' } = {}) {
    const i = this._alloc();
    if (i < 0) return -1;
    const fn = typeof path === 'function' ? path : catmullRom(path);
    this.mode[i]    = MODE_PATH;
    this.pathFn[i]  = fn;
    this.pathJit[i] = jitter;
    this.pathSeed[i]= Math.random();
    this.life[i]    = 0;
    this.maxLife[i] = duration;
    this.scale[i]   = scale;
    this.rot[i]     = 0;
    this.orient[i]  = orient === 'path' ? 1 : 0;
    this.onArrive[i]= onArrive;
    this.type[i]    = this._typeIdx[type];
    const [px, py] = fn(0);
    this.xs[i] = px; this.ys[i] = py;
    return i;
  }

  /* -------- simulation -------- */

  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;

      if (this.mode[i] === MODE_PATH) {
        const dur = this.maxLife[i];
        this.life[i] += dt / dur;
        const t = this.life[i];
        if (t >= 1) {
          const cb = this.onArrive[i];
          this._free(i);
          if (cb) cb(i);
          continue;
        }
        const fn = this.pathFn[i];
        const [px, py] = fn(t);

        // Numerical tangent for jitter offset and (optional) orientation.
        const step = 0.01;
        const [px2, py2] = fn(Math.min(1, t + step));
        let tx = px2 - px, ty = py2 - py;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len; ty /= len;

        const j = this.pathJit[i];
        if (j > 0) {
          const wob = Math.sin(t * 12 + this.pathSeed[i] * 6.2831853) * j;
          this.xs[i] = px + (-ty) * wob;
          this.ys[i] = py +   tx  * wob;
        } else {
          this.xs[i] = px; this.ys[i] = py;
        }
        if (this.orient[i]) this.rot[i] = Math.atan2(ty, tx);

      } else {
        // Free particle: integrate velocity and drag.
        const d = this.drag[i];
        if (d > 0) {
          const k = 1 - d * dt;
          this.vxs[i] *= k;
          this.vys[i] *= k;
        }
        this.xs[i] += this.vxs[i] * dt;
        this.ys[i] += this.vys[i] * dt;
        if (this.orient[i]) this.rot[i] = Math.atan2(this.vys[i], this.vxs[i]);
        if (this.maxLife[i] !== Infinity) {
          this.life[i] -= dt;
          if (this.life[i] <= 0) { this._free(i); continue; }
        }
      }
    }
  }

  /* -------- render -------- */

  draw(ctx) {
    const atlas = this._atlas;
    const names = this._typeNames;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const sp = atlas[names[this.type[i]]];
      const s = this.scale[i];
      const w = sp.size * s, h = sp.size * s;

      // Fade the last 0.4 s of a mortal free particle; fade 8% at both ends
      // of a path particle. Immortal particles stay at alpha 1.
      let alpha = 1;
      if (this.mode[i] === MODE_PATH) {
        const p = this.life[i];
        if (p < 0.08)      alpha = p / 0.08;
        else if (p > 0.92) alpha = (1 - p) / 0.08;
      } else if (this.maxLife[i] !== Infinity && this.life[i] < 0.4) {
        alpha = Math.max(0, this.life[i] / 0.4);
      }
      ctx.globalAlpha = alpha;

      if (this.rot[i]) {
        ctx.save();
        ctx.translate(this.xs[i], this.ys[i]);
        ctx.rotate(this.rot[i]);
        ctx.drawImage(sp.canvas, -w/2, -h/2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(sp.canvas, this.xs[i] - w/2, this.ys[i] - h/2, w, h);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.alive.fill(0);
    this.pathFn.fill(null);
    this.onArrive.fill(null);
    this._count = 0;
    this._cursor = 0;
  }
}

/* -------------------------------------------------------------------------
   Sprite atlas. Each species is drawn once, at DPR resolution, onto its own
   offscreen canvas. The render loop can then just drawImage the bitmap.

   Sizing rule: cssSize = max(spec.r * 6, 44) + 24 px of margin for glow
   blur. This covers the widest species (the photon streak at ~5r) and
   still leaves room for the shadowBlur=12 halo drawMolecule adds. */

function buildAtlas(types) {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const sprites = {};
  for (const t of types) {
    const spec = MOLECULES[t];
    const cssSize = Math.max(spec.r * 6, 44) + 24;
    const c = document.createElement('canvas');
    c.width = cssSize * dpr;
    c.height = cssSize * dpr;
    const cx = c.getContext('2d');
    cx.scale(dpr, dpr);
    drawMolecule(cx, t, cssSize / 2, cssSize / 2, { scale: 1, glow: true });
    sprites[t] = { canvas: c, size: cssSize };
  }
  return sprites;
}

/* -------------------------------------------------------------------------
   Path-builder helpers. Both return a smooth function (t)=>[x,y] for t∈[0,1]
   that spawnOnPath can drive. */

/* Uniform Catmull-Rom spline through `points`. Endpoints are duplicated
   virtually so the curve starts and ends exactly at the first/last points. */
export function catmullRom(points) {
  const n = points.length;
  if (n < 2) throw new Error('catmullRom: need at least 2 points');
  return (t) => {
    if (t <= 0) return [points[0][0], points[0][1]];
    if (t >= 1) return [points[n-1][0], points[n-1][1]];
    const segs = n - 1;
    const u = t * segs;
    const seg = Math.min(segs - 1, Math.floor(u));
    const s = u - seg;
    const p0 = points[Math.max(0, seg - 1)];
    const p1 = points[seg];
    const p2 = points[seg + 1];
    const p3 = points[Math.min(n - 1, seg + 2)];
    return [crAxis(p0[0], p1[0], p2[0], p3[0], s),
            crAxis(p0[1], p1[1], p2[1], p3[1], s)];
  };
}

function crAxis(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/* Cubic Bézier through control points p0,p1,p2,p3, all as [x,y]. */
export function bezierPath(p0, p1, p2, p3) {
  return (t) => {
    const u = 1 - t;
    const uu = u * u, tt = t * t;
    const w0 = uu * u, w1 = 3 * uu * t, w2 = 3 * u * tt, w3 = tt * t;
    return [w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
            w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1]];
  };
}
