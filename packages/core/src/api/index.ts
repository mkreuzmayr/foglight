/**
 * The `/api/*` contract, as an `HttpApi` (SPEC.md §6, "Server stack").
 *
 * It is an `HttpApi` rather than hand-rolled routes for one concrete reason:
 * the client derives its types from *this declaration* through the
 * `effect-query` bridge, so a shape change here is a compile error there
 * rather than a runtime surprise. That is also why it lives in `core` and not
 * in `server`: it is a contract both ends share, not a thing the server owns.
 *
 * Two things deliberately **do not** live here, and go on the `HttpRouter`
 * instead (see `routes.ts`): the wildcard static-file route, which has no
 * schema to describe, and the SSE feed, which is a perpetual stream rather
 * than a request/response shape.
 *
 * The endpoint set mirrors the snapshot/body split exactly: structure from
 * `/maps/:id`, prose from the two `/body` endpoints, nothing bulk and nothing
 * batched.
 */
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Body, MapDescriptor, MapSnapshot, Project } from "#core/domain/model.js";
import {
  MapNotFound,
  MapUnparseable,
  TrackerUnauthenticated,
  TrackerUnreachable,
} from "#core/domain/errors.js";
import { Schema } from "effect";

/**
 * Map ids are qualified and contain `:`, `/` and `#` — they ride the path
 * percent-encoded, which is why they are plain strings here rather than the
 * branded `ResourceId`: the brand is applied after decoding, in the handler.
 */
const MapId = Schema.String.annotations({
  description: "URL-encoded map id, e.g. local%3A.wayfinder%2Fmap.md",
});

const TicketId = Schema.String.annotations({
  description: "URL-encoded ticket id, e.g. local%3A.wayfinder%2Ftickets%2F005-x.md",
});

export class MapsGroup extends HttpApiGroup.make("maps")
  .add(
    HttpApiEndpoint.get("list", "/maps")
      .addSuccess(Schema.Array(MapDescriptor))
      .addError(TrackerUnauthenticated)
      .addError(TrackerUnreachable),
  )
  .add(
    HttpApiEndpoint.get("snapshot", "/maps/:id")
      .setPath(Schema.Struct({ id: MapId }))
      .addSuccess(MapSnapshot)
      .addError(MapNotFound)
      .addError(MapUnparseable)
      .addError(TrackerUnauthenticated)
      .addError(TrackerUnreachable),
  )
  .add(
    HttpApiEndpoint.get("body", "/maps/:id/body")
      .setPath(Schema.Struct({ id: MapId }))
      .addSuccess(Body)
      .addError(MapNotFound)
      .addError(TrackerUnauthenticated)
      .addError(TrackerUnreachable),
  )
  .add(
    HttpApiEndpoint.get("ticketBody", "/maps/:id/tickets/:tid/body")
      .setPath(Schema.Struct({ id: MapId, tid: TicketId }))
      .addSuccess(Body)
      .addError(MapNotFound)
      .addError(TrackerUnauthenticated)
      .addError(TrackerUnreachable),
  )
  .prefix("/api") {}

export class ProjectsGroup extends HttpApiGroup.make("projects")
  .add(HttpApiEndpoint.get("list", "/projects").addSuccess(Schema.Array(Project)))
  .prefix("/api") {}

export class FoglightApi extends HttpApi.make("foglight").add(MapsGroup).add(ProjectsGroup) {}
