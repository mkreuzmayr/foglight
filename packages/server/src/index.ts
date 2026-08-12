/**
 * The shared `AppLayer` (SPEC.md §2).
 *
 * **There is exactly one architecture.** This layer is the whole of it: an
 * Effect HTTP server serving the API, the SSE feed and the static client
 * bundle. Headless launches it with `NodeRuntime.runMain`; the Electron main
 * process launches the *same layer* with `ManagedRuntime` on an ephemeral port
 * and points a `BrowserWindow` at it. The desktop window is a client, not a
 * second code path — which is why headless is the default shape rather than a
 * side door.
 */
import { HttpApiBuilder, HttpServer, HttpServerRequest, type HttpApp } from "@effect/platform";
import { NodeContext, NodeHttpServer } from "@effect/platform-node";
import { FetchHttpClient } from "@effect/platform";
import { resolveTracker, type TrackerOverride } from "@foglight/core";
import { Effect, Layer } from "effect";
import { createServer } from "node:http";
import { ApiLive } from "./handlers.js";
import { extraRoutes, isApiRequest } from "./routes.js";
import * as Store from "./store.js";

export * from "@foglight/core/api";
export * from "./store.js";

export type ServerOptions = {
  /** the one repo this instance serves — one repo per instance, always */
  readonly repoRoot: string;
  readonly host: string;
  /** `0` asks the OS for an ephemeral port; the GUI always does this */
  readonly port: number;
  readonly tracker: TrackerOverride;
  /** where the built client bundle sits on disk */
  readonly clientDir: string;
};

/**
 * `HttpApi` answers `/api/*`; the router answers everything else. Splitting on
 * the path rather than on a 404 fallback keeps a genuine API 404 a 404 instead
 * of quietly serving it `index.html`.
 */
const dispatch = (clientDir: string) => (apiApp: HttpApp.Default) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    return isApiRequest(new URL(request.url, "http://localhost").pathname)
      ? yield* apiApp
      : yield* extraRoutes(clientDir);
  });

export const AppLayer = (options: ServerOptions) => {
  const tracker = Layer.unwrapEffect(
    resolveTracker(options.repoRoot, options.tracker).pipe(
      Effect.map(({ adapter, cadence }) => Store.layer(adapter, cadence)),
    ),
  );

  const httpServer = NodeHttpServer.layer(createServer, {
    host: options.host,
    port: options.port,
  });

  const serving = HttpApiBuilder.serve(dispatch(options.clientDir) as never).pipe(
    Layer.provide(ApiLive),
    Layer.provide(tracker),
    Layer.provide(httpServer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(NodeContext.layer),
  );

  // `HttpServer` is merged back out, not just consumed: with an ephemeral port
  // the caller has no other way to learn what it got, and the Electron main
  // process cannot point a window at a port it can't read.
  return Layer.merge(serving, httpServer.pipe(Layer.provide(NodeContext.layer)));
};

/** The bound address, once the OS has assigned one. Ephemeral ports need this. */
export const boundAddress = HttpServer.HttpServer.pipe(Effect.map((server) => server.address));
