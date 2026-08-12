/**
 * The local-markdown adapter (`.wayfinder/`).
 *
 * Metadata comes from frontmatter; every `##` body section is handed to the
 * shared parser. Conventions are `.wayfinder/TRACKER.md`'s:
 *
 *   - the map is `.wayfinder/map.md`, labelled `wayfinder:map`
 *   - tickets are `.wayfinder/tickets/NNN-<slug>.md`; `NNN` is the shortId
 *   - `blocked-by` is the native dependency relationship
 *   - an empty `assignee` means unclaimed
 *
 * A repo may hold several maps: `.wayfinder/map.md` plus any
 * `.wayfinder/*.map.md`, each with its own `tickets/` beside it.
 */
import { FileSystem, Path } from "@effect/platform";
import { Duration, Effect, Option, Schedule, Stream } from "effect";
import { MapNotFound, MapUnparseable, TrackerUnreachable } from "../domain/errors.js";
import {
  Body,
  MapDescriptor,
  MapSnapshot,
  MapWarning,
  TicketNode,
  FogNode,
  OutOfScopeNode,
  makeId,
  type ResourceId,
  type TicketType,
} from "../domain/model.js";
import { fogId, outOfScopeId, parseMapBody, parseTicketBody, ticketDefect } from "../parse/body.js";
import {
  hashBody,
  parseFrontmatter,
  parseInlineList,
  splitFrontmatter,
} from "../parse/markdown.js";
import type { ChangeSignal, TrackerAdapter } from "./adapter.js";

/**
 * Where a local map lives. `.wayfinder/` is the convention this repo documents,
 * but real repos in the wild also use an undotted `wayfinder/` — a map is a
 * thing people read and edit, so hiding it is a choice, not a rule. Both are
 * accepted; the dotted form wins when a repo somehow has both.
 */
const WAYFINDER_DIRS = [".wayfinder", "wayfinder"] as const;
const TICKET_TYPES = new Set<string>(["research", "prototype", "grilling", "task"]);

/** `local:.wayfinder/map.md` — repo-relative, so ids survive a move of the checkout. */
const localId = (relative: string): ResourceId => makeId(`local:${relative}`);

const unqualify = (id: ResourceId): string => String(id).replace(/^local:/, "");

type TicketFile = {
  shortId: string;
  relative: string;
  raw: string;
  frontmatter: Record<string, string>;
  body: string;
};

