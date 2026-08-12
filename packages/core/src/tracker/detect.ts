/**
 * Detection — **one repo, one tracker** (SPEC.md §5).
 *
 * This reverses an earlier design in which both adapters were live at once and
 * the picker unioned across them. Do not resurrect `TrackerRegistry`-as-a-
 * collection: the service *is* the detected tracker, `listMaps` never unions,
 * and adapters are never side by side.
 *
 *   1. `.wayfinder/` present → local-markdown
 *   2. else a GitHub `origin` remote → GitHub Issues
 *   3. `--tracker local|github` forces the choice
 *
 * Local wins because `.wayfinder/` is a deliberate artifact that works offline,
 * and nearly every repo has a GitHub remote that would otherwise hijack
 * detection.
 */
import { Context, Effect } from "effect";
import type { TrackerKind } from "../domain/model.js";
import type { TrackerAdapter } from "./adapter.js";

export type TrackerOverride = TrackerKind | null;

/**
 * The one tag in the tracker layer. It holds the adapter that detection
 * resolved — the *detected tracker*, singular.
 */
export class DetectedTracker extends Context.Tag("@foglight/core/DetectedTracker")<
  DetectedTracker,
  TrackerAdapter
>() {}

export const use = <A, E, R>(
  f: (adapter: TrackerAdapter) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | DetectedTracker> => Effect.flatMap(DetectedTracker, f);
