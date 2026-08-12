---
title: "npm package layout and release process"
labels: [wayfinder:grilling]
status: closed
assignee: michaelk
blocked-by: [1, 6]
---

## Question

Graduated from fog: the packaging _facts_ are in hand from [Electron-via-npx packaging feasibility](001-electron-via-npx-packaging.md), and [Headless mode and Tailscale design](006-headless-tailscale-mode.md) settled that one identical bundle serves both modes. What remains is the shape of the published artifact.

Pin down: the `bin` entries and how `foglight` dispatches between the default GUI launch and `foglight serve` (one bin with a subcommand, or two); how the Electron dependency is declared given that ≥42 fetches its binary lazily — plain dependency, optional, or `ELECTRON_SKIP_BINARY_DOWNLOAD` on headless installs — and what a VPS `npx foglight serve` actually downloads; what ships in `files` (the built `dist/`, the compiled server, nothing else) and whether the repo is a monorepo or a single package; the build step that produces both halves; Node engine floor; versioning and changelog policy; and what CI does on a tag.

Note the destination rules the _release itself_ out of scope — this ticket decides the layout the spec describes, not the act of publishing.

Grill with /grilling + /domain-modeling.

## Resolution

### Repo shape

A **pnpm monorepo publishing exactly one package**. Root `package.json` is `private: true`; five workspace packages:

- **`packages/core`** — the domain: wayfinder vocabulary, snapshot schema, the `frontier`/`unblocked` derivation, and the tracker adapters from [Tracker adapter interface design](004-tracker-adapter-interface.md). Separate from `server` because the client imports its _types_; a shared package is what stops that becoming a deep relative import into the server, and it is the one piece that could plausibly go public later for third-party adapters.
- **`packages/server`** — Effect HTTP, SSE, file watching and GitHub polling.
- **`packages/client`** — the Vite/React cockpit from [Map graph UI prototype](005-map-graph-ui-prototype.md); depends on `core` for types only.
- **`packages/electron`** — the Electron main process (window spawning, lifecycle).
- **`packages/foglight`** — the **only published package**: the `bin`, argv dispatch, and the assembled build.

**pnpm**, pinned via `packageManager`. Its strict `node_modules` is the thing that actually enforces the five-package boundary — under a hoisting manager, `client` can import from `server` undeclared and nothing fails until publish.

### Toolchain

**Turborepo for tasks, tsdown (Rolldown) for the Node bundle, Vite for the client, Vitest + oxlint + oxfmt for test and lint.**

Vite+ was chosen mid-grilling and then **reversed**: `vite-plus` is at `0.2.8` (published 2026-08-05) with an active `alpha` dist-tag, and this map's destination is a spec a build session executes with no other input — so the toolchain must be the _least_ interesting part of it. A bug in `vp pack` would be indistinguishable from a config error or from Effect's already-flagged unstable HTTP modules, and the map's instability budget is spent. What is given up is config unification only: `vp run` is Turborepo's job and **`vp pack` wraps tsdown**, so depending on tsdown directly yields the same Rolldown output without the pre-1.0 wrapper. Turbo's caching is close to noise at five packages; it is taken anyway because it is boring, universally understood, and stops being a decision the moment a sixth package appears. oxlint/oxfmt are the same standalone VoidZero tools Vite+ bundles, and are far more settled than the toolchain wrapping them.

**Node engine floor: 24**, declared in `engines` without `engine-strict` (a warning, not a hard failure). This is a dev tool run via `npx` by people already on modern Node; Electron 43 ships Node 22+ internally, and Effect's newer APIs assume a recent runtime.

### The published artifact

- **One `bin`, `foglight`**, dispatching on `argv[2]`: `serve` → headless, absent → spawn Electron. The user-facing surface was already fixed by [Headless mode and Tailscale design](006-headless-tailscale-mode.md), and npx behaves most predictably with a single bin matching the package name. A second bin would be a second documented name for zero new capability.
- **`electron` is a plain `dependency`.** Since Electron 42 the install is ~1 MB and the 120–145 MB binary is lazy, so `optionalDependencies` buys nothing on size while adding a "GUI silently unavailable" failure class.
- **`tsdown` bundles `core`, `server`, the electron main process and the npm runtime deps (`effect`, `@effect/platform`) _in_; `electron` stays external.** Bundling is what erases every `workspace:*` dependency, so the published package resolves none and npm's private-workspace-package problem never arises. It also cuts the `npx` cold-start install, which is the cost users actually feel from a tool whose whole pitch is `npx foglight`. `electron` must stay external because it is resolved for its **binary path**, not its code.
- **`files: ["dist"]`** (README and LICENSE are included by npm automatically). Inside: `dist/cli.js` (the bin), `dist/electron/main.js`, `dist/client/` (the Vite bundle, served as static assets by the same HTTP server in both modes — per 006 there is exactly one copy, not a desktop build and a web build). No `src`, no sourcemaps, and **no `exports` field**: this package is a CLI, not an import target, and declaring public entry points would invent an API surface nobody asked for.

### Release process

- **Semver via Changesets, starting at `0.x`.** Contributors write release intent at PR time; a release PR accumulates them and generates `CHANGELOG.md`. `0.x` until the first real build validates the spec — that build will find things the spec got wrong, and `0.x` buys room to fix them without a major per correction.
- **On a `v*` tag**, CI runs the full build and tests, then `npm publish --provenance` over **OIDC trusted publishing** — no long-lived `NPM_TOKEN` in repo secrets. Provenance links the npm page back to the commit, which is worth something for a tool people run via `npx` without reading.
- **A smoke job `npx`s the resulting tarball and hits `foglight serve`.** A broken bin or a mis-declared `files` is invisible to unit tests and visible to every user.

### Facts the spec must carry so the build never rediscovers them

- Because `effect` and friends are bundled, **the tarball is the entire download for headless users** — a VPS `npx foglight serve` pulls the tarball plus the ~1 MB `electron` shim and never touches the Electron binary. The same fact keeps the Linux CI publish job fast.
- **The first GUI launch on an offline or GitHub-unreachable machine fails at launch, not at install.** That error message must name `ELECTRON_MIRROR` and point at `foglight serve` as the working alternative.
- Also from 001, for the spec's caveats section: no signed/Gatekeeper app via this channel, and the Electron zip costs 2–3× its download size on disk.

### Consequences for the map

- No new tickets and no fog graduated — **Not yet specified** was already empty. [SPEC.md assembly](010-spec-assembly.md) is now unblocked and is the last ticket on the map.
