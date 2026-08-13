# THROWAWAY PROTOTYPE — Apple restyle of the cockpit

Answers: **what should the shipped cockpit's design language become?** Three
Apple-language restylings of the same rail + canvas cockpit, switchable via
`?variant=A|B|C`, the floating bottom bar, or the arrow keys.

The constraint, honoured in all three: **the canvas animation system is the
shipped one, untouched** — node arrival/departure, edge draw/retract, the
fog-graduation morph, the relayout glide, and the drifting fog veil. Shared
machinery lives in `src/canvas/` and `src/lib/`; each variant only owns its
chrome and a `.theme-*` token scope in `src/index.css`.

```
pnpm install
pnpm dev          # https://cachyharness.tail71b0eb.ts.net:5202/?variant=A
pnpm smoke        # mounts all three in jsdom; catches crashes, not looks
pnpm tsx probe.ts # real Chromium: screenshots into shots/, checks the
                  # Nightfall rail overlap and that nodes glide on change
```

Fixture is this repo's own map (carried over from `prototype/map-graph-ui`),
and **`simulate change ⟳`** fakes the same change signal — watch the canvas:
the animations must read as native inside every chrome.

## The variants

|                  | Language                       | Rail                                              | Canvas                                | Legend                    | Accent                    |
| ---------------- | ------------------------------ | ------------------------------------------------- | ------------------------------------- | ------------------------- | ------------------------- |
| **A** Daylight   | macOS app, light               | docked, translucent source list, sentence-case    | paper white, cards on tinted shadows  | frosted pill, floating    | brand pink, recalibrated  |
| **B** Nightfall  | dark glass (visionOS-flavour)  | floating inset panel, heavy blur, small-caps      | full-bleed, page gradient shows through | glass pill, floating    | brand pink                |
| **C** Graphite   | macOS pro app, dark            | opaque graphite + unified toolbar across the top  | inset viewer well with a docked status bar | status bar, docked   | Apple system blue         |

Type: A and C use the system stack (SF on Apple hardware); B keeps Geist, the
shipped brand face. All three honour `prefers-reduced-motion`,
`prefers-reduced-transparency`, and `prefers-contrast`.

## What is deliberately NOT varied

- Rail structure (sections, ordering, accordion detail inside the row)
- Selection model (shared both ways, viewport moves only on request)
- The state-is-colour / type-is-icon-plus-word vocabulary
- Every canvas animation and its timings

## Verdict

_Unresolved — flip through and pick, or name the pieces to combine
(e.g. "B's floating rail with A's light palette")._
