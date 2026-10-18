/* Canlandır — hareket motoru.
   Easing eğrileri, anahtar kare enterpolasyonu ve tek tıkla uygulanan hareket efektleri.
   Saf hesap: DOM yok; tarayıcıda ve Node testlerinde aynı dosya çalışır.

   Veri modeli (özet):
   layer.base   = { x, y, rot, sx, sy, opacity }           // anahtar kare yoksa kullanılan değerler
   layer.tracks = { x: [{t, v, e}], y: [...], rot, sx, sy, opacity }   // e: bu kareden sonrakine geçiş eğrisi
   layer.effects = [{ id, type, start, end, params }]       // end null ise sahne sonu
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Motion = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PI = Math.PI, TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ── Easing ─────────────────────────────────────────────────── */
  var c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1, c4 = TAU / 3;
  var EASINGS = {
    linear: function (p) { return p; },
    easeInQuad: function (p) { return p * p; },
    easeOutQuad: function (p) { return 1 - (1 - p) * (1 - p); },
    easeInOutQuad: function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    easeInCubic: function (p) { return p * p * p; },
    easeOutCubic: function (p) { return 1 - Math.pow(1 - p, 3); },
    easeInOutCubic: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    easeInBack: function (p) { return c3 * p * p * p - c1 * p * p; },
    easeOutBack: function (p) { return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    easeInOutBack: function (p) {
      return p < 0.5 ? (Math.pow(2 * p, 2) * ((c2 + 1) * 2 * p - c2)) / 2
                     : (Math.pow(2 * p - 2, 2) * ((c2 + 1) * (p * 2 - 2) + c2) + 2) / 2;
    },
    easeOutBounce: function (p) {
      var n1 = 7.5625, d1 = 2.75;
      if (p < 1 / d1) return n1 * p * p;
      if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
      if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
      return n1 * (p -= 2.625 / d1) * p + 0.984375;
    },
    easeOutElastic: function (p) {
      if (p <= 0) return 0; if (p >= 1) return 1;
      return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
    },
    step: function (p) { return p >= 1 ? 1 : 0; }
  };
  var EASING_LIST = [
    { id: "linear", label: "Doğrusal" },
    { id: "easeInOutQuad", label: "Yumuşak" },
    { id: "easeInOutCubic", label: "Çok yumuşak" },
    { id: "easeInQuad", label: "Yavaş başla" },
    { id: "easeOutQuad", label: "Yavaş bitir" },
    { id: "easeInCubic", label: "Çok yavaş başla" },
    { id: "easeOutCubic", label: "Çok yavaş bitir" },
    { id: "easeOutBack", label: "Geri tepmeli bitir" },
    { id: "easeInBack", label: "Geri çekilip başla" },
    { id: "easeInOutBack", label: "İki yönlü geri tepme" },
    { id: "easeOutBounce", label: "Zıplayarak bitir" },
    { id: "easeOutElastic", label: "Esnek bitir" },
    { id: "step", label: "Ani geçiş (poz → poz)" }
  ];
  function ease(id, p) {
    var f = EASINGS[id] || EASINGS.linear;
    return f(clamp(p, 0, 1));
  }

  /* ── Anahtar kareler ────────────────────────────────────────── */
  var EPS = 1e-4;

  function trackValue(track, t, fallback) {
    if (!track || !track.length) return fallback;
    if (t <= track[0].t) return track[0].v;
    var last = track[track.length - 1];
    if (t >= last.t) return last.v;
    var lo = 0, hi = track.length - 1;            // ikili arama: a.t <= t < b.t
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (track[mid].t <= t) lo = mid; else hi = mid;
    }
    var a = track[lo], b = track[hi];
    var span = b.t - a.t;
    if (span <= 0) return b.v;
    var p = (t - a.t) / span;
    return a.v + (b.v - a.v) * ease(a.e, p);
  }

  function findKey(track, t) {
    for (var i = 0; i < track.length; i++) if (Math.abs(track[i].t - t) < EPS) return i;
    return -1;
  }
  function hasKey(track, t) { return !!track && findKey(track, t) >= 0; }

  function setKey(track, t, v, e) {
    var i = findKey(track, t);
    if (i >= 0) { track[i].v = v; if (e) track[i].e = e; return track[i]; }
    var key = { t: t, v: v, e: e || "easeInOutQuad" };
    track.push(key);
    track.sort(function (p, q) { return p.t - q.t; });
    return key;
  }
  function removeKey(track, t) {
    var i = findKey(track, t);
    if (i >= 0) track.splice(i, 1);
    return i >= 0;
  }
  /* Katmandaki tüm anahtar kare zamanları (sıralı, tekil) */
  function keyTimes(layer) {
    var set = {};
    var out = [];
    for (var k in layer.tracks) {
      var tr = layer.tracks[k];
      for (var i = 0; i < tr.length; i++) {
        var key = tr[i].t.toFixed(4);
        if (!set[key]) { set[key] = true; out.push(tr[i].t); }
      }
    }
    return out.sort(function (a, b) { return a - b; });
  }
  function hasAnyKey(layer) {
    for (var k in layer.tracks) if (layer.tracks[k].length) return true;
    return false;
  }
  /* Zamanı kaydır: t0'daki tüm anahtar kareler t1'e taşınır */
  function moveKeys(layer, t0, t1) {
    for (var k in layer.tracks) {
      var tr = layer.tracks[k], i = findKey(tr, t0);
      if (i < 0) continue;
      var key = tr.splice(i, 1)[0];
      key.t = t1;
      var j = findKey(tr, t1);
      if (j >= 0) tr.splice(j, 1);
      tr.push(key);
      tr.sort(function (p, q) { return p.t - q.t; });
    }
  }

  /* ── Efektler ───────────────────────────────────────────────── */
  var DIR4 = [
    { value: "left", label: "Soldan" }, { value: "right", label: "Sağdan" },
    { value: "top", label: "Üstten" }, { value: "bottom", label: "Alttan" }
  ];
  var DIR4_OUT = [
    { value: "left", label: "Sola" }, { value: "right", label: "Sağa" },
    { value: "top", label: "Yukarı" }, { value: "bottom", label: "Aşağı" }
  ];
  var EASE_OPTIONS = EASING_LIST.filter(function (e) { return e.id !== "step"; }).map(function (e) { return { value: e.id, label: e.label }; });

  function P(key, label, type, def, extra) {
    var o = { key: key, label: label, type: type, def: def };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  var pStrengthPx = function (def, max) { return P("strength", "Güç", "range", def, { min: 0, max: max || 400, step: 1, unit: "px" }); };
  var pSpeed = function (def, max) { return P("speed", "Hız", "range", def, { min: 0.05, max: max || 4, step: 0.05, unit: "×" }); };
  var pEase = function (def) { return P("easing", "Eğri", "select", def, { options: EASE_OPTIONS }); };

  /* Sahne dışına taşınma mesafeleri (giriş/çıkış kaymaları için) */
  function offDistance(dir, tr, ctx) {
    var w = Math.abs(ctx.size.w * tr.sx), h = Math.abs(ctx.size.h * tr.sy);
    var diag = Math.sqrt(w * w + h * h) / 2 + 24;
    switch (dir) {
      case "left": return tr.x + diag;
      case "right": return (ctx.stageW - tr.x) + diag;
      case "top": return tr.y + diag;
      default: return (ctx.stageH - tr.y) + diag;
    }
  }
  function pushDir(acc, dir, d) {
    if (dir === "left") acc.dx -= d;
    else if (dir === "right") acc.dx += d;
    else if (dir === "top") acc.dy -= d;
    else acc.dy += d;
  }

  var EFFECT_LIST = [
    /* Sürekli (döngü) */
    { type: "bounce", kind: "loop", group: "Sürekli", label: "Zıpla", icon: "🏀",
      desc: "Yerinde zıplar; yere değdiğinde ezilir, havada uzar.",
      params: [pStrengthPx(60), pSpeed(1), P("squash", "Ezilme", "range", 30, { min: 0, max: 100, step: 1, unit: "%" })],
      apply: function (acc, tr, u, p, pr) {
        var b = Math.abs(Math.sin(PI * pr.speed * u));
        acc.dy -= pr.strength * b;
        var g = Math.pow(1 - b, 6), s = pr.squash / 100;
        acc.msx *= 1 + s * 0.5 * g;
        acc.msy *= (1 - s * 0.4 * g) * (1 + s * 0.12 * b * b);
      } },
    { type: "float", kind: "loop", group: "Sürekli", label: "Süzül", icon: "🎈",
      desc: "Havada yavaşça iner-çıkar, hafifçe yana yatar.",
      params: [pStrengthPx(20, 200), pSpeed(0.5), P("tilt", "Yatma", "range", 3, { min: 0, max: 45, step: 0.5, unit: "°" })],
      apply: function (acc, tr, u, p, pr) {
        acc.dy += pr.strength * Math.sin(TAU * pr.speed * u);
        acc.drot += pr.tilt * Math.cos(TAU * pr.speed * u);
      } },
    { type: "shake", kind: "loop", group: "Sürekli", label: "Titre", icon: "📳",
      desc: "Küçük, hızlı sarsıntılar (korku, soğuk, heyecan).",
      params: [pStrengthPx(8, 100), pSpeed(1)],
      apply: function (acc, tr, u, p, pr) {
        var s = pr.strength, f = pr.speed;
        acc.dx += s * (0.6 * Math.sin(TAU * 11 * f * u) + 0.4 * Math.sin(TAU * 17 * f * u + 1.3));
        acc.dy += s * (0.5 * Math.sin(TAU * 13 * f * u + 0.7) + 0.5 * Math.sin(TAU * 19 * f * u + 2.1));
      } },
    { type: "swing", kind: "loop", group: "Sürekli", label: "Sallan", icon: "🔔",
      desc: "Sarkaç gibi sağa-sola döner. Dayanak noktasını üste alın.",
      params: [P("strength", "Açı", "range", 15, { min: 0, max: 90, step: 1, unit: "°" }), pSpeed(0.5)],
      apply: function (acc, tr, u, p, pr) { acc.drot += pr.strength * Math.sin(TAU * pr.speed * u); } },
    { type: "spin", kind: "loop", group: "Sürekli", label: "Dön", icon: "🌀",
      desc: "Kendi ekseninde sürekli döner.",
      params: [P("speed", "Hız", "range", 0.5, { min: 0.05, max: 5, step: 0.05, unit: "tur/sn" }),
               P("dir", "Yön", "select", "cw", { options: [{ value: "cw", label: "Saat yönü" }, { value: "ccw", label: "Saat yönünün tersi" }] })],
      apply: function (acc, tr, u, p, pr) { acc.drot += 360 * pr.speed * u * (pr.dir === "ccw" ? -1 : 1); } },
    { type: "breathe", kind: "loop", group: "Sürekli", label: "Nefes Al", icon: "🫧",
      desc: "Yavaşça büyür-küçülür; canlı durur.",
      params: [P("strength", "Güç", "range", 6, { min: 0, max: 60, step: 0.5, unit: "%" }), pSpeed(0.4)],
      apply: function (acc, tr, u, p, pr) { var m = 1 + (pr.strength / 100) * Math.sin(TAU * pr.speed * u); acc.msx *= m; acc.msy *= m; } },
    { type: "pulse", kind: "loop", group: "Sürekli", label: "Nabız", icon: "💓",
      desc: "Kalp atışı gibi ritmik vurur.",
      params: [P("strength", "Güç", "range", 15, { min: 0, max: 100, step: 1, unit: "%" }), pSpeed(1)],
      apply: function (acc, tr, u, p, pr) { var k = Math.max(0, Math.sin(TAU * pr.speed * u)); var m = 1 + (pr.strength / 100) * k * k * k; acc.msx *= m; acc.msy *= m; } },
    { type: "wobble", kind: "loop", group: "Sürekli", label: "Yalpala", icon: "🚶",
      desc: "Yürüme ritmi: sağa-sola yatar, her adımda hopluyor.",
      params: [P("strength", "Yatma", "range", 6, { min: 0, max: 45, step: 0.5, unit: "°" }), pSpeed(2), P("bob", "Hoplama", "range", 8, { min: 0, max: 100, step: 1, unit: "px" })],
      apply: function (acc, tr, u, p, pr) {
        acc.drot += pr.strength * Math.sin(TAU * pr.speed * u);
        acc.dy -= pr.bob * Math.abs(Math.sin(TAU * pr.speed * u));
      } },
    { type: "walk", kind: "loop", group: "Sürekli", label: "Yürü", icon: "🏃",
      desc: "Sahne boyunca yürür: ilerler, hoplar, hafif yatar. Kare dizisiyle birleştirin.",
      params: [P("distance", "Mesafe", "range", 600, { min: 0, max: 4000, step: 10, unit: "px" }), pSpeed(2),
               P("dir", "Yön", "select", "right", { options: [{ value: "right", label: "Sağa" }, { value: "left", label: "Sola" }] }),
               P("bob", "Hoplama", "range", 8, { min: 0, max: 100, step: 1, unit: "px" })],
      apply: function (acc, tr, u, p, pr) {
        acc.dx += (pr.dir === "left" ? -1 : 1) * (p - 0.5) * pr.distance;
        acc.dy -= pr.bob * Math.abs(Math.sin(TAU * pr.speed * u));
        acc.drot += 3 * Math.sin(TAU * pr.speed * u);
      } },
    { type: "drift", kind: "loop", group: "Sürekli", label: "Kay", icon: "☁️",
      desc: "Sabit hızla akar (bulut, araba, balık). Sahneden çıkınca öbür taraftan girebilir.",
      params: [P("speed", "Hız", "range", 60, { min: 1, max: 1500, step: 1, unit: "px/sn" }),
               P("dir", "Yön", "select", "right", { options: DIR4_OUT }),
               P("wrap", "Döngü", "select", "yes", { options: [{ value: "yes", label: "Öbür taraftan gir" }, { value: "no", label: "Çıkınca gitsin" }] })],
      apply: function (acc, tr, u, p, pr, ctx) {
        var d = pr.speed * u;
        var horiz = pr.dir === "left" || pr.dir === "right";
        var sign = (pr.dir === "left" || pr.dir === "top") ? -1 : 1;
        if (pr.wrap !== "yes") { if (horiz) acc.dx += sign * d; else acc.dy += sign * d; return; }
        var ext = horiz ? Math.abs(ctx.size.w * tr.sx) : Math.abs(ctx.size.h * tr.sy);
        var total = (horiz ? ctx.stageW : ctx.stageH) + ext;
        var pos = (horiz ? tr.x : tr.y) + ext / 2 + sign * d;
        pos = ((pos % total) + total) % total;
        var np = pos - ext / 2;
        if (horiz) acc.dx += np - tr.x; else acc.dy += np - tr.y;
      } },
    { type: "blink", kind: "loop", group: "Sürekli", label: "Yanıp Sön", icon: "✨",
      desc: "Açılır-kapanır (yıldız, lamba, uyarı).",
      params: [pSpeed(2, 10), P("min", "Sönük", "range", 0, { min: 0, max: 100, step: 1, unit: "%" })],
      apply: function (acc, tr, u, p, pr) { if (Math.sin(TAU * pr.speed * u) < 0) acc.mop *= pr.min / 100; } },
    { type: "flip", kind: "loop", group: "Sürekli", label: "Çevir", icon: "🔁",
      desc: "Kart gibi ters yüz döner.",
      params: [pSpeed(0.5, 3), P("axis", "Eksen", "select", "h", { options: [{ value: "h", label: "Yatay" }, { value: "v", label: "Dikey" }] })],
      apply: function (acc, tr, u, p, pr) { var c = Math.cos(TAU * pr.speed * u); if (pr.axis === "v") acc.msy *= c; else acc.msx *= c; } },
    { type: "jelly", kind: "loop", group: "Sürekli", label: "Jöle", icon: "🍮",
      desc: "Ezil-uza: lastik gibi esner.",
      params: [P("strength", "Güç", "range", 10, { min: 0, max: 60, step: 0.5, unit: "%" }), pSpeed(1.5)],
      apply: function (acc, tr, u, p, pr) { var s = (pr.strength / 100) * Math.sin(TAU * pr.speed * u); acc.msx *= 1 + s; acc.msy *= 1 - s; } },
    { type: "talk", kind: "loop", group: "Sürekli", label: "Konuş", icon: "🗣️",
      desc: "Konuşma ritmi: küçük baş hareketi ve hafif esneme. Senaryo üretimi replik sırasında kullanır.",
      params: [pStrengthPx(4, 40), pSpeed(5, 12)],
      apply: function (acc, tr, u, p, pr) {
        var w = Math.abs(Math.sin(TAU * pr.speed * u)), w2 = Math.sin(TAU * pr.speed * 0.37 * u);
        acc.dy -= pr.strength * w * 0.6;
        acc.drot += 1.2 * w2;
        acc.msy *= 1 + 0.015 * w;
      } },
    { type: "lean", kind: "loop", group: "Sürekli", label: "Eğil", icon: "🙇",
      desc: "Belirtilen açıya yumuşakça eğilir, pencere bitiminde geri döner (üzgün, düşünceli, uykulu duruş).",
      params: [P("angle", "Açı", "range", -8, { min: -60, max: 60, step: 1, unit: "°" }), P("ramp", "Geçiş", "range", 0.4, { min: 0.05, max: 3, step: 0.05, unit: "sn" })],
      apply: function (acc, tr, u, p, pr, ctx, eff, w) {
        var span = w ? Math.max(1e-6, w.end - w.start) : 1e9;
        var inK = Math.min(1, u / pr.ramp), outK = w && w.end < 1e8 ? Math.min(1, (span - u) / pr.ramp) : 1;
        var sm = function (x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        acc.drot += pr.angle * sm(inK) * sm(outK);
      } },
    { type: "orbit", kind: "loop", group: "Sürekli", label: "Daire Çiz", icon: "🌊",
      desc: "Dairesel yolda dolanır.",
      params: [P("strength", "Yarıçap", "range", 40, { min: 1, max: 800, step: 1, unit: "px" }), pSpeed(0.5),
               P("dir", "Yön", "select", "cw", { options: [{ value: "cw", label: "Saat yönü" }, { value: "ccw", label: "Saat yönünün tersi" }] })],
      apply: function (acc, tr, u, p, pr) { var a = TAU * pr.speed * u * (pr.dir === "ccw" ? -1 : 1); acc.dx += pr.strength * Math.cos(a); acc.dy += pr.strength * Math.sin(a); } },

    /* Giriş */
    { type: "slideIn", kind: "in", group: "Giriş", label: "Kayarak Gir", icon: "➡️", defaultDuration: 0.8,
      desc: "Sahne dışından kayarak yerine gelir.",
      params: [P("dir", "Yön", "select", "left", { options: DIR4 }), pEase("easeOutCubic")],
      apply: function (acc, tr, u, p, pr, ctx) { pushDir(acc, pr.dir, offDistance(pr.dir, tr, ctx) * (1 - ease(pr.easing, p))); } },
    { type: "fadeIn", kind: "in", group: "Giriş", label: "Belir", icon: "🌅", defaultDuration: 0.8,
      desc: "Saydamdan görünür hale gelir.",
      params: [pEase("easeOutQuad")],
      apply: function (acc, tr, u, p, pr) { acc.mop *= ease(pr.easing, p); } },
    { type: "zoomIn", kind: "in", group: "Giriş", label: "Büyüyerek Gir", icon: "🔍", defaultDuration: 0.7,
      desc: "Noktadan büyüyerek belirir.",
      params: [pEase("easeOutBack")],
      apply: function (acc, tr, u, p, pr) { var m = Math.max(0, ease(pr.easing, p)); acc.msx *= m; acc.msy *= m; } },
    { type: "dropIn", kind: "in", group: "Giriş", label: "Düşerek Gir", icon: "🪂", defaultDuration: 1,
      desc: "Yukarıdan düşer, yere çarpıp zıplar.",
      params: [pEase("easeOutBounce")],
      apply: function (acc, tr, u, p, pr, ctx) { acc.dy -= offDistance("top", tr, ctx) * (1 - ease(pr.easing, p)); } },
    { type: "popIn", kind: "in", group: "Giriş", label: "Patlayarak Gir", icon: "🎉", defaultDuration: 0.6,
      desc: "Esneyerek 'pat' diye belirir.",
      params: [pEase("easeOutElastic")],
      apply: function (acc, tr, u, p, pr) { var m = Math.max(0.001, ease(pr.easing, p)); acc.msx *= m; acc.msy *= m; acc.mop *= Math.min(1, p * 5); } },
    { type: "reveal", kind: "in", group: "Giriş", label: "Yazarak / Süpürerek Gir", icon: "⌨️", defaultDuration: 1.5,
      desc: "Metni harf harf yazar; görseli soldan sağa açar.",
      params: [pEase("linear")],
      apply: function (acc, tr, u, p, pr) { acc.reveal = Math.min(acc.reveal, ease(pr.easing, p)); } },

    /* Çıkış */
    { type: "slideOut", kind: "out", group: "Çıkış", label: "Kayarak Çık", icon: "⬅️", defaultDuration: 0.8,
      desc: "Sahne dışına kayar.",
      params: [P("dir", "Yön", "select", "right", { options: DIR4_OUT }), pEase("easeInCubic")],
      apply: function (acc, tr, u, p, pr, ctx) { pushDir(acc, pr.dir, offDistance(pr.dir, tr, ctx) * ease(pr.easing, p)); } },
    { type: "fadeOut", kind: "out", group: "Çıkış", label: "Kaybol", icon: "🌑", defaultDuration: 0.8,
      desc: "Yavaşça saydamlaşır.",
      params: [pEase("easeInQuad")],
      apply: function (acc, tr, u, p, pr) { acc.mop *= 1 - ease(pr.easing, p); } },
    { type: "zoomOut", kind: "out", group: "Çıkış", label: "Küçülerek Çık", icon: "🔎", defaultDuration: 0.7,
      desc: "Noktaya kadar küçülür.",
      params: [pEase("easeInBack")],
      apply: function (acc, tr, u, p, pr) { var m = Math.max(0, 1 - ease(pr.easing, p)); acc.msx *= m; acc.msy *= m; } },
    { type: "dropOut", kind: "out", group: "Çıkış", label: "Düşerek Çık", icon: "🕳️", defaultDuration: 0.8,
      desc: "Aşağıya düşerek kaybolur.",
      params: [pEase("easeInQuad")],
      apply: function (acc, tr, u, p, pr, ctx) { var e = ease(pr.easing, p); acc.dy += offDistance("bottom", tr, ctx) * e; acc.drot += 25 * e; } }
  ];
  var EFFECTS = {};
  EFFECT_LIST.forEach(function (d) { EFFECTS[d.type] = d; });

  var _id = 0;
  function uid(prefix) { return (prefix || "id") + "_" + Date.now().toString(36) + "_" + (++_id).toString(36) + Math.random().toString(36).slice(2, 6); }

  /* Yeni efekt nesnesi: varsayılan parametreler ve zaman penceresi */
  function createEffect(type, sceneDuration, layer) {
    var def = EFFECTS[type];
    if (!def) throw new Error("Bilinmeyen efekt: " + type);
    var params = {};
    def.params.forEach(function (p) { params[p.key] = p.def; });
    var inP = layer && layer.inPoint || 0;
    var outP = (layer && layer.outPoint != null) ? layer.outPoint : sceneDuration;
    var eff = { id: uid("fx"), type: type, params: params, start: inP, end: null };
    if (def.kind === "in") { eff.start = inP; eff.end = Math.min(outP, inP + (def.defaultDuration || 1)); }
    else if (def.kind === "out") { eff.end = outP; eff.start = Math.max(inP, outP - (def.defaultDuration || 1)); }
    return eff;
  }

  function effectWindow(eff, sceneDuration) {
    var s = eff.start || 0;
    var e = eff.end == null ? sceneDuration : eff.end;
    if (e < s) e = s;
    return { start: s, end: e };
  }

  function layerEnd(layer, sceneDuration) { return layer.outPoint == null ? sceneDuration : Math.min(layer.outPoint, sceneDuration); }
  function layerVisibleAt(layer, t, sceneDuration) {
    if (layer.visible === false) return false;
    return t >= (layer.inPoint || 0) - EPS && t < layerEnd(layer, sceneDuration) - EPS;
  }

  /* t anında çizilecek görsel: önce zaman pencereli kare setleri (senaryo üretimi: konuşma/yürüme/duygu), sonra ana dizi */
  function frameAt(layer, t) {
    var sets = layer.frameSets;
    if (sets && sets.length) {
      for (var i = sets.length - 1; i >= 0; i--) {
        var fs = sets[i];
        if (fs.frames && fs.frames.length && t >= fs.start - EPS && t < fs.end - EPS) {
          var idx = Math.floor(Math.max(0, t - fs.start) * (fs.fps || 8) + 1e-6) % fs.frames.length;
          return fs.frames[idx];
        }
      }
    }
    return layer.frames[frameIndex(layer, t)];
  }

  /* Kare dizisinde t anında gösterilecek kare */
  function frameIndex(layer, t) {
    var n = layer.frames ? layer.frames.length : 0;
    if (n <= 1) return 0;
    var local = Math.max(0, t - (layer.inPoint || 0));
    var idx = Math.floor(local * (layer.frameFps || 8) + 1e-6);
    if (layer.frameMode === "once") return Math.min(idx, n - 1);
    if (layer.frameMode === "pingpong") { var period = 2 * n - 2; var k = idx % period; return k < n ? k : period - k; }
    return idx % n;
  }

  /* Katmanın t anındaki tam dönüşümü: anahtar kareler + efektler.
     ctx: { sceneDuration, stageW, stageH, size: {w, h} } */
  function evalLayer(layer, t, ctx) {
    var b = layer.base, tk = layer.tracks || {};
    var tr = {
      x: trackValue(tk.x, t, b.x), y: trackValue(tk.y, t, b.y),
      rot: trackValue(tk.rot, t, b.rot), sx: trackValue(tk.sx, t, b.sx), sy: trackValue(tk.sy, t, b.sy),
      opacity: trackValue(tk.opacity, t, b.opacity)
    };
    var acc = { dx: 0, dy: 0, drot: 0, msx: 1, msy: 1, mop: 1, reveal: 1 };
    var effects = layer.effects || [];
    for (var i = 0; i < effects.length; i++) {
      var eff = effects[i], def = EFFECTS[eff.type];
      if (!def || eff.enabled === false) continue;
      var w = effectWindow(eff, ctx.sceneDuration);
      var span = Math.max(1e-6, w.end - w.start);
      var p, u = t - w.start;
      if (def.kind === "loop") {
        if (t < w.start - EPS || t > w.end + EPS) continue;
        p = clamp(u / span, 0, 1);
      } else if (def.kind === "in") {
        if (t > w.end + EPS) continue;             // giriş tamamlandı
        p = clamp(u / span, 0, 1);
      } else {                                      // out
        if (t < w.start - EPS) continue;           // çıkış henüz başlamadı
        p = clamp(u / span, 0, 1);
      }
      var pr = {};
      for (var k = 0; k < def.params.length; k++) {
        var pd = def.params[k];
        var v = eff.params ? eff.params[pd.key] : undefined;
        pr[pd.key] = (v == null || v === "") ? pd.def : (pd.type === "range" ? +v : v);
      }
      def.apply(acc, tr, u, p, pr, ctx, eff, w);
    }
    return {
      x: tr.x + acc.dx, y: tr.y + acc.dy, rot: tr.rot + acc.drot,
      sx: tr.sx * acc.msx, sy: tr.sy * acc.msy,
      opacity: clamp(tr.opacity * acc.mop, 0, 1), reveal: clamp(acc.reveal, 0, 1)
    };
  }

  function quantizeTime(t, fps) { return Math.round(t * fps) / fps; }

  return {
    EASINGS: EASINGS, EASING_LIST: EASING_LIST, ease: ease,
    trackValue: trackValue, setKey: setKey, removeKey: removeKey, hasKey: hasKey, findKey: findKey,
    keyTimes: keyTimes, hasAnyKey: hasAnyKey, moveKeys: moveKeys,
    EFFECTS: EFFECTS, EFFECT_LIST: EFFECT_LIST, createEffect: createEffect, effectWindow: effectWindow,
    evalLayer: evalLayer, frameIndex: frameIndex, frameAt: frameAt, layerVisibleAt: layerVisibleAt, layerEnd: layerEnd,
    quantizeTime: quantizeTime, uid: uid, clamp: clamp
  };
});
