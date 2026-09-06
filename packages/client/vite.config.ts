import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * One client build, served identically by the desktop window and by headless
 * (SPEC.md §2) — there is no trimmed "remote" UI to configure here.
 *
 * In dev the API and the SSE feed are proxied to a `foglight serve` running
 * beside this, so the dev server behaves exactly like the production one.
 */
const API_TARGET = process.env.FOGLIGHT_SERVER ?? "http://127.0.0.1:4747";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Core is consumed from source: the client takes its *types* from the
      // same declarations the server implements, and Vite bundles what little
      // of it actually reaches the browser.
      "@foglight/core/domain": fileURLToPath(
        new URL("../core/src/domain/index.ts", import.meta.url),
      ),
      "@foglight/core/api": fileURLToPath(new URL("../core/src/api/index.ts", import.meta.url)),
    },
  },
  build: {
    // Consumed by the Node server as static files, never by a bundler.
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
});
