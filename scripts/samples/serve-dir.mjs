#!/usr/bin/env node
/** Tiny static server for listening pages:  node scripts/samples/serve-dir.mjs DIR PORT  (Range requests supported so audio can seek) */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const port = Number(process.env.PORT ?? process.argv[3] ?? 4177);
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".md": "text/plain; charset=utf-8" };

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  let file = join(root, path.endsWith("/") ? path + "index.html" : path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const st = statSync(file);
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    const head = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : st.size - 1;
      res.writeHead(206, { ...head, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...head, "Content-Length": st.size });
      createReadStream(file).pipe(res);
    }
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
