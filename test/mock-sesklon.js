/* Sahte SesKlon sunucusu (testler için): gerçek API sözleşmesinin Canlandır'ın kullandığı bölümü.
   - GET  /api/health, /api/voices
   - POST /api/tts  → 202 iş (wait:true → 200 üretim); GET /api/jobs/:id (1. sorgu çalışıyor, 2. tamam); POST /api/jobs/:id/cancel
   - GET  /files/outputs/:dosya → 24 kHz mono WAV (metin uzunluğuna göre süre: 0,07 sn/karakter)
   - CORS açık; opts.key verilirse X-API-Key ister (health hariç).
   Komut satırı: node test/mock-sesklon.js [port]  */
"use strict";
const http = require("http");

function wav(seconds, freq) {
  const sr = 24000, n = Math.max(1, Math.round(seconds * sr)), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = Math.min(1, t / 0.02, (seconds - t) / 0.05) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 4 * t));
    const v = Math.sin(2 * Math.PI * freq * t) * 0.35 * Math.max(0, env);
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}
const rnd = () => Math.random().toString(16).slice(2, 14).padEnd(12, "0");
const EMOTIONS = ["normal", "heyecanlı", "mutlu", "sakin", "ciddi", "üzgün", "kızgın", "şaşkın", "korkmuş", "fısıltı", "vurgulu", "samimi", "sıkılmış", "alaycı", "nazik", "gururlu", "umutlu", "nostaljik", "gergin", "romantik", "çocuksu", "otoriter", "hızlı", "yavaş"];
const STYLES = [["sohbet", "Sohbet"], ["anlatıcı", "Anlatıcı"], ["haber", "Haber"], ["masal", "Masal"], ["duygusal", "Duygusal"], ["reklam", "Reklam"]].map(([name, label]) => ({ name, label }));

function start(port, opts) {
  opts = opts || {};
  const voices = opts.voices || [{ id: "v-ali", name: "Ali Sesi", language: "tr" }, { id: "v-ayse", name: "Ayşe", language: "tr" }, { id: "v-anlatici", name: "Anlatıcı", language: "tr" }];
  const jobs = new Map(), files = new Map(), requests = { health: 0, voices: 0, tts: 0, jobs: 0, files: 0, cancel: 0, bodies: [] };
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Access-Control-Max-Age": "600" };
  const jobView = (j) => ({ id: j.id, kind: "tts", status: j.status, progress: j.progress, step: j.status === "done" ? 1 : 0, total: 1, message: "", error: j.error,
    created_at: j.created, started_at: j.status === "queued" ? null : j.created, finished_at: j.status === "done" ? Date.now() / 1000 : null, elapsed: 0.5,
    partial: [], cancelled: j.cancelled, eta_s: j.status === "done" ? null : 0.8, position: j.status === "done" ? null : 0, result: j.status === "done" ? j.result : undefined });
  const server = http.createServer((req, res) => {
    const send = (code, body, type) => { res.writeHead(code, Object.assign({ "Content-Type": type || "application/json; charset=utf-8" }, cors)); res.end(type ? body : JSON.stringify(body)); };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    const u = new URL(req.url, "http://x");
    const p = u.pathname;
    if (opts.key && p.startsWith("/api/") && p !== "/api/health" && req.headers["x-api-key"] !== opts.key) return send(401, { detail: "Geçersiz API anahtarı" });
    if (p === "/api/health") { requests.health++; return send(200, { ok: true, version: "4.1.1", device: "cpu", model: "sahte", backend: "fake", model_loaded: !!opts.modelLoaded, model_loading: false, model_error: null, queue_pending: 0, languages: { tr: "Türkçe" }, auth_required: !!opts.key, max_text_chars: 5000, ffmpeg: false, emotion_tags: EMOTIONS, tags: { emotions: EMOTIONS.map((n) => ({ name: n, label: n, aliases: [] })) }, styles: STYLES, features: { dialog: true, subtitles: true } }); }
    if (p === "/api/voices" && req.method === "GET") { requests.voices++; return send(200, voices); }
    if (p === "/api/tts" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        let body; try { body = JSON.parse(raw); } catch (e) { return send(422, { detail: [{ loc: ["body"], msg: "JSON okunamadı", type: "json_invalid" }] }); }
        requests.tts++; requests.bodies.push(body);
        if (!body.text || typeof body.text !== "string") return send(422, { detail: [{ loc: ["body", "text"], msg: "zorunlu", type: "missing" }] });
        if (body.emotion && EMOTIONS.indexOf(body.emotion) < 0) return send(400, { detail: "Bilinmeyen duygu" });
        if (body.style && !STYLES.some((s) => s.name === body.style)) return send(422, { detail: "Bilinmeyen stil: " + body.style });
        const vi = voices.findIndex((v) => v.id === body.voice_id);
        if (body.voice_id && vi < 0) return send(404, { detail: "Ses bulunamadı" });
        const text = body.text.replace(/\[[^\]]*\]/g, "").trim();
        const dur = +Math.max(0.6, text.length * 0.07).toFixed(2), fname = rnd() + ".wav";
        files.set(fname, wav(dur, 160 + (vi + 1) * 70));
        const gen = { id: rnd(), kind: "tts", text: body.text, voice_id: body.voice_id || null, voice_name: vi >= 0 ? voices[vi].name : "Varsayılan ses", language: body.language || "tr",
          filename: fname, url: "/files/outputs/" + fname, duration: dur, elapsed: 0.3, created_at: new Date().toISOString(), seed: 1, group_id: null, favorite: false,
          params: { style: body.style || null, emotion: body.emotion || null, chunks: [{ text, duration: dur }], timeline: null, dialog: false } };
        if (body.wait) return send(200, gen);
        const job = { id: rnd(), status: "queued", progress: 0, polls: 0, result: gen, cancelled: false, error: null, created: Date.now() / 1000 };
        jobs.set(job.id, job);
        return send(202, jobView(job));
      });
      return;
    }
    let m;
    if ((m = p.match(/^\/api\/jobs\/([^/]+)\/cancel$/)) && req.method === "POST") { const j = jobs.get(m[1]); requests.cancel++; if (!j) return send(404, { detail: "İş yok" }); if (j.status !== "done") { j.status = "cancelled"; j.cancelled = true; } return send(200, jobView(j)); }
    if ((m = p.match(/^\/api\/jobs\/([^/]+)$/)) && req.method === "GET") {
      const j = jobs.get(m[1]); requests.jobs++;
      if (!j) return send(404, { detail: "İş yok" });
      if (j.status === "queued" || j.status === "running") { j.polls++; if (j.polls >= 2) { j.status = "done"; j.progress = 1; } else { j.status = "running"; j.progress = 0.5; } }
      return send(200, jobView(j));
    }
    if ((m = p.match(/^\/files\/outputs\/([^/]+)$/)) && req.method === "GET") { const f = files.get(m[1]); requests.files++; if (!f) return send(404, { detail: "Not Found" }); return send(200, f, "audio/x-wav"); }
    return send(404, { detail: "Not Found" });
  });
  const ready = new Promise((resolve) => server.once("listening", resolve));   // start() çağrısından sonra beklenebilir (olay kaçmaz)
  server.listen(port || 0, "127.0.0.1");
  return { server, ready, requests, voices, jobs, get url() { const a = server.address(); return a ? "http://127.0.0.1:" + a.port : null; } };
}
module.exports = { start, wav };
if (require.main === module) {
  const m = start(+process.argv[2] || 8000);
  m.server.on("listening", () => console.log("Sahte SesKlon sunucusu: " + m.url + "  (Canlandır'da adres olarak bunu yaz)"));
}
