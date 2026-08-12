/**
 * The failure taxonomy (SPEC.md §5). Two tiers, and the tier is the contract:
 *
 * - **Fatal** — tagged errors the UI switches on to render a *named* state.
 *   There is no generic "something went wrong" screen, so each of these gets
 *   its own tag and its own HTTP status.
 * - **Non-fatal** — never raised. `MalformedTicket` and dangling edges are
 *   collected onto `snapshot.warnings` so the map still draws. Degrade, don't
 *   fail: a broken ticket is something to *see*, not to hide.
 *
 * These are `Schema.TaggedError`, not plain `Data.TaggedError`, because they
 * cross the wire: the same definitions serialize out of the API and decode in
 * the client, so the UI switches on the tag the server actually raised rather
 * than on a status code it has to interpret.
 */
import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

export class MapNotFound extends Schema.TaggedError<MapNotFound>()(
  "MapNotFound",
  { id: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

/** The map exists but its structure could not be read at all. */
export class MapUnparseable extends Schema.TaggedError<MapUnparseable>()(
  "MapUnparseable",
  { id: Schema.String, reason: Schema.String },
  HttpApiSchema.annotations({ status: 422 }),
) {}

/** No usable credential: no `GITHUB_TOKEN`/`GH_TOKEN`, and no logged-in `gh`. */
export class TrackerUnauthenticated extends Schema.TaggedError<TrackerUnauthenticated>()(
  "TrackerUnauthenticated",
  { tracker: Schema.String, reason: Schema.String },
  HttpApiSchema.annotations({ status: 401 }),
) {}

/** Network down, API 5xx, rate limit exhausted, `.wayfinder/` unreadable. */
export class TrackerUnreachable extends Schema.TaggedError<TrackerUnreachable>()(
  "TrackerUnreachable",
  { tracker: Schema.String, reason: Schema.String },
  HttpApiSchema.annotations({ status: 503 }),
) {}

/** No tracker could be detected for this repo, and none was forced. */
export class NoTrackerDetected extends Schema.TaggedError<NoTrackerDetected>()(
  "NoTrackerDetected",
  { cwd: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export type TrackerError =
  | MapNotFound
  | MapUnparseable
  | TrackerUnauthenticated
  | TrackerUnreachable
  | NoTrackerDetected;
