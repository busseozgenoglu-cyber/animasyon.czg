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
    sparkle: function (c, d, at, n) { for (var i = 0; i < 4; i++) tone(c, d, at + i * 0.07, "sine", 1200 + i * 300, 1600 + i * 300, 0.18, 0.08, n); }
  };

  /* Projedeki tüm ipuçları küresel zamanla ([start, end) aralığı) */
  function cues(project, start, end) {
    var out = [], acc = 0;
    (project.scenes || []).forEach(function (sc) {
      (sc.sfx || []).forEach(function (q) { var T = acc + q.t; if (T >= (start || 0) - 1e-6 && T < (end == null ? Infinity : end) && SYN[q.type]) out.push({ t: T, type: q.type }); });
      acc += sc.duration;
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }
  /* İpuçlarını zamanlar: fromT küresel zamanı ctx'in `when` anına denk gelir. Durdurma işlevi döner. */
  function schedule(ctx, dest, list, fromT, when, gainValue) {
    var g = ctx.createGain(); g.gain.value = gainValue == null ? 0.5 : gainValue; g.connect(dest);
    var nodes = [];
    list.forEach(function (q) { if (q.t < fromT - 0.02) return; SYN[q.type](ctx, g, when + (q.t - fromT), nodes); });
    return function stop() { nodes.forEach(function (nd) { try { nd.stop(); } catch (e) { /* başlamamış olabilir */ } }); try { g.disconnect(); } catch (e) { /* yoksay */ } };
  }
  /* Canlı önizleme (stüdyo ve kolay mod): tarayıcı sesine çalar */
  var live = { ctx: null, stopFn: null, enabled: true,
    play: function (project, fromT) {
      live.stop();
      if (!live.enabled || typeof AudioContext === "undefined") return;
      var list = cues(project, fromT, Infinity);
      if (!list.length) return;
      try {
        live.ctx = live.ctx || new AudioContext();
        if (live.ctx.state === "suspended") live.ctx.resume();
        live.stopFn = schedule(live.ctx, live.ctx.destination, list, fromT, live.ctx.currentTime + 0.03, 0.45);
      } catch (e) { /* ses yoksa sessiz devam */ }
    },
    stop: function () { if (live.stopFn) { live.stopFn(); live.stopFn = null; } }
  };
  root.Sfx = { TYPES: Object.keys(SYN), cues: cues, schedule: schedule, live: live };
})(window);
