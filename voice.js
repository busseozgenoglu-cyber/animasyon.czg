/* Canlandır — Seslendirme: SesKlon (yerel Türkçe ses klonlama / TTS sunucusu) ile replikleri konuşturur.
   Sunucu: https://github.com/busseozgenoglu-cyber/ganzlab  (varsayılan adres http://localhost:8000, CORS açık)
   Akış: Yönetmen her replik/anlatım parçası için bir anahtar üretir (Director.voiceKey); burada eksik klipler
   SesKlon'dan sırayla istenir (POST /api/tts → iş → /files/...), project.clips içine dataUrl + süre olarak yazılır.
   Yönetmen klip süresine göre balon ve konuşma süresini kurar, sahneye "clip" ipucu ekler; Sfx hem önizlemede
   hem dışa aktarmada bu klipleri çalar. Sunucu yoksa film sessiz üretilir (uyarıyla). */
(function (root) {
  "use strict";
  var STORE = "canlandir.voice";
  var EMOTION_MAP = { mutlu: "mutlu", uzgun: "üzgün", kizgin: "kızgın", saskin: "şaşkın", korkmus: "korkmuş", fisilti: "fısıltı", dusunceli: "sakin", yorgun: "yavaş" };
  var listeners = [];
  var state = { status: "idle", message: "Bağlanılmadı", health: null, voices: [], error: null, checkedAt: 0 };
  var settings = load();

  function load() {
    var s = { url: "http://localhost:8000", key: "" };
    try { var raw = JSON.parse(localStorage.getItem(STORE) || "null"); if (raw && typeof raw === "object") { if (typeof raw.url === "string") s.url = raw.url; if (typeof raw.key === "string") s.key = raw.key; } } catch (e) { /* yoksay */ }
    return s;
  }
  var checkSeq = 0;
  function saveSettings(part) {
    var changed = Object.keys(part || {}).some(function (k) { return settings[k] !== part[k]; });
    Object.keys(part || {}).forEach(function (k) { settings[k] = part[k]; });
    if (changed) { state.status = "idle"; state.message = "Bağlanılmadı"; state.checkedAt = 0; }
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* yoksay */ }
  }
  function baseUrl() {
    var u = String(settings.url || "").trim();
    if (!u) u = "http://localhost:8000";
    if (!/^https?:\/\//i.test(u)) u = "http://" + u;
    return u.replace(/\/+$/, "");
  }
  function headers(extra) {
    var h = Object.assign({}, extra || {});
    if (settings.key) h["X-API-Key"] = settings.key;
    return h;
  }
  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }
  function setState(part) { Object.keys(part).forEach(function (k) { state[k] = part[k]; }); emit(); }

  /* ── HTTP ─────────────────────────────────────────────────── */
  function api(path, opts) {
    opts = opts || {};
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 15000);
    if (opts.signal) { if (opts.signal.aborted) ctrl.abort(); else opts.signal.addEventListener("abort", function () { ctrl.abort(); }, { once: true }); }
    var h = headers(opts.json !== undefined ? { "Content-Type": "application/json" } : {});
    return fetch(baseUrl() + path, { method: opts.method || "GET", headers: h, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined, signal: ctrl.signal })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
          if (!res.ok) {
            var msg = (data && typeof data === "object" && typeof data.detail === "string") ? data.detail : (res.status === 401 ? "API anahtarı gerekli ya da yanlış" : "HTTP " + res.status);
            var err = new Error(msg); err.status = res.status; err.data = data; throw err;
          }
          return data;
        });
      })
      .catch(function (e) {
        if (e && e.status) throw e;
        var err = new Error(opts.signal && opts.signal.aborted ? "İptal edildi" : (e && e.name === "AbortError" ? "Sunucu zamanında yanıt vermedi" : "SesKlon sunucusuna bağlanılamadı (" + baseUrl() + ")"));
        err.network = !(opts.signal && opts.signal.aborted); err.aborted = !!(opts.signal && opts.signal.aborted);
        throw err;
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* Sağlık + ses listesi */
  function check() {
    var seq = ++checkSeq;   // yalnızca son denemenin sonucu geçerli (adres değişince eski yanıt üstüne yazmasın)
    setState({ status: "checking", message: "Bağlanılıyor…", error: null });
    return api("/api/health", { timeout: 6000 }).then(function (hlt) {
      if (seq !== checkSeq) return state;
      if (hlt && hlt.auth_required && !settings.key) {
        setState({ status: "nokey", message: "Sunucu API anahtarı istiyor", health: hlt, voices: [], checkedAt: Date.now() });
        return state;
      }
      return api("/api/voices", { timeout: 8000 }).then(function (voices) {
        if (seq !== checkSeq) return state;
        voices = Array.isArray(voices) ? voices.map(function (v) { return { id: String(v.id), name: String(v.name || v.id), language: v.language || "tr" }; }) : [];
        var ready = !!(hlt && hlt.model_loaded), loading = !!(hlt && hlt.model_loading), err = hlt && hlt.model_error;
        // Model yüklü değilse ilk üretimde yüklenir (PRELOAD=0); bu bağlantıyı engellemez
        var msg = "Bağlı · " + (ready ? "model hazır" : loading ? "model yükleniyor" : err ? "model hatası: " + err : "model ilk üretimde yüklenecek") + " · " + voices.length + " ses";
        setState({ status: err ? "nomodel" : "ok", message: msg, health: hlt, voices: voices, checkedAt: Date.now(), error: null });
        return state;
      });
    }).catch(function (e) {
      if (seq !== checkSeq) return state;
      setState({ status: e.status === 401 ? "nokey" : "down", message: e.status === 401 ? "API anahtarı yanlış" : e.message, error: e.message, voices: state.voices, checkedAt: Date.now() });
      return state;
    });
  }

  /* Duygu eşlemesi: Canlandır duygusu → SesKlon duygu adı (sunucunun tanımadığı duygu gönderilmez) */
  function mapEmotion(emo) {
    var name = EMOTION_MAP[emo];
    if (!name) return null;
    var tags = state.health && Array.isArray(state.health.emotion_tags) ? state.health.emotion_tags : null;
    if (tags && tags.length) {
      var norm = root.Director ? root.Director.norm : function (s) { return String(s).toLowerCase(); };
      var ok = tags.some(function (t) { return norm(t) === norm(name); });
      if (!ok) return null;
    }
    return name;
  }
  function styleOk(style) {
    var styles = state.health && Array.isArray(state.health.styles) ? state.health.styles : null;
    if (!styles || !styles.length) return style || null;
    var norm = root.Director ? root.Director.norm : function (s) { return String(s).toLowerCase(); };
    var hit = styles.some(function (s) { return norm(s.name) === norm(style) || norm(s.label || "") === norm(style); });
    return hit ? style : null;
  }
  function voiceExists(id) { return !id || state.voices.some(function (v) { return v.id === id; }); }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) { var fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.onerror = function () { reject(new Error("Ses dosyası okunamadı")); }; fr.readAsDataURL(blob); });
  }
  function decodeDuration(dataUrl) {
    return new Promise(function (resolve) {
      try {
        var a = new Audio(); a.preload = "metadata";
        a.onloadedmetadata = function () { resolve(Number.isFinite(a.duration) ? a.duration : 0); };
        a.onerror = function () { resolve(0); };
        a.src = dataUrl;
      } catch (e) { resolve(0); }
    });
  }
  function sleep(ms, signal) { return new Promise(function (resolve) { var t = setTimeout(resolve, ms); if (signal) signal.addEventListener("abort", function () { clearTimeout(t); resolve(); }, { once: true }); }); }

  /* Tek metni seslendirir: { dataUrl, duration, url, id } */
  function synth(req, opts) {
    opts = opts || {};
    var body = { text: req.text, voice_id: req.voiceId || null, language: "tr", format: req.format || ((state.health && state.health.ffmpeg) ? "mp3" : "wav"), subtitles: false, wait: false };
    var style = styleOk(req.style); if (style) body.style = style;
    var emo = req.emotion ? mapEmotion(req.emotion) : null; if (emo) body.emotion = emo;
    if (req.speed) body.speed = req.speed;
    return api("/api/tts", { method: "POST", json: body, timeout: 20000, signal: opts.signal }).then(function (job) {
      if (!job || !job.status) return job;   // doğrudan üretim nesnesi
      function poll() {
        if (opts.signal && opts.signal.aborted) {
          api("/api/jobs/" + job.id + "/cancel", { method: "POST", timeout: 5000 }).catch(function () { /* yoksay */ });
          var e = new Error("İptal edildi"); e.aborted = true; throw e;
        }
        return sleep(job.status === "queued" ? 900 : 600, opts.signal).then(function () {
          return api("/api/jobs/" + job.id, { timeout: 15000, signal: opts.signal });
        }).then(function (j) {
          job = j;
          if (opts.onJob) { try { opts.onJob(j); } catch (e) { /* yoksay */ } }
          if (j.status === "done") return j.result;
          if (j.status === "error") throw new Error(j.error || "Üretim başarısız");
          if (j.status === "cancelled") { var e = new Error("İptal edildi"); e.aborted = true; throw e; }
          return poll();
        });
      }
      return poll();
    }).then(function (gen) {
      if (!gen || !gen.url) throw new Error("Sunucu ses dosyası döndürmedi");
      var fileUrl = /^https?:\/\//.test(gen.url) ? gen.url : baseUrl() + gen.url;
      return fetch(fileUrl, { signal: opts.signal }).then(function (res) { if (!res.ok) throw new Error("Ses dosyası alınamadı (HTTP " + res.status + ")"); return res.blob(); })
        .then(blobToDataUrl)
        .then(function (dataUrl) {
          var dur = +gen.duration;
          return (dur > 0 ? Promise.resolve(dur) : decodeDuration(dataUrl)).then(function (d) {
            return { dataUrl: dataUrl, duration: Math.max(0.1, d || 1), url: fileUrl, id: gen.id, timeline: gen.params && gen.params.timeline || null };
          });
        });
    });
  }

  /* Projedeki eksik replik kliplerini üretir. Hiçbir zaman reddetmez (iptal dışında); uyarıları döndürür. */
  function prepare(project, opts) {
    opts = opts || {};
    var D = root.Director, script = project.script || {};
    var out = { made: 0, failed: 0, skipped: 0, total: 0, warnings: [] };
    if (!script.voice || !script.voice.enabled || !D) return Promise.resolve(out);
    project.clips = project.clips || {};
    var lines = D.voiceLines(project).filter(function (l) { return !project.clips[l.key]; });
    var all = D.voiceLines(project).length;
    out.total = lines.length; out.skipped = all - lines.length;
    // Eski projelerden gelen zarfsız klipler: ağız dizisi yerel olarak hesaplanır (sunucu gerekmez)
    var fill = Object.keys(project.clips).filter(function (kk) { return project.clips[kk].mouth == null || project.clips[kk].mouth === ""; });
    var fillStep = (fill.length && root.Sfx && root.Sfx.mouthEnvelope) ? Promise.all(fill.map(function (kk) { return root.Sfx.mouthEnvelope(project.clips[kk].dataUrl, 12).then(function (m) { project.clips[kk].mouth = m || ""; }); })) : Promise.resolve();
    if (!lines.length) return fillStep.then(function () { return out; });
    var pre = (state.status === "ok" && Date.now() - state.checkedAt < 60000) ? Promise.resolve(state) : check();
    return pre.then(function (st) {
      if (st.status !== "ok") {
        out.failed = lines.length;
        out.warnings.push("Seslendirme yapılamadı: " + st.message + ". Film sessiz üretildi; SesKlon çalışınca “Filmi üret” deyince replikler seslendirilir.");
        return out;
      }
      var missingVoice = {}, i = 0, stopped = false;
      function report(extra) {
        if (!opts.onProgress) return;
        try { opts.onProgress(Object.assign({ phase: "Seslendiriliyor", done: i, total: lines.length, text: lines[i] ? lines[i].text : "" }, extra || {})); } catch (e) { /* yoksay */ }
      }
      function next() {
        if (i >= lines.length || stopped) return Promise.resolve();
        var line = lines[i];
        report();
        var voiceId = line.voiceId || null;
        if (voiceId && !voiceExists(voiceId)) { missingVoice[voiceId] = true; voiceId = null; }
        return synth({ text: line.text, voiceId: voiceId, emotion: line.emotion, style: line.style }, { signal: opts.signal, onJob: function (j) { report({ eta: j.eta_s, position: j.position }); } })
          .then(function (clip) {
            return (root.Sfx && root.Sfx.mouthEnvelope ? root.Sfx.mouthEnvelope(clip.dataUrl, 12) : Promise.resolve("")).then(function (m) {
              project.clips[line.key] = { dataUrl: clip.dataUrl, duration: clip.duration, text: line.text, mouth: m || "" };
              out.made++;
            });
          }, function (e) {
            if (e && e.aborted) { stopped = true; out.warnings.push("Seslendirme durduruldu: " + out.made + "/" + lines.length + " parça seslendirildi, kalanlar sessiz."); return; }
            out.failed++;
            if (e && e.network) { stopped = true; out.warnings.push("Seslendirme yarıda kesildi: " + e.message + " (" + out.made + "/" + lines.length + " parça hazır)."); return; }
            if (out.failed <= 3) out.warnings.push("“" + line.who + ": " + line.text.slice(0, 40) + (line.text.length > 40 ? "…" : "") + "” seslendirilemedi: " + (e && e.message || e));
          })
          .then(function () { i++; return next(); });
      }
      return next().then(function () {
        if (Object.keys(missingVoice).length) out.warnings.push("Bazı karakterlerin sesi sunucuda bulunamadı; varsayılan ses kullanıldı. Karakter kartlarından yeniden seçin.");
        if (out.failed > 3) out.warnings.push(out.failed + " parça seslendirilemedi.");
        return out;
      });
    });
  }

  /* Hızlı deneme: seçilen sesle kısa bir cümle çalar */
  var previewAudio = null;
  function preview(voiceId, name) {
    if (previewAudio) { try { previewAudio.pause(); } catch (e) { /* yoksay */ } previewAudio = null; }
    var text = name ? "Merhaba, ben " + name + "! Bugün harika bir gün olacak." : "Merhaba! Bugün harika bir gün olacak.";
    return synth({ text: text, voiceId: voiceId || null, style: (root.App && root.App.ensureScript().voice.style) || "sohbet" }).then(function (clip) {
      previewAudio = new Audio(clip.dataUrl);
      return previewAudio.play().catch(function () { /* otomatik oynatma engeli */ });
    });
  }

  /* Kadroya ses dağıt: önce anlatıcıya adı tutan ses ("Anlatıcı"), sonra karakterlere adı tutan sesler,
     kalan karakterlere kullanılmamış (anlatıcı olmayan) sesler, en son sırayla */
  function autoAssign(project) {
    var sc = project.script, voices = state.voices, D = root.Director, n = 0, used = {};
    if (!voices.length) return 0;
    var isNarr = function (v) { return /anlatici|narrator|dis ses|anlatan/.test(D.norm(v.name)); };
    var others = voices.filter(function (v) { return !isNarr(v); });
    if (!sc.voice.narratorVoiceId || !voiceExists(sc.voice.narratorVoiceId)) { var nv = voices.filter(isNarr)[0]; if (nv) { sc.voice.narratorVoiceId = nv.id; n++; } }
    if (sc.voice.narratorVoiceId && voiceExists(sc.voice.narratorVoiceId)) used[sc.voice.narratorVoiceId] = true;
    sc.cast.forEach(function (c) { if (c.voiceId && voiceExists(c.voiceId)) used[c.voiceId] = true; });
    sc.cast.forEach(function (c) {   // ada göre
      if (c.voiceId && voiceExists(c.voiceId)) return;
      var cn = D.norm(c.name);
      var hit = voices.filter(function (v) { var vn = D.norm(v.name); return vn === cn || vn.indexOf(cn + " ") === 0 || cn.indexOf(vn + " ") === 0; })[0];
      if (hit) { c.voiceId = hit.id; used[hit.id] = true; n++; }
    });
    var i = 0;
    sc.cast.forEach(function (c) {   // kalanlar
      if (c.voiceId && voiceExists(c.voiceId)) return;
      var pool = (others.length ? others : voices).filter(function (v) { return !used[v.id]; });
      var pick = pool[0] || (others.length ? others : voices)[i % (others.length || voices.length)];
      c.voiceId = pick.id; used[pick.id] = true; i++; n++;
    });
    if (!sc.voice.narratorVoiceId || !voiceExists(sc.voice.narratorVoiceId)) {
      var free = voices.filter(function (v) { return !used[v.id]; })[0] || voices[0];
      sc.voice.narratorVoiceId = free.id; n++;
    }
    return n;
  }

  /* ── Arayüz ───────────────────────────────────────────────── */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null || c === false) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function voiceOptions(sel, current, emptyLabel) {
    sel.innerHTML = "";
    sel.appendChild(el("option", { value: "", text: emptyLabel || "Sunucunun varsayılan sesi" }));
    state.voices.forEach(function (v) { sel.appendChild(el("option", { value: v.id, text: v.name })); });
    if (current && !voiceExists(current)) sel.appendChild(el("option", { value: current, text: "(bulunamadı) " + current.slice(0, 8) }));
    sel.value = current || "";
  }
  /* Kadro kartı için ses seçici (+ dene). Seslendirme kapalıysa ya da ses yoksa null döner. */
  function voiceSelect(cast, onChange, className) {
    var sc = root.App && root.App.ensureScript();
    if (!sc || !sc.voice || !sc.voice.enabled) return null;
    var sel = el("select", { class: "vo-cast " + (className || ""), title: "Bu karakterin sesi (SesKlon)", onchange: function () { cast.voiceId = sel.value || null; if (onChange) onChange(); } });
    voiceOptions(sel, cast.voiceId, state.voices.length ? "Varsayılan ses" : "Ses yok (bağlan)");
    var btn = el("button", { type: "button", class: "small vo-try", title: "Sesi dene", onclick: function () {
      btn.disabled = true; btn.textContent = "…";
      preview(cast.voiceId, cast.name).then(function () { btn.textContent = "▶"; btn.disabled = false; }, function (e) { btn.textContent = "▶"; btn.disabled = false; if (root.App) root.App.toast("Deneme başarısız: " + e.message, "error"); });
    } }, ["▶"]);
    return el("span", { class: "vo-pick" }, [sel, btn]);
  }
  /* Seslendirme paneli (sihirbaz 1. adım ve senaryo penceresi) */
  function renderPanel(container, opts) {
    opts = opts || {};
    var App = root.App, sc = App.ensureScript(), vo = sc.voice;
    container.innerHTML = "";
    container.classList.add("voice-panel");
    if (opts.compact) container.classList.add("compact");
    function changed() { App.commit(); if (opts.onChange) opts.onChange(); }
    var enable = el("input", { type: "checkbox", class: "vo-enable" });
    enable.checked = !!vo.enabled;
    enable.addEventListener("change", function () {
      vo.enabled = enable.checked;
      changed();
      if (vo.enabled && state.status !== "ok") check().then(function () { if (opts.onChange) opts.onChange(); });
    });
    var head = el("label", { class: "vo-head" }, [enable, el("b", { text: "🎙️ Seslendirme" }), el("span", { class: "hint", text: "SesKlon ile karakterler kendi sesiyle konuşsun" })]);
    container.appendChild(head);
    var body = el("div", { class: "vo-body" });
    if (!vo.enabled) body.hidden = true;
    container.appendChild(body);

    var url = el("input", { type: "text", class: "vo-url", placeholder: "http://localhost:8000", title: "SesKlon sunucu adresi", "aria-label": "SesKlon adresi" });
    url.value = settings.url;
    var key = el("input", { type: "password", class: "vo-key", placeholder: "API anahtarı (varsa)", title: "SesKlon API_KEY ayarlıysa", "aria-label": "API anahtarı", autocomplete: "off" });
    key.value = settings.key;
    var dot = el("i", { class: "vo-dot " + state.status }), statusTxt = el("span", { class: "vo-msg", text: state.message });
    var status = el("span", { class: "vo-status " + state.status }, [dot, statusTxt]);
    var connect = el("button", { type: "button", class: "small vo-connect", text: "Bağlan", onclick: function () {
      saveSettings({ url: url.value.trim(), key: key.value.trim() });
      connect.disabled = true;
      check().then(function () { connect.disabled = false; if (opts.onChange) opts.onChange(); });
    } });
    url.addEventListener("change", function () { saveSettings({ url: url.value.trim() }); });
    key.addEventListener("change", function () { saveSettings({ key: key.value.trim() }); });
    body.appendChild(el("div", { class: "vo-row" }, [url, key, connect, status]));

    var narr = el("select", { class: "vo-narrator", title: "Anlatıcı sesi (ANLATICI satırları)", onchange: function () { vo.narratorVoiceId = narr.value || null; changed(); } });
    voiceOptions(narr, vo.narratorVoiceId, state.voices.length ? "Anlatıcı: varsayılan ses" : "Anlatıcı: ses yok");
    var style = el("select", { class: "vo-style", title: "Konuşma stili", onchange: function () { vo.style = style.value; changed(); } });
    var styles = (state.health && Array.isArray(state.health.styles) && state.health.styles.length) ? state.health.styles : [{ name: "sohbet", label: "Sohbet" }, { name: "masal", label: "Masal" }, { name: "duygusal", label: "Duygusal" }, { name: "reklam", label: "Reklam" }];
    styles.forEach(function (s) { style.appendChild(el("option", { value: s.name, text: "Stil: " + (s.label || s.name) })); });
    if (!styles.some(function (s) { return s.name === vo.style; })) style.appendChild(el("option", { value: vo.style, text: "Stil: " + vo.style }));
    style.value = vo.style;
    var auto = el("button", { type: "button", class: "small vo-auto", text: "Sesleri otomatik eşle", title: "Adı tutan sese, yoksa sırayla", onclick: function () {
      var n = autoAssign(App.S.project);
      App.toast(n ? n + " karaktere ses atandı" : "Atanacak ses yok; önce Bağlan", n ? "ok" : "error");
      changed();
    } });
    auto.disabled = !state.voices.length;
    body.appendChild(el("div", { class: "vo-row" }, [narr, style, auto]));
    var clipCount = Object.keys(App.S.project.clips || {}).length;
    body.appendChild(el("p", { class: "hint vo-hint" }, [
      clipCount ? clipCount + " parça seslendirilmiş durumda. " : "",
      "Bilgisayarında SesKlon çalışmalı (",
      el("a", { href: "https://github.com/busseozgenoglu-cyber/ganzlab", target: "_blank", rel: "noopener", text: "kurulum" }),
      "); sesleri SesKlon'un “Sesler” sekmesinden ekle. Her karaktere kartındaki seçiciden ses ver; “Filmi üret” deyince replikler seslendirilir ve balonlar konuşma süresine göre kurulur. CPU'da üretim yavaştır; istersen bekleme sırasında durdurabilirsin."
    ]));
    return container;
  }

  root.Voice = { settings: settings, saveSettings: saveSettings, state: state, check: check, mapEmotion: mapEmotion, synth: synth, prepare: prepare, preview: preview,
    autoAssign: autoAssign, renderPanel: renderPanel, voiceSelect: voiceSelect, onChange: function (fn) { listeners.push(fn); }, baseUrl: baseUrl };
})(window);
