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

  function hitTest(project, scene, t, px, py) {
    for (var i = scene.layers.length - 1; i >= 0; i--) {
      var L = scene.layers[i];
      if (L.locked || !M.layerVisibleAt(L, t, scene.duration)) continue;
      var size = layerSize(L, project), tr = transformAt(project, scene, L, t);
      if (tr.opacity <= 0.02) continue;
      var lp = localPoint(L, tr, size, px, py);
      if (!lp || lp.u < 0 || lp.u > 1 || lp.v < 0 || lp.v > 1) continue;
      if (L.type === "text") return L;
      var e = getEntry(L.frames[M.frameIndex(L, t)]);
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

  function drawText(ctx, layer, tr) {
    var t = layer.text, lay = textLayout(layer);
    var ox = -layer.anchor.x * lay.w, oy = -layer.anchor.y * lay.h;
    if (t.bubble) {
      ctx.fillStyle = t.bubbleColor;
      var r = Math.min(lay.h / 2, t.size * 0.8);
      roundRect(ctx, ox, oy, lay.w, lay.h, r);
      if (t.bubbleTail !== "none") {
        var tw = Math.min(lay.w * 0.3, t.size * 0.9), tx = t.bubbleTail === "left" ? ox + lay.w * 0.22 : ox + lay.w * 0.78;
        ctx.moveTo(tx - tw / 2, oy + lay.h - 1);
        ctx.lineTo(t.bubbleTail === "left" ? tx - tw * 0.9 : tx + tw * 0.9, oy + lay.h + t.size * 0.7);
        ctx.lineTo(tx + tw / 2, oy + lay.h - 1);
        ctx.closePath();
      }
      ctx.fill();
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
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.rot * DEG);
    ctx.scale(tr.sx * (layer.flipX ? -1 : 1), tr.sy * (layer.flipY ? -1 : 1));
    var ox = -layer.anchor.x * size.w, oy = -layer.anchor.y * size.h;
    if (layer.type === "text") {
      drawText(ctx, layer, tr);
    } else {
      var e = getEntry(layer.frames[M.frameIndex(layer, t)]);
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
  function transitionAlpha(project, sceneIndex, t) {
    var scene = project.scenes[sceneIndex], a = 0;
    if (scene.transition && scene.transition.type === "fade" && sceneIndex < project.scenes.length - 1) {
      var d = scene.transition.duration;
      a = Math.max(a, M.clamp((t - (scene.duration - d)) / d, 0, 1));
    }
    var prev = sceneIndex > 0 ? project.scenes[sceneIndex - 1] : null;
    if (prev && prev.transition && prev.transition.type === "fade") {
      a = Math.max(a, M.clamp(1 - t / prev.transition.duration, 0, 1));
    }
    return a;
  }

  /* opts: { forExport, onion, sceneIndex } */
  function drawScene(ctx, project, scene, t, opts) {
    opts = opts || {};
    var w = project.width, h = project.height;
    ctx.clearRect(0, 0, w, h);
    drawBackground(ctx, project, scene, !!opts.forExport);
    var i, L;
    if (opts.onion && !opts.forExport) {
      var step = 1 / project.fps;
      [t - step, t + step].forEach(function (tt) {
        if (tt < 0 || tt >= scene.duration) return;
        for (i = 0; i < scene.layers.length; i++) { L = scene.layers[i]; if (M.layerVisibleAt(L, tt, scene.duration)) drawLayer(ctx, project, scene, L, tt, 0.25); }
      });
    }
    for (i = 0; i < scene.layers.length; i++) {
      L = scene.layers[i];
      if (M.layerVisibleAt(L, t, scene.duration)) drawLayer(ctx, project, scene, L, t, 1);
    }
    if (opts.sceneIndex != null) {
      var a = transitionAlpha(project, opts.sceneIndex, t);
      if (a > 0) { ctx.fillStyle = "rgba(0,0,0," + a.toFixed(3) + ")"; ctx.fillRect(0, 0, w, h); }
    }
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
    corners: corners, localPoint: localPoint, hitTest: hitTest,
    drawBackground: drawBackground, drawLayer: drawLayer, drawScene: drawScene, transitionAlpha: transitionAlpha,
    thumbnail: thumbnail, invalidateThumbs: invalidateThumbs, roundRect: roundRect
  };
})(window);
