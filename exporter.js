/* Canlandır — dışa aktarma: GIF (işçi iş parçacığında), WebM/MP4 (MediaRecorder), PNG dizisi (ZIP), proje dosyası.
   Tüm sahneler tek zaman çizgisinde art arda işlenir. */
(function (root) {
  "use strict";
  var M = root.Motion, Render = root.Render, Model = root.Model;

  function totalDuration(project) { return project.scenes.reduce(function (a, s) { return a + s.duration; }, 0); }

  /* Küresel zaman → sahne ve yerel zaman */
  function locate(project, T) {
    var acc = 0;
    for (var i = 0; i < project.scenes.length; i++) {
      var d = project.scenes[i].duration;
      if (T < acc + d - 1e-6 || i === project.scenes.length - 1) return { index: i, scene: project.scenes[i], t: Math.min(Math.max(0, T - acc), d), offset: acc };
      acc += d;
    }
    return { index: 0, scene: project.scenes[0], t: 0, offset: 0 };
  }
  function sceneOffset(project, index) {
    var acc = 0;
    for (var i = 0; i < index; i++) acc += project.scenes[i].duration;
    return acc;
  }

  /* Aralık: 'all' ya da sahne dizini */
  function rangeOf(project, range) {
    if (range === "all" || range == null) return { start: 0, end: totalDuration(project) };
    var off = sceneOffset(project, range);
    return { start: off, end: off + project.scenes[range].duration };
  }

  function makeCanvas(project, scale) {
    var c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(project.width * scale / 2) * 2);   // çift sayı: video kodlayıcılar ister
    c.height = Math.max(2, Math.round(project.height * scale / 2) * 2);
    return c;
  }

  function renderFrame(project, T, canvas, ctx) {
    var loc = locate(project, T);
    var sx = canvas.width / project.width, sy = canvas.height / project.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    Render.drawScene(ctx, project, loc.scene, loc.t, { forExport: true, sceneIndex: loc.index });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function frameTimes(project, range, fps) {
    var r = rangeOf(project, range);
    var n = Math.max(1, Math.round((r.end - r.start) * fps));
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = r.start + i / fps;
    return out;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

  /* ── GIF ─────────────────────────────────────────────────── */
  function exportGif(project, opts, onProgress, ctl) {
    opts = opts || {};
    var fps = Math.min(30, Math.max(1, opts.fps || 15));
    var scale = opts.scale || 0.5;
    var times = frameTimes(project, opts.range, fps);
    var canvas = makeCanvas(project, scale), ctx = canvas.getContext("2d", { willReadFrequently: true });
    var transparent = project.scenes.every(function (s) { return s.background.type === "transparent"; });
    var delay = 1000 / fps;

    return Render.ensureAssets(project).then(function () {
      return new Promise(function (resolve, reject) {
        var worker = null;
        try { worker = new Worker("lib/gif-worker.js"); } catch (e) { worker = null; }
        var i = 0;
        function fail(err) { if (worker) worker.terminate(); reject(err instanceof Error ? err : new Error(String(err))); }

        if (worker) {
          worker.onerror = function (e) { fail(new Error("GIF işçisi hata verdi: " + (e.message || ""))); };
          worker.onmessage = function (ev) {
            var m = ev.data || {};
            if (m.type === "ready" || m.type === "progress") {
              if (ctl && ctl.cancelled) { worker.terminate(); return reject(new Error("İptal edildi")); }
              if (m.type === "progress" && onProgress) onProgress({ done: m.index + 1, total: times.length, phase: "GIF kodlanıyor" });
              if (i < times.length) sendFrame(); else worker.postMessage({ type: "finish" });
            } else if (m.type === "done") {
              worker.terminate();
              resolve(new Blob([m.buffer], { type: "image/gif" }));
            } else if (m.type === "error") fail(new Error(m.message));
          };
          function sendFrame() {
            renderFrame(project, times[i], canvas, ctx);
            var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            worker.postMessage({ type: "frame", index: i, buffer: data.data.buffer, delay: delay }, [data.data.buffer]);
            i++;
          }
          worker.postMessage({ type: "init", width: canvas.width, height: canvas.height, loop: opts.loop === false ? 1 : 0, transparent: transparent, dither: opts.dither !== false });
        } else {
          // İşçi yoksa ana iş parçacığında kodla (arayüz kısa süre yavaşlar)
          var enc = new root.GifEncoder({ width: canvas.width, height: canvas.height, loop: opts.loop === false ? 1 : 0, transparent: transparent, dither: opts.dither !== false });
          (function step() {
            if (ctl && ctl.cancelled) return reject(new Error("İptal edildi"));
            if (i >= times.length) return resolve(new Blob([enc.finish()], { type: "image/gif" }));
            renderFrame(project, times[i], canvas, ctx);
            enc.addFrame(ctx.getImageData(0, 0, canvas.width, canvas.height).data, delay);
            i++;
            if (onProgress) onProgress({ done: i, total: times.length, phase: "GIF kodlanıyor" });
            setTimeout(step, 0);
          })();
        }
      });
    });
  }

  /* ── Video (MediaRecorder) ────────────────────────────────── */
  function recorderSupport() {
    var out = { webm: null, mp4: null, audio: false };
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) return out;
    var ok = function (t) { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } };
    ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].some(function (t) { if (ok(t)) { out.webm = t; return true; } });
    // MP4 yalnızca H.264 (avc1) ile sunulur; her oynatıcıda açılsın diye.
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,opus", "video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1.4d002a", "video/mp4;codecs=avc1"].some(function (t) { if (ok(t)) { out.mp4 = t; return true; } });
    if (!out.mp4 && ok("video/mp4") && !ok("video/webm")) out.mp4 = "video/mp4";   // Safari: yalnızca MP4 (H.264) kaydeder
    out.audio = typeof AudioContext !== "undefined";
    return out;
  }

  function dataUrlToArrayBuffer(dataUrl) {
    var comma = dataUrl.indexOf(",");
    var bin = atob(dataUrl.slice(comma + 1));
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  /* WebCodecs ile H.264 kodlama desteği (proje boyutuna göre; sonuç önbelleğe alınır) */
  var _wcCache = {};
  function webcodecsSupport(project) {
    var key = project.width + "x" + project.height + "@" + project.fps;
    if (_wcCache[key]) return _wcCache[key];
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined" || !root.Mp4Muxer) return (_wcCache[key] = Promise.resolve(null));
    var w = Math.round(project.width / 2) * 2, h = Math.round(project.height / 2) * 2, fps = project.fps;
    var cands = ["avc1.42001f", "avc1.42E01E", "avc1.4d001f", "avc1.420028", "avc1.4d0028", "avc1.640028", "avc1.42002a", "avc1.64002a"];
    _wcCache[key] = cands.reduce(function (chain, codec) {
      return chain.then(function (found) {
        if (found) return found;
        return VideoEncoder.isConfigSupported({ codec: codec, width: w, height: h, framerate: fps, bitrate: 4000000, avc: { format: "avc" } })
          .then(function (r) { return r.supported ? codec : null; }).catch(function () { return null; });
      });
    }, Promise.resolve(null));
    return _wcCache[key];
  }
  /* Tüm dışa aktarma yetenekleri: { webm, mp4Recorder, mp4WebCodecs, mp4, audio } */
  function detectSupport(project) {
    var rs = recorderSupport();
    return webcodecsSupport(project).then(function (codec) {
      return { webm: rs.webm, mp4Recorder: rs.mp4, mp4WebCodecs: codec, mp4: !!(rs.mp4 || codec), audio: rs.audio };
    });
  }

  /* MP4: WebCodecs + kendi muxer'ımız (gerçek zamanlı değil, hızlı; yalnızca video) */
  function exportMp4WebCodecs(project, opts, onProgress, ctl) {
    opts = opts || {};
    var fps = project.fps, scale = opts.scale || 1;
    var times = frameTimes(project, opts.range, fps);
    var canvas = makeCanvas(project, scale), ctx = canvas.getContext("2d");
    var mbps = { low: 3, mid: 7, high: 14 }[opts.quality || "mid"] || 7;
    var bitrate = Math.max(800000, Math.min(50e6, Math.round(mbps * 1e6 * (canvas.width * canvas.height) / (1280 * 720))));
    var codecPromise = opts.codec ? Promise.resolve(opts.codec) : webcodecsSupport(project);
    return Promise.all([Render.ensureAssets(project), codecPromise]).then(function (res) {
      var codec = res[1];
      if (!codec) throw new Error("Bu tarayıcı H.264 kodlayamıyor.");
      var isVp9 = codec.indexOf("vp09") === 0;
      return new Promise(function (resolve, reject) {
        var muxer = new root.Mp4Muxer({ width: canvas.width, height: canvas.height, fps: fps, codec: isVp9 ? "vp9" : "avc" });
        var failed = null;
        var encoder = new VideoEncoder({
          output: function (chunk, meta) { try { muxer.addChunk(chunk, meta); } catch (e) { failed = e; } },
          error: function (e) { failed = e; }
        });
        var config = { codec: codec, width: canvas.width, height: canvas.height, framerate: fps, bitrate: bitrate, latencyMode: "quality" };
        if (!isVp9) config.avc = { format: "avc" };
        try { encoder.configure(config); } catch (e) { return reject(new Error("Kodlayıcı ayarlanamadı: " + e.message)); }
        var i = 0, gop = Math.max(1, Math.round(fps * 2));
        function closeEnc() { try { if (encoder.state !== "closed") encoder.close(); } catch (e) { /* yoksay */ } }
        function step() {
          if (ctl && ctl.cancelled) { closeEnc(); return reject(new Error("İptal edildi")); }
          if (failed) { closeEnc(); return reject(failed instanceof Error ? failed : new Error(String(failed))); }
          if (i >= times.length) {
            encoder.flush().then(function () {
              closeEnc();
              if (failed) throw failed;
              var bytes = muxer.finish();
              resolve({ blob: new Blob([bytes], { type: "video/mp4" }), mime: "video/mp4", ext: "mp4" });
            }).catch(function (e) { closeEnc(); reject(e instanceof Error ? e : new Error(String(e))); });
            return;
          }
          if (encoder.encodeQueueSize > 6) { setTimeout(step, 8); return; }   // kodlayıcı yetişsin
          renderFrame(project, times[i], canvas, ctx);
          var frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
          try { encoder.encode(frame, { keyFrame: i % gop === 0 }); } catch (e) { failed = e; } finally { frame.close(); }
          i++;
          if (onProgress) onProgress({ done: i, total: times.length, phase: "MP4 kodlanıyor" });
          setTimeout(step, 0);
        }
        step();
      });
    });
  }

  /* opts: { format: 'webm'|'mp4', scale, quality: 'low'|'mid'|'high', range } */
  function exportVideo(project, opts, onProgress, ctl) {
    opts = opts || {};
    var sup = recorderSupport();
    if (opts.format === "mp4") {
      return webcodecsSupport(project).then(function (codec) {
        // Ses varsa ve tarayıcı sesli MP4 kaydedebiliyorsa gerçek zamanlı kayıt; yoksa hızlı WebCodecs yolu
        if (codec && !(project.audio && sup.mp4)) return exportMp4WebCodecs(project, opts, onProgress, ctl);
        if (sup.mp4) return exportVideoRecorder(project, opts, onProgress, ctl);
        throw new Error("Bu tarayıcı MP4 (H.264) üretemiyor. WebM seçin ya da Chrome/Edge/Safari kullanın.");
      });
    }
    return exportVideoRecorder(project, opts, onProgress, ctl);
  }

  function exportVideoRecorder(project, opts, onProgress, ctl) {
    var sup = recorderSupport();
    var mime = opts.format === "mp4" ? sup.mp4 : sup.webm;
    if (!mime) return Promise.reject(new Error(opts.format === "mp4" ? "Bu tarayıcı MP4 (H.264) kaydedemiyor. WebM seçin ya da Chrome/Safari kullanın." : "Bu tarayıcı video kaydını desteklemiyor."));
    var fps = project.fps, scale = opts.scale || 1;
    var times = frameTimes(project, opts.range, fps);
    var r = rangeOf(project, opts.range);
    var canvas = makeCanvas(project, scale), ctx = canvas.getContext("2d");
    var mbps = { low: 3, mid: 7, high: 14 }[opts.quality || "mid"] || 7;
    var bitrate = Math.round(mbps * 1e6 * (canvas.width * canvas.height) / (1280 * 720));
    bitrate = Math.max(800000, Math.min(50e6, bitrate));

    return Render.ensureAssets(project).then(function () {
      return new Promise(function (resolve, reject) {
        var stream = canvas.captureStream(0);
        var track = stream.getVideoTracks()[0];
        var audioCtx = null, source = null;

        function requestFrame() {
          if (track && typeof track.requestFrame === "function") track.requestFrame();
          else if (typeof stream.requestFrame === "function") stream.requestFrame();
        }

        var audioReady = Promise.resolve();
        if (project.audio && sup.audio) {
          try {
            audioCtx = new AudioContext();
            var dest = audioCtx.createMediaStreamDestination();
            var gain = audioCtx.createGain();
            gain.gain.value = project.audio.volume == null ? 1 : project.audio.volume;
            gain.connect(dest);
            dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
            audioReady = audioCtx.decodeAudioData(dataUrlToArrayBuffer(project.audio.dataUrl)).then(function (buffer) {
              source = audioCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(gain);
            }).catch(function () { source = null; });
          } catch (e) { audioCtx = null; }
        }

        audioReady.then(function () {
          var rec;
          try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate }); }
          catch (e) { try { rec = new MediaRecorder(stream, { mimeType: mime }); } catch (e2) { return reject(new Error("Kayıt başlatılamadı: " + e2.message)); } }
          var chunks = [];
          rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
          rec.onerror = function (ev) { reject(new Error("Kayıt hatası: " + (ev.error && ev.error.message || ""))); };
          rec.onstop = function () {
            if (audioCtx) { try { audioCtx.close(); } catch (e) { /* yoksay */ } }
            var type = rec.mimeType || mime.split(";")[0];
            var ext = type.indexOf("mp4") >= 0 ? "mp4" : "webm";
            var blob = new Blob(chunks, { type: type });
            if (ext === "webm" && root.WebmFix) {
              // Canlı kayıtta süre yazılmaz; oynatıcılar ilerleme çubuğu gösterebilsin diye eklenir
              blob.arrayBuffer().then(function (ab) {
                var fixed = root.WebmFix.fixWebmDuration(new Uint8Array(ab), (r.end - r.start) * 1000);
                resolve({ blob: new Blob([fixed], { type: type }), mime: type, ext: ext });
              }).catch(function () { resolve({ blob: blob, mime: type, ext: ext }); });
              return;
            }
            resolve({ blob: blob, mime: type, ext: ext });
          };

          renderFrame(project, times[0], canvas, ctx);
          requestFrame();
          rec.start(1000);
          var frameMs = 1000 / fps;
          var start = performance.now() + 40;
          if (source) {
            try {
              var when = audioCtx.currentTime + 0.04;
              var offset = r.start, dur = r.end - r.start;
              if (offset < source.buffer.duration) source.start(when, offset, Math.min(dur, source.buffer.duration - offset));
            } catch (e) { /* ses olmadan devam */ }
          }
          var i = 0;
          function loop() {
            if (ctl && ctl.cancelled) { try { rec.stop(); } catch (e) { /* yoksay */ } return reject(new Error("İptal edildi")); }
            if (i >= times.length) {
              // Son kare süresi kadar bekle, sonra kaydı kapat
              setTimeout(function () { try { rec.stop(); } catch (e) { reject(e); } }, frameMs + 60);
              return;
            }
            var due = start + i * frameMs, now = performance.now();
            if (now < due - 1) { setTimeout(loop, Math.max(0, due - now - 1)); return; }
            renderFrame(project, times[i], canvas, ctx);
            requestFrame();
            i++;
            if (onProgress) onProgress({ done: i, total: times.length, phase: opts.format === "mp4" ? "MP4 kaydediliyor (gerçek zamanlı)" : "WebM kaydediliyor (gerçek zamanlı)" });
            setTimeout(loop, 0);
          }
          setTimeout(loop, 40);
        });
      });
    });
  }

  /* ── PNG dizisi (ZIP) ─────────────────────────────────────── */
  function exportPngZip(project, opts, onProgress, ctl) {
    opts = opts || {};
    var fps = project.fps, scale = opts.scale || 1;
    var times = frameTimes(project, opts.range, fps);
    var canvas = makeCanvas(project, scale), ctx = canvas.getContext("2d");
    var zip = new root.CanlandirZip.ZipWriter();
    var pad = String(times.length).length < 4 ? 4 : String(times.length).length;
    return Render.ensureAssets(project).then(function () {
      var i = 0;
      function step() {
        if (ctl && ctl.cancelled) return Promise.reject(new Error("İptal edildi"));
        if (i >= times.length) {
          var info = "Canlandır PNG kare dizisi\nProje: " + project.name + "\nKare hızı: " + fps + " fps\nKare sayısı: " + times.length + "\nBoyut: " + canvas.width + "x" + canvas.height + "\n\nffmpeg ile videoya çevirmek için:\nffmpeg -framerate " + fps + " -i kare_%0" + pad + "d.png -c:v libx264 -pix_fmt yuv420p film.mp4\n";
          zip.add("bilgi.txt", new TextEncoder().encode(info));
          return Promise.resolve(new Blob([zip.finish()], { type: "application/zip" }));
        }
        renderFrame(project, times[i], canvas, ctx);
        return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(new Error("PNG üretilemedi")); }, "image/png"); })
          .then(function (b) { return b.arrayBuffer(); })
          .then(function (ab) {
            zip.add("kare_" + String(i + 1).padStart(pad, "0") + ".png", new Uint8Array(ab));
            i++;
            if (onProgress) onProgress({ done: i, total: times.length, phase: "PNG kareleri yazılıyor" });
            return step();
          });
      }
      return step();
    });
  }

  /* ── Tek kare PNG ─────────────────────────────────────────── */
  function exportFramePng(project, T, scale) {
    var canvas = makeCanvas(project, scale || 1), ctx = canvas.getContext("2d");
    return Render.ensureAssets(project).then(function () {
      renderFrame(project, T, canvas, ctx);
      return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(new Error("PNG üretilemedi")); }, "image/png"); });
    });
  }

  /* ── Proje dosyası ─────────────────────────────────────────── */
  function projectToJson(project) {
    var copy = Model.deepClone(project);
    Model.pruneAssets(copy);
    copy.app = "canlandir";
    copy.savedAt = new Date().toISOString();
    return JSON.stringify(copy);
  }
  function parseProject(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error("Dosya okunamadı: geçerli bir Canlandır projesi değil."); }
    return Model.normalizeProject(raw);
  }

  function download(blob, filename) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
  }

  function safeName(name) {
    return (name || "film").toLowerCase().replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "film";
  }

  root.Exporter = {
    totalDuration: totalDuration, locate: locate, sceneOffset: sceneOffset, rangeOf: rangeOf, frameTimes: frameTimes, renderFrame: renderFrame,
    exportGif: exportGif, exportVideo: exportVideo, exportMp4WebCodecs: exportMp4WebCodecs, exportPngZip: exportPngZip, exportFramePng: exportFramePng,
    recorderSupport: recorderSupport, webcodecsSupport: webcodecsSupport, detectSupport: detectSupport,
    projectToJson: projectToJson, parseProject: parseProject, download: download, safeName: safeName
  };
})(window);
