// Simulate a project site: no Vite SPA rewrite, missing paths return 404.html.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("dist");
const prefix = "/rhea-period-tracker/";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".woff": "font/woff", ".woff2": "font/woff2" };

createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (!path.startsWith(prefix)) {
    res.writeHead(404).end();
    return;
  }
  const file = resolve(root, decodeURIComponent(path.slice(prefix.length)) || "index.html");
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html" }).end(await readFile(resolve(root, "404.html")));
  }
}).listen(4175, "127.0.0.1");
