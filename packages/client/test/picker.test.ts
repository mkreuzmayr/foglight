/**
 * Picker grouping and filter — the jump pane's pure logic (ticket 007).
 *
 * The overlay itself is Chromium's job (`test/cockpit.probe.ts`); this file
 * covers the rules that must hold whether or not a dialog is on screen:
 * global search, project scope, colliding names, degraded-project copy.
 */
import type { MapDescriptor, Project, ResourceId } from "@foglight/core/domain";
import { describe, expect, it } from "vitest";
import {
  collidingNames,
  degradedNote,
  filterMaps,
  isMultiProject,
  mapsOf,
  projectLabel,
} from "@/lib/picker.js";

const id = (value: string) => value as ResourceId;

const project = (overrides: Partial<Project> & Pick<Project, "id" | "name" | "path">): Project =>
  ({
    state: "ready",
    ...overrides,
  }) as Project;

const map = (
  overrides: Partial<MapDescriptor> & Pick<MapDescriptor, "id" | "title" | "project">,
): MapDescriptor =>
  ({
    destination: "",
    openCount: 1,
    closedCount: 0,
    changedAt: "2026-08-14T00:00:00Z",
    ...overrides,
  }) as MapDescriptor;

const foglight = project({
  id: "foglight-3f2a",
  name: "foglight",
  path: "/home/michaelk/repos/foglight",
});

const wayfinder = project({
  id: "wayfinder-9b1c",
  name: "wayfinder",
  path: "/home/michaelk/repos/wayfinder",
  trackerKind: "github",
});

const blog = project({
  id: "blog-1f00",
  name: "blog",
  path: "/home/michaelk/repos/blog",
});

const empty = project({
  id: "dotfiles-77aa",
  name: "dotfiles",
  path: "/home/michaelk/dotfiles",
  state: "no-tracker",
});

const broken = project({
  id: "chronoflow-e401",
  name: "chronoflow",
  path: "/home/michaelk/work/chronoflow",
  state: "error",
  trackerKind: "github",
});

const otherFoglight = project({
  id: "foglight-aa11",
  name: "foglight",
  path: "/tmp/checkouts/foglight",
});

const maps: readonly MapDescriptor[] = [
  map({
    id: id("foglight-3f2a:local:.wayfinder/map.md"),
    title: "Foglight — wayfinder map viewer",
    destination: "A complete SPEC.md for foglight v1",
    project: { id: foglight.id, name: foglight.name },
  }),
  map({
    id: id("wayfinder-9b1c:github:michaelk/wayfinder"),
    title: "Skill v2 — charting rework",
    destination: "The charting session split",
    project: { id: wayfinder.id, name: wayfinder.name },
  }),
  map({
    id: id("blog-1f00:local:.wayfinder/map.md"),
    title: "Relaunch",
    destination: "Posts migrated, RSS unbroken",
    project: { id: blog.id, name: blog.name },
  }),
];

describe("mapsOf", () => {
  it("returns only the maps that belong to that project", () => {
    expect(mapsOf(maps, foglight.id).map((m) => m.title)).toEqual([
      "Foglight — wayfinder map viewer",
    ]);
  });
});

describe("filterMaps", () => {
  const projects = [foglight, wayfinder, blog, empty, broken];

  it("matches a title across every project", () => {
    expect(filterMaps(maps, projects, "skill").map((m) => m.title)).toEqual([
      "Skill v2 — charting rework",
    ]);
  });

  it("matches a destination", () => {
    expect(filterMaps(maps, projects, "SPEC.md").map((m) => m.title)).toEqual([
      "Foglight — wayfinder map viewer",
    ]);
  });

  it("matches a project name, not just map text", () => {
    expect(filterMaps(maps, projects, "blog").map((m) => String(m.id))).toEqual([
      "blog-1f00:local:.wayfinder/map.md",
    ]);
  });

  it("is empty when nothing matches, rather than falling back to the scoped list", () => {
    expect(filterMaps(maps, projects, "nope")).toEqual([]);
  });
});

describe("isMultiProject", () => {
  it("hides grouping when only one project is attached", () => {
    expect(isMultiProject([foglight])).toBe(false);
  });

  it("shows grouping as soon as a second project is attached", () => {
    expect(isMultiProject([foglight, wayfinder])).toBe(true);
  });
});

describe("projectLabel", () => {
  it("is the basename when the name is unique", () => {
    const collisions = collidingNames([foglight, wayfinder]);
    expect(projectLabel(foglight, collisions)).toEqual({ name: "foglight" });
  });

  it("carries the path when two projects share a basename", () => {
    const collisions = collidingNames([foglight, otherFoglight, wayfinder]);
    expect(collisions.has("foglight")).toBe(true);
    expect(projectLabel(foglight, collisions)).toEqual({
      name: "foglight",
      disambiguator: "/home/michaelk/repos/foglight",
    });

    expect(projectLabel(otherFoglight, collisions)).toEqual({
      name: "foglight",
      disambiguator: "/tmp/checkouts/foglight",
    });

    expect(projectLabel(wayfinder, collisions)).toEqual({ name: "wayfinder" });
  });
});

describe("degradedNote", () => {
  it("explains a tracker-less project rather than dropping it", () => {
    expect(degradedNote(empty)).toMatch(/no tracker/i);
  });

  it("explains a failed tracker rather than dropping it", () => {
    expect(degradedNote(broken)).toMatch(/failed/i);
  });
});
