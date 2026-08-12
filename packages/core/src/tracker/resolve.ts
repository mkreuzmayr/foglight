/**
 * Resolving the one adapter for a repo (SPEC.md §5).
 *
 * There is no config file in v1, and the GitHub adapter reads the current
 * clone's `origin` only — no arbitrary `owner/repo` flag. The rule is short
 * enough to state in full:
 *
 *   1. a wayfinder directory present (`.wayfinder/`, or an undotted
 *      `wayfinder/`) → local-markdown
 *   2. else a GitHub `origin` remote → GitHub Issues
 *   3. `--tracker local|github` forces the choice
 */
import { FileSystem, Path, type CommandExecutor, type HttpClient } from "@effect/platform";
import { Effect, Layer, SubscriptionRef } from "effect";
import { NoTrackerDetected, TrackerUnreachable } from "../domain/errors.js";
import type { TrackerKind } from "../domain/model.js";
import type { TrackerAdapter } from "./adapter.js";
import { DetectedTracker, type TrackerOverride } from "./detect.js";
import { makeGitHubAdapter, type GitHubRepo, type PollMode } from "./github.js";
import { makeLocalAdapter } from "./local.js";

/** `git@github.com:owner/repo.git`, `https://github.com/owner/repo`, and friends. */
export const parseGitHubRemote = (remote: string): GitHubRepo | null => {
  const match = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  if (match === null) return null;
  const owner = match[1];
  const repo = match[2];
  return owner === undefined || repo === undefined ? null : { owner, repo };
};

const readOrigin = (repoRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // Read `.git/config` directly rather than shelling out to git: one less
    // binary foglight requires on a machine where it may only be reading files.
    const config = yield* fs
      .readFileString(path.join(repoRoot, ".git", "config"))
      .pipe(Effect.orElseSucceed(() => ""));
    const section = /\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/.exec(config);
    if (section === null) return null;
    const url = /url\s*=\s*(.+)/.exec(section[1] ?? "");
    return url === null ? null : parseGitHubRemote(url[1] ?? "");
  });

export type ResolvedTracker = {
  readonly adapter: TrackerAdapter;
  readonly cadence: SubscriptionRef.SubscriptionRef<PollMode>;
};

export const resolveTracker = (
  repoRoot: string,
  override: TrackerOverride = null,
): Effect.Effect<
  ResolvedTracker,
  NoTrackerDetected | TrackerUnreachable,
  FileSystem.FileSystem | Path.Path | HttpClient.HttpClient | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // Paused until the server says otherwise: no clients, no polling.
    const cadence = yield* SubscriptionRef.make<PollMode>("paused");

    // Both spellings count as "a local map lives here" — see WAYFINDER_DIRS
    // in the local adapter for why the undotted form is accepted.
    const hasWayfinder = yield* Effect.reduce(
      [".wayfinder", "wayfinder"],
      false,
      (found, candidate) =>
        found
          ? Effect.succeed(true)
          : fs.exists(path.join(repoRoot, candidate)).pipe(Effect.orElseSucceed(() => false)),
    );
    const origin = yield* readOrigin(repoRoot);

    const chosen: TrackerKind | null =
      override ?? (hasWayfinder ? "local" : origin !== null ? "github" : null);

    if (chosen === null) {
      return yield* new NoTrackerDetected({ cwd: repoRoot });
    }

    if (chosen === "local") {
      if (!hasWayfinder && override !== null) {
        return yield* new TrackerUnreachable({
          tracker: "local",
          reason: `--tracker local was given, but ${repoRoot} has no .wayfinder/ or wayfinder/ directory`,
        });
      }
      return { adapter: yield* makeLocalAdapter(repoRoot), cadence };
    }

    if (origin === null) {
      return yield* new TrackerUnreachable({
        tracker: "github",
        reason:
          override === null
            ? `${repoRoot} has no GitHub \`origin\` remote`
            : "--tracker github was given, but this clone has no GitHub `origin` remote",
      });
    }
    return { adapter: yield* makeGitHubAdapter(origin, cadence), cadence };
  });

export const DetectedTrackerLive = (repoRoot: string, override: TrackerOverride = null) =>
  Layer.effect(
    DetectedTracker,
    resolveTracker(repoRoot, override).pipe(Effect.map((r) => r.adapter)),
  );
