/* Canlandır — arayüz katmanı: katman listesi, özellikler paneli, zaman çizelgesi, sahne sekmeleri, pencereler.
   Durum ve işlemler App (app.js) üzerinde; burası yalnızca çizer ve olayları App'e iletir. */
(function (root) {
  "use strict";
  var M = root.Motion, R = root.Render, X = root.Exporter, Model = root.Model;
  function $(id) { return document.getElementById(id); }

  /* Küçük DOM yardımcısı: h("div", {class: "a", onclick: fn}, "metin", child, [children]) */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = !!v;
      else if (k === "disabled") e.disabled = !!v;
      else if (k === "style") e.style.cssText = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(e, x); }); return; }
    e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function fmt(n, d) { return (+n).toFixed(d == null ? 2 : d).replace(".", ","); }
  function fmtTime(t) { return fmt(t, 2) + " sn"; }

  var UI = { collapsed: {}, fxOpen: {}, pickerOpen: false, ratioLock: true, sceneW: 0 };
  root.UI = UI;

  /* ── Katman listesi ──────────────────────────────────────── */
  UI.renderLayers = function () {
    var App = root.App, sc = App.scene(), list = $("layerList");
    list.innerHTML = "";
    $("layerCount").textContent = sc.layers.length || "";
    if (!sc.layers.length) {
      list.appendChild(h("li", { class: "layer-empty" }, "Henüz katman yok. Yukarıdan görsel ekleyin ya da sahneye sürükleyin."));
    }
    for (var i = sc.layers.length - 1; i >= 0; i--) {
      (function (L, idx) {
        var sel = L.id === App.S.sel.layerId;
        var thumb = R.thumbnail(App.S.project, L, 88, 60);
        var nameEl = h("span", { class: "lname", text: L.name, title: L.name + " (çift tık: yeniden adlandır)" });
        var li = h("li", { class: "layer-item" + (sel ? " selected" : "") + (L.visible ? "" : " hidden-layer"), draggable: "true", "data-id": L.id, "data-index": idx,
          onclick: function (ev) { if (ev.target.closest(".lbtn") || ev.target.tagName === "INPUT") return; App.selectLayer(L.id); },
          ondblclick: function (ev) { if (ev.target.closest(".lbtn")) return; startRename(nameEl, L); },
          ondragstart: function (ev) { ev.dataTransfer.setData("text/plain", String(idx)); ev.dataTransfer.effectAllowed = "move"; },
          ondragover: function (ev) { ev.preventDefault(); li.classList.add("dragover"); },
          ondragleave: function () { li.classList.remove("dragover"); },
          ondrop: function (ev) { ev.preventDefault(); li.classList.remove("dragover"); var from = parseInt(ev.dataTransfer.getData("text/plain"), 10); if (Number.isFinite(from) && from !== idx) App.reorderLayer(from, idx); }
        },
          thumb ? h("img", { src: thumb, alt: "" }) : h("span", { class: "thumb-ph" }),
          nameEl,
          h("button", { class: "lbtn" + (L.visible ? " on" : ""), type: "button", title: L.visible ? "Gizle" : "Göster", "aria-label": "Görünürlük",
            onclick: function () { L.visible = !L.visible; App.commit(); App.markDirty(); UI.renderLayers(); UI.renderProps(); } }, L.visible ? "👁" : "🙈"),
          h("button", { class: "lbtn" + (L.locked ? " on" : ""), type: "button", title: L.locked ? "Kilidi aç" : "Kilitle (sahnede seçilemez)", "aria-label": "Kilit",
            onclick: function () { L.locked = !L.locked; App.commit(); UI.renderLayers(); UI.renderProps(); } }, L.locked ? "🔒" : "🔓")
        );
        list.appendChild(li);
      })(sc.layers[i], i);
    }
    var L = App.selLayer(), n = sc.layers.length, pos = L ? sc.layers.indexOf(L) : -1;
    $("btnLayerUp").disabled = !L || pos >= n - 1;
    $("btnLayerDown").disabled = !L || pos <= 0;
    $("btnLayerDup").disabled = !L;
    $("btnLayerDel").disabled = !L;
  };

  function startRename(nameEl, L) {
    var inp = h("input", { type: "text", value: L.name, maxlength: "80" });
    nameEl.textContent = ""; nameEl.appendChild(inp); inp.focus(); inp.select();
    var done = false;
    function finish(save) {
      if (done) return; done = true;
      if (save && inp.value.trim()) { L.name = inp.value.trim().slice(0, 80); root.App.commit(); }
      UI.renderLayers(); UI.renderProps(); UI.renderTimeline();
    }
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") finish(true); if (ev.key === "Escape") finish(false); ev.stopPropagation(); });
    inp.addEventListener("blur", function () { finish(true); });
    inp.addEventListener("click", function (ev) { ev.stopPropagation(); });
  }

  /* ── Film ayarları (sol alt) ─────────────────────────────── */
  UI.renderFilmSettings = function () {
    var App = root.App, p = App.S.project, sel = $("stageSize");
    if (!sel.options.length) {
      Model.STAGE_PRESETS.forEach(function (ps) { sel.appendChild(h("option", { value: ps.id, text: ps.label })); });
      sel.appendChild(h("option", { value: "custom", text: "Özel boyut" }));
    }
    var match = Model.STAGE_PRESETS.find(function (ps) { return ps.w === p.width && ps.h === p.height; });
    sel.value = match ? match.id : "custom";
    $("stageW").value = p.width; $("stageH").value = p.height;
    $("projectFps").value = String(p.fps);
    if (!$("projectFps").value) { $("projectFps").appendChild(h("option", { value: String(p.fps), text: p.fps + " fps" })); $("projectFps").value = String(p.fps); }
    $("projectName").value = p.name;
    var a = p.audio;
    $("audioName").textContent = a ? "🎵 " + a.name : "Ses yok";
    $("btnAudio").textContent = a ? "Değiştir" : "Ses ekle";
    $("btnAudioRemove").hidden = !a;
    $("audioVolRow").hidden = !a;
    if (a) $("audioVol").value = a.volume;
  };

  /* ── Sahne sekmeleri ─────────────────────────────────────── */
  UI.renderSceneTabs = function () {
    var App = root.App, p = App.S.project, box = $("sceneTabs");
    box.innerHTML = "";
    p.scenes.forEach(function (sc, i) {
      box.appendChild(h("button", { type: "button", role: "tab", class: "scene-tab" + (i === App.S.sceneIndex ? " active" : ""), title: sc.name + " · " + fmtTime(sc.duration) + " (çift tık: ayarlar)",
        onclick: function () { if (i !== App.S.sceneIndex) App.switchScene(i); },
        ondblclick: function () { App.selectLayer(null); } }, (i + 1) + ". " + sc.name));
    });
    box.appendChild(h("button", { type: "button", class: "scene-tab add", title: "Yeni sahne ekle", onclick: function () { App.addScene(); } }, "+"));
    $("sceneDuration").value = App.scene().duration;
  };

  /* ── Özellikler paneli ───────────────────────────────────── */
  function section(id, title, bodyChildren, extraHead) {
    var collapsed = !!UI.collapsed[id];
    var sec = h("div", { class: "prop-section" + (collapsed ? " collapsed" : ""), "data-sec": id });
    var head = h("h3", { onclick: function (ev) { if (ev.target.closest("button,input,select")) return; UI.collapsed[id] = !UI.collapsed[id]; sec.classList.toggle("collapsed"); } },
      h("span", null, title), h("span", { class: "row" }, extraHead || null, h("span", { class: "chev" }, "▼")));
    sec.appendChild(head);
    sec.appendChild(h("div", { class: "body" }, bodyChildren));
    return sec;
  }
  function numField(label, opts) {
    var inp = h("input", Object.assign({ type: "number" }, opts.attrs || {}));
    if (opts.bind) inp.setAttribute("data-bind", opts.bind);
    inp.value = opts.value;
    if (opts.onInput) inp.addEventListener("input", function () { var v = parseFloat(inp.value); if (Number.isFinite(v)) opts.onInput(v); });
    if (opts.onChange) inp.addEventListener("change", function () { var v = parseFloat(inp.value); if (Number.isFinite(v)) opts.onChange(v); else UI.syncProps(); });
    var lab = h("label", { class: "field" + (opts.inline ? " inline" : "") }, h("span", null, label, opts.unit ? h("span", { class: "unit" }, " " + opts.unit) : null), inp);
    lab.input = inp;
    return lab;
  }
  function selectField(label, options, value, onChange, attrs) {
    var sel = h("select", attrs || {});
    options.forEach(function (o) { sel.appendChild(h("option", { value: o.value, text: o.label })); });
    sel.value = value;
    sel.addEventListener("change", function () { onChange(sel.value); });
    return h("label", { class: "field" }, h("span", null, label), sel);
  }
  function sliderField(label, pd, value, onInput, onChange) {
    var range = h("input", { type: "range", min: pd.min, max: pd.max, step: pd.step, value: value });
    var num = h("input", { type: "number", min: pd.min, max: pd.max, step: pd.step, value: value });
    function set(v, commit) { v = Math.max(pd.min, Math.min(pd.max, v)); range.value = v; num.value = v; onInput(v); if (commit) onChange(v); }
    range.addEventListener("input", function () { set(parseFloat(range.value), false); });
    range.addEventListener("change", function () { set(parseFloat(range.value), true); });
    num.addEventListener("change", function () { var v = parseFloat(num.value); if (Number.isFinite(v)) set(v, true); });
    return h("div", { class: "slider" }, h("span", null, label, pd.unit ? h("span", { class: "unit" }, " " + pd.unit) : null), range, num);
  }

  UI.renderProps = function () {
    var App = root.App, box = $("props"), p = App.S.project, sc = App.scene(), L = App.selLayer();
    box.innerHTML = "";
    if (!L) { renderSceneProps(box, p, sc); return; }
    var t = App.S.time;
    var typeIcon = L.type === "text" ? "💬" : L.type === "sequence" ? "🎞️" : "🖼️";
    var nameInp = h("input", { type: "text", value: L.name, maxlength: "80", "aria-label": "Katman adı",
      onchange: function () { L.name = nameInp.value.trim().slice(0, 80) || L.name; App.commit(); UI.renderLayers(); UI.renderTimeline(); } });
    box.appendChild(h("div", { class: "prop-head" }, h("span", { class: "type", title: L.type === "text" ? "Metin" : L.type === "sequence" ? "Kare dizisi" : "Görsel" }, typeIcon), nameInp,
      h("button", { type: "button", class: "small toggle" + (L.visible ? " active" : ""), title: "Görünür", onclick: function () { L.visible = !L.visible; App.commit(); App.markDirty(); UI.renderLayers(); UI.renderProps(); } }, "👁"),
      h("button", { type: "button", class: "small toggle" + (L.locked ? " active" : ""), title: "Kilitli: sahnede seçilemez", onclick: function () { L.locked = !L.locked; App.commit(); UI.renderLayers(); UI.renderProps(); } }, "🔒")));

    /* Dönüşüm */
    var size = R.layerSize(L, p);
    var hasKeys = M.hasAnyKey(L), keyHere = M.keyTimes(L).some(function (k) { return Math.abs(k - t) < 1e-4; });
    function live(prop) { return function (v) { var created = App.setLayerProp(L, prop, v); App.markDirty(); if (created) UI.renderTimeline(); UI.syncProps(); }; }
    function commitFn() { return function () { App.commit(); UI.renderTimeline(); }; }
    var ratioLock = h("input", { type: "checkbox", checked: UI.ratioLock, onchange: function () { UI.ratioLock = ratioLock.checked; } });
    function setScalePct(v) { var s = v / 100; App.setLayerProp(L, "sx", s); App.setLayerProp(L, "sy", UI.ratioLock ? s : App.editValue(L, "sy")); App.markDirty(); UI.syncProps(); }
    function setW(v) { var sx = Math.max(0.001, v) / size.w; var sign = App.editValue(L, "sx") < 0 ? -1 : 1; App.setLayerProp(L, "sx", sx * sign); if (UI.ratioLock) App.setLayerProp(L, "sy", sx * (App.editValue(L, "sy") < 0 ? -1 : 1)); App.markDirty(); UI.syncProps(); }
    function setH(v) { var sy = Math.max(0.001, v) / size.h; var sign = App.editValue(L, "sy") < 0 ? -1 : 1; App.setLayerProp(L, "sy", sy * sign); if (UI.ratioLock) App.setLayerProp(L, "sx", sy * (App.editValue(L, "sx") < 0 ? -1 : 1)); App.markDirty(); UI.syncProps(); }
    var anchorGrid = h("div", { class: "anchor-grid", title: "Dayanak noktası: döndürme ve ölçek buradan yapılır" });
    [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]].forEach(function (a) {
      anchorGrid.appendChild(h("button", { type: "button", class: (Math.abs(L.anchor.x - a[0]) < 0.01 && Math.abs(L.anchor.y - a[1]) < 0.01) ? "on" : "", "aria-label": "Dayanak " + a[0] + "," + a[1],
        onclick: function () { App.setAnchor(L, a[0], a[1]); App.commit(); UI.renderProps(); App.markDirty(); } }));
    });
    var keyBtn = h("button", { type: "button", class: "keybtn" + (keyHere ? " on" : ""), title: keyHere ? "Bu karedeki anahtarı kaldır" : "Bu kareye anahtar kare ekle (K)", onclick: function () { App.toggleKeyAt(L, t); } }, "◆");
    var easeRow = null;
    if (keyHere) {
      var curEase = "easeInOutQuad";
      Object.keys(L.tracks).some(function (k) { var i = M.findKey(L.tracks[k], t); if (i >= 0) { curEase = L.tracks[k][i].e; return true; } return false; });
      easeRow = selectField("Sonraki kareye geçiş", M.EASING_LIST.map(function (e) { return { value: e.id, label: e.label }; }), curEase, function (v) { App.setKeyEase(L, t, v); });
    }
    box.appendChild(section("transform", "Konum ve boyut", [
      h("div", { class: "grid2" },
        numField("X", { bind: "x", value: Math.round(App.editValue(L, "x")), unit: "px", onInput: live("x"), onChange: commitFn(), attrs: { step: "1" } }),
        numField("Y", { bind: "y", value: Math.round(App.editValue(L, "y")), unit: "px", onInput: live("y"), onChange: commitFn(), attrs: { step: "1" } })),
      h("div", { class: "grid3" },
        numField("Ölçek", { bind: "scale", value: +(App.editValue(L, "sx") * 100).toFixed(1), unit: "%", onInput: setScalePct, onChange: commitFn(), attrs: { step: "1" } }),
        numField("Genişlik", { bind: "w", value: Math.round(size.w * Math.abs(App.editValue(L, "sx"))), unit: "px", onInput: setW, onChange: commitFn(), attrs: { step: "1", min: "1" } }),
        numField("Yükseklik", { bind: "h", value: Math.round(size.h * Math.abs(App.editValue(L, "sy"))), unit: "px", onInput: setH, onChange: commitFn(), attrs: { step: "1", min: "1" } })),
      h("label", { class: "check" }, ratioLock, "En-boy oranını koru"),
      h("div", { class: "grid2" },
        numField("Açı", { bind: "rot", value: +App.editValue(L, "rot").toFixed(1), unit: "°", onInput: live("rot"), onChange: commitFn(), attrs: { step: "1" } }),
        numField("Opaklık", { bind: "opacity", value: Math.round(App.editValue(L, "opacity") * 100), unit: "%", onInput: function (v) { live("opacity")(Math.max(0, Math.min(100, v)) / 100); }, onChange: commitFn(), attrs: { step: "5", min: "0", max: "100" } })),
      h("div", { class: "row" },
        h("div", { class: "pill-row" },
          h("button", { type: "button", class: L.flipX ? "on" : "", title: "Yatay yansıt", onclick: function () { L.flipX = !L.flipX; App.commit(); App.markDirty(); UI.renderProps(); } }, "⇋ Yansıt"),
          h("button", { type: "button", class: L.flipY ? "on" : "", title: "Dikey yansıt", onclick: function () { L.flipY = !L.flipY; App.commit(); App.markDirty(); UI.renderProps(); } }, "⇅ Yansıt")),
        h("span", { style: "flex:1" }), h("span", { class: "unit" }, "Dayanak"), anchorGrid),
      h("div", { class: "row" }, keyBtn, h("span", { style: "flex:1;font-size:12px" }, keyHere ? "Bu karede anahtar kare var" : (hasKeys ? "Bu katmanın " + M.keyTimes(L).length + " anahtar karesi var" : "Anahtar kare yok (sabit konum)")),
        hasKeys ? h("button", { type: "button", class: "small danger", title: "Tüm anahtar kareleri sil; katman şu anki konumunda kalır", onclick: function () { App.clearKeys(L); } }, "Tümünü sil") : null),
      easeRow,
      hasKeys ? null : h("p", { class: "hint" }, "İpucu: zamanı değiştirip ◆'a basın, katmanı yeni yerine sürükleyin; arası kendiliğinden dolar.")
    ]));

    /* Efektler */
    var fxList = h("div", { class: "fx-picker" });
    if (!L.effects.length && !UI.pickerOpen) fxList.appendChild(h("div", { class: "notice" }, "Henüz hareket yok. “Efekt ekle” ile tek tıkla zıplatın, yürütün, uçurun."));
    L.effects.forEach(function (eff) { fxList.appendChild(renderEffect(L, eff)); });
    var addBtn = h("button", { type: "button", class: UI.pickerOpen ? "primary" : "", onclick: function () { UI.pickerOpen = !UI.pickerOpen; UI.renderProps(); } }, UI.pickerOpen ? "Kapat" : "+ Efekt ekle");
    var picker = UI.pickerOpen ? renderPicker(L) : null;
    box.appendChild(section("fx", "Hareket efektleri" + (L.effects.length ? " (" + L.effects.length + ")" : ""), [addBtn, picker, fxList]));

    /* Zamanlama */
    var toEnd = L.outPoint == null;
    box.appendChild(section("timing", "Zamanlama", [
      h("div", { class: "grid2" },
        numField("Giriş", { value: +L.inPoint.toFixed(2), unit: "sn", onChange: function (v) { App.setInOut(L, v, L.outPoint); }, attrs: { step: "0.1", min: "0" } }),
        numField("Çıkış", { value: toEnd ? +sc.duration.toFixed(2) : +L.outPoint.toFixed(2), unit: "sn", onChange: function (v) { App.setInOut(L, L.inPoint, v); }, attrs: { step: "0.1", min: "0", disabled: toEnd } })),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: toEnd, onchange: function (ev) { App.setInOut(L, L.inPoint, ev.target.checked ? null : Math.min(sc.duration, Math.max(L.inPoint + 1 / p.fps, App.S.time + 1 / p.fps))); } }), "Sahne sonuna kadar görünsün"),
      h("div", { class: "pill-row" },
        h("button", { type: "button", title: "Giriş zamanını oynatma kafasına al (I)", onclick: function () { App.setInOut(L, App.S.time, L.outPoint); } }, "Girişi buraya al"),
        h("button", { type: "button", title: "Çıkış zamanını oynatma kafasına al (O)", onclick: function () { App.setInOut(L, L.inPoint, App.S.time); } }, "Çıkışı buraya al"))
    ]));

    /* Türe özel */
    if (L.type === "text") box.appendChild(renderTextProps(L));
    else box.appendChild(renderFrameProps(L, p));
  };

  function renderEffect(L, eff) {
    var App = root.App, def = M.EFFECTS[eff.type], sc = App.scene();
    var open = UI.fxOpen[eff.id] !== false;
    var item = h("div", { class: "fx-item" + (open ? "" : " collapsed") + (eff.enabled === false ? " off" : "") });
    var head = h("div", { class: "fx-head", onclick: function (ev) { if (ev.target.closest("button,input")) return; UI.fxOpen[eff.id] = !open; item.classList.toggle("collapsed"); } },
      h("span", { class: "fx-ico" }, def.icon), h("span", { class: "fx-label" }, def.label), h("span", { class: "fx-kind" }, def.group),
      h("input", { type: "checkbox", checked: eff.enabled !== false, title: "Efekti aç/kapat", onchange: function (ev) { eff.enabled = ev.target.checked; App.commit(); App.markDirty(); UI.renderProps(); } }),
      h("button", { type: "button", title: "Efekti kaldır", onclick: function () { App.removeEffect(L, eff.id); } }, "✕"));
    var body = h("div", { class: "fx-body" }, h("p", { class: "fx-desc" }, def.desc));
    def.params.forEach(function (pd) {
      if (pd.type === "range") {
        body.appendChild(sliderField(pd.label, pd, eff.params[pd.key], function (v) { eff.params[pd.key] = v; App.markDirty(); }, function () { App.commit(); }));
      } else {
        body.appendChild(selectField(pd.label, pd.options, eff.params[pd.key], function (v) { eff.params[pd.key] = v; App.commit(); App.markDirty(); }));
      }
    });
    var w = M.effectWindow(eff, sc.duration);
    var winRow = h("div", { class: "grid2" },
      numField(def.kind === "out" ? "Başlangıç" : "Başlangıç", { value: +w.start.toFixed(2), unit: "sn", attrs: { step: "0.1", min: "0" }, onChange: function (v) { eff.start = Math.max(0, v); if (eff.end != null && eff.end < eff.start) eff.end = eff.start; App.commit(); App.markDirty(); UI.renderProps(); UI.renderTimeline(); } }),
      numField("Bitiş", { value: +w.end.toFixed(2), unit: "sn", attrs: { step: "0.1", min: "0" }, onChange: function (v) { eff.end = Math.max(eff.start || 0, v); App.commit(); App.markDirty(); UI.renderProps(); UI.renderTimeline(); } }));
    body.appendChild(winRow);
    if (def.kind === "loop") body.appendChild(h("label", { class: "check" }, h("input", { type: "checkbox", checked: eff.end == null, onchange: function (ev) { eff.end = ev.target.checked ? null : sc.duration; App.commit(); App.markDirty(); UI.renderProps(); UI.renderTimeline(); } }), "Sahne sonuna kadar sürsün"));
    item.appendChild(head); item.appendChild(body);
    return item;
  }

  function renderPicker(L) {
    var App = root.App, groups = {}, order = [];
    M.EFFECT_LIST.forEach(function (d) { if (!groups[d.group]) { groups[d.group] = []; order.push(d.group); } groups[d.group].push(d); });
    var box = h("div", { class: "fx-picker" });
    order.forEach(function (g) {
      var grid = h("div", { class: "fx-grid" });
      groups[g].forEach(function (d) {
        grid.appendChild(h("button", { type: "button", class: "fx-pick", title: d.desc, onclick: function () { var eff = App.addEffect(L, d.type); UI.fxOpen[eff.id] = true; UI.pickerOpen = false; UI.renderProps(); } },
          h("span", { class: "ico" }, d.icon), d.label));
      });
      box.appendChild(h("div", { class: "fx-group" }, h("h4", null, g), grid));
    });
    return box;
  }

  function renderTextProps(L) {
    var App = root.App, t = L.text;
    function upd(fn) { return function (v) { fn(v); App.markDirty(); }; }
    function cm() { App.commit(); UI.renderLayers(); }
    var ta = h("textarea", { rows: "3", value: t.content, "data-text-input": "1", oninput: function () { t.content = ta.value.slice(0, 2000); App.markDirty(); }, onchange: cm });
    var sizeF = numField("Boyut", { value: t.size, unit: "px", attrs: { min: "6", max: "600", step: "2" }, onInput: upd(function (v) { t.size = Math.max(6, Math.min(600, v)); }), onChange: cm });
    var mwF = numField("Satır genişliği", { value: t.maxWidth, unit: "px", attrs: { min: "40", max: "4000", step: "10" }, onInput: upd(function (v) { t.maxWidth = Math.max(40, v); }), onChange: cm });
    var swF = numField("Kontur", { value: t.strokeWidth, unit: "px", attrs: { min: "0", max: "40", step: "1" }, onInput: upd(function (v) { t.strokeWidth = Math.max(0, v); }), onChange: cm });
    var colorRow = h("div", { class: "row" },
      h("label", { class: "field inline" }, h("span", null, "Yazı"), h("input", { type: "color", value: t.color, oninput: function (ev) { t.color = ev.target.value; App.markDirty(); }, onchange: cm })),
      h("label", { class: "field inline" }, h("span", null, "Kontur"), h("input", { type: "color", value: t.stroke, oninput: function (ev) { t.stroke = ev.target.value; App.markDirty(); }, onchange: cm })),
      h("label", { class: "field inline" }, h("span", null, "Balon"), h("input", { type: "color", value: t.bubbleColor, oninput: function (ev) { t.bubbleColor = ev.target.value; App.markDirty(); }, onchange: cm })));
    var alignRow = h("div", { class: "pill-row" }, [["left", "Sol"], ["center", "Orta"], ["right", "Sağ"]].map(function (a) {
      return h("button", { type: "button", class: t.align === a[0] ? "on" : "", onclick: function () { t.align = a[0]; cm(); App.markDirty(); UI.renderProps(); } }, a[1]);
    }), h("button", { type: "button", class: t.weight === "700" ? "on" : "", title: "Kalın", onclick: function () { t.weight = t.weight === "700" ? "400" : "700"; cm(); App.markDirty(); UI.renderProps(); } }, "B"));
    return section("text", "Metin ve balon", [
      ta,
      selectField("Yazı tipi", Model.FONTS.map(function (f) { return { value: f.id, label: f.label }; }), t.font, function (v) { t.font = v; cm(); App.markDirty(); }),
      h("div", { class: "grid3" }, sizeF, mwF, swF),
      alignRow, colorRow,
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: t.bubble, onchange: function (ev) { t.bubble = ev.target.checked; cm(); App.markDirty(); UI.renderProps(); } }), "Konuşma balonu çiz"),
      t.bubble ? selectField("Balon kuyruğu", [{ value: "left", label: "Sol alt" }, { value: "right", label: "Sağ alt" }, { value: "none", label: "Kuyruksuz" }], t.bubbleTail, function (v) { t.bubbleTail = v; cm(); App.markDirty(); }) : null
    ]);
  }

  function renderFrameProps(L, p) {
    var App = root.App, strip = h("div", { class: "frames-strip" });
    var cur = M.frameIndex(L, App.S.time);
    L.frames.forEach(function (id, i) {
      var a = p.assets[id];
      strip.appendChild(h("div", { class: "frame-thumb" + (i === cur ? " current" : ""), style: a ? "background-image:url(" + a.dataUrl + ")" : "", title: a ? a.name : "" },
        h("span", null, i + 1),
        L.frames.length > 1 ? h("button", { type: "button", title: "Bu kareyi çıkar", onclick: function () { App.removeFrame(L, i); } }, "×") : null));
    });
    var btns = h("div", { class: "pill-row" },
      h("button", { type: "button", onclick: function () { App.pickFrames(L, "add"); } }, "+ Kare ekle"),
      h("button", { type: "button", onclick: function () { App.pickFrames(L, "replace"); } }, "Görseli değiştir"));
    var fsInfo = (L.frameSets && L.frameSets.length) ? h("div", { class: "row" }, h("span", { class: "hint", style: "flex:1" }, L.frameSets.length + " zamanlı kare penceresi (senaryo üretimi: konuşma/yürüme/duygu)"),
      h("button", { type: "button", class: "small", onclick: function () { L.frameSets = []; App.commit(); App.markDirty(); UI.renderProps(); } }, "Temizle")) : null;
    var seq = L.frames.length > 1 ? [
      sliderField("Kare hızı", { min: 1, max: 30, step: 1, unit: "fps" }, L.frameFps, function (v) { L.frameFps = v; App.markDirty(); }, function () { App.commit(); }),
      selectField("Oynatma", [{ value: "loop", label: "Döngü" }, { value: "pingpong", label: "Gidip gel" }, { value: "once", label: "Bir kez (son karede kal)" }], L.frameMode, function (v) { L.frameMode = v; App.commit(); App.markDirty(); })
    ] : h("p", { class: "hint" }, "Birden çok çizim eklerseniz kareler sırayla oynar (yürüme döngüsü, konuşan ağız…)."); 
    return section("frames", L.frames.length > 1 ? "Kareler (" + L.frames.length + ")" : "Görsel", [strip, btns, seq, fsInfo]);
  }

  function renderSceneProps(box, p, sc) {
    var App = root.App, bg = sc.background;
    box.appendChild(h("div", { class: "notice" }, "Sahnedeki bir katmanı tıklayın; konum, hareket ve zamanlama ayarları burada görünür."));
    var nameInp = h("input", { type: "text", value: sc.name, maxlength: "60", onchange: function () { sc.name = nameInp.value.trim().slice(0, 60) || sc.name; App.commit(); UI.renderSceneTabs(); } });
    function bgType(type) { return h("button", { type: "button", class: bg.type === type ? "on" : "", onclick: function () { if (type === "image" && !bg.assetId) { App.pickBgImage(); return; } bg.type = type; App.commit(); App.markDirty(); UI.renderProps(); } }); }
    var typeRow = h("div", { class: "pill-row" });
    [["color", "Düz renk"], ["gradient", "Renk geçişi"], ["image", "Görsel"], ["transparent", "Saydam"]].forEach(function (x) { var b = bgType(x[0]); b.textContent = x[1]; typeRow.appendChild(b); });
    var colorRow = h("div", { class: "row" },
      h("label", { class: "field inline" }, h("span", null, bg.type === "gradient" ? "Üst" : "Renk"), h("input", { type: "color", value: bg.color, oninput: function (ev) { bg.color = ev.target.value; App.markDirty(); }, onchange: function () { App.commit(); } })),
      bg.type === "gradient" ? h("label", { class: "field inline" }, h("span", null, "Alt"), h("input", { type: "color", value: bg.color2, oninput: function (ev) { bg.color2 = ev.target.value; App.markDirty(); }, onchange: function () { App.commit(); } })) : null,
      bg.type === "gradient" ? h("label", { class: "field inline", style: "flex:1" }, h("span", null, "Açı"), h("input", { type: "range", min: "0", max: "360", step: "5", value: bg.angle, oninput: function (ev) { bg.angle = +ev.target.value; App.markDirty(); }, onchange: function () { App.commit(); } })) : null);
    var imgRow = bg.type === "image" ? h("div", { class: "pill-row" }, h("button", { type: "button", onclick: function () { App.pickBgImage(); } }, "Görseli değiştir"), h("button", { type: "button", class: "danger", onclick: function () { bg.assetId = null; bg.type = "color"; App.commit(); App.markDirty(); UI.renderProps(); } }, "Kaldır")) : null;
    var trn = sc.transition;
    box.appendChild(section("scene", "Sahne: " + sc.name, [
      h("label", { class: "field" }, h("span", null, "Sahne adı"), nameInp),
      numField("Süre", { value: sc.duration, unit: "sn", attrs: { min: "0.5", max: "600", step: "0.5" }, onChange: function (v) { App.setSceneDuration(v); } }),
      h("span", { class: "unit" }, "Arka plan"), typeRow,
      bg.type === "transparent" ? h("p", { class: "hint" }, "Saydam arka plan PNG dizisinde ve GIF'te korunur; videolarda siyah görünür.") : colorRow,
      imgRow,
      selectField("Sahne sonunda", [{ value: "none", label: "Doğrudan kes" }, { value: "fade", label: "Siyaha geçiş" }, { value: "iris", label: "İris (daire kapanır)" }, { value: "wipe", label: "Silme (soldan sağa)" }], trn.type, function (v) { trn.type = v; App.commit(); App.markDirty(); UI.renderProps(); }),
      selectField("Renk tonu", [{ value: "", label: "Yok" }, { value: "sabah", label: "Sabah (sıcak, açık)" }, { value: "aksam", label: "Akşam (turuncu)" }, { value: "gece", label: "Gece (mavi)" }, { value: "sepya", label: "Sepya (eski film)" }],
        sc.grade ? (sc.grade.color === "#8fa6ff" ? "gece" : sc.grade.color === "#ffc28c" ? "aksam" : sc.grade.color === "#ffe9c8" ? "sabah" : sc.grade.color === "#e0c9a0" ? "sepya" : "") : "",
        function (v) { var G = { sabah: { color: "#ffe9c8", alpha: 0.25 }, aksam: { color: "#ffc28c", alpha: 0.3 }, gece: { color: "#8fa6ff", alpha: 0.45 }, sepya: { color: "#e0c9a0", alpha: 0.55 } }; sc.grade = G[v] || null; App.commit(); App.markDirty(); }),
      trn.type !== "none" ? numField("Geçiş süresi", { value: trn.duration, unit: "sn", attrs: { min: "0.1", max: "5", step: "0.1" }, onChange: function (v) { trn.duration = Math.max(0.1, Math.min(5, v)); App.commit(); App.markDirty(); } }) : null
    ]));
    var camHere = App.cameraHasKeyAt(App.S.time), camKeys = App.cameraKeyTimes().length;
    function camLive(prop, scale) { return function (v) { var created = App.setCameraProp(prop, v / scale); App.markDirty(); if (created) UI.renderTimeline(); }; }
    function camCommit() { return function () { App.commit(); UI.renderTimeline(); }; }
    box.appendChild(section("camera", "Kamera", [
      h("div", { class: "grid3" },
        numField("Yakınlaştırma", { bind: "cam.zoom", value: Math.round(App.cameraValue("zoom") * 100), unit: "%", attrs: { min: "20", max: "600", step: "5" }, onInput: camLive("zoom", 100), onChange: camCommit() }),
        numField("Merkez X", { bind: "cam.x", value: Math.round(App.cameraValue("x") * 100), unit: "%", attrs: { step: "1" }, onInput: camLive("x", 100), onChange: camCommit() }),
        numField("Merkez Y", { bind: "cam.y", value: Math.round(App.cameraValue("y") * 100), unit: "%", attrs: { step: "1" }, onInput: camLive("y", 100), onChange: camCommit() })),
      h("div", { class: "row" },
        h("button", { type: "button", class: "keybtn" + (camHere ? " on" : ""), title: camHere ? "Bu karedeki kamera anahtarını kaldır" : "Bu kareye kamera anahtarı ekle", onclick: function () { App.toggleCameraKey(App.S.time); } }, "◆"),
        h("span", { style: "flex:1;font-size:12px" }, camKeys ? camKeys + " kamera anahtarı (zaman çizelgesinde 🎥 satırı)" : "Yakın çekim için: zamanı seç, değerleri gir, ◆'a bas"),
        camKeys ? h("button", { type: "button", class: "small danger", onclick: function () { App.resetCamera(); } }, "Sıfırla") : null)
    ]));
    var idx = App.S.sceneIndex, n = p.scenes.length;
    box.appendChild(section("scenes", "Sahneler (" + n + ")", [
      h("div", { class: "pill-row" },
        h("button", { type: "button", onclick: function () { App.addScene(); } }, "+ Yeni sahne"),
        h("button", { type: "button", onclick: function () { App.duplicateScene(); } }, "Çoğalt"),
        h("button", { type: "button", disabled: idx === 0, onclick: function () { App.moveScene(-1); } }, "◂ Öne al"),
        h("button", { type: "button", disabled: idx >= n - 1, onclick: function () { App.moveScene(1); } }, "Sona al ▸"),
        h("button", { type: "button", class: "danger", disabled: n <= 1, onclick: function () { App.deleteScene(); } }, "Sahneyi sil")),
      h("p", { class: "hint" }, "Dışa aktarırken sahneler peş peşe tek film olur. Toplam: " + fmtTime(X.totalDuration(p)) + ".")
    ]));
  }

  /* Oynatma kafası hareket edince sayısal alanları tazeler (odaktaki alan hariç) */
  UI.syncProps = function () {
    var App = root.App, L = App.selLayer();
    if (!L) {
      var camInputs = $("props").querySelectorAll("[data-bind^='cam.']");
      for (var ci = 0; ci < camInputs.length; ci++) { var cinp = camInputs[ci], cp = cinp.getAttribute("data-bind").slice(4); if (document.activeElement !== cinp) { var cv = Math.round(App.cameraValue(cp) * 100); if (String(cinp.value) !== String(cv)) cinp.value = cv; } }
      var ckb = $("props").querySelector(".keybtn");
      if (ckb && camInputs.length && ckb.classList.contains("on") !== App.cameraHasKeyAt(App.S.time)) UI.renderProps();
      return;
    }
    var size = R.layerSize(L, App.S.project);
    var vals = {
      x: Math.round(App.editValue(L, "x")), y: Math.round(App.editValue(L, "y")),
      scale: +(App.editValue(L, "sx") * 100).toFixed(1),
      w: Math.round(size.w * Math.abs(App.editValue(L, "sx"))), h: Math.round(size.h * Math.abs(App.editValue(L, "sy"))),
      rot: +App.editValue(L, "rot").toFixed(1), opacity: Math.round(App.editValue(L, "opacity") * 100)
    };
    var inputs = $("props").querySelectorAll("[data-bind]");
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i], k = inp.getAttribute("data-bind");
      if (document.activeElement === inp) continue;
      if (String(inp.value) !== String(vals[k])) inp.value = vals[k];
    }
    var keyHere = M.keyTimes(L).some(function (k) { return Math.abs(k - App.S.time) < 1e-4; });
    var kb = $("props").querySelector(".keybtn");
    if (kb && kb.classList.contains("on") !== keyHere) UI.renderProps();
  };
  UI.focusText = function () { var ta = $("props").querySelector("[data-text-input]"); if (ta) { ta.focus(); ta.select(); } };

  /* ── Zaman çizelgesi ─────────────────────────────────────── */
  function nameW() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--name-w")) || 164; }
  UI.pxPerSec = function () {
    var App = root.App, sc = App.scene();
    return Math.min(App.S.tl.pxPerSec, 30000 / (sc.duration + 1));
  };
  function trackWidth() {
    var App = root.App, sc = App.scene(), pxs = UI.pxPerSec();
    var visible = $("tlBody").clientWidth - nameW();
    return Math.max(visible, Math.ceil((sc.duration + 0.75) * pxs) + 20);
  }

  UI.renderTimeline = function () {
    var App = root.App, p = App.S.project, sc = App.scene(), pxs = UI.pxPerSec(), W = trackWidth();
    var rows = $("tlRows");
    rows.innerHTML = "";
    drawRuler(W, pxs, sc.duration, p.fps);
    if (!sc.layers.length) rows.appendChild(h("div", { class: "tl-empty" }, "Katman ekleyin; görünme süreleri (çubuk), anahtar kareler (◆) ve efekt pencereleri (sarı çizgi) burada görünür."));
    var camTimes = App.cameraKeyTimes();
    if (camTimes.length) {
      var camArea = h("div", { class: "tl-track-area", style: "width:" + W + "px", "data-layer": "__camera__" });
      camTimes.forEach(function (kt) { camArea.appendChild(h("div", { class: "tl-key", style: "left:" + (kt * pxs) + "px", "data-key": kt, "data-layer": "__camera__", title: "Kamera anahtarı · " + fmtTime(kt) + " (sürükle: taşı)" })); });
      rows.appendChild(h("div", { class: "tl-row cam" }, h("div", { class: "tl-name", title: "Kamera", onclick: function () { App.selectLayer(null); } }, "🎥 Kamera"), camArea));
    }
    for (var i = sc.layers.length - 1; i >= 0; i--) {
      (function (L) {
        var sel = L.id === App.S.sel.layerId;
        var inP = L.inPoint || 0, outP = M.layerEnd(L, sc.duration);
        var clip = h("div", { class: "tl-clip", style: "left:" + (inP * pxs) + "px;width:" + Math.max(6, (outP - inP) * pxs) + "px", title: L.name + " · " + fmtTime(inP) + " → " + fmtTime(outP) + " (sürükle: kaydır; kenar: giriş/çıkış)", "data-clip": L.id },
          h("div", { class: "edge l", "data-edge": "in" }), h("div", { class: "edge r", "data-edge": "out" }));
        var area = h("div", { class: "tl-track-area", style: "width:" + W + "px", "data-layer": L.id }, clip);
        L.effects.forEach(function (eff, k) {
          var w = M.effectWindow(eff, sc.duration), def = M.EFFECTS[eff.type];
          area.appendChild(h("div", { class: "tl-fx", style: "left:" + (w.start * pxs) + "px;width:" + Math.max(4, (w.end - w.start) * pxs) + "px;bottom:" + (2 + (k % 3) * 5) + "px;background:" + (def.kind === "loop" ? "var(--warn)" : def.kind === "in" ? "var(--ok)" : "var(--danger)"), title: def.label + " · " + fmtTime(w.start) + " → " + fmtTime(w.end) }));
        });
        M.keyTimes(L).forEach(function (kt) {
          var selected = sel && App.S.sel.keyTime != null && Math.abs(App.S.sel.keyTime - kt) < 1e-4;
          area.appendChild(h("div", { class: "tl-key" + (selected ? " selected" : ""), style: "left:" + (kt * pxs) + "px", "data-key": kt, "data-layer": L.id, title: "Anahtar kare · " + fmtTime(kt) + " (sürükle: taşı, Delete: sil)" }));
        });
        rows.appendChild(h("div", { class: "tl-row" + (sel ? " selected" : ""), "data-row": L.id },
          h("div", { class: "tl-name", title: L.name, onclick: function () { App.selectLayer(L.id); } }, h("span", { class: "dot", style: L.type === "text" ? "background:var(--ok)" : L.type === "sequence" ? "background:var(--warn)" : "" }), L.name),
          area));
      })(sc.layers[i]);
    }
    UI.updatePlayhead();
  };

  function drawRuler(W, pxs, duration, fps) {
    var c = $("ruler"), dpr = window.devicePixelRatio || 1, H = 26;
    $("rulerArea").style.width = W + "px";
    c.width = Math.round(W * dpr); c.height = H * dpr; c.style.width = W + "px"; c.style.height = H + "px";
    var x = c.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    x.fillStyle = "rgba(0,245,255,.06)"; x.fillRect(0, 0, duration * pxs, H);
    x.fillStyle = "rgba(255,92,122,.10)"; x.fillRect(duration * pxs, 0, W - duration * pxs, H);
    var labelEvery = pxs >= 60 ? 1 : pxs >= 30 ? 2 : pxs >= 15 ? 5 : 10;
    var minor = pxs >= 160 ? 1 / fps : pxs >= 70 ? 0.25 : 0.5;
    x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 1; x.beginPath();
    for (var t = 0; t <= W / pxs + 1e-6; t += minor) { var px = Math.round(t * pxs) + 0.5; var major = Math.abs(t - Math.round(t)) < 1e-6; x.moveTo(px, major ? 12 : 19); x.lineTo(px, H); }
    x.stroke();
    x.fillStyle = "#8fa3bd"; x.font = "10px system-ui, sans-serif"; x.textBaseline = "top";
    for (var s = 0; s <= W / pxs; s += labelEvery) x.fillText(s + " sn", s * pxs + 3, 2);
  }

  UI.updatePlayhead = function () {
    var App = root.App, ph = $("playhead"), body = $("tlBody");
    ph.style.left = (nameW() + App.S.time * UI.pxPerSec()) + "px";
    ph.style.height = Math.max(body.clientHeight, body.scrollHeight) + "px";
    // oynatma kafası görünür alanda kalsın
    if (App.S.playing) {
      var x = App.S.time * UI.pxPerSec(), left = body.scrollLeft, w = body.clientWidth - nameW();
      if (x < left || x > left + w - 20) body.scrollLeft = Math.max(0, x - 40);
    }
  };
  UI.updateTimeLabel = function () {
    var App = root.App, sc = App.scene(), fps = App.S.project.fps;
    $("timeLabel").textContent = fmtTime(App.S.time) + " · kare " + (Math.round(App.S.time * fps) + 1) + "/" + Math.max(1, Math.round(sc.duration * fps));
  };
  UI.updateEmptyState = function () { $("emptyState").hidden = root.App.scene().layers.length > 0; };
  UI.updateUndoButtons = function () { var hst = root.App.S.hist; $("btnUndo").disabled = !hst.undo.length; $("btnRedo").disabled = !hst.redo.length; };
  UI.updateToggles = function () {
    var S = root.App.S;
    $("btnLoop").classList.toggle("active", S.loop); $("btnPlayAll").classList.toggle("active", S.playAll);
    $("btnOnion").classList.toggle("active", S.view.onion); $("btnGrid").classList.toggle("active", S.view.grid);
    $("btnPlay").textContent = S.playing ? "❚❚" : "▶";
  };

  UI.renderAll = function () {
    UI.renderFilmSettings(); UI.renderLayers(); UI.renderProps(); UI.renderSceneTabs(); UI.renderTimeline();
    UI.updateTimeLabel(); UI.updateEmptyState(); UI.updateUndoButtons(); UI.updateToggles();
  };

  /* Zaman çizelgesi etkileşimleri */
  function bindTimeline() {
    var App = root.App, body = $("tlBody");
    function timeAt(clientX) {
      var rect = body.getBoundingClientRect();
      var x = clientX - rect.left - nameW() + body.scrollLeft;
      return Math.max(0, x / UI.pxPerSec());
    }
    var drag = null;
    body.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      var key = ev.target.closest(".tl-key"), edge = ev.target.closest(".edge"), clip = ev.target.closest(".tl-clip");
      var area = ev.target.closest(".tl-track-area"), ruler = ev.target.closest("#rulerArea");
      if (key && key.getAttribute("data-layer") === "__camera__") {
        var tc = parseFloat(key.getAttribute("data-key"));
        App.selectLayer(null); App.setTime(tc);
        drag = { kind: "camkey", t0: tc, cur: tc, x0: ev.clientX, moved: false };
      } else if (key) {
        var L = App.layerById(key.getAttribute("data-layer")), t0 = parseFloat(key.getAttribute("data-key"));
        App.selectKey(L.id, t0);
        drag = { kind: "key", layer: L, t0: t0, cur: t0, x0: ev.clientX, moved: false };
      } else if (edge && clip) {
        var L2 = App.layerById(clip.getAttribute("data-clip"));
        App.selectLayer(L2.id);
        drag = { kind: edge.getAttribute("data-edge"), layer: L2, in0: L2.inPoint, out0: L2.outPoint, x0: ev.clientX, moved: false };
      } else if (clip) {
        var L3 = App.layerById(clip.getAttribute("data-clip"));
        App.selectLayer(L3.id);
        drag = { kind: "clip", layer: L3, snap: Model.deepClone(L3), x0: ev.clientX, moved: false };
        clip.style.cursor = "grabbing";
      } else if (ruler || area) {
        if (App.S.playing) App.pause();
        App.setTime(timeAt(ev.clientX));
        if (App.S.sel.keyTime != null) { App.S.sel.keyTime = null; UI.renderTimeline(); }
        drag = { kind: "seek" };
      } else return;
      body.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    body.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var App2 = root.App, fps = App2.S.project.fps, sc = App2.scene();
      if (drag.kind === "seek") { App2.setTime(timeAt(ev.clientX)); return; }
      var dt = (ev.clientX - drag.x0) / UI.pxPerSec();
      if (Math.abs(ev.clientX - drag.x0) > 3) drag.moved = true;
      if (!drag.moved) return;
      var L = drag.layer;
      if (drag.kind === "camkey") {
        var ntc = Math.max(0, Math.round((drag.t0 + dt) * fps) / fps);
        if (ntc !== drag.cur) { App2.moveCameraKeys(drag.cur, ntc); drag.cur = ntc; App2.setTime(ntc); UI.renderTimeline(); }
        return;
      }
      if (drag.kind === "key") {
        var nt = Math.max(0, Math.round((drag.t0 + dt) * fps) / fps);
        if (nt !== drag.cur) { M.moveKeys(L, drag.cur, nt); drag.cur = nt; App2.S.sel.keyTime = nt; App2.setTime(nt); UI.renderTimeline(); }
      } else if (drag.kind === "in") {
        var end = drag.out0 == null ? sc.duration : drag.out0;
        var ni = Math.min(end - 1 / fps, Math.max(0, Math.round((drag.in0 + dt) * fps) / fps));
        L.inPoint = ni; App2.markDirty(); UI.renderTimeline();
      } else if (drag.kind === "out") {
        var base = drag.out0 == null ? sc.duration : drag.out0;
        var no = Math.max(L.inPoint + 1 / fps, Math.round((base + dt) * fps) / fps);
        L.outPoint = no >= sc.duration - 1e-6 ? null : Math.min(sc.duration, no); App2.markDirty(); UI.renderTimeline();
      } else if (drag.kind === "clip") {
        var shift = Math.round(dt * fps) / fps;
        App2.restoreLayerFrom(L, drag.snap);
        App2.shiftLayerTime(L, shift);
        App2.markDirty(); UI.renderTimeline();
      }
    });
    function endDrag(ev) {
      if (!drag) return;
      if (drag.kind !== "seek" && drag.moved) { root.App.commit(); UI.renderProps(); }
      drag = null;
      try { body.releasePointerCapture(ev.pointerId); } catch (e) { /* yoksay */ }
    }
    body.addEventListener("pointerup", endDrag);
    body.addEventListener("pointercancel", endDrag);
    body.addEventListener("scroll", function () { UI.updatePlayhead(); });

    $("sceneDuration").addEventListener("change", function () { var v = parseFloat($("sceneDuration").value); if (Number.isFinite(v)) App.setSceneDuration(v); else UI.renderSceneTabs(); });
    $("tlZoom").addEventListener("input", function () { App.S.tl.pxPerSec = parseFloat($("tlZoom").value); UI.renderTimeline(); });
    $("btnPlay").addEventListener("click", function () { App.togglePlay(); });
    $("btnStart").addEventListener("click", function () { App.setTime(0); });
    $("btnEnd").addEventListener("click", function () { App.setTime(App.scene().duration); });
    $("btnPrev").addEventListener("click", function () { App.stepFrame(-1); });
    $("btnNext").addEventListener("click", function () { App.stepFrame(1); });
    $("btnLoop").addEventListener("click", function () { App.S.loop = !App.S.loop; UI.updateToggles(); });
    $("btnPlayAll").addEventListener("click", function () { App.S.playAll = !App.S.playAll; UI.updateToggles(); });
  }

  /* ── Dışa aktarma penceresi ──────────────────────────────── */
  var exportCtl = null;
  function fmtBytes(n) { return n > 1048576 ? fmt(n / 1048576, 1) + " MB" : Math.round(n / 1024) + " KB"; }
  function selectedFormat() { var r = document.querySelector("#fmtGrid input[name=fmt]:checked"); return r ? r.value : "gif"; }

  var exportSupport = null;
  UI.openExport = function () {
    var App = root.App, p = App.S.project;
    if (App.S.playing) App.pause();
    X.detectSupport(p).then(function (sup) { exportSupport = sup; openExportDialog(sup); });
  };
  function openExportDialog(sup) {
    var App = root.App, p = App.S.project, dlg = $("exportDialog");
    var mp4 = $("fmtMp4");
    mp4.classList.toggle("disabled", !sup.mp4);
    mp4.querySelector("input").disabled = !sup.mp4;
    mp4.querySelector("small").textContent = sup.mp4 ? "WhatsApp, Instagram, YouTube" : "Bu tarayıcıda yok (Chrome/Edge/Safari kullanın)";
    if (!sup.mp4 && selectedFormat() === "mp4") document.querySelector("#fmtGrid input[value=gif]").checked = true;
    var rng = $("exRange"); rng.innerHTML = "";
    rng.appendChild(h("option", { value: "all", text: "Tüm film · " + p.scenes.length + " sahne · " + fmtTime(X.totalDuration(p)) }));
    if (p.scenes.length > 1) rng.appendChild(h("option", { value: "scene", text: "Yalnızca bu sahne · " + App.scene().name + " · " + fmtTime(App.scene().duration) }));
    var sc = $("exScale"); sc.innerHTML = "";
    [1, 0.75, 0.5, 0.25].forEach(function (s) { sc.appendChild(h("option", { value: String(s), text: Math.round(s * 100) + "% · " + Math.round(p.width * s / 2) * 2 + "×" + Math.round(p.height * s / 2) * 2 })); });
    $("exProgress").hidden = true; $("exResult").hidden = true; $("exResult").innerHTML = "";
    $("exStart").disabled = false; $("exCancel").hidden = true;
    updateExportUi(true);
    dlg.showModal();
  };

  function updateExportUi(resetDefaults) {
    var App = root.App, p = App.S.project, f = selectedFormat();
    var isGif = f === "gif", isVideo = f === "mp4" || f === "webm", isPng = f === "png";
    $("exFpsRow").hidden = !isGif; $("exDitherRow").hidden = !isGif; $("exQualityRow").hidden = !isVideo;
    if (resetDefaults) $("exScale").value = isGif ? "0.5" : "1";
    var range = $("exRange").value === "scene" ? App.S.sceneIndex : "all";
    var r = X.rangeOf(p, range), dur = r.end - r.start;
    var fps = isGif ? parseInt($("exFps").value, 10) : p.fps;
    var frames = Math.max(1, Math.round(dur * fps));
    var sup = exportSupport || { webm: null, mp4Recorder: null, mp4WebCodecs: null, mp4: false };
    var fastMp4 = f === "mp4" && sup.mp4WebCodecs && !(p.audio && sup.mp4Recorder);
    var note;
    if (isGif) note = frames + " kare, " + fps + " fps, 256 renk, sessiz. Büyük boyutlarda dosya hızla büyür; %50 çoğu paylaşım için yeterlidir.";
    else if (fastMp4) note = frames + " kare H.264 olarak hızlı kodlanır (" + fmt(dur, 1) + " sn film)." + (p.audio ? " Bu tarayıcı sesli MP4 kaydedemediği için ses dahil edilmez; sesli çıktı için WebM seçin." : " Telefon ve sosyal medyada sorunsuz oynar.");
    else if (isVideo) note = "Kayıt gerçek zamanlı yapılır: yaklaşık " + fmt(dur, 1) + " sn sürer; bu sırada sekmeyi kapatmayın." + (p.audio ? " Ses dahil edilir." : "");
    else if (isPng) note = frames + " PNG karesi tek ZIP içinde. Saydam arka plan korunur; montaj programına ya da ffmpeg'e verebilirsiniz.";
    $("exNote").textContent = note;
    $("exStart").textContent = "Oluştur ve indir";
  }

  function runExport() {
    var App = root.App, p = App.S.project, f = selectedFormat();
    var range = $("exRange").value === "scene" ? App.S.sceneIndex : "all";
    var scale = parseFloat($("exScale").value) || 1;
    var prog = $("exProgress"), bar = prog.querySelector("i"), txt = $("exProgressText"), res = $("exResult");
    prog.hidden = false; res.hidden = true; res.innerHTML = ""; bar.style.width = "0%"; txt.textContent = "Hazırlanıyor…";
    $("exStart").disabled = true; $("exCancel").hidden = false;
    exportCtl = { cancelled: false };
    function onProgress(pr) { var pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0; bar.style.width = pct + "%"; txt.textContent = pr.phase + " · " + pr.done + "/" + pr.total + " (" + pct + "%)"; }
    var base = "canlandir-" + X.safeName(p.name), job;
    if (f === "gif") job = X.exportGif(p, { fps: parseInt($("exFps").value, 10), scale: scale, dither: $("exDither").checked, range: range }, onProgress, exportCtl).then(function (b) { return { blob: b, name: base + ".gif", kind: "img" }; });
    else if (f === "png") job = X.exportPngZip(p, { scale: scale, range: range }, onProgress, exportCtl).then(function (b) { return { blob: b, name: base + "-kareler.zip", kind: "file" }; });
    else job = X.exportVideo(p, { format: f, scale: scale, quality: $("exQuality").value, range: range }, onProgress, exportCtl).then(function (r) { return { blob: r.blob, name: base + "." + r.ext, kind: "video", note: r.note }; });
    job.then(function (out) {
      prog.hidden = true; $("exStart").disabled = false; $("exCancel").hidden = true;
      var url = URL.createObjectURL(out.blob);
      var preview = out.kind === "img" ? h("img", { src: url, alt: "Önizleme" }) : out.kind === "video" ? h("video", { src: url, controls: true, autoplay: true, muted: true, loop: true, playsinline: true }) : h("div", { class: "fmt-ico" }, "ZIP");
      res.appendChild(preview);
      res.appendChild(h("div", { class: "meta" }, out.name + " · " + fmtBytes(out.blob.size)));
      res.appendChild(h("a", { class: "primary", href: url, download: out.name, style: "display:inline-block;padding:9px 18px;border-radius:8px;text-decoration:none;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#050812;font-weight:700" }, "Yeniden indir"));
      res.hidden = false;
      X.download(out.blob, out.name);
      App.toast(out.name + " indirildi (" + fmtBytes(out.blob.size) + ")", "ok");
      if (out.note) { $("exNote").textContent = out.note; App.toast(out.note); }
    }).catch(function (err) {
      prog.hidden = true; $("exStart").disabled = false; $("exCancel").hidden = true;
      var msg = err && err.message || String(err);
      if (msg !== "İptal edildi") { $("exNote").textContent = "Hata: " + msg; App.toast(msg, "error"); } else App.toast("Dışa aktarma iptal edildi");
    });
  }

  function bindDialogs() {
    var App = root.App;
    document.querySelectorAll("#fmtGrid input[name=fmt]").forEach(function (r) { r.addEventListener("change", function () { updateExportUi(true); }); });
    ["exRange", "exFps", "exScale"].forEach(function (id) { $(id).addEventListener("change", function () { updateExportUi(false); }); });
    $("exStart").addEventListener("click", runExport);
    $("exCancel").addEventListener("click", function () { if (exportCtl) exportCtl.cancelled = true; });
    $("exportDialog").addEventListener("close", function () { if (exportCtl) exportCtl.cancelled = true; $("exResult").querySelectorAll("video").forEach(function (v) { v.pause(); }); });
    $("btnExport").addEventListener("click", UI.openExport);
    $("btnHelp").addEventListener("click", function () { $("helpDialog").showModal(); });
    document.querySelectorAll(".mobile-tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".mobile-tabs button").forEach(function (x) { x.classList.toggle("active", x === b); });
        $("app").setAttribute("data-panel", b.getAttribute("data-panel"));
        if (b.getAttribute("data-panel") === "stage") App.layoutStage();
        if (b.getAttribute("data-panel") === "timeline") UI.renderTimeline();
      });
    });
  }

  function bindLeftPanel() {
    var App = root.App;
    $("stageSize").addEventListener("change", function () {
      var ps = Model.STAGE_PRESETS.find(function (x) { return x.id === $("stageSize").value; });
      if (ps) App.setStageSize(ps.w, ps.h);
    });
    function customSize() { var w = parseInt($("stageW").value, 10), hh = parseInt($("stageH").value, 10); if (w >= 16 && hh >= 16) App.setStageSize(w, hh); }
    $("stageW").addEventListener("change", customSize); $("stageH").addEventListener("change", customSize);
    $("projectFps").addEventListener("change", function () { App.setFps(parseInt($("projectFps").value, 10)); });
    $("btnAudio").addEventListener("click", function () { $("fileAudio").click(); });
    $("btnAudioRemove").addEventListener("click", function () { App.removeAudio(); });
    $("audioVol").addEventListener("input", function () { App.setAudioVolume(parseFloat($("audioVol").value)); });
    $("btnLayerUp").addEventListener("click", function () { var L = App.selLayer(); if (L) App.moveLayer(L.id, 1); });
    $("btnLayerDown").addEventListener("click", function () { var L = App.selLayer(); if (L) App.moveLayer(L.id, -1); });
    $("btnLayerDup").addEventListener("click", function () { var L = App.selLayer(); if (L) App.duplicateLayer(L.id); });
    $("btnLayerDel").addEventListener("click", function () { var L = App.selLayer(); if (L) App.deleteLayer(L.id); });
  }

  /* Sol panel "Film ayarları" katlanır; zaman çizelgesi yüksekliği sürüklenerek ayarlanır (tercih saklanır) */
  function bindLayoutPrefs() {
    var box = $("filmBox"), app = $("app");
    try { if (localStorage.getItem("canlandir.filmBox") === "closed") box.classList.add("collapsed"); } catch (e) { /* yoksay */ }
    $("filmHead").addEventListener("click", function () {
      box.classList.toggle("collapsed");
      try { localStorage.setItem("canlandir.filmBox", box.classList.contains("collapsed") ? "closed" : "open"); } catch (e) { /* yoksay */ }
    });
    var saved = 0;
    try { saved = parseInt(localStorage.getItem("canlandir.tlHeight"), 10) || 0; } catch (e) { /* yoksay */ }
    if (saved) app.style.setProperty("--tl-h", Math.max(140, Math.min(window.innerHeight * 0.6, saved)) + "px");
    var handle = $("tlResize"), drag = null;
    handle.addEventListener("pointerdown", function (ev) {
      drag = { y0: ev.clientY, h0: $("timeline").getBoundingClientRect().height };
      handle.classList.add("active"); handle.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    handle.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var hgt = Math.max(140, Math.min(window.innerHeight * 0.6, drag.h0 - (ev.clientY - drag.y0)));
      app.style.setProperty("--tl-h", Math.round(hgt) + "px");
      root.App.layoutStage();
    });
    function end(ev) {
      if (!drag) return;
      drag = null; handle.classList.remove("active");
      try { handle.releasePointerCapture(ev.pointerId); } catch (e) { /* yoksay */ }
      try { localStorage.setItem("canlandir.tlHeight", String(Math.round($("timeline").getBoundingClientRect().height))); } catch (e) { /* yoksay */ }
      UI.renderTimeline();
    }
    handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
  }

  /* ── Senaryodan film üretme penceresi ─────────────────────── */
  var ROLE_LABELS = [["pose", "Duruş"], ["talk", "Konuşma karesi"], ["walk", "Yürüme karesi"], ["blink", "Göz kırpma"], ["mutlu", "Mutlu"], ["uzgun", "Üzgün"], ["kizgin", "Kızgın"], ["saskin", "Şaşkın"], ["korkmus", "Korkmuş"],
    ["jest1", "Jest 1"], ["jest1k", "Jest 1 (ağız açık)"], ["jest2", "Jest 2"], ["jest2k", "Jest 2 (ağız açık)"], ["bak", "Yana bakış"]];
  var previewTimer = 0;

  UI.openScript = function () {
    var App = root.App;
    if (App.S.playing) App.pause();
    App.ensureScript();
    $("scHelp").textContent = root.Director.HELP;
    $("scText").value = App.S.project.script.text || "";
    UI.renderScriptDialog();
    $("scriptDialog").showModal();
    if (!$("scText").value) setTimeout(function () { $("scText").focus(); }, 50);
  };

  UI.renderScriptDialog = function () {
    var App = root.App, p = App.S.project, sc = App.ensureScript();
    var cast = $("scCast"); cast.innerHTML = "";
    if (!sc.cast.length) cast.appendChild(h("div", { class: "notice" }, "Henüz karakter yok. “+ Karakter” ile ekle ya da senaryoyu yazıp “Senaryodan al” de."));
    sc.cast.forEach(function (c) {
      var pose = c.images.find(function (im) { return im.role === "pose"; }) || c.images[0];
      var thumb = pose && p.assets[pose.assetId] ? h("img", { class: "sc-thumb", src: p.assets[pose.assetId].dataUrl, alt: "" }) : h("span", { class: "sc-thumb", title: "Görsel yok: yer tutucu çizilecek" }, "👤");
      var nameInp = h("input", { type: "text", value: c.name, maxlength: "40", placeholder: "Karakter adı", onchange: function () { App.renameCast(c.id, nameInp.value); } });
      var facing = h("select", { title: "Görselde karakterin yüzü hangi yöne bakıyor?", onchange: function () { c.facing = facing.value; App.commit(); } },
        h("option", { value: "right", text: "Yüzü sağa" }), h("option", { value: "left", text: "Yüzü sola" }));
      facing.value = c.facing || "right";
      var sizeSel = UI.sizeSelect(c, function () { App.commit(); });
      var voiceSel = root.Voice ? root.Voice.voiceSelect(c, function () { App.commit(); }) : null;
      var imgs = h("div", { class: "sc-imgs" });
      c.images.forEach(function (im) {
        var a = p.assets[im.assetId]; if (!a) return;
        var role = h("select", { onchange: function () { im.role = role.value; App.commit(); UI.renderScriptDialog(); } });
        ROLE_LABELS.forEach(function (r) { role.appendChild(h("option", { value: r[0], text: r[1] })); });
        role.value = im.role || "pose";
        imgs.appendChild(h("div", { class: "sc-img" }, h("img", { src: a.dataUrl, alt: a.name, title: a.name }), role,
          h("button", { type: "button", class: "rm", title: "Görseli çıkar", onclick: function () { App.removeCastImage(c.id, im.assetId); } }, "×")));
      });
      imgs.appendChild(h("button", { type: "button", class: "small", style: "align-self:flex-start", onclick: function () { App.pickCastImages(c.id); } }, "+ Görsel"));
      var headKids = ["div", { class: "sc-char-head" }, thumb, nameInp, facing, sizeSel];
      if (voiceSel) headKids.push(voiceSel);
      headKids.push(h("button", { type: "button", class: "small danger", title: "Karakteri sil", onclick: function () { App.removeCastMember(c.id); } }, "✕"));
      cast.appendChild(h("div", { class: "sc-char" }, h.apply(null, headKids), imgs));
    });
    if (root.Voice && $("scVoice")) root.Voice.renderPanel($("scVoice"), { compact: true, onChange: function () { UI.renderScriptDialog(); } });
    var bgs = $("scBgs"); bgs.innerHTML = "";
    sc.backgrounds.forEach(function (b) {
      var a = p.assets[b.assetId]; if (!a) return;
      var nm = h("input", { type: "text", value: b.name, maxlength: "60", placeholder: "Mekân adı (sahne başlığıyla eşleşir)", onchange: function () { b.name = nm.value.trim().slice(0, 60); App.commit(); UI.renderScriptPreview(); } });
      var gl = h("div", { class: "sc-groundline", style: "top:" + Math.round((b.ground || 0.9) * 100) + "%" });
      var gr = h("input", { type: "range", min: "50", max: "100", step: "1", value: String(Math.round((b.ground || 0.9) * 100)), title: "Zemin çizgisi: karakterlerin ayak bastığı yükseklik (resme göre)",
        oninput: function () { gl.style.top = gr.value + "%"; }, onchange: function () { b.ground = Math.max(0.5, Math.min(1, +gr.value / 100)); App.commit(); } });
      bgs.appendChild(h("div", { class: "sc-bg" }, h("div", { class: "sc-thumb" }, h("img", { src: a.dataUrl, alt: "" }), gl), nm, h("label", { class: "sc-ground" }, "Zemin ", gr), h("button", { type: "button", class: "small danger", onclick: function () { App.removeBackground(b.id); } }, "✕")));
    });
    var st = sc.settings;
    $("scCharHeight").value = Math.round(st.charHeight * 100); $("scCharHeightLabel").textContent = "%" + Math.round(st.charHeight * 100) + " (sahne yüksekliğine göre)";
    $("scSpeed").value = st.speed; $("scBubble").value = st.bubbleStyle;
    $("scTitle").checked = st.titleCard; $("scEnd").checked = st.endCard; $("scHeadings").checked = st.headings; $("scFade").checked = st.fade; $("scOno").checked = st.onomatopoeia !== false;
    $("scSizeNote").textContent = "Film boyutu " + p.width + "×" + p.height + ", " + p.fps + " fps (sol paneldeki Film ayarlarından değişir).";
    UI.renderScriptPreview();
  };

  UI.renderScriptPreview = function () {
    var App = root.App, sc = App.ensureScript(), box = $("scPreview"), D = root.Director;
    box.innerHTML = "";
    var text = $("scText").value;
    if (!text.trim()) { box.appendChild(h("div", { class: "muted" }, "Senaryoyu yazdıkça burada sahne, replik ve süre özeti görünür. Format için yukarıdaki rehbere bak ya da “Örnek senaryo”yu aç.")); return; }
    var r;
    try { r = D.analyze(text, sc.cast.filter(function (c) { return c.images.length; }).map(function (c) { return c.name; })); }
    catch (e) { box.appendChild(h("div", { class: "err" }, "Senaryo okunamadı: " + e.message)); return; }
    var st = r.stats;
    box.appendChild(h("div", null, h("b", null, (r.ast.title ? "“" + r.ast.title + "” · " : "") + st.scenes + " sahne · " + st.lines + " replik · " + st.actions + " eylem" + (st.narrations ? " · " + st.narrations + " anlatım" : "")),
      " · tahmini süre " + fmt(st.seconds, 0) + " sn"));
    var chips = h("div", { class: "sc-chips" });
    var withImg = sc.cast.filter(function (c) { return c.images.length; }).map(function (c) { return D.norm(c.name); });
    r.names.forEach(function (nm) { var ok = withImg.indexOf(D.norm(nm)) >= 0; chips.appendChild(h("span", { class: "chip " + (ok ? "ok" : "ph"), title: ok ? "Görseli var" : "Görsel yok: yer tutucu çizilecek" }, (ok ? "✓ " : "◌ ") + nm)); });
    if (r.names.length) box.appendChild(chips);
    var warns = [];
    st.charactersWithoutImage.forEach(function (nm) { warns.push("“" + nm + "” için görsel yok; renkli yer tutucu karakter kullanılacak (Karakterler bölümünden görsel ekleyebilirsin)."); });
    st.unknownActions.slice(0, 6).forEach(function (a) { warns.push("Anlaşılamayan eylem: “" + a + "” (bekleme olarak işlenir)."); });
    if (!st.lines && !st.actions) warns.push("Hiç replik ya da eylem yok. “ALİ: Merhaba” gibi satırlar ekle.");
    if (warns.length) box.appendChild(h("ul", { class: "warn" }, warns.map(function (w) { return h("li", null, w); })));
  };

  function bindScriptDialog() {
    var App = root.App;
    $("btnScript").addEventListener("click", UI.openScript);
    $("emptyScript").addEventListener("click", function () { if (root.Easy) root.Easy.openWizard(); else UI.openScript(); });
    $("scText").addEventListener("input", function () {
      App.ensureScript().text = $("scText").value;
      clearTimeout(previewTimer); previewTimer = setTimeout(UI.renderScriptPreview, 250);
    });
    $("scText").addEventListener("change", function () { App.commit(); });
    $("scSample").addEventListener("click", function () {
      if ($("scText").value.trim() && !confirm("Mevcut senaryo örnekle değiştirilsin mi?")) return;
      $("scText").value = root.Director.SAMPLE; App.ensureScript().text = root.Director.SAMPLE; App.commit(); UI.renderScriptPreview();
    });
    $("scAddChar").addEventListener("click", function () { App.addCastMember("Karakter " + (App.ensureScript().cast.length + 1)); UI.renderScriptDialog(); var inputs = $("scCast").querySelectorAll("input[type=text]"); if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); } });
    $("scAutoCast").addEventListener("click", function () { var n = App.autoCastFromScript(); UI.renderScriptDialog(); App.toast(n ? n + " karakter eklendi; görsellerini yükleyebilirsin" : "Senaryodaki tüm karakterler zaten listede"); });
    $("scAddBg").addEventListener("click", function () { App.pickBackgrounds(); });
    $("scCharHeight").addEventListener("input", function () { var v = parseInt($("scCharHeight").value, 10); App.ensureScript().settings.charHeight = v / 100; $("scCharHeightLabel").textContent = "%" + v + " (sahne yüksekliğine göre)"; });
    $("scCharHeight").addEventListener("change", function () { App.commit(); });
    $("scSpeed").addEventListener("change", function () { App.ensureScript().settings.speed = $("scSpeed").value; App.commit(); UI.renderScriptPreview(); });
    $("scBubble").addEventListener("change", function () { App.ensureScript().settings.bubbleStyle = $("scBubble").value; App.commit(); });
    [["scTitle", "titleCard"], ["scEnd", "endCard"], ["scHeadings", "headings"], ["scFade", "fade"], ["scOno", "onomatopoeia"]].forEach(function (pair) {
      $(pair[0]).addEventListener("change", function () { App.ensureScript().settings[pair[1]] = $(pair[0]).checked; App.commit(); });
    });
    var buildCtl = null;
    $("scBuild").addEventListener("click", function () {
      var btn = $("scBuild");
      if (buildCtl) { buildCtl.abort(); btn.textContent = "Durduruluyor…"; return; }   // seslendirme sürerken: durdur, eldekiyle üret
      btn.textContent = "Üretiliyor…";
      App.ensureScript().text = $("scText").value;
      buildCtl = new AbortController();
      App.buildFromScript({ signal: buildCtl.signal, onProgress: function (pr) {
        if (pr.phase === "Seslendiriliyor") btn.textContent = "⏹ Seslendiriliyor " + Math.min(pr.done + 1, pr.total) + "/" + pr.total + (pr.eta ? " · ~" + Math.round(pr.eta) + " sn" : "") + " — durdur";
        else btn.textContent = pr.phase + "…";
      } }).then(function (res) {
        buildCtl = null; btn.disabled = false; btn.textContent = "🎬 Filmi üret";
        $("scriptDialog").close();
        var msg = res.stats.scenes + " sahne, " + res.stats.layers + " katman, " + fmt(res.stats.seconds, 0) + " sn film üretildi" + (res.warnings.length ? " · " + res.warnings.length + " not (Senaryo penceresinde)" : "");
        App.toast(msg, "ok");
      }).catch(function (err) {
        buildCtl = null; btn.disabled = false; btn.textContent = "🎬 Filmi üret";
        var box = $("scPreview"); box.insertBefore(h("div", { class: "err" }, "Üretilemedi: " + (err && err.message || err)), box.firstChild);
      });
    });
    $("scriptDialog").addEventListener("close", function () { App.ensureScript().text = $("scText").value; App.commit(); });
  }
  UI.showBuildWarnings = function (warnings) {
    var box = $("scPreview");
    if (!warnings.length) return;
    box.insertBefore(h("ul", { class: "warn" }, warnings.slice(0, 12).map(function (w) { return h("li", null, w); })), box.firstChild);
  };

  /* ── Hazır karakter galerisi ─────────────────────────────── */
  var gallerySel = {}, galleryDone = null;
  /* Karakter boyu seçici (stüdyo ve sihirbaz kartları) */
  var SIZES = [[0.5, "Minik"], [0.62, "Evcil hayvan"], [0.75, "Küçük"], [0.86, "Çocuk"], [1, "Normal boy"], [1.2, "Uzun"], [1.5, "Dev"]];
  UI.sizeSelect = function (c, onChange, className) {
    var sel = h("select", { class: className || "", title: "Sahnedeki boyu (diğer karakterlere göre)", onchange: function () { c.size = parseFloat(sel.value) || 1; onChange(); } });
    var cur = c.size > 0 ? c.size : 1, hit = null;
    SIZES.forEach(function (s) { if (Math.abs(s[0] - cur) < 0.005) hit = s[0]; });
    if (hit == null) sel.appendChild(h("option", { value: String(cur), text: "Boy %" + Math.round(cur * 100) }));
    SIZES.forEach(function (s) { sel.appendChild(h("option", { value: String(s[0]), text: s[1] })); });
    sel.value = String(hit == null ? cur : hit);
    return sel;
  };
  UI.openGallery = function (onDone) {
    var C = root.Characters; if (!C) return;
    galleryDone = onDone || null; gallerySel = {};
    var grid = $("galleryGrid"); grid.innerHTML = "";
    C.LIST.forEach(function (e) {
      var item = h("div", { class: "gal-item", role: "button", tabindex: "0", onclick: function () { gallerySel[e.id] = !gallerySel[e.id]; item.classList.toggle("on", !!gallerySel[e.id]); updateCount(); },
        onkeydown: function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); item.click(); } } },
        h("img", { src: C.thumb(e.id), alt: e.name }), h("b", null, e.name), h("small", null, e.desc));
      grid.appendChild(item);
    });
    function updateCount() { var n = Object.keys(gallerySel).filter(function (k) { return gallerySel[k]; }).length; $("galleryCount").textContent = n ? n + " karakter seçildi" : "Tıklayarak seç (birden çok olabilir)"; $("galleryAdd").disabled = !n; }
    updateCount();
    $("galleryDialog").showModal();
  };
  function bindGallery() {
    var App = root.App;
    $("galleryAdd").addEventListener("click", function () {
      var ids = Object.keys(gallerySel).filter(function (k) { return gallerySel[k]; });
      if (!ids.length) return;
      $("galleryAdd").disabled = true;
      App.addLibraryCast(ids).then(function (added) {
        $("galleryDialog").close();
        App.toast(added.length ? added.length + " karakter eklendi" : "Bu karakterler zaten listede");
        if (galleryDone) galleryDone(added);
      });
    });
    $("scGallery").addEventListener("click", function () { UI.openGallery(function () { UI.renderScriptDialog(); }); });
  }

  UI.init = function () { bindTimeline(); bindDialogs(); bindLeftPanel(); bindLayoutPrefs(); bindScriptDialog(); bindGallery(); };
})(window);
