/**
 * The routes that cannot be an `HttpApi` (SPEC.md §6, "Server stack"):
 *
 *   - **`GET /api/events`** — a perpetual stream, not a request/response shape.
 *   - **the static `dist/` wildcard** — a file route has no schema to declare.
 *
 * Both are deliberately small. The static route is the ~20 lines the spec
 * budgets for it, and the SSE route's only real job is to turn the store's
 * subscription into text frames.
 */
import { Headers, HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Sse } from "@effect/experimental";
import { makeId } from "@foglight/core";
import { Duration, Effect, Schedule, Stream } from "effect";
import { MapStore } from "./store.js";
import type { ServerEvent } from "./store.js";
import { ProjectSession } from "./session.js";

/** Comment frames keep proxies and `tailscale serve` from reaping an idle stream. */
const PING_INTERVAL = Duration.seconds(20);
/** Told to the browser explicitly rather than left to `EventSource`'s default. */
const RETRY_MS = 2000;

const payload = (event: ServerEvent) => {
  switch (event._tag) {
    case "maps":
      return { maps: event.maps };

    case "projects":
      return { projects: event.projects };

    case "map":
      return event.snapshot;

    default:
      return assertUnreachable(event);
  }
};

const frame = (event: ServerEvent): string =>
  Sse.encoder.write({
    _tag: "Event",
    event: event._tag,
    id: event._tag === "map" ? String(event.snapshot.revision) : undefined,
    data: JSON.stringify(payload(event)),
  });

/**
 * `GET /api/events?map=<id>` — one connection per tab, scoped to one map.
 *
 * The subscriber set **is** the server's presence signal: `MapStore` reads
 * client count and which map is foregrounded straight off it, and feeds the
 * GitHub poll cadence from that. So opening and closing this stream is not
 * merely a client concern — it is what makes an unattended instance idle.
 */
const events = Effect.gen(function* () {
  const store = yield* MapStore;
  const session = yield* ProjectSession;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const params = new URL(request.url, "http://localhost").searchParams;
  const raw = params.get("map");
  const mapId = raw === null || raw.length === 0 ? null : makeId(decodeURIComponent(raw));

  const body = Stream.concat(
    Stream.succeed(`retry: ${RETRY_MS}\n\n`),
    Stream.concat(
      Stream.fromEffect(
        session.list.pipe(Effect.map((projects) => frame({ _tag: "projects", projects }))),
      ),
      Stream.merge(
        store.subscribe(mapId).pipe(Stream.map(frame)),
        Stream.repeatValue(": ping\n\n").pipe(Stream.schedule(Schedule.spaced(PING_INTERVAL))),
      ),
    ),
  ).pipe(Stream.encodeText);

  return HttpServerResponse.stream(body, {
    contentType: "text/event-stream",
    headers: Headers.fromInput({
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx and friends buffer streams into uselessness without this.
      "x-accel-buffering": "no",
    }),
  });
});

const CONTENT_TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".ico": "image/x-icon",
  }),
);

/**
 * The client bundle. Hashed assets are immutable and cached forever; the entry
 * document is not, or a rebuilt bundle would never reach an open tab.
 *
 * There is **no SPA catch-all beyond `index.html`**: addressing is two query
 * params, not path routes (SPEC.md §9), so any unmatched path is a genuine 404
 * rather than something to hand the client router.
 */
const staticFiles = (clientDir: string) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = path === "/" ? "index.html" : path.replace(/^\/+/, "");

    // Nothing may escape the bundle directory.
    if (relative.includes("..")) {
      return HttpServerResponse.empty({ status: 404 });
    }

    const extension = relative.slice(relative.lastIndexOf("."));
    const contentType = CONTENT_TYPES.get(extension) ?? "application/octet-stream";
    const immutable = /-[A-Za-z0-9_-]{8,}\./.test(relative);

    return yield* HttpServerResponse.file(`${clientDir}/${relative}`, {
      headers: Headers.fromInput({
        "content-type": contentType,
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      }),
    }).pipe(
      Effect.catchAll(() =>
        relative === "index.html"
          ? Effect.succeed(
              HttpServerResponse.text(
                "foglight: the client bundle is missing from this install (expected dist/client/index.html).",
                { status: 500 },
              ),
            )
          : Effect.succeed(HttpServerResponse.empty({ status: 404 })),
      ),
    );
  });

export const extraRoutes = (clientDir: string) =>
  HttpRouter.empty.pipe(
    HttpRouter.get("/api/events", events),
    HttpRouter.get("/healthz", HttpServerResponse.text("ok")),
    HttpRouter.get("/*", staticFiles(clientDir)),
    HttpRouter.get("/", staticFiles(clientDir)),
  );

/**
 * `/api/events` is on the router, everything else under `/api/` is on the
 * `HttpApi` — this is the one line that decides which of the two answers.
 */
export const isApiRequest = (url: string): boolean =>
  url.startsWith("/api/") && !url.startsWith("/api/events");

const assertUnreachable = (event: never): never => {
  throw new Error(`Unexpected server event: ${String(event)}`);
};
