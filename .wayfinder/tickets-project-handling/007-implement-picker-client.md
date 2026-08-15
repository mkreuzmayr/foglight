---
title: "Implement grouped picker and client project handling"
labels: [wayfinder:task]
status: closed
assignee: michaelk
blocked-by: [4, 5]
---

## Question

Land the client side in `packages/client`: the project-grouped Cmd+K picker as settled on [Project-grouped map picker](004-grouped-picker-prototype.md) — **E's jump pane** (All-maps default, project pane scopes browsing, typing searches globally), **K's rail header** (project name inside the title switcher) at **G's comfortable air**, project-aware addressing and remembered-map behavior, live reaction to project attach/detach. Disambiguate colliding project names with `path`. Verify in a real browser (see memory: probe Chromium, keep the probe).

Primary source: `prototype/picker-projects/?variant=K`.

## Resolution

Landed 2026-08-14 in `packages/client`. The rail-header popover is gone; Cmd+K (and the named title switcher) open E's jump-pane dialog.

- **Picker.** All-maps default, left pane scopes browsing, typing searches globally (title, destination, project name) and collapses the panes. ←→ cycles scope while the query is empty. Degraded projects stay in the pane and explain themselves on the right. At one project the pane hides. Colliding basenames carry `path`.
- **Rail header.** K's named switcher (project above title, caret) at G's comfortable air; brand row still names the tracker. Click opens the same picker as ⌘K.
- **Addressing.** Remembered id is kept when its project detaches — never replaced by a stranger map, even if only one other map remains. The map reopens itself on re-attach. Cold start with a sole reachable map and nothing remembered still opens it outright.
- **Live.** SSE `projects` updates the list; maps whose project has detached drop immediately. Detach of the open map cross-fades to the empty state, auto-opens the picker, and names what is being remembered.
- **Probe.** `test/cockpit.probe.ts` covers cold-start picker, K's header, n=1 grouping hide, Cmd+K, Escape. Chromium 27/27.

