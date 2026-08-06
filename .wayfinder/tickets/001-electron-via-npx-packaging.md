---
title: "Electron-via-npx packaging feasibility"
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

How does an Electron app get shipped so `npx foglight` launches it, and can the same npm package also run headless (no Electron) on a VPS? Specifically: Electron as an npm dependency vs prebuilt binaries, download size and first-run cost of npx-fetching Electron, making Electron an optional dependency so headless installs skip the ~100MB+ binary, and precedents of npm packages that do this well. Surface the facts the packaging and headless-mode decisions wait on.

_Findings will land in `research/electron-npx-packaging.md`._

## Resolution

Feasible, and easier than expected — findings in [`research/electron-npx-packaging.md`](../../research/electron-npx-packaging.md) (verified 2026-08-06, electron 43.3.0):

- Since **Electron 42**, the `electron` npm package (~1.1 MB) no longer downloads its ~120–145 MB binary at install; the binary fetches lazily on first actual launch. So `electron` can be a **plain regular dependency**: headless VPS installs pay ~1 MB and never trigger the binary; GUI users pay a one-time download on first launch (cached per version). `optionalDependencies` is unnecessary for the size goal.
- Canonical bin pattern (as `react-devtools` does): the bin runs under plain Node; `require('electron')` from Node returns the executable path, which the script `spawn`s with the app dir. Headless mode simply runs the server in-process and never touches electron. Runtime detection inside the app: `process.versions.electron`.
- npx mechanics: package should ship a single `bin` (or one named `foglight`); npx caches in `~/.npm/_npx/`, so repeat runs are near-instant.
- Cons to note in the spec: first GUI launch needs GitHub Releases reachability (`ELECTRON_MIRROR` mitigates), 2–3× zip size on disk, no signed/Gatekeeper app via this channel.
