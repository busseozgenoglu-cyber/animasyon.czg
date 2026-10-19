/* Canlandır — sentezlenmiş ses efektleri (dosya yok, Web Audio ile üretilir): pop, vınn, boing, güm, çan, alkış.
   Sahneler cue listesi taşır (scene.sfx = [{t, type}]); önizlemede canlı çalınır, video dışa aktarımına karıştırılır. */
(function (root) {
  "use strict";
  var noiseCache = null;
  function noise(ctx) {
    if (noiseCache && noiseCache.sampleRate === ctx.sampleRate) return noiseCache;
    var len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache = buf;
    return buf;
  }
  function env(ctx, dest, at, peak, attack, decay) {
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay); g.connect(dest); return g;
  }
  function tone(ctx, dest, at, type, f0, f1, dur, peak, nodes) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    o.connect(env(ctx, dest, at, peak, 0.01, dur)); o.start(at); o.stop(at + dur + 0.05); nodes.push(o);
  }
  function burst(ctx, dest, at, dur, peak, filterType, f0, f1, nodes) {
    var s = ctx.createBufferSource(); s.buffer = noise(ctx);
    var f = ctx.createBiquadFilter(); f.type = filterType || "bandpass"; f.Q.value = 0.9; f.frequency.setValueAtTime(f0, at); if (f1) f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    s.connect(f); f.connect(env(ctx, dest, at, peak, Math.min(0.04, dur / 3), dur)); s.start(at); s.stop(at + dur + 0.05); nodes.push(s);
  }
  var SYN = {
    pop: function (c, d, at, n) { tone(c, d, at, "sine", 640, 280, 0.12, 0.22, n); },
    whoosh: function (c, d, at, n) { burst(c, d, at, 0.38, 0.28, "bandpass", 500, 1900, n); },
    boing: function (c, d, at, n) { tone(c, d, at, "sine", 330, 85, 0.38, 0.26, n); tone(c, d, at + 0.02, "triangle", 660, 170, 0.3, 0.08, n); },
    thud: function (c, d, at, n) { tone(c, d, at, "sine", 150, 42, 0.26, 0.4, n); burst(c, d, at, 0.07, 0.25, "lowpass", 900, 300, n); },
    chime: function (c, d, at, n) { tone(c, d, at, "sine", 880, 880, 0.9, 0.16, n); tone(c, d, at + 0.12, "sine", 1318, 1318, 0.9, 0.12, n); tone(c, d, at + 0.24, "sine", 1760, 1760, 1.0, 0.08, n); },
    clap: function (c, d, at, n) { for (var i = 0; i < 3; i++) burst(c, d, at + i * 0.13, 0.04, 0.3, "highpass", 1400, 0, n); },
    step: function (c, d, at, n) { burst(c, d, at, 0.05, 0.16, "lowpass", 700, 250, n); tone(c, d, at, "sine", 110, 70, 0.07, 0.12, n); },
    sparkle: function (c, d, at, n) { for (var i = 0; i < 4; i++) tone(c, d, at + i * 0.07, "sine", 1200 + i * 300, 1600 + i * 300, 0.18, 0.08, n); }
  };

  /* ── Ortam sesleri: döngülü gürültü + filtre + yavaş dalgalanma; kuş ve cırcır böceği kısa tonlardan ── */
  function hold(ctx, dest, at, dur, peak) { var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.8, dur / 3)); g.gain.setValueAtTime(peak, at + Math.max(dur - 0.8, Math.min(0.8, dur / 3))); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); g.connect(dest); return g; }
  function loopNoise(c, d, at, dur, type, f0, q, peak, nodes, lfo) {
    var s = c.createBufferSource(); s.buffer = noise(c); s.loop = true;
    var f = c.createBiquadFilter(); f.type = type; f.frequency.value = f0; f.Q.value = q || 0.7;
    var g = hold(c, d, at, dur, peak);
    if (lfo) { var o = c.createOscillator(); o.type = "sine"; o.frequency.value = lfo.rate; var og = c.createGain(); og.gain.value = lfo.depth; o.connect(og); og.connect(lfo.target === "freq" ? f.frequency : g.gain); o.start(at); o.stop(at + dur + 0.05); nodes.push(o); }
    s.connect(f); f.connect(g); s.start(at); s.stop(at + dur + 0.05); nodes.push(s);
  }
  function ambRnd(seed, i) { var h = 2166136261 ^ (seed * 16777619 + i * 2654435761); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  var AMB = {
    rain: function (c, d, at, dur, n) { loopNoise(c, d, at, dur, "highpass", 1800, 0.5, 0.16, n); loopNoise(c, d, at, dur, "bandpass", 500, 0.4, 0.07, n, { rate: 0.2, depth: 0.03, target: "gain" }); },
    wind: function (c, d, at, dur, n) { loopNoise(c, d, at, dur, "bandpass", 380, 1.1, 0.2, n, { rate: 0.13, depth: 200, target: "freq" }); loopNoise(c, d, at, dur, "lowpass", 220, 0.5, 0.09, n, { rate: 0.09, depth: 0.05, target: "gain" }); },
    waves: function (c, d, at, dur, n) { loopNoise(c, d, at, dur, "lowpass", 650, 0.6, 0.18, n, { rate: 0.11, depth: 0.1, target: "gain" }); loopNoise(c, d, at, dur, "highpass", 2500, 0.5, 0.03, n, { rate: 0.11, depth: 0.02, target: "gain" }); },
    city: function (c, d, at, dur, n, seed) { loopNoise(c, d, at, dur, "lowpass", 170, 0.8, 0.12, n, { rate: 0.3, depth: 0.03, target: "gain" }); for (var t = at + 2 + ambRnd(seed, 1) * 4, i = 0; t < at + dur - 1 && i < 20; t += 6 + ambRnd(seed, i + 2) * 6, i++) tone(c, d, t, "square", 420 + (i % 3) * 60, 400 + (i % 3) * 60, 0.35, 0.03, n); },
    space: function (c, d, at, dur, n) { var o = c.createOscillator(); o.type = "sine"; o.frequency.value = 55; var o2 = c.createOscillator(); o2.type = "triangle"; o2.frequency.value = 82.5; var g = hold(c, d, at, dur, 0.08), g2 = hold(c, d, at, dur, 0.025); o.connect(g); o2.connect(g2); o.start(at); o.stop(at + dur + 0.05); o2.start(at); o2.stop(at + dur + 0.05); n.push(o, o2); },
    birds: function (c, d, at, dur, n, seed) { for (var t = at + 0.6, i = 0; t < at + dur - 0.3 && i < 300; t += 0.9 + ambRnd(seed, i) * 2.6, i++) { var f0 = 2300 + ambRnd(seed, i + 500) * 1500, m = 2 + (i % 2); for (var j = 0; j < m; j++) tone(c, d, t + j * 0.085, "sine", f0, f0 * 1.45, 0.06, 0.045, n); } },
    crickets: function (c, d, at, dur, n, seed) { for (var t = at + 0.4, i = 0; t < at + dur - 0.2 && i < 400; t += 0.5 + ambRnd(seed, i) * 0.3, i++) for (var j = 0; j < 4; j++) tone(c, d, t + j * 0.028, "sine", 4300, 4300, 0.014, 0.03, n); }
  };
  /* Projedeki tüm ipuçları küresel zamanla ([start, end) aralığı); seslendirme klipleri aralıkla örtüşüyorsa dahil edilir */
  function cues(project, start, end) {
    var out = [], acc = 0, s0 = start || 0, e0 = end == null ? Infinity : end, clips = project.clips || {};
    (project.scenes || []).forEach(function (sc) {
      (sc.sfx || []).forEach(function (q) {
        var T = acc + q.t;
        if (q.type === "clip") {
          var c = clips[q.clip];
          if (c && c.duration > 0 && T + c.duration > s0 + 1e-6 && T < e0) out.push({ t: T, type: "clip", clip: q.clip, dur: c.duration });
          return;
        }
        if (q.type === "amb") {
          if (AMB[q.amb] && q.dur > 0 && T + q.dur > s0 + 1e-6 && T < e0) out.push({ t: T, type: "amb", amb: q.amb, dur: q.dur, vol: q.vol == null ? 1 : q.vol });
          return;
        }
        if (T >= s0 - 1e-6 && T < e0 && SYN[q.type]) out.push({ t: T, type: q.type });
      });
      acc += sc.duration;
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /* ── Seslendirme klipleri: dataUrl → AudioBuffer önbelleği ── */
  var clipCache = new Map(), decodeCtx = null;
  function dataUrlToArrayBuffer(dataUrl) {
    var b64 = dataUrl.slice(dataUrl.indexOf(",") + 1), bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  function decoder() {
    if (live.ctx) return live.ctx;
    if (!decodeCtx) decodeCtx = new AudioContext();
    return decodeCtx;
  }
  /* Sahnelerde geçen klipleri çözer (bir kez); çalma ve dışa aktarma öncesi çağrılır */
  function prepare(project) {
    var need = {}, clips = project.clips || {};
    (project.scenes || []).forEach(function (sc) { (sc.sfx || []).forEach(function (q) { if (q.type === "clip" && clips[q.clip] && !(clipCache.get(q.clip) instanceof AudioBuffer)) need[q.clip] = 1; }); });
    var keys = Object.keys(need);
    if (!keys.length || typeof AudioContext === "undefined") return Promise.resolve(0);
    var ctx;
    try { ctx = decoder(); } catch (e) { return Promise.resolve(0); }
    return Promise.all(keys.map(function (key) {
      var pending = clipCache.get(key);
      if (pending && typeof pending.then === "function") return pending;
      var p = new Promise(function (resolve) {
        try {
          var ab = dataUrlToArrayBuffer(clips[key].dataUrl);
          var r = ctx.decodeAudioData(ab, function (buf) { clipCache.set(key, buf); resolve(buf); }, function () { clipCache.delete(key); resolve(null); });
          if (r && typeof r.then === "function") r.then(function (buf) { clipCache.set(key, buf); resolve(buf); }, function () { clipCache.delete(key); resolve(null); });
        } catch (e) { clipCache.delete(key); resolve(null); }
      });
      clipCache.set(key, p);
      return p;
    })).then(function (bufs) { return bufs.filter(Boolean).length; });
  }
  /* Konuşma zarfı: klipten 12 kare/sn ağız düzeyi dizisi (0 kapalı, 1 yarım, 2 açık); uzun açık diziler kırılır */
  function envelopeOf(buf, fps) {
    var ch = buf.getChannelData(0), win = Math.max(1, Math.round(buf.sampleRate / fps)), n = Math.ceil(ch.length / win), rms = [], peak = 0;
    for (var i = 0; i < n; i++) {
      var s = 0, a = i * win, b = Math.min(ch.length, a + win);
      for (var j = a; j < b; j++) s += ch[j] * ch[j];
      var v = Math.sqrt(s / Math.max(1, b - a)); rms.push(v); if (v > peak) peak = v;
    }
    if (peak <= 1e-5) return rms.map(function () { return "0"; }).join("");
    var out = rms.map(function (v) { var r = v / peak; return r < 0.12 ? 0 : r < 0.42 ? 1 : 2; }), run = 0;
    for (var q = 0; q < out.length; q++) { if (out[q] > 0) { run++; if (run > 4) { out[q] = 0; run = 0; } } else run = 0; }
    return out.join("");
  }
  function mouthEnvelope(dataUrl, fps) {
    fps = fps || 12;
    if (typeof AudioContext === "undefined") return Promise.resolve("");
    var ctx; try { ctx = decoder(); } catch (e) { return Promise.resolve(""); }
    return new Promise(function (resolve) {
      try {
        var ab = dataUrlToArrayBuffer(dataUrl), done = function (buf) { try { resolve(envelopeOf(buf, fps)); } catch (e) { resolve(""); } };
        var r = ctx.decodeAudioData(ab, done, function () { resolve(""); });
        if (r && typeof r.then === "function") r.then(done, function () { resolve(""); });
      } catch (e) { resolve(""); }
    });
  }
  function hasPendingClips(project) {
    var clips = project.clips || {};
    return (project.scenes || []).some(function (sc) { return (sc.sfx || []).some(function (q) { return q.type === "clip" && clips[q.clip] && !(clipCache.get(q.clip) instanceof AudioBuffer); }); });
  }

  /* İpuçlarını zamanlar: fromT küresel zamanı ctx'in `when` anına denk gelir. Durdurma işlevi döner.
     Klipler ayrı kazançla (konuşma seviyesi) çalar; aralığın ortasından başlıyorsa kaydırılarak başlatılır. */
  function schedule(ctx, dest, list, fromT, when, gainValue, voiceGain) {
    var g = ctx.createGain(); g.gain.value = gainValue == null ? 0.5 : gainValue; g.connect(dest);
    var vg = ctx.createGain(); vg.gain.value = voiceGain == null ? 1 : voiceGain; vg.connect(dest);
    var nodes = [];
    list.forEach(function (q) {
      if (q.type === "clip") {
        var buf = clipCache.get(q.clip);
        if (!(buf instanceof AudioBuffer)) return;
        var offset = Math.max(0, fromT - q.t);
        if (offset >= buf.duration - 0.02) return;
        var s = ctx.createBufferSource(); s.buffer = buf; s.connect(vg);
        try { s.start(when + Math.max(0, q.t - fromT), offset); nodes.push(s); } catch (e) { /* yoksay */ }
        return;
      }
      if (q.type === "amb") {
        var off2 = Math.max(0, fromT - q.t), remain = q.dur - off2;
        if (remain > 0.3 && AMB[q.amb]) { var ag = g; if (q.vol != null && q.vol < 1) { ag = ctx.createGain(); ag.gain.value = q.vol; ag.connect(g); } AMB[q.amb](ctx, ag, when + Math.max(0, q.t - fromT), remain, nodes, Math.round(q.t * 10)); }
        return;
      }
      if (q.t < fromT - 0.02) return;
      SYN[q.type](ctx, g, when + (q.t - fromT), nodes);
    });
    return function stop() { nodes.forEach(function (nd) { try { nd.stop(); } catch (e) { /* başlamamış olabilir */ } }); try { g.disconnect(); vg.disconnect(); } catch (e) { /* yoksay */ } };
  }
  /* Canlı önizleme (stüdyo ve kolay mod): tarayıcı sesine çalar */
  var live = { ctx: null, stopFn: null, enabled: true, token: 0,
    play: function (project, fromT) {
      live.stop();
      if (!live.enabled || typeof AudioContext === "undefined") return;
      if (!cues(project, fromT, Infinity).length) return;
      try {
        live.ctx = live.ctx || new AudioContext();
        if (live.ctx.state === "suspended") live.ctx.resume();
      } catch (e) { return; }
      var token = ++live.token, wall = performance.now();
      function go() {
        if (token !== live.token) return;
        var from = fromT + (performance.now() - wall) / 1000, list = cues(project, from, Infinity);
        try { live.stopFn = schedule(live.ctx, live.ctx.destination, list, from, live.ctx.currentTime + 0.03, 0.45, 1); } catch (e) { /* sessiz devam */ }
      }
      if (hasPendingClips(project)) prepare(project).then(go, go); else go();
    },
    stop: function () { live.token++; if (live.stopFn) { live.stopFn(); live.stopFn = null; } }
  };
  /* Konuşma sırasında müzik kısılır (sidechain): T anında bir klip çalıyorsa 0,35, değilse 1 */
  var DUCK = 0.35;
  function duck(project, T) {
    var acc = 0, clips = project.clips || {};
    for (var i = 0; i < (project.scenes || []).length; i++) {
      var sc = project.scenes[i];
      for (var j = 0; j < (sc.sfx || []).length; j++) {
        var q = sc.sfx[j];
        if (q.type !== "clip") continue;
        var c = clips[q.clip]; if (!c) continue;
        var s0 = acc + q.t - 0.15, s1 = acc + q.t + c.duration + 0.1;
        if (T >= s0 && T < s1) return DUCK;
      }
      acc += sc.duration;
    }
    return 1;
  }
  root.Sfx = { TYPES: Object.keys(SYN), AMBIENTS: Object.keys(AMB), cues: cues, schedule: schedule, prepare: prepare, mouthEnvelope: mouthEnvelope, duck: duck, DUCK: DUCK, live: live };
})(window);
