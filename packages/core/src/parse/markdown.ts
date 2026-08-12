/**
 * The **shared** body parser (SPEC.md §5, "Normalization — hybrid").
 *
 * Adapters extract only *metadata* — frontmatter for local-markdown, labels and
 * sub-issues for GitHub. Bodies are parsed here, once, because both trackers
 * carry identical body conventions: the same wayfinder skill writes them.
 * Anything that reads a `##` heading belongs in this file and nowhere else.
 */
import { createHash } from "node:crypto";

/** Stable content key for the body cache. Cheap: adapters already hold the text. */
export const hashBody = (markdown: string): string =>
  createHash("sha256").update(markdown).digest("hex").slice(0, 16);

/** YAML-ish frontmatter, split off. We do not pull in a YAML parser for this. */
export const splitFrontmatter = (source: string): { frontmatter: string; body: string } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (match === null) return { frontmatter: "", body: source };
  return { frontmatter: match[1] ?? "", body: source.slice(match[0].length) };
};

/**
 * Frontmatter is only ever the flat scalars and inline lists wayfinder writes
 * (`title`, `labels`, `status`, `assignee`, `blocked-by`), so a line reader is
 * honest here — and it cannot fail on prose the way a strict YAML parse would.
 */
export const parseFrontmatter = (frontmatter: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1];
    if (key === undefined) continue;
    out[key] = unquote((match[2] ?? "").trim());
  }
  return out;
};

const unquote = (value: string): string =>
  /^"[\s\S]*"$/.test(value) || /^'[\s\S]*'$/.test(value) ? value.slice(1, -1) : value;

/** `[a, b]` or `a, b` → `["a", "b"]`. Empty and `[]` both mean none. */
export const parseInlineList = (value: string | undefined): ReadonlyArray<string> => {
  if (value === undefined) return [];
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map((s) => unquote(s.trim()))
    .filter((s) => s.length > 0);
};

/**
 * Split a body into its `##` sections, keyed by lowercased heading text.
 * Content before the first heading is stored under `""`.
 */
export const splitSections = (body: string): ReadonlyMap<string, string> => {
  const sections = new Map<string, string>();
  const lines = body.split(/\r?\n/);
  let heading = "";
  let buffer: string[] = [];

  const flush = () => {
    const existing = sections.get(heading);
    const text = buffer.join("\n").trim();
    sections.set(heading, existing === undefined ? text : `${existing}\n${text}`);
  };

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match === null) {
      buffer.push(line);
      continue;
    }
    flush();
    heading = (match[1] ?? "").toLowerCase();
    buffer = [];
  }
  flush();
  return sections;
};

/** HTML comments are wayfinder's own scaffolding notes, never content. */
export const stripComments = (markdown: string): string =>
  markdown.replace(/<!--[\s\S]*?-->/g, "").trim();

/**
 * A list entry as wayfinder writes it in Decisions-so-far, Not-yet-specified
 * and Out-of-scope: one `- ` bullet, possibly wrapped over several lines.
 */
export const listEntries = (section: string): ReadonlyArray<string> => {
  const entries: string[] = [];
  let current: string[] = [];
  for (const line of stripComments(section).split(/\r?\n/)) {
    if (/^\s*-\s+/.test(line)) {
      if (current.length > 0) entries.push(current.join(" ").trim());
      current = [line.replace(/^\s*-\s+/, "")];
    } else if (current.length > 0 && line.trim() !== "") {
      current.push(line.trim());
    } else if (line.trim() === "" && current.length > 0) {
      entries.push(current.join(" ").trim());
      current = [];
    }
  }
  if (current.length > 0) entries.push(current.join(" ").trim());
  return entries.filter((e) => e.length > 0);
};

/**
 * Fog and out-of-scope entries key on a **slug from their bolded lead term**
 * (SPEC.md §5). The convention the spec states for map authors is that such an
 * entry leads with a bold term; a content hash covers the ones that don't.
 * Non-conforming entries are explicitly **not** warned about.
 */
export const entryKey = (entry: string): { slug: string; term: string } => {
  const bold = /^\*\*(.+?)\*\*/.exec(entry.trim());
  if (bold !== null) {
    const term = (bold[1] ?? "").trim();
    return { slug: slugify(term), term };
  }
  // Fallback: hash the content, and show a leading clause as the term so the
  // rail still has something readable to print.
  const term =
    entry
      .replace(/^\W+/, "")
      .split(/\s+—\s+|\s+--\s+|[.;]/)[0]
      ?.trim() ?? entry;
  return { slug: `h-${hashBody(entry).slice(0, 8)}`, term: truncate(term, 80) };
};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "entry";

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

/** Strip the leading `**Term** — ` so what's left is the entry's own prose. */
export const entryDetail = (entry: string): string =>
  entry
    .trim()
    .replace(/^\*\*(.+?)\*\*\s*(—|--|–|:)?\s*/, "")
    .trim();

/** `[Title](link) — gist` — the shape of a Decisions-so-far line. */
export const parseDecisionLine = (
  entry: string,
): { title: string; link: string | null; gist: string } => {
  const linked = /^\[(.+?)\]\((.+?)\)\s*(?:—|--|–|:)?\s*([\s\S]*)$/.exec(entry.trim());
  if (linked !== null) {
    return {
      title: (linked[1] ?? "").trim(),
      link: (linked[2] ?? "").trim(),
      gist: (linked[3] ?? "").trim(),
    };
  }
  const parts = entry.split(/\s+—\s+|\s+--\s+/);
  return {
    title: (parts[0] ?? entry).trim(),
    link: null,
    gist: parts.slice(1).join(" — ").trim(),
  };
};
