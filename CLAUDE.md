# Solidified Sky

An immersive, always-running photosynthesis explainer. A single scrolling page
carries the reader from "a tree is made of air" down into a living chloroplast
and through both stages of photosynthesis while everything animates in real
time. **All art is drawn in code** (Canvas 2D + SVG) - no images, no AI raster.

Live target: `maninae.github.io/solidified-sky`. Science sibling to **Valence**
(same dark-glow design language). Vanilla JS ES modules, no build step, no
framework. Serve with `python3 -m http.server` for dev; GitHub Pages from
`main` root for prod.

## Audience & voice

Bright kids ~9-13 (middle-school leaning), engaging for curious adults too.

- Name real machinery (Photosystem II, rubisco, G3P, ATP synthase) but put the
  deep nuance in `.gloss` popups and `<details class="collapsible">` deep-dives.
- **Accuracy is the whole point.** The #1 rule: **O₂ comes from splitting
  water, never from CO₂.** The carbon of CO₂ goes into sugar. Never violate this.
- Narrative but lean, like Valence: cause-and-effect prose, every "therefore"
  earns its "because." No hook questions ("Ever wondered...?"). Declarative
  openers. Spaced hyphens " - " in prose, never em-dashes.
- Less telling, more seeing: the interactives are the spine, prose is connective
  tissue. If a paragraph could be a manipulable thing, it should be.

## The Molecule Color Law (most important rule on the site)

Every species has ONE fixed color, used everywhere it appears - canvas
particles, prose (`.m-*` classes), legend, equation. This is pedagogy, not
decoration. Source of truth: `styles/base.css :root` and `scripts/tokens.js`
(`COLORS`, `MOLECULES`). Keep the two in sync. Never hardcode a hex in a
renderer - import from `tokens.js`.

| Species | Color | Token |
|---|---|---|
| CO₂ | red | `--co2` / `COLORS.co2` |
| H₂O | blue | `--h2o` |
| O₂ | orange | `--o2` |
| ATP | yellow | `--atp` |
| NADPH | violet | `--nadph` |
| glucose / G3P | brown | `--sugar` |
| light (photon) | gold | `--photon` |
| electron | cyan | `--electron` |
| H⁺ proton | pale pink | `--proton` |
| chlorophyll | green | `--chloro` |
| rubisco | teal | `--rubisco` |

## Architecture

```
index.html              the whole page: hero + 7 station <section>s + prose (authored, fixed)
styles/base.css         tokens + molecule color law + reusable components (fixed)
styles/stations.css     page shell: sidebar, hero, station rhythm, responsive (fixed)
scripts/
  tokens.js             COLORS, MOLECULES, EQUATION, spectrum data, helpers (fixed contract)
  primitives.js         the draw* library - organic shapes + every molecule/organelle
  particles.js          pooled Float32Array particle engine + Bézier path flows + sprite atlas
  engine.js             Stage: DPR canvas sizing, rAF loop w/ dt cap, IntersectionObserver wake
  glossary.js           click-to-open .gloss popups (reads data-* attrs)
  main.js               boot: scrollspy sidebar, progress bar, hero ambient, mounts each station
  stations/
    s0-air.js   s1-zoom.js   s2-chloroplast.js   s3-light.js
    s4-calvin.js  s5-daynight.js  s6-green.js
```

Dependencies flow one way: `station module → engine + particles + primitives →
tokens`. Each module ≤ ~300 lines, one responsibility. State lives in the
station's controller closure/object; primitive & particle functions are
stateless (receive ctx + args).

---

## CONTRACT: module APIs (build exactly to these signatures)

