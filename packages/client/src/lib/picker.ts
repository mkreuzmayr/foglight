/**
 * Jump-pane picker logic (ticket 007 / prototype variant E).
 *
 * Grouping, global search, colliding-name disambiguation, and the copy a
 * degraded project shows on the right when it has no maps. The overlay is
 * the component; these are the rules it must not invent twice.
 */
import type { MapDescriptor, Project } from "@foglight/core/domain";

export const mapsOf = (
  maps: readonly MapDescriptor[],
  projectId: string,
): readonly MapDescriptor[] => maps.filter((map) => map.project?.id === projectId);

/**
 * Typing searches globally: title, destination, and project name. Scope only
 * shapes browsing — a query ignores the left pane.
 */
export const filterMaps = (
  maps: readonly MapDescriptor[],
  projects: readonly Project[],
  query: string,
): readonly MapDescriptor[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return maps;
  }

  const byId = new Map(projects.map((project) => [project.id, project]));

  return maps.filter((map) => {
    const project = map.project === undefined ? undefined : byId.get(map.project.id);

    return (
      map.title.toLowerCase().includes(needle) ||
      map.destination.toLowerCase().includes(needle) ||
      (project?.name.toLowerCase().includes(needle) ?? false)
    );
  });
};

export const isMultiProject = (projects: readonly Project[]): boolean => projects.length > 1;

export const collidingNames = (projects: readonly Project[]): ReadonlySet<string> => {
  const counts = new Map<string, number>();
  for (const project of projects) {
    counts.set(project.name, (counts.get(project.name) ?? 0) + 1);
  }

  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
};

export type ProjectLabel = { name: string; disambiguator?: string };

/** Basename, plus the absolute path when two attached projects share it. */
export const projectLabel = (project: Project, collisions: ReadonlySet<string>): ProjectLabel =>
  collisions.has(project.name)
    ? { name: project.name, disambiguator: project.path }
    : { name: project.name };

export const degradedNote = (project: Project): string => {
  if (project.state === "no-tracker") {
    return "no tracker detected — maps appear the moment one lands";
  }

  if (project.state === "error") {
    return "this project's tracker failed — maps unavailable";
  }

  return "no maps in this project yet";
};
