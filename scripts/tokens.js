/* tokens.js — the single source of truth for color and molecule identity in JS.
   Mirrors styles/base.css :root. If you change a color, change it in BOTH.

   THE MOLECULE COLOR LAW: every species has one fixed color, used wherever it
   is drawn. Import COLORS / MOLECULES here; never hardcode a hex in a renderer. */

export const COLORS = {
  bgDeep:    "#04100b",
  bgSurface: "#08170f",
  bgElevated:"#0e2016",
  bgHover:   "#143020",

  textPrimary:  "#e8f2ea",
  textSecondary:"#a6bcae",
  textMuted:    "#6a8377",

  accent:  "#4ade80",  // chlorophyll green
  accent2: "#ffd54a",  // sunlight gold

  // ---- the molecule color law ----
  co2:     "#f87171",  // red
  h2o:     "#60a5fa",  // blue
  o2:      "#fb923c",  // orange
  atp:     "#fbbf24",  // yellow
  nadph:   "#a78bfa",  // violet
  sugar:   "#d8a15e",  // warm brown (glucose / G3P)
  photon:  "#ffe066",  // gold
  electron:"#38e0d0",  // cyan
  proton:  "#f5b8d0",  // pale pink (H+)
  chloro:  "#4ade80",  // green
  rubisco: "#5eead4",  // teal (the enzyme)

  rule:       "rgba(150, 200, 170, 0.12)",
  ruleStrong: "rgba(150, 200, 170, 0.26)",
};

/* MOLECULES — canonical schematic spec for each species the primitive library
   draws. `atoms` is a list of {dx, dy, r, color} offsets (in "molecule units",
   roughly pixels at scale 1) describing the ball-and-stick schematic. `glow`
   is the additive halo color. Renderers in primitives.js consume this so a
   molecule looks identical everywhere. Keep shapes SCHEMATIC, not literal. */
export const MOLECULES = {
  // carbon dioxide: O=C=O linear. Grey carbon flanked by two red oxygens.
  co2: {
    label: "CO₂", color: COLORS.co2, glow: COLORS.co2, r: 7,
    atoms: [
      { dx: -7, dy: 0, r: 4.5, color: COLORS.co2 },
      { dx: 0,  dy: 0, r: 3.4, color: "#5b6b62" },   // carbon (grey)
      { dx: 7,  dy: 0, r: 4.5, color: COLORS.co2 },
    ],
  },
  // water: bent H-O-H. Big blue oxygen, two small pale hydrogens.
  h2o: {
    label: "H₂O", color: COLORS.h2o, glow: COLORS.h2o, r: 6.5,
    atoms: [
      { dx: 0,   dy: 0,  r: 5,   color: COLORS.h2o },
      { dx: -5,  dy: -4, r: 2.4, color: "#cfe4ff" },
      { dx: 5,   dy: -4, r: 2.4, color: "#cfe4ff" },
    ],
  },
  // oxygen gas: O=O, two orange atoms.
  o2: {
    label: "O₂", color: COLORS.o2, glow: COLORS.o2, r: 6,
    atoms: [
      { dx: -3.5, dy: 0, r: 4.4, color: COLORS.o2 },
      { dx: 3.5,  dy: 0, r: 4.4, color: COLORS.o2 },
    ],
  },
  // ATP: an energy token — draw as a bright yellow rounded burst (see primitives).
  atp:   { label: "ATP",   color: COLORS.atp,   glow: COLORS.atp,   r: 7, shape: "burst" },
  // NADPH: violet carrier token.
  nadph: { label: "NADPH", color: COLORS.nadph, glow: COLORS.nadph, r: 7, shape: "capsule" },
  // glucose: brown hexagon ring.
  glucose: { label: "C₆H₁₂O₆", color: COLORS.sugar, glow: COLORS.sugar, r: 10, shape: "hexagon" },
  // G3P: a small brown 3-carbon fragment.
  g3p:   { label: "G3P",  color: COLORS.sugar, glow: COLORS.sugar, r: 6, shape: "triad" },
  // photon: a gold streak/spark (drawn specially).
  photon:{ label: "hν", color: COLORS.photon, glow: COLORS.photon, r: 5, shape: "photon" },
  // excited electron: a small cyan glowing dot with a trail.
  electron:{ label: "e⁻", color: COLORS.electron, glow: COLORS.electron, r: 3.5, shape: "dot" },
  // proton H+: tiny pale-pink dot.
  proton:{ label: "H⁺", color: COLORS.proton, glow: COLORS.proton, r: 2.6, shape: "dot" },
  // a single carbon atom (for the "follow one carbon" ride) — bright, tagged.
  carbon:{ label: "C", color: "#ffffff", glow: COLORS.accent2, r: 4.5, shape: "tagged" },
};

/* The wall equation, colored per the law. Rendered in the hero. */
export const EQUATION = [
  { t: "6 CO₂", cls: "m-co2" },
  { t: " + " },
  { t: "6 H₂O", cls: "m-h2o" },
  { t: " + " },
  { t: "light", cls: "m-photon" },
  { t: "  →  " },
  { t: "C₆H₁₂O₆", cls: "m-sugar" },
  { t: " + " },
  { t: "6 O₂", cls: "m-o2" },
];

/* Absorption spectrum for chlorophyll a+b (station 6). Relative absorbance
   0..1 sampled every 10nm, 400..700nm. Two peaks (~430 blue, ~662 red),
   a deep trough in the green (~550) — the band leaves reflect, why leaves
   look green. Values are a smooth schematic of the real a+b curve. */
export const CHLOROPHYLL_ABSORPTION = [
  // 400  410  420  430  440  450  460  470  480  490
  0.55, 0.72, 0.88, 0.97, 0.90, 0.74, 0.55, 0.40, 0.30, 0.22,
  // 500  510  520  530  540  550  560  570  580  590
  0.17, 0.14, 0.12, 0.11, 0.11, 0.12, 0.14, 0.17, 0.21, 0.27,
  // 600  610  620  630  640  650  660  670  680  690  700
  0.35, 0.45, 0.58, 0.72, 0.86, 0.95, 0.98, 0.88, 0.60, 0.32, 0.16,
];

/* Map a visible wavelength (nm) to an approximate sRGB color, for the
   wavelength slider. Standard piecewise approximation. */
export function wavelengthToRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440)      { r = -(nm - 440) / 60; b = 1; }
  else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm >= 490 && nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm >= 580 && nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm >= 645 && nm <= 780){ r = 1; }
  let f = 1;
  if (nm < 420)      f = 0.3 + 0.7 * (nm - 380) / 40;
  else if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
  const ch = (c) => Math.round(255 * Math.pow(Math.max(0, c) * f, 0.8));
  return `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})`;
}
