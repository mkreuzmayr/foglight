/**
 * The tracker seam (SPEC.md §5).
 *
 * A `TrackerAdapter` is a **plain record of Effect-returning functions, not a
 * service**. Adapters are values — a repo picks one at startup and holds it —
 * whereas an Effect Layer is singleton-per-tag, which is the wrong lifetime for
 * something chosen per repo. Only the *detected tracker* earns a tag.
 *
 * Three operations, and the split between them is the contract:
 *   - `listMaps`  — lightweight, never triggers a full load
 *   - `loadMap`   — the whole map at once, no lazy detail-on-click
 *   - `changes`   — bare invalidation ticks, no payload
 */
import type { Stream } from "effect";
import type { Effect } from "effect";
import type { MapNotFound, MapUnparseable, TrackerError } from "../domain/errors.js";
import type { Body, MapDescriptor, MapSnapshot, ResourceId, TrackerKind } from "../domain/model.js";

/**
 * "Something moved." Deliberately payload-free: foglight responds by taking a
 * fresh snapshot, so a tick carrying detail would be a second source of truth
 * competing with the snapshot (CONTEXT.md, "Change signal").
 *
 * `mapId` is a *filter*, not content — one watcher serves both the open map
 * and the picker, and the consumer decides what to re-read.
 */
export type ChangeSignal = {
  readonly mapId: ResourceId | null;
  readonly at: string;
};

export type TrackerAdapter = {
  readonly kind: TrackerKind;
  /** what the rail header shows: `.wayfinder/` or `owner/repo` */
  readonly label: string;

  readonly listMaps: () => Effect.Effect<ReadonlyArray<MapDescriptor>, TrackerError>;

  readonly loadMap: (
    id: ResourceId,
  ) => Effect.Effect<MapSnapshot, TrackerError | MapNotFound | MapUnparseable>;

  readonly loadMapBody: (id: ResourceId) => Effect.Effect<Body, TrackerError | MapNotFound>;

  readonly loadTicketBody: (
    mapId: ResourceId,
    ticketId: ResourceId,
  ) => Effect.Effect<Body, TrackerError | MapNotFound>;

  readonly changes: () => Stream.Stream<ChangeSignal>;
};
