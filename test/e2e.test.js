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
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
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
    check(/2 sahne · 7 replik · 12 eylem/.test(await page.textContent("#scPreview")), "önizleme: sahne/replik/eylem sayıları");
    await page.click("#scAutoCast");
    await page.waitForTimeout(150);
    check((await page.evaluate(() => App.S.project.script.cast.map((c) => c.name).join())) === "Ali,Ayşe", "senaryodan karakterler alındı");
    // İlk karaktere görsel yükle (tarayıcıda çizilen PNG) → yer tutucu yerine kullanılır
    const ali = await png(page, "ali-durus.png", 200, 300, "x.fillStyle='#e76f51';x.fillRect(60,120,80,150);x.fillStyle='#ffd6a5';x.beginPath();x.arc(100,80,45,0,7);x.fill();");
    await page.evaluate(() => App.pickCastImages(App.S.project.script.cast[0].id));
    await page.setInputFiles("#fileCast", [ali]);
    await page.waitForFunction(() => App.S.project.script.cast[0].images.length === 1, null, { timeout: 10000 });
    check((await page.evaluate(() => App.S.project.script.cast[0].images[0].role)) === "pose", "yüklenen ilk görsel 'duruş' rolü aldı");
    await page.click("#scBuild");
    await page.waitForFunction(() => !document.getElementById("scriptDialog").open, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const film = await page.evaluate(() => ({ n: App.S.project.scenes.length, names: App.S.project.scenes.map((s) => s.name), total: Exporter.totalDuration(App.S.project),
      bubbles: App.S.project.scenes[1].layers.filter((l) => l.name.indexOf("Replik") === 0).length, aliFrames: (App.S.project.scenes[1].layers.find((l) => l.name === "Ali") || {}).frames, playing: App.S.playing, title: App.S.project.name }));
    check(film.n === 4 && film.names[0] === "Başlık" && film.names[3] === "Son", "başlık + 2 sahne + SON üretildi: " + film.names.join(" | "));
    check(film.total > 40 && film.bubbles === 4, "sahne 1'de 4 konuşma balonu, toplam " + film.total.toFixed(1) + " sn");
    check(film.aliFrames && film.aliFrames.length === 1, "Ali yüklenen görselle kuruldu");
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
    await page.evaluate(() => Easy.goto(2));
    await page.click('#wizard [data-ins="scene"]');
    await page.click("#wzLineBtn");
    await page.click("#wzLineMenu button:has-text(\"konuşsun\")");
    await page.keyboard.type("Selam!");
    const txt = await page.evaluate(() => document.getElementById("wzText").value);
    check(/SAHNE \d+ - MEKÂN - GÜNDÜZ\n[^\n]+: Selam!$/.test(txt.slice(-60)), "düğmeler sahne ve replik satırı ekledi");
    await page.click("#wzSample");
    await page.click("#wzBuild");
    await page.waitForFunction(() => Easy.step === 3, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    check((await page.evaluate(() => document.getElementById("wzCanvas").width)) > 100 && /sahne/.test(await page.textContent("#wzFilmInfo")), "3. adımda önizleme tuvali ve özet var");
    const [dlEasy] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click('#wizard [data-fmt="gif"]')]);
    await dlEasy.saveAs(path.join(OUT, "kolay.gif"));
    check(fs.statSync(path.join(OUT, "kolay.gif")).size > 5000, "kolay moddan tek tıkla GIF indirildi");
    await page.screenshot({ path: path.join(OUT, "07-kolay-mod.png") });
    await page.click("#wzStudio");
    check(!(await page.isVisible("#wizard")), "gelişmiş stüdyoya dönüldü");

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
