# Solidified Sky

**A tree is made of air.** An immersive, always-running explainer that flies you down from a leaf into a living chloroplast and carries you *through* photosynthesis while it happens — photons streaming in, water splitting, electrons hopping, the Calvin cycle turning. Every molecule is **drawn and animated in code** (Canvas 2D + SVG). No images, no AI-generated art.

**Live:** [maninae.github.io/solidified-sky](https://maninae.github.io/solidified-sky) · Science sibling to [Valence](https://maninae.github.io/valence/).

## The journey (one continuous scroll)

| # | Station | What you do |
|---|---|---|
| 00 | A Tree Is Made of Air | Guess where a tree's mass comes from; meet van Helmont's willow |
| 01 | Zoom Into a Leaf | One slider from whole tree → leaf → mesophyll → single cell |
| 02 | Meet the Chloroplast | Take apart a chloroplast in 2.5D; label its parts |
| 03 | The Light Reactions | A live thylakoid: drag the sun, split water, fill the ATP/NADPH meters |
| 04 | Follow One Carbon Atom | Ride a single carbon from air, through rubisco, into a sugar |
| 05 | The Whole Cycle, Running | Turn a day-dial and watch net O₂/CO₂ flow reverse at night |
| 06 | Why Green? | Sweep the spectrum and see the color a leaf refuses to eat |

## The one thing to get right

The **oxygen you breathe comes from splitting water, not from CO₂.** The carbon of CO₂ goes into sugar; the O₂ is a byproduct of water being torn apart at Photosystem II (proven by Ruben & Kamen's 1941 ¹⁸O experiment). Most kids' diagrams get this backwards. This site never does.

## Built with

Vanilla JS ES modules, no framework, no build step. A shared **code-drawn art system** — a `draw*` primitive library plus a pooled particle engine with sprite caching — is what keeps hundreds of animated molecules cohesive and accurate. See [`CLAUDE.md`](CLAUDE.md) for the architecture and the Molecule Color Law.

```
python3 -m http.server    # then open http://localhost:8000
```

Deployed via GitHub Pages from `main`.

## Credits

Built by [Owen Wang](https://maninae.github.io). Science checked against Khan Academy, OpenStax Biology 2e, and Campbell Biology. The title is Nick Lane's phrase, by way of Feynman: a tree is made of air.
