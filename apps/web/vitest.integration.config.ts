import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const target = new URL(process.env.DATABASE_URL ?? "http://missing.invalid");
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
  throw new Error(
    "Integration tests require an explicit isolated loopback DATABASE_URL.",
  );
}
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    maxWorkers: 1,
    restoreMocks: true,
  },
});
