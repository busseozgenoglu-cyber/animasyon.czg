/* Canlandır — uygulama çekirdeği: durum, geçmiş (geri al), içe alma, oynatma, sahne tuvali ve gizmo, klavye, otomatik kayıt. */
(function (root) {
  "use strict";
  var M = root.Motion, R = root.Render, X = root.Exporter, Model = root.Model, UI = root.UI;
  function $(id) { return document.getElementById(id); }

  var S = {
    project: null, sceneIndex: 0, time: 0, playing: false, loop: true, playAll: false,
    sel: { layerId: null, keyTime: null },
    view: { scale: 1, fit: true, onion: false, grid: false },
    tl: { pxPerSec: 90 },
    hist: { undo: [], redo: [], last: null },
    dirty: true, drag: null, autosaveTimer: 0, playWall: 0, playT0: 0, pendingFrames: null
  };
  var App = { S: S };
  root.App = App;

  var stage = $("stage"), sctx = stage.getContext("2d");
  var overlay = $("overlay"), octx = overlay.getContext("2d");
  var viewport = $("viewport"), wrap = $("stageWrap"), audioEl = $("audioEl");

  /* ── Yardımcılar ─────────────────────────────────────────── */
  App.scene = function () { return S.project.scenes[S.sceneIndex]; };
  App.selLayer = function () { if (!S.sel.layerId) return null; return App.layerById(S.sel.layerId); };
  App.layerById = function (id) { var ls = App.scene().layers; for (var i = 0; i < ls.length; i++) if (ls[i].id === id) return ls[i]; return null; };
  App.frameDur = function () { return 1 / S.project.fps; };
  App.markDirty = function () { S.dirty = true; };
  App.globalTime = function () { return X.sceneOffset(S.project, S.sceneIndex) + S.time; };

  var toastTimer = 0;
  App.toast = function (msg, type) {
    var t = $("toast");
    t.textContent = msg; t.className = "toast" + (type ? " " + type : ""); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, type === "error" ? 5000 : 2600);
  };

  function hasContent(p) { return p.scenes.some(function (s) { return s.layers.length; }) || p.scenes.length > 1; }

  /* ── IndexedDB otomatik kayıt ───────────────────────────── */
  function idbOpen() {
    return new Promise(function (res, rej) {
      if (typeof indexedDB === "undefined") return rej(new Error("IndexedDB yok"));
      var req = indexedDB.open("canlandir", 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("kv"); };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("kv", "readonly"), rq = tx.objectStore("kv").get(key);
        rq.onsuccess = function () { res(rq.result); db.close(); };
        rq.onerror = function () { rej(rq.error); db.close(); };
      });
    });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(val, key);
        tx.oncomplete = function () { res(); db.close(); };
        tx.onerror = function () { rej(tx.error); db.close(); };
        tx.onabort = function () { rej(tx.error || new Error("abort")); db.close(); };
      });
    });
  }
  function idbDel(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete(key);
        tx.oncomplete = function () { res(); db.close(); };
        tx.onerror = function () { res(); db.close(); };
      });
    });
  }
  var autosaveWarned = false;
  function scheduleAutosave() {
    clearTimeout(S.autosaveTimer);
    S.autosaveTimer = setTimeout(function () {
      var p = S.project;
      var plain = { version: p.version, name: p.name, width: p.width, height: p.height, fps: p.fps, audio: p.audio, assets: p.assets, scenes: p.scenes, savedAt: Date.now() };
      idbSet("autosave", plain).catch(function () {
        if (!autosaveWarned) { autosaveWarned = true; App.toast("Otomatik kayıt yapılamadı (depolama dolu olabilir). Çalışmanızı “Kaydet” ile indirin.", "error"); }
      });
    }, 1500);
  }
  App.autosaveNow = scheduleAutosave;

  /* ── Geçmiş ──────────────────────────────────────────────── */
  function snapshot() {
    var p = S.project;
    return JSON.stringify({ name: p.name, width: p.width, height: p.height, fps: p.fps, scenes: p.scenes, sceneIndex: S.sceneIndex, sel: S.sel.layerId });
  }
  App.commit = function () {
    var s = snapshot();
    if (s === S.hist.last) return;
    if (S.hist.last) { S.hist.undo.push(S.hist.last); if (S.hist.undo.length > 80) S.hist.undo.shift(); }
    S.hist.last = s;
    S.hist.redo.length = 0;
    scheduleAutosave();
    UI.updateUndoButtons();
    UI.updateEmptyState();
  };
  function restore(s) {
    var o = JSON.parse(s), p = S.project;
    p.name = o.name; p.width = o.width; p.height = o.height; p.fps = o.fps; p.scenes = o.scenes;
    S.sceneIndex = Math.min(o.sceneIndex || 0, p.scenes.length - 1);
    S.sel = { layerId: App.layerById(o.sel) ? o.sel : null, keyTime: null };
    S.time = Math.min(S.time, Math.max(0, App.scene().duration - App.frameDur()));
    S.hist.last = s;
    if (S.playing) App.pause();
    R.invalidateThumbs();
    layoutStage(); UI.renderAll(); S.dirty = true;
    scheduleAutosave();
  }
  App.undo = function () { if (!S.hist.undo.length) return; S.hist.redo.push(S.hist.last); restore(S.hist.undo.pop()); };
  App.redo = function () { if (!S.hist.redo.length) return; S.hist.undo.push(S.hist.last); restore(S.hist.redo.pop()); };

  /* ── Proje yükleme ───────────────────────────────────────── */
  function loadProject(p) {
    S.project = p; S.sceneIndex = 0; S.time = 0; S.sel = { layerId: null, keyTime: null };
    if (S.playing) App.pause();
    S.hist = { undo: [], redo: [], last: null };
    return R.ensureAssets(p).then(function () {
      R.invalidateThumbs();
      setupAudio();
      layoutStage();
      UI.renderAll();
      S.hist.last = snapshot();
      UI.updateUndoButtons();
      S.dirty = true;
    });
  }
  App.newProject = function () {
    if (hasContent(S.project) && !confirm("Mevcut film silinip boş bir filme geçilecek. Kaydetmediyseniz geri alınamaz. Devam edilsin mi?")) return;
    var cur = S.project;
    loadProject(Model.newProject({ width: cur.width, height: cur.height, fps: cur.fps })).then(function () { idbDel("autosave"); App.toast("Yeni film açıldı"); });
  };
  App.loadDemo = function () {
    if (hasContent(S.project) && !confirm("Örnek film mevcut çalışmanın yerine açılacak. Devam edilsin mi?")) return;
    var cur = S.project;
    var p = Model.newProject({ width: cur.width, height: cur.height, fps: cur.fps });
    root.Demo.build(p);
    loadProject(p).then(function () { scheduleAutosave(); App.toast("Örnek film yüklendi — Boşluk ile oynatın", "ok"); });
  };
  App.openProjectFile = function (file) {
    return file.text().then(function (text) {
      var p = X.parseProject(text);
      return loadProject(p);
    }).then(function () { scheduleAutosave(); App.toast("Proje açıldı: " + S.project.name, "ok"); })
      .catch(function (err) { App.toast(err.message || "Proje açılamadı", "error"); });
  };
  App.saveProjectFile = function () {
    var json = X.projectToJson(S.project);
    X.download(new Blob([json], { type: "application/json" }), X.safeName(S.project.name) + ".canlandir.json");
    App.toast("Proje dosyası indirildi", "ok");
  };

  /* ── Film ayarları ───────────────────────────────────────── */
  App.setStageSize = function (w, h) {
    w = Math.round(Math.max(16, Math.min(4096, w)) / 2) * 2; h = Math.round(Math.max(16, Math.min(4096, h)) / 2) * 2;
    var p = S.project;
    if (w === p.width && h === p.height) { UI.renderFilmSettings(); return; }
    var kx = w / p.width, ky = h / p.height, k = Math.min(kx, ky);
    // katmanlar yeni sahneye orantılı taşınır ki görsel düzen bozulmasın
    p.scenes.forEach(function (sc) {
      sc.layers.forEach(function (L) {
        L.base.x *= kx; L.base.y *= ky; L.base.sx *= k; L.base.sy *= k;
        L.tracks.x.forEach(function (key) { key.v *= kx; }); L.tracks.y.forEach(function (key) { key.v *= ky; });
        L.tracks.sx.forEach(function (key) { key.v *= k; }); L.tracks.sy.forEach(function (key) { key.v *= k; });
      });
    });
    p.width = w; p.height = h;
    App.commit(); layoutStage(); UI.renderAll();
  };
  App.setFps = function (fps) {
    fps = Math.max(1, Math.min(60, fps | 0));
    S.project.fps = fps;
    S.time = M.quantizeTime(S.time, fps);
    App.commit(); UI.renderAll();
  };

  function setupAudio() {
    var a = S.project.audio;
    if (a) { audioEl.src = a.dataUrl; audioEl.volume = a.volume == null ? 1 : a.volume; } else { audioEl.removeAttribute("src"); try { audioEl.load(); } catch (e) { /* yoksay */ } }
  }
  App.setAudioFile = function (file) {
    if (file.size > 25 * 1024 * 1024) { App.toast("Ses dosyası 25 MB'tan küçük olmalı", "error"); return Promise.resolve(); }
    return readAsDataUrl(file).then(function (url) {
      S.project.audio = { name: file.name, dataUrl: url, volume: 1 };
      setupAudio(); UI.renderFilmSettings(); scheduleAutosave();
      App.toast("Ses eklendi: " + file.name + " — WebM ve MP4 dışa aktarımına dahil edilir", "ok");
    });
  };
  App.removeAudio = function () { S.project.audio = null; setupAudio(); UI.renderFilmSettings(); scheduleAutosave(); };
  App.setAudioVolume = function (v) { if (S.project.audio) { S.project.audio.volume = v; audioEl.volume = v; scheduleAutosave(); } };

  /* ── Görsel içe alma ─────────────────────────────────────── */
  function readAsDataUrl(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error || new Error("Dosya okunamadı")); };
      fr.readAsDataURL(file);
    });
  }
  function loadImage(url) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error("Görsel açılamadı")); };
      img.src = url;
    });
  }
  var MAX_SIDE = 2048;
  function readImageAsset(file) {
    return readAsDataUrl(file).then(function (url) {
      return loadImage(url).then(function (img) {
        var w = img.naturalWidth || img.width || 1024, h = img.naturalHeight || img.height || 1024;
        var type = (file.type || "").toLowerCase(), name = file.name || "görsel";
        var isSvg = type.indexOf("svg") >= 0 || /\.svg$/i.test(name);
        var isGif = type.indexOf("gif") >= 0 || /\.gif$/i.test(name);
        var isJpeg = type.indexOf("jpeg") >= 0 || type.indexOf("jpg") >= 0 || /\.jpe?g$/i.test(name);
        var needsRaster = isSvg || isGif || Math.max(w, h) > MAX_SIDE || (!isJpeg && type !== "image/png" && type !== "image/webp");
        if (!needsRaster) return { id: M.uid("as"), name: name, dataUrl: url, width: w, height: h };
        var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        if (isSvg && Math.max(w, h) < 800) scale = 1024 / Math.max(w, h);   // küçük SVG'ler keskin kalsın
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var out = isJpeg ? c.toDataURL("image/jpeg", 0.92) : c.toDataURL("image/png");
        return { id: M.uid("as"), name: name, dataUrl: out, width: c.width, height: c.height };
      });
    });
  }
  App.readImageAsset = readImageAsset;

  function naturalCompare(a, b) { return a.name.localeCompare(b.name, "tr", { numeric: true, sensitivity: "base" }); }
  function baseName(n) { return String(n || "Görsel").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "Görsel"; }

  function placeLayer(L, cascade) {
    var p = S.project, size = R.layerSize(L, p);
    var s = Math.min(1, (0.6 * p.height) / size.h, (0.6 * p.width) / size.w);
    L.base.x = Math.round(p.width / 2 + (cascade || 0) * 28);
    L.base.y = Math.round(p.height / 2 + (cascade || 0) * 28);
    L.base.sx = s; L.base.sy = s;
  }

  /* files: FileList/dizi. opts.asSequence: hepsi tek kare dizisi olur */
  App.importFiles = function (files, opts) {
    opts = opts || {};
    var list = Array.prototype.slice.call(files || []);
    var projects = list.filter(function (f) { return /\.json$/i.test(f.name); });
    if (projects.length) return App.openProjectFile(projects[0]);
    var audios = list.filter(function (f) { return (f.type || "").indexOf("audio/") === 0; });
    var images = list.filter(function (f) { return (f.type || "").indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(f.name); });
    var chain = Promise.resolve();
    if (audios.length) chain = chain.then(function () { return App.setAudioFile(audios[0]); });
    if (!images.length) {
      if (!audios.length && list.length) App.toast("Desteklenen bir görsel bulunamadı (PNG, JPG, WebP, GIF, SVG)", "error");
      return chain;
    }
    images.sort(naturalCompare);
    App.toast(images.length > 1 ? images.length + " görsel yükleniyor…" : "Görsel yükleniyor…");
    var assets = [], failed = 0;
    images.forEach(function (f) {
      chain = chain.then(function () { return readImageAsset(f).then(function (a) { assets.push(a); }).catch(function () { failed++; }); });
    });
    return chain.then(function () {
      if (!assets.length) { App.toast("Görseller okunamadı", "error"); return; }
      assets.forEach(function (a) { S.project.assets[a.id] = a; });
      return R.ensureAssets(S.project).then(function () {
        var sc = App.scene(), added = [];
        if (opts.asSequence && assets.length > 1) {
          var L = Model.newLayer("sequence", { name: baseName(assets[0].name).replace(/[-_ ]?\d+$/, "") || "Kare dizisi", frames: assets.map(function (a) { return a.id; }), frameFps: 6 });
          L.inPoint = opts.atPlayhead ? S.time : 0;
          placeLayer(L, 0); sc.layers.push(L); added.push(L);
        } else {
          assets.forEach(function (a, i) {
            var L2 = Model.newLayer("image", { name: baseName(a.name), frames: [a.id] });
            L2.inPoint = opts.atPlayhead ? S.time : 0;
            placeLayer(L2, Math.min(i, 6)); sc.layers.push(L2); added.push(L2);
          });
        }
        if (opts.position && added.length === 1) { added[0].base.x = Math.round(opts.position.x); added[0].base.y = Math.round(opts.position.y); }
        App.commit();
        App.selectLayer(added[added.length - 1].id);
        UI.renderAll();
        App.toast((failed ? failed + " dosya okunamadı. " : "") + (opts.asSequence && added.length === 1 && assets.length > 1 ? assets.length + " kareli dizi eklendi" : added.length + " katman eklendi"), failed ? "error" : "ok");
      });
    });
  };

  App.addTextLayer = function () {
    var p = S.project, L = Model.newLayer("text", { name: "Metin" });
    L.text.size = Math.round(Math.max(24, Math.min(120, p.height / 13)));
    L.text.maxWidth = Math.round(p.width * 0.45);
    L.base.x = Math.round(p.width / 2); L.base.y = Math.round(p.height * 0.3);
    App.scene().layers.push(L);
    App.commit(); App.selectLayer(L.id); UI.renderAll();
    setTimeout(UI.focusText, 50);
  };

  /* Kare ekleme/değiştirme: UI bir dosya seçtirir, seçim sonrası burası çalışır */
  App.pickFrames = function (L, mode) { S.pendingFrames = { layerId: L.id, mode: mode }; $("fileFrames").value = ""; $("fileFrames").click(); };
  App.pickBgImage = function () { $("fileBgImage").value = ""; $("fileBgImage").click(); };
  function applyFrames(files) {
    var pend = S.pendingFrames; S.pendingFrames = null;
    if (!pend) return;
    var L = App.layerById(pend.layerId);
    if (!L) return;
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return (f.type || "").indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name); });
    if (!list.length) return;
    list.sort(naturalCompare);
    var assets = [], chain = Promise.resolve();
    list.forEach(function (f) { chain = chain.then(function () { return readImageAsset(f).then(function (a) { assets.push(a); }).catch(function () { /* atla */ }); }); });
    chain.then(function () {
      if (!assets.length) { App.toast("Görsel okunamadı", "error"); return; }
      assets.forEach(function (a) { S.project.assets[a.id] = a; });
      return R.ensureAssets(S.project).then(function () {
        if (pend.mode === "replace") {
          var oldSize = R.layerSize(L, S.project);
          L.frames = assets.map(function (a) { return a.id; });
          var newSize = R.layerSize(L, S.project);   // görünen boyut korunur
          var k = oldSize.w / newSize.w;
          L.base.sx *= k; L.base.sy *= k;
          L.tracks.sx.forEach(function (key) { key.v *= k; }); L.tracks.sy.forEach(function (key) { key.v *= k; });
        } else {
          L.frames = L.frames.concat(assets.map(function (a) { return a.id; }));
        }
        if (L.frames.length > 1 && L.type === "image") L.type = "sequence";
        R.invalidateThumbs();
        App.commit(); UI.renderAll(); S.dirty = true;
        App.toast(assets.length + " kare " + (pend.mode === "replace" ? "yerleştirildi" : "eklendi"), "ok");
      });
    });
  }
  App.removeFrame = function (L, idx) {
    if (L.frames.length <= 1) return;
    L.frames.splice(idx, 1);
    if (L.frames.length === 1) L.type = "image";
    R.invalidateThumbs();
    App.commit(); UI.renderAll(); S.dirty = true;
  };

  /* ── Katman işlemleri ────────────────────────────────────── */
  App.selectLayer = function (id) {
    S.sel.layerId = id && App.layerById(id) ? id : null; S.sel.keyTime = null;
    UI.pickerOpen = false;
    UI.renderLayers(); UI.renderProps(); UI.renderTimeline(); S.dirty = true;
  };
  App.selectKey = function (layerId, t) {
    S.sel.layerId = layerId; S.sel.keyTime = t;
    App.setTime(t);
    UI.renderLayers(); UI.renderProps(); UI.renderTimeline(); S.dirty = true;
  };
  App.deleteLayer = function (id) {
    var ls = App.scene().layers, i = ls.findIndex(function (l) { return l.id === id; });
    if (i < 0) return;
    ls.splice(i, 1);
    if (S.sel.layerId === id) S.sel = { layerId: null, keyTime: null };
    App.commit(); UI.renderAll(); S.dirty = true;
  };
  App.duplicateLayer = function (id) {
    var ls = App.scene().layers, i = ls.findIndex(function (l) { return l.id === id; });
    if (i < 0) return;
    var c = Model.cloneLayer(ls[i]);
    c.base.x += 24; c.base.y += 24;
    ls.splice(i + 1, 0, c);
    App.commit(); App.selectLayer(c.id); UI.renderAll();
  };
  App.moveLayer = function (id, dir) {
    var ls = App.scene().layers, i = ls.findIndex(function (l) { return l.id === id; }), j = i + dir;
    if (i < 0 || j < 0 || j >= ls.length) return;
    var tmp = ls[i]; ls[i] = ls[j]; ls[j] = tmp;
    App.commit(); UI.renderLayers(); UI.renderTimeline(); S.dirty = true;
  };
  App.reorderLayer = function (from, to) {
    var ls = App.scene().layers;
    if (from < 0 || from >= ls.length || to < 0 || to >= ls.length || from === to) return;
    var item = ls.splice(from, 1)[0];
    ls.splice(to, 0, item);
    App.commit(); UI.renderLayers(); UI.renderTimeline(); S.dirty = true;
  };

  /* Düzenleme değeri: anahtar kare varsa o anki enterpolasyon, yoksa temel değer (efektler hariç) */
  App.editValue = function (L, prop) {
    var tr = L.tracks[prop];
    return tr && tr.length ? M.trackValue(tr, S.time, L.base[prop]) : L.base[prop];
  };
  /* Değer yaz: izde anahtar kare varsa oynatma kafasına anahtar yazar (yeni anahtar oluştuysa true döner) */
  App.setLayerProp = function (L, prop, v) {
    if (!Number.isFinite(v)) return false;
    var tr = L.tracks[prop];
    if (tr && tr.length) { var created = !M.hasKey(tr, S.time); M.setKey(tr, S.time, v); return created; }
    L.base[prop] = v;
    return false;
  };
  App.toggleKeyAt = function (L, t) {
    var has = M.keyTimes(L).some(function (k) { return Math.abs(k - t) < 1e-4; });
    var props = ["x", "y", "rot", "sx", "sy", "opacity"];
    if (has) {
      props.forEach(function (pr) { M.removeKey(L.tracks[pr], t); });
      // tek anahtar kalan izler sabit değere döner
      props.forEach(function (pr) { if (L.tracks[pr].length === 1) { L.base[pr] = L.tracks[pr][0].v; L.tracks[pr] = []; } });
      S.sel.keyTime = null;
    } else {
      props.forEach(function (pr) { var v = App.editValue(L, pr); M.setKey(L.tracks[pr], t, v); });
      S.sel.keyTime = t;
    }
    App.commit(); UI.renderProps(); UI.renderTimeline(); S.dirty = true;
  };
  App.removeKeysAt = function (L, t) {
    ["x", "y", "rot", "sx", "sy", "opacity"].forEach(function (pr) { M.removeKey(L.tracks[pr], t); if (L.tracks[pr].length === 1) { L.base[pr] = L.tracks[pr][0].v; L.tracks[pr] = []; } });
    S.sel.keyTime = null;
    App.commit(); UI.renderProps(); UI.renderTimeline(); S.dirty = true;
  };
  App.clearKeys = function (L) {
    ["x", "y", "rot", "sx", "sy", "opacity"].forEach(function (pr) { L.base[pr] = App.editValue(L, pr); L.tracks[pr] = []; });
    S.sel.keyTime = null;
    App.commit(); UI.renderProps(); UI.renderTimeline(); S.dirty = true;
  };
  App.setKeyEase = function (L, t, ease) {
    Object.keys(L.tracks).forEach(function (pr) { var i = M.findKey(L.tracks[pr], t); if (i >= 0) L.tracks[pr][i].e = ease; });
    App.commit(); S.dirty = true;
  };
  App.addEffect = function (L, type) {
    var eff = M.createEffect(type, App.scene().duration, L);
    L.effects.push(eff);
    App.commit(); UI.renderTimeline(); S.dirty = true;
    return eff;
  };
  App.removeEffect = function (L, id) {
    L.effects = L.effects.filter(function (e) { return e.id !== id; });
    App.commit(); UI.renderProps(); UI.renderTimeline(); S.dirty = true;
  };
  App.setInOut = function (L, inP, outP) {
    var sc = App.scene(), fps = S.project.fps, fd = 1 / fps;
    inP = Math.max(0, M.quantizeTime(inP || 0, fps));
    if (outP != null) { outP = M.quantizeTime(outP, fps); if (outP >= sc.duration - 1e-6) outP = null; }
    var end = outP == null ? sc.duration : outP;
    if (inP > end - fd) inP = Math.max(0, end - fd);
    L.inPoint = inP; L.outPoint = outP;
    App.commit(); UI.renderProps(); UI.renderTimeline(); S.dirty = true;
  };
  App.shiftLayerTime = function (L, dt) {
    if (L.inPoint + dt < 0) dt = -L.inPoint;
    if (!dt) return;
    L.inPoint += dt;
    if (L.outPoint != null) L.outPoint += dt;
    Object.keys(L.tracks).forEach(function (pr) { L.tracks[pr].forEach(function (k) { k.t = Math.max(0, k.t + dt); }); });
    L.effects.forEach(function (e) { e.start = Math.max(0, (e.start || 0) + dt); if (e.end != null) e.end = Math.max(e.start, e.end + dt); });
  };
  App.restoreLayerFrom = function (L, snap) {
    L.inPoint = snap.inPoint; L.outPoint = snap.outPoint;
    L.tracks = Model.deepClone(snap.tracks); L.effects = Model.deepClone(snap.effects);
  };
  /* Dayanak noktasını değiştirir; katman yerinde kalır */
  App.setAnchor = function (L, ax, ay) {
    var size = R.layerSize(L, S.project);
    var tr = { x: App.editValue(L, "x"), y: App.editValue(L, "y"), rot: App.editValue(L, "rot"), sx: App.editValue(L, "sx"), sy: App.editValue(L, "sy") };
    var dx = (ax - L.anchor.x) * size.w, dy = (ay - L.anchor.y) * size.h;
    var fx = L.flipX ? -1 : 1, fy = L.flipY ? -1 : 1;
    var c = Math.cos(tr.rot * Math.PI / 180), s = Math.sin(tr.rot * Math.PI / 180);
    var wx = c * tr.sx * fx * dx - s * tr.sy * fy * dy, wy = s * tr.sx * fx * dx + c * tr.sy * fy * dy;
    App.setLayerProp(L, "x", tr.x + wx); App.setLayerProp(L, "y", tr.y + wy);
    L.anchor = { x: ax, y: ay };
  };
  App.nudge = function (dx, dy) {
    var L = App.selLayer(); if (!L || L.locked) return;
    App.setLayerProp(L, "x", App.editValue(L, "x") + dx); App.setLayerProp(L, "y", App.editValue(L, "y") + dy);
    App.commit(); UI.syncProps(); UI.renderTimeline(); S.dirty = true;
  };

  /* ── Sahneler ────────────────────────────────────────────── */
  App.switchScene = function (i, keepTime) {
    if (i < 0 || i >= S.project.scenes.length) return;
    S.sceneIndex = i;
    if (!keepTime) S.time = 0;
    S.sel = { layerId: null, keyTime: null };
    UI.renderAll(); S.dirty = true;
  };
  App.addScene = function () {
    var p = S.project, prev = App.scene();
    var sc = Model.newScene("Sahne " + (p.scenes.length + 1), prev.duration);
    sc.background = Model.deepClone(prev.background);
    p.scenes.splice(S.sceneIndex + 1, 0, sc);
    App.commit(); App.switchScene(S.sceneIndex + 1);
    App.toast("Yeni sahne eklendi");
  };
  App.duplicateScene = function () {
    var p = S.project, c = Model.cloneScene(App.scene());
    p.scenes.splice(S.sceneIndex + 1, 0, c);
    App.commit(); App.switchScene(S.sceneIndex + 1);
  };
  App.deleteScene = function () {
    var p = S.project;
    if (p.scenes.length <= 1) return;
    if (App.scene().layers.length && !confirm("“" + App.scene().name + "” silinsin mi? (Geri al ile kurtarabilirsiniz)")) return;
    p.scenes.splice(S.sceneIndex, 1);
    App.commit(); App.switchScene(Math.min(S.sceneIndex, p.scenes.length - 1));
  };
  App.moveScene = function (dir) {
    var p = S.project, i = S.sceneIndex, j = i + dir;
    if (j < 0 || j >= p.scenes.length) return;
    var tmp = p.scenes[i]; p.scenes[i] = p.scenes[j]; p.scenes[j] = tmp;
    App.commit(); App.switchScene(j, true);
  };
  App.setSceneDuration = function (d) {
    var fps = S.project.fps;
    d = Math.max(0.5, Math.min(600, Math.round(d * fps) / fps));
    App.scene().duration = d;
    if (S.time > d - 1 / fps) S.time = Math.max(0, d - 1 / fps);
    App.commit(); UI.renderAll(); S.dirty = true;
  };

  /* ── Zaman ve oynatma ────────────────────────────────────── */
  App.setTime = function (t) {
    var sc = App.scene(), fps = S.project.fps;
    t = M.quantizeTime(Math.max(0, Math.min(sc.duration - 1 / fps, t)), fps);
    if (t < 0) t = 0;
    S.time = t;
    if (S.playing) { S.playT0 = t; S.playWall = performance.now(); syncAudio(); }
    if (S.sel.keyTime != null && Math.abs(S.sel.keyTime - t) > 1e-4) { S.sel.keyTime = null; UI.renderTimeline(); }
    S.dirty = true;
    UI.updatePlayhead(); UI.updateTimeLabel(); UI.syncProps();
  };
  App.stepFrame = function (n) { if (S.playing) App.pause(); App.setTime(S.time + n / S.project.fps); };
  function syncAudio() {
    if (!S.project.audio) return;
    try { audioEl.currentTime = App.globalTime(); } catch (e) { /* yoksay */ }
  }
  App.play = function () {
    if (S.playing) return;
    var sc = App.scene();
    if (S.time >= sc.duration - 1 / S.project.fps - 1e-6 && !(S.playAll && S.sceneIndex < S.project.scenes.length - 1)) S.time = 0;
    S.playing = true; S.playT0 = S.time; S.playWall = performance.now();
    if (S.project.audio) { syncAudio(); audioEl.play().catch(function () { /* otomatik oynatma engeli */ }); }
    UI.updateToggles();
  };
  App.pause = function () {
    if (!S.playing) return;
    S.playing = false;
    audioEl.pause();
    UI.updateToggles(); UI.syncProps(); UI.updatePlayhead();
  };
  App.togglePlay = function () { if (S.playing) App.pause(); else App.play(); };

  function tick(now) {
    if (S.playing) {
      var sc = App.scene(), fps = S.project.fps, fd = 1 / fps;
      var t = S.playT0 + (now - S.playWall) / 1000;
      if (t >= sc.duration) {
        var n = S.project.scenes.length;
        if (S.playAll && S.sceneIndex < n - 1) {
          S.playT0 = t - sc.duration; S.playWall = now; App.switchScene(S.sceneIndex + 1, true); t = S.playT0;
        } else if (S.playAll && S.loop && n > 1) {
          S.playT0 = t - sc.duration; S.playWall = now; App.switchScene(0, true); t = S.playT0; syncAudio();
        } else if (S.loop) {
          S.playT0 = (t - sc.duration) % sc.duration; S.playWall = now; t = S.playT0; syncAudio();
        } else {
          S.time = Math.max(0, sc.duration - fd); App.pause(); t = S.time;
        }
      }
      S.time = M.quantizeTime(Math.min(t, App.scene().duration - fd), fps);
      if (S.time < 0) S.time = 0;
      UI.updatePlayhead(); UI.updateTimeLabel();
      S.dirty = true;
    }
    if (S.dirty) { draw(); S.dirty = false; }
    requestAnimationFrame(tick);
  }

  /* ── Sahne tuvali ────────────────────────────────────────── */
  function layoutStage() {
    var p = S.project;
    if (!p) return;   // proje yüklenmeden gelen yeniden boyutlanma olayları
    if (stage.width !== p.width) stage.width = p.width;
    if (stage.height !== p.height) stage.height = p.height;
    var vw = viewport.clientWidth - 40, vh = viewport.clientHeight - 40;
    if (S.view.fit && vw > 20 && vh > 20) S.view.scale = Math.max(0.02, Math.min(vw / p.width, vh / p.height));
    var cw = Math.max(1, Math.round(p.width * S.view.scale)), ch = Math.max(1, Math.round(p.height * S.view.scale));
    stage.style.width = cw + "px"; stage.style.height = ch + "px";
    wrap.style.width = cw + "px"; wrap.style.height = ch + "px";
    var dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(cw * dpr); overlay.height = Math.round(ch * dpr);
    overlay.style.width = cw + "px"; overlay.style.height = ch + "px";
    $("zoomLabel").textContent = Math.round(S.view.scale * 100) + "%";
    S.dirty = true;
  }
  App.layoutStage = layoutStage;
  App.zoom = function (factor) {
    S.view.fit = false;
    S.view.scale = Math.max(0.05, Math.min(8, S.view.scale * factor));
    layoutStage();
  };
  App.zoomFit = function () { S.view.fit = true; layoutStage(); };

  function draw() {
    var p = S.project, sc = App.scene();
    R.drawScene(sctx, p, sc, S.time, { onion: S.view.onion && !S.playing, sceneIndex: S.sceneIndex });
    drawOverlay();
  }

  var HANDLE = 7;
  function gizmo(L) {
    var p = S.project, sc = App.scene(), k = S.view.scale;
    var tr = R.transformAt(p, sc, L, S.time), size = R.layerSize(L, p);
    var c = R.corners(L, tr, size).map(function (pt) { return { x: pt.x * k, y: pt.y * k }; });
    var mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    var edges = [mid(c[0], c[1]), mid(c[1], c[2]), mid(c[2], c[3]), mid(c[3], c[0])];
    var top = edges[0], center = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 };
    var nx = top.x - center.x, ny = top.y - center.y, len = Math.hypot(nx, ny) || 1;
    var rot = { x: top.x + nx / len * 26, y: top.y + ny / len * 26 };
    return { corners: c, edges: edges, rot: rot, top: top, anchor: { x: tr.x * k, y: tr.y * k }, tr: tr, size: size };
  }
  function hitHandle(g, pt) {
    var r = HANDLE + 4;
    if (Math.hypot(pt.x - g.rot.x, pt.y - g.rot.y) <= r + 2) return { type: "rotate" };
    for (var i = 0; i < 4; i++) if (Math.abs(pt.x - g.corners[i].x) <= r && Math.abs(pt.y - g.corners[i].y) <= r) return { type: "scale", idx: i };
    for (var j = 0; j < 4; j++) if (Math.abs(pt.x - g.edges[j].x) <= r && Math.abs(pt.y - g.edges[j].y) <= r) return { type: "scale", idx: 4 + j };
    return null;
  }
  function drawOverlay() {
    var dpr = window.devicePixelRatio || 1, W = overlay.width / dpr, H = overlay.height / dpr;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);
    if (S.view.grid) {
      octx.strokeStyle = "rgba(0,245,255,.25)"; octx.lineWidth = 1; octx.setLineDash([4, 4]);
      octx.beginPath();
      [1 / 3, 2 / 3].forEach(function (f) { octx.moveTo(Math.round(W * f) + .5, 0); octx.lineTo(Math.round(W * f) + .5, H); octx.moveTo(0, Math.round(H * f) + .5); octx.lineTo(W, Math.round(H * f) + .5); });
      octx.stroke(); octx.setLineDash([]);
      octx.strokeStyle = "rgba(255,255,255,.18)"; octx.beginPath(); octx.moveTo(W / 2, 0); octx.lineTo(W / 2, H); octx.moveTo(0, H / 2); octx.lineTo(W, H / 2); octx.stroke();
    }
    var L = App.selLayer();
    if (!L || !M.layerVisibleAt(L, S.time, App.scene().duration)) return;
    var g = gizmo(L), c = g.corners;
    octx.lineWidth = 1.5; octx.strokeStyle = L.locked ? "rgba(255,255,255,.45)" : "#00f5ff";
    octx.beginPath(); octx.moveTo(c[0].x, c[0].y); for (var i = 1; i < 4; i++) octx.lineTo(c[i].x, c[i].y); octx.closePath(); octx.stroke();
    if (L.locked) return;
    octx.fillStyle = "#0b0f17";
    function box(pt) { octx.beginPath(); octx.rect(pt.x - HANDLE / 2, pt.y - HANDLE / 2, HANDLE, HANDLE); octx.fill(); octx.stroke(); }
    c.forEach(box); g.edges.forEach(box);
    octx.beginPath(); octx.moveTo(g.top.x, g.top.y); octx.lineTo(g.rot.x, g.rot.y); octx.stroke();
    octx.beginPath(); octx.arc(g.rot.x, g.rot.y, HANDLE / 2 + 1, 0, Math.PI * 2); octx.fill(); octx.stroke();
    // dayanak noktası
    octx.strokeStyle = "#ff5c7a"; octx.beginPath(); octx.arc(g.anchor.x, g.anchor.y, 5, 0, Math.PI * 2); octx.stroke();
    octx.beginPath(); octx.moveTo(g.anchor.x - 8, g.anchor.y); octx.lineTo(g.anchor.x + 8, g.anchor.y); octx.moveTo(g.anchor.x, g.anchor.y - 8); octx.lineTo(g.anchor.x, g.anchor.y + 8); octx.stroke();
  }

  function cssPoint(ev) { var r = overlay.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function editTransform(L) { return { x: App.editValue(L, "x"), y: App.editValue(L, "y"), rot: App.editValue(L, "rot"), sx: App.editValue(L, "sx"), sy: App.editValue(L, "sy") }; }

  function bindStage() {
    overlay.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      var css = cssPoint(ev), k = S.view.scale, pt = { x: css.x / k, y: css.y / k };
      var L = App.selLayer(), handle = null;
      if (L && !L.locked && M.layerVisibleAt(L, S.time, App.scene().duration)) handle = hitHandle(gizmo(L), css);
      var mode;
      if (handle) mode = handle.type;
      else {
        var hit = R.hitTest(S.project, App.scene(), S.time, pt.x, pt.y);
        if (hit) { if (hit.id !== S.sel.layerId) App.selectLayer(hit.id); mode = "move"; L = hit; }
        else mode = "empty";
      }
      if (S.playing && mode !== "empty") App.pause();
      var g = (mode !== "empty") ? gizmo(L) : null;
      S.drag = { mode: mode, handle: handle, layer: L, start: pt, startCss: css, tr0: L ? editTransform(L) : null, g0: g, moved: false,
        ang0: g ? Math.atan2(css.y - g.anchor.y, css.x - g.anchor.x) : 0 };
      overlay.setPointerCapture(ev.pointerId);
      overlay.classList.add("grabbing");
      ev.preventDefault();
    });
    overlay.addEventListener("pointermove", function (ev) {
      var css = cssPoint(ev), k = S.view.scale;
      if (!S.drag) {
        var L = App.selLayer(), cur = "default";
        if (L && !L.locked && M.layerVisibleAt(L, S.time, App.scene().duration)) {
          var hh = hitHandle(gizmo(L), css);
          if (hh) cur = hh.type === "rotate" ? "grab" : (hh.idx === 4 || hh.idx === 6) ? "ns-resize" : (hh.idx === 5 || hh.idx === 7) ? "ew-resize" : (hh.idx === 0 || hh.idx === 2) ? "nwse-resize" : "nesw-resize";
        }
        if (cur === "default" && R.hitTest(S.project, App.scene(), S.time, css.x / k, css.y / k)) cur = "move";
        overlay.style.cursor = cur;
        return;
      }
      var d = S.drag;
      if (!d.moved && Math.hypot(css.x - d.startCss.x, css.y - d.startCss.y) < 3) return;
      d.moved = true;
      if (d.mode === "empty" || !d.layer || d.layer.locked) return;
      var L2 = d.layer, pt = { x: css.x / k, y: css.y / k }, t0 = d.tr0;
      if (d.mode === "move") {
        var dx = pt.x - d.start.x, dy = pt.y - d.start.y;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        App.setLayerProp(L2, "x", t0.x + dx); App.setLayerProp(L2, "y", t0.y + dy);
      } else if (d.mode === "rotate") {
        var ang = Math.atan2(css.y - d.g0.anchor.y, css.x - d.g0.anchor.x);
        var rot = t0.rot + (ang - d.ang0) * 180 / Math.PI;
        if (ev.shiftKey) rot = Math.round(rot / 15) * 15;
        App.setLayerProp(L2, "rot", ((rot + 180) % 360 + 360) % 360 - 180);
      } else if (d.mode === "scale") {
        var a = d.g0.anchor, th = -d.g0.tr.rot * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
        var v0 = { x: d.startCss.x - a.x, y: d.startCss.y - a.y }, v1 = { x: css.x - a.x, y: css.y - a.y };
        var l0 = { x: c * v0.x - s * v0.y, y: s * v0.x + c * v0.y }, l1 = { x: c * v1.x - s * v1.y, y: s * v1.x + c * v1.y };
        var idx = d.handle.idx, fx = 1, fy = 1;
        if (idx < 4) {
          if (ev.shiftKey) { fx = Math.abs(l0.x) > 2 ? l1.x / l0.x : 1; fy = Math.abs(l0.y) > 2 ? l1.y / l0.y : 1; }
          else { var dot = (l1.x * l0.x + l1.y * l0.y), nn = (l0.x * l0.x + l0.y * l0.y) || 1; fx = fy = dot / nn; }
        } else if (idx === 4 || idx === 6) fy = Math.abs(l0.y) > 2 ? l1.y / l0.y : 1;
        else fx = Math.abs(l0.x) > 2 ? l1.x / l0.x : 1;
        fx = Math.max(0.02, fx); fy = Math.max(0.02, fy);
        App.setLayerProp(L2, "sx", t0.sx * fx); App.setLayerProp(L2, "sy", t0.sy * fy);
      }
      S.dirty = true; UI.syncProps();
    });
    function up(ev) {
      var d = S.drag; if (!d) return;
      S.drag = null; overlay.classList.remove("grabbing");
      try { overlay.releasePointerCapture(ev.pointerId); } catch (e) { /* yoksay */ }
      if (d.mode === "empty") { if (!d.moved) App.selectLayer(null); return; }
      if (d.moved) { App.commit(); UI.renderTimeline(); UI.syncProps(); }
    }
    overlay.addEventListener("pointerup", up);
    overlay.addEventListener("pointercancel", up);
    overlay.addEventListener("dblclick", function () { var L = App.selLayer(); if (L && L.type === "text") { UI.focusText(); if (window.innerWidth <= 900) { $("app").setAttribute("data-panel", "props"); } } });
    overlay.addEventListener("wheel", function (ev) { if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); App.zoom(ev.deltaY < 0 ? 1.1 : 1 / 1.1); } }, { passive: false });

    if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { if (S.view.fit) layoutStage(); else S.dirty = true; }).observe(viewport);
    window.addEventListener("resize", function () { layoutStage(); UI.renderTimeline(); });

    $("btnZoomIn").addEventListener("click", function () { App.zoom(1.25); });
    $("btnZoomOut").addEventListener("click", function () { App.zoom(0.8); });
    $("btnZoomFit").addEventListener("click", App.zoomFit);
    $("btnOnion").addEventListener("click", function () { S.view.onion = !S.view.onion; UI.updateToggles(); S.dirty = true; });
    $("btnGrid").addEventListener("click", function () { S.view.grid = !S.view.grid; UI.updateToggles(); S.dirty = true; });
    $("btnFramePng").addEventListener("click", function () {
      X.exportFramePng(S.project, App.globalTime(), 1).then(function (b) { X.download(b, "canlandir-" + X.safeName(S.project.name) + "-kare" + (Math.round(S.time * S.project.fps) + 1) + ".png"); App.toast("Kare PNG indirildi", "ok"); })
        .catch(function (e) { App.toast(e.message, "error"); });
    });
  }

  /* ── Sürükle-bırak ve yapıştır ───────────────────────────── */
  function bindDropPaste() {
    var hint = $("dropHint"), depth = 0;
    document.addEventListener("dragenter", function (ev) { if (hasFiles(ev)) { depth++; hint.hidden = false; viewport.classList.add("dragover"); } });
    document.addEventListener("dragleave", function () { if (depth > 0) depth--; if (depth === 0) { hint.hidden = true; viewport.classList.remove("dragover"); } });
    document.addEventListener("dragover", function (ev) { if (hasFiles(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; } });
    document.addEventListener("drop", function (ev) {
      if (!hasFiles(ev)) return;
      ev.preventDefault(); depth = 0; hint.hidden = true; viewport.classList.remove("dragover");
      var opts = {};
      var r = overlay.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) opts.position = { x: (ev.clientX - r.left) / S.view.scale, y: (ev.clientY - r.top) / S.view.scale };
      App.importFiles(ev.dataTransfer.files, opts);
    });
    function hasFiles(ev) { return ev.dataTransfer && Array.prototype.some.call(ev.dataTransfer.types || [], function (t) { return t === "Files"; }); }
    document.addEventListener("paste", function (ev) {
      if (isTyping(ev.target)) return;
      var items = ev.clipboardData && ev.clipboardData.items, files = [];
      if (!items) return;
      for (var i = 0; i < items.length; i++) if (items[i].kind === "file") { var f = items[i].getAsFile(); if (f) files.push(f); }
      if (files.length) { ev.preventDefault(); App.importFiles(files); }
    });
  }

  /* ── Klavye ──────────────────────────────────────────────── */
  var NON_TYPING_INPUTS = { range: 1, checkbox: 1, radio: 1, color: 1, button: 1, submit: 1, file: 1 };
  function isTyping(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return true;
    return el.tagName === "INPUT" && !NON_TYPING_INPUTS[(el.getAttribute("type") || "text").toLowerCase()];
  }
  function bindKeyboard() {
    document.addEventListener("keydown", function (ev) {
      var typing = isTyping(ev.target), ctrl = ev.ctrlKey || ev.metaKey, L = App.selLayer();
      if (ev.key === "Escape") { if (typing) { ev.target.blur(); return; } App.selectLayer(null); return; }
      if (typing) return;
      var tag = ev.target && ev.target.tagName;
      // Kaydırıcı/onay kutusu odaktayken ok ve Boşluk tuşları o öğeye ait kalsın
      if (tag === "INPUT" && (ev.key.indexOf("Arrow") === 0 || ev.key === " ")) return;
      if (tag === "BUTTON" && (ev.key === "Enter")) return;
      if (tag === "BUTTON" && ev.key === " ") { ev.preventDefault(); ev.target.blur(); }
      if (ctrl && (ev.key === "z" || ev.key === "Z")) { ev.preventDefault(); if (ev.shiftKey) App.redo(); else App.undo(); return; }
      if (ctrl && (ev.key === "y" || ev.key === "Y")) { ev.preventDefault(); App.redo(); return; }
      if (ctrl && (ev.key === "s" || ev.key === "S")) { ev.preventDefault(); App.saveProjectFile(); return; }
      if (ctrl && (ev.key === "o" || ev.key === "O")) { ev.preventDefault(); $("fileProject").click(); return; }
      if (ctrl && (ev.key === "e" || ev.key === "E")) { ev.preventDefault(); UI.openExport(); return; }
      if (ctrl && (ev.key === "d" || ev.key === "D")) { ev.preventDefault(); if (L) App.duplicateLayer(L.id); return; }
      if (ctrl) return;
      switch (ev.key) {
        case " ": ev.preventDefault(); App.togglePlay(); break;
        case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown":
          ev.preventDefault();
          if (ev.altKey) { var st = ev.shiftKey ? 10 : 1; App.nudge(ev.key === "ArrowLeft" ? -st : ev.key === "ArrowRight" ? st : 0, ev.key === "ArrowUp" ? -st : ev.key === "ArrowDown" ? st : 0); }
          else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { var dir = ev.key === "ArrowLeft" ? -1 : 1; if (S.playing) App.pause(); if (ev.shiftKey) App.setTime(S.time + dir); else App.stepFrame(dir); }
          break;
        case "Home": ev.preventDefault(); App.setTime(0); break;
        case "End": ev.preventDefault(); App.setTime(App.scene().duration); break;
        case "k": case "K": if (L) App.toggleKeyAt(L, S.time); break;
        case "i": case "I": if (L) App.setInOut(L, S.time, L.outPoint); break;
        case "o": case "O": if (L) App.setInOut(L, L.inPoint, S.time); break;
        case "Delete": case "Backspace":
          if (!L) break;
          ev.preventDefault();
          if (S.sel.keyTime != null) App.removeKeysAt(L, S.sel.keyTime); else App.deleteLayer(L.id);
          break;
        default: return;
      }
    });
  }

  /* ── Üst bar ve dosya girişleri ──────────────────────────── */
  function bindTopbar() {
    $("projectName").addEventListener("change", function () { S.project.name = $("projectName").value.trim().slice(0, 80) || "Adsız Film"; App.commit(); UI.renderFilmSettings(); });
    $("btnNew").addEventListener("click", App.newProject);
    $("btnOpen").addEventListener("click", function () { $("fileProject").value = ""; $("fileProject").click(); });
    $("btnSave").addEventListener("click", App.saveProjectFile);
    $("btnUndo").addEventListener("click", App.undo);
    $("btnRedo").addEventListener("click", App.redo);
    $("btnAddImages").addEventListener("click", function () { $("fileImages").value = ""; $("fileImages").click(); });
    $("emptyAdd").addEventListener("click", function () { $("fileImages").value = ""; $("fileImages").click(); });
    $("btnAddSequence").addEventListener("click", function () { $("fileSequence").value = ""; $("fileSequence").click(); });
    $("btnAddText").addEventListener("click", App.addTextLayer);
    $("btnDemo").addEventListener("click", App.loadDemo);
    $("emptyDemo").addEventListener("click", App.loadDemo);
    $("fileImages").addEventListener("change", function (ev) { App.importFiles(ev.target.files); });
    $("fileSequence").addEventListener("change", function (ev) { App.importFiles(ev.target.files, { asSequence: true }); });
    $("fileFrames").addEventListener("change", function (ev) { applyFrames(ev.target.files); });
    $("fileProject").addEventListener("change", function (ev) { if (ev.target.files[0]) App.openProjectFile(ev.target.files[0]); });
    $("fileAudio").addEventListener("change", function (ev) { if (ev.target.files[0]) App.setAudioFile(ev.target.files[0]); });
    $("fileBgImage").addEventListener("change", function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      readImageAsset(f).then(function (a) {
        S.project.assets[a.id] = a;
        return R.ensureAssets(S.project).then(function () {
          var bg = App.scene().background; bg.assetId = a.id; bg.type = "image";
          App.commit(); UI.renderProps(); S.dirty = true;
        });
      }).catch(function () { App.toast("Arka plan görseli okunamadı", "error"); });
    });
  }

  /* ── Başlat ──────────────────────────────────────────────── */
  function init() {
    bindTopbar(); bindStage(); bindKeyboard(); bindDropPaste(); UI.init();
    var loaded = idbGet("autosave").then(function (saved) { return saved ? Model.normalizeProject(saved) : null; }).catch(function () { return null; });
    loaded.then(function (p) {
      var restored = !!p;
      return loadProject(p || Model.newProject()).then(function () {
        if (restored && hasContent(S.project)) App.toast("Önceki çalışmanız geri yüklendi", "ok");
      });
    }).catch(function (err) {
      console.error(err);
      return loadProject(Model.newProject());
    }).then(function () {
      document.body.classList.add("ready");
      requestAnimationFrame(tick);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(window);
