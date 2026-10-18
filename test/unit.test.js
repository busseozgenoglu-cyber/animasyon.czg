/* Canlandır — bağımlılıksız birim testleri: `npm test`
   GIF kodlayıcı, ZIP yazıcı, hareket motoru, MP4 muxer ve WebM süre düzeltici.
   ffprobe ve unzip yüklüyse ek doğrulamalar da yapılır. */
"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const { GifEncoder } = require(path.join(ROOT, "lib/gif-encoder.js"));
const { ZipWriter, crc32 } = require(path.join(ROOT, "lib/zip.js"));
const M = require(path.join(ROOT, "motion.js"));
const { Mp4Muxer, annexBToSamples } = require(path.join(ROOT, "lib/mp4-muxer.js"));
const { fixWebmDuration } = require(path.join(ROOT, "lib/webm-fix.js"));
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
function hasTool(name, args) { try { execFileSync(name, args, { stdio: "ignore" }); return true; } catch (e) { return false; } }
const FFPROBE = hasTool("ffprobe", ["-version"]), UNZIP = hasTool("unzip", ["-v"]);
let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log("  ✓ " + msg); }
function probe(file, args) { return execFileSync("ffprobe", ["-v", "error"].concat(args, [file]), { encoding: "utf8" }); }
function u16(b, p) { return b[p] | (b[p + 1] << 8); }
function u32(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
function be32(b, p) { return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; }

/* ── GIF ─────────────────────────────────────────────────── */
console.log("GIF kodlayıcı");
function frame(w, h, i, opts) {
  opts = opts || {};
  const buf = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    buf[p] = Math.round(255 * x / w); buf[p + 1] = Math.round(255 * y / h); buf[p + 2] = 128; buf[p + 3] = 255;
    const cx = w * (0.2 + 0.6 * i / 5), cy = h / 2, r = Math.min(w, h) * 0.2;
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) { buf[p] = 250; buf[p + 1] = 60; buf[p + 2] = 40; }
    if (opts.transparent && x < w * 0.15) buf[p + 3] = 0;
  }
  return buf;
}
/* GIF blok yürüyücüsü: kare sayısı, döngü ve yapı bütünlüğü */
function walkGif(buf) {
  assert.strictEqual(String.fromCharCode.apply(null, buf.subarray(0, 6)), "GIF89a", "GIF89a imzası");
  let pos = 6;
  const w = u16(buf, pos), h = u16(buf, pos + 2), packed = buf[pos + 4];
  pos += 7;
  if (packed & 0x80) pos += 3 * (1 << ((packed & 7) + 1));
  let frames = 0, loops = null;
  const skipSub = () => { while (buf[pos] !== 0) pos += buf[pos] + 1; pos++; };
  while (pos < buf.length) {
    const b = buf[pos++];
    if (b === 0x3B) return { w, h, frames, loops, end: pos };
    if (b === 0x21) {
      const label = buf[pos++];
      if (label === 0xFF && String.fromCharCode.apply(null, buf.subarray(pos + 1, pos + 12)) === "NETSCAPE2.0") loops = u16(buf, pos + 14);
      skipSub(); continue;
    }
    if (b === 0x2C) { const p = buf[pos + 8]; pos += 9; if (p & 0x80) pos += 3 * (1 << ((p & 7) + 1)); pos++; skipSub(); frames++; continue; }
    throw new Error("bilinmeyen GIF bloğu 0x" + b.toString(16) + " @" + (pos - 1));
  }
  throw new Error("GIF sonlandırıcı yok");
}
{
  const w = 120, h = 90, enc = new GifEncoder({ width: w, height: h, loop: 0, dither: true });
  for (let i = 0; i < 6; i++) enc.addFrame(frame(w, h, i), 100);
  const bytes = enc.finish();
  const info = walkGif(bytes);
  ok(info.w === w && info.h === h && info.frames === 6 && info.loops === 0 && info.end === bytes.length, "6 kare, sonsuz döngü, bloklar bütün (" + bytes.length + " bayt)");
  fs.writeFileSync(path.join(OUT, "test.gif"), bytes);
  const t = new GifEncoder({ width: 64, height: 48, loop: 3, transparent: true, dither: false });
  for (let i = 0; i < 3; i++) t.addFrame(frame(64, 48, i, { transparent: true }), 80);
  const tb = t.finish(), ti = walkGif(tb);
  ok(ti.frames === 3 && ti.loops === 3, "saydam GIF: 3 kare, 3 döngü");
  if (FFPROBE) {
    const out = probe(path.join(OUT, "test.gif"), ["-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,nb_read_frames", "-of", "default=nw=1"]);
    ok(/codec_name=gif/.test(out) && /nb_read_frames=6/.test(out), "ffprobe GIF'i 6 kare olarak okudu");
  }
}

