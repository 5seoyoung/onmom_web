// 브라우저 자동 시험용 정적 서버 — GitHub Pages처럼 out/을 BASE_PATH 아래에 내보낸다(의존성 없음).
//   node e2e/serve.mjs            → http://localhost:4173{BASE_PATH}/
// BASE_PATH는 빌드 때와 같아야 한다(기본 "/onmom_web"). "/"로 시작하고 끝 슬래시는 없다. 빈 값이면 루트.
// GitHub Pages 흉내: 디렉터리 → index.html, 끝 슬래시 없는 디렉터리 → 301, 없는 파일 → 404.html(상태 404).
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../out", import.meta.url)));
const BASE = (process.env.BASE_PATH ?? "/onmom_web").replace(/\/+$/, "");
const PORT = Number(process.env.E2E_PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp4": "video/mp4",
};

async function fileAt(path) {
  try {
    const s = await stat(path);
    return s;
  } catch {
    return null;
  }
}

function send(res, status, path, headers = {}) {
  res.writeHead(status, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store", ...headers });
  createReadStream(path).pipe(res);
}

async function notFound(res) {
  const page = join(ROOT, "404.html");
  if (await fileAt(page)) return send(res, 404, page);
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(res);
  }
  if (BASE && pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return notFound(res);
  if (pathname === BASE) {
    res.writeHead(301, { location: `${BASE}/${url.search}` }).end();
    return;
  }
  const rel = normalize(pathname.slice(BASE.length));
  const target = join(ROOT, rel);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return notFound(res);
  const s = await fileAt(target);
  if (s?.isDirectory()) {
    if (!pathname.endsWith("/")) {
      res.writeHead(301, { location: `${pathname}/${url.search}` }).end();
      return;
    }
    const index = join(target, "index.html");
    if (await fileAt(index)) return send(res, 200, index);
    return notFound(res);
  }
  if (s?.isFile()) return send(res, 200, target);
  // GitHub Pages는 "/foo"를 "/foo.html"로도 찾는다
  const html = `${target}.html`;
  if ((await fileAt(html))?.isFile()) return send(res, 200, html);
  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT} at http://localhost:${PORT}${BASE}/`);
});
