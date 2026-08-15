/**
 * The wayfinder vocabulary, as schema. Names here are CONTEXT.md's names —
 * the ubiquitous language is normative for code, not just for UI labels.
 *
 * The split that governs this file (SPEC.md §6): a `MapSnapshot` is pure
 * *structure* — everything needed to **draw** the map — and carries a
 * `bodyHash` per resource instead of the prose itself. Prose lives in `Body`,
 * fetched from its own endpoint and cached under `(id, bodyHash)`.
 */
import { Schema } from "effect";

export const TicketType = Schema.Literal("research", "prototype", "grilling", "task");
export type TicketType = typeof TicketType.Type;

export const TicketStatus = Schema.Literal("open", "closed");
export type TicketStatus = typeof TicketStatus.Type;

export const TrackerKind = Schema.Literal("local", "github");
export type TrackerKind = typeof TrackerKind.Type;

export const ProjectState = Schema.Literal("ready", "no-tracker", "error");
export type ProjectState = typeof ProjectState.Type;

/**
 * A folder registered with the serve session (CONTEXT.md). `name` is the
 * plain basename, disambiguated in the UI only on collision; `id` slugs it
 * and hashes the canonical path.
 */
export class Project extends Schema.Class<Project>("Project")({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  state: ProjectState,
  trackerKind: Schema.optional(TrackerKind),
}) {}

/** Enough to group a map without parsing its id. */
export class ProjectRef extends Schema.Class<ProjectRef>("ProjectRef")({
  id: Schema.String,
  name: Schema.String,
}) {}

/**
 * Derived state, never stored. `frontier` and `claimed` are computed once here
 * in core from status/assignee/blockedBy — deliberately *not* read from
 * GitHub's native `issue_dependencies_summary.blocked_by`, so the word
 * "frontier" cannot come to mean two different things (SPEC.md §5).
 */
export const TicketState = Schema.Literal("closed", "frontier", "claimed", "blocked", "invalid");
export type TicketState = typeof TicketState.Type;

/**
 * A qualified, human-readable id: `github:owner/repo#42`,
 * `local:.wayfinder/map.md`, `local:.wayfinder/map.md#fog/live-update-mechanics`.
 * Stable by construction across reloads, so layout cannot thrash on a tick.
 */
export const ResourceId = Schema.String.pipe(Schema.brand("ResourceId"));
export type ResourceId = typeof ResourceId.Type;

export const makeId = (s: string): ResourceId => s as ResourceId;

/** Structure only. The question and resolution are in the ticket's Body. */
export class TicketNode extends Schema.Class<TicketNode>("TicketNode")({
  id: ResourceId,
  /** what the UI actually shows on a card: "005", or "#42" on GitHub */
  shortId: Schema.String,
  title: Schema.String,
  type: TicketType,
  status: TicketStatus,
  assignee: Schema.NullOr(Schema.String),
  /** shortIds of the tickets blocking this one */
  blockedBy: Schema.Array(Schema.String),
  /** staleness rule for the body cache — not a TTL (SPEC.md §6) */
  bodyHash: Schema.String,
  /**
   * Non-fatal parse failure. The ticket still renders, marked `invalid`:
   * a map's defects are part of what the viewer is for (CONTEXT.md).
   */
  malformed: Schema.optional(Schema.String),
  /**
   * The fog entry this ticket graduated out of. Wayfinder's own verb; the
   * viewer uses it for continuity, so the patch *becomes* the card in place.
   */
  graduatedFrom: Schema.optional(ResourceId),
}) {}

/** A patch of "Not yet specified": in-scope, not yet sharp enough to ticket. */
export class FogNode extends Schema.Class<FogNode>("FogNode")({
  id: ResourceId,
  /** slug from the bolded lead term, content-hash fallback (SPEC.md §5) */
  slug: Schema.String,
  term: Schema.String,
  /** open tickets this patch hangs on — gives fog real position on the graph */
  hangsOn: Schema.Array(Schema.String),
  bodyHash: Schema.String,
}) {}

/**
 * Ruled beyond the destination. Has no position on a dependency graph, which
 * is exactly why the rail — not the graph — owns it (SPEC.md §8).
 */
export class OutOfScopeNode extends Schema.Class<OutOfScopeNode>("OutOfScopeNode")({
  id: ResourceId,
  slug: Schema.String,
  term: Schema.String,
  bodyHash: Schema.String,
}) {}

export const WarningKind = Schema.Literal(
  "malformed-ticket",
  "dangling-edge",
  "decision-drift",
  "unreadable",
);
export type WarningKind = typeof WarningKind.Type;

/** Degrade, don't fail: everything foglight could not fully understand. */
export class MapWarning extends Schema.Class<MapWarning>("MapWarning")({
  kind: WarningKind,
  subject: Schema.NullOr(ResourceId),
  message: Schema.String,
}) {}

/** A map at its lowest resolution: enough to list and choose it. */
export class MapDescriptor extends Schema.Class<MapDescriptor>("MapDescriptor")({
  id: ResourceId,
  title: Schema.String,
  destination: Schema.String,
  openCount: Schema.Number,
  closedCount: Schema.Number,
  /** ordering key for the picker: most-recently-changed first (SPEC.md §9) */
  changedAt: Schema.String,
  /** filled by the session layer; adapters stay project-blind */
  project: Schema.optional(ProjectRef),
  // Deliberately no frontier count: it would force reading every ticket's
  // dependencies and undo the lightweight contract (SPEC.md §5).
}) {}

/**
 * A whole map as read at one instant — structure, never prose.
 *
 * Every SSE event carries one of these complete, with a monotonic `revision`:
 * no event is load-bearing, a missed one costs nothing, and reconnect resync
 * is not a special case (SPEC.md §6).
 */
export class MapSnapshot extends Schema.Class<MapSnapshot>("MapSnapshot")({
  id: ResourceId,
  title: Schema.String,
  /** the one line the graph anchors on, at the right edge */
  destination: Schema.String,
  tracker: TrackerKind,
  revision: Schema.Number,
  bodyHash: Schema.String,
  tickets: Schema.Array(TicketNode),
  fog: Schema.Array(FogNode),
  outOfScope: Schema.Array(OutOfScopeNode),
  warnings: Schema.Array(MapWarning),
  readAt: Schema.String,
  project: Schema.optional(ProjectRef),
}) {}

/** The prose half. Fetched per resource, cached under `(id, bodyHash)`. */
export class Body extends Schema.Class<Body>("Body")({
  id: ResourceId,
  bodyHash: Schema.String,
  /** raw markdown — the viewer renders it, the parser already read it */
  markdown: Schema.String,
}) {}

export class MapBody extends Schema.Class<MapBody>("MapBody")({
  id: ResourceId,
  bodyHash: Schema.String,
  notes: Schema.String,
  /** one line per closed ticket, as written on the map */
  decisions: Schema.Array(
    Schema.Struct({
      ticketId: Schema.NullOr(ResourceId),
      title: Schema.String,
      gist: Schema.String,
    }),
  ),
  fog: Schema.Array(Schema.Struct({ slug: Schema.String, markdown: Schema.String })),
  outOfScope: Schema.Array(Schema.Struct({ slug: Schema.String, markdown: Schema.String })),
}) {}

export class TicketBody extends Schema.Class<TicketBody>("TicketBody")({
  id: ResourceId,
  bodyHash: Schema.String,
  question: Schema.String,
  resolution: Schema.NullOr(Schema.String),
}) {}
