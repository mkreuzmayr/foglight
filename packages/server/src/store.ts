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
import {
  MapNotFound,
  MapSnapshot as Snapshot,
  MapDescriptor as Descriptor,
  ProjectRef,
  qualify,
  makeId,
  TicketNode,
  FogNode,
  OutOfScopeNode,
  MapWarning,
  Body,
} from "@foglight/core";
import type {
  TrackerAdapter,
  TrackerError,
  MapDescriptor,
  MapSnapshot,
  Project,
  ResourceId,
  PollMode,
} from "@foglight/core";

import { Context, Duration, Effect, Layer, PubSub, Ref, Stream, SubscriptionRef } from "effect";

/** Local-markdown: a torn read mid-rewrite self-corrects on the next tick. */
const LOCAL_DEBOUNCE = Duration.millis(300);

export type ServerEvent =
  | { readonly _tag: "maps"; readonly maps: readonly MapDescriptor[] }
  | { readonly _tag: "map"; readonly snapshot: MapSnapshot }
  | { readonly _tag: "projects"; readonly projects: readonly Project[] };

export type MapStoreService = {
  /** The picker's list. Cached, refreshed on every tick. */
  readonly descriptors: Effect.Effect<readonly MapDescriptor[]>;
  readonly listMaps: Effect.Effect<readonly MapDescriptor[], TrackerError>;
  /** The latest snapshot, served from cache when one is held. */
  readonly snapshot: (id: ResourceId) => Effect.Effect<MapSnapshot, TrackerError>;
  readonly loadMapBody: (id: ResourceId) => ReturnType<TrackerAdapter["loadMapBody"]>;
  readonly loadTicketBody: (
    mapId: ResourceId,
    ticketId: ResourceId,
  ) => ReturnType<TrackerAdapter["loadTicketBody"]>;
  /**
   * One query-scoped subscription per tab. Yields the current truth first,
   * then every later one — so a client can subscribe *before* it GETs and
   * never observe a gap.
   */
  readonly subscribe: (id: ResourceId | null) => Stream.Stream<ServerEvent>;
  readonly adapter: TrackerAdapter;
  readonly add: (source: {
    readonly adapter: TrackerAdapter;
    readonly project: { readonly id: string; readonly name: string };
    readonly cadence: SubscriptionRef.SubscriptionRef<PollMode>;
  }) => Effect.Effect<void>;
  readonly remove: (projectId: string) => Effect.Effect<void>;
  readonly announceProjects: (projects: readonly Project[]) => Effect.Effect<void>;
};

export class MapStore extends Context.Tag("@foglight/server/MapStore")<
  MapStore,
  MapStoreService
>() {}

