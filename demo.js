/* Canlandır — örnek sahne: tuval üzerinde çizilen basit çizgi film görselleriyle hazır bir mini film.
   Kullanıcı tek tıkla ne yapılabileceğini görür; testler de bunu kullanır. */
(function (root) {
  "use strict";
  var M = root.Motion, Model = root.Model;

  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function asset(project, name, c) {
    var id = M.uid("as");
    project.assets[id] = { id: id, name: name, dataUrl: c.toDataURL("image/png"), width: c.width, height: c.height };
    return id;
  }

  function drawSun() {
    var c = canvas(260, 260), x = c.getContext("2d");
    x.translate(130, 130);
    x.strokeStyle = "#ffb703"; x.lineWidth = 14; x.lineCap = "round";
    for (var i = 0; i < 12; i++) { x.beginPath(); x.moveTo(0, -88); x.lineTo(0, -118); x.stroke(); x.rotate(Math.PI / 6); }
    x.fillStyle = "#ffd60a"; x.beginPath(); x.arc(0, 0, 76, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#f4a300"; x.lineWidth = 6; x.stroke();
    x.fillStyle = "#3a2a00";
    x.beginPath(); x.arc(-26, -12, 7, 0, Math.PI * 2); x.arc(26, -12, 7, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#3a2a00"; x.lineWidth = 6; x.lineCap = "round";
    x.beginPath(); x.arc(0, 8, 32, 0.25 * Math.PI, 0.75 * Math.PI); x.stroke();
    x.fillStyle = "rgba(255,120,120,.45)"; x.beginPath(); x.arc(-46, 14, 11, 0, Math.PI * 2); x.arc(46, 14, 11, 0, Math.PI * 2); x.fill();
    return c;
  }
  function drawCloud(seed) {
    var c = canvas(340, 190), x = c.getContext("2d");
    x.fillStyle = "#ffffff";
    var blobs = seed ? [[90, 120, 55], [160, 95, 70], [240, 115, 58], [120, 70, 42], [200, 70, 48]] : [[80, 125, 50], [150, 100, 66], [230, 120, 60], [190, 75, 50]];
    blobs.forEach(function (b) { x.beginPath(); x.arc(b[0], b[1], b[2], 0, Math.PI * 2); x.fill(); });
    x.fillRect(80, 120, 160, 50);
    x.fillStyle = "rgba(170,200,230,.55)";
    x.beginPath(); x.ellipse(165, 162, 110, 14, 0, 0, Math.PI * 2); x.fill();
    return c;
  }
  function drawHills(w) {
    var c = canvas(w, 330), x = c.getContext("2d");
    function hill(cx, cy, rx, ry, col) { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); }
    hill(w * 0.2, 300, w * 0.45, 180, "#6cc04a");
    hill(w * 0.75, 320, w * 0.5, 200, "#4ea838");
    hill(w * 0.5, 360, w * 0.7, 190, "#3d8f2d");
    x.fillStyle = "#3d8f2d"; x.fillRect(0, 290, w, 40);
    // yol
    x.fillStyle = "#e9d8a6"; x.beginPath(); x.moveTo(0, 330); x.lineTo(w, 330); x.lineTo(w, 296); x.lineTo(0, 300); x.closePath(); x.fill();
    // çiçekler
    for (var i = 0; i < 18; i++) {
      var fx = (i * 97 + 40) % w, fy = 250 + (i * 37) % 40;
      x.fillStyle = ["#ff6b6b", "#ffd166", "#f78fb3", "#ffffff"][i % 4];
      for (var k = 0; k < 5; k++) { x.beginPath(); x.arc(fx + Math.cos(k * 1.256) * 6, fy + Math.sin(k * 1.256) * 6, 4, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = "#ffb703"; x.beginPath(); x.arc(fx, fy, 3, 0, Math.PI * 2); x.fill();
    }
    return c;
  }
  function drawCharacter(pose) {
    var c = canvas(240, 320), x = c.getContext("2d");
    x.lineCap = "round"; x.lineJoin = "round";
    // bacaklar
    x.strokeStyle = "#2b3a67"; x.lineWidth = 22;
    var legL = pose ? [100, 250, 78, 305] : [104, 250, 120, 305];
    var legR = pose ? [140, 250, 162, 305] : [136, 250, 118, 305];
    [legL, legR].forEach(function (l) { x.beginPath(); x.moveTo(l[0], l[1]); x.lineTo(l[2], l[3]); x.stroke(); });
    x.fillStyle = "#1d2b53";
    [[legL[2], legL[3]], [legR[2], legR[3]]].forEach(function (f) { x.beginPath(); x.ellipse(f[0], f[1] + 4, 24, 12, 0, 0, Math.PI * 2); x.fill(); });
    // gövde
    x.fillStyle = "#ff6b35"; x.beginPath(); x.ellipse(120, 190, 68, 78, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#ffffff"; x.beginPath(); x.ellipse(120, 205, 36, 42, 0, 0, Math.PI * 2); x.fill();
    // kollar
    x.strokeStyle = "#ff6b35"; x.lineWidth = 20;
    var armL = pose ? [62, 170, 30, 215] : [62, 170, 36, 130];
    var armR = pose ? [178, 170, 210, 130] : [178, 170, 206, 215];
    [armL, armR].forEach(function (a) { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(a[2], a[3]); x.stroke(); });
    x.fillStyle = "#ffd6a5";
    [[armL[2], armL[3]], [armR[2], armR[3]]].forEach(function (h) { x.beginPath(); x.arc(h[0], h[1], 13, 0, Math.PI * 2); x.fill(); });
    // baş
    x.fillStyle = "#ffd6a5"; x.beginPath(); x.arc(120, 92, 62, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#5a3825"; x.beginPath(); x.arc(120, 70, 62, Math.PI, 2 * Math.PI); x.fill();
    x.beginPath(); x.ellipse(120, 48, 70, 24, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#ffffff"; x.beginPath(); x.ellipse(98, 96, 14, 16, 0, 0, Math.PI * 2); x.ellipse(142, 96, 14, 16, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#1d2b53"; x.beginPath(); x.arc(101, 98, 7, 0, Math.PI * 2); x.arc(145, 98, 7, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#c0392b"; x.lineWidth = 6; x.beginPath(); x.arc(120, 112, 24, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
    x.fillStyle = "rgba(255,110,110,.5)"; x.beginPath(); x.arc(78, 118, 10, 0, Math.PI * 2); x.arc(162, 118, 10, 0, Math.PI * 2); x.fill();
    return c;
  }
  function drawBird(pose) {
    var c = canvas(140, 100), x = c.getContext("2d");
    x.fillStyle = "#4d96ff"; x.beginPath(); x.ellipse(70, 60, 30, 20, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(96, 46, 16, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#ffb703"; x.beginPath(); x.moveTo(110, 46); x.lineTo(128, 50); x.lineTo(110, 54); x.closePath(); x.fill();
    x.fillStyle = "#1d2b53"; x.beginPath(); x.arc(100, 43, 3, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#2f6fd6"; x.beginPath();
    if (pose) { x.moveTo(60, 58); x.lineTo(30, 18); x.lineTo(84, 50); } else { x.moveTo(60, 60); x.lineTo(34, 92); x.lineTo(86, 66); }
    x.closePath(); x.fill();
    x.beginPath(); x.moveTo(42, 62); x.lineTo(16, 52); x.lineTo(20, 74); x.closePath(); x.fill();
    return c;
  }

  function build(project) {
    var W = project.width, H = project.height;
    var ids = {
      sun: asset(project, "güneş.png", drawSun()),
      cloud1: asset(project, "bulut-1.png", drawCloud(0)),
      cloud2: asset(project, "bulut-2.png", drawCloud(1)),
      hills: asset(project, "tepeler.png", drawHills(W)),
      charA: asset(project, "karakter-adim-1.png", drawCharacter(0)),
      charB: asset(project, "karakter-adim-2.png", drawCharacter(1)),
      birdA: asset(project, "kuş-1.png", drawBird(0)),
      birdB: asset(project, "kuş-2.png", drawBird(1))
    };
    var s1 = Model.newScene("Köyde Sabah", 6);
    s1.background = { type: "gradient", color: "#4fa8ff", color2: "#d9f1ff", angle: 180, assetId: null };
    s1.transition = { type: "fade", duration: 0.6 };
    var k = H / 720;   // dikey ölçek

    var sun = Model.newLayer("image", { name: "Güneş", frames: [ids.sun], base: { x: W * 0.82, y: H * 0.2, rot: 0, sx: k, sy: k, opacity: 1 } });
    sun.effects.push(M.createEffect("spin", 6, sun)); sun.effects[0].params.speed = 0.08;
    sun.effects.push(M.createEffect("breathe", 6, sun));

    var c1 = Model.newLayer("image", { name: "Bulut 1", frames: [ids.cloud1], base: { x: W * 0.25, y: H * 0.18, rot: 0, sx: 0.8 * k, sy: 0.8 * k, opacity: 0.95 } });
    var d1 = M.createEffect("drift", 6, c1); d1.params.speed = 50; c1.effects.push(d1);
    var c2 = Model.newLayer("image", { name: "Bulut 2", frames: [ids.cloud2], base: { x: W * 0.6, y: H * 0.1, rot: 0, sx: 0.55 * k, sy: 0.55 * k, opacity: 0.9 } });
    var d2 = M.createEffect("drift", 6, c2); d2.params.speed = 30; c2.effects.push(d2);

    var hills = Model.newLayer("image", { name: "Tepeler", frames: [ids.hills], base: { x: W / 2, y: H - 165 * k, rot: 0, sx: 1, sy: k, opacity: 1 } });

    var bird = Model.newLayer("sequence", { name: "Kuş", frames: [ids.birdA, ids.birdB], frameFps: 6, base: { x: W * 0.15, y: H * 0.35, rot: 0, sx: k, sy: k, opacity: 1 } });
    var bd = M.createEffect("drift", 6, bird); bd.params.speed = 140; bd.params.wrap = "yes"; bird.effects.push(bd);
    bird.effects.push(M.createEffect("float", 6, bird)); bird.effects[1].params.strength = 12; bird.effects[1].params.speed = 1.2;

    var hero = Model.newLayer("sequence", { name: "Kahraman", frames: [ids.charA, ids.charB], frameFps: 5, base: { x: W * 0.5, y: H - 190 * k, rot: 0, sx: 0.9 * k, sy: 0.9 * k, opacity: 1 } });
    hero.anchor = { x: 0.5, y: 0.95 };
    var walk = M.createEffect("walk", 6, hero); walk.params.distance = W * 0.7; walk.params.speed = 2.5; walk.params.bob = 10; hero.effects.push(walk);

    var bubble = Model.newLayer("text", { name: "Konuşma balonu", inPoint: 1.2, text: { content: "Merhaba! Ben Canlandır.\nGörsellerini çizgi filme çeviririm.", size: Math.round(40 * k), maxWidth: Math.round(560 * k) },
      base: { x: W * 0.36, y: H * 0.5, rot: -3, sx: 1, sy: 1, opacity: 1 } });
    bubble.anchor = { x: 0.5, y: 1 };
    var pop = M.createEffect("popIn", 6, bubble); bubble.effects.push(pop);
    var rev = M.createEffect("reveal", 6, bubble); rev.end = 3.4; bubble.effects.push(rev);
    var fl = M.createEffect("float", 6, bubble); fl.params.strength = 6; fl.params.tilt = 1; bubble.effects.push(fl);
    var fo = M.createEffect("fadeOut", 6, bubble); fo.start = 5.2; fo.end = 5.8; bubble.effects.push(fo);

    s1.layers = [sun, c2, c1, hills, bird, hero, bubble];

    var s2 = Model.newScene("Son", 2.5);
    s2.background = { type: "color", color: "#0b1020", color2: "#000000", angle: 0, assetId: null };
    var son = Model.newLayer("text", { name: "SON yazısı", text: { content: "SON", size: Math.round(160 * k), color: "#ffffff", bubble: false, stroke: "#7b2fff", strokeWidth: 6, font: "Impact, 'Arial Black', sans-serif" },
      base: { x: W / 2, y: H / 2, rot: 0, sx: 1, sy: 1, opacity: 1 } });
    son.effects.push(M.createEffect("zoomIn", 2.5, son));
    son.effects.push(M.createEffect("fadeOut", 2.5, son));
    var alt = Model.newLayer("text", { name: "Alt yazı", inPoint: 0.6, text: { content: "Canlandır ile yapıldı", size: Math.round(34 * k), color: "#00f5ff", bubble: false, font: "'Courier New', monospace", weight: "400" },
      base: { x: W / 2, y: H * 0.68, rot: 0, sx: 1, sy: 1, opacity: 1 } });
    alt.effects.push(M.createEffect("fadeIn", 2.5, alt));
    s2.layers = [son, alt];

    project.name = "Örnek Film";
    project.scenes = [s1, s2];
    return project;
  }

  root.Demo = { build: build };
})(window);
