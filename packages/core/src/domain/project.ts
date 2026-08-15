/**
 * Project identity (CONTEXT.md). A project is a folder; its id is a slug of
 * the basename plus a short hash of the canonical path, so remembered maps
 * and bookmarked URLs survive re-attach.
 */
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { slugify } from "../parse/markdown.js";
import { makeId, type ResourceId } from "./model.js";

export const idFor = (canonicalPath: string): string => {
  const name = slugify(basename(canonicalPath));
  const hash = createHash("sha256").update(canonicalPath).digest("hex").slice(0, 4);
  return `${name}-${hash}`;
};

export const qualify = (projectId: string, adapterId: string): ResourceId =>
  makeId(`${projectId}:${adapterId}`);
