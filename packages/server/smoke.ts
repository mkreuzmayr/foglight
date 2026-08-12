import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { AppLayer } from "@foglight/server";
NodeRuntime.runMain(
  Layer.launch(
    AppLayer({
      repoRoot: "/home/michaelk/repos/foglight",
      host: "127.0.0.1",
      port: 4747,
      tracker: null,
      clientDir: "/home/michaelk/repos/foglight/packages/client/dist",
    }),
  ),
);
