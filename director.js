/* Canlandır — Yönetmen: senaryo metnini ayrıştırır, karakter görselleriyle sahneleri kendiliğinden kurar.
   Girdi:  project.script = { text, cast:[{id,name,facing,images:[{assetId,role}]}], backgrounds:[{assetId,name}], settings }
   Çıktı:  Model sahneleri (katmanlar, efektler, anahtar kareler) — stüdyoda açılır, elle düzeltilebilir.
   Ayrıştırıcı saf JavaScript'tir (Node testlerinde çalışır); sahne kurucu tarayıcı ister (tuval, metin ölçümü). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Director = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  /* ── Metin yardımcıları ────────────────────────────────────── */
  function trLower(s) { return String(s || "").replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr"); }
  function ascii(s) {
    return trLower(s).replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
      .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u").replace(/[’´`]/g, "'");
  }
  function norm(s) { return ascii(s).replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function titleCase(s) {
    return String(s).trim().split(/\s+/).map(function (w) {
      var low = trLower(w);
      return low.charAt(0).toLocaleUpperCase("tr") + low.slice(1);
    }).join(" ");
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  var TIME_WORDS = [
    ["gece yarisi", "gece"], ["gece", "gece"], ["gun batimi", "aksam"], ["aksam ustu", "aksam"], ["aksam", "aksam"],
    ["safak", "sabah"], ["sabah", "sabah"], ["ogleden sonra", "gunduz"], ["ogle", "gunduz"], ["gunduz", "gunduz"], ["gun", "gunduz"]
  ];
  var TIME_LABEL = { gunduz: "Gündüz", sabah: "Sabah", aksam: "Akşam", gece: "Gece" };
  var NARRATORS = /^(anlatici|anlatan|dis ses|narrator|ses|yazi|altyazi|alt yazi|not)$/;

  function splitHeading(s) {
    var parts = String(s || "").split(/\s+[-–—|]\s+|\s*[,/]\s*|\s+-\s+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var time = "", place = [];
    parts.forEach(function (p) {
      var n = norm(p), hit = null;
      for (var i = 0; i < TIME_WORDS.length; i++) if (n === TIME_WORDS[i][0] || n.indexOf(TIME_WORDS[i][0]) === 0 && n.length - TIME_WORDS[i][0].length <= 2) { hit = TIME_WORDS[i][1]; break; }
      if (hit && !time) time = hit; else place.push(p);
    });
    return { place: place.join(" ").replace(/^[-–—:.\s]+|[-–—:.\s]+$/g, ""), time: time };
  }

  /* ── Ayrıştırma ────────────────────────────────────────────── */
  function parse(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var ast = { title: "", author: "", scenes: [], speakers: [] };
    var scene = null, speakerSet = {};
    function newScene(place, time, raw) { scene = { index: ast.scenes.length + 1, place: place || "", time: time || "", heading: raw || "", items: [] }; ast.scenes.push(scene); }
    function addSpeaker(name) { var k = norm(name); if (!speakerSet[k]) { speakerSet[k] = true; ast.speakers.push(name); } }
    lines.forEach(function (raw, li) {
      var line = raw.trim(), m;
      if (!line || /^(\/\/|#)/.test(line)) return;
      if ((m = line.match(/^(BAŞLIK|BASLIK|FİLM|FILM|FİLMİN ADI|AD)\s*:\s*(.+)$/i))) { ast.title = m[2].trim(); return; }
      if ((m = line.match(/^(YAZAN|YAZAR|SENARYO|SENARİST|SENARIST)\s*:\s*(.+)$/i))) { ast.author = m[2].trim(); return; }
      if ((m = line.match(/^(SAHNE|BÖLÜM|BOLUM|SCENE)\b\s*(\d+)?\s*[-–—:.]?\s*(.*)$/i))) { var h = splitHeading(m[3]); newScene(h.place, h.time, line); return; }
      if ((m = line.match(/^(İÇ|IC|DIŞ|DIS|INT|EXT)\.?\s*[-–—:]?\s*(.+)$/i))) { var h2 = splitHeading(m[2]); newScene(h2.place, h2.time, line); return; }
      // Tamamı büyük harf, iki nokta yok, cümle değil → sahne başlığı ("PARK - GÜNDÜZ")
      if (!/:/.test(line) && line.length >= 3 && line === line.toLocaleUpperCase("tr") && /[A-ZÇĞİÖŞÜ]/.test(line) && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 8) {
        var h3 = splitHeading(line); newScene(h3.place, h3.time, line); return;
      }
      if (!scene) newScene("", "", "");
      if (/^[^:()]{1,40}?\s*(?:\([^)]{0,80}\))?\s*:\s*$/.test(line)) return;   // henüz yazılmamış replik ("ALİ: ") atlanır
      if ((m = line.match(/^([^:()]{1,40}?)\s*(?:\(([^)]{1,80})\))?\s*:\s*(.+)$/))) {
        var who = m[1].trim(), whoN = norm(who);
        if (/^(kamera|yakin cekim|yakin plan|genis plan|cekim)$/.test(whoN)) { scene.items.push({ type: "action", text: line, line: li + 1 }); return; }
        if (!/^\d+$/.test(who) && who.split(/\s+/).length <= 4 && !/^(http|https|saat|not)$/i.test(who) && /[a-zçğıöşü]/i.test(who)) {
          var txt = m[3].trim(), emo = (m[2] || "").trim();
          if (NARRATORS.test(whoN)) scene.items.push({ type: "narration", text: txt, line: li + 1 });
          else { var name = titleCase(who); scene.items.push({ type: "dialogue", who: name, emotion: emo, text: txt, line: li + 1 }); addSpeaker(name); }
          return;
        }
      }
      scene.items.push({ type: "action", text: line.replace(/^\((.*)\)$/, "$1").trim(), line: li + 1 });
    });
    return ast;
  }

  /* ── Eylem çözümleme ───────────────────────────────────────── */
  var ACTIONS = [
    ["turn", /\b(arkasini don|arkasina don|geri don|ters don)/],
    ["hug", /\b(sarilir|sarildi|kucaklar|kucakladi|sarilarak)\b/],
    ["back", /\b(geri cekilir|geri cekildi|gerisin geri|geri adim atar|bir adim geri|geriler|geriledi)\b/],
    ["wake", /\b(uyanir|uyandi|gozlerini acar|uykudan kalkar)\b/],
    ["bark", /\b(havlar|havladi|havliyor|hav hav|miyavlar|miyavladi|miyavliyor|civildar|civildadi|cik cik|kukrer|kukredi|bogurur)\b/],
    ["walk_to", /\b(yanina (gider|gelir|gitti|geldi|yurur|kosar|yaklasir)|dogru (gider|yurur|kosar|ilerler|yaklasir|gitti|yurudu|kostu)|yaklasir|yaklasti|yaklasiyor)\b/],
    ["enter", /\b(girer|girdi|giriyor|gelir|geldi|geliyor|ortaya cikar|belirir|belirdi|gorunur|gorundu|iceri girer|sahneye girer)\b/],
    ["exit", /\b(cikar|cikti|cikiyor|gider|gitti|gidiyor|ayrilir|ayrildi|uzaklasir|uzaklasti|kacar|kacti|kaybolur|kayboldu|yok olur|terk eder|sahneden cikar)\b/],
    ["run", /\b(kosar|kostu|kosuyor|firlar|firladi|kosmaya baslar)\b/],
    ["walk", /\b(yurur|yurudu|yuruyor|ilerler|ilerledi|adim atar|yuruyerek)\b/],
    ["jump", /\b(ziplar|zipladi|zipliyor|sicrar|sicradi|hoplar|hopladi|havaya ziplar)\b/],
    ["spin", /\b(doner|dondu|donuyor|donup|doner durur|firil firil)\b/],
    ["fall", /\b(duser|dustu|dusuyor|yuvarlanir|yuvarlandi|devrilir|devrildi|yere kapaklanir)\b/],
    ["rise", /\b(kalkar|kalkti|ayaga kalkar|dogrulur|dogruldu|toparlanir)\b/],
    ["fly", /\b(ucar|uctu|ucuyor|havalanir|havalandi|yukselir|yukseldi|havaya kalkar)\b/],
    ["land", /\b(iner|indi|konar|kondu|yere iner)\b/],
    ["wave", /\b(el sallar|el salladi|selam verir|selam verdi|selamlar|selamladi|elini sallar|kuyruk sallar|kuyrugunu sallar)\b/],
    ["laugh", /\b(guler|guldu|guluyor|gulumser|gulumsedi|sevinir|sevindi|kahkaha|kikirdar)\b/],
    ["cry", /\b(aglar|agladi|agliyor|uzulur|uzuldu|hickirir|burnunu ceker|gozyasi)\b/],
    ["angry", /\b(kizar|kizdi|sinirlenir|sinirlendi|bagirir|bagirdi|ofkelenir|homurdanir|kopurur)\b/],
    ["surprise", /\b(sasirir|sasirdi|sasar|sasti|irkilir|irkildi|hayret eder|agzi acik kalir)\b/],
    ["fear", /\b(korkar|korktu|urker|urktu|titrer|titredi|titriyor|korkuyla)\b/],
    ["dance", /\b(dans eder|dans etti|dans ediyor|oynar|oynadi|zipli zipli)\b/],
    ["sit", /\b(oturur|oturdu|oturuyor|coker|comelir)\b/],
    ["sleep", /\b(uyur|uyudu|uyuyor|uykuya dalar|uyuklar|horlar)\b/],
    ["think", /\b(dusunur|dusundu|dusunuyor|dusunceye dalar|kafasini kasir)\b/],
    ["look", /\b(bakar|bakti|bakiyor|izler|izledi|gozlerini diker|suzer|gorur|gordu|fark eder|fark etti)\b/],
    ["lie", /\b(yatar|yatti|uzanir|uzandi|yere uzanir|serilir)\b/],
    ["clap", /\b(alkislar|alkisladi|el cirpar|ellerini cirpar)\b/],
    ["sing", /\b(sarki soyler|sarki soyledi|mirildanir|islik calar|sarki soyluyor)\b/],
    ["slide", /\b(kayar|kaydi|kayarak gider|kayiyor)\b/],
    ["swim", /\b(yuzer|yuzdu|yuzuyor)\b/],
    ["yawn", /\b(esner|esnedi|esniyor)\b/],
    ["throw", /\b(atar|atti|firlatir|firlatti)\b/],
    ["catch", /\b(yakalar|yakaladi|tutar|tuttu)\b/],
    ["grow", /\b(buyur|buyudu|devlesir|kocaman olur)\b/],
    ["shrink", /\b(kuculur|kuculdu|ufalir|minicik olur)\b/],
    ["nod", /\b(basini sallar|onaylar|kafa sallar|basiyla onaylar)\b/],
    ["shake_head", /\b(basini iki yana sallar|reddeder|hayir der|kafasini iki yana)\b/],
    ["hide", /\b(saklanir|saklandi|gizlenir|gizlendi|arkasina gecer)\b/],
    ["wait", /\b(bekler|bekledi|bekliyor|durur|durdu|sessizlik|duraklar|duraksar|ara verir|sessiz kalir|duraklama)\b/]
  ];
  var EMOTIONS = [
    ["mutlu", /mutlu|nese|sevinc|gulerek|gulumseyerek|heyecan|cosku|keyif|gururla|sevincle/],
    ["uzgun", /uzgun|uzuntu|aglayarak|kederli|huzun|mahzun|burkul|ic cekerek|hayal kirikligi/],
    ["kizgin", /kizgin|sinirli|ofke|bagirarak|kizarak|haykir|sert|hiddet/],
    ["saskin", /saskin|sasirarak|hayret|saskinlik|inanamay/],
    ["korkmus", /korkmus|korkuyla|urkek|endise|tedirgin|titreyerek|panik/],
    ["fisilti", /fisild|sessizce|alcak sesle|kisik|usulca|kulagina/],
    ["dusunceli", /dusunceli|dusunerek|tereddut|kararsiz|merakla/],
    ["yorgun", /yorgun|bitkin|esneyerek|uykulu|bezgin/]
  ];
  var NAME_SUFFIX = /^(ye|ya|yi|yu|yu|e|a|i|u|nin|nin|nun|nun|in|un|le|la|yle|yla|de|da|den|dan|te|ta|ten|tan|ler|lar|yla|yle|ne|na|ni|ndan|nden|nda|nde|si|su|sini|sina|ler|leri|lari)$/;

  function emotionOf(text) {
    var n = norm(text);
    for (var i = 0; i < EMOTIONS.length; i++) if (EMOTIONS[i][1].test(n)) return EMOTIONS[i][0];
    return "";
  }

  /* Eylem cümlesini çözer: { act, subjects, target, dir, speed, seconds, emotion, all } */
  function analyzeAction(text, knownNames, lastSubjects) {
    var n = norm(text), words = n.split(" "), found = [], order = [];
    var known = (knownNames || []).map(function (nm) { return { name: nm, n: norm(nm) }; });
    words.forEach(function (w, wi) {
      var base = w.split("'")[0];
      known.forEach(function (k) {
        if (found.indexOf(k.name) >= 0) return;
        var ok = base === k.n;
        if (!ok && w.indexOf("'") < 0 && base.indexOf(k.n) === 0) ok = NAME_SUFFIX.test(base.slice(k.n.length));
        if (ok) { found.push(k.name); order.push(wi); }
      });
    });
    var all = /\b(herkes|hepsi|ikisi|ucu|dordu|butun|tumu|beraber|birlikte)\b/.test(n);
    var to0 = /\bsaga\b/.test(n) ? "right" : /\bsola\b/.test(n) ? "left" : null;
    var sec0 = n.match(/(\d+(?:[.,]\d+)?)\s*(saniye|sn)\b/);
    /* Kamera ipuçları: "Kamera Ayşe'ye yaklaşır.", "Kamera uzaklaşır.", "Kamera sağa kayar.", "Yakın çekim: Ali" */
    if (/^kamera\b/.test(n) || /\b(yakin|genis) (cekim|plan)\b/.test(n)) {
      var cam = /uzaklas|genis|geri cek|acil|uzak plan|genel plan/.test(n) ? "cam_out" : (to0 && /kay|pan|doner|cevril|kaydir/.test(n)) ? "cam_pan" : "cam_in";
      return { act: cam, camera: true, subjects: [], all: false, target: found[0] || null, dir: null, to: to0, speed: "normal",
        seconds: sec0 ? parseFloat(sec0[1].replace(",", ".")) : null, emotion: "", simultaneous: /\b(ayni anda|bu sirada|o sirada|ayni zamanda)\b/.test(n) };
    }
    var act = null;
    for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i][1].test(n)) { act = ACTIONS[i][0]; break; }
    var dir = /\bsagdan\b/.test(n) ? "right" : /\bsoldan\b/.test(n) ? "left" : /\byukaridan|gokten|yukardan\b/.test(n) ? "top" : /\basagidan|alttan|yerden\b/.test(n) ? "bottom" : null;
    var to = /\bsaga\b/.test(n) ? "right" : /\bsola\b/.test(n) ? "left" : /\byukari\b/.test(n) ? "top" : /\basagi\b/.test(n) ? "bottom" : null;
    var speed = /kosarak|hizla|hizli|cabucak|firlayarak|telasla/.test(n) ? "fast" : /yavasca|agir agir|yavas|usulca|sessizce|sakin/.test(n) ? "slow" : "normal";
    var sec = n.match(/(\d+(?:[.,]\d+)?)\s*(saniye|sn)\b/);
    var simultaneous = /\b(ayni anda|bu sirada|o sirada|ayni zamanda)\b/.test(n);
    var subjects = found.slice(), target = null, targeted = act === "walk_to" || act === "look" || act === "hug" || act === "throw";
    if (targeted && found.length >= 2) { target = found[1]; subjects = [found[0]]; }
    else if (targeted && found.length === 1 && lastSubjects && lastSubjects.length && lastSubjects[0] !== found[0] && /\b(ona|yanina|dogru|onu)\b/.test(n)) { target = found[0]; subjects = lastSubjects.slice(0, 1); }
    if (!subjects.length && !all && lastSubjects && lastSubjects.length && /^(o |sonra |ardindan |ve |hemen )/.test(n + " ")) subjects = lastSubjects.slice();
    return { act: act, subjects: subjects, all: all, target: target, dir: dir || (act === "enter" ? null : to), to: to, speed: speed,
      seconds: sec ? parseFloat(sec[1].replace(",", ".")) : null, emotion: emotionOf(text), simultaneous: simultaneous };
  }

  /* Önizleme/istatistik: sahne, replik, eylem sayıları ve uyarılar */
  function analyze(text, castNames) {
    var ast = parse(text), names = (castNames || []).slice();
    ast.speakers.forEach(function (s) { if (names.map(norm).indexOf(norm(s)) < 0) names.push(s); });
    var stats = { scenes: ast.scenes.length, lines: 0, actions: 0, narrations: 0, seconds: 0, unknownActions: [], charactersWithoutImage: [], candidates: [], autoNames: [] };
    ast.scenes.forEach(function (sc) {
      var last = [];
      stats.seconds += 1.5;
      sc.items.forEach(function (it) {
        if (it.type === "dialogue") { stats.lines++; stats.seconds += lineDuration(it.text, "normal") + 0.3; }
        else if (it.type === "narration") { stats.narrations++; stats.seconds += lineDuration(it.text, "normal") + 0.3; }
        else {
          stats.actions++;
          var a = analyzeAction(it.text, names, last);
          if (!a.subjects.length && !a.all && a.act === "enter") {   // "Köpek sağdan girer." → Köpek bir karakterdir
            var auto = candidateName(it.text);
            if (auto && names.map(norm).indexOf(norm(auto)) < 0) { names.push(auto); stats.autoNames.push(auto); a = analyzeAction(it.text, names, last); }
          }
          if (a.subjects.length) last = a.subjects;
          if (!a.act) stats.unknownActions.push(it.text);
          if (!a.subjects.length && !a.all && a.act !== "wait" && !a.camera) {
            var cand = candidateName(it.text);
            if (cand && names.map(norm).indexOf(norm(cand)) < 0 && stats.candidates.indexOf(cand) < 0 && stats.candidates.length < 5) stats.candidates.push(cand);
          }
          stats.seconds += (a.seconds || ACTION_DUR[a.act] || 1.2) * (a.camera ? 0.5 : 1);
        }
      });
    });
    var castN = (castNames || []).map(norm);
    ast.speakers.forEach(function (s) { if (castN.indexOf(norm(s)) < 0) stats.charactersWithoutImage.push(s); });
    return { ast: ast, stats: stats, names: names };
  }

  var SPEED = { slow: 0.095, normal: 0.072, fast: 0.055 };
  function lineDuration(text, speed) { return Math.max(1.5, Math.min(8, 1.2 + String(text).length * (SPEED[speed] || SPEED.normal))); }
  var ACTION_DUR = { enter: 1.1, exit: 1.0, walk: 1.6, walk_to: 1.6, run: 1.0, jump: 1.6, spin: 1.0, turn: 0.4, fall: 0.8, rise: 0.6, fly: 1.4, land: 1.0, wave: 1.4,
    laugh: 1.2, cry: 1.6, angry: 1.4, surprise: 1.0, fear: 1.5, dance: 2.4, sit: 0.6, sleep: 1.5, think: 1.6, look: 0.5, grow: 0.9, shrink: 0.9, nod: 1.0, shake_head: 1.0, hide: 0.6, wait: 1.2,
    hug: 1.6, back: 0.8, wake: 0.9, lie: 0.8, clap: 1.2, sing: 2.4, slide: 1.2, swim: 2.0, yawn: 1.4, throw: 0.7, catch: 0.6, bark: 1.2, cam_in: 1.0, cam_out: 1.0, cam_pan: 1.2 };
  var STOP_WORDS = /^(o|bu|su|sonra|ardindan|birden|aniden|hemen|ve|ama|fakat|derken|herkes|hepsi|ikisi|biraz|yavasca|hizla|once|simdi|iste|tam|bir|kisa|uzun|sahne|kamera|muzik|ses|isik)$/;
  /* Öznesi anlaşılmayan eylemin ilk sözcüğü karakter adayıdır ("Köpek havlar." → Köpek) */
  function candidateName(text) {
    var first = String(text).trim().split(/\s+/)[0] || "";
    first = first.replace(/[^\p{L}']/gu, "").split("'")[0];
    if (first.length < 2 || STOP_WORDS.test(norm(first))) return "";
    return titleCase(first);
  }

  /* Film ölçüleri: karakter boyu, balon yazısı ve balon başına karakter sayısı (sahne kurucu ve seslendirme aynı değerleri kullanır) */
  function metrics(project) {
    var W = project.width, H = project.height, settings = (project.script && project.script.settings) || {};
    var base = Math.min(H, W * 1.1), k = base / 720;
    var charH = (settings.charHeight || 0.42) * base;
    var bubbleFont = Math.round(base * 0.042), bubbleMaxW = Math.round(W * (W < H ? 0.72 : W === H ? 0.5 : 0.36));
    var bubbleChars = Math.max(40, Math.round(bubbleMaxW / (bubbleFont * 0.5)) * 3);   // balon başına en çok ~3 satır
    return { base: base, k: k, charH: charH, bubbleFont: bubbleFont, bubbleMaxW: bubbleMaxW, bubbleChars: bubbleChars };
  }
  /* Seslendirme anahtarı: aynı ses + stil + duygu + metin → aynı klip (yeniden üretimde tekrar seslendirilmez) */
  function voiceKey(voiceId, style, emotion, text) {
    return "vo" + hash([voiceId || "", style || "", emotion || "", String(text || "").trim()].join("\u0001")).toString(36);
  }
  /* Seslendirilecek satırlar: senaryodaki replik ve anlatım parçaları (balon bölünmesiyle birebir aynı) */
  function voiceLines(project) {
    var script = project.script || {}, vo = script.voice || {}, m = metrics(project), ast = parse(script.text || "");
    var byName = {}, out = [], seen = {};
    (script.cast || []).forEach(function (c) { byName[norm(c.name)] = c; });
    function push(e) { e.key = voiceKey(e.voiceId, e.style, e.emotion, e.text); if (seen[e.key]) return; seen[e.key] = 1; out.push(e); }
    ast.scenes.forEach(function (sa) {
      sa.items.forEach(function (it) {
        if (it.type === "dialogue") {
          var c = byName[norm(it.who)], emo = emotionOf(it.emotion);
          splitLine(it.text, m.bubbleChars).forEach(function (ch) { push({ kind: "dialogue", who: it.who, text: ch, emotion: emo, voiceId: (c && c.voiceId) || "", style: vo.style || "sohbet" }); });
        } else if (it.type === "narration") {
          splitLine(it.text, m.bubbleChars).forEach(function (ch) { push({ kind: "narration", who: "Anlatıcı", text: ch, emotion: "", voiceId: vo.narratorVoiceId || "", style: vo.narratorStyle || "anlatıcı" }); });
        }
      });
    });
    return out;
  }

  /* Dudak ritmi (ses klibi yokken): metnin hecelerinden 12 kare/sn ağız dizisi — 0 kapalı, 1 yarım, 2 açık.
     Noktalamada durak, hece aralarında kapanış; aynı tohum aynı diziyi verir. */
  function mouthPattern(text, duration, fps, seed) {
    fps = fps || 12;
    var n = Math.max(2, Math.ceil(duration * fps)), out = [], i;
    for (i = 0; i < n; i++) out.push(0);
    var units = [];
    String(text || "").split(/\s+/).forEach(function (w) {
      if (!w) return;
      var core = w.replace(/[^\p{L}\p{N}']/gu, "");
      var syl = (core.match(/[aeıioöuüAEIİOÖUÜâîû]/g) || []).length || (core ? 1 : 0);
      for (var s = 0; s < syl; s++) units.push({ k: "s", w: 1 });
      if (/[.!?…]$/.test(w)) units.push({ k: "p", w: 2.2 }); else if (/[,;:]$/.test(w)) units.push({ k: "p", w: 1.2 }); else units.push({ k: "g", w: 0.35 });
    });
    if (!units.length) return out.join("");
    if (units[units.length - 1].k !== "s") units.pop();
    var lead = 1, tail = Math.min(3, Math.max(1, Math.round(n * 0.08)));
    var usable = Math.max(1, n - lead - tail), total = units.reduce(function (s2, u) { return s2 + u.w; }, 0), scale = usable / total;
    var pos = lead, h = (seed >>> 0) || 1;
    units.forEach(function (u, ui) {
      var len = Math.max(1, Math.round(u.w * scale));
      if (u.k === "s") {
        h = Math.imul(h ^ (ui + 1), 2654435761) >>> 0;
        var openLv = (h % 4 === 0) ? 1 : 2, openLen = Math.max(1, Math.round(len * 0.6));
        for (var j = 0; j < len && pos + j < n - tail; j++) out[pos + j] = j < openLen ? openLv : 0;
      }
      pos += len;
    });
    var run = 0;
    for (i = 0; i < n; i++) { if (out[i] > 0) { run++; if (run > 3) { out[i] = 0; run = 0; } } else run = 0; }
    return out.join("");
  }

  /* Replikleri balon boyutuna göre parçalara böler */
  function splitLine(text, maxChars) {
    text = String(text).trim();
    if (text.length <= maxChars) return [text];
    var parts = text.match(/[^.!?…]+[.!?…]+["”']?\s*|[^.!?…]+$/g) || [text];
    var out = [], cur = "";
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if ((cur + " " + p).trim().length <= maxChars) cur = (cur + " " + p).trim();
      else {
        if (cur) out.push(cur);
        if (p.length <= maxChars) cur = p;
        else { // çok uzun cümle: kelimelerden böl
          var words = p.split(/\s+/), buf = "";
          words.forEach(function (w) { if ((buf + " " + w).trim().length > maxChars) { out.push(buf.trim()); buf = w; } else buf = (buf + " " + w).trim(); });
          cur = buf;
        }
      }
    });
    if (cur) out.push(cur);
    return out;
  }

  /* ── Prosedürel görseller (yer tutucu karakter, arka planlar, bulut) ── */
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function hsl(h, s, l) { return "hsl(" + h + "," + s + "%," + l + "%)"; }

  function drawPlaceholder(name, variant) {   // variant: 'pose' | 'talk' | 'walk'
    var c = canvas(240, 330), x = c.getContext("2d"), hue = hash(norm(name)) % 360;
    var body = hsl(hue, 65, 55), dark = hsl(hue, 60, 35), skin = "#ffd6a5";
    x.lineCap = "round"; x.lineJoin = "round";
    var walk = variant === "walk";
    x.strokeStyle = dark; x.lineWidth = 22;
    [[104, 250, walk ? 82 : 102, 306], [136, 250, walk ? 160 : 138, 306]].forEach(function (l) { x.beginPath(); x.moveTo(l[0], l[1]); x.lineTo(l[2], l[3]); x.stroke(); });
    x.fillStyle = dark; [[walk ? 82 : 102, 310], [walk ? 160 : 138, 310]].forEach(function (f) { x.beginPath(); x.ellipse(f[0], f[1], 24, 11, 0, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = body; x.beginPath(); x.ellipse(120, 190, 66, 76, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = body; x.lineWidth = 20;
    [[62, 170, walk ? 40 : 34, walk ? 215 : 150], [178, 170, walk ? 200 : 206, walk ? 125 : 215]].forEach(function (a) { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(a[2], a[3]); x.stroke(); });
    x.fillStyle = skin; [[walk ? 40 : 34, walk ? 215 : 150], [walk ? 200 : 206, walk ? 125 : 215]].forEach(function (h) { x.beginPath(); x.arc(h[0], h[1], 13, 0, Math.PI * 2); x.fill(); });
    x.beginPath(); x.arc(120, 92, 60, 0, Math.PI * 2); x.fill();
    x.fillStyle = dark; x.beginPath(); x.arc(120, 70, 60, Math.PI, 2 * Math.PI); x.fill();
    x.fillStyle = "#fff"; x.beginPath(); x.ellipse(98, 94, 13, 15, 0, 0, Math.PI * 2); x.ellipse(142, 94, 13, 15, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#1d2b53"; x.beginPath(); x.arc(102, 96, 6, 0, Math.PI * 2); x.arc(146, 96, 6, 0, Math.PI * 2); x.fill();
    if (variant === "talk") { x.fillStyle = "#7a2d2d"; x.beginPath(); x.ellipse(120, 120, 14, 11, 0, 0, Math.PI * 2); x.fill(); }
    else { x.strokeStyle = "#c0392b"; x.lineWidth = 6; x.beginPath(); x.arc(120, 110, 22, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); }
    // isim etiketi
    x.font = "700 26px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    var label = name.length > 12 ? name.slice(0, 11) + "…" : name, tw = x.measureText(label).width + 24;
    x.fillStyle = "rgba(255,255,255,.92)"; x.beginPath(); x.roundRect ? x.roundRect(120 - tw / 2, 196, tw, 36, 10) : x.rect(120 - tw / 2, 196, tw, 36); x.fill();
    x.fillStyle = dark; x.fillText(label, 120, 214);
    return c;
  }

  var SKY = {
    gunduz: ["#4fa8ff", "#cfe9ff"], sabah: ["#ffd6a5", "#9fd3ff"], aksam: ["#ff7b54", "#ffd27f"], gece: ["#0b1a3a", "#1b2f5e"]
  };
  /* Türkçe ekleri tolere eden anahtar sözcük eşleşmesi: "ormanın", "meydanı", "odası" */
  function kw(list) { return new RegExp("\\b(" + list + ")[a-z]{0,4}\\b"); }
  var KIND_RULES = [
    ["uzay", kw("uzay|gezegen|galaksi|yildizlar|roket|uzay gemisi")],
    ["deniz", kw("deniz|plaj|sahil|kumsal|gol|nehir|okyanus|liman|dalga|ada")],
    ["orman", kw("orman|agac|koru|cengel")],
    ["dag", kw("dag|tepe|zirve|yayla")],
    ["kir", kw("koy|kir|cayir|tarla|park|bahce|ciftlik|kamp|yol|piknik")],
    ["ic", kw("ev|oda|salon|mutfak|okul|sinif|ofis|dukkan|magaza|hastane|kutuphane|ici|ic|yatak|banyo|restoran|kafe|market|sahne arkasi|koridor")],
    ["sehir", kw("sehir|sokak|cadde|kent|bina|meydan|mahalle|otobus|durak|kopru|istasyon")]
  ];
  function placeKind(place) {
    var n = norm(place);
    for (var i = 0; i < KIND_RULES.length; i++) if (KIND_RULES[i][1].test(n)) return KIND_RULES[i][0];
    return "kir";
  }
  function drawBackground(kind, time, W, H) {
    var c = canvas(W, H), x = c.getContext("2d"), sky = SKY[time] || SKY.gunduz, night = time === "gece";
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    var k = H / 720;
    function star(n) { x.fillStyle = "rgba(255,255,255,.85)"; for (var i = 0; i < n; i++) { var sx = (hash("s" + i) % 1000) / 1000 * W, sy = (hash("t" + i) % 1000) / 1000 * H * 0.6; x.beginPath(); x.arc(sx, sy, (i % 3) * 0.6 + 0.8, 0, 7); x.fill(); } }
    if (night) { star(90); x.fillStyle = "#fff6c7"; x.beginPath(); x.arc(W * 0.82, H * 0.18, 48 * k, 0, 7); x.fill(); x.fillStyle = sky[0]; x.beginPath(); x.arc(W * 0.85, H * 0.16, 44 * k, 0, 7); x.fill(); }
    else if (kind !== "ic" && kind !== "uzay") { x.fillStyle = time === "aksam" ? "#ffb347" : "#ffe27a"; x.beginPath(); x.arc(W * 0.8, H * 0.2, 56 * k, 0, 7); x.fill(); }
    var ground = night ? "#223a2a" : time === "aksam" ? "#5f9a3f" : "#6cc04a";
    var ground2 = night ? "#1a2d21" : time === "aksam" ? "#4e8534" : "#4ea838";
    function hills(col1, col2) {
      x.fillStyle = col1; x.beginPath(); x.ellipse(W * 0.25, H * 0.98, W * 0.5, H * 0.26, 0, 0, 7); x.fill();
      x.fillStyle = col2; x.beginPath(); x.ellipse(W * 0.78, H * 1.02, W * 0.55, H * 0.3, 0, 0, 7); x.fill();
      x.fillStyle = col2; x.fillRect(0, H * 0.9, W, H * 0.1);
    }
    if (kind === "kir") { hills(ground, ground2); x.fillStyle = night ? "#3a3326" : "#e9d8a6"; x.fillRect(0, H * 0.905, W, H * 0.045); }
    else if (kind === "orman") {
      hills(ground, ground2);
      for (var i = 0; i < 9; i++) { var tx = (i + 0.5) / 9 * W + ((hash("tr" + i) % 40) - 20) * k, th = (150 + (hash("th" + i) % 90)) * k, ty = H * 0.9;
        x.fillStyle = "#6b4a2b"; x.fillRect(tx - 9 * k, ty - th * 0.45, 18 * k, th * 0.45);
        x.fillStyle = night ? "#1f4d2e" : i % 2 ? "#2e8b57" : "#3aa660"; x.beginPath(); x.moveTo(tx, ty - th); x.lineTo(tx - 60 * k, ty - th * 0.35); x.lineTo(tx + 60 * k, ty - th * 0.35); x.closePath(); x.fill(); }
    } else if (kind === "sehir") {
      for (var b = 0; b < 12; b++) { var bw = W / 12, bh = (120 + (hash("b" + b) % 220)) * k, bx = b * bw;
        x.fillStyle = night ? "#1c2740" : (b % 2 ? "#9aa5b8" : "#b7c0d0"); x.fillRect(bx + 4, H * 0.9 - bh, bw - 8, bh);
        x.fillStyle = night ? "#ffe9a6" : "#e8f1ff";
        for (var wy = H * 0.9 - bh + 18 * k; wy < H * 0.88; wy += 32 * k) for (var wx = bx + 14 * k; wx < bx + bw - 18 * k; wx += 26 * k) if (hash("w" + b + wx + wy) % 3) x.fillRect(wx, wy, 12 * k, 16 * k); }
      x.fillStyle = night ? "#2c2f36" : "#6b7280"; x.fillRect(0, H * 0.9, W, H * 0.1);
      x.fillStyle = "#f5f5f5"; for (var d = 0; d < W; d += 80 * k) x.fillRect(d, H * 0.948, 40 * k, 6 * k);
    } else if (kind === "deniz") {
      x.fillStyle = night ? "#0f3b5c" : "#2f8fd6"; x.fillRect(0, H * 0.62, W, H * 0.3);
      x.strokeStyle = "rgba(255,255,255,.45)"; x.lineWidth = 3 * k;
      for (var r = 0; r < 6; r++) { x.beginPath(); for (var px = 0; px <= W; px += 20) x.lineTo(px, H * (0.66 + r * 0.045) + Math.sin(px / (40 * k) + r) * 4 * k); x.stroke(); }
      x.fillStyle = night ? "#8a7a55" : "#f1deab"; x.beginPath(); x.ellipse(W * 0.5, H * 1.05, W * 0.75, H * 0.2, 0, 0, 7); x.fill();
    } else if (kind === "dag") {
      x.fillStyle = night ? "#2a3350" : "#7d8da8"; x.beginPath(); x.moveTo(-W * 0.1, H * 0.9); x.lineTo(W * 0.25, H * 0.28); x.lineTo(W * 0.55, H * 0.9); x.closePath(); x.fill();
      x.fillStyle = night ? "#1f2740" : "#5f6f8e"; x.beginPath(); x.moveTo(W * 0.4, H * 0.9); x.lineTo(W * 0.72, H * 0.2); x.lineTo(W * 1.1, H * 0.9); x.closePath(); x.fill();
      x.fillStyle = "#ffffff"; x.beginPath(); x.moveTo(W * 0.72, H * 0.2); x.lineTo(W * 0.64, H * 0.36); x.lineTo(W * 0.8, H * 0.36); x.closePath(); x.fill();
      hills(ground, ground2);
    } else if (kind === "uzay") {
      x.fillStyle = "#05070f"; x.fillRect(0, 0, W, H); star(160);
      x.fillStyle = "#6c5ce7"; x.beginPath(); x.arc(W * 0.78, H * 0.3, 90 * k, 0, 7); x.fill();
      x.strokeStyle = "#a29bfe"; x.lineWidth = 10 * k; x.beginPath(); x.ellipse(W * 0.78, H * 0.3, 150 * k, 40 * k, -0.3, 0, 7); x.stroke();
      x.fillStyle = "#5b6b7a"; x.beginPath(); x.ellipse(W * 0.5, H * 1.05, W * 0.8, H * 0.22, 0, 0, 7); x.fill();
    } else { // iç mekân
      x.fillStyle = night ? "#3b3550" : "#f3e6cf"; x.fillRect(0, 0, W, H * 0.78);
      x.fillStyle = night ? "#2a2538" : "#d9b58a"; x.fillRect(0, H * 0.78, W, H * 0.22);
      x.fillStyle = night ? "#1d1a2a" : "#b98b5e"; for (var fl = 0; fl < W; fl += 90 * k) x.fillRect(fl, H * 0.78, 2, H * 0.22);
      x.fillStyle = "#8b5a2b"; x.fillRect(W * 0.12, H * 0.16, W * 0.26, H * 0.36);
      var wg = x.createLinearGradient(0, H * 0.18, 0, H * 0.5); wg.addColorStop(0, sky[0]); wg.addColorStop(1, sky[1]);
      x.fillStyle = wg; x.fillRect(W * 0.135, H * 0.18, W * 0.23, H * 0.32);
      x.fillStyle = "#8b5a2b"; x.fillRect(W * 0.245, H * 0.18, 8 * k, H * 0.32); x.fillRect(W * 0.135, H * 0.33, W * 0.23, 8 * k);
      x.fillStyle = "#c0392b"; x.fillRect(W * 0.62, H * 0.2, W * 0.16, H * 0.2); x.fillStyle = "#f9e79f"; x.fillRect(W * 0.635, H * 0.22, W * 0.13, H * 0.16);
      x.fillStyle = "#2e86c1"; x.beginPath(); x.arc(W * 0.7, H * 0.32, 22 * k, 0, 7); x.fill();
    }
    return c;
  }
  function drawBird(up) {
    var c = canvas(90, 60), x = c.getContext("2d");
    x.strokeStyle = "#2b2140"; x.lineWidth = 5; x.lineCap = "round"; x.beginPath();
    if (up) { x.moveTo(8, 40); x.quadraticCurveTo(28, 12, 45, 34); x.quadraticCurveTo(62, 12, 82, 40); }
    else { x.moveTo(8, 24); x.quadraticCurveTo(28, 46, 45, 30); x.quadraticCurveTo(62, 46, 82, 24); }
    x.stroke(); return c;
  }
  function drawButterfly(open, hue) {
    var c = canvas(80, 70), x = c.getContext("2d"), w = open ? 30 : 12;
    x.fillStyle = hsl(hue, 80, 60);
    [-1, 1].forEach(function (d) { x.beginPath(); x.ellipse(40 + d * w * 0.55, 28, w, 20, d * 0.5, 0, 7); x.fill(); x.beginPath(); x.ellipse(40 + d * w * 0.45, 48, w * 0.75, 14, -d * 0.4, 0, 7); x.fill(); });
    x.fillStyle = hsl(hue, 70, 85); [-1, 1].forEach(function (d) { x.beginPath(); x.arc(40 + d * w * 0.6, 26, open ? 7 : 3, 0, 7); x.fill(); });
    x.fillStyle = "#2b2140"; x.fillRect(37, 16, 6, 42); return c;
  }
  function drawLeaf(hue) {
    var c = canvas(50, 40), x = c.getContext("2d");
    x.fillStyle = hsl(hue, 70, 50); x.beginPath(); x.moveTo(4, 20); x.quadraticCurveTo(25, -6, 46, 20); x.quadraticCurveTo(25, 46, 4, 20); x.fill();
    x.strokeStyle = "rgba(0,0,0,.3)"; x.lineWidth = 2; x.beginPath(); x.moveTo(6, 20); x.lineTo(44, 20); x.stroke(); return c;
  }
  function drawGlow() {
    var c = canvas(40, 40), x = c.getContext("2d"), g = x.createRadialGradient(20, 20, 2, 20, 20, 20);
    g.addColorStop(0, "rgba(255,246,170,1)"); g.addColorStop(0.4, "rgba(255,230,110,.75)"); g.addColorStop(1, "rgba(255,230,110,0)");
    x.fillStyle = g; x.fillRect(0, 0, 40, 40); return c;
  }
  function drawPuff() {
    var c = canvas(160, 90), x = c.getContext("2d");
    x.fillStyle = "rgba(255,255,255,.92)";
    [[40, 60, 22], [80, 50, 30], [120, 60, 22], [60, 72, 18], [100, 72, 18]].forEach(function (b) { x.beginPath(); x.arc(b[0], b[1], b[2], 0, 7); x.fill(); });
    return c;
  }
  function drawComet() {
    var c = canvas(220, 40), x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 220, 0);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "#ffffff");
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 18); x.lineTo(200, 10); x.lineTo(210, 20); x.lineTo(200, 30); x.closePath(); x.fill();
    x.fillStyle = "#fff"; x.beginPath(); x.arc(205, 20, 9, 0, 7); x.fill(); return c;
  }
  function drawCloud(seed) {
    var c = canvas(340, 190), x = c.getContext("2d");
    x.fillStyle = "#ffffff";
    var blobs = seed ? [[90, 120, 55], [160, 95, 70], [240, 115, 58], [120, 70, 42], [200, 70, 48]] : [[80, 125, 50], [150, 100, 66], [230, 120, 60], [190, 75, 50]];
    blobs.forEach(function (b) { x.beginPath(); x.arc(b[0], b[1], b[2], 0, Math.PI * 2); x.fill(); });
    x.fillRect(80, 120, 160, 50);
    return c;
  }

  /* ── Sahne kurucu ──────────────────────────────────────────── */
  function build(project) {
    var Model = root.Model, M = root.Motion, R = root.Render;
    var script = project.script, settings = script.settings || {};
    var W = project.width, H = project.height;
    var mm = metrics(project), base = mm.base, k = mm.k;   // dikey/kare filmde ölçüler genişliğe göre küçülür
    var voiceOn = !!(script.voice && script.voice.enabled), clips = project.clips || {}, clipsUsed = {};
    var voStyle = (script.voice && script.voice.style) || "sohbet", voNarStyle = (script.voice && script.voice.narratorStyle) || "anlatıcı";
    var narratorVoice = (script.voice && script.voice.narratorVoiceId) || "";
    function clipFor(voiceId, style, emotion, text) {
      if (!voiceOn) return null;
      var key = voiceKey(voiceId || "", style, emotion || "", text), c = clips[key];
      if (!c || !(c.duration > 0)) return null;
      clipsUsed[key] = true;
      return { key: key, duration: c.duration, mouth: c.mouth || "" };
    }
    var res = analyze(script.text, script.cast.map(function (c) { return c.name; }));
    var ast = res.ast, warnings = [], stats = res.stats;
    if (!ast.scenes.length || !ast.scenes.some(function (s) { return s.items.length; })) throw new Error("Senaryoda sahne ya da replik bulunamadı. Örnek senaryoya bakın.");

    /* Üretilen görseller anahtarla yeniden kullanılır (tekrar üretimde şişme olmaz) */
    var genUsed = {};
    function genAsset(key, name, drawFn) {
      var found = null;
      Object.keys(project.assets).forEach(function (id) { if (project.assets[id].genKey === key) found = id; });
      if (!found) {
        var c = drawFn(), id = M.uid("as");
        project.assets[id] = { id: id, name: name, dataUrl: c.toDataURL("image/png"), width: c.width, height: c.height, genKey: key };
        found = id;
        R.loadAsset(project.assets[id]);          // boyutlar zaten biliniyor; çizim için önbelleğe alınır
      }
      genUsed[found] = true;
      return found;
    }

    /* Karakter tablosu: görseller, yüz yönü */
    var cast = {}, castUsed = {};
    function castDef(name, imgs, facing, size, voiceId) {
      var byRole = {};
      imgs.forEach(function (im) { (byRole[im.role || "pose"] = byRole[im.role || "pose"] || []).push(im.assetId); });
      var pose = (byRole.pose || [])[0] || imgs[0].assetId;
      var jest = [];
      if (byRole.jest1 && byRole.jest1k) jest.push([byRole.jest1[0], byRole.jest1k[0]]);
      if (byRole.jest2 && byRole.jest2k) jest.push([byRole.jest2[0], byRole.jest2k[0]]);
      return { name: name, pose: pose, talk: byRole.talk || [], walk: byRole.walk || [], blink: byRole.blink || [], jest: jest, look: (byRole.bak || [])[0] || null, emotions: {
        mutlu: (byRole.mutlu || [])[0], uzgun: (byRole.uzgun || [])[0], kizgin: (byRole.kizgin || [])[0], saskin: (byRole.saskin || [])[0], korkmus: (byRole.korkmus || [])[0] },
        facing: facing === "left" ? -1 : 1, size: (size > 0 ? size : 1), voiceId: voiceId || "" };
    }
    script.cast.forEach(function (c) {
      var imgs = (c.images || []).filter(function (im) { return project.assets[im.assetId]; });
      imgs.forEach(function (im) { castUsed[im.assetId] = true; });
      if (!imgs.length) return;
      cast[norm(c.name)] = castDef(c.name, imgs, c.facing, c.size, c.voiceId);
    });
    /* Görseli olmayan karakterler: kütüphaneden (ada göre eşleşen ya da isim etiketli rastgele) çizilir; kütüphane yoksa yer tutucu */
    var Lib = root.Characters;
    res.names.forEach(function (nm) {
      if (cast[norm(nm)]) return;
      var made = null;
      if (Lib) {
        try {
          var entry = Lib.findByName(nm) || Lib.random(nm), gen = Lib.generate(project, entry, nm);
          gen.images.forEach(function (im) { genUsed[im.assetId] = true; });
          var own = script.cast.filter(function (c) { return norm(c.name) === norm(nm); })[0];
          made = castDef(nm, gen.images, gen.facing, gen.size, own && own.voiceId);
          made.placeholder = !!entry.label;   // isim etiketli karakter aynalanmaz
          warnings.push("“" + nm + "” için görsel yüklenmedi; kütüphaneden " + (entry.label ? "isim etiketli bir karakter" : "“" + entry.name + "”") + " çizildi.");
        } catch (e) { made = null; }
      }
      if (!made) {
        var pose = genAsset("ph:" + norm(nm) + ":pose", nm + " (yer tutucu).png", function () { return drawPlaceholder(nm, "pose"); });
        var talk = genAsset("ph:" + norm(nm) + ":talk", nm + " (konuşma).png", function () { return drawPlaceholder(nm, "talk"); });
        var walk = genAsset("ph:" + norm(nm) + ":walk", nm + " (yürüme).png", function () { return drawPlaceholder(nm, "walk"); });
        var own2 = script.cast.filter(function (c) { return norm(c.name) === norm(nm); })[0];
        made = { name: nm, pose: pose, talk: [talk], walk: [walk], blink: [], jest: [], look: null, emotions: {}, facing: 1, placeholder: true, size: 1, voiceId: (own2 && own2.voiceId) || "" };
        warnings.push("“" + nm + "” için görsel yüklenmedi; renkli bir yer tutucu karakter çizildi.");
      }
      cast[norm(nm)] = made;
    });
    var names = Object.keys(cast).map(function (kk) { return cast[kk].name; });

    var bgList = (script.backgrounds || []).filter(function (b) { return project.assets[b.assetId]; });
    function pickBackground(scene) {
      var pn = norm(scene.place), best = null, bestScore = 0;
      bgList.forEach(function (b) {
        var bn = norm(b.name).replace(/\.[a-z0-9]+$/, ""), score = 0;
        if (!bn) return;
        if (pn === bn) score = 3; else if (pn && (pn.indexOf(bn) >= 0 || bn.indexOf(pn) >= 0)) score = 2;
        else { var toks = bn.split(" ").filter(function (t) { return t.length > 2; }); score = toks.filter(function (t) { return pn.indexOf(t) >= 0; }).length ? 1 : 0; }
        if (score > bestScore) { bestScore = score; best = b; }
      });
      if (!best && bgList.length === 1 && !pn) best = bgList[0];
      return best;
    }

    var speed = settings.speed || "normal", charH = mm.charH, groundY = Math.round(H * 0.9);
    var bubbleFont = mm.bubbleFont, bubbleMaxW = mm.bubbleMaxW, bubbleChars = mm.bubbleChars;
    var fonts = Model.FONTS;
    var scenes = [];

    function fade(sc, type, dur) { if (settings.fade !== false) sc.transition = { type: type || "fade", duration: dur || 0.5 }; }
    var GRADES = { gece: { color: "#8fa6ff", alpha: 0.45 }, aksam: { color: "#ffc28c", alpha: 0.3 }, sabah: { color: "#ffe9c8", alpha: 0.25 } };
    function fx(layer, type, start, end, params) {
      var e = M.createEffect(type, 9999, layer);
      e.start = Math.max(0, start); e.end = end == null ? null : Math.max(e.start, end);
      if (params) Object.keys(params).forEach(function (p) { e.params[p] = params[p]; });
      layer.effects.push(e);
      return e;
    }
    function key(layer, prop, t, v, ease) {
      var tr = layer.tracks[prop];
      if (!tr.length && t > (layer.inPoint || 0) + 1e-6) M.setKey(tr, layer.inPoint || 0, layer.base[prop], ease || "easeInOutQuad");
      M.setKey(tr, t, v, ease || "easeInOutQuad");
    }
    function textLayer(name, content, opts) {
      var L = Model.newLayer("text", { name: name, text: Object.assign({ content: content, font: fonts[1].id, size: bubbleFont, maxWidth: bubbleMaxW }, opts.text || {}), base: opts.base });
      if (opts.anchor) L.anchor = opts.anchor;
      L.inPoint = opts.start || 0; L.outPoint = opts.end == null ? null : opts.end;
      return L;
    }

    /* Başlık kartı */
    var filmTitle = ast.title || ((project.name && project.name !== "Adsız Film" && project.name !== "Örnek Film") ? project.name : "");
    if (settings.titleCard !== false && filmTitle) {
      var ts = Model.newScene("Başlık", 3);
      ts.background = { type: "gradient", color: "#1d2a44", color2: "#07090f", angle: 180, assetId: null };
      var title = textLayer("Film adı", filmTitle, { base: { x: W / 2, y: H * (ast.author ? 0.44 : 0.5), rot: -2, sx: 1, sy: 1, opacity: 1 },
        text: { size: Math.round(base * 0.13), font: fonts[2].id, color: "#ffffff", stroke: "#7b2fff", strokeWidth: Math.round(6 * k), bubble: false, maxWidth: Math.round(W * 0.85) } });
      fx(title, "zoomIn", 0, 0.9); fx(title, "float", 0, null, { strength: 4 * k, speed: 0.4, tilt: 1 }); fx(title, "fadeOut", 2.5, 3);
      ts.layers.push(title);
      if (ast.author) {
        var by = textLayer("Yazan", "Yazan: " + ast.author, { start: 0.8, base: { x: W / 2, y: H * 0.62, rot: 0, sx: 1, sy: 1, opacity: 1 },
          text: { size: Math.round(base * 0.045), font: fonts[0].id, color: "#cfe9ff", bubble: false, weight: "400", maxWidth: Math.round(W * 0.8) } });
        fx(by, "fadeIn", 0.8, 1.4); fx(by, "fadeOut", 2.5, 3);
        ts.layers.push(by);
      }
      if (settings.sfx !== false) ts.sfx.push({ t: 0.15, type: "chime" });
      fade(ts);
      scenes.push(ts);
    }

    ast.scenes.forEach(function (sa) {
      if (!sa.items.length) { warnings.push("Sahne " + sa.index + " boş; atlandı."); return; }
      var sc = Model.newScene((sa.place || "Sahne " + sa.index) + (sa.time ? " · " + TIME_LABEL[sa.time] : ""), 4);
      var time = sa.time || "gunduz", kind = placeKind(sa.place), outdoor = kind !== "ic" && kind !== "uzay";
      var userBg = pickBackground(sa);
      sc.grade = GRADES[time] || null;   // günün saatine göre renk tonu (karakterler sahneye oturur)
      var bgAssetId = userBg ? userBg.assetId : genAsset("bg:" + kind + ":" + time + ":" + W + "x" + H, "arka plan " + kind + " " + time + ".png", function () { return drawBackground(kind, time, W, H); });
      sc.background = { type: "color", color: (SKY[time] || SKY.gunduz)[0], color2: "#000000", angle: 0, assetId: null };
      var bgA = project.assets[bgAssetId], cover = Math.max(W / (bgA ? bgA.width : W), H / (bgA ? bgA.height : H));
      var bgL = Model.newLayer("image", { name: "Arka plan", frames: [bgAssetId], base: { x: W / 2, y: H / 2, rot: 0, sx: cover, sy: cover, opacity: 1 } });
      bgL.locked = true; bgL.parallax = 0.8;   // kamera hareketinde arka plan daha az kayar (derinlik)
      var pushIn = scenes.length % 2 === 0;   // sahneler sırayla yaklaşır / uzaklaşır: durağan değil, sinema hissi
      bgL.base.sx = bgL.base.sy = pushIn ? cover : cover * 1.05;
      sc.layers.push(bgL);
      {
        if (!userBg && outdoor) {
          [[0.22, 0.14, 0.85, 22, 0], [0.68, 0.2, 0.6, 14, 1]].forEach(function (cl, i) {
            var cid = genAsset("cloud:" + i, "bulut-" + (i + 1) + ".png", function () { return drawCloud(i); });
            var L = Model.newLayer("image", { name: "Bulut " + (i + 1), frames: [cid], base: { x: W * cl[0], y: H * cl[1], rot: 0, sx: cl[2] * k, sy: cl[2] * k, opacity: time === "gece" ? 0.35 : 0.95 } });
            fx(L, "drift", 0, null, { speed: cl[3], dir: "right", wrap: "yes" });
            L.parallax = 0.88;
            sc.layers.push(L);
          });
        }
      }
      var ambientAt = sc.layers.length;   // ortam katmanları (kuş, kelebek…) buraya girer: karakterlerin arkasında
      /* Sahnedeki karakterler ve ilk görünüşleri */
      var order = [], firstInfo = {}, last = [];
      sa.items.forEach(function (it) {
        if (it.type === "dialogue") { var kn = norm(it.who); if (order.indexOf(kn) < 0) { order.push(kn); firstInfo[kn] = { enters: false }; } last = [it.who]; }
        else if (it.type === "action") {
          var a = analyzeAction(it.text, names, last); it.a = a;
          var subs = a.all ? order.map(function (kn) { return cast[kn].name; }) : a.subjects;
          if (a.target) subs = subs.concat([a.target]);
          subs.forEach(function (nm) { var kn = norm(nm); if (!cast[kn]) return; if (order.indexOf(kn) < 0) { order.push(kn); firstInfo[kn] = { enters: a.act === "enter" && nm !== a.target, dir: a.dir }; } });
          if (a.subjects.length) last = a.subjects;
        }
      });
      /* Kalabalık: karakter sayısı arttıkça ölçek küçülür; sığmayınca ikinci (arka) sıra açılır */
      var n = order.length;
      var avgAspect = n ? order.reduce(function (s, kn) { var a = project.assets[cast[kn].pose]; return s + (a ? a.width / a.height : 0.7) * cast[kn].size; }, 0) / n : 0.7;
      var natW = avgAspect * charH, perSlot = W * 0.82 / Math.max(1, n);
      var crowd = Math.max(0.6, Math.min(1, perSlot / (natW * 1.1)));
      var twoRows = n >= 4 && crowd < 0.8, nFront = n;
      if (twoRows) { nFront = Math.ceil(n / 2); perSlot = W * 0.82 / nFront; crowd = Math.max(0.62, Math.min(0.92, perSlot / (natW * 1.1))); }
      function spread(count, lo, hi) { if (count <= 1) return [0.5]; var out = []; for (var i = 0; i < count; i++) out.push(lo + (hi - lo) * i / (count - 1)); return out; }
      var frontSlots = twoRows ? spread(nFront, 0.14, 0.86) : (n <= 1 ? [0.5] : n === 2 ? [0.33, 0.67] : n === 3 ? [0.2, 0.5, 0.8] : spread(n, 0.12, 0.88));
      var backSlots = twoRows ? spread(n - nFront, n - nFront <= 2 ? 0.3 : 0.22, n - nFront <= 2 ? 0.7 : 0.78) : [];
      var freeRows = [frontSlots.slice(), backSlots.slice()], chars = {};
      order.forEach(function (kn, oi) {
        var info = firstInfo[kn], row = (twoRows && oi >= nFront) ? 1 : 0, free = freeRows[row], pick;
        if (info.enters && info.dir === "left") pick = free.shift();
        else if (info.enters && info.dir === "right") pick = free.pop();
        else { var bi = 0, bd = 9; free.forEach(function (s, i) { if (Math.abs(s - 0.5) < bd) { bd = Math.abs(s - 0.5); bi = i; } }); pick = free.splice(bi, 1)[0]; }
        if (pick == null) pick = 0.5;
        chars[kn] = { def: cast[kn], slotX: Math.round(pick * W), x: Math.round(pick * W), layer: null, layers: [], facing: 0, present: false, fallen: false, flying: false, fl: null, sitting: false, busy: [],
          row: row, ground: row ? groundY - Math.round(H * 0.07) : groundY, charH: charH * cast[kn].size * crowd * (row ? 0.85 : 1) };
      });
      var rowOf = new Map();

      function charLayer(kn) {
        var c = chars[kn];
        if (c.layer) return c.layer;
        var def = c.def, a = project.assets[def.pose], s = c.charH / (a ? a.height : 300);
        var L = Model.newLayer("image", { name: def.name, frames: [def.pose], base: { x: c.x, y: c.ground, rot: 0, sx: s * def.facing, sy: s, opacity: 1 } });
        L.anchor = { x: 0.5, y: 1 };
        L.frameSets = [];
        L.shadow = { y: c.ground };
        c.layer = L; c.layers.push(L); c.scale = s; c.facing = def.facing;
        rowOf.set(L, c.row);
        var atCenter = c.x <= W / 2 ? 1 : -1;      // sahne ortasına dönük başlar
        setFacing(kn, atCenter, 0, true);
        sc.layers.push(L);
        return L;
      }
      function setFacing(kn, dirSign, t, initial) {
        var c = chars[kn], want = dirSign * c.def.facing;   // görselin kendi yönüne göre işaret
        if (c.def.placeholder) { c.facing = dirSign; if (initial) c.layer.base.sx = Math.abs(c.scale); return; }   // simetrik yer tutucu: isim etiketi aynalanmasın
        if (initial) { c.layer.base.sx = Math.abs(c.scale) * want; c.facing = dirSign; return; }
        if (c.facing === dirSign) return;
        c.facing = dirSign;
        fx(c.layer, "jelly", Math.max(0, t - 0.04), t + 0.22, { strength: 9, speed: 4 });   // dönüşü satan küçük esneme
        var cur = M.trackValue(c.layer.tracks.sx, t, c.layer.base.sx);
        key(c.layer, "sx", Math.max(0, t - 0.01), cur, "step");
        key(c.layer, "sx", t, Math.abs(cur) * want, "step");
      }
      function ensurePresent(kn, t) {
        var c = chars[kn], L = charLayer(kn);
        if (c.present) return L;
        c.present = true;
        if (t > 0.05) { L.inPoint = Math.max(0, t - 0.3); fx(L, "fadeIn", L.inPoint, t); }
        fx(L, "breathe", L.inPoint || 0, null, { strength: 2, speed: 0.35 });
        return L;
      }
      function curX(kn, t) { var c = chars[kn]; if (!c.layer) return c.x; return M.trackValue(c.layer.tracks.x, t, c.layer.base.x); }
      /* Ses ipucu (sahne zamanı) */
      function cue(type, at, clip) {
        if (type !== "clip" && settings.sfx === false) return;
        var q = { t: Math.max(0, Math.round(at * 1000) / 1000), type: type };
        if (clip) q.clip = clip;
        sc.sfx.push(q);
      }
      /* Kamera anahtarı: ilk anahtar sahne başında temel değeri sabitler */
      function camKey(prop, at, v) { var tr = sc.camera.tracks[prop]; if (!tr.length && at > 1e-6) M.setKey(tr, 0, sc.camera.base[prop], "easeInOutQuad"); M.setKey(tr, at, v, "easeInOutQuad"); }
      function cameraAct(a, start, dur, lastSpeaker) {
        var cam = sc.camera, z0 = M.trackValue(cam.tracks.zoom, start, cam.base.zoom), x0 = M.trackValue(cam.tracks.x, start, cam.base.x), y0 = M.trackValue(cam.tracks.y, start, cam.base.y);
        var z = z0, x = x0, y = y0;
        if (a.act === "cam_out") { z = 1; x = 0.5; y = 0.5; }
        else if (a.act === "cam_in") {
          z = W < H ? 1.4 : 1.6;
          var tk = a.target ? norm(a.target) : lastSpeaker;
          if (tk && chars[tk]) { var c = chars[tk]; x = curX(tk, start + dur) / W; y = (c.ground - c.charH * 0.78) / H; }
          else { x = 0.5; y = 0.42; }
        } else {   // cam_pan
          if (z0 <= 1.001) z = 1.25;
          x = x0 + (a.to === "left" ? -0.15 : 0.15);
        }
        var hx = 0.5 / z, hy = 0.5 / z;
        x = Math.max(hx, Math.min(1 - hx, x)); y = Math.max(hy, Math.min(1 - hy, y));
        camKey("zoom", start, z0); camKey("x", start, x0); camKey("y", start, y0);
        camKey("zoom", start + dur, z); camKey("x", start + dur, x); camKey("y", start + dur, y);
      }
      function charW(kn) { var c = chars[kn], a = project.assets[c.def.pose]; return (a ? a.width : 240) * Math.abs(c.scale || 1); }
      function besideDist(kn, other, factor) { return (charW(kn) + charW(other)) / 2 * (factor || 1.05); }
      function moveTo(kn, nx, t0, dur, mode) {
        var c = chars[kn], L = c.layer;
        nx = Math.max(W * 0.06, Math.min(W * 0.94, Math.round(nx)));
        var from = curX(kn, t0);
        if (Math.abs(nx - from) < 2) return;
        setFacing(kn, nx > from ? 1 : -1, t0);
        key(L, "x", t0, from, "linear"); key(L, "x", t0 + dur, nx, mode === "run" ? "easeInOutQuad" : "linear");
        walkCycle(kn, t0, t0 + dur, mode === "run" ? 3.2 : 2.2, nx > from ? 1 : -1);
        if (mode === "run") puff(from, c.ground, t0, 0.7);
        c.x = nx;
      }
      function walkCycle(kn, a, b, stepsPerSec, dirSign) {
        var c = chars[kn], L = c.layer;
        fx(L, "wobble", a, b, { strength: 4, speed: stepsPerSec, bob: Math.round(8 * k) });
        fx(L, "lean", a, b, { angle: (dirSign || c.facing || 1) * (stepsPerSec > 3 ? 7 : 3), ramp: 0.25 });   // hareket yönüne öne eğilir
        if (c.def.walk.length >= 2) L.frameSets.push({ start: a, end: b, frames: [c.def.walk[0], c.def.pose, c.def.walk[1], c.def.pose].concat(c.def.walk.slice(2)), fps: stepsPerSec * 2 });   // temas–geçiş–temas–geçiş
        else if (c.def.walk.length) L.frameSets.push({ start: a, end: b, frames: [c.def.pose, c.def.walk[0]], fps: stepsPerSec * 2 });
        if (!c.flying) { var nStep = 0; for (var ts = a + 0.5 / stepsPerSec; ts < b && nStep < 16; ts += 1 / stepsPerSec, nStep++) cue("step", ts); }
        c.busy.push([a, b]);
      }
      /* Yerde toz bulutu (iniş, düşme, koşuya başlama) */
      function puff(x, y, at, scale) {
        var pid = genAsset("puff", "toz.png", drawPuff);
        var s = 0.32 * k * (scale || 1);
        var L = Model.newLayer("image", { name: "Toz", frames: [pid], base: { x: Math.round(x), y: Math.round(y) + 4, rot: 0, sx: s, sy: s, opacity: 0.85 } });
        L.anchor = { x: 0.5, y: 0.85 }; L.inPoint = Math.max(0, at); L.outPoint = at + 0.5;
        key(L, "sx", at, s * 0.5, "easeOutQuad"); key(L, "sx", at + 0.5, s * 1.4, "easeOutQuad");
        key(L, "sy", at, s * 0.5, "easeOutQuad"); key(L, "sy", at + 0.5, s * 1.1, "easeOutQuad");
        fx(L, "fadeOut", at + 0.15, at + 0.5);
        sc.layers.push(L);
      }
      /* Konuşma: ağız kareleri gerçek ses zarfına (klip) ya da metnin hece ritmine göre dizilir; duygu karesi varsa kapalı ağız odur */
      function talk(kn, a, b, emotion, text, mouth) {
        var c = chars[kn], L = c.layer, def = c.def, emoImg = def.emotions[emotion];
        c.busy.push([a, b]);
        if (def.talk.length) {
          var fps = 12, need = Math.max(2, Math.ceil((b - a) * fps));
          var seq = (mouth && mouth.length) ? mouth : mouthPattern(text || "", b - a, fps, hash(kn + ":" + a.toFixed(2)));
          var closed = emoImg || def.pose, open1 = def.talk[0], open2 = def.talk[1] || def.talk[0], frames = [];
          // Jestler: duygu karesi yoksa, 1 sn'den uzun repliklerde cümle/öbek başlarında el-kol hareketi (en çok 3)
          var gest = [];
          if (!emoImg && def.jest.length && (b - a) >= 1.0 && text) {
            var clauses = [], pos = 0, total = text.length;
            String(text).split(/(?<=[,.;:!?…])\s+/).forEach(function (cl) { var st = text.indexOf(cl, pos); if (st < 0) st = pos; clauses.push({ f: st / total, len: cl.length / total }); pos = st + cl.length; });
            clauses.slice(0, 3).forEach(function (cl, ci) {
              var g = def.jest[(hash(kn + ":" + a.toFixed(1) + ":" + ci) + ci) % def.jest.length];
              var gs = a + cl.f * (b - a) + 0.05, ge = Math.min(b - 0.1, gs + Math.min(1.1, Math.max(0.5, cl.len * (b - a) * 0.8)));
              if (ge > gs + 0.3) gest.push({ s: gs, e: ge, g: g });
            });
          }
          for (var i = 0; i < need; i++) {
            var lv = i < seq.length ? seq.charCodeAt(i) - 48 : 0, tt = a + (i + 0.5) / fps, gw = null;
            for (var gi2 = 0; gi2 < gest.length; gi2++) if (tt >= gest[gi2].s && tt < gest[gi2].e) { gw = gest[gi2].g; break; }
            frames.push(gw ? (lv <= 0 ? gw[0] : gw[1]) : (lv <= 0 ? closed : lv === 1 ? open1 : open2));
          }
          L.frameSets.push({ start: a, end: b, frames: frames, fps: fps });
          if (!emoImg) fx(L, "talk", a, b, { strength: Math.round(1.5 * k), speed: 5 });   // hafif baş kıpırtısı
        } else {
          if (emoImg) L.frameSets.push({ start: a, end: b, frames: [emoImg], fps: 1 });
          fx(L, "talk", a, b, { strength: Math.round(4 * k), speed: 5 });
        }
        emote(kn, emotion, a, b);
      }
      function emote(kn, emotion, a, b) {
        var L = chars[kn].layer;
        if (!emotion) return;
        if (emotion === "mutlu") fx(L, "bounce", a, b, { strength: Math.round(base * 0.03), speed: 1.6, squash: 25 });
        else if (emotion === "uzgun") { fx(L, "lean", a, b, { angle: -7, ramp: 0.5 }); fx(L, "float", a, b, { strength: Math.round(3 * k), speed: 0.6, tilt: 0 }); }
        else if (emotion === "kizgin") { fx(L, "shake", a, b, { strength: Math.round(5 * k), speed: 1.3 }); fx(L, "lean", a, b, { angle: 4, ramp: 0.3 }); }
        else if (emotion === "saskin") { fx(L, "jelly", a, Math.min(b, a + 0.9), { strength: 14, speed: 2.5 }); fx(L, "bounce", a, Math.min(b, a + 0.8), { strength: Math.round(base * 0.025), speed: 1.2, squash: 15 }); }
        else if (emotion === "korkmus") { fx(L, "shake", a, b, { strength: Math.round(3 * k), speed: 2.2 }); fx(L, "lean", a, b, { angle: -5, ramp: 0.3 }); }
        else if (emotion === "dusunceli") { fx(L, "lean", a, b, { angle: 3, ramp: 0.4 }); }
        else if (emotion === "yorgun") { fx(L, "lean", a, b, { angle: -4, ramp: 0.6 }); }
      }
      function bubble(kn, text, a, b, emotion) {
        var c = chars[kn], cx = curX(kn, a), headTop = c.ground - c.charH;
        var bubbleColor = settings.bubbleStyle === "color" ? hsl(hash(kn) % 360, 70, 90) : "#ffffff";
        var size = emotion === "fisilti" ? Math.round(bubbleFont * 0.85) : emotion === "kizgin" ? Math.round(bubbleFont * 1.12) : bubbleFont;
        var L = textLayer("Replik · " + c.def.name + ": " + text.slice(0, 22) + (text.length > 22 ? "…" : ""), text, {
          start: a, end: b, anchor: { x: 0.5, y: 1 },
          base: { x: cx, y: headTop - Math.round(base * 0.015), rot: ((hash(text) % 5) - 2) * 0.7, sx: 1, sy: 1, opacity: 1 },
          text: { size: size, bubbleColor: bubbleColor, color: "#1b1f2a", bubble: true, bubbleTail: "left", weight: emotion === "kizgin" ? "700" : "700" }
        });
        var sz = R.layerSize(L, project);
        var half = sz.w / 2 + 8;
        var bx = Math.max(half, Math.min(W - half, cx + (cx < W / 2 ? sz.w * 0.18 : -sz.w * 0.18)));
        L.base.x = Math.round(bx);
        L.base.y = Math.max(sz.h + 8, L.base.y);
        L.text.bubbleTail = cx <= bx ? "left" : "right";
        fx(L, "popIn", a, a + 0.28); fx(L, "fadeOut", Math.max(a + 0.3, b - 0.25), b);
        fx(L, "float", a, b, { strength: Math.round(3 * k), speed: 0.5, tilt: 0.6 });
        cue("pop", a);
        sc.layers.push(L);
        return L;
      }
      function caption(text, a, b, small) {
        var L = textLayer("Anlatıcı: " + text.slice(0, 22), text, { start: a, end: b, anchor: { x: 0.5, y: 1 },
          base: { x: W / 2, y: H * 0.965, rot: 0, sx: 1, sy: 1, opacity: 1 },
          text: { size: Math.round(bubbleFont * (small ? 0.8 : 0.95)), font: fonts[0].id, color: "#ffffff", bubble: true, bubbleColor: "rgba(10,14,24,0.72)", bubbleTail: "none", maxWidth: Math.round(W * 0.8), weight: "400" } });
        fx(L, "fadeIn", a, a + 0.3); fx(L, "fadeOut", Math.max(a + 0.3, b - 0.3), b);
        L.hud = true;   // alt yazı kameradan etkilenmez
        sc.layers.push(L);
      }
      function thought(kn, text, a, b) {
        var c = chars[kn], L = textLayer("Düşünce · " + c.def.name, text, { start: a, end: b, anchor: { x: 0.5, y: 1 },
          base: { x: curX(kn, a) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.35, y: c.ground - c.charH - 6, rot: 0, sx: 1, sy: 1, opacity: 1 },
          text: { size: Math.round(bubbleFont * 1.1), color: "#5b6b7a", bubble: false, weight: "700" } });
        fx(L, "fadeIn", a, a + 0.3); fx(L, "float", a, b, { strength: Math.round(6 * k), speed: 0.7, tilt: 2 }); fx(L, "fadeOut", Math.max(a + 0.3, b - 0.3), b);
        sc.layers.push(L);
      }

      /* Baştan sahnede olanlar */
      order.forEach(function (kn) { if (!firstInfo[kn].enters) ensurePresent(kn, 0); });
      var t = 0.7, lastSpeaker = null, usedCam = false, dialogueCount = 0, beats = [], looks = [];
      if (settings.headings !== false && sa.place) {
        var hd = textLayer("Sahne başlığı", (sa.place + (sa.time ? " · " + TIME_LABEL[sa.time] : "")).toLocaleUpperCase("tr"), { start: 0, end: 2.8, anchor: { x: 0, y: 0 },
          base: { x: Math.round(W * 0.03), y: Math.round(H * 0.045), rot: 0, sx: 1, sy: 1, opacity: 1 },
          text: { size: Math.round(base * 0.03), font: fonts[0].id, color: "#ffffff", stroke: "rgba(0,0,0,.6)", strokeWidth: Math.round(3 * k), bubble: false, weight: "700", maxWidth: Math.round(W * 0.8) } });
        fx(hd, "fadeIn", 0, 0.35); fx(hd, "fadeOut", 2.3, 2.8);
        hd.hud = true;
        sc.layers.push(hd);
      }

      sa.items.forEach(function (it) {
        if (it.type === "dialogue" || it.type === "narration") {
          var chunks = splitLine(it.text, bubbleChars);
          if (it.type === "narration") {
            chunks.forEach(function (ch) {
              var nclip = clipFor(narratorVoice, voNarStyle, "", ch), d = nclip ? Math.max(1.2, nclip.duration + 0.45) : lineDuration(ch, speed);
              caption(ch, t, t + d);
              if (nclip) cue("clip", t + 0.1, nclip.key);
              t += d + 0.3;
            });
            return;
          }
          var kn = norm(it.who);
          if (!cast[kn]) return;
          ensurePresent(kn, t);
          var emotion = emotionOf(it.emotion) || emotionOf(it.text.length < 40 ? "" : "");
          if (it.emotion && !emotion) warnings.push("Satır " + it.line + ": “(" + it.emotion + ")” duygusu tanınmadı.");
          // Konuşan karakter dinleyiciye döner
          if (lastSpeaker && lastSpeaker !== kn && chars[lastSpeaker].present) {
            setFacing(kn, curX(lastSpeaker, t) > curX(kn, t) ? 1 : -1, t);
            setFacing(lastSpeaker, curX(kn, t) > curX(lastSpeaker, t) ? 1 : -1, t);
          }
          if (lastSpeaker && lastSpeaker !== kn && chars[lastSpeaker].present && chars[lastSpeaker].layer) fx(chars[lastSpeaker].layer, "swing", t, t + 0.7, { strength: 2, speed: 1.4 });   // dinleyen hafifçe başını sallar
          dialogueCount++;
          var listeners = Object.keys(chars).filter(function (o) { return o !== kn && chars[o].present && chars[o].layer; });
          chunks.forEach(function (ch) {
            var clip = clipFor(chars[kn].def.voiceId, voStyle, emotion, ch);
            var d = clip ? Math.max(1.2, clip.duration + 0.5) : lineDuration(ch, speed) * (emotion === "fisilti" ? 1.15 : 1);
            bubble(kn, ch, t, t + d, emotion);
            if (clip) { cue("clip", t + 0.1, clip.key); talk(kn, t + 0.1, t + 0.1 + clip.duration, emotion, ch, clip.mouth); }
            else talk(kn, t + 0.1, t + d - 0.2, emotion, ch);
            var bang = /!\s*$/.test(ch);
            if (!emotion) {
              if (bang) fx(chars[kn].layer, "bounce", t, t + 0.7, { strength: Math.round(base * 0.018), speed: 1.4, squash: 12 });
              else if (/\?\s*$/.test(ch)) fx(chars[kn].layer, "lean", t, t + d, { angle: 3, ramp: 0.4 });
            }
            // Dinleyiciler: ünlemde irkilme, öfkede geri çekilme, üzüntüde yaklaşma
            beats.push({ t: t, x: curX(kn, t) / W });
            listeners.forEach(function (o) {
              var right = curX(o, t) > curX(kn, t);
              if (chars[o].def.look && !chars[o].def.placeholder) looks.push({ kn: o, a: t, b: t + d });
              if (bang) fx(chars[o].layer, "jelly", t + 0.25, t + 0.6, { strength: 7, speed: 3 });
              if (emotion === "kizgin") fx(chars[o].layer, "lean", t, t + d, { angle: right ? 3 : -3, ramp: 0.4 });
              else if (emotion === "uzgun") fx(chars[o].layer, "lean", t, t + d, { angle: right ? -2 : 2, ramp: 0.6 });
            });
            t += d + 0.3;
          });
          lastSpeaker = kn;
          return;
        }
        var a = it.a || analyzeAction(it.text, names, []);
        var subs = (a.all ? order.map(function (kn) { return cast[kn].name; }) : a.subjects).map(norm).filter(function (kn) { return chars[kn]; });
        if (!subs.length && lastSpeaker && a.act && a.act !== "wait") subs = [lastSpeaker];
        var start = a.simultaneous ? Math.max(0, t - (it.prevDur || 1.2)) : t;
        var dur = a.seconds || ACTION_DUR[a.act] || 1.2;
        if (a.speed === "fast") dur *= 0.7; else if (a.speed === "slow") dur *= 1.6;
        if (!a.act) { warnings.push("Satır " + it.line + ": “" + it.text + "” anlaşılamadı; " + dur.toFixed(1) + " sn bekleme olarak işlendi."); t = start + dur; return; }
        if (a.camera) {
          if (a.target && !chars[norm(a.target)]) warnings.push("Satır " + it.line + ": kamera hedefi “" + a.target + "” bu sahnede yok.");
          cameraAct(a, start, dur, lastSpeaker); usedCam = true;
          t = start + dur * 0.5;   // kamera hareketi sıradaki replikle örtüşür
          return;
        }
        if (!subs.length && a.act !== "wait") {
          var cand = candidateName(it.text);
          warnings.push("Satır " + it.line + ": “" + it.text + "” kimin yaptığı anlaşılamadı." + (cand ? " “" + cand + "” bir karakterse 1. adımda ekle." : ""));
          t = start + dur; return;
        }
        var group = null;
        if (a.act === "exit" && subs.length > 1) {
          var gdir = a.dir || (subs.reduce(function (sum, q) { return sum + curX(q, start); }, 0) / subs.length < W / 2 ? "left" : "right");
          if (gdir === "left" || gdir === "right") {
            var common = 0;
            subs.forEach(function (q) { common = Math.max(common, charW(q) / 2 + (gdir === "left" ? curX(q, start) : W - curX(q, start)) + 24); });
            group = { dir: gdir, dist: common };
          }
        }
        subs.forEach(function (kn) {
          var c = chars[kn], L;
          switch (a.act) {
            case "enter": {
              L = charLayer(kn);
              var dir = a.dir || (c.slotX < W / 2 ? "left" : "right");
              c.present = true; L.inPoint = start;
              fx(L, "slideIn", start, start + dur, { dir: dir, easing: a.speed === "fast" ? "easeOutQuad" : "easeOutCubic" });
              walkCycle(kn, start, start + dur, a.speed === "fast" ? 3.2 : 2.2, dir === "left" ? 1 : dir === "right" ? -1 : 0);
              fx(L, "bounce", start + dur - 0.05, start + dur + 0.35, { strength: Math.round(base * 0.012), speed: 2.5, squash: 10 });   // varışta yerine oturma
              if (kn === subs[0]) cue("whoosh", start);
              if (dir === "left" || dir === "right") { setFacing(kn, dir === "left" ? 1 : -1, start, !L.tracks.sx.length); setFacing(kn, c.x <= W / 2 ? 1 : -1, start + dur); }
              fx(L, "breathe", start + dur, null, { strength: 2, speed: 0.35 });
              break;
            }
            case "exit": case "hide": {
              L = ensurePresent(kn, start);
              if (a.act === "hide") { fx(L, "fadeOut", start, start + dur); }
              else {
                var dir2 = group ? group.dir : (a.dir || (curX(kn, start) < W / 2 ? "left" : "right"));
                if (group) {
                  // Birlikte çıkanlar aynı hızda yürür: ortak mesafe, kimse kimseyi yakalamaz
                  var x0 = curX(kn, start);
                  key(L, "x", start, x0, a.speed === "fast" ? "easeInQuad" : "linear");
                  key(L, "x", start + dur, x0 + (group.dir === "left" ? -group.dist : group.dist), "linear");
                } else fx(L, "slideOut", start, start + dur, { dir: dir2, easing: a.speed === "fast" ? "easeInQuad" : "easeInCubic" });
                walkCycle(kn, start, start + dur, a.speed === "fast" ? 3.2 : 2.2, dir2 === "left" ? -1 : dir2 === "right" ? 1 : 0);
                if (kn === subs[0]) cue("whoosh", start + dur * 0.3);
                if (dir2 === "left" || dir2 === "right") setFacing(kn, dir2 === "left" ? -1 : 1, start);
              }
              L.outPoint = start + dur; c.present = false; c.layer = null; c.x = c.slotX;   // yeniden girerse yeni katman
              break;
            }
            case "walk": case "run": {
              ensurePresent(kn, start);
              var step = (a.act === "run" ? 0.34 : 0.24) * W, dx = a.to === "left" ? -step : a.to === "right" ? step : (c.facing >= 0 ? step : -step);
              if (a.to === "top" || a.to === "bottom") { key(c.layer, "y", start, M.trackValue(c.layer.tracks.y, start, c.ground)); key(c.layer, "y", start + dur, c.ground + (a.to === "top" ? -H * 0.12 : H * 0.04)); walkCycle(kn, start, start + dur, 2.2); }
              else moveTo(kn, curX(kn, start) + dx, start, dur, a.act);
              break;
            }
            case "walk_to": {
              ensurePresent(kn, start);
              var tk = a.target ? norm(a.target) : null;
              if (tk && chars[tk] && chars[tk].present) { var tx = curX(tk, start), side = curX(kn, start) < tx ? -1 : 1; moveTo(kn, tx + side * besideDist(kn, tk, 1.05), start, dur, a.speed === "fast" ? "run" : "walk"); }
              else moveTo(kn, curX(kn, start) + (c.facing >= 0 ? 1 : -1) * W * 0.2, start, dur, "walk");
              break;
            }
            case "jump": {
              ensurePresent(kn, start); fx(c.layer, "bounce", start, start + dur, { strength: Math.round(base * 0.09), speed: 1.25, squash: 35 });
              if (start > 0.25) { var sy0 = M.trackValue(c.layer.tracks.sy, start, c.layer.base.sy); key(c.layer, "sy", start - 0.22, sy0, "easeInQuad"); key(c.layer, "sy", start - 0.05, sy0 * 0.86, "easeOutQuad"); key(c.layer, "sy", start + 0.08, sy0, "easeOutQuad"); }   // hazırlık: çömelme
              for (var lt = start + 0.8; lt <= start + dur + 0.01; lt += 0.8) puff(curX(kn, lt), c.ground, lt - 0.05, 0.9);   // her inişte toz
              if (kn === subs[0]) cue("boing", start + 0.05); break;
            }
            case "spin": ensurePresent(kn, start); fx(c.layer, "spin", start, start + dur, { speed: 1 / dur, dir: "cw" }); break;
            case "turn": ensurePresent(kn, start); setFacing(kn, -c.facing || -1, start + 0.1); break;
            case "fall": {
              L = ensurePresent(kn, start);
              key(L, "rot", start, M.trackValue(L.tracks.rot, start, 0)); key(L, "rot", start + dur, c.facing >= 0 ? 82 : -82, "easeOutBounce");
              puff(curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.35, c.ground, start + dur * 0.7, 1.1);
              if (kn === subs[0]) cue("thud", start + dur * 0.75);
              c.fallen = true; break;
            }
            case "rise": {
              L = ensurePresent(kn, start);
              if (c.fallen) { key(L, "rot", start, M.trackValue(L.tracks.rot, start, 0)); key(L, "rot", start + dur, 0, "easeInOutQuad"); c.fallen = false; }
              if (c.sitting) { key(L, "sy", start, M.trackValue(L.tracks.sy, start, c.scale)); key(L, "sy", start + dur, c.scale, "easeOutBack"); c.sitting = false; }
              break;
            }
            case "fly": {
              L = ensurePresent(kn, start);
              key(L, "y", start, M.trackValue(L.tracks.y, start, c.ground)); key(L, "y", start + dur, c.ground - H * 0.32, "easeInOutQuad");
              c.fl = fx(L, "float", start + dur, null, { strength: Math.round(10 * k), speed: 0.7, tilt: 3 }); c.flying = true; break;
            }
            case "land": {
              L = ensurePresent(kn, start);
              key(L, "y", start, M.trackValue(L.tracks.y, start, c.ground)); key(L, "y", start + dur, c.ground, "easeOutBounce");
              if (c.fl) { c.fl.end = start; c.fl = null; } c.flying = false; break;
            }
            case "wave": ensurePresent(kn, start); fx(c.layer, "swing", start, start + dur, { strength: 6, speed: 2.5 }); break;
            case "laugh": ensurePresent(kn, start); fx(c.layer, "bounce", start, start + dur, { strength: Math.round(base * 0.02), speed: 3, squash: 20 }); break;
            case "cry": ensurePresent(kn, start); fx(c.layer, "lean", start, start + dur, { angle: -8, ramp: 0.4 }); fx(c.layer, "shake", start, start + dur, { strength: Math.round(2 * k), speed: 1.5 }); break;
            case "angry": ensurePresent(kn, start); fx(c.layer, "shake", start, start + dur, { strength: Math.round(7 * k), speed: 1.2 }); fx(c.layer, "jelly", start, start + dur, { strength: 8, speed: 2 }); break;
            case "surprise": ensurePresent(kn, start); fx(c.layer, "jelly", start, start + dur, { strength: 18, speed: 2.5 }); fx(c.layer, "bounce", start, start + Math.min(dur, 0.9), { strength: Math.round(base * 0.03), speed: 1.1, squash: 20 }); break;
            case "fear": ensurePresent(kn, start); fx(c.layer, "shake", start, start + dur, { strength: Math.round(4 * k), speed: 2.2 }); fx(c.layer, "lean", start, start + dur, { angle: -6, ramp: 0.3 }); break;
            case "dance": ensurePresent(kn, start); fx(c.layer, "wobble", start, start + dur, { strength: 10, speed: 2, bob: Math.round(base * 0.02) }); fx(c.layer, "jelly", start, start + dur, { strength: 10, speed: 2 }); break;
            case "sit": { L = ensurePresent(kn, start); key(L, "sy", start, M.trackValue(L.tracks.sy, start, c.scale)); key(L, "sy", start + dur, c.scale * 0.8, "easeOutQuad"); c.sitting = true; break; }
            case "sleep": { ensurePresent(kn, start); c.sleepFx = fx(c.layer, "lean", start, null, { angle: -12, ramp: 0.8 }); thought(kn, "Zzz", start + 0.5, start + dur + 2.5); break; }
            case "wake": { L = ensurePresent(kn, start); if (c.sleepFx) { c.sleepFx.end = start + 0.4; c.sleepFx = null; } fx(L, "jelly", start, start + dur, { strength: 12, speed: 2.5 }); if (c.fallen) { key(L, "rot", start, M.trackValue(L.tracks.rot, start, 0)); key(L, "rot", start + dur, 0); c.fallen = false; } break; }
            case "lie": { L = ensurePresent(kn, start); key(L, "rot", start, M.trackValue(L.tracks.rot, start, 0)); key(L, "rot", start + dur, c.facing >= 0 ? -80 : 80, "easeInOutQuad"); c.fallen = true; break; }
            case "hug": {
              ensurePresent(kn, start);
              var hk = a.target ? norm(a.target) : null;
              if (hk && chars[hk] && chars[hk].present) {
                var hx = curX(hk, start), hside = curX(kn, start) < hx ? -1 : 1;
                moveTo(kn, hx + hside * besideDist(kn, hk, 0.62), start, Math.max(0.5, dur - 0.6), "walk");
                fx(c.layer, "lean", start + dur - 0.6, start + dur + 1.2, { angle: hside < 0 ? 8 : -8, ramp: 0.3 });
                fx(chars[hk].layer, "lean", start + dur - 0.4, start + dur + 1.2, { angle: hside < 0 ? -6 : 6, ramp: 0.3 });
              } else fx(c.layer, "lean", start, start + dur, { angle: 6, ramp: 0.3 });
              break;
            }
            case "back": ensurePresent(kn, start); moveTo(kn, curX(kn, start) - (c.facing >= 0 ? 1 : -1) * W * 0.1, start, dur, "walk"); setFacing(kn, c.facing >= 0 ? 1 : -1, start + dur); break;
            case "clap": ensurePresent(kn, start); fx(c.layer, "pulse", start, start + dur, { strength: 10, speed: 3 }); if (kn === subs[0]) cue("clap", start + 0.1); break;
            case "bark": { ensurePresent(kn, start); var nb = norm(it.text), say = /miyav/.test(nb) ? "Miyav!" : /civil|cik cik/.test(nb) ? "Cik cik!" : /kukre|bogur/.test(nb) ? "Grrr!" : "Hav hav!";
              fx(c.layer, "talk", start, start + dur, { strength: Math.round(5 * k), speed: 5 }); fx(c.layer, "bounce", start, start + Math.min(dur, 0.8), { strength: Math.round(base * 0.015), speed: 2.5, squash: 12 }); thought(kn, say, start, start + dur + 0.4); if (kn === subs[0]) cue("pop", start); break; }
            case "sing": { ensurePresent(kn, start); fx(c.layer, "talk", start, start + dur, { strength: Math.round(5 * k), speed: 3 }); fx(c.layer, "float", start, start + dur, { strength: Math.round(6 * k), speed: 0.8, tilt: 4 }); thought(kn, "♪ ♫", start, start + dur); break; }
            case "slide": { ensurePresent(kn, start); var sdx = (a.to === "left" ? -1 : a.to === "right" ? 1 : (c.facing >= 0 ? 1 : -1)) * W * 0.3; var sfrom = curX(kn, start), sto = Math.max(W * 0.06, Math.min(W * 0.94, sfrom + sdx)); setFacing(kn, sto > sfrom ? 1 : -1, start); key(c.layer, "x", start, sfrom, "easeOutCubic"); key(c.layer, "x", start + dur, sto, "easeOutCubic"); fx(c.layer, "lean", start, start + dur, { angle: sto > sfrom ? -10 : 10, ramp: 0.2 }); c.x = sto; break; }
            case "swim": { ensurePresent(kn, start); fx(c.layer, "float", start, start + dur, { strength: Math.round(8 * k), speed: 1.2, tilt: 6 }); moveTo(kn, curX(kn, start) + (a.to === "left" ? -1 : 1) * W * 0.2, start, dur, "walk"); break; }
            case "yawn": ensurePresent(kn, start); fx(c.layer, "lean", start, start + dur, { angle: -6, ramp: 0.5 }); fx(c.layer, "breathe", start, start + dur, { strength: 6, speed: 1 / dur }); break;
            case "throw": ensurePresent(kn, start); fx(c.layer, "swing", start, start + dur, { strength: 12, speed: 1 / dur }); fx(c.layer, "lean", start, start + dur, { angle: c.facing >= 0 ? 8 : -8, ramp: 0.2 }); break;
            case "catch": ensurePresent(kn, start); fx(c.layer, "jelly", start, start + dur, { strength: 14, speed: 3 }); break;
            case "think": { ensurePresent(kn, start); fx(c.layer, "lean", start, start + dur, { angle: 3, ramp: 0.4 }); thought(kn, "…", start, start + dur); break; }
            case "look": { ensurePresent(kn, start); var lk = a.target ? norm(a.target) : null; if (lk && chars[lk] && chars[lk].present) setFacing(kn, curX(lk, start) > curX(kn, start) ? 1 : -1, start); else if (a.to === "left" || a.to === "right") setFacing(kn, a.to === "left" ? -1 : 1, start); break; }
            case "grow": case "shrink": { L = ensurePresent(kn, start); var f = a.act === "grow" ? 1.35 : 0.7, sx0 = M.trackValue(L.tracks.sx, start, L.base.sx), sy0 = M.trackValue(L.tracks.sy, start, L.base.sy);
              key(L, "sx", start, sx0); key(L, "sy", start, sy0); key(L, "sx", start + dur, sx0 * f, "easeOutBack"); key(L, "sy", start + dur, sy0 * f, "easeOutBack"); c.scale *= f; break; }
            case "nod": ensurePresent(kn, start); fx(c.layer, "swing", start, start + dur, { strength: 3, speed: 2.5 }); break;
            case "shake_head": ensurePresent(kn, start); fx(c.layer, "wobble", start, start + dur, { strength: 5, speed: 3, bob: 0 }); break;
            case "wait": default: break;
          }
          if (a.act !== "wait") c.busy.push([start, start + dur]);
          if (a.emotion && a.act !== "wait") emote(kn, a.emotion, start, start + dur);
        });
        if (!a.simultaneous) t = start + dur + (a.act === "wait" ? 0 : 0.15);
      });
      sc.duration = Math.round((t + 0.9) * project.fps) / project.fps;
      /* Kamera ipucu yoksa: konuşmalı sahnede yavaş, fark edilmeyen bir yaklaşma (sinema hissi) */
      if (!usedCam && dialogueCount >= 2) {
        var z0a = W < H ? 1.02 : 1.03, z1a = W < H ? 1.04 : 1.06;
        camKey("zoom", 0, z0a); camKey("y", 0, 0.5); camKey("zoom", sc.duration, z1a); camKey("y", sc.duration, 0.515);
        camKey("x", 0, 0.5);
        beats.forEach(function (bt, bi) {   // konuşana doğru fark edilmeyen kayma
          var zt = z0a + (z1a - z0a) * (bt.t / sc.duration), lim = (0.5 - 0.5 / zt) * 0.85, target = Math.max(0.5 - lim, Math.min(0.5 + lim, 0.5 + (bt.x - 0.5) * 0.12));
          var prevT = bi ? beats[bi - 1].t : 0;
          camKey("x", Math.max(prevT + 0.05, bt.t - 0.6), M.trackValue(sc.camera.tracks.x, Math.max(prevT + 0.05, bt.t - 0.6), sc.camera.base.x));
          camKey("x", bt.t + 0.6, target);
        });
      }
      /* Dinleyenler konuşana bakar (yana bakış karesi), yürüme ve eylem pencereleri dışında */
      looks.forEach(function (lk) {
        var c = chars[lk.kn];
        c.layers.forEach(function (L) {
          var a0 = L.inPoint || 0, a1 = L.outPoint == null ? sc.duration : L.outPoint;
          if (lk.b <= a0 || lk.a >= a1) return;
          var busy = c.busy.some(function (w) { return lk.a < w[1] && lk.b > w[0]; });
          if (!busy) L.frameSets.push({ start: Math.max(a0, lk.a), end: Math.min(a1, lk.b), frames: [c.def.look], fps: 1 });
        });
      });
      /* Ortam: kuşlar, kelebekler, ateşböcekleri, yapraklar, kuyruklu yıldız (yalnızca çizilen arka planlarda) */
      if (!userBg) {
        var amb = [], sseed = hash("amb:" + sa.index + ":" + sa.place);
        function rnd01(tag) { return (hash(sseed + ":" + tag) % 1000) / 1000; }
        function addAmb(L) { amb.push(L); }
        var night = time === "gece";
        if (outdoor && !night && sc.duration > 4) {   // kuş geçişleri
          var b0 = genAsset("bird:0", "kus-1.png", function () { return drawBird(true); }), b1 = genAsset("bird:1", "kus-2.png", function () { return drawBird(false); });
          for (var tb0 = 1.5 + rnd01("b") * 2.5, pass = 0; tb0 < sc.duration - 2.5 && pass < 4; tb0 += 7 + rnd01("bp" + pass) * 4, pass++) {
            var ltr = rnd01("bd" + pass) > 0.5, T = 5 + rnd01("bt" + pass) * 2, sy = H * (0.1 + rnd01("by" + pass) * 0.18), bs = (0.45 + rnd01("bs" + pass) * 0.3) * k;
            var BL = Model.newLayer("image", { name: "Kuş", frames: [b0, b1], frameFps: 5, base: { x: ltr ? -W * 0.08 : W * 1.08, y: sy, rot: 0, sx: (ltr ? 1 : -1) * bs, sy: bs, opacity: 0.9 } });
            BL.inPoint = tb0; BL.outPoint = tb0 + T;
            key(BL, "x", tb0, ltr ? -W * 0.08 : W * 1.08, "linear"); key(BL, "x", tb0 + T, ltr ? W * 1.08 : -W * 0.08, "linear");
            fx(BL, "float", tb0, tb0 + T, { strength: Math.round(10 * k), speed: 0.8, tilt: 2 });
            BL.parallax = 0.9;
            addAmb(BL);
          }
        }
        if ((kind === "kir" || kind === "orman") && !night) {   // kelebekler
          for (var bi = 0; bi < 2; bi++) {
            var hue = [330, 45, 200, 280][(sseed + bi) % 4];
            var f0 = genAsset("bfly:" + hue + ":0", "kelebek-" + hue + "-1.png", (function (hh) { return function () { return drawButterfly(true, hh); }; })(hue));
            var f1 = genAsset("bfly:" + hue + ":1", "kelebek-" + hue + "-2.png", (function (hh) { return function () { return drawButterfly(false, hh); }; })(hue));
            var fs0 = (0.3 + rnd01("fs" + bi) * 0.15) * k;
            var FL = Model.newLayer("image", { name: "Kelebek", frames: [f0, f1], frameFps: 9, base: { x: W * (0.15 + rnd01("fx" + bi) * 0.7), y: H * (0.5 + rnd01("fy" + bi) * 0.25), rot: 0, sx: fs0, sy: fs0, opacity: 0.95 } });
            fx(FL, "float", 0, null, { strength: Math.round(16 * k), speed: 0.9 + rnd01("fv" + bi) * 0.4, tilt: 8 });
            fx(FL, "drift", 0, null, { speed: 5 + rnd01("fd" + bi) * 4, dir: bi ? "left" : "right", wrap: "yes" });
            addAmb(FL);
          }
        }
        if (outdoor && night && kind !== "uzay") {   // ateşböcekleri
          var gid = genAsset("glow", "isik.png", drawGlow);
          for (var gi = 0; gi < 6; gi++) {
            var gs = (0.25 + rnd01("gs" + gi) * 0.25) * k;
            var GL = Model.newLayer("image", { name: "Ateşböceği", frames: [gid], base: { x: W * (0.05 + rnd01("gx" + gi) * 0.9), y: H * (0.45 + rnd01("gy" + gi) * 0.4), rot: 0, sx: gs, sy: gs, opacity: 0.85 } });
            fx(GL, "float", 0, null, { strength: Math.round(14 * k), speed: 0.5 + rnd01("gv" + gi) * 0.5, tilt: 0 });
            fx(GL, "pulse", 0, null, { strength: 70, speed: 0.5 + rnd01("gp" + gi) * 0.8 });
            addAmb(GL);
          }
        }
        if (night || kind === "uzay") {   // yıldız parıltısı
          var sid = genAsset("glow", "isik.png", drawGlow);
          for (var si = 0; si < 5; si++) {
            var ss = (0.18 + rnd01("ss" + si) * 0.14) * k;
            var SL = Model.newLayer("image", { name: "Parıltı", frames: [sid], base: { x: W * (0.05 + rnd01("sx" + si) * 0.9), y: H * (0.05 + rnd01("sy" + si) * 0.3), rot: 0, sx: ss, sy: ss, opacity: 0.9 } });
            fx(SL, "pulse", 0, null, { strength: 90, speed: 0.35 + rnd01("sp" + si) * 0.6 });
            SL.parallax = 0.75;
            addAmb(SL);
          }
        }
        if (kind === "uzay" || (night && kind === "dag")) {   // kuyruklu yıldız
          var cid2 = genAsset("comet", "kuyruklu.png", drawComet);
          for (var tc = 2 + rnd01("c") * 4, cp = 0; tc < sc.duration - 1.5 && cp < 3; tc += 9 + rnd01("cp" + cp) * 5, cp++) {
            var cs0 = (0.5 + rnd01("cs" + cp) * 0.3) * k, cy0 = H * (0.05 + rnd01("cy" + cp) * 0.25);
            var CL = Model.newLayer("image", { name: "Kuyruklu yıldız", frames: [cid2], base: { x: -W * 0.1, y: cy0, rot: 12, sx: cs0, sy: cs0, opacity: 0.95 } });
            CL.inPoint = tc; CL.outPoint = tc + 1.3;
            key(CL, "x", tc, W * 1.1, "linear"); key(CL, "x", tc + 1.3, -W * 0.15, "linear");
            key(CL, "y", tc, cy0, "linear"); key(CL, "y", tc + 1.3, cy0 + H * 0.28, "linear");
            fx(CL, "fadeOut", tc + 0.9, tc + 1.3);
            addAmb(CL);
          }
        }
        if (outdoor && !night && (kind === "orman" || time === "aksam") && kind !== "deniz") {   // düşen yapraklar
          for (var li2 = 0; li2 < 3; li2++) {
            var lh = [28, 40, 15][li2 % 3], lid = genAsset("leaf:" + lh, "yaprak-" + lh + ".png", (function (hh) { return function () { return drawLeaf(hh); }; })(lh));
            var ls0 = (0.5 + rnd01("ls" + li2) * 0.3) * k, lx = W * (0.1 + rnd01("lx" + li2) * 0.8), LT = 7 + rnd01("lt" + li2) * 3, t0l = rnd01("l0" + li2) * LT;
            var LL = Model.newLayer("image", { name: "Yaprak", frames: [lid], base: { x: lx, y: -H * 0.05, rot: 0, sx: ls0, sy: ls0, opacity: 0.95 } });
            for (var cyc = -1; (cyc + 1) * LT - t0l < sc.duration + LT; cyc++) {
              var ya = cyc * LT + (LT - t0l), yb = ya + LT;
              if (yb < 0) continue;
              M.setKey(LL.tracks.y, Math.max(0, ya), ya < 0 ? -H * 0.05 + (H * 0.97) * (-ya / LT) : -H * 0.05, "linear");
              M.setKey(LL.tracks.y, yb, H * 0.92, "step");
              M.setKey(LL.tracks.y, yb + 0.02, -H * 0.05, "linear");
            }
            fx(LL, "float", 0, null, { strength: Math.round(28 * k), speed: 0.45 + rnd01("lv" + li2) * 0.2, tilt: 30 });
            addAmb(LL);
          }
        }
        if (amb.length) { var args = [ambientAt, 0].concat(amb); Array.prototype.splice.apply(sc.layers, args); }
      }
      /* Kıpırdanma: boş anlarda ufak ağırlık değişimi / baş eğme (konuşma ve eylem pencereleri dışında) */
      Object.keys(chars).forEach(function (kn) {
        var c = chars[kn], g = 0;
        c.layers.forEach(function (L, li) {
          var a0 = (L.inPoint || 0) + 1.5, a1 = (L.outPoint == null ? sc.duration : L.outPoint) - 1;
          var tf = a0 + (hash("fid:" + kn + ":" + sa.index + ":" + li) % 100) / 100 * 2;
          while (tf < a1 && g < 60) {
            var busy = c.busy.some(function (w) { return tf < w[1] + 0.25 && tf + 1.2 > w[0] - 0.25; });
            if (!busy) {
              var kindF = hash(kn + ":k" + g) % 3;
              if (kindF === 0) fx(L, "lean", tf, tf + 1.2, { angle: (g % 2 ? 2.5 : -2.5), ramp: 0.5 });
              else if (kindF === 1) fx(L, "bounce", tf, tf + 0.6, { strength: Math.round(base * 0.006), speed: 1.6, squash: 6 });
              else fx(L, "swing", tf, tf + 0.9, { strength: 1.5, speed: 1.2 });
            }
            tf += 3.5 + ((hash(kn + ":f" + g) % 100) / 100) * 2.5; g++;
          }
        });
      });
      /* Göz kırpma: 2,4–4,6 sn aralıklarla 0,13 sn; yürürken kırpılmaz */
      Object.keys(chars).forEach(function (kn) {
        var c = chars[kn];
        if (!c.def.blink.length) return;
        c.layers.forEach(function (L, li) {
          var a0 = L.inPoint || 0, a1 = L.outPoint == null ? sc.duration : L.outPoint, seed = hash(kn + ":" + sa.index + ":" + li);
          var tb = a0 + 1.2 + (seed % 100) / 100 * 1.5, g = 0;
          var walkSets = L.frameSets.filter(function (fs) { return fs.frames.some(function (f) { return c.def.walk.indexOf(f) >= 0; }); });
          while (tb + 0.13 < a1 && g < 300) {
            var walking = walkSets.some(function (fs) { return tb < fs.end && tb + 0.13 > fs.start; });
            if (!walking) L.frameSets.push({ start: Math.round(tb * 1000) / 1000, end: Math.round((tb + 0.13) * 1000) / 1000, frames: [c.def.blink[0]], fps: 1 });
            tb += 2.4 + ((hash(kn + ":" + g) % 100) / 100) * 2.2; g++;
          }
        });
      });
      /* Arka sıradaki karakterler ön sıranın altına çizilir (katman sırası) */
      if (twoRows) {
        var idx = [], ls = [];
        sc.layers.forEach(function (L, i) { if (rowOf.has(L)) { idx.push(i); ls.push(L); } });
        ls.sort(function (A, B) { return rowOf.get(B) - rowOf.get(A); });
        idx.forEach(function (i, j) { sc.layers[i] = ls[j]; });
      }
      M.setKey(bgL.tracks.sx, 0, bgL.base.sx, "linear"); M.setKey(bgL.tracks.sy, 0, bgL.base.sy, "linear");
      M.setKey(bgL.tracks.sx, sc.duration, pushIn ? cover * 1.05 : cover, "linear"); M.setKey(bgL.tracks.sy, sc.duration, pushIn ? cover * 1.05 : cover, "linear");
      var isLast = sa.index === ast.scenes.length;
      if (isLast) fade(sc, "iris", 0.8); else fade(sc, scenes.length % 2 ? "wipe" : "fade", 0.5);
      scenes.push(sc);
    });

    if (settings.endCard !== false) {
      var es = Model.newScene("Son", 2.4);
      es.background = { type: "gradient", color: "#0b1020", color2: "#000000", angle: 180, assetId: null };
      var son = textLayer("SON", "SON", { base: { x: W / 2, y: H / 2, rot: 0, sx: 1, sy: 1, opacity: 1 },
        text: { size: Math.round(base * 0.18), font: fonts[2].id, color: "#ffffff", stroke: "#7b2fff", strokeWidth: Math.round(6 * k), bubble: false, maxWidth: W } });
      fx(son, "zoomIn", 0, 0.8);
      if (settings.sfx !== false) es.sfx.push({ t: 0.1, type: "sparkle" });
      es.layers.push(son);
      scenes.push(es);
    }
    if (!scenes.length) throw new Error("Üretilecek sahne yok.");
    // Son sahnenin geçişi yok
    scenes[scenes.length - 1].transition = { type: "none", duration: 0.5 };
    // Artık kullanılmayan seslendirme kliplerini temizle (seslendirme açıkken; kapalıyken klipler saklanır)
    if (voiceOn && project.clips) Object.keys(project.clips).forEach(function (kk) { if (!clipsUsed[kk]) delete project.clips[kk]; });
    // Artık kullanılmayan üretilmiş görselleri temizle
    Object.keys(project.assets).forEach(function (id) { var a = project.assets[id]; if (a.genKey && !genUsed[id] && !castUsed[id]) delete project.assets[id]; });
    var total = scenes.reduce(function (s, x) { return s + x.duration; }, 0);
    return { scenes: scenes, warnings: warnings, stats: { scenes: scenes.length, lines: stats.lines, actions: stats.actions, narrations: stats.narrations, seconds: total, layers: scenes.reduce(function (s, x) { return s + x.layers.length; }, 0), voiced: Object.keys(clipsUsed).length } };
  }

  var SAMPLE = [
    "BAŞLIK: Kayıp Top",
    "YAZAN: Sen",
    "",
    "SAHNE 1 - PARK - GÜNDÜZ",
    "Ali soldan girer.",
    "ALİ: Topum nerede? Sabahtan beri arıyorum.",
    "Karabaş sağdan koşarak gelir.",
    "Karabaş havlar.",
    "ALİ (şaşkın): Karabaş! Topumu sen mi aldın?",
    "Ayşe sağdan girer.",
    "AYŞE (mutlu): Ali! Bak, Karabaş topunu bulmuş!",
    "Kamera Ayşe'ye yaklaşır.",
    "AYŞE: Bankın altındaydı. Hadi oynayalım!",
    "Kamera uzaklaşır.",
    "Ali zıplar.",
    "Herkes sağa çıkar.",
    "",
    "SAHNE 2 - PARK - AKŞAM",
    "ANLATICI: Akşam olunca Dede torunlarını almaya geldi.",
    "Dede soldan yavaşça girer.",
    "Ali ve Ayşe sağdan girer.",
    "DEDE: Hava kararıyor çocuklar. Eve dönme vakti.",
    "ALİ (üzgün): Biraz daha oynayamaz mıyız?",
    "Kamera Dede'ye yaklaşır.",
    "DEDE (mutlu): Yarın yine geliriz. Söz!",
    "Kamera uzaklaşır.",
    "Ayşe el sallar.",
    "Ali gülümser.",
    "Herkes sola çıkar."
  ].join("\n");

  var HELP = [
    "SAHNE 1 - PARK - GÜNDÜZ        → yeni sahne; mekân ve zaman (GÜNDÜZ, GECE, AKŞAM, SABAH)",
    "ALİ: Merhaba!                 → replik; balon Ali'nin başının üstünde çıkar",
    "AYŞE (mutlu): Hoş geldin!      → parantez içi duygu: mutlu, üzgün, kızgın, şaşkın, korkmuş, fısıltı, düşünceli, yorgun",
    "ANLATICI: Bir zamanlar...      → alt yazı (karaktersiz)",
    "Ali soldan girer.              → eylem; girer, çıkar, yürür, koşar, zıplar, döner, düşer, kalkar, uçar, iner,",
    "                                 el sallar, güler, ağlar, kızar, şaşırır, korkar, dans eder, oturur, uyur, düşünür,",
    "                                 bakar, büyür, küçülür, saklanır, bekler. Yön: sağdan/soldan, sağa/sola.",
    "Ali Ayşe'ye doğru yürür.       → hedefe yürür.   Ali ve Ayşe sola çıkar. → birlikte.   Herkes zıplar.",
    "2 saniye bekler.               → süre.   BAŞLIK: Film adı   YAZAN: Adınız   → açılış kartı",
    "Kamera Ayşe'ye yaklaşır.       → yakın çekim.   Kamera uzaklaşır. → genel plan.   Kamera sağa kayar. → kaydırma",
    "Karabaş havlar.                → hayvan sesi balonu (havlar, miyavlar, cıvıldar). Herkes ... → sahnedeki tüm karakterler"
  ].join("\n");

  return { parse: parse, analyze: analyze, analyzeAction: analyzeAction, splitLine: splitLine, lineDuration: lineDuration, emotionOf: emotionOf,
    placeKind: placeKind, build: build, metrics: metrics, voiceKey: voiceKey, voiceLines: voiceLines, mouthPattern: mouthPattern, SAMPLE: SAMPLE, HELP: HELP, norm: norm, titleCase: titleCase };
});
