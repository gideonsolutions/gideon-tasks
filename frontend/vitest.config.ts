import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/server/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "src/server/__tests__/server-only-stub.ts"),
    },
  },
});