### `engine.js`
```js
// Wraps one <canvas>. Handles devicePixelRatio sizing, the rAF loop with a
// delta-time cap, and pausing when the canvas scrolls off-screen (IntersectionObserver).
export class Stage {
  // canvas: HTMLCanvasElement
  // render(ctx, dt, t, W, H): called each frame. dt seconds (capped ≤ 1/30),
  //   t = seconds since start, W/H = CSS pixels (ctx already scaled for DPR).
  // opts: { onResize(W,H)?, background?: string|null (fill each frame; default bgDeep), autostart=true }
  constructor(canvas, render, opts = {})
  start()               // begin the loop (also called on scroll-into-view)
  stop()                // pause
  resize()              // recompute size from CSS box × DPR
  get width()  // CSS px
  get height() // CSS px
}
// Convenience: mount a Stage that only wakes when visible.
export function mountStage(canvas, render, opts) // returns Stage
```
Requirements: size the backing store to `cssSize * devicePixelRatio` and
`ctx.scale(dpr,dpr)` so render() works in CSS pixels. Re-size on window resize
and when the canvas's box changes. Use IntersectionObserver to `start()` on
enter and `stop()` on exit (perf: no off-screen animation). Respect
`prefers-reduced-motion` by rendering a single static frame if set.

### `primitives.js`
All draw functions: stateless, self-contained `ctx.save()/restore()`, take
`(ctx, x, y, opts)` where `x,y` is the CENTER in CSS px and `opts` may include
`{ scale=1, alpha=1, rot=0, glow=true }`. Colors come from `tokens.js` - never
hardcode. Keep shapes SCHEMATIC and readable at small size.

```js
// ---- organic shape helpers ----
export function blobPath(cx, cy, r0, { harmonics=3, amp=0.12, seed=1, points=48 }) // -> Path2D, wobbly closed blob
export function superellipsePath(cx, cy, a, b, n=2.6)                              // -> Path2D
export function roundedLeafPath(cx, cy, w, h)                                      // -> Path2D, a leaf silhouette

// ---- organelles / structures (schematic, layered translucent fills + glow) ----
export function drawChloroplast(ctx, x, y, opts)      // green lozenge, double envelope, grana inside
export function drawThylakoidStack(ctx, x, y, opts)   // a granum: stack of flat discs
export function drawThylakoidMembrane(ctx, x, y, opts){/* a wide membrane band for station 3 */}
export function drawStroma(ctx, x, y, opts)           // fluid fill region (subtle grain)
export function drawStoma(ctx, x, y, opts)            // pore + two guard cells; opts.openness 0..1
export function drawLeafCell(ctx, x, y, opts)         // a mesophyll cell w/ chloroplasts inside
export function drawLeafCrossSection(ctx, x, y, opts) // cuticle/palisade/spongy/stoma layers
export function drawTree(ctx, x, y, opts)             // simple code-drawn tree silhouette
export function drawSun(ctx, x, y, opts)              // glowing sun disc (opts.intensity 0..1)

// ---- molecules (consume MOLECULES specs; identical everywhere) ----
export function drawMolecule(ctx, type, x, y, opts)   // dispatch on MOLECULES key: 'co2','h2o','o2','atp','nadph','glucose','g3p','photon','electron','proton','carbon'
// (drawMolecule is the single entry point stations use for any species.)
```
`drawMolecule` must render each species per its `MOLECULES[type]` spec: ball
schematics for co2/h2o/o2, a burst for atp, capsule for nadph, hexagon for
glucose, a gold streak for photon, glowing dot+trail for electron, tiny dot for
proton, a bright ring-tagged atom for carbon. Add additive glow when
`opts.glow`. Pre-nothing here; particles.js handles sprite caching.

