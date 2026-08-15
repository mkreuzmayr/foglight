# Effect.js backend architecture facts

Research for ticket `.wayfinder/tickets/002-effect-backend-architecture.md`.
Researched 2026-08-06 against npm-published packages (typings read directly from the
tarballs), the `@effect/platform` README, and effect.website docs.

## Version landscape (as of 2026-08-06)

| Package | `latest` on npm | Notes |
|---|---|---|
| `effect` | 3.22.1 | Core: Stream, Schedule, Layer, ManagedRuntime, PubSub |
| `@effect/platform` | 0.97.1 | Abstract HTTP/FS/Socket services; HTTP modules officially marked **unstable** |
| `@effect/platform-node` | 0.108.1 | Node implementations; depends on `ws`, `undici`, `mime` |
| `@effect/experimental` | 0.61.1 | Has an `Sse` module (encoder + decode channel) |

**Effect 4 is coming**: the `main` branch of Effect-TS/effect is `4.0.0-beta.104` and the
monorepo no longer has a separate `packages/platform` — platform abstractions merged into
core `effect` under subpath exports (`effect/unstable/http`, `effect/unstable/httpapi`,
`effect/unstable/socket`, `effect/unstable/workers`, ...), with `@effect/platform-node`
republished as `4.0.0-beta.104`. Everything below documents the stable 3.x line, which is
what effect.website documents today; expect module-path churn on the v4 migration.
(Source: `packages/effect/package.json` and package listing on the `main` branch of
[Effect-TS/effect](https://github.com/Effect-TS/effect); npm dist-tags.)

## 1. HTTP server: Vite-built static UI + JSON API

Modules (all in `@effect/platform`, implemented by `@effect/platform-node`):

- `HttpRouter` — classic router: `HttpRouter.empty.pipe(HttpRouter.get("/api/x", handler))`,
  `HttpRouter.all`, `mountApp`, prefixing. Handlers are `Effect<HttpServerResponse, E, R>`.
- `HttpLayerRouter` — newer Layer-based router (`HttpLayerRouter.add(method, path, handler)`,
  `HttpLayerRouter.serve(appLayer)`, `HttpLayerRouter.middleware`, `cors`, `addHttpApi`,
  `toWebHandler`). Good fit when the whole app is Layer-composed.
- `HttpApi` / `HttpApiGroup` / `HttpApiEndpoint` / `HttpApiBuilder` — schema-first,
  contract-derived API (Schema-validated params/payloads, derived client via
  `HttpApiClient`, OpenAPI/Swagger/Scalar via `HttpApiSwagger`/`HttpApiScalar`). For a small
  local JSON API, `HttpRouter`/`HttpLayerRouter` is the lighter choice.
- Serving: `NodeHttpServer.layer(() => createServer(), { port })` provides
  `HttpServer | HttpPlatform | Etag.Generator | NodeContext`; run with
  `NodeRuntime.runMain(Layer.launch(Layer.provide(app, ServerLive)))`.
  `NodeHttpServer.layerConfig` reads listen options from `Config`; `layerTest` gives an
  in-memory server+client for tests.
- `HttpMiddleware`: `logger`, `cors`, `xForwardedHeaders`, `searchParamsParser`, tracing
  controls. No auth/static middleware built in.

**Static files**: `HttpServerResponse.file(path, options)` — an
`Effect<HttpServerResponse, PlatformError, HttpPlatform>` that streams the file with
mime type and ETag handling (via the `Etag.Generator` supplied by `NodeHttpServer.layer`).
The README's guidance for static assets is exactly this
([platform README, "Serving static files"](https://www.npmjs.com/package/@effect/platform)).

**Gap — no static-directory middleware.** There is no `express.static` equivalent
(nothing like `serveDirectory` exists in the 0.97.1 typings). Serving a Vite `dist/`
means writing a small wildcard route yourself: `HttpRouter.get("*", ...)` that resolves
the URL path against the dist dir (using `Path` + `FileSystem.exists`, guarding against
`..` traversal), falls back to `index.html` for SPA routes, and returns
`HttpServerResponse.file`. That is ~20 lines, or wrap `sirv`/`serve-static` as a plain
Node escape hatch. This is the main "plain Node library" candidate in the HTTP area.

## 2. File watching (local markdown tracker)

- `FileSystem.watch(path, options?: { recursive?: boolean }): Stream<WatchEvent, PlatformError>`
  on the `FileSystem` service (`@effect/platform/FileSystem`).
- `WatchEvent` is a tagged union: `Create | Update | Remove`, each `{ _tag, path }` —
  **path only, no file contents or rename pairing**.
- Default Node backend (`NodeFileSystem.layer`) uses `fs.watch()`; `recursive: true`
  supported on all platforms on Node v20+ (per the doc comment in `FileSystem.d.ts`).
- Optional better backend: `@effect/platform-node/NodeFileSystem/ParcelWatcher` exports a
  `layer: Layer<WatchBackend>` backed by `@parcel/watcher` (peer dep you install
  yourself); with it, watching is always recursive.
- No built-in debounce/coalescing of editor save bursts — compose with core Stream:
  `Stream.debounce`, `Stream.groupByKey`, `Stream.filter` on `.md` extension, etc.
  chokidar is not needed unless ParcelWatcher/fs.watch prove unreliable on the target OS.

## 3. Polling GitHub on an interval

- HTTP client: `HttpClient` + `HttpClientRequest`/`HttpClientResponse` from
  `@effect/platform`. Node layers: `NodeHttpClient.layer` (node http agent),
  `NodeHttpClient.layerUndici`, or platform-agnostic `FetchHttpClient.layer`.
  `HttpClient.filterStatusOk` turns non-2xx into typed failures;
  `HttpClientResponse.schemaBodyJson(Schema)` decodes and validates the payload.
- Interval driving is core `effect`, not platform:
  - `Effect.repeat(pollEffect, Schedule.spaced("30 seconds"))` (or `Schedule.fixed`);
    `Effect.schedule` if the first run should also wait
    ([Repetition docs](https://effect.website/docs/scheduling/repetition/)).
  - `Effect.retry(Schedule.exponential(...))` / `Effect.repeatOrElse` for backoff on
    failures without killing the poll loop.
  - To get a *stream* of poll results feeding the change-event pipeline:
    `Stream.repeatEffectWithSchedule(poll, Schedule.spaced(...))`.
  - Run it as a background fiber from a Layer: `Layer.scopedDiscard(Effect.forkScoped(loop))`.
- Rate-limit/ETag conditional requests: nothing GitHub-specific exists; set
  `If-None-Match` headers manually via `HttpClientRequest.setHeader`. Octokit remains a
  valid plain-Node option (wrap calls in `Effect.tryPromise`), but plain `HttpClient`
  against the REST API avoids it entirely.

## 4. Pushing change events to the browser (SSE / WebSocket)

**SSE** — no dedicated server-side SSE response helper in `@effect/platform` 0.97.1.
The documented pattern is `HttpServerResponse.stream(stream, options)` (signature:
`<E>(body: Stream<Uint8Array, E, never>, options?) => HttpServerResponse`) with
`contentType: "text/event-stream"` and you format `data: ...\n\n` frames yourself
([platform README, "Streaming Responses"](https://www.npmjs.com/package/@effect/platform)).
`@effect/experimental/Sse` helps: it exports an `encoder` (event -> wire format) and a
`makeChannel` decoder (client side), plus `Retry` events — but it is in the
*experimental* package. Fan-out to multiple connected browsers is core Effect:
`PubSub` + `Stream.fromPubSub` per connection.

**WebSocket (server)** — supported: inside any route handler,
`HttpServerRequest.upgrade: Effect<Socket.Socket, RequestError, HttpServerRequest>`
upgrades the connection and yields a `Socket`; `HttpServerRequest.upgradeChannel()` gives
a Channel view. `@effect/platform-node` bundles `ws@^8` as a real dependency to implement
this, and also provides `NodeSocketServer` for raw (non-HTTP) socket servers. `Socket`
has `toChannel`/`toChannelString`, write queues, and typed `SocketError`/`CloseEvent`.

**WebSocket/SSE (client, renderer side)** — `Socket.makeWebSocket(url)` /
`Socket.layerWebSocket` + `Socket.WebSocketConstructor` (browser layer:
`Socket.layerWebSocketConstructorGlobal`); `@effect/platform-browser` supplies the
browser context if the renderer also runs Effect. Using plain `EventSource`/`WebSocket`
in the renderer without Effect is equally fine — the wire protocol is ordinary.

**Verdict**: SSE is the lower-friction choice here (one-directional change feed, works
through `HttpServerResponse.stream`, auto-reconnect for free with `EventSource`);
WebSockets are fully supported if bidirectionality is ever needed. No plain-Node library
required for either.

## 5. One shared runtime for Electron main + headless server

- Electron's main process **is** Node, so `@effect/platform-node` layers
  (`NodeContext.layer` = FileSystem + Path + CommandExecutor + Terminal + WorkerManager,
  `NodeHttpServer`, `NodeHttpClient`) work unchanged. There is **no Electron-specific
  package, docs page, or example anywhere in the Effect org** — this is by-hand wiring,
  but nothing about Electron requires special support.
- The documented tool for "build the app's services once, run effects from imperative
  code" is `ManagedRuntime.make(appLayer)` → `runtime.runPromise / runSync / runFork`,
  disposed with `runtime.dispose()`
  ([Runtime docs](https://effect.website/docs/runtime/)).
- Pattern that falls out for foglight:
  - `AppLayer` (shared): tracker watcher + GitHub poller + PubSub + HTTP router/server —
    everything in one `Layer`.
  - **Headless entry**: `NodeRuntime.runMain(Layer.launch(AppLayer))` — `runMain`
    installs signal handling/teardown and `Layer.launch` keeps the layer alive forever.
  - **Electron entry**: `const rt = ManagedRuntime.make(AppLayer)` in the main process;
    kick the server with `rt.runFork(...)` (or launch the same layer), call
    `rt.runPromise` from IPC handlers if the UI talks over Electron IPC instead of HTTP,
    and `await rt.dispose()` in `app.on("will-quit")`. `ManagedRuntime` memoizes the
    layer build, so both faces share the same service instances.
  - The Electron renderer just loads `http://localhost:<port>` (same Vite bundle the
    headless server serves), which keeps the two deployment modes on one code path.

## Gaps summary (where plain Node fills in)

| Need | Effect coverage | Gap / plain-Node fallback |
|---|---|---|
| Static dir serving | `HttpServerResponse.file` + ETags | No directory middleware; write wildcard route or wrap `sirv` |
| File watching | `FileSystem.watch` Stream; ParcelWatcher backend | Debounce/coalesce yourself (core Stream ops); install `@parcel/watcher` if `fs.watch` misbehaves |
| GitHub polling | `HttpClient` + `Schedule` fully cover it | Octokit only if you want typed endpoints/pagination helpers |
| SSE | `HttpServerResponse.stream`; `@effect/experimental/Sse` encoder | No stable first-class SSE response helper; frame formatting is manual (trivial) |
| WebSocket | `HttpServerRequest.upgrade` + `Socket` (ws bundled) | None |
| Electron | All platform-node layers work; `ManagedRuntime` for imperative edges | No official Electron integration/docs; lifecycle wiring is by hand |
| Stability | Core + FileSystem stable | All HTTP/Socket modules officially "unstable"; Effect 4 beta will move them into core `effect` |

## Sources

- `@effect/platform@0.97.1` README and `dist/dts` typings (npm tarball):
  <https://www.npmjs.com/package/@effect/platform>
- `@effect/platform-node@0.108.1` typings + `package.json` deps (npm tarball):
  <https://www.npmjs.com/package/@effect/platform-node>
- `@effect/experimental@0.61.1` `Sse.d.ts` (npm tarball):
  <https://www.npmjs.com/package/@effect/experimental>
- Effect platform intro (stability, package split):
  <https://effect.website/docs/platform/introduction/>
- Runtime / ManagedRuntime docs: <https://effect.website/docs/runtime/>
- Repetition/Schedule docs: <https://effect.website/docs/scheduling/repetition/>
- Effect 4 restructuring: `main` branch of <https://github.com/Effect-TS/effect>
  (`packages/effect/package.json` at `4.0.0-beta.104`, subpath exports; no
  `packages/platform`); npm dist-tags for `effect` (`beta: 4.0.0-beta.104`).
- Platform-node examples referenced by docs:
  <https://github.com/Effect-TS/effect/blob/main/packages/platform-node/examples/http-server.ts>
