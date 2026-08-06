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

## Not yet specified

- **Live-update mechanics** — transport (websocket vs Electron IPC), GitHub polling cadence, file-watch debounce; hangs on the adapter interface and headless design.
- **Map picker UX** — how multiple maps are listed and chosen; hangs on the UI prototype.
- **Ticket detail view** — what clicking a node reveals (body, resolution, assets) and how; hangs on the UI prototype.
- **CLI surface** — `npx foglight` flags (`--headless`, `--port`, repo path, tracker override); hangs on headless design and packaging research.
- **npm package layout & release process** — bin entries, Electron binary handling, CI, versioning; hangs on the Electron-via-npx packaging research.
- **SPEC.md assembly** — the closing act: fold every decision into the spec once the rest of the map is walked.

## Out of scope

- **Write operations** — claiming, closing, or editing tickets from the UI (that's a workbench, not a viewer).
- **Driving agent sessions from the UI** — launching ticket-resolving agents is a different product.
- **Hosted/SaaS deployment** — foglight runs where the repo is; no hosted service.
- **Trackers beyond local-markdown and GitHub Issues** — the adapter seam makes Linear etc. possible later, not now.
- **The build and npm release themselves** — the destination is the spec; execution is a follow-on effort.
