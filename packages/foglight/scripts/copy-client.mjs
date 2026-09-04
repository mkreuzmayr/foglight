/**
 * Copy the one Vite bundle into `dist/client/`, where the server serves it as
 * static assets in **both** modes (SPEC.md §11). There is exactly one client
 * build; nothing here is mode-specific.
 */
import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "client", "dist");
const target = join(here, "..", "dist", "client");

try {
  await stat(join(source, "index.html"));
} catch {
  console.error(
    `foglight build: no client bundle at ${source}.\n` +
      "  Run the client's build first (`turbo run build` does this in order).",
  );

  process.exit(1);
}

await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
console.log(`foglight build: client bundle → ${target}`);
