/**
 * The attached projects of this serve session. Registration is in-process
 * here; ticket 006 hangs the attacher channel on the same attach/detach.
 */
import { Project } from "@foglight/core";
import { Context, Effect, Layer, Ref } from "effect";

export type ProjectSessionService = {
  readonly list: Effect.Effect<ReadonlyArray<Project>>;
  readonly attach: (project: Project) => Effect.Effect<Project>;
  readonly replace: (project: Project) => Effect.Effect<void>;
  readonly detach: (canonicalPath: string) => Effect.Effect<Project | undefined>;
};

export class ProjectSession extends Context.Tag("@foglight/server/ProjectSession")<
  ProjectSession,
  ProjectSessionService
>() {}

export const layer = (projects: ReadonlyArray<Project>): Layer.Layer<ProjectSession> =>
  Layer.effect(
    ProjectSession,
    Effect.gen(function* () {
      const ref = yield* Ref.make(projects);
      return {
        list: Ref.get(ref),
        attach: (project) =>
          Ref.modify(ref, (current) => {
            const existing = current.find((p) => p.path === project.path);
            if (existing !== undefined) return [existing, current];
            return [project, [...current, project]];
          }),
        replace: (project) =>
          Ref.update(ref, (current) => {
            const index = current.findIndex((p) => p.path === project.path);
            if (index < 0) return current;
            const next = current.slice();
            next[index] = project;
            return next;
          }),
        detach: (canonicalPath) =>
          Ref.modify(ref, (current) => {
            const existing = current.find((p) => p.path === canonicalPath);
            return [existing, current.filter((p) => p.path !== canonicalPath)];
          }),
      } satisfies ProjectSessionService;
    }),
  );
