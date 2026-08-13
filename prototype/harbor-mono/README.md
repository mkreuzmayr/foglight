# THROWAWAY PROTOTYPE — colour discipline for the Harbor cockpit

Round three. Settled so far: the glass shell (round one, `apple-restyle`) and
**Harbor's rail interior** — segmented control, progress ring, one continuous
list (round two, `nightfall-riffs`). This round answers: **with the background
tint gone, where is colour still allowed to appear?**

All three variants sit on the same **flat neutral macOS-dark ground** — no
radial gradient, no hue cast in the greys. `?variant=A|B|C`, bottom bar, or
arrow keys.

```
pnpm install
pnpm dev          # https://cachyharness.tail71b0eb.ts.net:5204/?variant=A
pnpm smoke        # mounts all three in jsdom; catches crashes, not looks
pnpm tsx probe.ts # real Chromium: screenshots into shots/, overlap + glide checks
```

## The treatments

|                 | Interactive accent (ring, thumb, selection, focus, frontier) | Ticket-state hues            | Fog veil            |
| --------------- | ------------------------------------------------------------ | ---------------------------- | ------------------- |
| **A** Rose      | brand pink                                                   | baseline hues                | whisper of pink     |
| **B** Azure     | macOS system blue                                            | Apple-dark hues              | whisper of blue     |
| **C** Graphite  | monochrome white-on-grey (macOS graphite accent mode)        | muted hues, state ONLY       | neutral grey glow   |

In C, colour survives exclusively as information: decided green, claimed
purple, malformed red, destination gold — everything interactive is
monochrome. The frontier keeps a warm off-white and "blocked" drops darker so
the two greys never collide.

## What is deliberately NOT varied

- The ground: flat `#0f0f10` neutral in all three
- The glass shell, Harbor rail, selection model
- Every canvas animation and its timings

## Verdict

_Unresolved — pick a treatment (or tune one: "C but with A's fog")._
