/* Canlandır — Kolay mod: üç adımlı sihirbaz (Karakterler → Senaryo → Film).
   Stüdyonun veri modelini ve işlemlerini kullanır; karmaşık arayüz "Gelişmiş stüdyo" olarak arkada kalır. */
(function (root) {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = !!v;
      else if (k === "disabled") e.disabled = !!v;
      else if (k === "style") e.style.cssText = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(e, x); }); return; }
    e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function fmtSec(t) { return Math.round(t) + " sn"; }
  function fmtBytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.round(n / 1024) + " KB"; }

  var Easy = { step: 1, open: false, built: false, warnings: [], stats: null };
  root.Easy = Easy;
  var preview = { playing: false, T: 0, wall: 0, T0: 0, raf: 0, canvas: null, ctx: null };
  var ROLE_LABELS = [["pose", "Duruş"], ["talk", "Ağzı açık (konuşma)"], ["walk", "Adım (yürüme)"], ["blink", "Göz kırpma"], ["mutlu", "Mutlu"], ["uzgun", "Üzgün"], ["kizgin", "Kızgın"], ["saskin", "Şaşkın"], ["korkmus", "Korkmuş"],
    ["jest1", "Jest 1"], ["jest1k", "Jest 1 (ağız açık)"], ["jest2", "Jest 2"], ["jest2k", "Jest 2 (ağız açık)"], ["bak", "Yana bakış"]];

  function App() { return root.App; }
  function project() { return root.App.S.project; }
  function script() { return root.App.ensureScript(); }
  function setMode(mode) { try { localStorage.setItem("canlandir.mode", mode); } catch (e) { /* yoksay */ } }
  Easy.isOpen = function () { return Easy.open; };

  /* ── Açma / kapama ─────────────────────────────────────────── */
  Easy.openWizard = function (step) {
    Easy.open = true;
    document.body.classList.add("easy-open");
    $("wizard").hidden = false;
    if (App().S.playing) App().pause();
    setMode("easy");
    $("wzHelp").textContent = root.Director.HELP;
    renderCast(); renderBgs();
    $("wzText").value = script().text || "";
    renderSummary();
    Easy.goto(step || suggestStep());
  };
  Easy.closeWizard = function () {
    Easy.open = false;
    stopPreview();
    document.body.classList.remove("easy-open");
    $("wizard").hidden = true;
    setMode("studio");
    App().layoutStage(); root.UI.renderAll(); App().markDirty();
  };
  function suggestStep() {
    var p = project(), sc = script();
    if (Easy.built || (sc.text && p.scenes.some(function (s) { return s.layers.length; }))) return 3;
    if (sc.text.trim()) return 2;
    return 1;
  }
  Easy.goto = function (step) {
    Easy.step = step;
    document.querySelectorAll("#wizard .wz-step").forEach(function (s) { s.hidden = +s.getAttribute("data-step") !== step; });
    document.querySelectorAll("#wzSteps li").forEach(function (li) { var n = +li.getAttribute("data-step"); li.classList.toggle("active", n === step); li.classList.toggle("done", n < step); });
    $("wizard").scrollTop = 0;
    if (step === 1) { renderCast(); renderBgs(); }
    if (step === 3) { renderFilmInfo(); renderMusic(); startPreview(); } else stopPreview();
    if (step === 2) { renderFormat(); renderSettings(); renderSummary(); setTimeout(function () { if (!$("wzText").value) $("wzText").focus(); }, 50); }
  };

  /* ── 1 · Karakterler ───────────────────────────────────────── */
  function renderCast() {
    var p = project(), sc = script(), box = $("wzCast");
    box.innerHTML = "";
    sc.cast.forEach(function (c) {
      var pose = c.images.find(function (im) { return im.role === "pose"; }) || c.images[0];
      var poseAsset = pose && p.assets[pose.assetId];
      var drop = h("div", { class: "wz-drop" + (poseAsset ? " has" : ""), title: "Resim seçmek için tıkla ya da buraya sürükle", tabindex: "0", role: "button",
        onclick: function () { App().pickCastImages(c.id); },
        onkeydown: function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); App().pickCastImages(c.id); } },
        ondragover: function (ev) { ev.preventDefault(); ev.stopPropagation(); drop.classList.add("over"); },
        ondragleave: function () { drop.classList.remove("over"); },
        ondrop: function (ev) { ev.preventDefault(); ev.stopPropagation(); drop.classList.remove("over"); App().addCastFiles(c.id, ev.dataTransfer.files); } },
        poseAsset ? h("img", { src: poseAsset.dataUrl, alt: c.name }) : h("div", { class: "wz-drop-empty" }, h("span", { class: "big" }, "🖼️"), h("b", null, "Resim ekle"), h("small", null, "tıkla ya da sürükle")));
      var name = h("input", { type: "text", class: "wz-name", value: c.name, maxlength: "40", placeholder: "Karakterin adı", "aria-label": "Karakter adı",
        onchange: function () { App().renameCast(c.id, name.value); renderCast(); renderSummary(); } });
      var facing = h("select", { class: "wz-facing", title: "Resimde yüzü hangi yöne bakıyor?", onchange: function () { c.facing = facing.value; App().commit(); } },
        h("option", { value: "right", text: "Sağa bakıyor" }), h("option", { value: "left", text: "Sola bakıyor" }));
      facing.value = c.facing || "right";
      var extra = c.images.filter(function (im) { return !pose || im.assetId !== pose.assetId; });
      var extraList = h("div", { class: "sc-imgs" });
      extra.forEach(function (im) {
        var a = p.assets[im.assetId]; if (!a) return;
        var role = h("select", { onchange: function () { im.role = role.value; App().commit(); renderCast(); } });
        ROLE_LABELS.forEach(function (r) { role.appendChild(h("option", { value: r[0], text: r[1] })); });
        role.value = im.role || "talk";
        extraList.appendChild(h("div", { class: "sc-img" }, h("img", { src: a.dataUrl, alt: a.name }), role,
          h("button", { type: "button", class: "rm", title: "Çıkar", onclick: function () { App().removeCastImage(c.id, im.assetId); } }, "×")));
      });
      extraList.appendChild(h("button", { type: "button", class: "small", onclick: function () { App().pickCastImages(c.id); } }, "+ Resim"));
      var details = h("details", { class: "wz-more" }, h("summary", null, "Ek resimler" + (extra.length ? " (" + extra.length + ")" : "") + " · ağız, adım, duygu"),
        h("p", { class: "hint" }, "İsteğe bağlı: ağzı açık bir kare eklersen konuşurken ağzı oynar; adım kareleri eklersen yürürken bacakları hareket eder; mutlu/üzgün/kızgın resimleri o duygudaki repliklerde kullanılır."), extraList);
      var footKids = ["div", { class: "wz-card-foot" }, facing, root.UI.sizeSelect(c, function () { App().commit(); }, "wz-facing")];
      var voiceSel = root.Voice ? root.Voice.voiceSelect(c, function () { App().commit(); }, "wz-facing") : null;
      if (voiceSel) footKids.push(voiceSel);
      footKids.push(h("button", { type: "button", class: "small danger", title: "Karakteri sil", onclick: function () { if (c.images.length && !confirm("“" + c.name + "” silinsin mi?")) return; App().removeCastMember(c.id); renderCast(); renderSummary(); } }, "Sil"));
      box.appendChild(h("div", { class: "wz-card" }, drop, name, h.apply(null, footKids), details));
    });
    if (root.Voice && $("wzVoice")) root.Voice.renderPanel($("wzVoice"), { onChange: function () { renderCast(); renderSummary(); } });
    box.appendChild(h("button", { type: "button", class: "wz-card add", onclick: function () {
      var m = App().addCastMember("Karakter " + (sc.cast.length + 1));
      App().pickCastImages(m.id);            // dosya seçici kullanıcı dokunuşuyla aynı anda açılır (Safari gerektirir)
      renderCast();
      var inputs = box.querySelectorAll(".wz-name"); var last = inputs[inputs.length - 1]; if (last) { last.focus(); last.select(); }
    } }, h("span", { class: "big" }, "＋"), h("b", null, "Karakter ekle"), h("small", null, sc.cast.length ? "bir karakter daha" : "ad ver, resim yükle")));
  }
  Easy.refreshCast = function () { if (Easy.open) { renderCast(); renderBgs(); renderSummary(); } };

  function renderBgs() {
    var p = project(), sc = script(), box = $("wzBgs");
    box.innerHTML = "";
    sc.backgrounds.forEach(function (b) {
      var a = p.assets[b.assetId]; if (!a) return;
      var nm = h("input", { type: "text", value: b.name, maxlength: "60", placeholder: "Mekân adı (ör. park)", onchange: function () { b.name = nm.value.trim().slice(0, 60); App().commit(); renderSummary(); } });
      box.appendChild(h("div", { class: "sc-bg" }, h("img", { src: a.dataUrl, alt: "" }), nm, h("button", { type: "button", class: "small danger", onclick: function () { App().removeBackground(b.id); renderBgs(); } }, "Sil")));
    });
  }

  /* ── 2 · Senaryo ───────────────────────────────────────────── */
  function castNames() {
    var names = script().cast.map(function (c) { return c.name; });
    try { root.Director.parse($("wzText").value).speakers.forEach(function (s) { if (names.map(root.Director.norm).indexOf(root.Director.norm(s)) < 0) names.push(s); }); } catch (e) { /* yoksay */ }
    return names;
  }
  /* İmlecin bulunduğu satırın altına satır ekler; opts.select = [baş, son] metin içinde seçilecek aralık (yer tutucu) */
  function insertLine(text, opts) {
    opts = opts || {};
    var ta = $("wzText"), v = ta.value, pos = ta.selectionEnd == null ? v.length : ta.selectionEnd;
    var lineEnd = v.indexOf("\n", pos); if (lineEnd < 0) lineEnd = v.length;
    var before = v.slice(0, lineEnd), after = v.slice(lineEnd);
    var prefix = before.length ? (before.endsWith("\n") ? "" : "\n") : "";
    if (opts.blankBefore && before.trim().length) prefix += "\n";
    var ins = prefix + text, base = before.length + prefix.length;
    ta.value = before + ins + after;
    ta.focus();
    if (opts.select) ta.setSelectionRange(base + opts.select[0], base + opts.select[1]);
    else { var caret = before.length + ins.length; ta.setSelectionRange(caret, caret); }
    script().text = ta.value; App().commit(); renderSummary();
  }
  function closeMenus() { document.querySelectorAll(".wz-menu").forEach(function (m) { m.hidden = true; }); }
  function buildLineMenu() {
    var m = $("wzLineMenu"); m.innerHTML = "";
    var names = castNames();
    if (!names.length) m.appendChild(h("p", { class: "hint" }, "Önce 1. adımda karakter ekle ya da aşağıya “ALİ: Merhaba” gibi bir satır yaz."));
    names.forEach(function (n) { m.appendChild(h("button", { type: "button", onclick: function () { closeMenus(); insertLine(n.toLocaleUpperCase("tr") + ": "); } }, "💬 " + n + " konuşsun")); });
    m.appendChild(h("button", { type: "button", onclick: function () { closeMenus(); insertLine("ANLATICI: "); } }, "📜 Anlatıcı (alt yazı)"));
    m.appendChild(h("p", { class: "hint" }, "Duygu için ada parantez ekle: ALİ (mutlu): … — mutlu, üzgün, kızgın, şaşkın, korkmuş, fısıldayarak"));
  }
  var ACTS = [
    ["Hareket", [["soldan girer", "{A} soldan girer."], ["sağdan girer", "{A} sağdan girer."], ["koşarak girer", "{A} sağdan koşarak girer."], ["sola çıkar", "{A} sola çıkar."], ["sağa çıkar", "{A} sağa çıkar."],
      ["yürür", "{A} sağa yürür."], ["koşar", "{A} koşar."], ["{B}'ye doğru yürür", "{A} {B}'ye doğru yürür."], ["zıplar", "{A} zıplar."], ["döner", "{A} döner."], ["düşer", "{A} düşer."], ["kalkar", "{A} ayağa kalkar."], ["uçar", "{A} uçar."], ["iner", "{A} yere iner."]]],
    ["Duygu ve jest", [["güler", "{A} güler."], ["ağlar", "{A} ağlar."], ["kızar", "{A} kızar."], ["şaşırır", "{A} şaşırır."], ["korkar", "{A} korkar."], ["el sallar", "{A} el sallar."], ["dans eder", "{A} dans eder."], ["düşünür", "{A} düşünür."], ["uyur", "{A} uyur."], ["{B}'ye bakar", "{A} {B}'ye bakar."], ["oturur", "{A} oturur."], ["büyür", "{A} büyür."]]],
    ["Zaman", [["2 saniye bekler", "2 saniye bekler."], ["herkes zıplar", "Herkes zıplar."], ["hepsi çıkar", "Herkes sağa çıkar."]]]
  ];
  function buildActMenu() {
    var m = $("wzActMenu"); m.innerHTML = "";
    var names = castNames();
    var who = h("select", { class: "wz-who" }), whom = h("select", { class: "wz-who" });
    names.forEach(function (n) { who.appendChild(h("option", { value: n, text: n })); whom.appendChild(h("option", { value: n, text: n })); });
    if (names.length > 1) whom.selectedIndex = 1;
    m.appendChild(h("div", { class: "wz-who-row" }, h("label", null, "Kim? ", who), h("label", null, "Kime? ", whom)));
    if (!names.length) m.appendChild(h("p", { class: "hint" }, "Önce karakter ekle; eylemler karakter adıyla yazılır."));
    ACTS.forEach(function (g) {
      var grid = h("div", { class: "wz-chipgrid" });
      g[1].forEach(function (a) {
        grid.appendChild(h("button", { type: "button", onclick: function () {
          var A = who.value || "Ali", B = whom.value || (names[1] || "Ayşe");
          closeMenus(); insertLine(a[1].replace(/\{A\}/g, A).replace(/\{B\}/g, B));
        } }, a[0].replace(/\{B\}/g, whom.value || "…")));
      });
      m.appendChild(h("div", { class: "wz-group" }, h("h4", null, g[0]), grid));
    });
  }
  function renderSummary() {
    var box = $("wzSummary"), D = root.Director, text = $("wzText").value, sc = script();
    box.innerHTML = "";
    if (!text.trim()) { box.appendChild(h("div", { class: "muted" }, "Boş senaryo. Üstteki düğmelerle satır ekle ya da “Örnek senaryoyu yükle” de.")); return; }
    var r;
    try { r = D.analyze(text, sc.cast.filter(function (c) { return c.images.length; }).map(function (c) { return c.name; })); } catch (e) { box.appendChild(h("div", { class: "err" }, "Senaryo okunamadı: " + e.message)); return; }
    var st = r.stats;
    box.appendChild(h("div", { class: "wz-sumline" }, h("b", null, st.scenes + " sahne · " + st.lines + " replik · " + st.actions + " eylem"), " · film yaklaşık " + fmtSec(st.seconds + 5)));
    var chips = h("div", { class: "sc-chips" }), withImg = sc.cast.filter(function (c) { return c.images.length; }).map(function (c) { return D.norm(c.name); });
    r.names.forEach(function (nm) { var ok = withImg.indexOf(D.norm(nm)) >= 0; chips.appendChild(h("span", { class: "chip " + (ok ? "ok" : "ph") }, (ok ? "✓ " : "◌ ") + nm + (ok ? "" : " (resimsiz: otomatik çizilir)"))); });
    if (r.names.length) box.appendChild(chips);
    if (st.candidates.length) {
      var cand = h("div", { class: "sc-chips" }, h("span", { class: "muted" }, "Karakter mi? "));
      st.candidates.forEach(function (nm) { cand.appendChild(h("button", { type: "button", class: "chip ph", style: "cursor:pointer", title: "Karakter olarak ekle", onclick: function () { App().addCastMember(nm); renderSummary(); } }, "+ " + nm)); });
      box.appendChild(cand);
    }
    if (sc.voice && sc.voice.enabled && root.Voice) {
      var vs = root.Voice.state, have = Object.keys(project().clips || {}).length, need = D.voiceLines(project()).length;
      box.appendChild(h("div", { class: "wz-sumline vo-sum" }, "🎙️ Seslendirme açık · " + (vs.status === "ok" ? "SesKlon bağlı" : vs.status === "checking" ? "bağlanılıyor…" : "SesKlon'a bağlı değil (1. adımdan Bağlan)") + " · " + need + " parça" + (have ? ", " + have + " hazır" : "")));
    }
    var warns = [];
    st.unknownActions.slice(0, 5).forEach(function (a) { warns.push("“" + a + "” anlaşılmadı; bekleme olarak işlenir. Eylem düğmelerindeki kalıpları kullan."); });
    if (!st.lines && !st.actions) warns.push("Henüz replik ya da eylem yok.");
    if (warns.length) box.appendChild(h("ul", { class: "warn" }, warns.map(function (w) { return h("li", null, w); })));
  }

  /* Film biçimi ve ince ayarlar (2. adım) */
  function renderFormat() {
    var p = project();
    document.querySelectorAll("#wzFormat button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-size") === p.width + "x" + p.height); });
  }
  function renderSettings() {
    var st = script().settings;
    $("wzCharHeight").value = Math.round(st.charHeight * 100); $("wzCharHeightLabel").textContent = "%" + Math.round(st.charHeight * 100);
    $("wzSpeed").value = st.speed; $("wzBubble").value = st.bubbleStyle;
    $("wzTitle").checked = st.titleCard; $("wzEnd").checked = st.endCard; $("wzHeadings").checked = st.headings; $("wzSfx").checked = st.sfx !== false;
  }
  function renderMusic() {
    var p = project(), box = $("wzMusic");
    box.innerHTML = "";
    if (p.audio) box.appendChild(h("span", { class: "name" }, "🎵 " + p.audio.name + " — videolara eklenir (GIF sessizdir)"));
    box.appendChild(h("button", { type: "button", class: "wz-btn", onclick: function () { $("fileAudio").value = ""; $("fileAudio").click(); } }, p.audio ? "Müziği değiştir" : "🎵 Müzik / ses ekle (MP3, WAV)"));
    if (p.audio) box.appendChild(h("button", { type: "button", class: "wz-btn ghost", onclick: function () { App().removeAudio(); renderMusic(); } }, "Kaldır"));
  }
  Easy.refreshFilm = function () { if (Easy.open && Easy.step === 3) { renderMusic(); renderFilmInfo(); } };

  /* ── 3 · Film ──────────────────────────────────────────────── */
  function renderFilmInfo() {
    var p = project(), total = root.Exporter.totalDuration(p), layers = p.scenes.reduce(function (s, x) { return s + x.layers.length; }, 0);
    $("wzFilmTitle").textContent = Easy.built ? "“" + p.name + "” hazır!" : "Film";
    var voiced = Easy.stats && Easy.stats.voiced ? " · 🎙️ " + Easy.stats.voiced + " parça seslendirildi" : "";
    $("wzFilmInfo").textContent = p.scenes.length + " sahne · " + fmtSec(total) + " · " + layers + " katman" + voiced + ". İzle, beğenmediğin yeri senaryoda değiştirip yeniden üret; sonra indir." + (total > 20 ? " Bu uzunlukta GIF büyük olur; video (MP4/WebM) öneririz." : "");
    var notes = $("wzNotes"); notes.innerHTML = "";
    if (Easy.warnings.length) notes.appendChild(h("details", { class: "wz-details" }, h("summary", null, Easy.warnings.length + " not"), h("ul", { class: "warn" }, Easy.warnings.map(function (w) { return h("li", null, w); }))));
    root.Exporter.detectSupport(p).then(function (sup) {
      var b = $("wzDlMp4"); b.disabled = !sup.mp4;
      b.title = sup.mp4 ? "Telefon ve sosyal medya için en uygunu" : "Bu tarayıcı MP4 üretemiyor; WebM indir ya da Chrome/Edge/Safari kullan";
      if (!sup.mp4) { b.classList.remove("primary"); document.querySelector('#wizard [data-fmt="webm"]').classList.add("primary"); }
    });
  }
  function fitCanvas() {
    var p = project(), c = $("wzCanvas"), wrap = c.parentElement;
    var full = !!document.fullscreenElement;
    var maxW = Math.min(full ? wrap.clientWidth : 960, wrap.clientWidth - 2), w = Math.round(maxW), hgt = Math.round(w * p.height / p.width);
    var maxH = full ? window.innerHeight - 70 : window.innerHeight * 0.55;
    if (hgt > maxH) { hgt = Math.round(maxH); w = Math.round(hgt * p.width / p.height); }
    c.width = Math.max(2, w); c.height = Math.max(2, hgt);
    preview.canvas = c; preview.ctx = c.getContext("2d");
  }
  function drawPreview() {
    if (!preview.ctx) fitCanvas();
    root.Exporter.renderFrame(project(), preview.T, preview.canvas, preview.ctx);
    var total = root.Exporter.totalDuration(project());
    $("wzSeek").value = Math.round(preview.T / total * 1000);
    $("wzTime").textContent = preview.T.toFixed(1).replace(".", ",") + " / " + total.toFixed(1).replace(".", ",") + " sn";
  }
  function tick(now) {
    if (!preview.playing) return;
    var total = root.Exporter.totalDuration(project());
    var rawT = preview.T0 + (now - preview.wall) / 1000;
    preview.T = rawT % total;
    if (rawT >= total) { preview.T0 = preview.T; preview.wall = now; if (root.Sfx) root.Sfx.live.play(project(), preview.T); if (project().audio) { try { $("audioEl").currentTime = preview.T; } catch (e) { /* yoksay */ } } }
    if (project().audio && root.Sfx && root.Sfx.duck) { var dv = (project().audio.volume == null ? 1 : project().audio.volume) * root.Sfx.duck(project(), preview.T); var ae = $("audioEl"); if (Math.abs(ae.volume - dv) > 0.01) ae.volume = dv; }
    drawPreview();
    preview.raf = requestAnimationFrame(tick);
  }
  function startPreview() {
    fitCanvas(); preview.T = 0; drawPreview();
    playPreview();
  }
  function playPreview() {
    if (preview.playing) return;
    preview.playing = true; preview.wall = performance.now(); preview.T0 = preview.T;
    $("wzPlay").textContent = "❚❚ Durdur";
    var au = $("audioEl"); if (project().audio) { try { au.currentTime = preview.T; au.play().catch(function () { /* yoksay */ }); } catch (e) { /* yoksay */ } }
    if (root.Sfx) root.Sfx.live.play(project(), preview.T);
    preview.raf = requestAnimationFrame(tick);
  }
  function pausePreview() {
    preview.playing = false; cancelAnimationFrame(preview.raf);
    $("wzPlay").textContent = "▶ Oynat";
    $("audioEl").pause();
    if (root.Sfx) root.Sfx.live.stop();
  }
  function stopPreview() { pausePreview(); }

  /* Örnek senaryonun karakterleri (resmi olmayanlar) kütüphaneden eklenir */
  Easy.addSampleCast = function () {
    var D = root.Director, have = script().cast.filter(function (c) { return c.images.length; }).map(function (c) { return D.norm(c.name); });
    var want = [{ id: "ali", name: "Ali" }, { id: "ayse", name: "Ayşe" }, { id: "kopek", name: "Karabaş" }, { id: "dede", name: "Dede" }].filter(function (w) { return have.indexOf(D.norm(w.name)) < 0; });
    if (!want.length || !root.Characters) return Promise.resolve([]);
    return App().addLibraryCast(want).then(function (added) { renderCast(); renderSummary(); return added; });
  };

  /* Üretim (seslendirme sürerken düğme “durdur” olur: eldeki kliplerle film kurulur) */
  var buildCtl = null;
  Easy.build = function () {
    var btn = $("wzBuild");
    if (buildCtl) { buildCtl.abort(); btn.textContent = "Durduruluyor…"; return; }
    script().text = $("wzText").value;
    if (!script().text.trim()) { renderSummary(); $("wzText").focus(); return; }
    btn.textContent = "Üretiliyor…";
    buildCtl = new AbortController();
    App().buildFromScript({ autoplay: false, signal: buildCtl.signal, onProgress: function (pr) {
      if (pr.phase === "Seslendiriliyor") btn.textContent = "⏹ Seslendiriliyor " + Math.min(pr.done + 1, pr.total) + "/" + pr.total + (pr.eta ? " · ~" + Math.round(pr.eta) + " sn" : "") + " — durdur";
      else btn.textContent = pr.phase + "…";
    } }).then(function (res) {
      buildCtl = null; btn.disabled = false; btn.textContent = "🎬 Filmi üret";
      Easy.built = true; Easy.warnings = res.warnings; Easy.stats = res.stats;
      Easy.goto(3);
    }).catch(function (err) {
      buildCtl = null; btn.disabled = false; btn.textContent = "🎬 Filmi üret";
      var box = $("wzSummary"); box.insertBefore(h("div", { class: "err" }, "Üretilemedi: " + (err && err.message || err)), box.firstChild);
    });
  };

  /* İndirme */
  var exportCtl = null;
  function download(fmt) {
    var p = project(), X = root.Exporter, prog = $("wzProgress"), bar = prog.querySelector("i"), txt = prog.querySelector("span"), res = $("wzResult");
    pausePreview();
    prog.hidden = false; bar.style.width = "0%"; txt.textContent = "Hazırlanıyor…"; res.innerHTML = "";
    document.querySelectorAll("#wizard [data-fmt]").forEach(function (b) { b.disabled = true; });
    exportCtl = { cancelled: false };
    $("wizard").scrollTo({ top: prog.offsetTop - 120, behavior: "smooth" });
    var base = "canlandir-" + X.safeName(p.name), job;
    function onProgress(pr) { var pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0; bar.style.width = pct + "%"; txt.textContent = pr.phase + " · %" + pct; }
    // GIF: paylaşıma uygun küçük boyut (en fazla 480 px genişlik, 12 fps, titremesiz); uzun filmlerde video önerilir
    if (fmt === "gif") job = X.exportGif(p, { fps: 12, scale: Math.min(1, 480 / p.width), dither: false, range: "all" }, onProgress, exportCtl).then(function (b) { return { blob: b, name: base + ".gif" }; });
    else job = X.exportVideo(p, { format: fmt, scale: 1, quality: "mid", range: "all" }, onProgress, exportCtl).then(function (r) { return { blob: r.blob, name: base + "." + r.ext, note: r.note }; });
    job.then(function (out) {
      prog.hidden = true;
      X.download(out.blob, out.name);
      var url = URL.createObjectURL(out.blob);
      res.appendChild(h("div", { class: "wz-done" }, "✅ İndirildi: ", h("b", null, out.name), " (" + fmtBytes(out.blob.size) + "). ",
        h("a", { href: url, download: out.name }, "Tekrar indir"), out.note ? h("div", { class: "hint" }, out.note) : ""));
      renderFilmInfo();
    }).catch(function (err) {
      prog.hidden = true;
      var msg = err && err.message || String(err);
      if (msg !== "İptal edildi") res.appendChild(h("div", { class: "err" }, "İndirilemedi: " + msg));
    }).then(function () { document.querySelectorAll("#wizard [data-fmt]").forEach(function (b) { b.disabled = false; }); renderFilmInfo(); });
  }

  /* ── Olaylar ───────────────────────────────────────────────── */
  Easy.init = function () {
    document.querySelectorAll("#wizard [data-go]").forEach(function (b) { b.addEventListener("click", function () { if (Easy.step === 2) { script().text = $("wzText").value; App().commit(); } Easy.goto(+b.getAttribute("data-go")); }); });
    document.querySelectorAll("#wzSteps li").forEach(function (li) { li.addEventListener("click", function () { var n = +li.getAttribute("data-step"); if (n === 3 && !Easy.built && !project().scenes.some(function (s) { return s.layers.length; })) { Easy.goto(2); return; } Easy.goto(n); }); });
    $("wzStudio").addEventListener("click", Easy.closeWizard);
    $("wzOpenStudio").addEventListener("click", Easy.closeWizard);
    $("btnEasy").addEventListener("click", function () { Easy.openWizard(); });
    $("wzAddBg").addEventListener("click", function () { App().pickBackgrounds(); });
    $("wzGallery").addEventListener("click", function () { root.UI.openGallery(function () { renderCast(); renderSummary(); }); });
    $("wzText").addEventListener("input", function () { script().text = $("wzText").value; clearTimeout(Easy._t); Easy._t = setTimeout(renderSummary, 250); });
    $("wzText").addEventListener("change", function () { App().commit(); });
    $("wzSample").addEventListener("click", function () {
      if ($("wzText").value.trim() && !confirm("Mevcut senaryo örnekle değiştirilsin mi?")) return;
      $("wzText").value = root.Director.SAMPLE; script().text = root.Director.SAMPLE; App().commit(); renderSummary();
      Easy.addSampleCast();
    });
    document.querySelectorAll("#wizard [data-ins]").forEach(function (b) {
      b.addEventListener("click", function () {
        var kind = b.getAttribute("data-ins");
        if (kind === "scene") { var n = root.Director.parse($("wzText").value).scenes.length + 1, head = "SAHNE " + n + " - "; insertLine(head + "MEKÂN - GÜNDÜZ", { select: [head.length, head.length + 5], blankBefore: true }); }
        else if (kind === "narr") insertLine("ANLATICI: ");
      });
    });
    $("wzLineBtn").addEventListener("click", function (ev) { ev.stopPropagation(); var m = $("wzLineMenu"); var open = m.hidden; closeMenus(); if (open) { buildLineMenu(); m.hidden = false; } });
    $("wzActBtn").addEventListener("click", function (ev) { ev.stopPropagation(); var m = $("wzActMenu"); var open = m.hidden; closeMenus(); if (open) { buildActMenu(); m.hidden = false; } });
    document.addEventListener("click", function (ev) { if (!ev.target.closest(".wz-dd")) closeMenus(); });
    $("wzBuild").addEventListener("click", Easy.build);
    $("wzPlay").addEventListener("click", function () { if (preview.playing) pausePreview(); else playPreview(); });
    $("wzSeek").addEventListener("input", function () { var total = root.Exporter.totalDuration(project()); preview.T = +$("wzSeek").value / 1000 * total; preview.T0 = preview.T; preview.wall = performance.now(); if (project().audio) { try { $("audioEl").currentTime = preview.T; } catch (e) { /* yoksay */ } } if (preview.playing && root.Sfx) root.Sfx.live.play(project(), preview.T); drawPreview(); });
    document.querySelectorAll("#wizard [data-fmt]").forEach(function (b) { b.addEventListener("click", function () { download(b.getAttribute("data-fmt")); }); });
    $("wzSaveProj").addEventListener("click", function () { App().saveProjectFile(); });
    $("wzCancel").addEventListener("click", function () { if (exportCtl) exportCtl.cancelled = true; });
    $("wzFull").addEventListener("click", function () { var el = document.querySelector(".wz-player"); if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(function () { /* yoksay */ }); });
    document.addEventListener("fullscreenchange", function () { if (Easy.open && Easy.step === 3) { fitCanvas(); drawPreview(); } });
    document.querySelectorAll("#wzFormat button").forEach(function (b) {
      b.addEventListener("click", function () {
        var wh = b.getAttribute("data-size").split("x");
        App().setStageSize(+wh[0], +wh[1]); renderFormat();
        if (project().scenes.some(function (s) { return s.layers.length; })) App().toast("Biçim değişti; “Filmi üret” deyince yeni biçimde kurulur");
      });
    });
    $("wzCharHeight").addEventListener("input", function () { var v = parseInt($("wzCharHeight").value, 10); script().settings.charHeight = v / 100; $("wzCharHeightLabel").textContent = "%" + v; });
    $("wzCharHeight").addEventListener("change", function () { App().commit(); });
    $("wzSpeed").addEventListener("change", function () { script().settings.speed = $("wzSpeed").value; App().commit(); renderSummary(); });
    $("wzBubble").addEventListener("change", function () { script().settings.bubbleStyle = $("wzBubble").value; App().commit(); });
    [["wzTitle", "titleCard"], ["wzEnd", "endCard"], ["wzHeadings", "headings"], ["wzSfx", "sfx"]].forEach(function (pair) { $(pair[0]).addEventListener("change", function () { script().settings[pair[1]] = $(pair[0]).checked; App().commit(); }); });
    window.addEventListener("resize", function () { if (Easy.open && Easy.step === 3) { fitCanvas(); drawPreview(); } });
    $("wzCanvas").addEventListener("click", function () { if (preview.playing) pausePreview(); else playPreview(); });
  };
})(window);