### `particles.js`
```js
// Data-oriented pooled particle system. Never `new` inside the loop.
export class ParticleSystem {
  constructor(capacity = 900)
  // Spawn a free-floating particle. Returns id (or -1 if pool full).
  spawn(type, x, y, { vx=0, vy=0, life=Infinity, scale=1, drag=0.0 } = {})
  // Spawn a particle that rides a path over `duration` seconds, then dies.
  // path: (t)=>[x,y] for t in [0,1], OR an array of [x,y] control points (Catmull-Rom).
  // onArrive?: callback(id) when it reaches t=1. jitter: perpendicular wobble px.
  spawnOnPath(type, path, { duration=2, jitter=3, scale=1, onArrive=null } = {})
  update(dt)                       // integrate motion, age out finished/dead
  draw(ctx)                        // drawImage from the cached sprite atlas
  clear()
  get count()
  // helper to build a smooth path fn from control points:
}
export function catmullRom(points) // -> (t)=>[x,y]
export function bezierPath(p0,p1,p2,p3) // -> (t)=>[x,y]
```
Pre-render each species once to an offscreen canvas sprite (via
`drawMolecule`) at construct time; the draw loop only does `drawImage`. Use
`requestAnimationFrame` deltas from the Stage (particles.update(dt) is called by
the station's render fn, not its own loop). Target 800+ particles at 60fps,
30fps floor on mobile.

### `glossary.js`
```js
export function initGlossary(root = document) // wire every .gloss in root
```
Each `.gloss` element carries `data-title`, `data-body`, `data-link`,
`data-linktext`. On click (and focus), open a `.gloss-pop` positioned near the
term (flip if it would overflow viewport), containing `<h5>title</h5><p>body</p>`
and a `<a target="_blank" rel="noopener">linktext ↗</a>`. Close on outside
click / Esc. Keyboard accessible (make `.gloss` focusable, `tabindex=0`).

### Station module interface
Each `stations/sN-*.js` default-exports (or named-exports `init`) a function:
```js
export function init(sectionEl) { /* query canvas + controls WITHIN sectionEl, wire Stage */ }
```
`main.js` imports all seven and calls `init(document.getElementById('sN'))`
when that section first scrolls near view. A station must not touch global DOM
outside its `sectionEl` (except `document`-level for pointer math).

### `main.js` responsibilities
- Build the colored hero equation into `#hero-equation` from `EQUATION`.
- Hero ambient: a `Stage` on `#hero-canvas` with drifting photons + faint
  molecules over a dark radial (uses ParticleSystem + drawMolecule).
- Progress bar `#progress` width = scroll fraction.
- Scrollspy: highlight the `.toc a` whose `data-target` section is in view
  (IntersectionObserver). Smooth-scroll on click.
- Mobile `#menuToggle` toggles `.sidebar.open`; close on nav click.
- `initGlossary(document)`.
- Lazily `init()` each station when near viewport (IntersectionObserver,
  rootMargin ~200px) so we don't build all canvases at once.

---

## DOM contract (fixed in index.html - build JS to these IDs)

| Station | canvas | key controls | readouts |
|---|---|---|---|
| s0 air | `#s0-canvas` | `#s0-soil` (range 0-100), `#s0-soil-val`, `#s0-reveal` (btn) | `#s0-readout` |
| s1 zoom | `#s1-canvas` | `#s1-zoom` (range 0-1000), `#s1-zoom-val` | `#s1-readout` |
| s2 chloroplast | `#s2-canvas` | `#s2-tour` (btn), `#s2-reset` (btn) | `#s2-readout` |
| s3 light | `#s3-canvas` | `#s3-light` (range 0-100), `#s3-light-val`, `#s3-daynight` (seg w/ `[data-mode]`) | `#s3-o2`,`#s3-atp`,`#s3-nadph` |
| s4 calvin | `#s4-canvas` | `#s4-ride` (btn), `#s4-reset` (btn), `#s4-speed` (range 50-200), `#s4-speed-val` | `#s4-readout` |
| s5 daynight | `#s5-canvas` | `#s5-time` (range 0-1440 min), `#s5-time-val` | `#s5-o2`,`#s5-co2`,`#s5-state` |
| s6 green | `#s6-canvas` | `#s6-wavelength` (range 400-700), `#s6-wl-val` | `#s6-readout` |

Canvases have `width`/`height` attrs as a hint; the Stage overrides them for
DPR. Draw in CSS pixels using `stage.width/height`.

## Canvas rules (hard requirements, from Valence)
- Cap visual width (~900px), center. Never stretch to an uncapped container.
- Labels never overlap each other or hide behind art. Stagger/offset.
- Size for devicePixelRatio (crisp on retina) - the Stage handles this.
- Dark-canvas palette: background `--bg-deep` or transparent; strokes from
  tokens; glow via `shadowBlur` / `globalCompositeOperation='lighter'`, used
  purposefully, reset after.
- Every interactive degrades: if JS throws, the panel still shows title/hint.
- Verify BOTH mobile (360px) and desktop before calling a station done.

## Checklist when touching a station
1. Colors only from `tokens.js`. Molecule color law respected.
2. Canvas centered, DPR-scaled (via Stage), labels non-overlapping.
3. Controls wired; readouts update live.
4. Pauses when off-screen; honors reduced-motion.
5. Mobile pass at 360px; desktop pass. No console errors.
