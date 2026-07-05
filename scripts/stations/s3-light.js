/* s3-light.js - Station 3, "The Light Reactions": a running simulation of the
   light-dependent reactions in the thylakoid membrane.

   Left→right in the membrane: PSII, ETC (cytochrome), PSI, ATP synthase.
   Stroma above, lumen below. Photons stream from the sun and drive:
     1. water enters PSII from the lumen and splits (2 H₂O → O₂ + 4 H⁺ + 4 e⁻)
        - O₂ bubbles UP and away (this is where the O₂ we breathe comes from,
          NOT from CO₂ - the whole site rests on this fact)
        - H⁺ dumps into the lumen
        - electrons hop PSII → ETC → PSI along the membrane
     2. ETC pumps additional H⁺ from stroma into lumen as electrons pass
     3. a second photon at PSI re-energizes the electron, which becomes NADPH
        released into the stroma
     4. ATP synthase (a real rotary turbine) lets H⁺ flow lumen → stroma,
        producing ATP into the stroma; the rotor visibly spins.
   Sunlight slider scales every rate + sun brightness; Night freezes everything.
   No sugar is made here - that's the next station (Calvin cycle). */

import { COLORS } from '../tokens.js';
import { mountStage } from '../engine.js';
import { ParticleSystem, catmullRom } from '../particles.js';
import { drawThylakoidMembrane, drawSun } from '../primitives.js';
import { roundRect, withAlpha } from '../util.js';

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
      acc: { chain: 0, atp: 0 },                  // event accumulators (per sec)
    };
    const ps = new ParticleSystem(400);
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

    /* -------- layout (recomputed per frame; cheap) -------- */
    function layout(W, H) {
      const membraneY = Math.round(H * 0.56);
      const membraneW = Math.min(W * 0.92, 780);
      const membraneH = 58;
      const startX = W / 2 - membraneW * 0.40;
      const gap    = (membraneW * 0.80) / 3;
      return {
        W, H,
        cx: W / 2, membraneY, membraneW, membraneH,
        psii: startX,
        etc:  startX + gap,
        psi:  startX + gap * 2,
        atpS: startX + gap * 3,
        sunX: W * 0.10,
        sunY: H * 0.16,
        topY: 6,                                   // O₂ escape / NADPH float
      };
    }

    /* -------- one full "water→NADPH" event chain -------- */
    function fireChain(L) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;

      // 1. Photon from sun to PSII (top of membrane).
      ps.spawnOnPath('photon',
        catmullRom([[L.sunX + 18, L.sunY + 18],
                    [(L.sunX + L.psii)/2, L.sunY + 60],
                    [L.psii, memTop - 4]]),
        { duration: 0.7, jitter: 0, scale: 0.9, orient: 'path',
          onArrive: () => {
            // 2. Water enters PSII from below (from the lumen).
            ps.spawnOnPath('h2o',
              catmullRom([[L.psii + (Math.random()-0.5)*10, memBot + 60],
                          [L.psii, memBot + 24],
                          [L.psii, memBot + 2]]),
              { duration: 0.5, jitter: 1.2, scale: 0.95,
                onArrive: () => splitWater(L) });
          }});
    }

    /* Water splitting at PSII: emit O₂ upward and 2 H⁺ into the lumen,
       and eject an electron that hops PSII → ETC → PSI. */
    function splitWater(L) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;

      // O₂ bubbles UP through stroma and off the top of the canvas.
      // (Accuracy note: the O₂ we breathe comes from splitting WATER, not CO₂.)
      ps.spawnOnPath('o2',
        catmullRom([[L.psii, memTop],
                    [L.psii + 22, L.membraneY - 90],
                    [L.psii + 44, L.topY - 20]]),
        { duration: 1.9, jitter: 3, scale: 1.1 });
      state.counts.o2++;

      // 2 H⁺ dumped into the lumen (contributes to the gradient).
      for (let k = 0; k < 2; k++) {
        ps.spawn('proton',
          L.psii + (Math.random() - 0.5) * 10, memBot + 4,
          { vx: (Math.random() - 0.5) * 12, vy: 22 + Math.random() * 18,
            life: 3.6, drag: 0.9 });
      }

      // Electron hops PSII → ETC along the top of the membrane.
      hopElectron(L, L.psii, L.etc, () => {
        // At ETC: pump one H⁺ from stroma down into the lumen.
        pumpProton(L, L.etc);
        // Continue: ETC → PSI.
        hopElectron(L, L.etc, L.psi, () => {
          // At PSI: a second photon re-energizes the electron.
          ps.spawnOnPath('photon',
            catmullRom([[L.sunX + 18, L.sunY + 18],
                        [(L.sunX + L.psi)/2, L.sunY + 90],
                        [L.psi, memTop - 4]]),
            { duration: 0.6, jitter: 0, scale: 0.9, orient: 'path',
              onArrive: () => {
                // NADPH is released into the stroma.
                ps.spawnOnPath('nadph',
                  catmullRom([[L.psi, memTop - 2],
                              [L.psi + 18, L.membraneY - 90],
                              [L.psi + 36, L.topY + 40]]),
                  { duration: 1.5, jitter: 2, scale: 1 });
                state.counts.nadph++;
              }});
        });
      });
    }

    /* Electron riding along the top membrane surface between complexes. */
    function hopElectron(L, xFrom, xTo, onArrive) {
      const y = L.membraneY - L.membraneH / 2 - 2;
      const mid = (xFrom + xTo) / 2;
      ps.spawnOnPath('electron',
        catmullRom([[xFrom, y], [mid, y - 10], [xTo, y]]),
        { duration: 0.55, jitter: 1.5, scale: 1, orient: 'path', onArrive });
    }

    /* H⁺ pumped from stroma across into lumen at the ETC complex. */
    function pumpProton(L, x) {
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;
      ps.spawnOnPath('proton',
        catmullRom([[x, memTop - 20], [x, L.membraneY], [x, memBot + 22]]),
        { duration: 0.65, jitter: 0.8, scale: 1 });
    }

    /* ATP synthase event: an H⁺ flows lumen → stroma through the turbine,
       releasing ATP into the stroma. */
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

    /* A membrane-embedded protein complex: rounded rectangle with a top-lit
       green gradient and a chlorophyll-green glow. */
    function drawComplex(ctx, x, memY, memH, w = 62) {
      const h = memH + 12;
      ctx.save();
      ctx.shadowColor = COLORS.chloro;
      ctx.shadowBlur = 12;
      const g = ctx.createLinearGradient(0, memY - h/2, 0, memY + h/2);
      g.addColorStop(0,   'rgba(160, 255, 195, 0.65)');   // bespoke light-chloro tint
      g.addColorStop(0.5, withAlpha(COLORS.chloro, 0.75));
      g.addColorStop(1,   'rgba(40, 170, 95, 0.60)');     // bespoke dark-chloro shade
      ctx.fillStyle = g;
      roundRect(ctx, x - w/2, memY - h/2, w, h, 9);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(220, 255, 230, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    /* ATP synthase: F0 base (drawn as a complex) plus a stalk rising into the
       stroma with a three-lobed F1 rotor head that spins with angle. */
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

    function drawLabels(ctx, L) {
      ctx.save();
      const memTop = L.membraneY - L.membraneH / 2;
      const memBot = L.membraneY + L.membraneH / 2;
      // Region labels - corners so they never collide with the scene.
      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(180, 220, 190, 0.60)';
      ctx.textAlign = 'left';
      ctx.fillText('STROMA', 18, 22);
      ctx.textAlign = 'right';
      ctx.fillText('LUMEN  ·  H⁺ pool', L.W - 18, L.H - 14);
      // Complex labels - alternate above / below the membrane so 4 labels fit.
      ctx.textAlign = 'center';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 242, 234, 0.92)';
      ctx.fillText('PSII',          L.psii, memBot + 22);
      ctx.fillText('ETC',           L.etc,  memTop - 12);
      ctx.fillText('PSI',           L.psi,  memBot + 22);
      ctx.fillText('ATP synthase',  L.atpS, memTop - 58);
      // The single most important accuracy note on the whole site,
      // painted right beneath PSII in the color of O₂.
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillStyle = COLORS.o2;
      ctx.fillText('2 H₂O → O₂ + 4 H⁺ + 4 e⁻', L.psii, memBot + 38);
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
      drawSun(ctx, L.sunX, L.sunY, { intensity: 0.15 + lit * 0.85, r: 26 });

      drawThylakoidMembrane(ctx, L.cx, L.membraneY,
                            { width: L.membraneW, height: L.membraneH });
      drawComplex(ctx, L.psii, L.membraneY, L.membraneH);
      drawComplex(ctx, L.etc,  L.membraneY, L.membraneH);
      drawComplex(ctx, L.psi,  L.membraneY, L.membraneH);
      drawATPSynthase(ctx, L.atpS, L.membraneY, L.membraneH, state.rotor);

      drawLabels(ctx, L);

      // Fire event chains and ATP events at rates proportional to sunlight.
      // At full sun: ~1.6 chains/sec, ~2.2 ATP flows/sec. Zero at night.
      if (lit > 0) {
        state.acc.chain += dt * 1.6 * lit;
        while (state.acc.chain >= 1) { state.acc.chain -= 1; fireChain(L); }
        state.acc.atp += dt * 2.2 * lit;
        while (state.acc.atp >= 1) { state.acc.atp -= 1; fireATP(L); }
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
