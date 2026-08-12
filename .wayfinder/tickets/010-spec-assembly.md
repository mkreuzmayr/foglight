---
title: "SPEC.md assembly"
labels: [wayfinder:task]
status: closed
assignee: claude
blocked-by: [9]
---

## Question

The closing act, and the destination itself: fold every decision on this map into a complete `SPEC.md` at the repo root for foglight v1.

Nothing is decided here — every ticket that precedes it holds the decisions, and this ticket only assembles them. The work: read each closed ticket's resolution, write the spec so a build session needs no other input, and carry through the corrections rather than the superseded text — notably that [Tracker adapter interface design](004-tracker-adapter-interface.md) was partially reversed by [Map picker and multi-map UX](008-map-picker-ux.md) (one tracker per repo, no union).

Fold in, too, the findings the build must not rediscover: the React Flow controlled-mode and `pathLength` traps from [Map graph UI prototype](005-map-graph-ui-prototype.md), the `@effect/platform` HTTP-instability caveat from [Effect.js backend architecture facts](002-effect-backend-architecture.md), and the fog-entry bold-lead-term convention that 004 asks the spec to state.

Resolved when `SPEC.md` exists and the map's destination is reached.

## Resolution

[`SPEC.md`](../../SPEC.md) exists at the repo root — eleven sections folding
every closed ticket's resolution into one document a build session can execute
with no other input.

Assembly notes:

- **Corrections carried through, not the superseded text.** The spec states the
  one-tracker-per-repo rule from [Map picker and multi-map UX](008-map-picker-ux.md)
  as the design, with an explicit "do not resurrect" note on 004's reversed
  union/`TrackerRegistry`-as-collection; likewise 007's snapshot/body split is
  presented as the contract, not as a refinement of 004's raw-markdown-on-model.
- **Build-must-not-rediscover findings folded in**: the React Flow
  controlled-mode and `pathLength` traps (plus the same-tick `setNodes` read and
  the separate-enter/exit-keyframes rule) as a numbered "do not rediscover"
  list in §8; the `@effect/platform` HTTP-instability and Effect 4 migration
  caveats in §2; the fog-entry bold-lead-term convention stated as a map-author
  convention in §5; the `ELECTRON_MIRROR` first-launch error requirement and
  tarball-is-the-whole-download facts in §11.
- Normative companions are linked (CONTEXT.md, ADR 0001, the prototype branch
  with its motion values and Chromium probes, `research/`), but every decision
  the build must honour is restated in the spec itself.

**The map's destination is reached.** No open tickets remain, Not yet specified
is empty, and the way is clear: the build and npm release proceed as a
follow-on effort, outside this map, with `SPEC.md` as their input.
