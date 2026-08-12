/**
 * GitHub credentials, **env first** (SPEC.md §5).
 *
 * The ordering is not stylistic: headless-on-a-VPS is exactly the case foglight
 * exists for, and it is also exactly where `gh` is least likely to be installed
 * and logged in. So a token in the environment wins, `gh auth token` is the
 * fallback, and the absence of both is a *named* state the UI renders — never a
 * crash and never an anonymous request that later 404s confusingly on a private
 * repo.
 */
import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Option } from "effect";
import { TrackerUnauthenticated } from "../domain/errors.js";

const fromEnv = Effect.sync(() =>
  Option.fromNullable(process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"]).pipe(
    Option.filter((t) => t.trim().length > 0),
  ),
);

const fromGhCli = Command.make("gh", "auth", "token").pipe(
  Command.string,
  Effect.map((out) => out.trim()),
  Effect.filterOrFail(
    (token) => token.length > 0,
    () => new Error("gh returned no token"),
  ),
  Effect.map(Option.some),
  Effect.orElseSucceed(() => Option.none<string>()),
);

export const resolveToken: Effect.Effect<
  string,
  TrackerUnauthenticated,
  CommandExecutor.CommandExecutor
> = Effect.gen(function* () {
  const env = yield* fromEnv;
  if (Option.isSome(env)) return env.value;

  const cli = yield* fromGhCli;
  if (Option.isSome(cli)) return cli.value;

  return yield* new TrackerUnauthenticated({
    tracker: "github",
    reason:
      "no GITHUB_TOKEN or GH_TOKEN in the environment, and `gh auth token` produced nothing. " +
      "Set a token, or run `gh auth login`.",
  });
});
