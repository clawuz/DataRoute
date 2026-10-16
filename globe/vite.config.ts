import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      // the new link has its own name and share image; the old deploy keeps the index.html as written
      name: "personal-meta",
      transformIndexHtml(html) {
        if (process.env.VITE_PERSONAL !== "1") return html;
        return html
          .replace(/<title>.*<\/title>/, "<title>A World of Music · Turkish Airlines</title>")
          .replace(/(<meta name="description" content=")[^"]*/, "$1Turn the places you have been, or dream of, into music. Turkish Airlines, flying to more countries than any other airline in the world.")
          .replace(/(<meta property="og:title" content=")[^"]*/, "$1A World of Music · Turkish Airlines")
          .replace(/(<meta property="og:description" content=")[^"]*/, "$1Every journey has a sound. Choose yours.")
          .replace(/https:\/\/dataroute-tk\.web\.app\/og\.jpg/g, "https://worldofmusic-tk.web.app/og-world.jpg"); // a new file name: chat apps keep the old image of a link in their cache
      },
    },
  ],
  resolve: {
    alias: { "@collector": here("../functions/src"), "@web": here("../web/src") },
    // web/ modules must use globe's copies of these (one React, one three).
    dedupe: ["react", "react-dom", "three", "postprocessing"],
  },
  server: { fs: { allow: [".."] } },
  test: { include: ["test/**/*.test.{ts,tsx}"], environment: "node" },
});
