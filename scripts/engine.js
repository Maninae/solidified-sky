/* engine.js — Stage: one canvas, a DPR-correct backing store, a rAF loop with
   a delta-time cap, and IntersectionObserver-driven pause when off-screen.

   The render function runs in CSS pixels (the context is already scaled for
   devicePixelRatio) and receives (ctx, dt, t, W, H). If the user prefers
   reduced motion, the Stage paints a single static frame instead of looping. */

import { COLORS } from './tokens.js';

// Any frame longer than 33 ms (window blurred, tab throttled, etc.) is capped
// so a resumed animation never lurches forward by a huge dt.
const DT_CAP = 1 / 30;

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export class Stage {
  /* Wraps one <canvas>.
       canvas   HTMLCanvasElement to drive.
       render   (ctx, dt, t, W, H) → void, called each frame in CSS pixels.
       opts:
         onResize(W,H)?  hook when the CSS box changes.
         background?     fill each frame (default COLORS.bgDeep, null = clear only).
         autostart=true  begin the loop from the constructor.
  */
  constructor(canvas, render, opts = {}) {
    this.canvas = canvas;
    this.render = render;
    this.opts = opts;
    this.ctx = canvas.getContext('2d');
    this.bg = opts.background === undefined ? COLORS.bgDeep : opts.background;

    this._W = 0;
    this._H = 0;
    this._running = false;
    this._raf = 0;
    this._t0 = 0;
    this._tPrev = 0;

    this._onWinResize = () => this.resize();
    window.addEventListener('resize', this._onWinResize, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
    }
    this.resize();

    if (opts.autostart !== false && !REDUCED_MOTION) this.start();
    else this._renderStatic();
  }

  get width()  { return this._W; }
  get height() { return this._H; }

  /* Recompute the backing-store size from (CSS box × devicePixelRatio) and
     re-apply the DPR scaling on the context. Cheap no-op if nothing changed. */
  resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    // If layout hasn't happened yet, fall back to the width/height attrs so
    // the first paint isn't blank.
    const W = Math.max(1, Math.round(rect.width  || this.canvas.width  || 1));
    const H = Math.max(1, Math.round(rect.height || this.canvas.height || 1));
    if (W === this._W && H === this._H && this.canvas.width === W * dpr) return;

    this.canvas.width  = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width  = W + 'px';
    this.canvas.style.height = H + 'px';
    this._W = W;
    this._H = H;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.opts.onResize?.(W, H);

    // Keep the static frame in sync if we're not running (reduced motion, or
    // stopped by the IntersectionObserver).
    if (!this._running) this._renderStatic();
  }

  start() {
    if (this._running) return;
    if (REDUCED_MOTION) { this._renderStatic(); return; }
    this._running = true;
    this._t0 = performance.now();
    this._tPrev = this._t0;
    const step = (now) => {
      if (!this._running) return;
      const dt = Math.min(DT_CAP, (now - this._tPrev) / 1000);
      this._tPrev = now;
      const t = (now - this._t0) / 1000;
      this._frame(dt, t);
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onWinResize);
    this._ro?.disconnect();
  }

  _renderStatic() { this._frame(0, 0); }

  _frame(dt, t) {
    const { ctx, _W: W, _H: H } = this;
    if (this.bg) { ctx.fillStyle = this.bg; ctx.fillRect(0, 0, W, H); }
    else ctx.clearRect(0, 0, W, H);
    this.render(ctx, dt, t, W, H);
  }
}

/* mountStage — a Stage that only wakes when the canvas is on-screen.
   Uses IntersectionObserver so animations don't burn CPU off-screen; still
   respects prefers-reduced-motion (paints one static frame per visibility). */
export function mountStage(canvas, render, opts = {}) {
  const stage = new Stage(canvas, render, { ...opts, autostart: false });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) stage.start();
      else stage.stop();
    }
  }, { rootMargin: '0px', threshold: 0.01 });
  io.observe(canvas);
  return stage;
}
