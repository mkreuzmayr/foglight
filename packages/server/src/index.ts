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
import {
  HttpApiBuilder,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  FetchHttpClient,
} from "@effect/platform";
import type { HttpApp } from "@effect/platform";
import { NodeContext, NodeHttpServer } from "@effect/platform-node";
import {
  resolveTracker,
  idFor,
  Project,
  ProjectPathInvalid,
  NoTrackerDetected,
} from "@foglight/core";
import type { TrackerOverride } from "@foglight/core";
import { Duration, Effect, Layer } from "effect";
import { createServer } from "node:http";
import { realpath, stat } from "node:fs/promises";
import { basename } from "node:path";
import { ApiLive } from "./handlers.js";
import { extraRoutes, isApiRequest } from "./routes.js";
import * as Store from "./store.js";
import * as Session from "./session.js";

export * from "@foglight/core/api";
export * from "./store.js";
export { ProjectSession, type ProjectSessionService } from "./session.js";

export type ServerOptions = {
  /** Electron and today's CLI pass a folder; the daemon starts with none. */
  readonly initialProject?: {
    readonly path: string;
    readonly tracker?: TrackerOverride;
  };
  readonly host: string;
  /** `0` asks the OS for an ephemeral port; the GUI always does this */
  readonly port: number;
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
      : yield* extraRoutes(clientDir).pipe(
          Effect.catchTag("RouteNotFound", () =>
            Effect.succeed(HttpServerResponse.empty({ status: 404 })),
          ),
        );
  });

const openProject = (input: { readonly path: string; readonly tracker?: TrackerOverride }) =>
  Effect.gen(function* () {
    const canonical = yield* Effect.tryPromise({
      try: () => realpath(input.path),
      catch: (cause) => new ProjectPathInvalid({ path: input.path, reason: String(cause) }),
    });

    const info = yield* Effect.tryPromise({
      try: () => stat(canonical),
      catch: (cause) => new ProjectPathInvalid({ path: canonical, reason: String(cause) }),
    });

    if (!info.isDirectory()) {
      return yield* new ProjectPathInvalid({ path: canonical, reason: "not a directory" });
    }

    const resolved = yield* resolveTracker(canonical, input.tracker ?? null).pipe(Effect.either);
    if (resolved._tag === "Left") {
      if (resolved.left instanceof NoTrackerDetected) {
        return {
          project: new Project({
            id: idFor(canonical),
            name: basename(canonical),
            path: canonical,
            state: "no-tracker",
          }),
        };
      }

      return {
        project: new Project({
          id: idFor(canonical),
          name: basename(canonical),
          path: canonical,
          state: "error",
          ...(input.tracker === undefined || input.tracker === null
            ? {}
            : { trackerKind: input.tracker }),
        }),
      };
    }

    const { adapter, cadence } = resolved.right;
    const project = new Project({
      id: idFor(canonical),
      name: basename(canonical),
      path: canonical,
      state: "ready",
      trackerKind: adapter.kind,
    });

    return { project, adapter, cadence };
  });

/**
 * Detection is live: a folder that registered empty is re-probed until a
 * tracker appears (or the project detaches). Adapters stay project-blind;
 * this loop is the session's read loop for a project that has none yet.
 */
const detectUntilReady = (project: Project, override: TrackerOverride) =>
  Effect.gen(function* () {
    const session = yield* Session.ProjectSession;
    const store = yield* Store.MapStore;

    const tick = Effect.gen(function* () {
      const live = (yield* session.list).find((p) => p.path === project.path);
      if (live === undefined || live.state === "ready") {
        return true;
      }

      const resolved = yield* resolveTracker(project.path, override).pipe(Effect.either);
      if (resolved._tag === "Left") {
        return false;
      }

      const ready = new Project({
        id: project.id,
        name: project.name,
        path: project.path,
        state: "ready",
        trackerKind: resolved.right.adapter.kind,
      });

      yield* session.replace(ready);
      yield* store.add({
        adapter: resolved.right.adapter,
        project: { id: ready.id, name: ready.name },
        cadence: resolved.right.cadence,
      });

      yield* store.announceProjects(yield* session.list);

      return true;
    }).pipe(Effect.orElseSucceed(() => false));

    while (!(yield* tick)) {
      yield* Effect.sleep(Duration.millis(250));
    }
  });

export const attachProject = (input: {
  readonly path: string;
  readonly tracker?: TrackerOverride;
}) =>
  Effect.gen(function* () {
    const session = yield* Session.ProjectSession;
    const store = yield* Store.MapStore;
    const opened = yield* openProject(input);
    const project = yield* session.attach(opened.project);
    if (project !== opened.project) {
      return project;
    }

    if (opened.adapter !== undefined) {
      yield* store.add({
        adapter: opened.adapter,
        project: { id: project.id, name: project.name },
        cadence: opened.cadence,
      });
    } else {
      yield* detectUntilReady(opened.project, input.tracker ?? null).pipe(Effect.forkDaemon);
    }

    yield* store.announceProjects(yield* session.list);

    return project;
  });

export const detachProject = (input: { readonly path: string }) =>
  Effect.gen(function* () {
    const session = yield* Session.ProjectSession;
    const store = yield* Store.MapStore;
    const canonical = yield* Effect.tryPromise(() => realpath(input.path)).pipe(
      Effect.orElseSucceed(() => input.path),
    );

    const removed = yield* session.detach(canonical);
    if (removed !== undefined) {
      yield* store.remove(removed.id);
      yield* store.announceProjects(yield* session.list);
    }
  });

export const AppLayer = (options: ServerOptions) => {
  const services = Layer.unwrapEffect(
    Effect.gen(function* () {
      const initial = options.initialProject;
      if (initial === undefined) {
        return Layer.merge(Store.empty, Session.layer([]));
      }

      const opened = yield* openProject(initial);
      if (opened.adapter === undefined) {
        const base = Layer.merge(Store.empty, Session.layer([opened.project]));

        return Layer.merge(
          base,
          Layer.scopedDiscard(detectUntilReady(opened.project, initial.tracker ?? null)).pipe(
            Layer.provide(base),
          ),
        );
      }

      return Layer.merge(
        Store.layer(opened.adapter, opened.cadence, {
          id: opened.project.id,
          name: opened.project.name,
        }),
        Session.layer([opened.project]),
      );
    }),
  );

  const httpServer = NodeHttpServer.layer(createServer, {
    host: options.host,
    port: options.port,
  });

  const serving = HttpApiBuilder.serve(dispatch(options.clientDir)).pipe(
    Layer.provide(ApiLive),
    Layer.provideMerge(services),
    Layer.provide(httpServer),
    Layer.provideMerge(FetchHttpClient.layer),
    Layer.provideMerge(NodeContext.layer),
  );

  // `HttpServer` is merged back out, not just consumed: with an ephemeral port
  // the caller has no other way to learn what it got, and the Electron main
  // process cannot point a window at a port it can't read.
  return Layer.merge(serving, httpServer.pipe(Layer.provide(NodeContext.layer)));
};

/** The bound address, once the OS has assigned one. Ephemeral ports need this. */
export const boundAddress = HttpServer.HttpServer.pipe(Effect.map((server) => server.address));
