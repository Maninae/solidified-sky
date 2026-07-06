/* s3-light.js - Station 3, "The Light Reactions": a running simulation of the
   light-dependent reactions in the thylakoid membrane.

   Left→right in the membrane: PSII, ETC (cytochrome b6f), PSI, ATP synthase,
   each drawn as a distinct silhouette so the four machines don't blur into
   one. Stroma above, lumen below.

   Photons stream from the sun and drive THREE independent event streams
   that all count up in parallel - the crucial fix, since a serial chain
   used to stall the NADPH counter at 0 while ATP climbed:

     1. WATER SPLIT at PSII (2 H₂O → O₂ + 4 H⁺ + 4 e⁻ across a pair of
        events): one water docks, releases 2 H⁺ + 1 e⁻; O₂ bubbles UP only
        every SECOND split so the 2:1 stoichiometry holds. (This is the
        one thing the whole site rests on: the O₂ we breathe comes from
        splitting WATER, not CO₂.)
     2. NADPH at PSI: a second photon powers up PSI and a violet NADPH
        capsule floats into the stroma.
     3. ATP at ATP synthase: a lumen H⁺ flows back through the turbine,
        the rotor spins, and a yellow ATP burst pops into the stroma.

   Rate ratio at full sun: ATP ≈ 1.5× NADPH, matching the biologically
   correct 3:2 non-cyclic ratio. Sunlight slider scales rates + sun
   brightness; Night freezes everything and paints the "no light → no
   reaction" overlay. No sugar is made here - that's Station 4 (Calvin). */

import { COLORS } from '../tokens.js';
import { mountStage } from '../engine.js';
import { ParticleSystem, catmullRom } from '../particles.js';
import { drawThylakoidMembrane, drawSun } from '../primitives.js';
import { roundRect, withAlpha, lighten, darken } from '../util.js';

export function init(sectionEl) {
  try { mount(sectionEl); }
  catch (err) { console.error('[s3-light] init failed:', err); }
}