export const makeLocalAdapter = (
  repoRoot: string,
): Effect.Effect<TrackerAdapter, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const abs = (relative: string) => path.join(repoRoot, relative);
    const rel = (absolute: string) => path.relative(repoRoot, absolute);

    const unreachable = (reason: string) => new TrackerUnreachable({ tracker: "local", reason });

    const read = (relative: string) =>
      fs
        .readFileString(abs(relative))
        .pipe(Effect.mapError((cause) => unreachable(`${relative}: ${cause.message}`)));

    /** Resolved once: whichever of the accepted directory names this repo uses. */
    const wayfinderDir = yield* Effect.findFirst(WAYFINDER_DIRS, (candidate) =>
      fs.exists(abs(candidate)).pipe(Effect.orElseSucceed(() => false)),
    ).pipe(Effect.map(Option.getOrElse(() => WAYFINDER_DIRS[0] as string)));

    /** Every map file in the wayfinder directory: `map.md` and any `*.map.md`. */
    const mapFiles = Effect.gen(function* () {
      const dir = abs(wayfinderDir);
      const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
      if (!exists) return [] as ReadonlyArray<string>;
      const entries = yield* fs
        .readDirectory(dir)
        .pipe(Effect.mapError((cause) => unreachable(cause.message)));
      return entries
        .filter((name) => name === "map.md" || name.endsWith(".map.md"))
        .toSorted()
        .map((name) => `${wayfinderDir}/${name}`);
    });

    /**
     * Tickets live in `tickets/` **beside their map**, so this is derived from
     * the map's own directory rather than from the constant — that way a map
     * found under either accepted directory name finds its tickets. A second
     * map named `foo.map.md` reads `tickets-foo/` if it exists, else the
     * shared `tickets/`, so a single-map repo needs no extra convention.
     */
    const ticketDirFor = (mapRelative: string) =>
      Effect.gen(function* () {
        const dir = path.dirname(mapRelative);
        const base = path.basename(mapRelative);
        if (base !== "map.md") {
          const named = `${dir}/tickets-${base.replace(/\.map\.md$/, "")}`;
          const exists = yield* fs.exists(abs(named)).pipe(Effect.orElseSucceed(() => false));
          if (exists) return named;
        }
        return `${dir}/tickets`;
      });

    const readTickets = (mapRelative: string) =>
      Effect.gen(function* () {
        const dir = yield* ticketDirFor(mapRelative);
        const exists = yield* fs.exists(abs(dir)).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [] as ReadonlyArray<TicketFile>;

        const names = yield* fs
          .readDirectory(abs(dir))
          .pipe(Effect.mapError((cause) => unreachable(cause.message)));

        return yield* Effect.forEach(
          names.filter((n) => n.endsWith(".md")).toSorted(),
          (name) =>
            Effect.gen(function* () {
              const relative = `${dir}/${name}`;
              const raw = yield* read(relative);
              const { frontmatter, body } = splitFrontmatter(raw);
              return {
                // The filename's leading NNN is the id — TRACKER.md's rule.
                shortId: /^(\d+)/.exec(name)?.[1] ?? name.replace(/\.md$/, ""),
                relative,
                raw,
                frontmatter: parseFrontmatter(frontmatter),
                body,
              } satisfies TicketFile;
            }),
          { concurrency: 16 },
        );
      });

    const ticketType = (file: TicketFile): { type: TicketType; warning?: string } => {
      // `labels:` is the documented key, but `label:` is common in the wild —
      // and getting this wrong is loud: every ticket would be marked malformed
      // for a missing type, which buries any real defect in the noise.
      const labels = [
        ...parseInlineList(file.frontmatter["labels"]),
        ...parseInlineList(file.frontmatter["label"]),
      ];
      const found = labels
        .map((l) => l.replace(/^wayfinder:/, ""))
        .find((l) => TICKET_TYPES.has(l));
      if (found !== undefined) return { type: found as TicketType };
      return {
        type: "grilling", // the default ticket type per the wayfinder skill
        warning: `no \`wayfinder:<type>\` label (expected ${[...TICKET_TYPES].join(" | ")})`,
      };
    };

    const loadMap = (id: ResourceId) =>
      Effect.gen(function* () {
        const relative = unqualify(id);
        const exists = yield* fs.exists(abs(relative)).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return yield* new MapNotFound({ id: String(id) });

        const raw = yield* read(relative);
        const { frontmatter, body } = splitFrontmatter(raw);
        const meta = parseFrontmatter(frontmatter);
        const files = yield* readTickets(relative);

        const warnings: MapWarning[] = [];
        const tickets: TicketNode[] = [];

        for (const file of files) {
          const ticketId = localId(file.relative);
          const parsed = parseTicketBody(file.body);
          const { type, warning } = ticketType(file);
          const defect = ticketDefect(parsed) ?? warning;

          if (defect !== undefined) {
            warnings.push(
              new MapWarning({
                kind: "malformed-ticket",
                subject: ticketId,
                message: `${path.basename(file.relative)}: ${defect}`,
              }),
            );
          }

          const assignee = (file.frontmatter["assignee"] ?? "").trim();
          tickets.push(
            new TicketNode({
              id: ticketId,
              shortId: file.shortId,
              title: file.frontmatter["title"] ?? path.basename(file.relative, ".md"),
              type,
              status: file.frontmatter["status"] === "closed" ? "closed" : "open",
              assignee: assignee.length > 0 ? assignee : null,
              blockedBy: parseInlineList(file.frontmatter["blocked-by"]),
              bodyHash: hashBody(file.raw),
              ...(defect === undefined ? {} : { malformed: defect }),
            }),
          );
        }

        // A ticket's id is the filename's `NNN`, but authors write `blocked-by:
        // [1, 6]` — the number, not the zero-padded form. Both spellings mean
        // the same ticket, so edges are resolved numerically and rewritten to
        // the canonical shortId. Getting this wrong is silent and total: every
        // edge becomes dangling, every blocked ticket looks takeable, and the
        // frontier is simply wrong.
        const byShortId = new Map(tickets.map((t) => [t.shortId, t.shortId]));
        for (const ticket of tickets) {
          if (/^\d+$/.test(ticket.shortId)) {
            byShortId.set(String(Number(ticket.shortId)), ticket.shortId);
          }
        }
        const canonical = (raw: string): string | undefined =>
          byShortId.get(raw) ??
          (/^\d+$/.test(raw) ? byShortId.get(String(Number(raw))) : undefined);

        // Dangling edges drop with a warning rather than pinning a ticket shut.
        const resolved = tickets.map((ticket) => {
          const live = ticket.blockedBy.map(canonical).filter((b): b is string => b !== undefined);
          for (const missing of ticket.blockedBy.filter((b) => canonical(b) === undefined)) {
            warnings.push(
              new MapWarning({
                kind: "dangling-edge",
                subject: ticket.id,
                message: `${ticket.shortId} is blocked by ${missing}, which does not exist`,
              }),
            );
          }
          // Always rebuilt, never short-circuited on an unchanged length: the
          // list may be the same size and still need rewriting from `1` to
          // `001`, which is the whole point of resolving it.
          return new TicketNode({ ...ticket, blockedBy: live });
        });

        const parsedBody = parseMapBody(body, resolved);
        if (parsedBody.destination.length === 0) {
          return yield* new MapUnparseable({
            id: String(id),
            reason: "no `## Destination` section — a map is defined by where it is going",
          });
        }

        // Tickets are truth for existence and status; Decisions-so-far supplies
        // only the gist. Drift is a warning, never a correction (SPEC.md §5).
        const closedTitles = new Set(
          resolved.filter((t) => t.status === "closed").map((t) => t.title.toLowerCase()),
        );
        for (const decision of parsedBody.decisions) {
          if (!closedTitles.has(decision.title.toLowerCase())) {
            warnings.push(
              new MapWarning({
                kind: "decision-drift",
                subject: null,
                message: `Decisions-so-far lists "${decision.title}", which is not a closed ticket`,
              }),
            );
          }
        }

        return new MapSnapshot({
          id,
          title: meta["title"] ?? path.basename(relative, ".md"),
          destination: parsedBody.destination,
          tracker: "local",
          revision: 0, // stamped by the server, which owns the monotonic counter
          bodyHash: hashBody(raw),
          tickets: resolved,
          fog: parsedBody.fog.map(
            (f) =>
              new FogNode({
                id: fogId(id, f.slug),
                slug: f.slug,
                term: f.term,
                hangsOn: f.hangsOn,
                bodyHash: hashBody(f.markdown),
              }),
          ),
          outOfScope: parsedBody.outOfScope.map(
            (o) =>
              new OutOfScopeNode({
                id: outOfScopeId(id, o.slug),
                slug: o.slug,
                term: o.term,
                bodyHash: hashBody(o.markdown),
              }),
          ),
          warnings,
          readAt: new Date().toISOString(),
        });
      });

    const listMaps = Effect.gen(function* () {
      const files = yield* mapFiles;
      return yield* Effect.forEach(
        files,
        (relative) =>
          Effect.gen(function* () {
            const source = yield* read(relative);
            const { frontmatter, body } = splitFrontmatter(source);
            const meta = parseFrontmatter(frontmatter);
            const parsed = parseMapBody(body);
            const stat = yield* fs
              .stat(abs(relative))
              .pipe(Effect.mapError((cause) => unreachable(cause.message)));

            // Lightweight by contract: ticket *statuses* only, never their
            // dependencies — reading those is what `loadMap` is for.
            const ticketFiles = yield* readTickets(relative);
            const closed = ticketFiles.filter((f) => f.frontmatter["status"] === "closed").length;

            return new MapDescriptor({
              id: localId(relative),
              title: meta["title"] ?? path.basename(relative, ".md"),
              destination: parsed.destination,
              openCount: ticketFiles.length - closed,
              closedCount: closed,
              changedAt: new Date(
                Number(stat.mtime._tag === "Some" ? stat.mtime.value : 0),
              ).toISOString(),
            });
          }),
        { concurrency: 4 },
      );
    });

    const loadMapBody = (id: ResourceId) =>
      Effect.gen(function* () {
        const relative = unqualify(id);
        const exists = yield* fs.exists(abs(relative)).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return yield* new MapNotFound({ id: String(id) });
        const raw = yield* read(relative);
        return new Body({ id, bodyHash: hashBody(raw), markdown: splitFrontmatter(raw).body });
      });

    const loadTicketBody = (_mapId: ResourceId, ticketId: ResourceId) =>
      Effect.gen(function* () {
        const relative = unqualify(ticketId);
        const exists = yield* fs.exists(abs(relative)).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return yield* new MapNotFound({ id: String(ticketId) });
        const raw = yield* read(relative);
        return new Body({
          id: ticketId,
          bodyHash: hashBody(raw),
          markdown: splitFrontmatter(raw).body,
        });
      });

    /**
     * Ticks from `.wayfinder/`. Debouncing is the *server's* job (SPEC.md §6) —
     * an adapter reports that something moved and nothing more.
     *
     * `FileSystem.watch` is recursive-capable but not uniformly so across
     * platforms, so the ticket directory is watched alongside the root and the
     * stream survives either watcher failing (a map on a filesystem without
     * inotify still polls below).
     */
    const changes = (): Stream.Stream<ChangeSignal> => {
      const dir = abs(wayfinderDir);
      const watch = (target: string) =>
        fs.watch(target, { recursive: true }).pipe(
          Stream.map((event) => ({
            mapId: mapIdForPath(rel(event.path)),
            at: new Date().toISOString(),
          })),
          Stream.catchAll(() => Stream.empty),
        );

      return Stream.merge(
        watch(dir),
        // Belt and braces: a slow heartbeat means a missed inotify event costs
        // a few seconds, not the session. Every event is a complete snapshot,
        // so an extra tick is free.
        Stream.repeatValue({ mapId: null, at: "" }).pipe(
          Stream.schedule(Schedule.spaced(Duration.seconds(30))),
          Stream.map(() => ({ mapId: null, at: new Date().toISOString() })),
        ),
      );
    };

    /** A touched ticket file invalidates its map; anything else invalidates all. */
    const mapIdForPath = (relative: string): ResourceId | null =>
      relative.endsWith("map.md") ? localId(relative) : null;

    return {
      kind: "local",
      label: wayfinderDir,
      listMaps: () => listMaps,
      loadMap,
      loadMapBody,
      loadTicketBody,
      changes,
    } satisfies TrackerAdapter;
  });