/* ── ZIP ─────────────────────────────────────────────────── */
console.log("ZIP yazıcı");
{
  const z = new ZipWriter();
  const files = { "kareler/0001.txt": Buffer.from("merhaba dünya"), "türkçe-ad.bin": Buffer.from([0, 1, 2, 3, 255, 254]) };
  Object.keys(files).forEach((n) => z.add(n, new Uint8Array(files[n])));
  const bytes = z.finish();
  fs.writeFileSync(path.join(OUT, "test.zip"), bytes);
  const eocd = bytes.length - 22;
  ok(u32(bytes, eocd) === 0x06054b50 && u16(bytes, eocd + 10) === 2, "EOCD imzası ve 2 kayıt");
  let cd = u32(bytes, eocd + 16), seen = 0;
  for (let i = 0; i < 2; i++) {
    assert.strictEqual(u32(bytes, cd), 0x02014b50, "merkezi dizin imzası");
    const nameLen = u16(bytes, cd + 28), extra = u16(bytes, cd + 30), comment = u16(bytes, cd + 32);
    const name = Buffer.from(bytes.subarray(cd + 46, cd + 46 + nameLen)).toString("utf8");
    const local = u32(bytes, cd + 42), size = u32(bytes, local + 18);
    const dataStart = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const data = bytes.subarray(dataStart, dataStart + size);
    assert.ok(files[name], "ad: " + name);
    assert.strictEqual(crc32(data), u32(bytes, cd + 16), "CRC " + name);
    assert.ok(Buffer.from(data).equals(files[name]), "içerik " + name);
    seen++;
    cd += 46 + nameLen + extra + comment;
  }
  ok(seen === 2, "adlar (UTF-8), CRC32 ve içerikler doğru");
  if (UNZIP) { execFileSync("unzip", ["-tq", path.join(OUT, "test.zip")], { stdio: "ignore" }); ok(true, "unzip -t temiz"); }
}

