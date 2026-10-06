import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@collector": here("../functions/src"), "@web": here("../web/src") },
    // web/ modules must use globe's copies of these (one React, one three).
    dedupe: ["react", "react-dom", "three", "postprocessing"],
  },
  server: { fs: { allow: [".."] } },
  test: { include: ["test/**/*.test.{ts,tsx}"], environment: "node" },
});