export const layer = (
  adapter: TrackerAdapter,
  cadence: SubscriptionRef.SubscriptionRef<PollMode>,
  project: { readonly id: string; readonly name: string } | null = null,
): Layer.Layer<MapStore> =>
  Layer.scoped(
    MapStore,
    Effect.gen(function* () {
      const revision = yield* Ref.make(0);
      const snapshots = yield* Ref.make(new Map<string, MapSnapshot>());
      const descriptorCache = yield* Ref.make<readonly MapDescriptor[]>([]);
      /** map id → connected clients looking at it. The presence signal. */
      const watchers = yield* Ref.make(new Map<string, number>());
      const events = yield* PubSub.sliding<ServerEvent>(64);

      type Source = {
        readonly adapter: TrackerAdapter;
        readonly project: { readonly id: string; readonly name: string };
        readonly cadence: SubscriptionRef.SubscriptionRef<PollMode>;
      };

      const sources = yield* Ref.make<readonly Source[]>(
        project === null ? [] : [{ adapter, project, cadence }],
      );

      const sourceFor = (id: ResourceId) =>
        Effect.gen(function* () {
          const ss = yield* Ref.get(sources);
          const raw = String(id);

          return ss.find((s) => raw.startsWith(`${s.project.id}:`));
        });

      const qualifySnapshot = (
        owner: { readonly id: string; readonly name: string },
        loaded: MapSnapshot,
        next: number,
      ): MapSnapshot =>
        new Snapshot({
          title: loaded.title,
          destination: loaded.destination,
          tracker: loaded.tracker,
          bodyHash: loaded.bodyHash,
          readAt: loaded.readAt,
          id: qualifyId(owner.id, loaded.id),
          project: new ProjectRef({ id: owner.id, name: owner.name }),
          revision: next,
          tickets: loaded.tickets.map(
            (ticket) =>
              new TicketNode({
                shortId: ticket.shortId,
                title: ticket.title,
                type: ticket.type,
                status: ticket.status,
                assignee: ticket.assignee,
                blockedBy: ticket.blockedBy,
                bodyHash: ticket.bodyHash,
                malformed: ticket.malformed,
                graduatedFrom: ticket.graduatedFrom,
                id: qualifyId(owner.id, ticket.id),
                ...(ticket.graduatedFrom === undefined
                  ? {}
                  : { graduatedFrom: qualifyId(owner.id, ticket.graduatedFrom) }),
              }),
          ),
          fog: loaded.fog.map(
            (entry) =>
              new FogNode({
                slug: entry.slug,
                term: entry.term,
                hangsOn: entry.hangsOn,
                bodyHash: entry.bodyHash,
                id: qualifyId(owner.id, entry.id),
              }),
          ),
          outOfScope: loaded.outOfScope.map(
            (entry) =>
              new OutOfScopeNode({
                slug: entry.slug,
                term: entry.term,
                bodyHash: entry.bodyHash,
                id: qualifyId(owner.id, entry.id),
              }),
          ),
          warnings: loaded.warnings.map(
            (warning) =>
              new MapWarning({
                kind: warning.kind,
                message: warning.message,
                subject: warning.subject === null ? null : qualifyId(owner.id, warning.subject),
              }),
          ),
        });

      /**
       * Presence is per project: a map on screen is worth 30s for *that*
       * project, any connected client keeps the others idle, and nobody at
       * all pauses every GitHub poller.
       */
      const syncCadence = Effect.gen(function* () {
        const live = yield* Ref.get(watchers);
        const ss = yield* Ref.get(sources);
        const anyClient = [...live.values()].some((n) => n > 0);
        yield* Effect.forEach(ss, (source) => {
          const onAMap = [...live.entries()].some(
            ([id, n]) => n > 0 && id.startsWith(`${source.project.id}:`),
          );

          const mode = onAMap ? "active" : anyClient ? "idle" : "paused";

          return SubscriptionRef.set(source.cadence, mode);
        });
      });

      const readDescriptors = Effect.gen(function* () {
        const ss = yield* Ref.get(sources);
        const chunks = yield* Effect.forEach(
          ss,
          (s) =>
            s.adapter.listMaps().pipe(
              Effect.map((maps) => qualifyFor(s.project, maps)),
              Effect.catchAll(() => Effect.succeed<readonly MapDescriptor[]>([])),
            ),
          { concurrency: 4 },
        );

        const maps = chunks.flat();
        yield* Ref.set(descriptorCache, maps);

        return maps;
      });

      const readSnapshot = (id: ResourceId) =>
        Effect.gen(function* () {
          const source = yield* sourceFor(id);
          if (source === undefined) {
            return yield* new MapNotFound({ id: String(id) });
          }

          const loaded = yield* source.adapter.loadMap(toAdapter(id, source.project));
          const next = yield* Ref.updateAndGet(revision, (n) => n + 1);
          const stamped = qualifySnapshot(source.project, loaded, next);
          yield* Ref.update(snapshots, (m) => new Map(m).set(String(stamped.id), stamped));

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
            readSnapshot(makeId(id)).pipe(
              Effect.flatMap((fresh) => PubSub.publish(events, { _tag: "map", snapshot: fresh })),
              Effect.catchAll(() => Effect.void),
            ),
          { concurrency: 4 },
        );
      });

      yield* Effect.forEach(yield* Ref.get(sources), (source) =>
        source.adapter.changes().pipe(
          Stream.debounce(LOCAL_DEBOUNCE),
          Stream.runForEach(() => onTick),
          Effect.forkDaemon,
        ),
      );

      const add = (source: Source) =>
        Effect.gen(function* () {
          const ss = yield* Ref.get(sources);
          if (ss.some((s) => s.project.id === source.project.id)) {
            return;
          }

          yield* Ref.set(sources, [...ss, source]);
          yield* source.adapter.changes().pipe(
            Stream.debounce(LOCAL_DEBOUNCE),
            Stream.runForEach(() => onTick),
            Effect.forkDaemon,
          );

          yield* syncCadence;
        });

      const remove = (projectId: string) =>
        Ref.update(sources, (ss) => ss.filter((s) => s.project.id !== projectId)).pipe(
          Effect.zipRight(syncCadence),
        );

      const announceProjects = (projects: readonly Project[]) =>
        PubSub.publish(events, { _tag: "projects", projects });

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
              if (remaining <= 0) {
                next.delete(key);
              } else {
                next.set(key, remaining);
              }

              return next;
            }).pipe(Effect.zipRight(syncCadence)),
        );

        const initial = Effect.gen(function* () {
          const maps = yield* readDescriptors;
          const first: ServerEvent[] = [{ _tag: "maps", maps }];
          if (id !== null) {
            const current = yield* snapshot(id).pipe(Effect.catchAll(() => Effect.succeed(null)));
            if (current !== null) {
              first.push({ _tag: "map", snapshot: current });
            }
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
                  (event) =>
                    event._tag === "maps" ||
                    event._tag === "projects" ||
                    String(event.snapshot.id) === key,
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
        listMaps: readDescriptors,
        snapshot,
        loadMapBody: (id) =>
          Effect.gen(function* () {
            const source = yield* sourceFor(id);
            if (source === undefined) {
              return yield* new MapNotFound({ id: String(id) });
            }

            const body = yield* source.adapter.loadMapBody(toAdapter(id, source.project));

            return new Body({
              bodyHash: body.bodyHash,
              markdown: body.markdown,
              id: qualifyId(source.project.id, body.id),
            });
          }),
        loadTicketBody: (mapId, ticketId) =>
          Effect.gen(function* () {
            const source = yield* sourceFor(mapId);
            if (source === undefined) {
              return yield* new MapNotFound({ id: String(mapId) });
            }

            const body = yield* source.adapter.loadTicketBody(
              toAdapter(mapId, source.project),
              toAdapter(ticketId, source.project),
            );

            return new Body({
              bodyHash: body.bodyHash,
              markdown: body.markdown,
              id: qualifyId(source.project.id, body.id),
            });
          }),
        subscribe,
        adapter,
        add,
        remove,
        announceProjects,
      } satisfies MapStoreService;
    }),
  );

