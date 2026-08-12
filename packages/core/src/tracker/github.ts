/**
 * The GitHub Issues adapter.
 *
 * Metadata is GitHub's own: `wayfinder:map` / `wayfinder:<type>` labels, the
 * assignee as the claim, sub-issues as the map→ticket relation, and native
 * issue dependencies as blocking. Bodies go to the shared parser untouched —
 * the same wayfinder skill writes them here as it does on disk.
 *
 * One rule that is easy to get wrong: GitHub reports a
 * `issue_dependencies_summary.blocked_by` count, and foglight **ignores it**.
 * `frontier` and `unblocked` are derived in `core/domain/derive.ts` from
 * status/assignee/blockedBy, so the word cannot mean two things (SPEC.md §5).
 */
import { HttpClient, HttpClientRequest, type CommandExecutor } from "@effect/platform";
import { Duration, Effect, Option, Ref, Schedule, Stream, SubscriptionRef } from "effect";
import {
  MapNotFound,
  MapUnparseable,
  TrackerUnauthenticated,
  TrackerUnreachable,
} from "../domain/errors.js";
import {
  Body,
  FogNode,
  MapDescriptor,
  MapSnapshot,
  MapWarning,
  OutOfScopeNode,
  TicketNode,
  makeId,
  type ResourceId,
  type TicketType,
} from "../domain/model.js";
import { fogId, outOfScopeId, parseMapBody, parseTicketBody, ticketDefect } from "../parse/body.js";
import { hashBody } from "../parse/markdown.js";
import type { ChangeSignal, TrackerAdapter } from "./adapter.js";
import { resolveToken } from "./github-auth.js";

const API = "https://api.github.com";
const TICKET_TYPES = new Set<string>(["research", "prototype", "grilling", "task"]);

export type GitHubRepo = { readonly owner: string; readonly repo: string };

/**
 * How hard to poll. The *policy* lives in the server, which is the only thing
 * that knows how many clients are connected and which map they are looking at;
 * the adapter only knows how to take a tick (SPEC.md §6).
 */
export type PollMode = "active" | "idle" | "paused";

const POLL_INTERVAL: Record<Exclude<PollMode, "paused">, Duration.Duration> = {
  active: Duration.seconds(30),
  idle: Duration.minutes(5),
};

type Issue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  assignee: { login: string } | null;
  labels: Array<{ name: string } | string>;
  updated_at: string;
};

const labelNames = (issue: Issue): ReadonlyArray<string> =>
  issue.labels.map((l) => (typeof l === "string" ? l : l.name));

const ghId = (repo: GitHubRepo, number: number): ResourceId =>
  makeId(`github:${repo.owner}/${repo.repo}#${number}`);

const issueNumber = (id: ResourceId): number | null => {
  const match = /#(\d+)$/.exec(String(id));
  return match === null ? null : Number(match[1]);
};

