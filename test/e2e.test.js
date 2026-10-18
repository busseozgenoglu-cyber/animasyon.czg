/* Canlandır — uçtan uca tarayıcı testi: `npm run test:e2e`
   Gerekli: `npm i -D playwright && npx playwright install chromium`. Yerel sunucuyu kendisi başlatır. */
"use strict";
const path = require("path"), fs = require("fs");
const ROOT = path.join(__dirname, ".."), OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { console.error("Playwright yok: npm i -D playwright && npx playwright install chromium"); process.exit(2); }
const serve = require(path.join(ROOT, "serve.js"));
let failures = 0;
function check(cond, msg) { if (cond) console.log("  ✓", msg); else { failures++; console.log("  ✗ FAIL:", msg); } }
/* Tarayıcı içinde çizilip PNG olarak döndürülen test görseli */
async function png(page, name, w, h, drawSrc) {
  const dataUrl = await page.evaluate(([w, h, src]) => { const c = document.createElement("canvas"); c.width = w; c.height = h; new Function("x", "w", "h", src)(c.getContext("2d"), w, h); return c.toDataURL("image/png"); }, [w, h, drawSrc]);
  return { name, mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") };
}

(async () => {
  const server = serve.start(ROOT, 0);
  await new Promise((r) => server.on("listening", r));
  const BASE = "http://localhost:" + server.address().port + "/";
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("canlandir.mode")) localStorage.setItem("canlandir.mode", "studio"); } catch (e) { /* yoksay */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.type() + ": " + m.text()); });   // kapalı SesKlon adresine deneme beklenen bir ağ hatasıdır
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  try {
    console.log("1) Sayfa açılışı");
    const resp = await page.goto(BASE, { waitUntil: "load" });
    check(resp.status() === 200, "HTTP 200");
    await page.waitForSelector("body.ready", { timeout: 10000 });
    await page.waitForTimeout(300);
    check(await page.isVisible("#emptyState"), "boş durum görünüyor");
    await page.screenshot({ path: path.join(OUT, "01-bos.png") });

    console.log("2) Örnek film");
    await page.click("#emptyDemo");
    await page.waitForFunction(() => window.App && App.scene().layers.length === 7, null, { timeout: 10000 });
    check(await page.evaluate(() => App.S.project.scenes.length) === 2, "2 sahne");
    check((await page.$$("#layerList .layer-item")).length === 7, "katman listesinde 7 öğe");
    check((await page.$$("#tlRows .tl-row")).length === 7, "zaman çizelgesinde 7 satır");
    await page.evaluate(() => App.setTime(2.0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, "02-demo.png") });
    await page.click("#layerList .layer-item:nth-child(2)");
    await page.waitForTimeout(150);
    check((await page.evaluate(() => App.selLayer() && App.selLayer().name)) === "Kahraman", "katman seçimi");
    check((await page.$$("#props .fx-item")).length === 1, "seçili katmanın efekti listelendi");

    console.log("3) Oynatma");
    await page.keyboard.press("Space");
    await page.waitForTimeout(600);
    check((await page.evaluate(() => App.S.playing && App.S.time)) > 2.3, "oynuyor, zaman ilerledi");
    await page.keyboard.press("Space");
    check(!(await page.evaluate(() => App.S.playing)), "durdu");
    await page.evaluate(() => { App.S.playAll = true; App.S.loop = false; App.setTime(5.8); App.play(); });
    await page.waitForTimeout(900);
    check((await page.evaluate(() => App.S.sceneIndex)) === 1, "tüm film modunda 2. sahneye geçti");
    await page.evaluate(() => { App.pause(); App.S.playAll = false; App.S.loop = true; App.switchScene(0); });

    console.log("4) Zaman çizelgesinde arama");
    const rb = await (await page.$("#rulerArea")).boundingBox();
    await page.mouse.click(rb.x + 180, rb.y + 12);
    const tSeek = await page.evaluate(() => App.S.time);
    check(tSeek > 1.5 && tSeek < 2.5, "cetvel tıklaması zamanı ayarladı (" + tSeek.toFixed(2) + ")");

    console.log("5) Görsel içe alma");
    const yildiz = await png(page, "yildiz.png", 300, 300, "x.fillStyle='#ffd60a';x.beginPath();for(let i=0;i<10;i++){const r=i%2?60:140,a=-Math.PI/2+i*Math.PI/5;x.lineTo(150+r*Math.cos(a),150+r*Math.sin(a));}x.closePath();x.fill();");
    const foto = await png(page, "foto.png", 640, 420, "const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#e63946');g.addColorStop(1,'#1d3557');x.fillStyle=g;x.fillRect(0,0,w,h);x.fillStyle='#2a9d8f';x.beginPath();x.arc(320,210,120,0,7);x.fill();");
    const before = await page.evaluate(() => App.scene().layers.length);
    await page.setInputFiles("#fileImages", [yildiz, foto]);
    await page.waitForFunction((n) => App.scene().layers.length === n + 2, before, { timeout: 10000 });
    const sel = await page.evaluate(() => { const L = App.selLayer(); return { name: L.name, w: Render.layerSize(L, App.S.project).w }; });
    check(sel.name === "yildiz" && sel.w === 300, "ada göre sıralı son görsel seçildi: " + JSON.stringify(sel));
    const fotoL = await page.evaluate(() => { const L = App.scene().layers.find((l) => l.name === "foto"); return L && Render.layerSize(L, App.S.project); });
    check(fotoL && fotoL.w === 640 && fotoL.h === 420, "ikinci görsel doğru boyutta");

    console.log("6) Efekt ekleme (arayüzden)");
    await page.click('#props button:has-text("Efekt ekle")');
    await page.click('#props .fx-pick:has-text("Zıpla")');
    await page.waitForTimeout(100);
    check((await page.evaluate(() => App.selLayer().effects.map((e) => e.type).join())) === "bounce", "bounce efekti eklendi");
    const slider = await page.$("#props .fx-item input[type=range]");
    await slider.fill("120"); await slider.dispatchEvent("change");
    check((await page.evaluate(() => App.selLayer().effects[0].params.strength)) === 120, "efekt gücü kaydırıcıyla değişti");
    await page.screenshot({ path: path.join(OUT, "03-efekt.png") });

    console.log("7) Gizmo ile sürükleme");
    const posBefore = await page.evaluate(() => ({ x: App.editValue(App.selLayer(), "x"), y: App.editValue(App.selLayer(), "y") }));
    const pt = await page.evaluate(() => { const L = App.selLayer(), tr = Render.transformAt(App.S.project, App.scene(), L, App.S.time); const r = document.getElementById("overlay").getBoundingClientRect(); return { x: r.left + tr.x * App.S.view.scale, y: r.top + tr.y * App.S.view.scale }; });
    await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt.x + 60, pt.y + 30, { steps: 6 }); await page.mouse.up();
    const posAfter = await page.evaluate(() => ({ x: App.editValue(App.selLayer(), "x"), y: App.editValue(App.selLayer(), "y") }));
    const scale = await page.evaluate(() => App.S.view.scale);
    check(Math.abs((posAfter.x - posBefore.x) - 60 / scale) < 2 && Math.abs((posAfter.y - posBefore.y) - 30 / scale) < 2, "sürükleme konumu değiştirdi");

    console.log("8) Anahtar kareler");
    await page.evaluate(() => App.setTime(0));
    await page.keyboard.press("k");
    await page.evaluate(() => App.setTime(2));
    await page.evaluate(() => { const L = App.selLayer(); App.setLayerProp(L, "x", App.editValue(L, "x") + 300); App.commit(); UI.renderTimeline(); });
    const keys = await page.evaluate(() => Motion.keyTimes(App.selLayer()));
    check(keys.join() === "0,2", "iki anahtar kare: " + keys);
    const mid = await page.evaluate(() => { const L = App.selLayer(); return [0, 1, 2].map((t) => Motion.trackValue(L.tracks.x, t, 0)); });
    check(mid[1] > mid[0] && mid[1] < mid[2], "ara değer enterpolasyonu");
    const keyEls = await page.$$("#tlRows .tl-row.selected .tl-key");
    check(keyEls.length === 2, "zaman çizelgesinde 2 anahtar simgesi");
    const kb = await keyEls[1].boundingBox();
    await page.mouse.move(kb.x + 5, kb.y + 5); await page.mouse.down(); await page.mouse.move(kb.x + 95, kb.y + 5, { steps: 5 }); await page.mouse.up();
    check((await page.evaluate(() => Motion.keyTimes(App.selLayer())))[1] > 2.5, "anahtar kare sürüklenerek taşındı");
    await page.screenshot({ path: path.join(OUT, "04-anahtar.png") });

    console.log("9) Kare dizisi içe alma");
    const steps = [];
    for (let i = 0; i < 3; i++) steps.push(await png(page, "adim_" + (i + 1) + ".png", 200, 200, "x.fillStyle='#ff5050';x.beginPath();x.arc(100," + (80 + i * 40) + ",40,0,7);x.fill();"));
    const n2 = await page.evaluate(() => App.scene().layers.length);
    await page.setInputFiles("#fileSequence", [steps[0], steps[2], steps[1]]);
    await page.waitForFunction((n) => App.scene().layers.length === n + 1, n2, { timeout: 10000 });
    const seq = await page.evaluate(() => { const L = App.selLayer(); return { type: L.type, names: L.frames.map((f) => App.S.project.assets[f].name).join() }; });
    check(seq.type === "sequence" && seq.names === "adim_1.png,adim_2.png,adim_3.png", "3 kareli dizi, doğal sırada");

    console.log("10) Geri al / ileri al");
    const cnt = await page.evaluate(() => App.scene().layers.length);
    await page.keyboard.press("Control+z");
    check((await page.evaluate(() => App.scene().layers.length)) === cnt - 1, "geri al kare dizisini kaldırdı");
    await page.keyboard.press("Control+y");
    check((await page.evaluate(() => App.scene().layers.length)) === cnt, "ileri al geri getirdi");

    console.log("11) Metin katmanı");
    await page.click("#btnAddText");
    await page.waitForTimeout(200);
    check((await page.evaluate(() => App.selLayer().type)) === "text", "metin katmanı eklendi");
    await page.fill("#props textarea", "Selam dünya!\nİkinci satır");
    await page.dispatchEvent("#props textarea", "change");
    check((await page.evaluate(() => App.selLayer().text.content)) === "Selam dünya!\nİkinci satır", "metin içeriği güncellendi");

    console.log("12) Proje kaydet / aç");
    const [dl1] = await Promise.all([page.waitForEvent("download"), page.click("#btnSave")]);
    const projPath = path.join(OUT, "proje.canlandir.json");
    await dl1.saveAs(projPath);
    const layersNow = await page.evaluate(() => App.S.project.scenes.map((s) => s.layers.length));
    check(fs.statSync(projPath).size > 1000, "proje dosyası indirildi");
    await page.evaluate(() => { App.S.project.scenes.forEach((s) => { s.layers.length = 0; }); });
    await page.setInputFiles("#fileProject", projPath);
    await page.waitForFunction((ls) => JSON.stringify(App.S.project.scenes.map((s) => s.layers.length)) === JSON.stringify(ls), layersNow, { timeout: 10000 });
    check(true, "proje dosyası geri yüklendi: " + layersNow);

    console.log("13) Dışa aktarma: GIF");
    await page.click("#btnExport");
    await page.waitForSelector("#exportDialog[open]");
    await page.click("#fmtGrid label.fmt:has(input[value=gif])");
    await page.selectOption("#exScale", "0.25"); await page.selectOption("#exFps", "10"); await page.selectOption("#exRange", "all");
    const [dlGif] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("#exStart")]);
    const gifPath = path.join(OUT, "film.gif"); await dlGif.saveAs(gifPath);
    check(fs.statSync(gifPath).size > 5000 && (await page.isVisible("#exResult img")), "GIF indirildi ve önizlendi (" + fs.statSync(gifPath).size + " bayt)");

    console.log("14) Dışa aktarma: WebM (bu sahne)");
    await page.click("#fmtGrid label.fmt:has(input[value=webm])");
    await page.selectOption("#exScale", "0.5"); await page.selectOption("#exRange", "scene");
    const [dlWebm] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("#exStart")]);
    const webmPath = path.join(OUT, "film.webm"); await dlWebm.saveAs(webmPath);
    check(fs.statSync(webmPath).size > 5000, "WebM indirildi (" + fs.statSync(webmPath).size + " bayt)");

    console.log("15) Dışa aktarma: MP4");
    const sup = await page.evaluate(() => Exporter.detectSupport(App.S.project));
    console.log("  (bilgi) tarayıcı desteği:", JSON.stringify(sup));
    if (sup.mp4) {
      await page.click("#fmtGrid label.fmt:has(input[value=mp4])");
      const [dlMp4] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("#exStart")]);
      await dlMp4.saveAs(path.join(OUT, "film.mp4"));
      check(fs.statSync(path.join(OUT, "film.mp4")).size > 5000, "MP4 (H.264) indirildi");
    } else if (await page.evaluate(() => typeof VideoEncoder !== "undefined")) {
      const [dlMp4] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.evaluate(() =>
        Exporter.exportMp4WebCodecs(App.S.project, { codec: "vp09.00.10.08", scale: 0.5, range: 0 }, null, { cancelled: false }).then((r) => Exporter.download(r.blob, "film-vp9.mp4")))]);
      await dlMp4.saveAs(path.join(OUT, "film-vp9.mp4"));
      check(fs.statSync(path.join(OUT, "film-vp9.mp4")).size > 5000, "H.264 yok; muxer yolu VP9 ile yapısal olarak doğrulandı");
    } else console.log("  (bilgi) WebCodecs yok, MP4 adımı atlandı");

    console.log("16) Dışa aktarma: PNG dizisi");
    await page.click("#fmtGrid label.fmt:has(input[value=png])");
    await page.selectOption("#exScale", "0.25");
    const [dlZip] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("#exStart")]);
    const zipPath = path.join(OUT, "kareler.zip"); await dlZip.saveAs(zipPath);
    check(fs.statSync(zipPath).size > 5000, "ZIP indirildi (" + fs.statSync(zipPath).size + " bayt)");
    await page.keyboard.press("Escape");

    console.log("17) Otomatik kayıt ve yeniden yükleme");
    await page.waitForTimeout(2200);
    const sig = await page.evaluate(() => JSON.stringify([App.S.project.name, App.S.project.scenes.map((s) => s.layers.length)]));
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("body.ready", { timeout: 10000 });
    await page.waitForTimeout(400);
    check(sig === (await page.evaluate(() => JSON.stringify([App.S.project.name, App.S.project.scenes.map((s) => s.layers.length)]))), "yenilemeden sonra proje aynı");

    console.log("18) Senaryodan film üretme");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click("#btnScript");
    await page.waitForSelector("#scriptDialog[open]");
    await page.click("#scSample");
    await page.waitForTimeout(400);
    check(/2 sahne · 7 replik · 15 eylem/.test(await page.textContent("#scPreview")), "önizleme: sahne/replik/eylem sayıları");
    await page.click("#scAutoCast");
    await page.waitForTimeout(400);
    const autoCast = await page.evaluate(() => App.S.project.script.cast.map((c) => c.name + ":" + c.images.length));
    check(autoCast.join() === "Ali:10,Ayşe:10,Dede:10,Karabaş:10", "senaryodan karakterler alındı, kütüphaneden görselleri geldi: " + autoCast.join(" "));
    const sizes = await page.evaluate(() => App.S.project.script.cast.map((c) => c.name + ":" + c.size).join());
    check(sizes === "Ali:0.86,Ayşe:0.86,Dede:0.96,Karabaş:0.62", "karakter boyları türe göre (çocuk, yaşlı, köpek): " + sizes);
    // Yeni karaktere görsel yükle (tarayıcıda çizilen PNG) → kendi çizimi kullanılır
    const ali = await png(page, "test-durus.png", 200, 300, "x.fillStyle='#e76f51';x.fillRect(60,120,80,150);x.fillStyle='#ffd6a5';x.beginPath();x.arc(100,80,45,0,7);x.fill();");
    await page.evaluate(() => { App.addCastMember("Test"); App.pickCastImages(App.S.project.script.cast[4].id); });
    await page.setInputFiles("#fileCast", [ali]);
    await page.waitForFunction(() => App.S.project.script.cast[4].images.length === 1, null, { timeout: 10000 });
    check((await page.evaluate(() => App.S.project.script.cast[4].images[0].role)) === "pose", "yüklenen ilk görsel 'duruş' rolü aldı");
    await page.click("#scBuild");
    await page.waitForFunction(() => !document.getElementById("scriptDialog").open, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const film = await page.evaluate(() => ({ n: App.S.project.scenes.length, names: App.S.project.scenes.map((s) => s.name), total: Exporter.totalDuration(App.S.project),
      bubbles: App.S.project.scenes[1].layers.filter((l) => l.name.indexOf("Replik") === 0).length, aliFrames: (App.S.project.scenes[1].layers.find((l) => l.name === "Ali") || {}).frames, playing: App.S.playing, title: App.S.project.name }));
    check(film.n === 4 && film.names[0] === "Başlık" && film.names[3] === "Son", "başlık + 2 sahne + SON üretildi: " + film.names.join(" | "));
    check(film.total > 40 && film.bubbles === 4, "sahne 1'de 4 konuşma balonu, toplam " + film.total.toFixed(1) + " sn");
    check(film.aliFrames && film.aliFrames.length === 1, "Ali kütüphane görseliyle kuruldu");
    const pro = await page.evaluate(() => { const s = App.S.project.scenes[1], chars = s.layers.filter((l) => l.shadow); return { camKeys: s.camera.tracks.zoom.length, zoomMax: Math.max.apply(null, s.camera.tracks.zoom.map((k) => k.v)), sfx: Array.from(new Set(s.sfx.map((q) => q.type))), chars: chars.map((l) => l.name), blink: chars.some((l) => l.frameSets.some((fs) => fs.frames.length === 1 && fs.end - fs.start < 0.2)), hud: s.layers.filter((l) => l.hud).map((l) => l.name), titleSfx: App.S.project.scenes[0].sfx.map((q) => q.type).join() }; });
    check(pro.camKeys >= 4 && pro.zoomMax > 1.3, "kamera ipuçları anahtar kare oldu (" + pro.camKeys + " anahtar, en çok " + pro.zoomMax + "x)");
    check(pro.sfx.indexOf("pop") >= 0 && pro.sfx.indexOf("whoosh") >= 0 && pro.sfx.indexOf("boing") >= 0 && pro.titleSfx === "chime", "ses ipuçları: " + pro.sfx.join(", ") + " + başlıkta çan");
    check(pro.chars.length >= 3 && pro.blink, "gölgeli karakter katmanları (" + pro.chars.join(", ") + ") ve göz kırpma kareleri");
    check(pro.hud.length === 1 && pro.hud[0] === "Sahne başlığı", "sahne başlığı ekran katmanı (kameradan etkilenmez)");
    const anim = await page.evaluate(() => { const s = App.S.project.scenes[1], ali = s.layers.find((l) => l.name === "Ali"); const lip = ali.frameSets.find((f) => f.fps === 12); const names = s.layers.map((l) => l.name); const firstChar = s.layers.findIndex((l) => !!l.shadow); return { lip: lip ? { n: lip.frames.length, need: Math.ceil((lip.end - lip.start) * 12), distinct: new Set(lip.frames).size } : null, amb: names.filter((n2) => /Kuş|Kelebek/.test(n2)).length, ambBefore: names.findIndex((n2) => /Kuş|Kelebek/.test(n2)) < firstChar, puff: names.filter((n2) => n2 === "Toz").length, fidget: ali.effects.filter((e) => /lean|swing|bounce/.test(e.type)).length, walkLean: s.layers.filter((l) => l.shadow).some((l) => l.effects.some((e) => e.type === "lean" && e.params.ramp === 0.25)) }; });
    check(anim.lip && anim.lip.n === anim.lip.need && anim.lip.distinct >= 2, "dudak senkronu: metnin hece ritmiyle 12 kare/sn ağız dizisi (" + (anim.lip ? anim.lip.n + " kare, " + anim.lip.distinct + " farklı ağız" : "yok") + ")");
    check(anim.amb >= 2 && anim.ambBefore && anim.puff >= 2 && anim.walkLean && anim.fidget >= 2, "ortam canlılığı (kuş/kelebek karakterlerin arkasında: " + anim.amb + "), zıplamada toz (" + anim.puff + "), yürürken eğilme ve boşta kıpırdanma");
    check(film.title === "Kayıp Top", "film adı senaryodaki BAŞLIK'tan alındı: " + film.title);
    check(film.playing, "üretim sonrası film kendiliğinden oynuyor");
    await page.evaluate(() => { App.pause(); App.switchScene(1, true); App.setTime(8); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, "06-senaryo.png") });
    const gifSize = await page.evaluate(async () => { const b = await Exporter.exportGif(App.S.project, { fps: 8, scale: 0.25, range: 1 }, null, { cancelled: false }); return b.size; });
    check(gifSize > 5000, "üretilen sahne GIF olarak kodlandı (" + gifSize + " bayt)");

    console.log("19) Kolay mod (sihirbaz)");
    await page.click("#btnEasy");
    await page.waitForTimeout(300);
    check(await page.isVisible("#wizard") && (await page.evaluate(() => Easy.step)) === 3, "kolay mod açıldı; film olduğu için 3. adım (izle/indir)");
    await page.evaluate(() => Easy.goto(1));
    const cardsBefore = await page.$$eval("#wzCast .wz-card:not(.add)", (els) => els.length);
    await page.click("#wzCast .wz-card.add");
    await page.waitForTimeout(350);
    check((await page.$$eval("#wzCast .wz-card:not(.add)", (els) => els.length)) === cardsBefore + 1, "karakter kartı eklendi (resim seçici açıldı)");
    await page.click("#wzGallery");
    await page.waitForSelector("#galleryDialog[open]");
    check((await page.$$eval("#galleryGrid .gal-item", (els) => els.length)) >= 18, "hazır karakter galerisi açıldı");
    await page.click("#galleryGrid .gal-item:has-text('Robi')");
    await page.click("#galleryGrid .gal-item:has-text('Pamuk')");
    await page.click("#galleryAdd");
    await page.waitForFunction(() => !document.getElementById("galleryDialog").open, null, { timeout: 10000 });
    const robi = await page.evaluate(() => { const c = App.S.project.script.cast.find((x) => x.name === "Robi"); return c ? c.images.map((i) => i.role) : null; });
    check(robi && robi.length === 10 && ["pose", "talk", "walk", "blink", "mutlu", "saskin"].every((r) => robi.indexOf(r) >= 0), "galeriden Robi ve Pamuk eklendi; Robi: " + (robi ? robi.length + " görsel (duruş, konuşma, yürüme, göz kırpma, duygular)" : "yok"));
    await page.screenshot({ path: path.join(OUT, "08-galeri.png") });
    await page.evaluate(() => Easy.goto(2));
    await page.click('#wizard [data-ins="scene"]');
    await page.click("#wzLineBtn");
    await page.click("#wzLineMenu button:has-text(\"konuşsun\")");
    await page.keyboard.type("Selam!");
    const txt = await page.evaluate(() => document.getElementById("wzText").value);
    check(/SAHNE \d+ - MEKÂN - GÜNDÜZ\n[^\n]+: Selam!$/.test(txt.slice(-60)), "düğmeler sahne ve replik satırı ekledi");
    await page.click("#wzSample");
    // Karakter adını değiştir → senaryo güncellenir
    await page.evaluate(() => { const c = App.S.project.script.cast.find((x) => x.name === "Ayşe"); if (c) App.renameCast(c.id, "Zeynep"); });
    const renamed = await page.evaluate(() => App.S.project.script.text);
    check(/ZEYNEP \(mutlu\): Ali! Bak, Karabaş topunu bulmuş!/.test(renamed) && /Zeynep sağdan girer\./.test(renamed) && /Kamera Ayşe'ye yaklaşır\./.test(renamed), "ad değişince senaryo güncellendi (ekli 'Ayşe'ye' dokunulmadı)");
    await page.evaluate(() => { const c = App.S.project.script.cast.find((x) => x.name === "Zeynep"); App.renameCast(c.id, "Ayşe"); });
    // Dikey biçim seç
    await page.click('#wzFormat button[data-size="1080x1920"]');
    check((await page.evaluate(() => App.S.project.width + "x" + App.S.project.height)) === "1080x1920", "film biçimi dikey oldu");
    await page.click("#wzBuild");
    await page.waitForFunction(() => Easy.step === 3, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    check((await page.evaluate(() => document.getElementById("wzCanvas").width)) > 100 && /sahne/.test(await page.textContent("#wzFilmInfo")), "3. adımda önizleme tuvali ve özet var");
    const bgInfo = await page.evaluate(() => { const s = App.S.project.scenes[1], L = s.layers[0]; return { name: L.name, locked: L.locked, keys: Motion.keyTimes(L).length, portrait: document.getElementById("wzCanvas").height > document.getElementById("wzCanvas").width }; });
    check(bgInfo.name === "Arka plan" && bgInfo.locked && bgInfo.keys === 2 && bgInfo.portrait, "arka plan kilitli katman, kamera yaklaşması anahtarlı, dikey önizleme");
    // Müzik ekle (sessiz WAV) → videoya ses kanalı girer
    const wav = Buffer.alloc(44 + 8000 * 2); wav.write("RIFF", 0); wav.writeUInt32LE(36 + 16000, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(16000, 40);
    for (let i = 0; i < 8000; i++) wav.writeInt16LE(Math.round(Math.sin(i / 8000 * 440 * 6.283) * 8000), 44 + i * 2);
    await page.setInputFiles("#fileAudio", [{ name: "muzik.wav", mimeType: "audio/wav", buffer: wav }]);
    await page.waitForFunction(() => App.S.project.audio && App.S.project.audio.name === "muzik.wav", null, { timeout: 10000 });
    check(/muzik\.wav/.test(await page.textContent("#wzMusic")), "müzik eklendi ve 3. adımda görünüyor");
    const [dlMus] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.evaluate(() => Exporter.exportVideo(App.S.project, { format: "webm", scale: 0.5, quality: "low", range: 0 }, null, { cancelled: false }).then((r) => Exporter.download(r.blob, "sesli.webm")))]);
    await dlMus.saveAs(path.join(OUT, "sesli.webm"));
    check(fs.statSync(path.join(OUT, "sesli.webm")).size > 2000, "sesli WebM üretildi (ses kanalı ffprobe ile ayrıca kontrol edilir)");
    await page.evaluate(() => App.removeAudio());
    const [dlSfx] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.evaluate(() => Exporter.exportVideo(App.S.project, { format: "webm", scale: 0.5, quality: "low", range: 0 }, null, { cancelled: false }).then((r) => Exporter.download(r.blob, "efekt.webm")))]);
    await dlSfx.saveAs(path.join(OUT, "efekt.webm"));
    check(fs.statSync(path.join(OUT, "efekt.webm")).size > 2000, "müziksiz filmde ses efektleri WebM'e karıştı (ses kanalı ffprobe ile kontrol edilir)");
    const [dlEasy] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click('#wizard [data-fmt="gif"]')]);
    await dlEasy.saveAs(path.join(OUT, "kolay.gif"));
    check(fs.statSync(path.join(OUT, "kolay.gif")).size > 5000, "kolay moddan tek tıkla GIF indirildi");
    await page.screenshot({ path: path.join(OUT, "07-kolay-mod.png") });
    await page.click("#wzStudio");
    check(!(await page.isVisible("#wizard")), "gelişmiş stüdyoya dönüldü");

    console.log("21) Seslendirme (SesKlon)");
    const mock = require("./mock-sesklon.js").start(0);
    await mock.ready;
    const voUrl = mock.url;
    await page.click("#btnEasy"); await page.waitForTimeout(250);
    await page.evaluate(() => Easy.goto(1));
    await page.evaluate(() => document.querySelector("#wzVoice .vo-enable").click());
    await page.waitForTimeout(200);
    await page.fill("#wzVoice .vo-url", voUrl);
    await page.click("#wzVoice .vo-connect");
    await page.waitForSelector("#wzVoice .vo-status.ok", { timeout: 15000 });
    check(/3 ses/.test(await page.textContent("#wzVoice .vo-msg")), "SesKlon'a bağlandı: " + (await page.textContent("#wzVoice .vo-msg")));
    await page.click("#wzVoice .vo-auto");
    await page.waitForTimeout(250);
    const assigned = await page.evaluate(() => App.S.project.script.cast.map((c) => c.name + ":" + (c.voiceId || "-")).join());
    check(/Ali:v-ali/.test(assigned) && /Ayşe:v-ayse/.test(assigned) && !/:-/.test(assigned), "sesler ada göre eşleşti, kalanlara sırayla ses verildi: " + assigned);
    check((await page.$eval("#wzCast .vo-cast", (els) => els.length)) >= 4 && (await page.$eval("#wzVoice .vo-narrator", (el) => el.value)) !== "", "karakter kartlarında ses seçici var, anlatıcıya ses atandı");
    await page.screenshot({ path: path.join(OUT, "09-seslendirme.png") });
    await page.evaluate(() => { Easy.goto(2); const t = "BAŞLIK: Ses Denemesi\nSAHNE 1 - PARK - GÜNDÜZ\nALİ: Merhaba Ayşe, topumu gördün mü?\nAYŞE (mutlu): Evet! Bankın altında.\nANLATICI: Ve top bulundu."; document.getElementById("wzText").value = t; App.ensureScript().text = t; App.commit(); });
    await page.click("#wzBuild");
    await page.waitForFunction(() => Easy.step === 3, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const vo = await page.evaluate(() => { const p = App.S.project, s = p.scenes[1], cues = s.sfx.filter((q) => q.type === "clip"); const bubbles = s.layers.filter((l) => l.name.indexOf("Replik") === 0).map((l) => +(l.outPoint - l.inPoint).toFixed(2)); const ali = s.layers.find((l) => l.name === "Ali"); return { clips: Object.keys(p.clips).length, cues: cues.length, durs: cues.map((q) => p.clips[q.clip].duration), bubbles, voiced: Easy.stats.voiced, warnings: Easy.warnings, talk: ali ? ali.frameSets.filter((f2) => f2.frames.length > 1).map((f2) => +(f2.end - f2.start).toFixed(2)) : [], info: document.getElementById("wzFilmInfo").textContent }; });
    check(vo.clips === 3 && vo.cues === 3 && vo.voiced === 3 && /3 parça seslendirildi/.test(vo.info), "3 parça seslendirildi, sahnede 3 ses ipucu var, özet gösteriyor");
    check(vo.bubbles.length === 2 && Math.abs(vo.bubbles[0] - (vo.durs[0] + 0.5)) < 0.05 && vo.talk.length && Math.abs(vo.talk[0] - vo.durs[0]) < 0.05, "balon ve ağız hareketi konuşma süresine göre kuruldu (" + vo.bubbles[0] + " sn balon, " + vo.talk[0] + " sn konuşma, klip " + vo.durs[0] + " sn)");
    const lipVo = await page.evaluate(() => { const p = App.S.project, s = p.scenes[1], ali = s.layers.find((l) => l.name === "Ali"), lip = ali.frameSets.find((f) => f.fps === 12), key = s.sfx.find((q) => q.type === "clip").clip; return { mouth: p.clips[key].mouth, n: lip ? lip.frames.length : 0, distinct: lip ? new Set(lip.frames).size : 0, cam: s.camera.tracks.zoom.map((k2) => k2.v) }; });
    check(/^[0-2]{20,}$/.test(lipVo.mouth) && /2/.test(lipVo.mouth) && /0/.test(lipVo.mouth) && lipVo.n >= 20 && lipVo.distinct >= 2, "ağız dizisi ses klibinin zarfından çıkarıldı (" + lipVo.mouth.length + " kare)");
    check(lipVo.cam.length === 2 && lipVo.cam[0] === 1 && Math.abs(lipVo.cam[1] - 1.03) < 0.001, "kamera ipucu olmayan konuşmalı sahnede yavaş otomatik yaklaşma (dikey: 1 → 1,03)");
    const emo = mock.requests.bodies.find((b2) => /Bankın/.test(b2.text));
    check(mock.requests.tts === 3 && emo && emo.emotion === "mutlu" && emo.voice_id === "v-ayse" && emo.style === "sohbet" && mock.requests.bodies.some((b2) => /top bulundu/.test(b2.text) && b2.style === "anlatıcı" && b2.voice_id === "v-anlatici"), "isteklerde doğru ses, duygu ve stil gitti (" + mock.requests.tts + " istek)");
    await page.evaluate(() => App.buildFromScript({ autoplay: false }));
    check(mock.requests.tts === 3 && (await page.evaluate(() => Object.keys(App.S.project.clips).length)) === 3, "yeniden üretimde klipler önbellekten geldi (yeni istek yok)");
    const live = await page.evaluate(async () => { await Sfx.prepare(App.S.project); Easy.goto(3); await new Promise((r) => setTimeout(r, 600)); const btn = document.getElementById("wzPlay"); if (!/Durdur/.test(btn.textContent)) btn.click(); await new Promise((r) => setTimeout(r, 500)); const playing = /Durdur/.test(btn.textContent), ctx = !!Sfx.live.ctx, armed = !!Sfx.live.stopFn; if (playing) btn.click(); return { playing, ctx, armed }; });
    check(live.playing && live.ctx && live.armed, "önizleme klipleri çözülmüş hâlde seslendirmeyle oynadı (ses bağlamı ve zamanlayıcı etkin)");
    const [dlVo] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.evaluate(() => Exporter.exportVideo(App.S.project, { format: "webm", scale: 0.5, quality: "low", range: 1 }, null, { cancelled: false }).then((r) => Exporter.download(r.blob, "replik.webm")))]);
    await dlVo.saveAs(path.join(OUT, "replik.webm"));
    check(fs.statSync(path.join(OUT, "replik.webm")).size > 2000, "seslendirmeli sahne WebM olarak üretildi (ses ffprobe ile kontrol edilir)");
    const roundtrip = await page.evaluate(() => { const json = Exporter.projectToJson(App.S.project); const p2 = Exporter.parseProject(json); return { clips: Object.keys(p2.clips).length, cues: p2.scenes[1].sfx.filter((q) => q.type === "clip").length, voice: p2.script.voice.enabled, cast: p2.script.cast.filter((c) => c.voiceId).length }; });
    check(roundtrip.clips === 3 && roundtrip.cues === 3 && roundtrip.voice && roundtrip.cast >= 4, "proje dosyası klipleri, ses ipuçlarını ve ses atamalarını taşıyor");
    await page.evaluate(() => { Voice.saveSettings({ url: "http://127.0.0.1:1" }); App.ensureScript().text += "\nALİ: Yeni bir cümle daha."; });
    const off = await page.evaluate(() => App.buildFromScript({ autoplay: false }).then((r) => ({ scenes: r.scenes.length, warn: r.warnings.join(" | "), voiced: r.stats.voiced })));
    check(off.scenes === 3 && off.voiced === 3 && /Seslendirme yapılamadı|bağlanılamadı|yarıda kesildi/.test(off.warn), "sunucu yokken film yine üretildi (eldeki 3 klip kullanıldı), uyarı verildi");
    await page.evaluate(() => { Voice.saveSettings({ url: "http://localhost:8000" }); App.ensureScript().voice.enabled = false; App.commit(); });
    mock.server.close();
    await page.click("#wzStudio");

    console.log("20) Dar ekran düzeni");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "05-mobil.png") });
    await page.click(".mobile-tabs button[data-panel=props]");
    check(await page.isVisible("#panelRight"), "mobilde özellikler paneli açıldı");
  } catch (e) {
    failures++; console.log("  ✗ ÇÖKME:", e.message.split("\n")[0]);
    try { await page.screenshot({ path: path.join(OUT, "99-cokme.png") }); } catch (_) { /* yoksay */ }
  }
  console.log("\nKonsol hata/uyarıları:", errors.length ? errors : "yok");
  if (errors.length) failures++;
  await browser.close();
  server.close();
  console.log(failures ? "\n" + failures + " BAŞARISIZ" : "\nTÜM UÇTAN UCA KONTROLLER GEÇTİ");
  process.exit(failures ? 1 : 0);
})();
