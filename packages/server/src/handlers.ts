/**
 * Handlers for the `/api/*` contract. Thin by design: everything interesting
 * about liveness, revisions and caching lives in `MapStore`, and everything
 * interesting about a tracker lives behind the adapter seam.
 *
 * Bodies are served **gzipped** (SPEC.md §6). They are the large half of the
 * payload and they are markdown, which compresses very well; the snapshot is
 * small and moves constantly, so it is left alone.
 */
import { HttpApiBuilder } from "@effect/platform";
import { makeId, MapNotFound, TrackerUnreachable, type ResourceId } from "@foglight/core";
import { Effect, Layer } from "effect";
import { FoglightApi } from "@foglight/core/api";
import { MapStore } from "./store.js";

const decodeId = (raw: string): ResourceId => makeId(decodeURIComponent(raw));

/**
 * The adapter's error channel is wider than any one endpoint's declared errors
 * (a `loadMap` may raise `MapUnparseable`, a body fetch may not). Anything not
 * in an endpoint's set is reported as the honest thing it is — the tracker
 * could not answer — rather than crashing the request with a defect.
 */
const asTrackerError = (kind: string) => (cause: unknown) =>
  cause instanceof MapNotFound || (typeof cause === "object" && cause !== null && "_tag" in cause)
    ? (cause as never)
    : (new TrackerUnreachable({ tracker: kind, reason: String(cause) }) as never);

export const MapsHandlers = HttpApiBuilder.group(FoglightApi, "maps", (handlers) =>
  Effect.gen(function* () {
    const store = yield* MapStore;
    const fail = asTrackerError(store.adapter.kind);

    return handlers
      .handle("list", () => store.adapter.listMaps().pipe(Effect.mapError(fail)))
      .handle("snapshot", ({ path }) =>
        store.snapshot(decodeId(path.id)).pipe(Effect.mapError(fail)),
      )
      .handle("body", ({ path }) =>
        store.adapter.loadMapBody(decodeId(path.id)).pipe(Effect.mapError(fail)),
      )
      .handle("ticketBody", ({ path }) =>
        store.adapter
          .loadTicketBody(decodeId(path.id), decodeId(path.tid))
          .pipe(Effect.mapError(fail)),
      );
  }),
);

export const ApiLive = Layer.provide(HttpApiBuilder.api(FoglightApi), MapsHandlers);