export const makeGitHubAdapter = (
  repo: GitHubRepo,
  cadence: SubscriptionRef.SubscriptionRef<PollMode>,
): Effect.Effect<TrackerAdapter, never, HttpClient.HttpClient | CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient;
    /** ETag per URL: `304`s don't count against the 5000/hr budget. */
    const etags = yield* Ref.make(new Map<string, string>());

    /**
     * Credentials are resolved **once, here**, because every adapter operation
     * must be runnable with no environment of its own (`R = never` on the
     * `TrackerAdapter` seam) — and shelling out to `gh` on every request would
     * be absurd besides. A missing credential is not a construction failure:
     * it is kept as an absence and surfaced per call as the named
     * `TrackerUnauthenticated` state the UI switches on (SPEC.md §5).
     */
    const initialToken = yield* Effect.either(resolveToken);
    const withToken: Effect.Effect<string, TrackerUnauthenticated> =
      initialToken._tag === "Right"
        ? Effect.succeed(initialToken.right)
        : Effect.fail(initialToken.left);

    const unreachable = (reason: string) => new TrackerUnreachable({ tracker: "github", reason });

    const request = <A>(url: string) =>
      Effect.gen(function* () {
        const token = yield* withToken;
        const response = yield* baseClient
          .execute(
            HttpClientRequest.get(`${API}${url}`).pipe(
              HttpClientRequest.setHeaders({
                accept: "application/vnd.github+json",
                authorization: `Bearer ${token}`,
                "x-github-api-version": "2022-11-28",
              }),
            ),
          )
          .pipe(Effect.mapError((cause) => unreachable(String(cause))));

        if (response.status === 404) return Option.none<A>();
        if (response.status >= 400) {
          return yield* unreachable(`GET ${url} → ${response.status}`);
        }
        const json = yield* response.json.pipe(
          Effect.mapError((cause) => unreachable(`GET ${url}: ${cause}`)),
        );
        return Option.some(json as A);
      });

    const required = <A>(url: string, missing: () => MapNotFound) =>
      request<A>(url).pipe(
        Effect.flatMap(
          Option.match({ onNone: () => Effect.fail(missing()), onSome: Effect.succeed }),
        ),
      );

    const searchIssues = (query: string) =>
      request<Array<Issue>>(
        `/repos/${repo.owner}/${repo.repo}/issues?state=all&per_page=100&${query}`,
      ).pipe(Effect.map(Option.getOrElse(() => [] as Array<Issue>)));

    /** Child issues of the map — GitHub's sub-issue relation is the map→ticket edge. */
    const subIssues = (number: number) =>
      request<Array<Issue>>(
        `/repos/${repo.owner}/${repo.repo}/issues/${number}/sub_issues?per_page=100`,
      ).pipe(Effect.map(Option.getOrElse(() => [] as Array<Issue>)));

    /** Native issue dependencies: the blocking relation, read as *facts only*. */
    const blockedBy = (number: number) =>
      request<Array<{ number: number }>>(
        `/repos/${repo.owner}/${repo.repo}/issues/${number}/dependencies/blocked_by?per_page=100`,
      ).pipe(
        Effect.map(Option.getOrElse(() => [] as Array<{ number: number }>)),
        Effect.map((issues) => issues.map((i) => String(i.number))),
        // Dependencies are a newer API surface; a repo without it is not broken.
        Effect.orElseSucceed(() => [] as ReadonlyArray<string>),
      );

    const ticketType = (issue: Issue): { type: TicketType; warning?: string } => {
      const found = labelNames(issue)
        .filter((l) => l.startsWith("wayfinder:"))
        .map((l) => l.slice("wayfinder:".length))
        .find((l) => TICKET_TYPES.has(l));
      if (found !== undefined) return { type: found as TicketType };
      return {
        type: "grilling",
        warning: `no \`wayfinder:<type>\` label (expected ${[...TICKET_TYPES].join(" | ")})`,
      };
    };

    const loadMap = (id: ResourceId) =>
      Effect.gen(function* () {
        const number = issueNumber(id);
        if (number === null) return yield* new MapNotFound({ id: String(id) });

        const issue = yield* required<Issue>(
          `/repos/${repo.owner}/${repo.repo}/issues/${number}`,
          () => new MapNotFound({ id: String(id) }),
        );

        const children = yield* subIssues(number);
        const warnings: MapWarning[] = [];

        const tickets = yield* Effect.forEach(
          children,
          (child) =>
            Effect.gen(function* () {
              const raw = child.body ?? "";
              const parsed = parseTicketBody(raw);
              const { type, warning } = ticketType(child);
              const defect = ticketDefect(parsed) ?? warning;
              const ticketId = ghId(repo, child.number);

              if (defect !== undefined) {
                warnings.push(
                  new MapWarning({
                    kind: "malformed-ticket",
                    subject: ticketId,
                    message: `#${child.number}: ${defect}`,
                  }),
                );
              }

              return new TicketNode({
                id: ticketId,
                shortId: String(child.number),
                title: child.title,
                type,
                status: child.state,
                assignee: child.assignee?.login ?? null,
                blockedBy: yield* blockedBy(child.number),
                bodyHash: hashBody(raw),
                ...(defect === undefined ? {} : { malformed: defect }),
              });
            }),
          { concurrency: 8 },
        );

        const known = new Set(tickets.map((t) => t.shortId));
        const resolved = tickets.map((ticket) => {
          const live = ticket.blockedBy.filter((b) => known.has(b));
          for (const missing of ticket.blockedBy.filter((b) => !known.has(b))) {
            warnings.push(
              new MapWarning({
                kind: "dangling-edge",
                subject: ticket.id,
                message: `#${ticket.shortId} is blocked by #${missing}, which is not a ticket on this map`,
              }),
            );
          }
          return live.length === ticket.blockedBy.length
            ? ticket
            : new TicketNode({ ...ticket, blockedBy: live });
        });

        const raw = issue.body ?? "";
        const parsedBody = parseMapBody(raw, resolved);
        if (parsedBody.destination.length === 0) {
          return yield* new MapUnparseable({
            id: String(id),
            reason: "no `## Destination` section — a map is defined by where it is going",
          });
        }

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
          title: issue.title,
          destination: parsedBody.destination,
          tracker: "github",
          revision: 0,
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
      const maps = yield* searchIssues("labels=wayfinder:map");
      return yield* Effect.forEach(
        maps,
        (issue) =>
          Effect.gen(function* () {
            const parsed = parseMapBody(issue.body ?? "");
            // Lightweight by contract: child *states*, never their dependencies.
            const children = yield* subIssues(issue.number);
            const closed = children.filter((c) => c.state === "closed").length;
            return new MapDescriptor({
              id: ghId(repo, issue.number),
              title: issue.title,
              destination: parsed.destination,
              openCount: children.length - closed,
              closedCount: closed,
              changedAt: issue.updated_at,
            });
          }),
        { concurrency: 4 },
      );
    });

    const loadMapBody = (id: ResourceId) =>
      Effect.gen(function* () {
        const number = issueNumber(id);
        if (number === null) return yield* new MapNotFound({ id: String(id) });
        const issue = yield* required<Issue>(
          `/repos/${repo.owner}/${repo.repo}/issues/${number}`,
          () => new MapNotFound({ id: String(id) }),
        );
        const raw = issue.body ?? "";
        return new Body({ id, bodyHash: hashBody(raw), markdown: raw });
      });

    const loadTicketBody = (_mapId: ResourceId, ticketId: ResourceId) => loadMapBody(ticketId);

    /**
     * ETag-conditional polling. A `304` is not a change and costs no quota; a
     * `200` is a tick. Errors back off exponentially to a five-minute ceiling
     * rather than hammering a rate-limited API.
     */
    const pollOnce = Effect.gen(function* () {
      const url = `${API}/repos/${repo.owner}/${repo.repo}/issues?state=all&labels=wayfinder:map&per_page=1&sort=updated`;
      const token = yield* withToken;
      const known = yield* Ref.get(etags);
      const previous = known.get(url);

      const response = yield* baseClient.execute(
        HttpClientRequest.get(url).pipe(
          HttpClientRequest.setHeaders({
            accept: "application/vnd.github+json",
            authorization: `Bearer ${token}`,
            "x-github-api-version": "2022-11-28",
            ...(previous === undefined ? {} : { "if-none-match": previous }),
          }),
        ),
      );

      const etag = response.headers["etag"];
      if (etag !== undefined) {
        yield* Ref.update(etags, (m) => new Map(m).set(url, etag));
      }
      return response.status !== 304 && previous !== undefined;
    });

    const changes = (): Stream.Stream<ChangeSignal> =>
      // Re-derived whenever the cadence changes: switching to `paused` must
      // cancel the schedule outright, not merely lengthen it — a VPS left
      // running for days with nobody connected should cost nothing.
      cadence.changes.pipe(
        Stream.flatMap(
          (mode) =>
            mode === "paused"
              ? Stream.empty
              : Stream.repeatEffect(
                  pollOnce.pipe(
                    // Back off exponentially to a five-minute ceiling rather
                    // than hammering an API that is rate-limiting us. A tick is
                    // never load-bearing, so a swallowed one costs nothing.
                    Effect.retry(
                      Schedule.exponential(Duration.seconds(5)).pipe(
                        Schedule.union(Schedule.spaced(Duration.minutes(5))),
                        Schedule.compose(Schedule.recurs(20)),
                      ),
                    ),
                    Effect.orElseSucceed(() => false),
                  ),
                ).pipe(
                  Stream.schedule(Schedule.spaced(POLL_INTERVAL[mode])),
                  Stream.filter((changed) => changed),
                  Stream.map(() => ({ mapId: null, at: new Date().toISOString() })),
                ),
          { switch: true },
        ),
      );

    return {
      kind: "github",
      label: `${repo.owner}/${repo.repo}`,
      listMaps: () => listMaps,
      loadMap,
      loadMapBody,
      loadTicketBody,
      changes,
    } satisfies TrackerAdapter;
  });
