import { HttpClient, HttpClientResponse } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeGitHubAdapter } from "#core/tracker/github.js";
import type { PollMode } from "#core/tracker/github.js";

beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "fixture-token"));
afterEach(() => vi.unstubAllEnvs());

const listResponse = (body: string) => {
  const client = HttpClient.make((request, url) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(url.pathname.endsWith("/sub_issues") ? "[]" : body, {
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );

  return Effect.runPromise(
    Effect.gen(function* () {
      const cadence = yield* SubscriptionRef.make<PollMode>("paused");
      const adapter = yield* makeGitHubAdapter({ owner: "fixture", repo: "maps" }, cadence);

      return yield* adapter.listMaps().pipe(Effect.either);
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, client),
      Effect.provide(NodeContext.layer),
    ),
  );
};

describe("GitHub response validation", () => {
  it("decodes valid issue data into a map descriptor", async () => {
    const result = await listResponse(
      JSON.stringify([
        {
          number: 1,
          title: "A map",
          body: "## Destination\n\nShip the map.",
          state: "open",
          assignee: null,
          labels: [{ name: "wayfinder:map" }],
          updated_at: "2026-09-05T00:00:00Z",
        },
      ]),
    );

    expect(result).toMatchObject({
      _tag: "Right",
      right: [
        {
          id: "github:fixture/maps#1",
          title: "A map",
          destination: "Ship the map.",
          openCount: 0,
          closedCount: 0,
        },
      ],
    });
  });

  it("reports malformed issue fields as a tracker failure", async () => {
    const result = await listResponse('[{"number":"invalid"}]');

    expect(result).toMatchObject({
      _tag: "Left",
      left: { _tag: "TrackerUnreachable", tracker: "github" },
    });
  });

  it("reports invalid JSON through the same error channel", async () => {
    const result = await listResponse("{invalid");

    expect(result).toMatchObject({
      _tag: "Left",
      left: { _tag: "TrackerUnreachable", tracker: "github" },
    });
  });
});