/* ── Hareket motoru ──────────────────────────────────────── */
console.log("Hareket motoru");
{
  M.EASING_LIST.forEach((e) => { const f = M.EASINGS[e.id]; assert.ok(Math.abs(f(0)) < 1e-9 && Math.abs(f(1) - 1) < 1e-9, e.id); });
  ok(true, M.EASING_LIST.length + " eğri 0→0 ve 1→1 veriyor");
  const tr = [];
  M.setKey(tr, 0, 100, "linear"); M.setKey(tr, 2, 300, "linear"); M.setKey(tr, 1, 200, "step");
  ok(M.trackValue(tr, 0.5, 0) === 150 && M.trackValue(tr, 1.5, 0) === 200 && M.trackValue(tr, 5, 0) === 300 && M.trackValue([], 1, 42) === 42, "anahtar kare enterpolasyonu ve 'ani geçiş'");
  const layer = (extra) => Object.assign({ id: "l", type: "image", visible: true, frames: ["a"], frameFps: 8, frameMode: "loop",
    base: { x: 400, y: 300, rot: 0, sx: 1, sy: 1, opacity: 1 }, tracks: { x: [], y: [], rot: [], sx: [], sy: [], opacity: [] },
    anchor: { x: 0.5, y: 0.5 }, inPoint: 0, outPoint: null, effects: [] }, extra || {});
  const ctx = { sceneDuration: 4, stageW: 1280, stageH: 720, size: { w: 200, h: 150 } };
  M.EFFECT_LIST.forEach((d) => {
    const L = layer({ effects: [M.createEffect(d.type, 4, layer())] });
    for (let t = 0; t <= 4; t += 1 / 24) { const v = M.evalLayer(L, t, ctx); ["x", "y", "rot", "sx", "sy", "opacity", "reveal"].forEach((k) => assert.ok(Number.isFinite(v[k]), d.type + "." + k)); }
  });
  ok(true, M.EFFECT_LIST.length + " efekt her anda sonlu değer üretiyor");
  let e = M.createEffect("slideIn", 4, layer()); e.params.dir = "left";
  let L = layer({ effects: [e] });
  ok(M.evalLayer(L, 0, ctx).x < -50 && Math.abs(M.evalLayer(L, e.end, ctx).x - 400) < 1e-6, "giriş efekti: başta dışarıda, sonunda yerinde");
  e = M.createEffect("fadeOut", 4, layer()); L = layer({ effects: [e] });
  ok(M.evalLayer(L, 1, ctx).opacity === 1 && M.evalLayer(L, 4, ctx).opacity < 1e-6, "çıkış efekti: önce etkisiz, sonunda saydam");
  const S = layer({ frames: ["a", "b", "c"], frameFps: 2, frameMode: "pingpong" });
  ok([0, 0.5, 1, 1.5, 2].map((t) => M.frameIndex(S, t)).join() === "0,1,2,1,0", "kare dizisi gidip-gel");
  const V = layer({ inPoint: 1, outPoint: 2 });
  ok([0.5, 1, 1.5, 2].map((t) => M.layerVisibleAt(V, t, 4)).join() === "false,true,true,false", "görünürlük penceresi");
}

/* ── MP4 muxer ───────────────────────────────────────────── */
console.log("MP4 muxer");
function boxes(buf, start, end) { const out = []; let p = start; while (p + 8 <= end) { const size = be32(buf, p), type = String.fromCharCode.apply(null, buf.subarray(p + 4, p + 8)); if (size < 8) break; out.push({ type, start: p, size, end: p + size }); p += size; } return out; }
function find(buf, type, start, end) { return boxes(buf, start, end).find((b) => b.type === type); }
{
  const h264 = new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/sample.h264")));
  const { samples, avcC } = annexBToSamples(h264);
  ok(samples.length === 12 && avcC && avcC[0] === 1, "Annex-B ayrıştırıldı: 12 örnek, avcC hazır");
  const mux = new Mp4Muxer({ width: 160, height: 120, fps: 12, codec: "avc", description: avcC });
  samples.forEach((s, i) => mux.addChunk({ data: s.data, key: s.key, timestamp: Math.round(i * 1e6 / 12) }));
  const mp4 = mux.finish();
  fs.writeFileSync(path.join(OUT, "test.mp4"), mp4);
  const top = boxes(mp4, 0, mp4.length);
  ok(top.map((b) => b.type).join() === "ftyp,moov,mdat" && top[2].end === mp4.length, "kutu sırası ftyp,moov,mdat (hızlı başlangıç)");
  const moov = top[1], trak = find(mp4, "trak", moov.start + 8, moov.end), mdia = find(mp4, "mdia", trak.start + 8, trak.end);
  const minf = find(mp4, "minf", mdia.start + 8, mdia.end), stbl = find(mp4, "stbl", minf.start + 8, minf.end);
  const stsz = find(mp4, "stsz", stbl.start + 8, stbl.end), stco = find(mp4, "stco", stbl.start + 8, stbl.end), stss = find(mp4, "stss", stbl.start + 8, stbl.end);
  ok(be32(mp4, stsz.start + 16) === 12, "stsz: 12 örnek");
  ok(be32(mp4, stco.start + 16) === top[0].size + moov.size + 8, "stco: ilk örnek mdat verisinin başında");
  ok(stss && be32(mp4, stss.start + 12) === samples.filter((s) => s.key).length, "stss: anahtar kare sayısı doğru");
  if (FFPROBE) {
    const out = probe(path.join(OUT, "test.mp4"), ["-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,nb_read_frames,width,height", "-of", "default=nw=1"]);
    ok(/codec_name=h264/.test(out) && /nb_read_frames=12/.test(out) && /width=160/.test(out), "ffprobe MP4'ü h264, 12 kare olarak okudu");
  }
}

