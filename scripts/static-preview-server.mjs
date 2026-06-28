// 로컬 미리보기용 정적 서버 (검증 전용). 배포에는 사용하지 않음.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = process.env.PORT || 4178;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    // 로컬 검증: API는 빈 응답으로 흉내(앱이 graceful 처리하는지 확인)
    if (path.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "local preview: api disabled" }));
      return;
    }
    if (path === "/") path = "/index.html";
    const filePath = normalize(join(ROOT, path));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(data);
  } catch {
    // SPA 폴백: 확장자 없는 경로는 index.html로
    try {
      const html = await readFile(join(ROOT, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  }
}).listen(PORT, () => console.log(`static preview on http://localhost:${PORT}`));
