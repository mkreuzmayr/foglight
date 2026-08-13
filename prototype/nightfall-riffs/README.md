# THROWAWAY PROTOTYPE — riffs on Nightfall

Round two, after `prototype/apple-restyle` settled the stance: **Nightfall won**
(dark glass, floating rail over a full-bleed canvas, Geist). This round answers:
**which palette, and which rail interior?** Four variants via `?variant=A|B|C|D`,
the bottom bar, or the arrow keys — **A is the untouched winner**, kept for
side-by-side judgement.

The glass shell (`src/canvas/GlassShell.tsx`) and the entire canvas animation
contract are shared and identical in all four; each riff owns only a `.theme-*`
token scope in `src/index.css` and its rail interior.

```
pnpm install
pnpm dev          # https://cachyharness.tail71b0eb.ts.net:5203/?variant=B
pnpm smoke        # mounts all four in jsdom; catches crashes, not looks
pnpm tsx probe.ts # real Chromium: screenshots into shots/, overlap + glide checks
```

## The variants

|                   | Palette                                   | Rail interior                                                                 |
| ----------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| **A** Nightfall   | picked baseline: cool near-black, pink    | hairline-divided accordion sections (as picked)                               |
| **B** Violet Hour | indigo room, lavender accent, claimed→teal | iOS-style inset grouped sections, glass-on-glass rounded groups              |
| **C** Harbor      | blue-black, cyan accent                   | no accordions: segmented control (Next / All / Decided) over one list; progress ring header |
| **D** Ember       | warm charcoal, pink warmed to rose        | continuous list, sticky mini-headers, state as a colour spine per row, destination as a one-line disclosure |

Colour notes: in B the accent takes lavender, so the `claimed` state hands its
purple to teal to stay distinct — one colour per meaning, no exceptions. C and
D keep the baseline state hues, re-tuned to their grounds. Fog veil and canvas
dots follow each palette (`--fog-1/--fog-2/--dot`).

## What is deliberately NOT varied

- The glass shell: floating rail geometry, full-bleed canvas, legend chip
- Every canvas animation and its timings
- Selection model and the accordion detail inside the row

## Verdict

_Unresolved — flip through against A and pick, or name the pieces to combine
(e.g. "C's segmented control on B's palette")._
