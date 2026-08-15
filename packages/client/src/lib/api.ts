/**
 * The data layer (SPEC.md §6, "Client stack").
 *
 * The rule that shapes this whole file: **subscribe first, then GET.** The
 * `EventSource` opens before the typed GET fires, so a change landing between
 * the two is delivered rather than lost — and because every event is a
 * complete snapshot carrying a monotonic `revision`, a GET that resolves older
 * than the newest pushed revision is simply discarded. There is exactly one
 * decode path and exactly one diff site.
 *
 * **`effect-query` is pinned to `0.2.x`, not `1.x`.** `1.0.0` is built against
 * Effect 4 (`peerDependencies: effect ^4.0.0-beta`) and reaches for
 * `Cause.findErrorOption` and `Effect.tapCause`, neither of which exists in
 * the effect 3.22.1 this project pins — the bundle builds and then fails at
 * the first error path. It moves to `1.x` with the Effect 4 migration the spec
 * already expects, not before. This is the flagged risk in SPEC.md §6 landing
 * exactly where it said it would; the stated fallback if it goes unmaintained
 * is a plain fetch client sharing these same `Schema` definitions.
 */
import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { FoglightApi } from "@foglight/core/api";
import type { Body, MapDescriptor, MapSnapshot, Project, ResourceId } from "@foglight/core/domain";
import { QueryClient } from "@tanstack/react-query";
import { Effect, Layer, ManagedRuntime } from "effect";
import { createEffectQueryFromManagedRuntime } from "effect-query";

/**
 * The typed client, derived from the same `HttpApi` declaration the server
 * implements. `baseUrl: ""` because the client is always served by its own
 * server — same origin in both modes, which is also why no CORS exists here.
 */
export class Api extends Effect.Service<Api>()("@foglight/client/Api", {
  effect: HttpApiClient.make(FoglightApi, { baseUrl: "" }),
  dependencies: [FetchHttpClient.layer],
}) {}

export const runtime = ManagedRuntime.make(Layer.mergeAll(Api.Default));

export const { queryOptions } = createEffectQueryFromManagedRuntime(runtime);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Liveness comes from the SSE feed, never from refetching on a timer:
      // a snapshot is only ever stale because the server said so.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

export const keys = {
  maps: ["maps"] as const,
  projects: ["projects"] as const,
  snapshot: (id: ResourceId) => ["map", id] as const,
  /**
   * Bodies key on `(id, bodyHash)` — **the hash is the staleness rule, not a
   * TTL** (SPEC.md §6). A body whose hash hasn't moved is still correct, so it
   * is never refetched; a changed hash is a different cache entry entirely.
   */
  mapBody: (id: ResourceId, hash: string) => ["body", "map", id, hash] as const,
  ticketBody: (mapId: ResourceId, id: ResourceId, hash: string) =>
    ["body", "ticket", mapId, id, hash] as const,
};

export const mapsQuery = () =>
  queryOptions({
    queryKey: keys.maps,
    queryFn: () => Effect.flatMap(Api, (api) => api.maps.list()),
  });

export const projectsQuery = () =>
  queryOptions({
    queryKey: keys.projects,
    queryFn: () => Effect.flatMap(Api, (api) => api.projects.list()),
  });

export const snapshotQuery = (id: ResourceId) =>
  queryOptions({
    queryKey: keys.snapshot(id),
    queryFn: () =>
      Effect.flatMap(Api, (api) => api.maps.snapshot({ path: { id: encodeURIComponent(id) } })),
  });

export const mapBodyQuery = (id: ResourceId, hash: string) =>
  queryOptions({
    queryKey: keys.mapBody(id, hash),
    queryFn: () =>
      Effect.flatMap(Api, (api) => api.maps.body({ path: { id: encodeURIComponent(id) } })),
  });

export const ticketBodyQuery = (mapId: ResourceId, ticketId: ResourceId, hash: string) =>
  queryOptions({
    queryKey: keys.ticketBody(mapId, ticketId, hash),
    queryFn: () =>
      Effect.flatMap(Api, (api) =>
        api.maps.ticketBody({
          path: { id: encodeURIComponent(mapId), tid: encodeURIComponent(ticketId) },
        }),
      ),
  });

export type { Body, MapDescriptor, MapSnapshot, Project };
