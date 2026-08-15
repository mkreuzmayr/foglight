---
title: "Implement multi-project server and domain"
labels: [wayfinder:task]
status: closed
assignee: michaelk
blocked-by: [3]
---

## Question

Land the multi-project rework decided on [Multi-project domain and API rework](003-multi-project-domain.md) in `packages/core` and `packages/server`: the Project entity, project-qualified ids and addressing, per-project detection/watching, aggregated `listMaps`, the registration API, and project add/remove as a change signal. Tests updated alongside (`/tdd`). The Electron path must keep working as a single-project client of the same server.

## Resolution

Landed 2026-08-14 in `packages/core` and `packages/server`. Adapters stay project-blind; identity (`idFor`, `qualify`) and nested-id stamping live in core/session. Registration is in-process `attachProject` / `detachProject` (ticket 006 hangs the attacher channel on these).

- **Project session.** `AppLayer` starts empty with optional `initialProject`. `GET /api/projects` lists `{ id, name, path, state, trackerKind? }`. Missing/not-a-dir attach → `ProjectPathInvalid`; unknown detach is a no-op; second attach returns the existing project and ignores a new override.
- **States.** Natural detection miss → `no-tracker` (stays registered). Forced `--tracker` that cannot resolve → still attaches, `state: error`. Detection re-runs on adapter-less projects; a `.wayfinder/` created later promotes to `ready` and contributes maps.
- **Ids.** Every ResourceId on the wire is project-prefixed, including tickets, fog, out-of-scope, `graduatedFrom`, and warning subjects. Adapters still speak unqualified ids; the store qualifies on the way out and strips on the way in.
- **Streams.** One `/api/events` per tab. SSE `projects` fires on connect with the complete list, and again on attach, detach, and live promotion.
- **Cadence.** Each GitHub source has its own poll ref. A project whose map is on screen is `active`; other connected projects are `idle`; no clients → `paused`.
- **n≥2.** Two ready projects on one session aggregate into `GET /api/maps` with a project ref on each descriptor. Electron/CLI still pass `initialProject` (the n=1 case of the same server).
