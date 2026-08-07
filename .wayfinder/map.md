---
title: "Foglight — wayfinder map viewer"
labels: [wayfinder:map]
---

## Destination

A complete `SPEC.md` at this repo's root for foglight v1: a read-only wayfinder map viewer — Vite + React + shadcn/tailwind with a t3code-like aesthetic, Effect.js backend, Electron shell launched via `npx foglight`, plus a headless server mode for VPS/VMs with Tailscale support (as t3code has) — rendering the map as a live-updating dependency graph in exact wayfinder vocabulary, reading trackers through a pluggable adapter interface (local-markdown and GitHub Issues via gh CLI / GITHUB_TOKEN auth built in), with a map picker for multi-map repos. Build and npm release happen after this map, outside it.

## Notes

- Planning only (wayfinder default): tickets resolve decisions; the build is a follow-on effort.
- Fixed stack constraints (user-set, not up for re-decision): Vite + React, shadcn/tailwind styled like t3code, Effect.js backend, Electron via `npx foglight`, headless mode with Tailscale support, npm as the release channel. The npm name `foglight` was unclaimed as of 2026-08-06.
- v1 is strictly read-only: foglight never writes to the tracker.
- UI vocabulary reuses wayfinder's terms exactly (destination, frontier, fog, decisions so far, out of scope) — see `CONTEXT.md`.
- Skills to consult per session: `/grilling` + `/domain-modeling` for decisions, `/prototype` for UI questions, `/research` for external facts.
- Tracker conventions for this repo: `.wayfinder/TRACKER.md`.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Graph rendering library options](tickets/003-graph-rendering-library.md) — React Flow (@xyflow/react) is the clear DOM/tailwind-friendly candidate; layout engine (dagre vs elkjs vs d3-dag) stays open for the UI prototype. Facts in `research/graph-rendering.md`.
- [Electron-via-npx packaging feasibility](tickets/001-electron-via-npx-packaging.md) — feasible: Electron ≥42 downloads its binary lazily on first launch, so `electron` can be a plain dependency (~1 MB on headless installs); bin runs under Node and spawns `require('electron')` for the GUI. Facts in `research/electron-npx-packaging.md`.
- [Tracker adapter interface design](tickets/004-tracker-adapter-interface.md) — adapters are plain records of Effect functions held by a `TrackerRegistry` service, auto-detected and unioned (both trackers can be live at once); three ops — `listMaps`, whole-map `loadMap`, and a `changes` stream of bare invalidation ticks. Adapters extract only metadata, a shared parser handles bodies, and `frontier`/`unblocked` are derived once in the domain so the term can't mean two things. Qualified readable ids, degrade-don't-fail with tagged errors, GitHub auth env-token-first with `gh` fallback.
- [Map graph UI prototype](tickets/005-map-graph-ui-prototype.md) — the cockpit wins: a permanent rail beside a left-to-right React Flow graph, selection shared. The list view is not a secondary mode — it is always on screen and owns what the graph structurally cannot show (out of scope, warnings) and the "what do I pick up next" ordering. Dagre over elkjs; ticket detail is an accordion in the rail; dark only; motion bridges change and never redraws the map. Variants and findings on branch `prototype/map-graph-ui`.
- [Effect.js backend architecture facts](tickets/002-effect-backend-architecture.md) — @effect/platform covers HTTP, file watching, polling, SSE/WebSocket; one shared `AppLayer` serves both Electron main (`ManagedRuntime`) and headless (`NodeRuntime.runMain`); caveats: HTTP modules "unstable", Effect 4 migration churn ahead. Facts in `research/effect-backend.md`.

## Not yet specified

- **CLI surface** — `npx foglight` flags (`--headless`, `--port`, repo path, tracker override); hangs on headless design and packaging research.
- **npm package layout & release process** — bin entries, Electron binary handling, CI, versioning; hangs on the Electron-via-npx packaging research.
- **SPEC.md assembly** — the closing act: fold every decision into the spec once the rest of the map is walked.

## Out of scope

- **Write operations** — claiming, closing, or editing tickets from the UI (that's a workbench, not a viewer).
- **Driving agent sessions from the UI** — launching ticket-resolving agents is a different product.
- **Hosted/SaaS deployment** — foglight runs where the repo is; no hosted service.
- **Trackers beyond local-markdown and GitHub Issues** — the adapter seam makes Linear etc. possible later, not now.
- **The build and npm release themselves** — the destination is the spec; execution is a follow-on effort.
