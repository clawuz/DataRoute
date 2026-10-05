import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@collector": fileURLToPath(new URL("../functions/src", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  test: { include: ["test/**/*.test.{ts,tsx}"], environment: "node" },
});
