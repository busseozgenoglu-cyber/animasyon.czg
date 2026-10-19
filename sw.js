/* Canlandır — çevrimdışı destek. Ağ önce, yoksa önbellek: güncellemeler hemen gelir, bağlantı yoksa uygulama yine açılır. */
var VERSION = "canlandir-v9";
var CORE = ["./", "./index.html", "./style.css", "./app.js", "./ui.js", "./easy.js", "./director.js", "./characters.js", "./sfx.js", "./voice.js", "./motion.js", "./model.js", "./render.js", "./demo.js", "./exporter.js",
  "./lib/zip.js", "./lib/gif-encoder.js", "./lib/gif-worker.js", "./lib/webm-fix.js", "./lib/mp4-muxer.js", "./favicon.svg", "./manifest.webmanifest"];
self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE).catch(function () { /* kısmi önbellek de olur */ }); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && res.type === "basic") { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (m) { return m || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()); });
  }));
});
