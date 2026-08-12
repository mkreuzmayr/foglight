/**
 * The live state of the maps this instance is serving (SPEC.md §6).
 *
 * Guiding principle: **every event is a complete truth.** There are no deltas
 * here and no event is load-bearing — a missed one costs nothing and reconnect
 * resync is not a special case, because reconnecting *is* just receiving the
 * next complete snapshot.
 *
 * Three things live in this module and nowhere else:
 *   - the monotonic `revision` stamped on every snapshot
 *   - the `PubSub` that fans one read out to every connected client, so load
 *     scales with maps watched rather than with clients
 *   - the presence count, which *is* the poll cadence: zero clients pauses
 *     GitHub polling outright, which is what makes a VPS left running for days
 *     cost nothing
 */
import type { TrackerAdapter, MapDescriptor, MapSnapshot, ResourceId } from "@foglight/core";
import { MapSnapshot as Snapshot } from "@foglight/core";
import type { PollMode } from "@foglight/core";
import { Context, Duration, Effect, Layer, PubSub, Ref, Stream, SubscriptionRef } from "effect";

/** Local-markdown: a torn read mid-rewrite self-corrects on the next tick. */
const LOCAL_DEBOUNCE = Duration.millis(300);

export type ServerEvent =
  | { readonly _tag: "maps"; readonly maps: ReadonlyArray<MapDescriptor> }
  | { readonly _tag: "map"; readonly snapshot: MapSnapshot };

export type MapStoreService = {
  /** The picker's list. Cached, refreshed on every tick. */
  readonly descriptors: Effect.Effect<ReadonlyArray<MapDescriptor>>;
  /** The latest snapshot, served from cache when one is held. */
  readonly snapshot: (id: ResourceId) => Effect.Effect<MapSnapshot, unknown>;
  /**
   * One query-scoped subscription per tab. Yields the current truth first,
   * then every later one — so a client can subscribe *before* it GETs and
   * never observe a gap.
   */
  readonly subscribe: (id: ResourceId | null) => Stream.Stream<ServerEvent>;
  readonly adapter: TrackerAdapter;
};

export class MapStore extends Context.Tag("@foglight/server/MapStore")<
  MapStore,
  MapStoreService
>() {}

export const layer = (
  adapter: TrackerAdapter,
  cadence: SubscriptionRef.SubscriptionRef<PollMode>,
): Layer.Layer<MapStore> =>
  Layer.scoped(
    MapStore,
    Effect.gen(function* () {
      const revision = yield* Ref.make(0);
      const snapshots = yield* Ref.make(new Map<string, MapSnapshot>());
      const descriptorCache = yield* Ref.make<ReadonlyArray<MapDescriptor>>([]);
      /** map id → connected clients looking at it. The presence signal. */
      const watchers = yield* Ref.make(new Map<string, number>());
      const events = yield* PubSub.sliding<ServerEvent>(64);

      /**
       * The cadence is read off presence, never configured: a map on screen is
       * worth 30s, a picker-only client 5 min, nobody at all nothing.
       */
      const syncCadence = Effect.gen(function* () {
        const live = yield* Ref.get(watchers);
        const total = [...live.values()].reduce((a, b) => a + b, 0);
        const onAMap = [...live.entries()].some(([id, n]) => id !== "" && n > 0);
        yield* SubscriptionRef.set(cadence, total === 0 ? "paused" : onAMap ? "active" : "idle");
      });

      const readDescriptors = adapter.listMaps().pipe(
        Effect.tap((maps) => Ref.set(descriptorCache, maps)),
        // Degrade, don't fail: the picker keeps its last good list rather than
        // taking the whole page down with it.
        Effect.catchAll(() => Ref.get(descriptorCache)),
      );

      const readSnapshot = (id: ResourceId) =>
        Effect.gen(function* () {
          const loaded = yield* adapter.loadMap(id);
          // The adapter has no business inventing a revision — ordering is a
          // property of this server's stream, not of the tracker.
          const next = yield* Ref.updateAndGet(revision, (n) => n + 1);
          const stamped = new Snapshot({ ...loaded, revision: next });
          yield* Ref.update(snapshots, (m) => new Map(m).set(String(id), stamped));
          return stamped;
        });

      const snapshot = (id: ResourceId) =>
        Effect.gen(function* () {
          const cached = (yield* Ref.get(snapshots)).get(String(id));
          return cached ?? (yield* readSnapshot(id));
        });

      /**
       * One read per tick per map, fanned out. Only maps somebody is actually
       * watching are re-read — the cache holds the rest until it is asked for.
       */
      const onTick = Effect.gen(function* () {
        const maps = yield* readDescriptors;
        yield* PubSub.publish(events, { _tag: "maps", maps });

        const live = yield* Ref.get(watchers);
        const watched = [...live.entries()]
          .filter(([id, n]) => id !== "" && n > 0)
          .map(([id]) => id);

        yield* Effect.forEach(
          watched,
          (id) =>
            readSnapshot(id as ResourceId).pipe(
              Effect.flatMap((fresh) => PubSub.publish(events, { _tag: "map", snapshot: fresh })),
              Effect.catchAll(() => Effect.void),
            ),
          { concurrency: 4 },
        );
      });

      yield* adapter.changes().pipe(
        Stream.debounce(LOCAL_DEBOUNCE),
        Stream.runForEach(() => onTick),
        Effect.forkScoped,
      );

      const subscribe = (id: ResourceId | null): Stream.Stream<ServerEvent> => {
        const key = id === null ? "" : String(id);

        const track = Effect.acquireRelease(
          Effect.gen(function* () {
            const before = yield* Ref.getAndUpdate(watchers, (m) =>
              new Map(m).set(key, (m.get(key) ?? 0) + 1),
            );
            yield* syncCadence;
            // "Immediate poll on first connect" (SPEC.md §6): coming out of
            // paused, don't make the first viewer wait out a cadence interval.
            // Conditioned on the transition, not on every connect — otherwise
            // each new tab would trigger a redundant re-read for everyone.
            const wasIdle = [...before.values()].reduce((a, b) => a + b, 0) === 0;
            if (wasIdle) {
              yield* Effect.forkDaemon(onTick.pipe(Effect.catchAll(() => Effect.void)));
            }
          }),
          () =>
            Ref.update(watchers, (m) => {
              const next = new Map(m);
              const remaining = (next.get(key) ?? 1) - 1;
              if (remaining <= 0) next.delete(key);
              else next.set(key, remaining);
              return next;
            }).pipe(Effect.zipRight(syncCadence)),
        );

        const initial = Effect.gen(function* () {
          const maps = yield* readDescriptors;
          const first: Array<ServerEvent> = [{ _tag: "maps", maps }];
          if (id !== null) {
            const current = yield* snapshot(id).pipe(Effect.catchAll(() => Effect.succeed(null)));
            if (current !== null) first.push({ _tag: "map", snapshot: current });
          }
          return first;
        });

        return Stream.scoped(track).pipe(
          Stream.flatMap(() =>
            Stream.concat(
              Stream.fromIterableEffect(initial),
              Stream.fromPubSub(events).pipe(
                // A tab is scoped to one map: another map's snapshot is noise.
                Stream.filter(
                  (event) => event._tag === "maps" || String(event.snapshot.id) === key,
                ),
              ),
            ),
          ),
        );
      };

      return {
        descriptors: Ref.get(descriptorCache).pipe(
          Effect.flatMap((cached) =>
            cached.length > 0 ? Effect.succeed(cached) : readDescriptors,
          ),
        ),
        snapshot,
        subscribe,
        adapter,
      } satisfies MapStoreService;
    }),
  );