/* ── WebM süre düzeltici ─────────────────────────────────── */
console.log("WebM süre düzeltici");
{
  const webm = new Uint8Array([
    0x1A, 0x45, 0xDF, 0xA3, 0x84, 0x42, 0x86, 0x81, 0x01,             // EBML başlığı (EBMLVersion=1)
    0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // Segment (bilinmeyen boyut)
    0x15, 0x49, 0xA9, 0x66, 0x87, 0x2A, 0xD7, 0xB1, 0x83, 0x0F, 0x42, 0x40, // Info{TimecodeScale=1000000}
    0x1F, 0x43, 0xB6, 0x75, 0x80                                        // boş Cluster
  ]);
  const fixed = fixWebmDuration(webm, 1234);
  ok(fixed.length === webm.length + 11, "Info'ya 11 baytlık Duration eklendi");
  const infoSize = fixed[25] & 0x7F;
  ok(infoSize === 7 + 11 && fixed[33] === 0x44 && fixed[34] === 0x89 && fixed[35] === 0x88, "Info boyutu güncellendi, Duration öğesi yerinde");
  ok(new DataView(fixed.buffer, fixed.byteOffset + 36, 8).getFloat64(0, false) === 1234, "süre 1234 ms olarak yazıldı");
  ok(fixWebmDuration(fixed, 1234) === fixed, "ikinci çağrı dosyayı değiştirmiyor");
}

