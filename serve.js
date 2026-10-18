/* Canlandır — bağımlılıksız yerel sunucu. `npm start` → http://localhost:8080
   (Dosyayı doğrudan çift tıklayarak açmak yerine bunu kullanın: GIF işçisi ve otomatik kayıt http üzerinden çalışır.) */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function start(root, port, cb) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url.endsWith("/")) url += "index.html";
    const file = path.normalize(path.join(root, url));
    if (!file.startsWith(path.normalize(root + path.sep)) && file !== path.normalize(root)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Bulunamadı: " + url); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-cache" });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
  server.listen(port, () => { if (cb) cb(server.address().port); });
  return server;
}
module.exports = { start };
if (require.main === module) {
  const port = parseInt(process.env.PORT, 10) || 8080;
  start(__dirname, port, (p) => console.log("Canlandır: http://localhost:" + p + "/"));
}
