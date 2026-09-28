import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { NODE_ENV: "test", LOG_LEVEL: "silent" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