/* ── Yönetmen: senaryo ayrıştırma ─────────────────────────── */
console.log("Senaryo ayrıştırıcı (Director)");
{
  const D = require(path.join(ROOT, "director.js"));
  const r = D.analyze(D.SAMPLE, []);
  ok(r.ast.title === "Kayıp Top" && r.ast.author === "Sen", "başlık ve yazar okundu");
  ok(r.stats.scenes === 2 && r.ast.scenes[0].place === "PARK" && r.ast.scenes[0].time === "gunduz" && r.ast.scenes[1].time === "aksam", "2 sahne; mekân ve zaman ayrıldı");
  ok(r.stats.lines === 7 && r.stats.narrations === 1 && r.stats.actions === 15, "7 replik, 1 anlatım, 15 eylem");
  ok(r.ast.speakers.join() === "Ali,Ayşe,Dede" && r.stats.charactersWithoutImage.length === 3 && r.stats.unknownActions.length === 0, "konuşanlar bulundu; örnekte anlaşılmayan eylem yok");
  ok(r.stats.autoNames.join() === "Karabaş" && r.names.indexOf("Karabaş") >= 0 && r.stats.candidates.length === 0, "“Karabaş sağdan koşarak gelir.” → Karabaş karakter sayıldı (aday değil)");
  const c1 = D.analyzeAction("Kamera Ayşe'ye yaklaşır.", ["Ali", "Ayşe"], []);
  ok(c1.act === "cam_in" && c1.camera === true && c1.target === "Ayşe" && c1.subjects.length === 0, "kamera yakınlaşması: hedef Ayşe, özne yok");
  ok(D.analyzeAction("Kamera uzaklaşır.", [], []).act === "cam_out" && D.analyzeAction("Kamera sağa kayar.", [], []).act === "cam_pan" && D.analyzeAction("Kamera sağa kayar.", [], []).to === "right", "kamera uzaklaşma ve kaydırma");
  ok(D.parse("SAHNE 1\nYakın çekim: Ali").scenes[0].items[0].type === "action" && D.analyzeAction("Yakın çekim: Ali", ["Ali"], []).act === "cam_in", "“Yakın çekim: Ali” replik değil kamera eylemi");
  ok(D.analyzeAction("Ali kameraya bakar.", ["Ali"], []).act === "look", "“kameraya bakar” kamera komutu sayılmaz");
  ok(D.analyzeAction("Karabaş havlar.", ["Karabaş"], []).act === "bark" && D.analyzeAction("Pamuk miyavlar.", ["Pamuk"], []).act === "bark" && D.analyzeAction("Karabaş kuyruk sallar.", ["Karabaş"], []).act === "wave", "hayvan sesi ve kuyruk sallama tanınıyor");
  const vproj = { width: 1280, height: 720, script: { text: D.SAMPLE, cast: [{ name: "Ali", voiceId: "v1" }, { name: "Ayşe", voiceId: "v2" }], voice: { enabled: true, narratorVoiceId: "vn", style: "sohbet" }, settings: {} } };
  const vl = D.voiceLines(vproj);
  ok(vl.length === 8 && vl.filter((l) => l.kind === "narration").length === 1 && vl.every((l) => /^vo[0-9a-z]+$/.test(l.key)) && new Set(vl.map((l) => l.key)).size === 8, "seslendirme satırları: 7 replik + 1 anlatım, benzersiz anahtarlı");
  ok(vl[0].voiceId === "v1" && vl.find((l) => l.who === "Dede").voiceId === "" && vl.find((l) => l.kind === "narration").voiceId === "vn" && vl.find((l) => l.kind === "narration").style === "anlatıcı", "satırlara karakter / anlatıcı sesi ve stili atandı; sessiz karakter boş");
  ok(vl.find((l) => /Topumu sen mi/.test(l.text)).emotion === "saskin" && vl.find((l) => /Biraz daha/.test(l.text)).emotion === "uzgun", "parantez duygusu seslendirme satırına taşındı");
  ok(D.voiceKey("v1", "sohbet", "", "Merhaba") === D.voiceKey("v1", "sohbet", "", " Merhaba ") && D.voiceKey("v1", "sohbet", "", "Merhaba") !== D.voiceKey("v2", "sohbet", "", "Merhaba") && D.voiceKey("v1", "sohbet", "mutlu", "Merhaba") !== D.voiceKey("v1", "sohbet", "", "Merhaba"), "klip anahtarı sese ve duyguya göre değişir, kenar boşluğuna göre değişmez");
  const mp = D.mouthPattern("Merhaba Ayşe, topumu gördün mü?", 2.4, 12, 7);
  ok(mp.length === 29 && /[12]/.test(mp) && /0/.test(mp) && mp[0] === "0" && mp[mp.length - 1] === "0" && !/[12]{4}/.test(mp), "dudak ritmi: 29 kare, açık/kapalı karışık, başta ve sonda kapalı, 3 kareden uzun açık yok");
  ok(D.mouthPattern("Merhaba Ayşe, topumu gördün mü?", 2.4, 12, 7) === mp && D.mouthPattern("Merhaba Ayşe, topumu gördün mü?", 2.4, 12, 8) !== mp && D.mouthPattern("", 1, 12, 1) === "000000000000", "dudak ritmi tohuma göre kararlı; boş metin kapalı");
  const mpc = D.mouthPattern("Evet, hayır.", 3, 12, 3), commaAt = mpc.indexOf("0", 4);
  ok(commaAt > 0 && (mpc.match(/[12]/g) || []).length >= 4, "virgülde durak var, dört hece açılıyor");
  const mL = D.metrics({ width: 1280, height: 720, script: { settings: {} } }), mP = D.metrics({ width: 1080, height: 1920, script: { settings: {} } });
  ok(mL.bubbleChars === 93 && mP.bubbleChars >= 40 && mL.base === 720 && mP.base === 1188 && D.splitLine("Bir cümle daha. ".repeat(20), mL.bubbleChars).every((x) => x.length <= mL.bubbleChars), "film ölçüleri (yatay/dikey) ve balon bölme sınırı tutarlı");
  const names = ["Ali", "Ayşe"];
  const a1 = D.analyzeAction("Ayşe sağdan koşarak girer.", names, []);
  ok(a1.act === "enter" && a1.dir === "right" && a1.speed === "fast" && a1.subjects.join() === "Ayşe", "giriş: yön sağ, hızlı");
  const a2 = D.analyzeAction("Ali Ayşe'ye doğru yürür.", names, []);
  ok(a2.act === "walk_to" && a2.subjects.join() === "Ali" && a2.target === "Ayşe", "hedefe yürüme: özne ve hedef");
  const a3 = D.analyzeAction("Ali ve Ayşe sola çıkar.", names, []);
  ok(a3.act === "exit" && a3.to === "left" && a3.subjects.length === 2, "çoğul özne, sola çıkış");
  const a4 = D.analyzeAction("3 saniye bekler.", names, ["Ali"]);
  ok(a4.act === "wait" && a4.seconds === 3, "süreli bekleme");
  const a5 = D.analyzeAction("Herkes zıplar.", names, []);
  ok(a5.act === "jump" && a5.all === true, "herkes → tüm karakterler");
  ok(D.analyzeAction("Ali alır.", names, []).act === null && D.analyzeAction("Ali alır.", names, []).subjects.join() === "Ali", "“alır” yanlışlıkla Ali'yi ek almış saymıyor; eylem bilinmiyor");
  ok(D.emotionOf("üzgün") === "uzgun" && D.emotionOf("bağırarak") === "kizgin" && D.emotionOf("fısıldayarak") === "fisilti", "duygu sözlüğü");
  const parts = D.splitLine("Bu çok uzun bir cümle. İkinci cümle burada! Üçüncü cümle de var mı? Evet var.", 40);
  ok(parts.length >= 2 && parts.every((x) => x.length <= 40), "uzun replik cümle sınırından bölündü: " + parts.length + " parça");
  ok(D.placeKind("Köy meydanı") === "kir" && D.placeKind("Şehir meydanı") === "sehir" && D.placeKind("Ormanın derinlikleri") === "orman" && D.placeKind("Ayşe'nin odası") === "ic" && D.placeKind("Plaj") === "deniz" && D.placeKind("Uzay istasyonu") === "uzay", "mekân türü sınıflandırması (eklerle)");
  const hug = D.analyzeAction("Ali Ayşe'ye sarılır.", names, []);
  ok(hug.act === "hug" && hug.subjects.join() === "Ali" && hug.target === "Ayşe", "sarılma: özne ve hedef");
  ok(["Ali yere yatar.", "Ayşe alkışlar.", "Ali şarkı söyler.", "Ayşe geri çekilir.", "Ali uyanır.", "Ali topu atar.", "Ayşe topu yakalar.", "Ali kayar.", "Ayşe esner."].map((t) => D.analyzeAction(t, names, []).act).join() === "lie,clap,sing,back,wake,throw,catch,slide,yawn", "yeni eylemler tanınıyor");
  ok(D.analyzeAction("Ali adım atar.", names, []).act === "walk", "“adım atar” yürüme sayılır (atar ile karışmaz)");
  const cand = D.analyze("SAHNE 1 - PARK\nALİ: Selam\nKöpek havlar.\nSonra zıplar.", ["Ali"]).stats;
  ok(cand.candidates.join() === "Köpek" && cand.unknownActions.length === 0, "öznesi bilinmeyen eylemden karakter adayı: Köpek (havlama tanındı)");
  ok(D.analyze("SAHNE 1\nALİ: \nALİ: Merhaba", []).stats.lines === 1, "boş replik satırı sayılmaz");
  const ast2 = D.parse("PARK - GECE\nANLATICI: Gece oldu.\nİÇ. EV - SABAH\nALİ (fısıldayarak): Şşş.");
  ok(ast2.scenes.length === 2 && ast2.scenes[0].time === "gece" && ast2.scenes[0].items[0].type === "narration" && ast2.scenes[1].place === "EV" && ast2.scenes[1].items[0].emotion === "fısıldayarak", "büyük harf başlık, İÇ./DIŞ. biçimi, anlatıcı ve parantez duygusu");
}

console.log("\nTÜM BİRİM TESTLERİ GEÇTİ (" + passed + " kontrol)" + (FFPROBE ? "" : " — ffprobe yok, dış doğrulamalar atlandı"));
