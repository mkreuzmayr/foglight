/**
 * Map and ticket bodies, parsed into the two halves the transport splits on:
 * the *structure* that goes into a `MapSnapshot`, and the *prose* that goes
 * into a `Body` (SPEC.md §6). Both come out of one read, so `bodyHash` is free.
 */
import { makeId } from "#core/domain/model.js";
import type { ResourceId } from "#core/domain/model.js";
import {
  entryDetail,
  entryKey,
  hashBody,
  listEntries,
  parseDecisionLine,
  splitSections,
  stripComments,
} from "./markdown.js";

export type ParsedFogEntry = {
  slug: string;
  term: string;
  markdown: string;
  /** open tickets this patch hangs on — derived below, never authored */
  hangsOn: readonly string[];
};

export type ParsedScopeEntry = { slug: string; term: string; markdown: string };

export type ParsedDecision = { title: string; link: string | null; gist: string };

export type ParsedMapBody = {
  destination: string;
  notes: string;
  decisions: readonly ParsedDecision[];
  fog: readonly ParsedFogEntry[];
  outOfScope: readonly ParsedScopeEntry[];
  bodyHash: string;
};

/**
 * Which tickets a fog patch hangs on is never authored as data — wayfinder
 * writes it as prose ("hangs on the adapter interface and headless design").
 * Fog needs *some* position on the graph, so we read the references the prose
 * already contains: explicit ids first, then ticket titles mentioned by name.
 *
 * A patch that names nothing hangs on nothing and simply floats at the fog
 * band beyond the last rank. That is a fine answer, not a failure — and
 * deliberately not a warning, per the "do not warn on non-conforming entries"
 * rule this spec sets for fog.
 */
const deriveHangsOn = (
  entry: string,
  tickets: readonly { shortId: string; title: string; status: string }[],
): readonly string[] => {
  const open = tickets.filter((t) => t.status === "open");
  const hits = new Set<string>();

  for (const ticket of open) {
    // `005`, `#42` — an id written out is unambiguous.
    const idPattern = new RegExp(`(^|[^\\w])#?${escapeRegExp(ticket.shortId)}([^\\w]|$)`);
    if (idPattern.test(entry)) {
      hits.add(ticket.shortId);
      continue;
    }

    // Otherwise, a title mentioned in the prose. Case-insensitive, whole title:
    // partial matching would attach every patch to every ticket.
    if (ticket.title.length > 8 && entry.toLowerCase().includes(ticket.title.toLowerCase())) {
      hits.add(ticket.shortId);
    }
  }

  return [...hits];
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const parseMapBody = (
  markdown: string,
  tickets: readonly { shortId: string; title: string; status: string }[] = [],
): ParsedMapBody => {
  const sections = splitSections(markdown);
  const get = (name: string) => stripComments(sections.get(name) ?? "");

  const fogSection = get("not yet specified");
  const scopeSection = get("out of scope");

  return {
    destination: collapse(get("destination")),
    notes: get("notes"),
    decisions: listEntries(get("decisions so far")).map(parseDecisionLine),
    fog: listEntries(fogSection).map((entry) => {
      const { slug, term } = entryKey(entry);

      return { slug, term, markdown: entryDetail(entry), hangsOn: deriveHangsOn(entry, tickets) };
    }),
    outOfScope: listEntries(scopeSection).map((entry) => {
      const { slug, term } = entryKey(entry);

      return { slug, term, markdown: entryDetail(entry) };
    }),
    bodyHash: hashBody(markdown),
  };
};

export type ParsedTicketBody = {
  question: string;
  resolution: string | null;
  bodyHash: string;
};

export const parseTicketBody = (markdown: string): ParsedTicketBody => {
  const sections = splitSections(markdown);
  const question = stripComments(sections.get("question") ?? "");
  const resolution = stripComments(sections.get("resolution") ?? "");

  return {
    question: collapse(question),
    resolution: resolution.length > 0 ? resolution : null,
    bodyHash: hashBody(markdown),
  };
};

/**
 * A ticket without a `## Question` is malformed — the question *is* the
 * ticket. Returns the reason to mark the node with, or `undefined`.
 */
export const ticketDefect = (parsed: ParsedTicketBody): string | undefined =>
  parsed.question.length === 0 ? "no `## Question` section — a ticket is its question" : undefined;

const collapse = (text: string): string => text.replace(/\s*\n\s*/g, " ").trim();

/** Fog and out-of-scope ids qualify off the map they belong to. */
export const fogId = (mapId: ResourceId, slug: string): ResourceId =>
  makeId(`${mapId}#fog/${slug}`);

export const outOfScopeId = (mapId: ResourceId, slug: string): ResourceId =>
  makeId(`${mapId}#out-of-scope/${slug}`);
