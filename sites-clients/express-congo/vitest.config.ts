import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve("src") } },
  test: {
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    env: { APP_ENV: "demo", LOCAL_DATABASE_PATH: ".data/test.db" },
  },
});
