/**
 * Serves the static export in out/ the way GitHub Pages does, so the deployed
 * site can be checked locally before pushing:
 *
 *   NEXT_PUBLIC_BASE_PATH=/virtual-fitting-room npm run build:static
 *   BASE_PATH=/virtual-fitting-room npm run preview:static
 *   # → http://localhost:3124/virtual-fitting-room/
 *
 * Env: BASE_PATH (default ""), PORT (default 3124).
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("out");
const base = (process.env.BASE_PATH ?? "").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 3124);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(`${base}/`) && url.pathname !== base) {
    res.writeHead(404).end("Not under base path");
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice(base.length)) || "/";
  const target = path.join(root, rel);
  if (!target.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  // Like Pages: a directory without a trailing slash redirects to the slash form.
  if (!rel.endsWith("/") && (await isFile(path.join(target, "index.html")))) {
    res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
    return;
  }
  const candidates = rel.endsWith("/") ? [path.join(target, "index.html")] : [target, `${target}.html`];
  for (const file of candidates) {
    if (await isFile(file)) {
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
      return;
    }
  }
  const notFound = path.join(root, "404.html");
  res.writeHead(404, { "Content-Type": TYPES[".html"] });
  res.end((await isFile(notFound)) ? await readFile(notFound) : "Not found");
}).listen(port, () => console.log(`Serving out/ at http://localhost:${port}${base}/`));
