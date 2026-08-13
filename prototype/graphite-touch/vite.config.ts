import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// THROWAWAY PROTOTYPE — served over the tailnet with TLS, which doubles as a
// first look at what "Tailscale support" means in practice (ticket 006):
//   tailscale cert --cert-file .certs/host.crt --key-file .certs/host.key <name>
// then bind to the tailnet interface *only*, so nothing is exposed on the LAN.
const TAILNET_NAME = "cachyharness.tail71b0eb.ts.net";
const certPath = ".certs/host.crt";
const keyPath = ".certs/host.key";
const haveCert = existsSync(certPath) && existsSync(keyPath);

const tailnetIp = () => {
  try {
    return execSync("tailscale ip -4", { encoding: "utf8" }).trim().split("\n")[0];
  } catch {
    return undefined;
  }
};

const host = haveCert ? (tailnetIp() ?? "0.0.0.0") : "localhost";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host,
    port: 5205,
    strictPort: true,
    allowedHosts: [TAILNET_NAME],
    https: haveCert ? { cert: readFileSync(certPath), key: readFileSync(keyPath) } : undefined,
    hmr: haveCert ? { host: TAILNET_NAME, protocol: "wss", clientPort: 5205 } : undefined,
  },
});
