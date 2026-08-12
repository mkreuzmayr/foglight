---
title: "Map picker and multi-map UX"
labels: [wayfinder:grilling]
status: closed
assignee: michaelk
blocked-by: []
---

## Question

Graduated from fog now that the map view is settled ([Map graph UI prototype](005-map-graph-ui-prototype.md)): the cockpit shows exactly one map, and this repo is itself a multi-tracker case, so how does a person get to a *different* map?

Pin down: where the picker lives given the settled layout (a rail header control, a separate route, a command-palette style overlay); what a [Map descriptor](../../CONTEXT.md) shows at rest (title, destination, decided/total, which tracker) and how maps are ordered; how the union across trackers is presented when local-markdown and GitHub Issues are both live and may describe the *same* effort; what foglight opens on launch with no argument (last map, only map, or the picker); whether a map is addressable by URL, which headless mode makes load-bearing since people will share links.

Grill with /grilling + /domain-modeling. The prototype branch `prototype/map-graph-ui` is available to make any of this concrete rather than argued.

## Resolution

Settled over five grilling rounds. The headline is a **reversal**: the premise
in this ticket's own question — that a repo is a multi-tracker case — was
rejected. One repo has one tracker.

### The reversal: one adapter per repo

[Tracker adapter interface design](004-tracker-adapter-interface.md) settled that
both adapters could be live simultaneously and that the picker would union
across them, with *no* precedence rule. **That is overturned.** Foglight
resolves exactly one adapter per repo:

- `.wayfinder/` present → local-markdown; else a GitHub `origin` remote →
  GitHub adapter; `--tracker local|github` forces the choice.
- **Local wins** because a `.wayfinder/` directory is a deliberate artifact,
  whereas nearly every repo has a GitHub remote and would otherwise hijack
  detection. Local also works offline and unauthenticated.

This kills the hardest question the ticket posed — how to present two maps that
describe the same effort — by making it unreachable. Nothing links a
`.wayfinder/map.md` to issue #42, so any merge would have needed an identity for
"effort" that no tracker provides; picking one tracker removes the need for one.

Consequences elsewhere:

- **`listMaps()` no longer unions.** It reads one adapter.
- **`TrackerRegistry` → the *detected tracker*.** Detection is still real work
  and still earns a service tag, but "registry" implied a collection that no
  longer exists. `CONTEXT.md` renamed accordingly.
- **Qualified ids keep their `local:` / `github:` prefix** — still stable across
  reloads, still deep-linkable, and they make a `--tracker` mismatch legible
  rather than silent.
- **No tracker badge on picker rows**, since the tracker is uniform; it is shown
  once in the rail header.
- This settles the **CLI tracker override** fog patch in full.

### Addressing

**`/?map=<urlencoded id>&ticket=<urlencoded id>`** — query params, not path
routes. Map ids contain `#` and `/` (`github:owner/repo#42`,
`local:.wayfinder/map.md`), which a path segment survives only under heavy
encoding, and a bare `#` in a path is fatal. Query params also match the
transport already settled in [Live-update transport and
cadence](007-live-update-transport.md) (`GET /api/events?map=<id>`) exactly, need
no server catch-all beside the static `dist/` route, and let v1 ship with **no
router library at all** — two search params read into state.

The **ticket** rides in the URL too: the rail accordion is the unit people
actually point at, and headless mode means links get pasted. An explicit `?map`
**always beats the remembered map** — a pasted link must mean what it says.

### The picker

- **A rail-header popover** anchored on the current map's title. Keeps the
  cockpit the single screen, keeps the current map visible as an anchor, costs
  no route, and puts map-switching in the half of the UI that already owns "what
  do I pick up next".
- **`Cmd+K`, not `Cmd+P`.** `Cmd+P` was the instinct, but it collides with the
  browser print dialog — and headless-in-a-browser is the common case, not the
  exception. `Cmd+K` is the developer-tool convention for a thing-switcher and
  collides with nothing.
- **Always-visible substring filter** over title and destination, focused on
  open. A keyboard-invoked popover sets the expectation of typing; with three
  maps it costs one input, and it is instantly useful at ten.
- **Descriptors stay lightweight** — title, destination (truncated), decided/
  total. Deliberately **no frontier count**, native as that number is: frontier
  derives from blocking edges, so putting it on the descriptor would force
  `listMaps` to read every ticket's dependencies — cheap-ish locally, expensive
  on GitHub — undoing 004's lightweight-`listMaps` decision.
- **Ordered most-recently-changed first** (file mtime / GitHub `updated_at`),
  ties alphabetical: the map that just moved is the one you're working.
- **Liveness is already solved.** 007's single SSE connection carries a typed
  `maps` descriptor-list event and already names "picker-only" as a cadence
  state, so the picker needs no second subscription.

### Opening and switching

- **The last map is remembered in the browser** and reopened.
- **Cold start** — no `?map`, nothing remembered, or a remembered id that no
  longer exists: exactly one map opens it (a picker listing one item is pure
  friction); more than one opens the picker over an empty cockpit; zero shows an
  empty state explaining where a map should live.
- **Switching is a full replace**: clear `?ticket`, refit the viewport, rebuild
  the rail, and **cross-fade rather than glide**. The settled motion rule from
  [Map graph UI prototype](005-map-graph-ui-prototype.md) is that motion bridges
  change *within* a map; a different map is not a change but a different
  subject, and animating nodes between unrelated maps would imply a relationship
  that does not exist.
