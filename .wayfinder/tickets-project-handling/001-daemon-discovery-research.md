---
title: "Cross-platform daemon spawn and discovery facts"
labels: [wayfinder:research]
status: closed
assignee: Michael Kreuzmayr
blocked-by: []
---

## Question

Surface the facts the daemon–attacher lifecycle decision waits on, for Linux, macOS, and Windows, from primary sources:

- **Detached spawn from Node**: `child_process.spawn` with `detached`, `windowsHide`, `stdio: 'ignore'`, `unref()` — what actually survives terminal close / logout on each platform, and the Windows quirks (job objects, console attachment).
- **Single-instance discovery**: conventions for a lock/state file recording pid + port (`XDG_RUNTIME_DIR`, macOS `~/Library/Application Support` vs `$TMPDIR`, Windows `%LOCALAPPDATA%`); atomic creation so two simultaneous first-serves race safely; stale-lock detection (pid liveness probe vs health-checking the recorded port).
- **Attacher liveness channel**: unix domain sockets vs Windows named pipes (`\\.\pipe\...` via Node `net`) vs a long-lived localhost TCP/HTTP connection — specifically how reliably the daemon observes abrupt attacher death (SIGKILL, terminal close, machine sleep) as a socket close on each platform.
- **Prior art**: how the Gradle daemon, Nx daemon, Turborepo daemon, and Watchman implement exactly this pattern (spawn, discovery file layout, idle/last-client shutdown), and what they warn about.
- **Effect ecosystem fit**: what `@effect/platform`/`@effect/platform-node` offer for sockets/named pipes/process spawn, and where plain Node APIs must be used instead.

Capture findings in `research/daemon-discovery.md`.

## Resolution

Findings captured in [`research/daemon-discovery.md`](../../research/daemon-discovery.md) (2026-08-14, primary sources throughout). Headlines the lifecycle decision should absorb:

- **Detached spawn survives terminal close on all three platforms, but not logout.** `spawn` with `detached + stdio:'ignore' + unref()` outlives the terminal everywhere; logout kills the daemon by OS design on Windows and macOS, and on Linux depends on logind `KillUserProcesses`. A per-login-session daemon is the honest ceiling without launchd/systemd services — which fits the already-settled session-scoped persistence constraint.
- **Windows caveat:** libuv refuses `CREATE_BREAKAWAY_FROM_JOB`, so an attacher inside a kill-on-close job object (CI, some terminal hosts) takes its "detached" daemon down with it.
- **Lock atomicity:** `fs.open(path, 'wx')` (O_EXCL) is atomic on every platform; Node's Windows rename has no documented atomicity guarantee — prefer O_EXCL claim files over rename-replace.
- **Liveness is free with a connected stream socket:** POSIX guarantees fd closure on any termination (incl. SIGKILL) and Windows surfaces broken pipes promptly, so the daemon sees abrupt attacher death as a socket close everywhere. App-level pings only needed to bound latency around sleep/wake.
- **Prior art (Gradle/Nx/Turborepo/Watchman) converges:** state file is a hint, validated by connect+handshake; all use hours-scale idle timers (3–4h) rather than exit-on-last-disconnect — worth weighing against our last-detach-shutdown constraint. Notable: Watchman uses launchd on macOS; Turborepo uses AF_UNIX sockets even on Windows; named pipes self-delete with their process (existence ≈ liveness) while UDS files persist and need pre-bind unlink; keep socket paths under ~104 bytes.
- **Effect fit:** sockets/`'wx'` file creation are covered (`NodeSocket`/`NodeSocketServer`, `FileSystem.OpenFlag "wx"`), but Effect's `Command` has no `detached`/`windowsHide`/`unref` — the one daemon-spawn call must be raw `child_process.spawn` at the edge.
