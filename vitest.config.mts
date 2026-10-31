import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Database tests share one test database, so files run one after another.
    fileParallelism: false,
    env: { DATABASE_URL: "postgres://thinkaloud:thinkaloud@localhost:5433/thinkaloud_test" },
  },
});