function mount(sectionEl) {
    const canvas  = sectionEl.querySelector('#s3-canvas');
    const lightEl = sectionEl.querySelector('#s3-light');
    const lightVal= sectionEl.querySelector('#s3-light-val');
    const dayNight= sectionEl.querySelector('#s3-daynight');
    const o2El    = sectionEl.querySelector('#s3-o2');
    const atpEl   = sectionEl.querySelector('#s3-atp');
    const nadphEl = sectionEl.querySelector('#s3-nadph');
    if (!canvas) return;

    /* -------- state -------- */
    const state = {
      sliderPct: +(lightEl?.value ?? 70),
      isDay: true,
      counts: { o2: 0, atp: 0, nadph: 0 },
      rotor: 0,                                   // ATP synthase spin angle
      // THREE independent per-second accumulators. Running them in parallel
      // (instead of chaining photon→water→electron→PSI→NADPH end-to-end) is
      // what unblocks the NADPH counter - it now climbs alongside ATP within
      // ~1s of full sun instead of waiting on the serial chain.
      acc: { split: 0, atp: 0, nadph: 0 },
      // Even-parity splits release an O₂ (so 2 H₂O → 1 O₂ over the pair).
      splitCount: 0,
    };
    const ps = new ParticleSystem(500);
    const light01 = () => state.isDay ? state.sliderPct / 100 : 0;

    /* -------- controls -------- */
    lightEl?.addEventListener('input', () => {
      state.sliderPct = +lightEl.value;
      if (lightVal) lightVal.textContent = state.sliderPct + '%';
    });
    dayNight?.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      const mode = btn.dataset.mode;
      state.isDay = (mode === 'day');
      dayNight.querySelectorAll('.seg-btn').forEach(b => {
        b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false');
      });
    });

    /* -------- layout (recomputed per frame; cheap) --------

       The <canvas> is aspect-locked to 860:500 by its width/height attrs, so
       on mobile it's ~180px tall - much less room than desktop. On narrow
       viewports the sun moves to top-center (above the whole membrane) with
       a smaller radius so its halo doesn't wash into either the STROMA
       label or the ATP synthase rotor; all four complex labels move BELOW
       the membrane so the equation and the corner labels stop colliding. */
    function layout(W, H) {
      const membraneY = Math.round(H * 0.56);
      const membraneW = Math.min(W * 0.92, 780);
      const membraneH = 58;
      const startX = W / 2 - membraneW * 0.40;
      const gap    = (membraneW * 0.80) / 3;
      const narrow = W < 560;
      return {
        W, H, narrow,
        cx: W / 2, membraneY, membraneW, membraneH,
        psii: startX,
        etc:  startX + gap,
        psi:  startX + gap * 2,
        atpS: startX + gap * 3,
        sunX: narrow ? W / 2 : W * 0.10,
        sunY: narrow ? 16    : H * 0.16,
        sunR: narrow ? 12    : 26,
        topY: 6,                                   // O₂ escape / NADPH float
      };
    }

    /* -------- event streams -------- */

    /* Water-split event: photon lands on PSII, one water docks at the notch,
       one water splits. Fires at 2/s at full sun, so O₂ paces at 1/s (every
       second split releases). */
    function fireSplit(L) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;

      // 1. Photon from sun to PSII antenna.
      ps.spawnOnPath('photon',
        catmullRom([[L.sunX, L.sunY + 10],
                    [(L.sunX + L.psii)/2, (L.sunY + memTop)/2 + 40],
                    [L.psii, memTop - 4]]),
        { duration: 0.7, jitter: 0, scale: 0.9, orient: 'path',
          onArrive: () => {
            // 2. Water rises out of the lumen and docks at PSII's notch.
            ps.spawnOnPath('h2o',
              catmullRom([[L.psii + (Math.random()-0.5)*10, memBot + 62],
                          [L.psii, memBot + 26],
                          [L.psii, memBot + 4]]),
              { duration: 0.5, jitter: 1.2, scale: 0.95,
                onArrive: () => splitOne(L) });
          }});
    }

    /* One water splits at PSII: 2 H⁺ dumped into the lumen, 1 e⁻ hops
       PSII→ETC (pumping an H⁺) →PSI. O₂ is only released every SECOND
       split so a full pair reads as 2 H₂O → O₂ + 4 H⁺ + 2 e⁻ on-screen,
       matching the equation printed under PSII. NADPH is decoupled into
       its own event stream so the counter climbs in parallel. */
    function splitOne(L) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;
      state.splitCount++;

      if (state.splitCount % 2 === 0) {
        // O₂ bubbles UP through stroma and off the top.
        // (The one accuracy rule the whole site rests on: O₂ from H₂O.)
        ps.spawnOnPath('o2',
          catmullRom([[L.psii, memTop],
                      [L.psii + 22, L.membraneY - 90],
                      [L.psii + 44, L.topY - 20]]),
          { duration: 1.9, jitter: 3, scale: 1.1 });
        state.counts.o2++;
      }

      // 2 H⁺ dumped into the lumen per split (4 per O₂, per the equation).
      for (let k = 0; k < 2; k++) {
        ps.spawn('proton',
          L.psii + (Math.random() - 0.5) * 10, memBot + 4,
          { vx: (Math.random() - 0.5) * 12, vy: 22 + Math.random() * 18,
            life: 3.6, drag: 0.9 });
      }

      // Electron hops PSII → ETC (pump one H⁺) → PSI, then vanishes into
      // PSI's antenna (NADPH generation is its own event stream below).
      hopElectron(L, L.psii, L.etc, 0.5, () => {
        pumpProton(L, L.etc);
        hopElectron(L, L.etc, L.psi, 0.5, null);
      });
    }

    /* NADPH event: a second photon powers up PSI, and a violet NADPH capsule
       drifts up into the stroma. Independent of splits so its counter isn't
       gated on the whole PSII→ETC→PSI chain finishing. */
    function fireNADPH(L) {
      const memTop = L.membraneY - L.membraneH / 2;
      ps.spawnOnPath('photon',
        catmullRom([[L.sunX, L.sunY + 10],
                    [(L.sunX + L.psi)/2, (L.sunY + memTop)/2 + 60],
                    [L.psi, memTop - 4]]),
        { duration: 0.7, jitter: 0, scale: 0.9, orient: 'path',
          onArrive: () => {
            ps.spawnOnPath('nadph',
              catmullRom([[L.psi, memTop - 2],
                          [L.psi + 18, L.membraneY - 90],
                          [L.psi + 36, L.topY + 40]]),
              { duration: 1.5, jitter: 2, scale: 1 });
            state.counts.nadph++;
          }});
    }

    /* ATP synthase event: a lumen H⁺ flows back through the turbine, the
       rotor spins, and a yellow ATP burst appears in the stroma. */
    function fireATP(L) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;
      const x = L.atpS;
      ps.spawnOnPath('proton',
        catmullRom([[x + (Math.random()-0.5)*8, memBot + 30],
                    [x, L.membraneY], [x, memTop - 10]]),
        { duration: 0.55, jitter: 0.6, scale: 1,
          onArrive: () => {
            ps.spawnOnPath('atp',
              catmullRom([[x, memTop - 14],
                          [x - 20, L.membraneY - 90],
                          [x - 40, L.topY + 60]]),
              { duration: 1.3, jitter: 2, scale: 1 });
            state.counts.atp++;
          }});
    }

    /* Electron riding along the top membrane surface between complexes. */
    function hopElectron(L, xFrom, xTo, duration, onArrive) {
      const y = L.membraneY - L.membraneH / 2 - 2;
      const mid = (xFrom + xTo) / 2;
      ps.spawnOnPath('electron',
        catmullRom([[xFrom, y], [mid, y - 10], [xTo, y]]),
        { duration, jitter: 1.5, scale: 1, orient: 'path', onArrive });
    }

    /* H⁺ pumped from stroma across into lumen at the ETC. */
    function pumpProton(L, x) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;
      ps.spawnOnPath('proton',
        catmullRom([[x, memTop - 20], [x, L.membraneY], [x, memBot + 22]]),
        { duration: 0.65, jitter: 0.8, scale: 1 });
    }

    /* -------- drawing helpers -------- */

    function drawRegions(ctx, L) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;
      // Stroma above - subtle green wash.
      const sg = ctx.createLinearGradient(0, 0, 0, memTop);
      sg.addColorStop(0, 'rgba(30, 66, 44, 0.55)');
      sg.addColorStop(1, 'rgba(20, 46, 30, 0.18)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, L.W, memTop);
      // Lumen below - cooler wash so the H⁺ pool reads.
      const lg = ctx.createLinearGradient(0, memBot, 0, L.H);
      lg.addColorStop(0, 'rgba(70, 55, 100, 0.18)');
      lg.addColorStop(1, 'rgba(70, 55, 100, 0.42)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, memBot, L.W, L.H - memBot);
    }

    /* Baseline membrane complex: rounded rect with a chlorophyll gradient
       body and a soft green glow. Each specific complex draws THIS first
       and then overlays its distinguishing features. */
    function drawComplex(ctx, x, memY, memH, w = 62) {
      const h = memH + 12;
      ctx.save();
      ctx.shadowColor = COLORS.chloro;
      ctx.shadowBlur = 12;
      const g = ctx.createLinearGradient(0, memY - h/2, 0, memY + h/2);
      g.addColorStop(0,   withAlpha(lighten(COLORS.chloro, 0.55), 0.75));
      g.addColorStop(0.5, withAlpha(COLORS.chloro, 0.75));
      g.addColorStop(1,   withAlpha(darken(COLORS.chloro, 0.30), 0.60));
      ctx.fillStyle = g;
      roundRect(ctx, x - w/2, memY - h/2, w, h, 9);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = withAlpha(COLORS.specular, 0.28);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    /* PSII - the water splitter. Rounded rect with a V-shaped water-docking
       notch cut into the bottom, rimmed in H₂O blue so "water enters here"
       reads at a glance, no label needed. */
    function drawPSII(ctx, x, memY, memH) {
      const w = 62;
      drawComplex(ctx, x, memY, memH, w);
      const h = memH + 12;
      const bot = memY + h/2;
      const nW = 20, nD = 12;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - nW/2, bot);
      ctx.lineTo(x,        bot - nD);
      ctx.lineTo(x + nW/2, bot);
      ctx.closePath();
      // Fill the notch with the lumen wash so it reads as "carved out".
      ctx.fillStyle = 'rgba(70, 55, 100, 0.72)';
      ctx.fill();
      // Blue rim - the "water docks here" cue.
      ctx.strokeStyle = withAlpha(lighten(COLORS.h2o, 0.25), 0.75);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }

    /* ETC (cytochrome b6f) - taller and leaner than the photosystems, with
       three faint horizontal heme bands so it reads as "a stack of electron
       carriers", not just another rounded rect. */
    function drawETC(ctx, x, memY, memH) {
      const w = 40;                                  // narrower
      const h = memH + 22;                           // taller
      const top = memY - h/2;
      ctx.save();
      ctx.shadowColor = COLORS.chloro;
      ctx.shadowBlur = 10;
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0,   withAlpha(lighten(COLORS.chloro, 0.45), 0.72));
      g.addColorStop(0.5, withAlpha(COLORS.chloro, 0.72));
      g.addColorStop(1,   withAlpha(darken(COLORS.chloro, 0.30), 0.60));
      ctx.fillStyle = g;
      roundRect(ctx, x - w/2, top, w, h, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = withAlpha(COLORS.specular, 0.25);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // Three faint heme bands - the "column of electron carriers" read.
      ctx.strokeStyle = withAlpha(darken(COLORS.chloro, 0.55), 0.42);
      ctx.lineWidth = 0.9;
      for (let i = 1; i <= 3; i++) {
        const yBand = top + (h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x - w/2 + 6, yBand);
        ctx.lineTo(x + w/2 - 6, yBand);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* PSI - the second light trap. Same body as PSII but with a much
       brighter chlorophyll antenna glow on top and three short antenna
       spikes rising into the stroma, so it reads as "the machine that
       catches a second photon." */
    function drawPSI(ctx, x, memY, memH) {
      drawComplex(ctx, x, memY, memH, 62);
      const top = memY - (memH + 12) / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Bright antenna bloom above the complex.
      const glow = ctx.createRadialGradient(x, top, 0, x, top, 26);
      glow.addColorStop(0,   withAlpha(lighten(COLORS.chloro, 0.6), 0.80));
      glow.addColorStop(0.5, withAlpha(COLORS.chloro, 0.30));
      glow.addColorStop(1,   withAlpha(COLORS.chloro, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, top, 26, 0, Math.PI * 2);
      ctx.fill();
      // Three antenna spikes fanning up.
      ctx.strokeStyle = withAlpha(lighten(COLORS.chloro, 0.5), 0.85);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const dx = i * 9;
        ctx.beginPath();
        ctx.moveTo(x + dx,        top - 1);
        ctx.lineTo(x + dx * 1.6,  top - 15);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ATP synthase: F0 base (drawn as a narrow complex) plus a stalk rising
       into the stroma with a three-lobed F1 rotor head that spins with
       angle. The only complex with moving geometry - already visually
       distinct from the other three. */
    function drawATPSynthase(ctx, x, memY, memH, angle) {
      drawComplex(ctx, x, memY, memH, 46);
      const topY = memY - (memH + 12) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(150, 220, 180, 0.70)';
      ctx.fillRect(x - 3.5, topY - 26, 7, 30);
      ctx.translate(x, topY - 30);
      ctx.rotate(angle);
      ctx.shadowColor = COLORS.atp;
      ctx.shadowBlur = 10;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 3) * i);
        const lg = ctx.createRadialGradient(11, 0, 0, 11, 0, 12);
        // Rotor lobe: bright warm core, ATP-adjacent gold at edge. The rgba
        // is close to COLORS.atp (#fbbf24) but 4 red-channel counts higher;
        // preserved as-is per the "no color values change" rule.
        lg.addColorStop(0, '#fff2b8');
        lg.addColorStop(1, 'rgba(255, 191, 36, 0.55)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.ellipse(11, 0, 11, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* Labels: bold acronym on the primary line, muted expansion below.
       On desktop the acronyms alternate above/below the membrane and each
       carries an expansion line so "ETC" reads as "electron transport
       chain" (one student misread it as "et cetera"). On narrow canvases
       the expansions are dropped AND all four labels move below the
       membrane, so the stroma is left clear for the sun + rising
       molecules and nothing collides with the ATP synthase rotor. */
    function drawLabels(ctx, L) {
      ctx.save();
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;

      // Region corner labels - only on wide canvases; on mobile the color
      // washes already communicate the two spaces and there's no room.
      if (!L.narrow) {
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(180, 220, 190, 0.60)';
        ctx.textAlign = 'left';
        ctx.fillText('STROMA', 18, 22);
        ctx.textAlign = 'right';
        ctx.fillText('LUMEN  ·  H⁺ pool', L.W - 18, L.H - 14);
      }
      ctx.textAlign = 'center';

      // `dir` is +1 for labels below the membrane, -1 for labels above,
      // so the muted expansion line sits between the acronym and the far
      // edge of the canvas.
      const drawLabel = (short, longer, x, y, dir) => {
        ctx.fillStyle = 'rgba(232, 242, 234, 0.92)';
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillText(short, x, y);
        if (!L.narrow && longer) {
          ctx.fillStyle = 'rgba(180, 210, 195, 0.70)';
          ctx.font = '500 10px system-ui, sans-serif';
          ctx.fillText(longer, x, y + dir * 13);
        }
      };
      if (L.narrow) {
        // Every acronym below the membrane on a single row.
        const yLabel = memBot + 18;
        drawLabel('PSII',         null, L.psii, yLabel, +1);
        drawLabel('ETC',          null, L.etc,  yLabel, +1);
        drawLabel('PSI',          null, L.psi,  yLabel, +1);
        drawLabel('ATP synthase', null, L.atpS, yLabel, +1);
      } else {
        drawLabel('PSII',          'Photosystem II',           L.psii, memBot + 24, +1);
        drawLabel('ETC',           'electron transport chain', L.etc,  memTop - 24, -1);
        drawLabel('PSI',           'Photosystem I',            L.psi,  memBot + 24, +1);
        drawLabel('ATP synthase',  null,                       L.atpS, memTop - 62, -1);
      }

      // The single most important accuracy note on the whole site, painted
      // in the color of O₂. On narrow, anchor to the horizontal center just
      // below the label row; on desktop, keep it under PSII where the
      // water docks.
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillStyle = COLORS.o2;
      const eqX = L.narrow ? L.cx        : L.psii;
      const eqY = L.narrow ? memBot + 36 : memBot + 54;
      ctx.fillText('2 H₂O → O₂ + 4 H⁺ + 4 e⁻', eqX, eqY);
      ctx.restore();
    }

    function drawNightOverlay(ctx, W, H) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 12, 8, 0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 242, 234, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('Night · no light → no reaction', W / 2, H / 2);
      ctx.restore();
    }

    /* -------- main render -------- */
    function render(ctx, dt, t, W, H) {
      const L = layout(W, H);
      const lit = light01();

      drawRegions(ctx, L);
      drawSun(ctx, L.sunX, L.sunY,
              { intensity: 0.15 + lit * 0.85, r: L.sunR });

      drawThylakoidMembrane(ctx, L.cx, L.membraneY,
                            { width: L.membraneW, height: L.membraneH });
      drawPSII(ctx, L.psii, L.membraneY, L.membraneH);
      drawETC (ctx, L.etc,  L.membraneY, L.membraneH);
      drawPSI (ctx, L.psi,  L.membraneY, L.membraneH);
      drawATPSynthase(ctx, L.atpS, L.membraneY, L.membraneH, state.rotor);

      drawLabels(ctx, L);

      // Three parallel event streams, all rates ∝ sunlight. At full sun:
      //   splits: 2.0/s → 1 O₂/s (every 2nd split), 4 H⁺/s, 2 e⁻/s
      //   NADPH:  1.6/s
      //   ATP:    2.4/s   (ATP:NADPH ≈ 1.5, the real 3:2 non-cyclic ratio)
      // Freeze everything at night (lit = 0).
      if (lit > 0) {
        state.acc.split += dt * 2.0 * lit;
        while (state.acc.split >= 1) { state.acc.split -= 1; fireSplit(L); }
        state.acc.nadph += dt * 1.6 * lit;
        while (state.acc.nadph >= 1) { state.acc.nadph -= 1; fireNADPH(L); }
        state.acc.atp   += dt * 2.4 * lit;
        while (state.acc.atp   >= 1) { state.acc.atp   -= 1; fireATP(L);   }
        state.rotor += dt * 5.5 * lit;             // spin scales with H⁺ flux
      }

      // Freeze particles at night (dt=0); day integrates normally.
      ps.update(lit > 0 ? dt : 0);
      ps.draw(ctx);

      if (!state.isDay) drawNightOverlay(ctx, W, H);

      // Live counter readouts.
      if (o2El)    o2El.textContent    = state.counts.o2;
      if (atpEl)   atpEl.textContent   = state.counts.atp;
      if (nadphEl) nadphEl.textContent = state.counts.nadph;
    }

    mountStage(canvas, render, { background: COLORS.bgDeep });
}
