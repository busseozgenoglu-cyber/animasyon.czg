/* Canlandır — proje veri modeli: varsayılanlar, doğrulama, kopyalama. */
(function (root) {
  "use strict";
  var M = root.Motion;

  var VERSION = 1;
  var STAGE_PRESETS = [
    { id: "yatay-hd", label: "Yatay 16:9 · 1280×720 (YouTube)", w: 1280, h: 720 },
    { id: "yatay-fhd", label: "Yatay 16:9 · 1920×1080", w: 1920, h: 1080 },
    { id: "kare", label: "Kare 1:1 · 1080×1080 (Instagram)", w: 1080, h: 1080 },
    { id: "dikey", label: "Dikey 9:16 · 1080×1920 (Reels, TikTok)", w: 1080, h: 1920 },
    { id: "kucuk", label: "Küçük 4:3 · 640×480 (GIF)", w: 640, h: 480 },
    { id: "sticker", label: "Çıkartma · 512×512", w: 512, h: 512 }
  ];
  var FONTS = [
    { id: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", label: "Düz (sistem)" },
    { id: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive", label: "Çizgi roman" },
    { id: "Impact, 'Arial Black', sans-serif", label: "Kalın afiş" },
    { id: "Georgia, 'Times New Roman', serif", label: "Klasik (serif)" },
    { id: "'Courier New', monospace", label: "Daktilo" },
    { id: "'Brush Script MT', 'Segoe Script', cursive", label: "El yazısı" }
  ];

  function num(v, def, min, max) {
    v = +v;
    if (!Number.isFinite(v)) v = def;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }
  function str(v, def, max) { return typeof v === "string" ? v.slice(0, max || 500) : def; }
  function bool(v, def) { return typeof v === "boolean" ? v : def; }
  function oneOf(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  function newBackground() { return { type: "gradient", color: "#5fb8ff", color2: "#eaf7ff", angle: 180, assetId: null }; }

  function newScene(name, duration) {
    return {
      id: M.uid("sc"), name: name || "Sahne", duration: duration || 4,
      background: newBackground(),
      transition: { type: "none", duration: 0.5 },
      camera: newCamera(), sfx: [], grade: null,
      layers: []
    };
  }
  function newCamera() { return { base: { zoom: 1, x: 0.5, y: 0.5 }, tracks: { zoom: [], x: [], y: [] } }; }

  function newScript() {
    return { text: "", cast: [], backgrounds: [], settings: { charHeight: 0.42, speed: "normal", bubbleStyle: "white", titleCard: true, endCard: true, headings: true, fade: true, sfx: true, onomatopoeia: true },
      voice: newVoice() };
  }
  /* Seslendirme (SesKlon): kadro sesleri karakterlerde (voiceId), anlatıcı ve stil burada */
  function newVoice() { return { enabled: false, narratorVoiceId: null, style: "sohbet", narratorStyle: "anlatıcı" }; 
  }

  function newProject(opts) {
    opts = opts || {};
    var p = {
      version: VERSION, name: opts.name || "Adsız Film",
      width: opts.width || 1280, height: opts.height || 720, fps: opts.fps || 24,
      audio: null, clips: {}, assets: {}, scenes: [], script: newScript()
    };
    p.scenes.push(newScene("Sahne 1", opts.duration || 4));
    return p;
  }

  function newText() {
    return {
      content: "Merhaba!", font: FONTS[1].id, size: 56, weight: "700", color: "#1b1f2a",
      stroke: "#ffffff", strokeWidth: 0, align: "center",
      bubble: true, bubbleColor: "#ffffff", bubbleTail: "left", bubbleShape: "round", maxWidth: 520, lineHeight: 1.25
    };
  }

  function newLayer(type, opts) {
    opts = opts || {};
    var L = {
      id: M.uid("ly"), name: opts.name || (type === "text" ? "Metin" : type === "sequence" ? "Kare dizisi" : "Görsel"),
      type: type, visible: true, locked: false,
      frames: opts.frames ? opts.frames.slice() : [], frameFps: opts.frameFps || 8, frameMode: opts.frameMode || "loop",
      text: type === "text" ? Object.assign(newText(), opts.text || {}) : null,
      base: Object.assign({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, opacity: 1, blur: 0 }, opts.base || {}),
      tracks: { x: [], y: [], rot: [], sx: [], sy: [], opacity: [], blur: [] },
      anchor: Object.assign({ x: 0.5, y: 0.5 }, opts.anchor || {}),
      flipX: false, flipY: false,
      inPoint: opts.inPoint || 0, outPoint: opts.outPoint == null ? null : opts.outPoint,
      effects: [], frameSets: [], shadow: null, hud: false, parallax: 1
    };
    return L;
  }

  function normalizeTrack(tr) {
    if (!Array.isArray(tr)) return [];
    var out = [];
    tr.forEach(function (k) {
      if (!k || !Number.isFinite(+k.t) || !Number.isFinite(+k.v)) return;
      out.push({ t: Math.max(0, +k.t), v: +k.v, e: M.EASINGS[k.e] ? k.e : "easeInOutQuad" });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function normalizeLayer(raw, assets) {
    if (!raw || typeof raw !== "object") return null;
    var type = oneOf(raw.type, ["image", "sequence", "text"], "image");
    var L = newLayer(type, { name: str(raw.name, undefined, 80) });
    if (typeof raw.id === "string" && raw.id.length < 64) L.id = raw.id;
    L.visible = bool(raw.visible, true);
    L.locked = bool(raw.locked, false);
    L.frames = Array.isArray(raw.frames) ? raw.frames.filter(function (f) { return typeof f === "string" && assets[f]; }) : [];
    if (type !== "text" && !L.frames.length) return null;      // görseli kayıp katman atlanır
    L.frameFps = num(raw.frameFps, 8, 0.5, 60);
    L.frameMode = oneOf(raw.frameMode, ["loop", "once", "pingpong"], "loop");
    if (type === "text") {
      var t = raw.text || {}, d = newText();
      L.text = {
        content: str(t.content, d.content, 2000), font: str(t.font, d.font, 200), size: num(t.size, d.size, 6, 600),
        weight: oneOf(String(t.weight), ["400", "700"], d.weight), color: str(t.color, d.color, 32),
        stroke: str(t.stroke, d.stroke, 32), strokeWidth: num(t.strokeWidth, 0, 0, 40),
        align: oneOf(t.align, ["left", "center", "right"], "center"),
        bubble: bool(t.bubble, true), bubbleColor: str(t.bubbleColor, d.bubbleColor, 32),
        bubbleTail: oneOf(t.bubbleTail, ["none", "left", "right"], "left"), bubbleShape: oneOf(t.bubbleShape, ["round", "thought", "shout"], "round"),
        maxWidth: num(t.maxWidth, d.maxWidth, 40, 4000), lineHeight: num(t.lineHeight, 1.25, 0.8, 3)
      };
    }
    var b = raw.base || {};
    L.base = { x: num(b.x, 0), y: num(b.y, 0), rot: num(b.rot, 0), sx: num(b.sx, 1, -50, 50), sy: num(b.sy, 1, -50, 50), opacity: num(b.opacity, 1, 0, 1), blur: num(b.blur, 0, 0, 60) };
    var tk = raw.tracks || {};
    L.tracks = { x: normalizeTrack(tk.x), y: normalizeTrack(tk.y), rot: normalizeTrack(tk.rot), sx: normalizeTrack(tk.sx), sy: normalizeTrack(tk.sy), opacity: normalizeTrack(tk.opacity), blur: normalizeTrack(tk.blur) };   // blur: alan derinliği (px)
    var a = raw.anchor || {};
    L.anchor = { x: num(a.x, 0.5, -2, 3), y: num(a.y, 0.5, -2, 3) };
    L.flipX = bool(raw.flipX, false); L.flipY = bool(raw.flipY, false);
    L.inPoint = num(raw.inPoint, 0, 0);
    L.outPoint = raw.outPoint == null ? null : num(raw.outPoint, null, 0);
    L.shadow = (raw.shadow && typeof raw.shadow === "object") ? { y: num(raw.shadow.y, 0) } : null;
    L.hud = bool(raw.hud, false);   // ekran katmanı: kameradan etkilenmez (alt yazı, başlık)
    L.parallax = num(raw.parallax, 1, 0, 2);   // kameraya tepki oranı (1 = tam, <1 uzak arka plan)
    L.frameSets = [];
    if (Array.isArray(raw.frameSets)) raw.frameSets.forEach(function (fs) {
      if (!fs || !Array.isArray(fs.frames)) return;
      var frames = fs.frames.filter(function (f) { return typeof f === "string" && assets[f]; });
      if (!frames.length) return;
      L.frameSets.push({ start: num(fs.start, 0, 0), end: num(fs.end, 0, 0), frames: frames, fps: num(fs.fps, 8, 0.5, 60) });
    });
    L.effects = [];
    if (Array.isArray(raw.effects)) raw.effects.forEach(function (e) {
      if (!e || !M.EFFECTS[e.type]) return;
      var def = M.EFFECTS[e.type], params = {};
      def.params.forEach(function (p) {
        var v = e.params ? e.params[p.key] : undefined;
        if (p.type === "range") params[p.key] = num(v, p.def, p.min, p.max);
        else params[p.key] = p.options.some(function (o) { return o.value === v; }) ? v : p.def;
      });
      L.effects.push({ id: typeof e.id === "string" ? e.id : M.uid("fx"), type: e.type, params: params,
        start: num(e.start, 0, 0), end: e.end == null ? null : num(e.end, null, 0), enabled: bool(e.enabled, true) });
    });
    return L;
  }

  /* Dosyadan/otomatik kayıttan gelen nesneyi güvenli bir projeye çevirir. */
  function normalizeProject(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.scenes)) throw new Error("Bu dosya bir Canlandır projesi değil.");
    var p = newProject();
    p.scenes = [];
    p.name = str(raw.name, "Adsız Film", 120);
    p.width = Math.round(num(raw.width, 1280, 16, 4096));
    p.height = Math.round(num(raw.height, 720, 16, 4096));
    p.fps = Math.round(num(raw.fps, 24, 1, 60));
    p.assets = {};
    if (raw.assets && typeof raw.assets === "object") {
      Object.keys(raw.assets).forEach(function (id) {
        var a = raw.assets[id];
        if (!a || typeof a.dataUrl !== "string" || !/^data:image\//.test(a.dataUrl)) return;
        p.assets[id] = { id: id, name: str(a.name, "görsel", 120), dataUrl: a.dataUrl, width: Math.round(num(a.width, 1, 1)), height: Math.round(num(a.height, 1, 1)) };
        if (typeof a.genKey === "string" && a.genKey.length < 120) p.assets[id].genKey = a.genKey;
      });
    }
    if (raw.audio && typeof raw.audio.dataUrl === "string" && /^data:audio\//.test(raw.audio.dataUrl)) {
      p.audio = { name: str(raw.audio.name, "ses", 120), dataUrl: raw.audio.dataUrl, volume: num(raw.audio.volume, 1, 0, 1) };
    }
    p.clips = {};   // seslendirme klipleri: anahtar → { dataUrl, duration, text }
    if (raw.clips && typeof raw.clips === "object") {
      Object.keys(raw.clips).forEach(function (key) {
        var c = raw.clips[key];
        if (!c || key.length > 80 || typeof c.dataUrl !== "string" || !/^data:audio\//.test(c.dataUrl) || !(+c.duration > 0)) return;
        p.clips[key] = { dataUrl: c.dataUrl, duration: num(c.duration, 1, 0.05, 600), text: str(c.text, "", 400), mouth: (typeof c.mouth === "string" && /^[0-2]*$/.test(c.mouth)) ? c.mouth.slice(0, 8000) : "" };
      });
    }
    raw.scenes.forEach(function (s, i) {
      if (!s || typeof s !== "object") return;
      var sc = newScene(str(s.name, "Sahne " + (i + 1), 60), num(s.duration, 4, 0.1, 600));
      if (typeof s.id === "string" && s.id.length < 64) sc.id = s.id;
      var bg = s.background || {};
      sc.background = {
        type: oneOf(bg.type, ["color", "gradient", "image", "transparent"], "gradient"),
        color: str(bg.color, "#5fb8ff", 32), color2: str(bg.color2, "#eaf7ff", 32), angle: num(bg.angle, 180, 0, 360),
        assetId: (typeof bg.assetId === "string" && p.assets[bg.assetId]) ? bg.assetId : null
      };
      if (sc.background.type === "image" && !sc.background.assetId) sc.background.type = "color";
      var trn = s.transition || {};
      sc.transition = { type: oneOf(trn.type, ["none", "fade", "iris", "wipe"], "none"), duration: num(trn.duration, 0.5, 0.1, 5) };
      sc.grade = (s.grade && typeof s.grade === "object" && /^#[0-9a-fA-F]{6}$/.test(String(s.grade.color))) ? { color: s.grade.color, alpha: num(s.grade.alpha, 0.3, 0, 1) } : null;
      var cam = s.camera || {}, cb = cam.base || {}, ct = cam.tracks || {};
      sc.camera = { base: { zoom: num(cb.zoom, 1, 0.2, 6), x: num(cb.x, 0.5, -1, 2), y: num(cb.y, 0.5, -1, 2) },
        tracks: { zoom: normalizeTrack(ct.zoom), x: normalizeTrack(ct.x), y: normalizeTrack(ct.y) } };
      sc.sfx = [];
      if (Array.isArray(s.sfx)) s.sfx.forEach(function (q) {
        if (!q || !Number.isFinite(+q.t) || typeof q.type !== "string") return;
        var cue = { t: Math.max(0, +q.t), type: q.type.slice(0, 20) };
        if (cue.type === "clip") { if (typeof q.clip !== "string" || !p.clips[q.clip]) return; cue.clip = q.clip; }
        if (cue.type === "amb") { if (typeof q.amb !== "string") return; cue.amb = q.amb.slice(0, 20); cue.dur = Math.max(0.1, +q.dur || 1); if (q.vol != null) cue.vol = Math.max(0.05, Math.min(1, +q.vol || 1)); }
        sc.sfx.push(cue);
      });
      if (Array.isArray(s.layers)) s.layers.forEach(function (l) { var L = normalizeLayer(l, p.assets); if (L) sc.layers.push(L); });
      p.scenes.push(sc);
    });
    if (!p.scenes.length) p.scenes.push(newScene("Sahne 1", 4));
    p.script = normalizeScript(raw.script, p.assets);
    return p;
  }

  var CAST_ROLES = ["pose", "talk", "walk", "blink", "mutlu", "uzgun", "kizgin", "saskin", "korkmus", "jest1", "jest1k", "jest2", "jest2k", "bak"];
  function normalizeScript(raw, assets) {
    var sc = newScript();
    if (!raw || typeof raw !== "object") return sc;
    sc.text = str(raw.text, "", 40000);
    if (Array.isArray(raw.cast)) raw.cast.forEach(function (c) {
      if (!c || typeof c.name !== "string" || !c.name.trim()) return;
      var images = [];
      if (Array.isArray(c.images)) c.images.forEach(function (im) { if (im && typeof im.assetId === "string" && assets[im.assetId]) images.push({ assetId: im.assetId, role: oneOf(im.role, CAST_ROLES, "pose") }); });
      sc.cast.push({ id: typeof c.id === "string" ? c.id : M.uid("ch"), name: c.name.trim().slice(0, 40), facing: oneOf(c.facing, ["right", "left"], "right"), images: images, size: num(c.size, 1, 0.25, 3),
        voiceId: (typeof c.voiceId === "string" && c.voiceId.length <= 64) ? c.voiceId : null });
    });
    if (Array.isArray(raw.backgrounds)) raw.backgrounds.forEach(function (b) {
      if (!b || typeof b.assetId !== "string" || !assets[b.assetId]) return;
      sc.backgrounds.push({ id: typeof b.id === "string" ? b.id : M.uid("bg"), assetId: b.assetId, name: str(b.name, "arka plan", 60), ground: num(b.ground, 0.9, 0.5, 1) });   // ground: zemin çizgisi (yükseklik oranı)
    });
    var st = raw.settings || {};
    sc.settings = {
      charHeight: num(st.charHeight, 0.42, 0.15, 0.8), speed: oneOf(st.speed, ["slow", "normal", "fast"], "normal"),
      bubbleStyle: oneOf(st.bubbleStyle, ["white", "color", "subtitle", "none"], "white"), titleCard: bool(st.titleCard, true), endCard: bool(st.endCard, true),
      headings: bool(st.headings, true), fade: bool(st.fade, true), sfx: bool(st.sfx, true), onomatopoeia: bool(st.onomatopoeia, true)
    };
    var vo = raw.voice || {};
    sc.voice = { enabled: bool(vo.enabled, false), narratorVoiceId: (typeof vo.narratorVoiceId === "string" && vo.narratorVoiceId.length <= 64) ? vo.narratorVoiceId : null,
      style: str(vo.style, "sohbet", 40) || "sohbet", narratorStyle: str(vo.narratorStyle, "anlatıcı", 40) || "anlatıcı" };
    return sc;
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function cloneLayer(layer) {
    var c = deepClone(layer);
    c.id = M.uid("ly");
    c.name = layer.name + " kopya";
    c.effects.forEach(function (e) { e.id = M.uid("fx"); });
    return c;
  }
  function cloneScene(scene) {
    var c = deepClone(scene);
    c.id = M.uid("sc");
    c.name = scene.name + " kopya";
    c.layers.forEach(function (l) { l.id = M.uid("ly"); l.effects.forEach(function (e) { e.id = M.uid("fx"); }); });
    return c;
  }

  function usedAssetIds(project) {
    var used = {};
    project.scenes.forEach(function (s) {
      if (s.background && s.background.assetId) used[s.background.assetId] = true;
      s.layers.forEach(function (l) {
        (l.frames || []).forEach(function (f) { used[f] = true; });
        (l.frameSets || []).forEach(function (fs) { (fs.frames || []).forEach(function (f) { used[f] = true; }); });
      });
    });
    var sc = project.script;
    if (sc) {
      (sc.cast || []).forEach(function (c) { (c.images || []).forEach(function (im) { used[im.assetId] = true; }); });
      (sc.backgrounds || []).forEach(function (b) { used[b.assetId] = true; });
    }
    return used;
  }
  function pruneAssets(project) {
    var used = usedAssetIds(project);
    Object.keys(project.assets).forEach(function (id) { if (!used[id]) delete project.assets[id]; });
  }

  root.Model = {
    VERSION: VERSION, STAGE_PRESETS: STAGE_PRESETS, FONTS: FONTS,
    newProject: newProject, newScene: newScene, newLayer: newLayer, newText: newText, newScript: newScript, newCamera: newCamera, CAST_ROLES: CAST_ROLES,
    normalizeProject: normalizeProject, cloneLayer: cloneLayer, cloneScene: cloneScene, deepClone: deepClone,
    usedAssetIds: usedAssetIds, pruneAssets: pruneAssets
  };
})(window);
