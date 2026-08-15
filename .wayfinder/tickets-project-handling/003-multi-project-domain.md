---
title: "Multi-project domain and API rework"
labels: [wayfinder:grilling]
status: closed
assignee: Michael Kreuzmayr
blocked-by: []
---

## Question

Decide how *project* enters the core domain and the HTTP/SSE surface, which today assume one repo at cwd:

- Shape of the Project entity and how qualified ids grow a project dimension (`local:.wayfinder/map.md` is repo-relative — how does it stay stable and unique across projects?).
- `?map=` addressing: does the URL gain a project param, or do map ids become project-qualified so one param still suffices? Remembered-map behavior across projects.
- Per-project tracker detection, watcher/poller, and snapshot lifecycle: one SSE stream per tab spanning projects, or per-project scoping? How project add/remove itself becomes a change signal the picker reacts to.
- What `listMaps` aggregates across projects and what the descriptor carries so the picker can group.
- Registration API: how the daemon-side server exposes add/remove-project to attachers while staying a read-only *viewer* toward trackers.

## Resolution

Grilled 2026-08-14; every decision below was put to Michael explicitly.

- **Project entity.** Identity is a slug of the folder basename plus a short hash of the canonical path (`foglight-3f2a`) — readable, unique, and stable across sessions so remembered maps and bookmarked URLs survive re-attach. Display name is the plain basename, disambiguated in the UI only on collision. Registration is idempotent by canonical path (same folder twice = same project; refcounting attachers belongs to the lifecycle ticket). Toward the browser a project is `{ id, name, path, state, trackerKind? }` with `state: ready | no-tracker | error`; the absolute path is carried deliberately — the same audience already sees full map contents, and it is the honest disambiguator.
- **Ids.** Every `ResourceId` gains a **uniform** project prefix: `<project-id>:<existing-id>`, e.g. `foglight-3f2a:local:.wayfinder/map.md`, `foglight-3f2a:github:owner/repo#42`. The first segment before the first `:` is always the project — unambiguous because the prefix is uniform. A resource means "this map *as seen through* this project": two checkouts of one GitHub repo are two resources (their local `.wayfinder/` state can genuinely differ). Deduping identical GitHub maps across checkouts is fog until it hurts.
- **Addressing.** No `?project=` param: `?map=` alone still suffices because ids are project-qualified — one opaque string, no expressible-but-invalid param pairs. Anything needing the project dimension structurally reads it off the descriptor, never by parsing ids. Remembered-map stores the qualified id; if its project isn't attached on load, fall back to the picker (or the sole map — the picker ticket's cold-start rule) and *keep* the remembered id in case the project attaches later. Never silently open a different project's map.
- **Detection is live, per project.** A folder with no detectable tracker **registers anyway** as an empty project with a warning; the attacher warns once and stays resident. Detection re-runs as part of the project's normal read loop, so a `.wayfinder/` created later (e.g. by an agent charting a map) brings the project alive via a `projects` event; a tracker that disappears demotes the project back to empty-with-warning. Degrade, don't fail, symmetric both ways.
- **Streams.** One `/api/events` connection per tab, shape unchanged (`?map=` now project-qualified), plus a new `projects` event carrying the complete project list — same "every event is a complete truth" rule. Project attach/detach is thereby a change signal exactly like a tracker tick, and the subscriber-set-as-presence reading stays intact.
- **Cadence.** Per-project adapter + cadence: presence is computed per project from which map ids are subscribed, so a GitHub project polls fast only while one of *its* maps is on screen and unattended projects cost nothing.
- **`listMaps`.** `GET /api/maps` stays one flat aggregated list; `MapDescriptor` gains a project reference (id + name) and the picker groups client-side. A failing project contributes zero descriptors plus a warning — the list never fails whole.
- **Registration surface.** Attacher-channel only: add/remove-project rides the privileged local channel the lifecycle ticket picks (constraint appended there); the browser-facing HTTP API stays read-only end to end.
- **Electron.** One code path: the server always speaks projects, and Electron auto-registers its folder as the sole project — single-project is the n=1 case (whether the client hides grouping at n=1 is the picker prototype's call).

CONTEXT.md updated alongside: **Detected tracker** resharpened (one tracker per *project*; adapters do run side by side across projects), **Empty project** added.
