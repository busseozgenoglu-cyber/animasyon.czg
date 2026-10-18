/* Canlandır — hazır karakter kütüphanesi. Tutarlı çizgi film üslubunda, tuvalde çizilen karakterler:
   insanlar (parametrik: ten, saç, kıyafet, aksesuar, yaş), robot, köpek, kedi, kuş.
   Her karakter için duruş, konuşma (2 ağız), yürüme (2 adım), göz kırpma ve 4 duygu görseli üretilir. */
(function (root) {
  "use strict";
  var PI = Math.PI, TAU = PI * 2;
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function shade(hex, amt) {   // #rrggbb → koyu/açık ton
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + amt))); g = Math.max(0, Math.min(255, Math.round(g + amt))); b = Math.max(0, Math.min(255, Math.round(b + amt)));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  var OUT = "rgba(28,20,40,.55)", LW = 4.5;

  /* Temel çizim yardımcıları: dolgu + yumuşak kontur */
  function P(x) { x.lineWidth = LW; x.strokeStyle = OUT; x.lineJoin = "round"; x.lineCap = "round"; }
  function circle(x, cx, cy, r, fill, noStroke) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = fill; x.fill(); if (!noStroke) { P(x); x.stroke(); } }
  function ellipse(x, cx, cy, rx, ry, fill, rot, noStroke) { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); x.fillStyle = fill; x.fill(); if (!noStroke) { P(x); x.stroke(); } }
  function rrect(x, px, py, w, h, r, fill, noStroke) { x.beginPath(); x.roundRect(px, py, w, h, r); x.fillStyle = fill; x.fill(); if (!noStroke) { P(x); x.stroke(); } }
  function limb(x, x1, y1, x2, y2, w, color) { x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.lineCap = "round"; x.lineWidth = w + LW; x.strokeStyle = OUT; x.stroke(); x.lineWidth = w; x.strokeStyle = color; x.stroke(); }
  function poly(x, pts, fill, noStroke) { x.beginPath(); pts.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath(); x.fillStyle = fill; x.fill(); if (!noStroke) { P(x); x.stroke(); } }

  /* ── Yüz: gözler, kaşlar, ağız (tüm türlerde ortak) ─────────── */
  function face(x, cx, cy, s, v, opt) {
    opt = opt || {};
    var eyeDx = 22 * s, eyeY = cy - 4 * s, er = (v.eyes === "wide" ? 13 : 11) * s, pr = (v.eyes === "wide" ? 5 : 6) * s;
    [-1, 1].forEach(function (d) {
      var ex = cx + d * eyeDx;
      if (v.eyes === "closed") { x.beginPath(); x.moveTo(ex - 9 * s, eyeY + 2 * s); x.quadraticCurveTo(ex, eyeY + 8 * s, ex + 9 * s, eyeY + 2 * s); x.lineWidth = 3.5 * s; x.strokeStyle = "#2b2140"; x.stroke(); return; }
      ellipse(x, ex, eyeY, er * 0.85, er, "#ffffff", 0, true);
      circle(x, ex + d * 1.5 * s, eyeY + 2 * s, pr, opt.eyeColor || "#2b2140", true);
      circle(x, ex + d * 1.5 * s - 2 * s, eyeY - 1 * s, pr * 0.35, "#ffffff", true);
    });
    // kaşlar
    x.lineWidth = 3.5 * s; x.strokeStyle = opt.browColor || "#3b2a1f"; x.lineCap = "round";
    [-1, 1].forEach(function (d) {
      var bx = cx + d * eyeDx, by = eyeY - 18 * s, tilt = 0;
      if (v.brows === "angry") tilt = d * 6 * s; else if (v.brows === "sad") tilt = -d * 6 * s; else if (v.brows === "up") by -= 5 * s;
      x.beginPath(); x.moveTo(bx - 9 * s, by - tilt); x.lineTo(bx + 9 * s, by + tilt); x.stroke();
    });
    // ağız
    var my = cy + 20 * s;
    x.lineWidth = 3.5 * s; x.strokeStyle = "#8c2f39"; x.fillStyle = "#8c2f39";
    if (v.mouth === "smile") { x.beginPath(); x.arc(cx, my - 4 * s, 13 * s, 0.15 * PI, 0.85 * PI); x.stroke(); }
    else if (v.mouth === "big") { x.beginPath(); x.arc(cx, my - 2 * s, 15 * s, 0.05 * PI, 0.95 * PI); x.closePath(); x.fill(); x.fillStyle = "#fff"; x.fillRect(cx - 10 * s, my - 2 * s, 20 * s, 4 * s); }
    else if (v.mouth === "open1") { ellipse(x, cx, my + 2 * s, 7 * s, 6 * s, "#7a2d2d", 0, true); }
    else if (v.mouth === "open2") { ellipse(x, cx, my + 3 * s, 10 * s, 11 * s, "#7a2d2d", 0, true); ellipse(x, cx, my + 9 * s, 5 * s, 3 * s, "#e06c75", 0, true); }
    else if (v.mouth === "sad") { x.beginPath(); x.arc(cx, my + 12 * s, 12 * s, 1.15 * PI, 1.85 * PI); x.stroke(); }
    else if (v.mouth === "angry") { x.beginPath(); x.moveTo(cx - 12 * s, my + 2 * s); x.lineTo(cx + 12 * s, my - 1 * s); x.stroke(); }
    else if (v.mouth === "o") { ellipse(x, cx, my + 2 * s, 6 * s, 8 * s, "#7a2d2d", 0, true); }
    // yanaklar
    if (v.mouth === "smile" || v.mouth === "big") { x.fillStyle = "rgba(255,120,120,.35)"; [-1, 1].forEach(function (d) { x.beginPath(); x.arc(cx + d * 30 * s, cy + 12 * s, 7 * s, 0, TAU); x.fill(); }); }
  }

  /* ── İnsan ───────────────────────────────────────────────── */
  function drawHuman(p, v) {
    var W = 260, H = 380, c = canvas(W, H), x = c.getContext("2d");
    var age = p.body || "adult", cx = 130;
    var headR = age === "child" ? 50 : age === "elder" ? 44 : 44, headY = age === "child" ? 96 : 84;
    var torsoTop = headY + headR - 6, torsoBot = age === "child" ? 262 : 270, torsoW = age === "child" ? 72 : (p.wide ? 86 : 70);
    var legLen = H - 24 - torsoBot, skin = p.skin || "#ffd6a5", hairC = p.hair || "#5a3825", outfit = p.outfit || "#4d96ff", outfit2 = p.outfit2 || shade(outfit, -40);
    var legs = v.legs || "stand", arms = v.arms || "down";
    // pelerin (arkada)
    if (p.outfit_style === "cape") { poly(x, [[cx - torsoW / 2 - 4, torsoTop + 10], [cx + torsoW / 2 + 4, torsoTop + 10], [cx + torsoW / 2 + 30, torsoBot + 40], [cx - torsoW / 2 - 30, torsoBot + 40]], p.cape || "#c0392b"); }
    // bacaklar
    var lo = legs === "walk1" ? 20 : legs === "walk2" ? -20 : 0;
    var legC = p.pants || shade(outfit2, -20), shoe = p.shoes || "#2b2140";
    limb(x, cx - 18, torsoBot - 6, cx - 20 - lo * 0.6, torsoBot + legLen - 10, 22, legC);
    limb(x, cx + 18, torsoBot - 6, cx + 20 + lo * 0.6, torsoBot + legLen - 10, 22, legC);
    ellipse(x, cx - 20 - lo * 0.6 - 3, torsoBot + legLen - 4, 20, 10, shoe);
    ellipse(x, cx + 20 + lo * 0.6 + 3, torsoBot + legLen - 4, 20, 10, shoe);
    // gövde / kıyafet
    if (p.outfit_style === "dress") poly(x, [[cx - torsoW / 2 + 10, torsoTop], [cx + torsoW / 2 - 10, torsoTop], [cx + torsoW / 2 + 22, torsoBot + 16], [cx - torsoW / 2 - 22, torsoBot + 16]], outfit);
    else rrect(x, cx - torsoW / 2, torsoTop, torsoW, torsoBot - torsoTop + 6, 22, outfit);
    if (p.outfit_style === "cardigan" || p.outfit_style === "blazer") { rrect(x, cx - 14, torsoTop + 4, 28, torsoBot - torsoTop - 10, 6, p.inner || "#f5f5f5", true); x.beginPath(); x.moveTo(cx - 14, torsoTop + 4); x.lineTo(cx - 14, torsoBot - 6); x.moveTo(cx + 14, torsoTop + 4); x.lineTo(cx + 14, torsoBot - 6); P(x); x.stroke(); }
    if (p.outfit_style === "armor") { x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 3; for (var ay = torsoTop + 22; ay < torsoBot - 10; ay += 18) { x.beginPath(); x.moveTo(cx - torsoW / 2 + 6, ay); x.lineTo(cx + torsoW / 2 - 6, ay); x.stroke(); } }
    if (p.outfit_style === "hoodie") { ellipse(x, cx, torsoTop + 6, 30, 12, shade(outfit, -25)); }
    if (p.accessory === "tie") { poly(x, [[cx - 6, torsoTop + 6], [cx + 6, torsoTop + 6], [cx + 9, torsoTop + 60], [cx, torsoTop + 72], [cx - 9, torsoTop + 60]], p.tie || "#c0392b"); }
    if (p.pattern === "dots") { x.fillStyle = "rgba(255,255,255,.55)"; for (var dy = torsoTop + 20; dy < torsoBot - 10; dy += 24) for (var dx = -torsoW / 2 + 14; dx < torsoW / 2 - 6; dx += 22) { x.beginPath(); x.arc(cx + dx + ((dy / 24) % 2) * 10, dy, 4, 0, TAU); x.fill(); } }
    if (p.pattern === "stripes") { x.fillStyle = "rgba(255,255,255,.4)"; for (var sy = torsoTop + 14; sy < torsoBot - 8; sy += 20) x.fillRect(cx - torsoW / 2 + 4, sy, torsoW - 8, 7); }
    // kollar
    var sh = torsoTop + 16, armC = p.outfit_style === "dress" || p.sleeveless ? skin : outfit;
    if (arms === "up") { limb(x, cx - torsoW / 2 + 6, sh, cx - torsoW / 2 - 26, sh - 58, 20, armC); limb(x, cx + torsoW / 2 - 6, sh, cx + torsoW / 2 + 26, sh - 58, 20, armC); circle(x, cx - torsoW / 2 - 28, sh - 66, 12, skin); circle(x, cx + torsoW / 2 + 28, sh - 66, 12, skin); }
    else if (arms === "wave") { limb(x, cx - torsoW / 2 + 6, sh, cx - torsoW / 2 - 20, sh + 60, 20, armC); limb(x, cx + torsoW / 2 - 6, sh, cx + torsoW / 2 + 28, sh - 50, 20, armC); circle(x, cx - torsoW / 2 - 22, sh + 70, 12, skin); circle(x, cx + torsoW / 2 + 30, sh - 60, 12, skin); }
    else { var swing = legs === "walk1" ? 14 : legs === "walk2" ? -14 : 0; limb(x, cx - torsoW / 2 + 6, sh, cx - torsoW / 2 - 18 + swing, sh + 64, 20, armC); limb(x, cx + torsoW / 2 - 6, sh, cx + torsoW / 2 + 18 - swing, sh + 64, 20, armC); circle(x, cx - torsoW / 2 - 20 + swing, sh + 74, 12, skin); circle(x, cx + torsoW / 2 + 20 - swing, sh + 74, 12, skin); }
    // boyun + baş
    rrect(x, cx - 10, headY + headR - 14, 20, 22, 6, shade(skin, -18), true);
    // uzun saç arkası
    if (p.hairStyle === "long") {   // başın arkası + omuza inen iki yan tutam (yüzü kapatmaz)
      circle(x, cx, headY - 2, headR + 4, hairC);
      rrect(x, cx - headR - 10, headY - 6, 24, headR + 70, 12, hairC);
      rrect(x, cx + headR - 14, headY - 6, 24, headR + 70, 12, hairC);
    }
    if (p.hairStyle === "ponytail") { ellipse(x, cx + headR + 6, headY + 18, 16, 34, hairC, -0.3); }
    circle(x, cx, headY, headR, skin);
    // kulaklar
    circle(x, cx - headR + 2, headY + 4, 9, skin); circle(x, cx + headR - 2, headY + 4, 9, skin);
    // saç ön
    var hs = p.hairStyle || "short";
    if (hs === "short" || hs === "long" || hs === "ponytail") { x.beginPath(); x.arc(cx, headY - 4, headR + 2, PI * 1.02, PI * 1.98); x.quadraticCurveTo(cx + headR * 0.4, headY - headR * 0.35, cx, headY - headR * 0.45); x.quadraticCurveTo(cx - headR * 0.5, headY - headR * 0.3, cx - headR - 2, headY - 4); x.closePath(); x.fillStyle = hairC; x.fill(); P(x); x.stroke(); }
    else if (hs === "curly") { for (var i = 0; i < 7; i++) { var a = PI + (i / 6) * PI; circle(x, cx + Math.cos(a) * (headR - 2), headY - 2 + Math.sin(a) * (headR - 2), 15, hairC); } }
    else if (hs === "bun") { x.beginPath(); x.arc(cx, headY - 2, headR + 2, PI, TAU); x.closePath(); x.fillStyle = hairC; x.fill(); P(x); x.stroke(); circle(x, cx, headY - headR - 10, 17, hairC); }
    else if (hs === "spiky") { poly(x, [[cx - headR, headY - 6], [cx - headR * 0.6, headY - headR - 14], [cx - headR * 0.25, headY - headR + 4], [cx, headY - headR - 20], [cx + headR * 0.25, headY - headR + 4], [cx + headR * 0.6, headY - headR - 14], [cx + headR, headY - 6]], hairC); }
    else if (hs === "bald") { /* kel */ }
    else if (hs === "sidepart") { x.beginPath(); x.arc(cx, headY - 2, headR + 2, PI * 1.05, PI * 1.95); x.lineTo(cx + headR * 0.3, headY - headR * 0.55); x.closePath(); x.fillStyle = hairC; x.fill(); P(x); x.stroke(); }
    // yüz
    face(x, cx, headY, 1, v, { browColor: hs === "bald" ? "#777" : shade(hairC, -20) });
    // sakal / bıyık
    if (p.accessory === "beard" || p.beard) { x.beginPath(); x.arc(cx, headY + 12, headR - 6, 0.1 * PI, 0.9 * PI); x.closePath(); x.fillStyle = p.beardColor || hairC; x.fill(); P(x); x.stroke(); face(x, cx, headY, 1, Object.assign({}, v, { brows: v.brows }), { browColor: shade(hairC, -20) }); }
    if (p.accessory === "mustache" || p.mustache) { x.fillStyle = p.beardColor || hairC; x.beginPath(); x.ellipse(cx - 11, headY + 14, 12, 5, -0.2, 0, TAU); x.ellipse(cx + 11, headY + 14, 12, 5, 0.2, 0, TAU); x.fill(); }
    // aksesuarlar
    if (p.glasses) { x.lineWidth = 3; x.strokeStyle = "#2b2140"; [-1, 1].forEach(function (d) { x.beginPath(); x.arc(cx + d * 22, headY - 4, 15, 0, TAU); x.stroke(); }); x.beginPath(); x.moveTo(cx - 7, headY - 4); x.lineTo(cx + 7, headY - 4); x.stroke(); }
    if (p.accessory === "bow") { poly(x, [[cx + 18, headY - headR + 4], [cx + 40, headY - headR - 12], [cx + 40, headY - headR + 16]], "#ff5c8a"); poly(x, [[cx + 18, headY - headR + 4], [cx - 4, headY - headR - 10], [cx - 4, headY - headR + 14]], "#ff5c8a"); circle(x, cx + 18, headY - headR + 4, 6, "#ff2e63"); }
    if (p.accessory === "cap") { x.beginPath(); x.arc(cx, headY - 10, headR + 2, PI, TAU); x.closePath(); x.fillStyle = p.capColor || "#e63946"; x.fill(); P(x); x.stroke(); rrect(x, cx - 4, headY - 14, headR + 30, 10, 5, p.capColor || "#e63946"); }
    if (p.accessory === "hat") { rrect(x, cx - headR - 10, headY - headR + 2, headR * 2 + 20, 12, 6, p.hatColor || "#5b3a1e"); rrect(x, cx - headR + 8, headY - headR - 36, headR * 2 - 16, 42, 8, p.hatColor || "#5b3a1e"); }
    if (p.accessory === "crown") { poly(x, [[cx - 34, headY - headR + 6], [cx - 34, headY - headR - 24], [cx - 17, headY - headR - 6], [cx, headY - headR - 30], [cx + 17, headY - headR - 6], [cx + 34, headY - headR - 24], [cx + 34, headY - headR + 6]], "#ffd60a"); [[-17, -12], [0, -16], [17, -12]].forEach(function (g) { circle(x, cx + g[0], headY - headR + g[1], 4, "#e63946", true); }); }
    if (p.accessory === "helmet") { x.beginPath(); x.arc(cx, headY - 4, headR + 6, PI, TAU); x.closePath(); x.fillStyle = "#9aa5b8"; x.fill(); P(x); x.stroke(); rrect(x, cx - headR - 6, headY - 8, headR * 2 + 12, 12, 4, "#7d8aa0"); poly(x, [[cx - 4, headY - headR - 6], [cx + 4, headY - headR - 6], [cx + 3, headY - headR - 34], [cx - 3, headY - headR - 34]], "#e63946"); }
    if (p.accessory === "antenna") { limb(x, cx, headY - headR + 4, cx, headY - headR - 30, 6, shade(skin, -30)); circle(x, cx, headY - headR - 34, 9, "#ffd60a"); }
    if (p.accessory === "pirate") { poly(x, [[cx - headR - 16, headY - headR + 10], [cx + headR + 16, headY - headR + 10], [cx + headR - 10, headY - headR - 30], [cx, headY - headR - 20], [cx - headR + 10, headY - headR - 30]], "#2b2140"); x.fillStyle = "#fff"; x.font = "bold 20px sans-serif"; x.textAlign = "center"; x.fillText("☠", cx, headY - headR - 2); x.fillStyle = "#2b2140"; x.beginPath(); x.arc(cx + 22, headY - 4, 13, 0, TAU); x.fill(); x.lineWidth = 3; x.strokeStyle = "#2b2140"; x.beginPath(); x.moveTo(cx - headR, headY - 14); x.lineTo(cx + headR, headY - 2); x.stroke(); }
    if (p.accessory === "headscarf") { x.beginPath(); x.arc(cx, headY - 2, headR + 6, PI * 0.95, PI * 2.05); x.closePath(); x.fillStyle = p.scarf || "#e9c46a"; x.fill(); P(x); x.stroke(); rrect(x, cx - headR - 8, headY + 8, 20, 50, 8, p.scarf || "#e9c46a"); }
    if (p.label) { x.font = "700 24px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; var tw = x.measureText(p.label).width + 22; rrect(x, cx - tw / 2, torsoTop + 36, tw, 34, 10, "rgba(255,255,255,.92)", true); x.fillStyle = shade(outfit, -70); x.fillText(p.label, cx, torsoTop + 53); }
    return c;
  }

  /* ── Robot ─────────────────────────────────────────────── */
  function drawRobot(p, v) {
    var c = canvas(260, 380), x = c.getContext("2d"), cx = 130, body = p.outfit || "#9aa5b8", dark = shade(body, -45), led = p.led || "#00f5ff";
    var lo = v.legs === "walk1" ? 16 : v.legs === "walk2" ? -16 : 0;
    limb(x, cx - 26, 268, cx - 30 - lo, 340, 22, dark); limb(x, cx + 26, 268, cx + 30 + lo, 340, 22, dark);
    rrect(x, cx - 50 - lo, 334, 44, 18, 6, "#2b2140"); rrect(x, cx + 6 + lo, 334, 44, 18, 6, "#2b2140");
    rrect(x, cx - 60, 150, 120, 126, 18, body);
    rrect(x, cx - 40, 172, 80, 50, 8, dark); x.fillStyle = led; for (var i = 0; i < 3; i++) x.fillRect(cx - 30 + i * 26, 184, 16, 10 + ((i + (v.mouth === "open1" ? 1 : 0)) % 2) * 14);
    circle(x, cx - 30, 246, 8, "#e63946"); circle(x, cx, 246, 8, "#ffd60a"); circle(x, cx + 30, 246, 8, "#43d17a");
    var swing = v.legs === "walk1" ? 14 : v.legs === "walk2" ? -14 : 0, up = v.arms === "up" ? -70 : v.arms === "wave" ? -60 : 70;
    limb(x, cx - 58, 170, cx - 92 + swing, 170 + (v.arms === "up" ? up : 70), 18, dark); limb(x, cx + 58, 170, cx + 92 - swing, 170 + up, 18, dark);
    circle(x, cx - 94 + swing, 170 + (v.arms === "up" ? up : 70), 12, body); circle(x, cx + 94 - swing, 170 + up, 12, body);
    rrect(x, cx - 54, 50, 108, 96, 20, body);
    limb(x, cx, 50, cx, 20, 6, dark); circle(x, cx, 14, 9, v.eyes === "closed" ? "#555" : "#ffd60a");
    // ekran gözler
    rrect(x, cx - 44, 64, 88, 56, 10, "#1a2130", true);
    [-1, 1].forEach(function (d) {
      var ex = cx + d * 20, ey = 90;
      if (v.eyes === "closed") { x.fillStyle = led; x.fillRect(ex - 12, ey - 2, 24, 4); return; }
      var r = v.eyes === "wide" ? 13 : 10; circle(x, ex, ey, r, led, true); circle(x, ex + d * 2, ey + 2, r * 0.45, "#1a2130", true);
    });
    x.strokeStyle = led; x.lineWidth = 4; x.lineCap = "round";
    if (v.brows === "angry") { [-1, 1].forEach(function (d) { x.beginPath(); x.moveTo(cx + d * 10, 70); x.lineTo(cx + d * 30, 76); x.stroke(); }); }
    if (v.brows === "sad") { [-1, 1].forEach(function (d) { x.beginPath(); x.moveTo(cx + d * 10, 76); x.lineTo(cx + d * 30, 70); x.stroke(); }); }
    // ağız: LED çubuk desenleri
    x.fillStyle = led;
    var m = v.mouth || "smile";
    if (m === "smile" || m === "big") { x.beginPath(); x.arc(cx, 112, m === "big" ? 24 : 18, 0.15 * PI, 0.85 * PI); x.lineWidth = 5; x.strokeStyle = led; x.stroke(); }
    else if (m === "sad") { x.beginPath(); x.arc(cx, 140, 16, 1.15 * PI, 1.85 * PI); x.lineWidth = 5; x.strokeStyle = led; x.stroke(); }
    else if (m === "angry") { x.fillRect(cx - 18, 124, 36, 5); }
    else { var hh = m === "open2" ? 18 : m === "o" ? 14 : 10; for (var k = -2; k <= 2; k++) x.fillRect(cx + k * 9 - 3, 128 - (Math.abs(k) === 1 ? hh : hh * 0.6) / 2, 6, Math.abs(k) === 1 ? hh : hh * 0.6); }
    return c;
  }

  /* ── Köpek / kedi (yan görünüş, sağa bakar) ─────────────── */
  function drawPet(p, v, cat) {
    var c = canvas(300, 230), x = c.getContext("2d"), fur = p.outfit || (cat ? "#f4a261" : "#b5651d"), fur2 = shade(fur, 30), dark = shade(fur, -40);
    var lo = v.legs === "walk1" ? 14 : v.legs === "walk2" ? -14 : 0, tailUp = v.legs === "walk1" || v.mouth === "big";
    // kuyruk
    x.beginPath(); x.moveTo(70, 130); x.quadraticCurveTo(20, tailUp ? 60 : 150, cat ? 30 : 40, tailUp ? 40 : 110); x.lineWidth = cat ? 12 : 16; x.strokeStyle = OUT; x.lineCap = "round"; x.stroke(); x.lineWidth = cat ? 8 : 12; x.strokeStyle = fur; x.stroke();
    // arka bacaklar
    limb(x, 95, 160, 85 - lo, 206, 18, fur); limb(x, 190, 160, 200 + lo, 206, 18, fur);
    ellipse(x, 150, 130, 95, 48, fur);
    ellipse(x, 160, 140, 55, 28, fur2, 0, true);
    // ön bacaklar
    limb(x, 110, 165, 100 + lo, 208, 18, fur); limb(x, 205, 165, 215 - lo, 208, 18, fur);
    [85 - lo, 200 + lo, 100 + lo, 215 - lo].forEach(function (fx) { ellipse(x, fx + 3, 210, 14, 7, dark); });
    // baş
    var hx = 228, hy = 90;
    if (cat) { poly(x, [[hx - 40, hy - 20], [hx - 36, hy - 62], [hx - 8, hy - 36]], fur); poly(x, [[hx + 40, hy - 20], [hx + 36, hy - 62], [hx + 8, hy - 36]], fur); }
    circle(x, hx, hy, 44, fur);
    if (!cat) { ellipse(x, hx - 38, hy + 6, 14, 30, dark, 0.2); ellipse(x, hx + 38, hy + 6, 14, 30, dark, -0.2); }   // sarkık kulaklar
    ellipse(x, hx + 6, hy + 18, 26, 18, fur2, 0, true);
    circle(x, hx + 10, hy + 12, 8, "#2b2140", true);   // burun
    if (cat) { x.strokeStyle = "#2b2140"; x.lineWidth = 2; [-1, 1].forEach(function (d) { for (var w = -1; w <= 1; w++) { x.beginPath(); x.moveTo(hx + 10 + d * 10, hy + 16 + w * 5); x.lineTo(hx + 10 + d * 46, hy + 10 + w * 10); x.stroke(); } }); }
    // gözler ve ağız
    face(x, hx, hy - 6, 0.8, Object.assign({}, v, { mouth: v.mouth === "open1" || v.mouth === "open2" ? "open2" : v.mouth }), { browColor: dark });
    if (v.mouth === "big") { ellipse(x, hx + 4, hy + 34, 7, 10, "#e06c75", 0, true); }   // dil
    // tasma
    rrect(x, hx - 46, hy + 36, 92, 12, 6, p.collar || "#e63946");
    circle(x, hx, hy + 48, 7, "#ffd60a");
    return c;
  }

  /* ── Kuş ───────────────────────────────────────────────── */
  function drawBird(p, v) {
    var c = canvas(200, 220), x = c.getContext("2d"), body = p.outfit || "#4d96ff", wing = shade(body, -35);
    limb(x, 88, 170, 80, 206, 6, "#ffb703"); limb(x, 112, 170, 120, 206, 6, "#ffb703");
    ellipse(x, 100, 130, 50, 44, body);
    var flap = v.legs === "walk1" ? -40 : v.legs === "walk2" ? 20 : 0;
    poly(x, [[70, 130], [20, 150 + flap], [80, 160]], wing);
    circle(x, 128, 80, 36, body);
    poly(x, [[158, 78], [192, 86], [158, 94]], "#ffb703");
    if (v.mouth === "open1" || v.mouth === "open2" || v.mouth === "big") poly(x, [[158, 86], [190, 100], [158, 98]], "#f4a300");
    face(x, 124, 72, 0.6, Object.assign({}, v, { mouth: "none" }), { browColor: wing });
    poly(x, [[112, 48], [120, 30], [130, 48]], wing); poly(x, [[122, 46], [136, 28], [140, 48]], wing);
    return c;
  }

  /* ── Varyantlar ve roller ────────────────────────────────── */
  var ROLE_VARIANTS = {
    pose: { mouth: "smile", eyes: "open", brows: "normal", legs: "stand", arms: "down" },
    talk1: { mouth: "open1", eyes: "open", brows: "normal", legs: "stand", arms: "down" },
    talk2: { mouth: "open2", eyes: "open", brows: "up", legs: "stand", arms: "down" },
    walk1: { mouth: "smile", eyes: "open", brows: "normal", legs: "walk1", arms: "down" },
    walk2: { mouth: "smile", eyes: "open", brows: "normal", legs: "walk2", arms: "down" },
    blink: { mouth: "smile", eyes: "closed", brows: "normal", legs: "stand", arms: "down" },
    mutlu: { mouth: "big", eyes: "open", brows: "up", legs: "stand", arms: "up" },
    uzgun: { mouth: "sad", eyes: "open", brows: "sad", legs: "stand", arms: "down" },
    kizgin: { mouth: "angry", eyes: "open", brows: "angry", legs: "stand", arms: "down" },
    saskin: { mouth: "o", eyes: "wide", brows: "up", legs: "stand", arms: "down" }
  };
  var ROLE_OF = { pose: "pose", talk1: "talk", talk2: "talk", walk1: "walk", walk2: "walk", blink: "blink", mutlu: "mutlu", uzgun: "uzgun", kizgin: "kizgin", saskin: "saskin" };

  var LIST = [
    { id: "ali", name: "Ali", kind: "human", desc: "Meraklı çocuk", p: { body: "child", skin: "#ffd6a5", hair: "#5a3825", hairStyle: "short", outfit: "#43aa8b", pants: "#355070" } },
    { id: "ayse", name: "Ayşe", kind: "human", desc: "Neşeli kız", p: { body: "child", skin: "#ffdcb8", hair: "#2b2140", hairStyle: "ponytail", outfit: "#ff7aa2", outfit_style: "dress", accessory: "bow", pattern: "dots" } },
    { id: "can", name: "Can", kind: "human", desc: "Şapkalı çocuk", p: { body: "child", skin: "#e8b88a", hair: "#3b2a1f", hairStyle: "curly", outfit: "#4d96ff", outfit_style: "hoodie", accessory: "cap", capColor: "#ffb703", pants: "#2b2140" } },
    { id: "elif", name: "Elif", kind: "human", desc: "Gözlüklü kız", p: { body: "child", skin: "#ffd6a5", hair: "#8d5524", hairStyle: "long", outfit: "#ffd166", outfit_style: "dress", glasses: true } },
    { id: "anne", name: "Anne", kind: "human", desc: "Anne", p: { body: "adult", skin: "#ffd6a5", hair: "#4a2c17", hairStyle: "bun", outfit: "#2a9d8f", pants: "#264653" } },
    { id: "baba", name: "Baba", kind: "human", desc: "Baba", p: { body: "adult", skin: "#e8b88a", hair: "#2b2140", hairStyle: "sidepart", outfit: "#f1faee", accessory: "tie", tie: "#e63946", pants: "#1d3557", mustache: true } },
    { id: "dede", name: "Dede", kind: "human", desc: "Dede", p: { body: "elder", skin: "#f1d0a8", hair: "#dcdcdc", hairStyle: "bald", outfit: "#8d99ae", outfit_style: "cardigan", inner: "#edf2f4", glasses: true, beard: true, beardColor: "#dcdcdc", pants: "#5c6b73" } },
    { id: "nine", name: "Nine", kind: "human", desc: "Nine", p: { body: "elder", skin: "#f1d0a8", hair: "#e9e9e9", hairStyle: "bun", outfit: "#9b5de5", outfit_style: "dress", glasses: true, accessory: "headscarf", scarf: "#f4a261" } },
    { id: "ogretmen", name: "Öğretmen", kind: "human", desc: "Öğretmen", p: { body: "adult", skin: "#ffdcb8", hair: "#6d4c41", hairStyle: "long", outfit: "#003049", outfit_style: "blazer", inner: "#fcbf49", pants: "#003049" } },
    { id: "kral", name: "Kral", kind: "human", desc: "Kral", p: { body: "adult", wide: true, skin: "#ffd6a5", hair: "#5a3825", hairStyle: "short", outfit: "#6a040f", outfit_style: "cape", cape: "#c0392b", accessory: "crown", beard: true, pants: "#370617" } },
    { id: "prenses", name: "Prenses", kind: "human", desc: "Prenses", p: { body: "child", skin: "#ffdcb8", hair: "#ffb703", hairStyle: "long", outfit: "#f72585", outfit_style: "dress", accessory: "crown" } },
    { id: "sovalye", name: "Şövalye", kind: "human", desc: "Şövalye", p: { body: "adult", skin: "#e8b88a", hair: "#3b2a1f", hairStyle: "short", outfit: "#adb5bd", outfit_style: "armor", accessory: "helmet", pants: "#6c757d" } },
    { id: "korsan", name: "Korsan", kind: "human", desc: "Korsan", p: { body: "adult", skin: "#e8b88a", hair: "#2b2140", hairStyle: "short", outfit: "#ffffff", pattern: "stripes", accessory: "pirate", beard: true, pants: "#2b2140" } },
    { id: "uzayli", name: "Uzaylı", kind: "human", desc: "Uzaylı Zip", p: { body: "child", skin: "#80ed99", hair: "#80ed99", hairStyle: "bald", outfit: "#7209b7", accessory: "antenna", pants: "#3a0ca3" } },
    { id: "robot", name: "Robi", kind: "robot", desc: "Robot", p: { outfit: "#9aa5b8", led: "#00f5ff" } },
    { id: "kopek", name: "Karabaş", kind: "dog", desc: "Köpek", p: { outfit: "#b5651d", collar: "#e63946" } },
    { id: "kedi", name: "Pamuk", kind: "cat", desc: "Kedi", p: { outfit: "#f4a261", collar: "#4d96ff" } },
    { id: "kus", name: "Cik", kind: "bird", desc: "Kuş", p: { outfit: "#4d96ff" } }
  ];
  var BY_ID = {}; LIST.forEach(function (c) { BY_ID[c.id] = c; });

  function draw(entry, variantName) {
    var v = ROLE_VARIANTS[variantName] || ROLE_VARIANTS.pose;
    if (entry.kind === "robot") return drawRobot(entry.p, v);
    if (entry.kind === "dog") return drawPet(entry.p, v, false);
    if (entry.kind === "cat") return drawPet(entry.p, v, true);
    if (entry.kind === "bird") return drawBird(entry.p, v);
    return drawHuman(entry.p, v);
  }
  function facingOf(entry) { return (entry.kind === "dog" || entry.kind === "cat" || entry.kind === "bird") ? "right" : "right"; }
  /* Sahnedeki göreli boy: evcil hayvanlar ve çocuklar yetişkinlerden kısa */
  function sizeOf(entry) {
    if (entry.kind === "dog" || entry.kind === "cat") return 0.62;
    if (entry.kind === "bird") return 0.4;
    if (entry.kind === "robot") return 0.95;
    var b = entry.p && entry.p.body;
    return b === "child" ? 0.86 : b === "elder" ? 0.96 : 1;
  }

  /* Kütüphane karakterini projeye ekler: tüm roller için görseller üretir */
  function generate(project, id, nameOverride) {
    var entry = typeof id === "string" ? BY_ID[id] : id;
    if (!entry) throw new Error("Karakter yok: " + id);
    var M = root.Motion, R = root.Render, images = [];
    Object.keys(ROLE_VARIANTS).forEach(function (vn) {
      var key = "lib:" + (entry.id || entry.name) + ":" + vn + ":" + (entry.label || "");
      var found = null;
      Object.keys(project.assets).forEach(function (aid) { if (project.assets[aid].genKey === key) found = aid; });
      if (!found) {
        var c = draw(entry, vn), aid = M.uid("as");
        project.assets[aid] = { id: aid, name: (nameOverride || entry.name) + "-" + vn + ".png", dataUrl: c.toDataURL("image/png"), width: c.width, height: c.height, genKey: key };
        if (R) R.loadAsset(project.assets[aid]);
        found = aid;
      }
      images.push({ assetId: found, role: ROLE_OF[vn] });
    });
    return { name: nameOverride || entry.name, facing: facingOf(entry), images: images, libraryId: entry.id, size: sizeOf(entry) };
  }

  /* Ada göre rastgele ama kararlı bir insan: görselsiz karakterler için (isim etiketli) */
  var SKINS = ["#ffd6a5", "#ffdcb8", "#e8b88a", "#c68642", "#8d5524", "#f1d0a8"], HAIRS = ["#5a3825", "#2b2140", "#8d5524", "#ffb703", "#c0392b", "#3b2a1f", "#dcdcdc"];
  var STYLES = ["short", "long", "ponytail", "bun", "curly", "spiky", "sidepart"], OUTFITS = ["#43aa8b", "#ff7aa2", "#4d96ff", "#ffd166", "#2a9d8f", "#f72585", "#9b5de5", "#f4a261", "#e63946", "#577590"];
  function random(name) {
    var h = hash(root.Director ? root.Director.norm(name) : name);
    var p = { body: ["child", "child", "adult", "adult", "elder"][h % 5], skin: SKINS[(h >> 3) % SKINS.length], hair: HAIRS[(h >> 6) % HAIRS.length], hairStyle: STYLES[(h >> 9) % STYLES.length],
      outfit: OUTFITS[(h >> 12) % OUTFITS.length], pants: ["#355070", "#2b2140", "#1d3557", "#5c6b73"][(h >> 15) % 4], glasses: ((h >> 17) % 5) === 0, label: name };
    if (p.body === "elder") { p.hair = "#dcdcdc"; p.glasses = true; }
    if ((h >> 19) % 3 === 0) { p.outfit_style = "dress"; }
    return { id: "rnd-" + (root.Director ? root.Director.norm(name).replace(/\s+/g, "-") : name), name: name, kind: "human", p: p, label: name };
  }

  /* Galeri küçük resmi */
  var thumbCache = {};
  function thumb(id) {
    if (thumbCache[id]) return thumbCache[id];
    var c = draw(BY_ID[id], "pose"), t = canvas(140, 180), x = t.getContext("2d");
    var s = Math.min(130 / c.width, 170 / c.height);
    x.drawImage(c, (140 - c.width * s) / 2, (180 - c.height * s) / 2, c.width * s, c.height * s);
    return (thumbCache[id] = t.toDataURL("image/png"));
  }
  function findByName(name) {
    var n = root.Director ? root.Director.norm(name) : String(name).toLowerCase();
    for (var i = 0; i < LIST.length; i++) { var e = LIST[i], en = root.Director ? root.Director.norm(e.name) : e.name.toLowerCase(); if (en === n || root.Director && root.Director.norm(e.desc) === n) return e; }
    return null;
  }

  root.Characters = { LIST: LIST, BY_ID: BY_ID, ROLE_VARIANTS: ROLE_VARIANTS, draw: draw, generate: generate, random: random, thumb: thumb, findByName: findByName };
})(window);
