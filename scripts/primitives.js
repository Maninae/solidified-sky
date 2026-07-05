/* primitives.js - the code-drawn art library. All draw functions live under
   scripts/primitives/ split by concern; this file re-exports them so callers
   can keep importing from ./primitives.js unchanged.

     shapes.js     - blob / superellipse / rounded-leaf paths (+ shared RNG
                     and the standard (scale, alpha, rot) opts helper).
     organelles.js - chloroplast, thylakoids, stroma, stoma, mesophyll cell,
                     leaf cross-section, tree, sun.
     molecules.js  - drawMolecule dispatch + every per-species drawer.

   Every draw function is stateless: self-contained save()/restore(), takes
   (ctx, x, y, opts) with x,y the CENTER in CSS px, and reads colors from
   tokens.js only. */

export * from './primitives/shapes.js';
export * from './primitives/organelles.js';
export * from './primitives/molecules.js';
