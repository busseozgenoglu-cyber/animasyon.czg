/* Canlandır — çizim motoru. Sahneyi t anında tuvale çizer; isabet testi ve küçük resim üretir. */
(function (root) {
  "use strict";
  var M = root.Motion;
  var DEG = Math.PI / 180;

  var cache = new Map();          // assetId → { img, w, h, hit }
  var textCache = new Map();      // düzen önbelleği
  var thumbCache = new Map();
  var measure = document.createElement("canvas").getContext("2d");

  function loadAsset(asset) {
    var entry = cache.get(asset.id);
    if (entry && entry.promise) return entry.promise;
    var img = new Image();
    entry = { img: img, w: asset.width || 1, h: asset.height || 1, ready: false, hit: null };
    entry.promise = new Promise(function (resolve) {
      img.onload = function () {
        entry.w = img.naturalWidth || entry.w; entry.h = img.naturalHeight || entry.h; entry.ready = true;
        resolve(entry);
      };
      img.onerror = function () { entry.failed = true; resolve(entry); };
      img.src = asset.dataUrl;
    });
    cache.set(asset.id, entry);
    return entry.promise;
  }
  function ensureAssets(project) {
    var ps = [];
    Object.keys(project.assets).forEach(function (id) { var e = cache.get(id); if (!e || !e.ready) ps.push(loadAsset(project.assets[id])); });
    return Promise.all(ps);
  }
  function getEntry(id) { var e = cache.get(id); return e && e.ready ? e : null; }
  function dropAsset(id) { cache.delete(id); thumbCache.delete(id); }

  /* Alfa isabet tuvali (küçültülmüş) */
  function hitCanvas(entry) {
    if (entry.hit) return entry.hit;
    var s = Math.min(1, 256 / Math.max(entry.w, entry.h));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(entry.w * s)); c.height = Math.max(1, Math.round(entry.h * s));
    var cx = c.getContext("2d", { willReadFrequently: true });
    try { cx.drawImage(entry.img, 0, 0, c.width, c.height); } catch (e) { /* bozuk görsel */ }
    entry.hit = { canvas: c, ctx: cx };
    return entry.hit;
  }
  function alphaAt(entry, u, v) {
    var h = hitCanvas(entry);
    var x = Math.min(h.canvas.width - 1, Math.max(0, Math.floor(u * h.canvas.width)));
    var y = Math.min(h.canvas.height - 1, Math.max(0, Math.floor(v * h.canvas.height)));
    try { return h.ctx.getImageData(x, y, 1, 1).data[3]; } catch (e) { return 255; }
  }

  /* ── Metin düzeni ─────────────────────────────────────────── */
  function fontString(t) { return t.weight + " " + t.size + "px " + t.font; }

  function textLayout(layer) {
    var t = layer.text;
    var key = JSON.stringify([t.content, t.font, t.size, t.weight, t.maxWidth, t.lineHeight, t.bubble]);
    var hit = textCache.get(key);
    if (hit) return hit;
    measure.font = fontString(t);
    var lines = [];
    var paragraphs = String(t.content || "").split("\n");
    paragraphs.forEach(function (para) {
      var words = para.split(/(\s+)/), line = "";
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (!w) continue;
        var test = line + w;
        if (line && measure.measureText(test).width > t.maxWidth && !/^\s+$/.test(w)) {
          lines.push(line.replace(/\s+$/, ""));
          line = /^\s+$/.test(w) ? "" : w;
        } else line = test;
      }
      lines.push(line.replace(/\s+$/, ""));
    });
    var maxW = 0;
    lines.forEach(function (l) { maxW = Math.max(maxW, measure.measureText(l).width); });
    var lh = t.size * t.lineHeight;
    var pad = t.bubble ? Math.round(t.size * 0.55) : Math.round(t.size * 0.1);
    var layout = { lines: lines, lineHeight: lh, pad: pad, w: Math.ceil(maxW + pad * 2), h: Math.ceil(lines.length * lh + pad * 2), textW: maxW };
    if (textCache.size > 200) textCache.clear();
    textCache.set(key, layout);
    return layout;
  }

  function layerSize(layer, project) {
    if (layer.type === "text") { var l = textLayout(layer); return { w: l.w, h: l.h }; }
    var id = layer.frames[0];
    var e = cache.get(id);
    if (e && e.ready) return { w: e.w, h: e.h };
    var a = project.assets[id];
    return { w: a ? a.width : 100, h: a ? a.height : 100 };
  }

  function layerCtx(project, scene, layer) {
    return { sceneDuration: scene.duration, stageW: project.width, stageH: project.height, size: layerSize(layer, project) };
  }
  function transformAt(project, scene, layer, t) { return M.evalLayer(layer, t, layerCtx(project, scene, layer)); }

  /* Yerel → sahne dönüşümü için matris bileşenleri */
  function matrixOf(layer, tr) {
    var cos = Math.cos(tr.rot * DEG), sin = Math.sin(tr.rot * DEG);
    var sx = tr.sx * (layer.flipX ? -1 : 1), sy = tr.sy * (layer.flipY ? -1 : 1);
    return { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: tr.x, f: tr.y };
  }
  function corners(layer, tr, size) {
    var m = matrixOf(layer, tr), ox = -layer.anchor.x * size.w, oy = -layer.anchor.y * size.h;
    function pt(lx, ly) { return { x: m.a * lx + m.c * ly + m.e, y: m.b * lx + m.d * ly + m.f }; }
    return [pt(ox, oy), pt(ox + size.w, oy), pt(ox + size.w, oy + size.h), pt(ox, oy + size.h)];
  }
  /* Sahne noktasını katmanın yerel 0..1 koordinatına çevirir */
  function localPoint(layer, tr, size, px, py) {
    var m = matrixOf(layer, tr);
    var det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) < 1e-9) return null;
    var dx = px - m.e, dy = py - m.f;
    var lx = (m.d * dx - m.c * dy) / det, ly = (-m.b * dx + m.a * dy) / det;
    return { u: (lx + layer.anchor.x * size.w) / size.w, v: (ly + layer.anchor.y * size.h) / size.h };
  }

  /* Kamera: null = kimlik; aksi hâlde { zoom, cx, cy, W, H } (piksel) */
  function cameraOf(project, scene, t) {
    var v = M.cameraAt(scene, t);
    if (Math.abs(v.zoom - 1) < 1e-6 && Math.abs(v.x - 0.5) < 1e-6 && Math.abs(v.y - 0.5) < 1e-6) return null;
    return { zoom: v.zoom, cx: v.x * project.width, cy: v.y * project.height, W: project.width, H: project.height };
  }
  /* Katmanın paralaks oranına göre kamerası: uzak katmanlar kameraya daha az tepki verir */
  function camFor(cam, layer) {
    if (!cam || layer.hud) return null;
    var p = layer.parallax == null ? 1 : layer.parallax;
    if (p === 1) return cam;
    if (p <= 0) return null;
    return { zoom: 1 + (cam.zoom - 1) * p, cx: cam.W / 2 + (cam.cx - cam.W / 2) * p, cy: cam.H / 2 + (cam.cy - cam.H / 2) * p, W: cam.W, H: cam.H };
  }
  function layerCamera(project, scene, t, layer) { return camFor(cameraOf(project, scene, t), layer); }
  function applyCam(ctx, cam) { ctx.translate(cam.W / 2, cam.H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.cx, -cam.cy); }
  function toView(cam, pt) { if (!cam) return pt; return { x: (pt.x - cam.cx) * cam.zoom + cam.W / 2, y: (pt.y - cam.cy) * cam.zoom + cam.H / 2 }; }
  function fromView(cam, pt) { if (!cam) return pt; return { x: (pt.x - cam.W / 2) / cam.zoom + cam.cx, y: (pt.y - cam.H / 2) / cam.zoom + cam.cy }; }
  function viewCorners(project, scene, t, layer, tr, size) { var cam = layerCamera(project, scene, t, layer); return corners(layer, tr, size).map(function (p) { return toView(cam, p); }); }
  function viewPoint(project, scene, t, pt) { return toView(cameraOf(project, scene, t), pt); }

  function hitTest(project, scene, t, px, py) {
    var cam = cameraOf(project, scene, t);
    for (var i = scene.layers.length - 1; i >= 0; i--) {
      var L = scene.layers[i];
      if (L.locked || !M.layerVisibleAt(L, t, scene.duration)) continue;
      var size = layerSize(L, project), tr = transformAt(project, scene, L, t);
      if (tr.opacity <= 0.02) continue;
      var q = fromView(camFor(cam, L), { x: px, y: py });
      var lp = localPoint(L, tr, size, q.x, q.y);
      if (!lp || lp.u < 0 || lp.u > 1 || lp.v < 0 || lp.v > 1) continue;
      if (L.type === "text") return L;
      var e = getEntry(M.frameAt(L, t));
      if (!e) return L;
      if (alphaAt(e, lp.u, lp.v) > 10) return L;
    }
    return null;
  }

  /* ── Çizim ────────────────────────────────────────────────── */
  function drawChecker(ctx, w, h) {
    var s = 24;
    ctx.fillStyle = "#2a2f3a"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a4050";
    for (var y = 0; y < h; y += s) for (var x = (y / s) % 2 ? s : 0; x < w; x += s * 2) ctx.fillRect(x, y, s, s);
  }
  function drawBackground(ctx, project, scene, forExport) {
    var bg = scene.background, w = project.width, h = project.height;
    if (bg.type === "transparent") { if (!forExport) drawChecker(ctx, w, h); return; }
    if (bg.type === "gradient") {
      var a = (bg.angle || 0) * DEG, r = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
      var cx = w / 2, cy = h / 2, dx = Math.sin(a) * r / 2, dy = -Math.cos(a) * r / 2;
      var g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); return;
    }
    ctx.fillStyle = bg.color || "#000"; ctx.fillRect(0, 0, w, h);
    if (bg.type === "image" && bg.assetId) {
      var e = getEntry(bg.assetId);
      if (e) {   // kapla (cover)
        var s = Math.max(w / e.w, h / e.h), dw = e.w * s, dh = e.h * s;
        ctx.drawImage(e.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* Dikdörtgen çevresinde p∈[0,1) konumu ve dışa bakan normal (üst → sağ → alt → sol) */
  function perimeterAt(x, y, w, h, p) {
    var P = 2 * (w + h), d = p * P;
    if (d < w) return { x: x + d, y: y, nx: 0, ny: -1 };
    d -= w; if (d < h) return { x: x + w, y: y + d, nx: 1, ny: 0 };
    d -= h; if (d < w) return { x: x + w - d, y: y + h, nx: 0, ny: 1 };
    d -= w; return { x: x, y: y + h - d, nx: -1, ny: 0 };
  }
  /* Düşünce balonu: dikdörtgen + çevresinde yuvarlak kabarcıklar (birleşik dolgu) */
  function thoughtPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    var n = Math.max(8, Math.round(2 * (w + h) / (r * 1.5)));
    for (var i = 0; i < n; i++) { var q = perimeterAt(x, y, w, h, i / n); ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); }
    ctx.rect(x, y, w, h);
  }
  /* Bağırma balonu: sivri dişli tek çokgen; kuyruk, konuşana en yakın alt dişin uzatılmasıdır */
  function shoutPath(ctx, x, y, w, h, size, tailX, tailLen) {
    var spike = size * 0.42, inset = size * 0.08, n = Math.max(12, Math.round(2 * (w + h) / (size * 0.9)));
    var tailI = -1, best = 1e9;
    if (tailX != null) for (var j = 0; j < n; j++) { var qq = perimeterAt(x, y, w, h, j / n); if (qq.ny === 1 && Math.abs(qq.x - tailX) < best) { best = Math.abs(qq.x - tailX); tailI = j; } }
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var a = perimeterAt(x, y, w, h, i / n), b = perimeterAt(x, y, w, h, (i + 0.5) / n), s = i === tailI ? tailLen : spike;
      var ax = i === tailI ? tailX : a.x + a.nx * s, ay = a.y + a.ny * s;
      if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
      ctx.lineTo(b.x - b.nx * inset, b.y - b.ny * inset);
    }
    ctx.closePath();
  }

  function drawText(ctx, layer, tr) {
    var t = layer.text, lay = textLayout(layer);
    var ox = -layer.anchor.x * lay.w, oy = -layer.anchor.y * lay.h;
    if (t.bubble) {
      var shape = t.bubbleShape || "round", tail = t.bubbleTail, tx = tail === "left" ? ox + lay.w * 0.22 : ox + lay.w * 0.78;
      ctx.fillStyle = t.bubbleColor;
      if (shape === "thought") {   // düşünce balonu: bulut kenarı, konuşana doğru küçülen kabarcıklar
        var tr0 = Math.max(10, t.size * 0.5), inset = tr0 * 0.6;
        thoughtPath(ctx, ox + inset, oy + inset, lay.w - inset * 2, lay.h - inset * 2, tr0);
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,.22)"; ctx.shadowBlur = Math.max(6, t.size * 0.3); ctx.shadowOffsetY = Math.max(2, t.size * 0.06); ctx.fill(); ctx.restore();
        if (tail !== "none") {
          var dir = tail === "left" ? -1 : 1;
          [[0, 0.5, 0.24], [0.4, 1.05, 0.14]].forEach(function (c) { ctx.beginPath(); ctx.arc(tx + dir * t.size * c[0], oy + lay.h + t.size * c[1], t.size * c[2], 0, Math.PI * 2); ctx.fill(); });
        }
      } else if (shape === "shout") {   // bağırma balonu: sivri dişli kenar, uzun sivri kuyruk, kalın çizgi
        shoutPath(ctx, ox, oy, lay.w, lay.h, t.size, tail === "none" ? null : tx, t.size * 1.1);
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = Math.max(6, t.size * 0.3); ctx.shadowOffsetY = Math.max(2, t.size * 0.06); ctx.fill(); ctx.restore();
        ctx.save(); ctx.lineWidth = Math.max(2, t.size * 0.07); ctx.strokeStyle = "#1b1f2a"; ctx.lineJoin = "miter"; ctx.stroke(); ctx.restore();
      } else {
        var r = Math.min(lay.h / 2, t.size * 0.8);
        roundRect(ctx, ox, oy, lay.w, lay.h, r);
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = Math.max(6, t.size * 0.35); ctx.shadowOffsetY = Math.max(2, t.size * 0.08); ctx.fill(); ctx.restore();
        if (tail !== "none") {
          var tw = Math.min(lay.w * 0.3, t.size * 0.9);
          ctx.moveTo(tx - tw / 2, oy + lay.h - 1);
          ctx.lineTo(tail === "left" ? tx - tw * 0.9 : tx + tw * 0.9, oy + lay.h + t.size * 0.7);
          ctx.lineTo(tx + tw / 2, oy + lay.h - 1);
          ctx.closePath();
        }
        ctx.fill();
      }
    }
    ctx.font = fontString(t);
    ctx.textBaseline = "middle";
    ctx.textAlign = t.align;
    ctx.lineJoin = "round";
    var total = t.content.length, shown = tr.reveal >= 1 ? Infinity : Math.ceil(total * tr.reveal), used = 0;
    var xBase = t.align === "left" ? ox + lay.pad : t.align === "right" ? ox + lay.w - lay.pad : ox + lay.w / 2;
    for (var i = 0; i < lay.lines.length; i++) {
      var line = lay.lines[i];
      var remain = shown - used;
      used += line.length + 1;
      if (remain <= 0) break;
      var text = remain < line.length ? line.slice(0, remain) : line;
      var y = oy + lay.pad + lay.lineHeight * (i + 0.5);
      if (t.strokeWidth > 0) { ctx.lineWidth = t.strokeWidth * 2; ctx.strokeStyle = t.stroke; ctx.strokeText(text, xBase, y); }
      ctx.fillStyle = t.color; ctx.fillText(text, xBase, y);
    }
  }

  function drawLayer(ctx, project, scene, layer, t, alphaMul) {
    var size = layerSize(layer, project);
    var tr = transformAt(project, scene, layer, t);
    var alpha = tr.opacity * (alphaMul == null ? 1 : alphaMul);
    if (alpha <= 0.001) return;
    if (layer.shadow && layer.type !== "text") {   // yere düşen yumuşak gölge; havalanınca küçülür
      var gy = layer.shadow.y, lift = Math.max(0, gy - tr.y), f = Math.max(0.3, Math.min(1, 1 - lift / (project.height * 0.6)));
      var rx = size.w * Math.abs(tr.sx) * 0.4 * f, ry = Math.max(3, rx * 0.2);
      if (rx > 2) { ctx.save(); ctx.globalAlpha = 0.22 * Math.min(1, alpha); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(tr.x, gy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.rot * DEG);
    ctx.scale(tr.sx * (layer.flipX ? -1 : 1), tr.sy * (layer.flipY ? -1 : 1));
    if (tr.blur > 0.25 && "filter" in ctx) ctx.filter = "blur(" + Math.min(40, tr.blur).toFixed(1) + "px)";   // alan derinliği: yakın çekimde uzak katmanlar bulanır
    var ox = -layer.anchor.x * size.w, oy = -layer.anchor.y * size.h;
    if (layer.type === "text") {
      drawText(ctx, layer, tr);
    } else {
      var e = getEntry(M.frameAt(layer, t));
      if (e) {
        if (tr.reveal < 1) { ctx.beginPath(); ctx.rect(ox, oy, size.w * tr.reveal, size.h); ctx.clip(); }
        ctx.drawImage(e.img, ox, oy, size.w, size.h);
      } else {
        ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fillRect(ox, oy, size.w, size.h);
      }
    }
    ctx.restore();
  }

  /* Sahne geçişi için siyah örtü yoğunluğu (0..1): bu sahnenin sonu + önceki sahnenin başı */
  /* Sahne geçişi: { type, p } — p örtme oranı (1 = tamamen kapalı); sahne sonunda artar, sonrakinin başında azalır */
  function transitionState(project, sceneIndex, t) {
    var scene = project.scenes[sceneIndex], best = null;
    function consider(type, p, phase) { if (p > 0 && (!best || p > best.p)) best = { type: type, p: p, phase: phase }; }
    if (scene.transition && scene.transition.type !== "none" && sceneIndex < project.scenes.length - 1) {
      var d = scene.transition.duration;
      consider(scene.transition.type, M.clamp((t - (scene.duration - d)) / d, 0, 1), "out");
    }
    var prev = sceneIndex > 0 ? project.scenes[sceneIndex - 1] : null;
    if (prev && prev.transition && prev.transition.type !== "none") consider(prev.transition.type, M.clamp(1 - t / prev.transition.duration, 0, 1), "in");
    return best;
  }
  function transitionAlpha(project, sceneIndex, t) { var s = transitionState(project, sceneIndex, t); return s && s.type === "fade" ? s.p : 0; }
  function drawTransition(ctx, w, h, s) {
    if (!s || s.p <= 0) return;
    ctx.save(); ctx.fillStyle = "#000";
    if (s.type === "iris") {   // daire açılır / kapanır (klasik çizgi film)
      var maxR = Math.hypot(w, h) / 2, r = maxR * (1 - s.p);
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(w / 2, h / 2, Math.max(0, r), 0, Math.PI * 2, true); ctx.fill("evenodd");
    } else if (s.type === "wipe") {   // soldan sağa silme
      if (s.phase === "out") ctx.fillRect(0, 0, Math.ceil(w * s.p), h); else ctx.fillRect(Math.floor(w * (1 - s.p)), 0, Math.ceil(w * s.p) + 1, h);
    } else { ctx.globalAlpha = s.p; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  }

  /* opts: { forExport, onion, sceneIndex } */
  function drawScene(ctx, project, scene, t, opts) {
    opts = opts || {};
    var w = project.width, h = project.height;
    ctx.clearRect(0, 0, w, h);
    drawBackground(ctx, project, scene, !!opts.forExport);
    var cam = cameraOf(project, scene, t), i, L;
    function drawWithCam(layer, tt, alphaMul) {
      var c2 = camFor(cam, layer);
      ctx.save();
      if (c2) applyCam(ctx, c2);
      drawLayer(ctx, project, scene, layer, tt, alphaMul);
      ctx.restore();
    }
    if (opts.onion && !opts.forExport) {
      var step = 1 / project.fps;
      [t - step, t + step].forEach(function (tt) {
        if (tt < 0 || tt >= scene.duration) return;
        for (i = 0; i < scene.layers.length; i++) { L = scene.layers[i]; if (!L.hud && M.layerVisibleAt(L, tt, scene.duration)) drawWithCam(L, tt, 0.25); }
      });
    }
    for (i = 0; i < scene.layers.length; i++) {
      L = scene.layers[i];
      if (!L.hud && M.layerVisibleAt(L, t, scene.duration)) drawWithCam(L, t, 1);
    }
    // Renk tonu (gece mavisi, akşam sıcaklığı): ekran katmanları hariç; saydam arka planda uygulanmaz
    if (scene.grade && scene.grade.alpha > 0 && !(scene.background && scene.background.type === "transparent")) {
      ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = scene.grade.alpha; ctx.fillStyle = scene.grade.color; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    for (i = 0; i < scene.layers.length; i++) {   // ekran katmanları (alt yazı, sahne başlığı): kamera ve tondan etkilenmez
      L = scene.layers[i];
      if (L.hud && M.layerVisibleAt(L, t, scene.duration)) drawLayer(ctx, project, scene, L, t, 1);
    }
    if (opts.sceneIndex != null) drawTransition(ctx, w, h, transitionState(project, opts.sceneIndex, t));
  }

  /* Katman listesi için küçük resim */
  function thumbnail(project, layer, w, h) {
    var key = layer.type === "text" ? "txt:" + layer.text.content.slice(0, 30) + layer.text.color + layer.text.bubbleColor : layer.frames[0] + ":" + layer.frames.length;
    var hit = thumbCache.get(key);
    if (hit) return hit;
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var cx = c.getContext("2d");
    cx.fillStyle = "#0b0f17"; cx.fillRect(0, 0, w, h);
    if (layer.type === "text") {
      cx.fillStyle = layer.text.bubble ? layer.text.bubbleColor : "transparent";
      roundRect(cx, 6, 8, w - 12, h - 16, 8); cx.fill();
      cx.fillStyle = layer.text.color; cx.font = "700 " + Math.round(h * 0.42) + "px " + layer.text.font;
      cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(layer.text.content.slice(0, 8), w / 2, h / 2);
    } else {
      var e = getEntry(layer.frames[0]);
      if (!e) return null;
      var s = Math.min((w - 8) / e.w, (h - 8) / e.h), dw = e.w * s, dh = e.h * s;
      cx.drawImage(e.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      if (layer.frames.length > 1) {
        cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillRect(w - 26, h - 16, 26, 16);
        cx.fillStyle = "#fff"; cx.font = "700 10px system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillText("×" + layer.frames.length, w - 13, h - 8);
      }
    }
    var url = c.toDataURL();
    if (thumbCache.size > 300) thumbCache.clear();
    thumbCache.set(key, url);
    return url;
  }
  function invalidateThumbs() { thumbCache.clear(); }

  root.Render = {
    loadAsset: loadAsset, ensureAssets: ensureAssets, getEntry: getEntry, dropAsset: dropAsset,
    layerSize: layerSize, textLayout: textLayout, layerCtx: layerCtx, transformAt: transformAt,
    corners: corners, localPoint: localPoint, hitTest: hitTest, cameraOf: cameraOf, layerCamera: layerCamera, toView: toView, fromView: fromView, viewCorners: viewCorners, viewPoint: viewPoint,
    transitionState: transitionState,
    drawBackground: drawBackground, drawLayer: drawLayer, drawScene: drawScene, transitionAlpha: transitionAlpha,
    thumbnail: thumbnail, invalidateThumbs: invalidateThumbs, roundRect: roundRect
  };
})(window);
