---
title: "Foglight — single-instance serve and project handling"
labels: [wayfinder:map]
---

## Destination

`foglight serve` rewritten on main: the first serve spawns a detached background daemon hosting the server and attaches its folder as a project; every further `foglight serve` (cross-platform: Linux/macOS/Windows) attaches to that daemon as a resident process, registering its folder as a project whose maps are selectable in the web UI via a repo-grouped picker; the daemon exits when the last attacher detaches. Working code, not a spec — SPEC.md is folded up at the end.

## Notes

- **Execution effort** (overrides the wayfinder planning default): task tickets land code on main. The v1 implementation in `packages/*` is real and tested; changes go into it, not a rewrite from scratch.
- Constraints settled while charting (not up for re-decision):
  - Every `foglight serve` **stays resident**; Ctrl-C detaches its project. The daemon is nobody's foreground process.
  - **One instance per user per machine**, discovered via a state/lock in the platform runtime dir regardless of port; a later `--port` that disagrees warns and is ignored.
  - **Session-scoped persistence**: projects live only while their attacher runs; a fresh session starts empty and folders re-attach as you visit them.
  - The **Electron GUI does not participate** — it keeps its private ephemeral-port instance.
  - Multi-repo surfaces as **one Cmd+K picker with project-grouped sections**.
  - The canonical term is **project** — see `CONTEXT.md` for project / serve session / serve daemon / attacher.
- Skills to consult per session: `/grilling` + `/domain-modeling` for decisions, `/prototype` for UI questions, `/research` for external facts, `/tdd` for the task tickets.
- Tracker conventions: `.wayfinder/TRACKER.md`; this map's tickets live in `.wayfinder/tickets-project-handling/`.

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Fold project handling into SPEC.md and CONTEXT.md](tickets-project-handling/008-spec-context-sweep.md) — SPEC.md rewritten for the shipped daemon/attacher, live per-project detection, and jump-pane picker; CONTEXT.md reconciled; v1 "multi-repo serving" out-of-scope ruling reversed. **The destination is reached.**

- [Implement grouped picker and client project handling](tickets-project-handling/007-implement-picker-client.md) — E's jump-pane Cmd+K picker in `packages/client` (All-maps default, global search, path on colliding names); K's named rail switcher at G's air; remembered id kept across detach and reopens on re-attach; Chromium probe 27/27.

- [Implement daemon spawn and attach CLI](tickets-project-handling/006-implement-daemon-attach.md) — `foglight serve` is a resident attacher: first serve O_EXCL-claims and spawns a detached daemon over UDS/named-pipe NDJSON; further serves attach; last detach is claim-file-first; `foglight status` is a one-shot of the same handshake. Linux-verified; Win/macOS paths unit-tested. Electron stays n=1 in-process.

- [Implement multi-project server and domain](tickets-project-handling/005-implement-multi-project-server.md) — core+server session: attach/detach, live detection, forced-tracker `error` state, uniform prefix on nested ResourceIds, SSE `projects` on attach/detach, per-project GitHub cadence, n≥2 on one session. Adapters stay project-blind; Electron/CLI are the n=1 client.

- [Project-grouped map picker](tickets-project-handling/004-grouped-picker-prototype.md) — E's jump pane (All-maps default, scope on demand, global search); rail header is K (project name inside the title switcher) at G's comfortable air; detach → empty state + auto-picker, remembered id kept; n=1 opens the sole map and hides grouping.

- [Multi-project domain and API rework](tickets-project-handling/003-multi-project-domain.md) — Projects are basename+path-hash ids prefixed uniformly onto every ResourceId (`?map=` alone still addresses); detection is live per project (tracker-less folders register empty and come alive later); one SSE stream per tab gains a `projects` event; per-project cadence; flat `listMaps` with a project ref on the descriptor; registration is attacher-channel-only; Electron is the n=1 case.

- [Cross-platform daemon spawn and discovery facts](tickets-project-handling/001-daemon-discovery-research.md) — facts landed in `research/daemon-discovery.md`: detached spawn survives terminal close but not logout (fits session scoping); O_EXCL claim files are the atomic discovery primitive; a connected socket reports attacher death reliably on all platforms; prior-art daemons validate state files by handshake and prefer idle timers; Effect covers sockets/locks but the daemon spawn itself must be raw `child_process.spawn`.

- [Daemon–attacher protocol and lifecycle](tickets-project-handling/002-daemon-attacher-lifecycle.md) — IPC socket/pipe channel carrying NDJSON (effect/Schema-validated); registration implicit in the channel (handshake names the path, socket close unregisters; second serve on a taken path errors out); minimal terminal display with `--verbose` log tail; immediate claim-file-first exit on last detach (browser recovers via SSE reconnect); crash → attachers race the claim and respawn+re-register, reused for version-skew graceful restart; conflicting flags warn-and-proceed with daemon-owned tailscale teardown; observability = daemon log file + `foglight status`. Resolves the observability, failure-UX, and tailscale-ownership fog.

## Not yet specified

- **Cross-checkout GitHub map dedup** — uniform project-prefixed ids make two checkouts of one GitHub repo two distinct resources with two snapshots (decided, cheap); whether identical GitHub maps should ever be aliased/deduped is deferred until it hurts.

## Out of scope

- **Electron GUI attaching to or sharing the serve daemon** — the GUI keeps its private ephemeral-port instance; the old "remote-connect Electron GUI" ruling stays out too.
- **Persistent project registry across sessions** — deliberately session-scoped; no state file of registered folders survives the last detach.
- **Remote / multi-machine project registration** — attach is local-only; a project is a folder on the machine the daemon runs on.
