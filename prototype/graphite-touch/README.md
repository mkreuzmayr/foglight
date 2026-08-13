# THROWAWAY PROTOTYPE — touch: tone variations on the Graphite cockpit

Round four. Settled by the previous rounds: dark glass shell over a full-bleed
canvas (`apple-restyle`), Harbor's segmented rail (`nightfall-riffs`), and the
**Graphite colour discipline** — flat neutral macOS-dark ground, monochrome
accents, colour as ticket state only (`harbor-mono`, picked definitively).

Concept, layout, palette: all fixed. This round varies only **touch** — corner
radii, glass opacity and blur, hairline and ink contrast, shadow depth. Each
tone is a token scope stacked on the same graphite base; flip in place to feel
the difference. `?variant=A|B|C|D`, bottom bar, or arrow keys.

```
pnpm install
pnpm dev          # https://cachyharness.tail71b0eb.ts.net:5205/?variant=A
pnpm smoke        # mounts all four in jsdom; catches crashes, not looks
pnpm tsx probe.ts # real Chromium: screenshots into shots/, overlap + glide checks
```

## The tones

|                | Radii (surface/control) | Glass                       | Hairlines & ink        | Shadows              | Fog        |
| -------------- | ----------------------- | --------------------------- | ---------------------- | -------------------- | ---------- |
| **A** Baseline | 14 / 9                  | 62% panel, blur 36          | as picked              | as picked            | as picked  |
| **B** Soft     | 18 / 12                 | 68% panel, blur 44          | gentler, ink eased     | deeper, fuzzier      | as picked  |
| **C** Crisp    | 10 / 6                  | 80% panel, blur 24          | brighter, ink lifted   | short, definite      | as picked  |
| **D** Mist     | 16 / 10                 | 50% panel, blur 54          | nearly gone            | wide, faint          | a step up  |

## What is deliberately NOT varied

- Everything settled: shell, rail, palette, colour discipline, selection model
- Every canvas animation and its timings

## Verdict

_Unresolved — pick a tone (or interpolate: "B's radii with C's contrast")._
