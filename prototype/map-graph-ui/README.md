# THROWAWAY PROTOTYPE — foglight map view

Answers wayfinder ticket **005 Map graph UI prototype**: how should the map look
and feel, and does a list view exist alongside the graph?

Four variants of the _same_ map on one route, switchable via `?variant=A|B|C|D`,
the floating bottom bar, or the arrow keys. **D is the default** and the live
candidate: it is B's stance (rail + left-to-right flow) rebuilt for craft.

```
pnpm install
pnpm dev     # https://cachyharness.tail71b0eb.ts.net:5199/?variant=D
pnpm smoke   # mounts all four in jsdom; catches crashes, not looks
```

Served over the tailnet with a real cert (`tailscale cert` into `.certs/`,
gitignored) and bound to the tailnet interface only, so nothing is exposed on the
LAN. Without those files the config falls back to `http://localhost:5199`.

- **Fixture is this repo's own map**, read from `.wayfinder/` on 2026-08-06 — 8
  tickets, 5 patches of fog, 5 out-of-scope entries. One synthetic addition,
  marked in `src/lib/fixture.ts`: a malformed ticket, so the `invalid` state gets
  judged rather than imagined.
- **`simulate change ⟳`** next to the switcher fakes a change signal: 006 closes,
  007 unblocks, a fog patch graduates into a new ticket. In D the nodes glide to
  their new ranks; watch how far they travel. That is the dagre-versus-elkjs
  question made visible.

## The variants

|                         | Stance                            | Graph                                  | List                       | Ticket detail            | Fog                           |
| ----------------------- | --------------------------------- | -------------------------------------- | -------------------------- | ------------------------ | ----------------------------- |
| **D** Cockpit, refined  | B, rebuilt for craft              | dagre left-to-right, animated relayout | 348px rail, by map section | accordion inside the row | drifting veil at the far edge |
| **A** Full-bleed canvas | the map _is_ the graph            | dagre top-down, whole viewport         | none                       | overlay sheet, right     | veil at the graph's edge      |
| **B** Cockpit, original | graph = shape, rail = next action | dagre left-to-right                    | 360px rail                 | expands in the rail      | veil over the fog band        |
| **C** Route bands       | progress is the story             | no layout engine; rows by band         | the graph _is_ a list      | drawer along the bottom  | the last band, fading out     |

## What changed from B to D

**Design system.** Geist Sans and Geist Mono replace the system stack, with
size-specific tracking (tight on titles, open on small-caps labels) instead of one
value everywhere. Phosphor icons replace the ad-hoc glyphs (`◇▢◆▪`) and the
ASCII `✕`. One radius scale, locked: `--r-surface` for panels, `--r-control` for
rows, pill for chips. One accent (pink); every other colour is semantic state, so
nothing is coloured for decoration. The rail is a translucent structural material
(`backdrop-filter`) with a scroll-edge fade instead of a hard divider, and the
legend floats over the canvas rather than eating a strip of it.

**State reads at any zoom.** A node's state is a 2px spine down its left edge plus
a word, not a coloured badge competing with the title. The rail meter is one tick
per ticket rather than a percentage bar, so it shows _shape_ as well as progress.

**Motion.** Eight moments, chosen from the opportunities sweep, each bridging a
change rather than decorating a surface:

| Moment                       | Motion                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relayout on a change signal  | Node _positions_ interpolated over 320ms `--ease-in-out`, so edge paths stay glued to the cards while they move (`useSnapshotDiff`)                                                                                                                                                                                     |
| Fog graduating into a ticket | Continuity, not replacement: `graduatedFrom` links the arrival to the departure, so the new card enters _at the fog patch's position_, fully visible, and glides to its rank. No ghost, no fade pair; the patch's dashed edges re-anchor to the moving card and fade from it. Symmetric — undo plays the move backwards |
| Edge arriving                | The line draws itself from the blocker toward the new ticket: `pathLength={1}` + `stroke-dashoffset: 1 → 0`, 320ms `--ease-out`, pure CSS. The node it points at waits ~190ms so it lands as the line reaches it. Dashed fog edges cross-fade instead (drawing would overwrite their dash pattern)                      |
| Edge leaving                 | Same keyframes reversed, 200ms; its card follows 60ms later. Departed items are held as ghosts for one exit window (`useGraphTransition`) so there is something left to animate                                                                                                                                         |
| Rail detail open/close       | height + opacity, enter 240ms, exit 160ms                                                                                                                                                                                                                                                                               |
| Selection                    | one indicator sliding between rows, spring `bounce: 0, duration: 0.22`                                                                                                                                                                                                                                                  |
| Nodes arriving               | `opacity: 0` + `scale(0.97)`, 260ms, 40ms stagger                                                                                                                                                                                                                                                                       |
| Section caret                | 90° rotate, 180ms                                                                                                                                                                                                                                                                                                       |
| Unrelated edges              | recede to `opacity: 0.25` over 180ms so the selection's lineage reads first                                                                                                                                                                                                                                             |

Two honest trade-offs in there. The relayout is JS, not CSS, which contradicts
the usual "CSS survives a busy main thread" rule: React Flow derives edge paths
from `node.position`, so a CSS transform moves the card's pixels but not its
position, and every line would hang detached for the length of the glide. Cards
and lines have to move as one object, so the positions themselves animate. And
`stroke-dashoffset` is a paint property, not a compositor one, so the draw-on is
the one animation here that cannot be GPU-only. Both are affordable at map scale
(tens of nodes, once per change signal); a map with hundreds of edges would want
the draw dropped.

**Architecture: the store is diffed, never rebuilt.** React Flow runs
_uncontrolled_ (`defaultNodes`/`defaultEdges` seed it once); each change signal
is applied by `useSnapshotDiff` as a diff against `rf.getNodes()/getEdges()`:
update changed items in place, append arrivals with their lifecycle marking, flip
departures to `exiting` ghosts and purge them after the exit window, and glide
positions to the new layout through `setNodes` on the store's own objects.
Unchanged items keep object identity, so React Flow skips them entirely.

Three bugs taught this shape, all caught with a headless-Chromium probe
(`probe.ts` / `probe2.ts` — kept as the regression check, since jsdom can't see
any of this):

1. Measured draw goes stale: `getTotalLength()` at mount pinned the dash pattern
   while the geometry was still changing; the line froze. `pathLength={1}` makes
   the draw measurement-free and correct mid-relayout.
2. Controlled mode replays everything: handing React Flow a rebuilt nodes array
   makes it re-measure; while measuring, `EdgeWrapper` returns `null`, every
   custom path remounts, every animation replays — the whole flowchart appeared
   to redraw. Hence the uncontrolled + diff architecture above.
3. Exits jumped instead of animating: enter and exit shared one `@keyframes`
   reversed, and the spec only restarts an animation when its _name_ changes —
   the finished enter animation swallowed the exit. Enter and exit now have
   separate keyframes names.

Deliberately still: hover on nodes (records being read, not surfaces to play
with), the progress meter, and variant switching (keyboard-driven — never
animate). The fog veil is the only perpetual animation, because "unresolved" is
the one state that shouldn't sit perfectly still.

**Craft details.** Rows respond on `pointerdown`, untransitioned, so selection is
instant. `prefers-reduced-motion` drops travel and keeps opacity;
`prefers-reduced-transparency` and `prefers-contrast: more` make the rail solid.
Sections are real `aria-expanded` disclosures, rows carry `aria-current`, and
focus-visible rings are global. Tailwind v4 gates `hover:` behind
`@media (hover: hover)` already, so touch can't fire a false hover.

Dark only — a light theme is a spec question, not a prototype one.
