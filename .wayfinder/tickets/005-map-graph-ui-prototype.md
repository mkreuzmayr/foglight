---
title: "Map graph UI prototype"
labels: [wayfinder:prototype]
status: closed
assignee: michaelk
blocked-by: [3]
---

## Question

How should the map look and feel? Build a throwaway prototype (via /prototype) of the graph view — tickets as nodes with type/state visible at a glance, blocking edges, frontier highlighted, decisions-so-far distinct, fog rendered at the edge of the known, destination anchored — in shadcn/tailwind with the t3code-like aesthetic, using the graph library the research ticket surfaced. React with the user until the look is settled; the settled choices (including the graph library pick) are the resolution.

Also settle here: the graph is the default view (per the destination), but does a **list view** exist alongside it as a secondary mode, and if so what does it show that the graph can't? The tracker adapter's whole-map snapshot serves both identically, so this is purely a UI decision.

## Resolution

Settled against four working variants (A full-bleed canvas, B cockpit, C route
bands, D cockpit rebuilt) on this repo's own map as the fixture. Prototype:
branch `prototype/map-graph-ui`, directory `prototype/map-graph-ui/`, served over
the tailnet at `https://cachyharness.tail71b0eb.ts.net:5199/?variant=D`.

### The view

**The cockpit wins: a permanent rail beside a left-to-right graph, selection
shared both ways.** Michael picked B on sight, then it was rebuilt as D with the
animate / design-eng / apple-design / design-taste-frontend skills.

**Yes, the list view exists — and it is not a secondary mode.** It is always on
screen as the rail, ordered by the map's own sections (frontier, claimed,
blocked, decisions so far, not yet specified, out of scope). It earns its place
by carrying what the graph structurally cannot: **out-of-scope entries**, which
have no position in a dependency graph because they are off the route entirely,
and **parse warnings**. It also answers a different question — the graph answers
"what is the shape of this effort", the rail answers "what do I pick up next" —
and only the rail can be ordered by that. No view toggle: both, always.

**Graph reads left to right**, decisions behind, frontier at the working edge,
fog beyond it, destination anchored at the right as a node the route arrives at.

### Settled specifics

- **Layout engine: dagre** (`@dagrejs/dagre`), not elkjs. Measured on the change
  signal, existing nodes travel 2-47px — small enough that the animated relayout
  absorbs it, so elkjs's position-preserving mode is not worth its ~460 kB. The
  seam to revisit if maps get much larger.
- **Rendering: React Flow** (`@xyflow/react`), confirming the research ticket.
  Custom nodes as DOM means real tailwind cards; `ViewportPortal` puts the fog
  veil in graph coordinates.
- **State is colour + a 2px spine + a word** on each card, never a badge
  competing with the title. Type is an icon plus a word, never colour: colour
  belongs to state alone.
- **Ticket detail is an accordion inside the rail row**, not a sheet or a modal
  — the graph never gets occluded by the thing you clicked on it. (This settles
  the "Ticket detail view" fog patch.)
- **Malformed tickets render as a marked card** plus a rail warning, per
  CONTEXT.md's degrade-don't-fail stance.
- **Dark only** for v1. A light theme is a spec question, not a prototype one.
- **Motion is bridging, never decoration** — eight moments, all documented with
  values in the prototype README. The load-bearing one: a change signal must
  never redraw the map. Nodes glide to new ranks, arriving edges draw themselves,
  and a fog patch that graduates *becomes* its ticket (enters at the patch's
  position and travels to its rank) rather than fading out while a new card fades
  in. Fog is the only perpetual animation, because "unresolved" is the one state
  that should not sit perfectly still.

### Findings the build must not rediscover

Three cost real debugging time and are written up in the prototype README:

1. React Flow in **controlled mode replays every animation** on any change — a
   rebuilt nodes array forces re-measure, `EdgeWrapper` returns `null` while
   measuring, and every custom edge remounts. Run it uncontrolled and apply
   snapshots as a **diff** against its store (`useSnapshotDiff`).
2. `getTotalLength()`-based line drawing goes stale the moment geometry moves;
   `pathLength={1}` makes the draw measurement-free.
3. `rf.setNodes()` is **not** readable back via `rf.getNodes()` in the same tick.

Also: verifying this needs a real browser. jsdom cannot see SVG geometry, WAAPI,
or layout, and React Flow renders no edges without measurement — `probe*.ts` on
the branch are the regression check.
