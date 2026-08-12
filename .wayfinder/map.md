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
- [Tracker adapter interface design](tickets/004-tracker-adapter-interface.md) — adapters are plain records of Effect functions held by a detection service, auto-detected per repo (~~unioned, both live at once~~ — reversed by the map picker ticket: one repo, one tracker); three ops — `listMaps`, whole-map `loadMap`, and a `changes` stream of bare invalidation ticks. Adapters extract only metadata, a shared parser handles bodies, and `frontier`/`unblocked` are derived once in the domain so the term can't mean two things. Qualified readable ids, degrade-don't-fail with tagged errors, GitHub auth env-token-first with `gh` fallback.
- [Map graph UI prototype](tickets/005-map-graph-ui-prototype.md) — the cockpit wins: a permanent rail beside a left-to-right React Flow graph, selection shared. The list view is not a secondary mode — it is always on screen and owns what the graph structurally cannot show (out of scope, warnings) and the "what do I pick up next" ordering. Dagre over elkjs; ticket detail is an accordion in the rail; dark only; motion bridges change and never redraws the map. Variants and findings on branch `prototype/map-graph-ui`.
- [Effect.js backend architecture facts](tickets/002-effect-backend-architecture.md) — @effect/platform covers HTTP, file watching, polling, SSE/WebSocket; one shared `AppLayer` serves both Electron main (`ManagedRuntime`) and headless (`NodeRuntime.runMain`); caveats: HTTP modules "unstable", Effect 4 migration churn ahead. Facts in `research/effect-backend.md`.
- [Headless mode and Tailscale design](tickets/006-headless-tailscale-mode.md) — `foglight serve` (subcommand, not a flag) on port 4747; the Electron GUI runs the *same* HTTP server on an ephemeral port and its renderer is just a client, so headless is the default architecture rather than a side path. Identical bundle both modes, one repo at cwd, plain HTTP only. Tailscale is thin shell-outs — `--tailscale` binds `tailscale ip -4`, `--tailscale-serve` delegates HTTPS for a MagicDNS URL, torn down on exit; tsnet is Go-only. No app-layer auth: binding is the boundary, justified by v1 being read-only — see [ADR 0001](../docs/adr/0001-no-app-layer-auth-for-headless-foglight.md).
- [Live-update transport and cadence](tickets/007-live-update-transport.md) — SSE, one query-scoped connection per tab, every event a **complete snapshot** with a monotonic `revision`. The snapshot is pure *structure*; all prose (map body, ticket questions and resolutions) is fetched from gzipped per-resource endpoints and cached under `(id, bodyHash)`, prefetched after first paint. Client is TanStack Query via the `effect-query` bridge (`HttpApi` for `/api/*`, `HttpRouter` for static + SSE), subscribing before it GETs. Local watch debounces 300ms; GitHub polls ETag-conditionally at 30s foreground / 5min background / paused with zero clients, one snapshot per tick fanned out over a `PubSub`. Dagre re-runs only on structural change and the viewport never moves on its own.
- [Map picker and multi-map UX](tickets/008-map-picker-ux.md) — **one repo has one tracker**, reversing 004's union: `.wayfinder/` beats a GitHub `origin`, `--tracker` forces it, so `listMaps` never unions and `TrackerRegistry` becomes the *detected tracker*. Maps are addressed as `/?map=&ticket=` query params — no router library, no server catch-all — with an explicit `?map` beating the remembered map. The picker is a rail-header popover on `Cmd+K` (not `Cmd+P`, which fights browser print) with an always-visible filter; descriptors stay lightweight (no frontier count) and order most-recently-changed first. Last map remembered; cold start opens the only map, else the picker. Switching is a full replace and cross-fades, because a different map is a different subject, not a change.
- [npm package layout and release process](tickets/009-npm-package-layout.md) — a **pnpm monorepo publishing one package**: `core` (domain + adapters), `server`, `client`, `electron`, and the publishable `foglight` shell. Turbo + tsdown + Vite + Vitest/oxlint/oxfmt — Vite+ was chosen and then reversed at `0.2.8`, since the toolchain must be the least interesting part of a spec a build session executes blind. One bin dispatching on `serve`; `electron` a plain dependency, external to the bundle (it's resolved for its binary path); everything else bundled in, which erases every `workspace:*` dep and makes the tarball the whole download. `files: ["dist"]`, no `exports`. Node 24. Changesets from `0.x`; a `v*` tag builds, publishes with provenance over OIDC, and smoke-tests the tarball via `npx`.
- [SPEC.md assembly](tickets/010-spec-assembly.md) — [`SPEC.md`](../SPEC.md) written at the repo root: every decision folded in, corrections carried through (one tracker per repo, the snapshot/body split), the build-must-not-rediscover findings inlined. **The destination is reached** — the build and npm release proceed as a follow-on effort with the spec as their input.

## Not yet specified

<!-- empty: the way to the destination is fully charted -->

## Out of scope

- **Write operations** — claiming, closing, or editing tickets from the UI (that's a workbench, not a viewer).
- **Driving agent sessions from the UI** — launching ticket-resolving agents is a different product.
- **Hosted/SaaS deployment** — foglight runs where the repo is; no hosted service.
- **Trackers beyond local-markdown and GitHub Issues** — the adapter seam makes Linear etc. possible later, not now.
- **The build and npm release themselves** — the destination is the spec; execution is a follow-on effort.
- **Remote-connect Electron GUI** — pointing the desktop window at a remote foglight (`--connect <url>`, as t3code offers). Nearly free given the chosen architecture, and deliberately left as a later addition: headless is browser-reached in v1. Ruled out on [Headless mode and Tailscale design](tickets/006-headless-tailscale-mode.md).
- **Multi-repo serving** — one long-lived instance serving several checkouts via a repeatable `--repo`. A different product shape (it needs a repo switcher above the map picker); one repo per instance in v1. Ruled out on [Headless mode and Tailscale design](tickets/006-headless-tailscale-mode.md).
