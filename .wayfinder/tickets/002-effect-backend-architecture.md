---
title: "Effect.js backend architecture facts"
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

What does the Effect ecosystem (current @effect/platform and friends) offer for foglight's backend — an HTTP server serving the Vite-built UI, file watching for the local-markdown tracker, GitHub API polling, and pushing change events to the browser (SSE/websocket)? How does one Effect runtime serve both an Electron main process and a headless server? Surface the concrete modules, patterns, and any gaps the architecture decision waits on.

_Findings will land in `research/effect-backend.md`._

## Resolution

The Effect ecosystem covers nearly everything — findings in [`research/effect-backend.md`](../../research/effect-backend.md) (verified 2026-08-06, effect 3.22.1 / @effect/platform 0.97.1):

- **HTTP**: `HttpRouter`/`HttpLayerRouter` + `NodeHttpServer.layer`; static files via `HttpServerResponse.file` (no directory middleware — a ~20-line wildcard route or wrapped `sirv` serves the Vite dist).
- **File watching**: `FileSystem.watch` returns a `Stream<WatchEvent>`; debounce with core Stream ops; `@parcel/watcher` backend available.
- **GitHub polling**: `HttpClient` + `Schedule.spaced` + `Stream.repeatEffectWithSchedule`, forked from a Layer.
- **Push to browser**: SSE is the low-friction pick (`HttpServerResponse.stream` + `PubSub` fan-out; `@effect/experimental/Sse` has an encoder); WebSockets fully supported via `HttpServerRequest.upgrade` if ever needed.
- **One runtime, two faces**: shared `AppLayer`; headless entry = `NodeRuntime.runMain(Layer.launch(AppLayer))`; Electron main = `ManagedRuntime.make(AppLayer)` with dispose on quit; the Electron renderer loads the same served UI, keeping one code path. No official Electron integration exists — wiring is by hand but unproblematic.
- **Caveats for the spec**: all HTTP/Socket modules are officially "unstable", and Effect 4 (in beta) folds platform into core with new module paths — expect migration churn.