const emptyAdapter: TrackerAdapter = {
  kind: "local",
  label: "",
  listMaps: () => Effect.succeed([]),
  loadMap: (id) => new MapNotFound({ id: String(id) }),
  loadMapBody: (id) => new MapNotFound({ id: String(id) }),
  loadTicketBody: (_mapId, ticketId) => new MapNotFound({ id: String(ticketId) }),
  changes: () => Stream.empty,
};

/** A session with no attached project: no maps, no change ticks. */
export const empty: Layer.Layer<MapStore> = Layer.unwrapEffect(
  SubscriptionRef.make<PollMode>("paused").pipe(
    Effect.map((cadence) => layer(emptyAdapter, cadence)),
  ),
);

const qualifyFor = (
  owner: { readonly id: string; readonly name: string },
  maps: readonly MapDescriptor[],
): readonly MapDescriptor[] => {
  const ref = new ProjectRef({ id: owner.id, name: owner.name });

  return maps.map(
    (descriptor) =>
      new Descriptor({
        title: descriptor.title,
        destination: descriptor.destination,
        openCount: descriptor.openCount,
        closedCount: descriptor.closedCount,
        changedAt: descriptor.changedAt,
        id: qualify(owner.id, String(descriptor.id)),
        project: ref,
      }),
  );
};

const toAdapter = (id: ResourceId, owner: { readonly id: string }): ResourceId => {
  const prefix = `${owner.id}:`;
  const raw = String(id);

  return raw.startsWith(prefix) ? makeId(raw.slice(prefix.length)) : id;
};

const qualifyId = (ownerId: string, id: ResourceId): ResourceId => qualify(ownerId, String(id));
