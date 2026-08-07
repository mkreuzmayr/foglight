---
title: "Live-update transport and cadence"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [6]
---

## Question

The adapter side of liveness is settled ([Tracker adapter interface design](004-tracker-adapter-interface.md)): each adapter emits a `Stream<ChangeSignal>` of bare invalidation ticks, and foglight re-snapshots and diffs. What remains is everything downstream of that tick.

Pin down: the transport carrying changes to the browser (SSE — which the Effect research names as the low-friction pick — versus WebSocket, versus Electron IPC in the desktop case, and whether desktop and headless share one path); the GitHub polling cadence and whether it adapts (foreground map vs background picker, rate-limit headroom); the file-watch debounce window for local-markdown, given an agent session may rewrite several ticket files in quick succession; and how a diffed snapshot is applied to the graph without re-running layout on every tick or losing the user's viewport.

Grill with /grilling + /domain-modeling. Blocked on the headless design, since whether one transport serves both modes depends on how headless and Electron share a codebase.
