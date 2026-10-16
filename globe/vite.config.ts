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
        const DESC = "Every journey has a sound. Turn the places you have been, or dream of, into music and share it. Turkish Airlines: 355 destinations · 133 countries.";
        const URL = "https://worldofmusic-tk.web.app";
        return html
          .replace(/<title>.*<\/title>/, "<title>A World of Music · Turkish Airlines</title>")
          .replace(/(<meta name="description" content=")[^"]*/, "$1" + DESC)
          .replace(/(<meta property="og:title" content=")[^"]*/, "$1A World of Music · Turkish Airlines")
          .replace(/(<meta property="og:description" content=")[^"]*/, "$1" + DESC)
          .replace(/https:\/\/dataroute-tk\.web\.app\/og\.jpg/g, URL + "/og-world-4.jpg") // a new file name: chat apps keep the old image of a link in their cache
          .replace(
            '<meta name="twitter:card"',
            `<meta property="og:site_name" content="Turkish Airlines" />\n    <meta property="og:url" content="${URL}/" />\n    <meta property="og:locale" content="en" />\n    <meta property="og:image:alt" content="Turkish Airlines — A World of Music: every journey has a sound. Choose yours." />\n    <meta name="twitter:title" content="A World of Music · Turkish Airlines" />\n    <meta name="twitter:description" content="${DESC}" />\n    <meta name="twitter:card"`,
          );
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
