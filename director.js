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

  var WEATHER_WORDS = [["yagmurlu", "yagmur"], ["yagmur", "yagmur"], ["saganak", "yagmur"], ["yagisli", "yagmur"], ["karli", "kar"], ["kar yagisi", "kar"], ["kar", "kar"], ["tipi", "kar"],
    ["ruzgarli", "ruzgar"], ["ruzgar", "ruzgar"], ["firtinali", "firtina"], ["firtina", "firtina"], ["gok gurultulu", "firtina"], ["simsekli", "firtina"], ["yildirimli", "firtina"], ["sisli", "sis"], ["sis", "sis"]];
  function splitHeading(s) {
    var parts = String(s || "").split(/\s+[-–—|]\s+|\s*[,/]\s*|\s+-\s+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var time = "", weather = "", place = [];
    parts.forEach(function (p) {
      var n = norm(p), hit = null, w = null;
      for (var i = 0; i < TIME_WORDS.length; i++) if (n === TIME_WORDS[i][0] || n.indexOf(TIME_WORDS[i][0]) === 0 && n.length - TIME_WORDS[i][0].length <= 2) { hit = TIME_WORDS[i][1]; break; }
      for (var j = 0; j < WEATHER_WORDS.length && !w; j++) if (n === WEATHER_WORDS[j][0]) w = WEATHER_WORDS[j][1];
      if (hit && !time) time = hit;
      else if (w && !weather) weather = w;
      else {
        if (!weather) for (var q = 0; q < WEATHER_WORDS.length; q++) if (new RegExp("\\b" + WEATHER_WORDS[q][0] + "\\b").test(n)) { weather = WEATHER_WORDS[q][1]; break; }
        place.push(p);
      }
    });
    return { place: place.join(" ").replace(/^[-–—:.\s]+|[-–—:.\s]+$/g, ""), time: time, weather: weather };
  }

  /* ── Ayrıştırma ────────────────────────────────────────────── */
  function parse(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var ast = { title: "", author: "", scenes: [], speakers: [] };
    var scene = null, speakerSet = {};
    function newScene(place, time, raw, weather) { scene = { index: ast.scenes.length + 1, place: place || "", time: time || "", weather: weather || "", heading: raw || "", items: [] }; ast.scenes.push(scene); }
    function addSpeaker(name) { var k = norm(name); if (!speakerSet[k]) { speakerSet[k] = true; ast.speakers.push(name); } }
    lines.forEach(function (raw, li) {
      var line = raw.trim(), m;
      if (!line || /^(\/\/|#)/.test(line)) return;
      if ((m = line.match(/^(BAŞLIK|BASLIK|FİLM|FILM|FİLMİN ADI|AD)\s*:\s*(.+)$/i))) { ast.title = m[2].trim(); return; }
      if ((m = line.match(/^(YAZAN|YAZAR|SENARYO|SENARİST|SENARIST)\s*:\s*(.+)$/i))) { ast.author = m[2].trim(); return; }
      if ((m = line.match(/^(SAHNE|BÖLÜM|BOLUM|SCENE)\b\s*(\d+)?\s*[-–—:.]?\s*(.*)$/i))) { var h = splitHeading(m[3]); newScene(h.place, h.time, line, h.weather); return; }
      if ((m = line.match(/^(İÇ|IC|DIŞ|DIS|INT|EXT)\.?\s*[-–—:]?\s*(.+)$/i))) { var h2 = splitHeading(m[2]); newScene(h2.place, h2.time, line, h2.weather); return; }
      // Tamamı büyük harf, iki nokta yok, cümle değil → sahne başlığı ("PARK - GÜNDÜZ")
      if (!/:/.test(line) && line.length >= 3 && line === line.toLocaleUpperCase("tr") && /[A-ZÇĞİÖŞÜ]/.test(line) && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 8) {
        var h3 = splitHeading(line); newScene(h3.place, h3.time, line, h3.weather); return;
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
    ["knock", /\b(kapi (?:[a-z]+ )?(calar|calinir|calindi|vurulur|vuruldu|tiklanir|tiklandi|caliyor)|kapiyi (calar|caldi|vurur|vurdu)|tak tak)\b/],   // "Kapı çalar.", "Kapı yine çalar.", "Kapı zili çalar."
    ["ring", /\b((telefon|telefonu|cep telefonu|zil|alarm|saat|calar saat) (?:[a-z]+ )?(calar|caldi|caliyor|oter|otuyor|ottu)|zirr|cin cin|telefon sesi)\b/],   // "Telefon çalar.", "Ali'nin telefonu ısrarla çalar."
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
    ["fisilti", /fisilt|fisild|sessizce|alcak sesle|kisik|usulca|kulagina/],
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
    var prop = /\bkartop/.test(n) ? "kartopu" : /\btop(u|unu|a|la|uyla)?\b/.test(n) ? "top" : /\belma/.test(n) ? "elma" : /\btas(i|ini|la)?\b/.test(n) ? "tas" : null;
    return { act: act, subjects: subjects, all: all, target: target, dir: dir || (act === "enter" ? null : to), to: to, speed: speed,
      seconds: sec ? parseFloat(sec[1].replace(",", ".")) : null, emotion: emotionOf(text), simultaneous: simultaneous, prop: prop };
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
          if (!a.subjects.length && !a.all && a.act !== "wait" && !a.camera && a.act !== "knock" && a.act !== "ring") {
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
  var ACTION_DUR = { knock: 1.3, ring: 1.6, enter: 1.1, exit: 1.0, walk: 1.6, walk_to: 1.6, run: 1.0, jump: 1.6, spin: 1.0, turn: 0.4, fall: 0.8, rise: 0.6, fly: 1.4, land: 1.0, wave: 1.4,
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
  var OVERCAST = { gunduz: ["#7f8ea3", "#c7d0db"], sabah: ["#9aa6b5", "#d8d2c8"], aksam: ["#6f6f88", "#c9a98f"], gece: ["#0b1a3a", "#1b2f5e"] };
  var STORM = { gunduz: ["#3f4a5c", "#8c97a8"], sabah: ["#4d5566", "#9c9ea8"], aksam: ["#39394d", "#8a7278"], gece: ["#05091a", "#101a33"] };
  /* Katmanlı arka plan: gökyüzü (paralaks 0,6), uzak (0,75), orta (0,9), ağaçlar (0,93), zemin (1,0).
     Kamera yaklaşıp kayarken katmanlar farklı hızda hareket eder (derinlik); rüzgârda ağaç katmanı sallanır. */
  function drawBackgroundLayers(kind, time, W, H, weather, detail) {
    var overcast = weather === "yagmur" || weather === "kar" || weather === "sis" || weather === "firtina";
    var sky = (weather === "firtina" ? STORM[time] : overcast ? OVERCAST[time] : SKY[time]) || SKY.gunduz, night = time === "gece", k = H / 720;
    var ground = night ? "#223a2a" : time === "aksam" ? "#5f9a3f" : overcast ? "#5fa848" : "#6cc04a";
    var ground2 = night ? "#1a2d21" : time === "aksam" ? "#4e8534" : overcast ? "#45923a" : "#4ea838";
    var farCol = night ? "#2b3f6e" : time === "aksam" ? "#b07c86" : overcast ? "#8a9bb0" : "#8fc1e8";
    var farCol2 = night ? "#223457" : time === "aksam" ? "#8e6677" : overcast ? "#7a8ca2" : "#79b0dc";
    var leaf = night ? "#1f4d2e" : time === "aksam" ? "#3f8a4a" : "#3aa660", leaf2 = night ? "#17402a" : time === "aksam" ? "#2e6e3a" : "#2e8b57", trunk = "#6b4a2b";
    var layers = [];
    function L(key, parallax, draw) { var c = canvas(W, H), x = c.getContext("2d"); draw(x); layers.push({ key: key, parallax: parallax, canvas: c }); }
    function star(x, n) { x.fillStyle = "rgba(255,255,255,.85)"; for (var i = 0; i < n; i++) { var sx = (hash("s" + i) % 1000) / 1000 * W, sy = (hash("t" + i) % 1000) / 1000 * H * 0.6; x.beginPath(); x.arc(sx, sy, (i % 3) * 0.6 + 0.8, 0, 7); x.fill(); } }
    function ell(x, cx, cy, rx, ry, col) { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); }
    function roundTree(x, tx, ty, s) {
      x.fillStyle = trunk; x.fillRect(tx - 7 * s, ty - 70 * s, 14 * s, 70 * s);
      ell(x, tx, ty - 95 * s, 46 * s, 42 * s, leaf2); ell(x, tx - 16 * s, ty - 110 * s, 32 * s, 30 * s, leaf); ell(x, tx + 18 * s, ty - 104 * s, 30 * s, 28 * s, leaf);
      x.fillStyle = "rgba(255,255,255,.12)"; x.beginPath(); x.ellipse(tx - 10 * s, ty - 118 * s, 18 * s, 10 * s, -0.4, 0, 7); x.fill();
    }
    function pine(x, tx, ty, th, i) {
      x.fillStyle = trunk; x.fillRect(tx - 9 * k, ty - th * 0.45, 18 * k, th * 0.45);
      [1, 0.78, 0.56].forEach(function (f, j) { x.fillStyle = (i + j) % 2 ? leaf : leaf2; x.beginPath(); x.moveTo(tx, ty - th * (0.35 + 0.65 * f)); x.lineTo(tx - 58 * k * f, ty - th * (0.35 + 0.65 * f) + th * 0.42 * f); x.lineTo(tx + 58 * k * f, ty - th * (0.35 + 0.65 * f) + th * 0.42 * f); x.closePath(); x.fill(); });
    }
    function flowers(x, n, y0) { for (var i = 0; i < n; i++) { var fx0 = (hash("fl" + i) % 1000) / 1000 * W, fy = y0 + (hash("fy" + i) % 100) / 100 * H * 0.06; x.strokeStyle = "#3f8a4a"; x.lineWidth = 2 * k; x.beginPath(); x.moveTo(fx0, fy + 10 * k); x.lineTo(fx0, fy); x.stroke(); x.fillStyle = ["#ff6b6b", "#ffd166", "#f78fb3", "#ffffff"][i % 4]; x.beginPath(); x.arc(fx0, fy, 4 * k, 0, 7); x.fill(); x.fillStyle = "#ffe066"; x.beginPath(); x.arc(fx0, fy, 1.5 * k, 0, 7); x.fill(); } }
    function lamp(x, lx, ly) { x.fillStyle = "#3b3f49"; x.fillRect(lx - 4 * k, ly - 190 * k, 8 * k, 190 * k); x.fillRect(lx - 16 * k, ly - 200 * k, 32 * k, 12 * k); x.fillStyle = night ? "#ffe9a6" : "#dfe6ee"; x.beginPath(); x.arc(lx, ly - 206 * k, 12 * k, 0, 7); x.fill(); if (night) { x.fillStyle = "rgba(255,233,166,.18)"; x.beginPath(); x.moveTo(lx - 14 * k, ly - 200 * k); x.lineTo(lx + 14 * k, ly - 200 * k); x.lineTo(lx + 70 * k, ly); x.lineTo(lx - 70 * k, ly); x.closePath(); x.fill(); } }

    /* 1) Gökyüzü */
    L("sky", 0.6, function (x) {
      if (kind === "uzay") { x.fillStyle = "#05070f"; x.fillRect(0, 0, W, H); star(x, 160); x.fillStyle = "#6c5ce7"; x.beginPath(); x.arc(W * 0.78, H * 0.3, 90 * k, 0, 7); x.fill(); x.strokeStyle = "#a29bfe"; x.lineWidth = 10 * k; x.beginPath(); x.ellipse(W * 0.78, H * 0.3, 150 * k, 40 * k, -0.3, 0, 7); x.stroke(); return; }
      if (kind === "ic") {
        var okul = detail === "okul";
        x.fillStyle = okul ? (night ? "#2f3a4a" : "#e6efe4") : night ? "#3b3550" : "#f3e6cf"; x.fillRect(0, 0, W, H);
        if (!okul) { x.fillStyle = night ? "#332d46" : "#e7d7bb"; for (var sw = 0; sw < W; sw += 120 * k) x.fillRect(sw, 0, 60 * k, H); }   // duvar kâğıdı şeritleri
        else { x.fillStyle = night ? "#263040" : "#cfdccb"; x.fillRect(0, H * 0.62, W, H * 0.16); }   // sınıf: lambri
        x.fillStyle = "#8b5a2b"; x.fillRect(W * 0.12, H * 0.16, W * 0.26, H * 0.36);
        var wg = x.createLinearGradient(0, H * 0.18, 0, H * 0.5); wg.addColorStop(0, sky[0]); wg.addColorStop(1, sky[1]);
        x.fillStyle = wg; x.fillRect(W * 0.135, H * 0.18, W * 0.23, H * 0.32);
        if (!night) { x.fillStyle = "rgba(255,255,255,.85)"; x.beginPath(); x.ellipse(W * 0.2, H * 0.27, 30 * k, 14 * k, 0, 0, 7); x.fill(); }
        x.fillStyle = "#8b5a2b"; x.fillRect(W * 0.245, H * 0.18, 8 * k, H * 0.32); x.fillRect(W * 0.135, H * 0.33, W * 0.23, 8 * k);
        x.fillStyle = night ? "#5a4e6e" : "#c9a86a"; x.fillRect(W * 0.1, H * 0.515, W * 0.3, 10 * k);   // pervaz
        return;
      }
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
      if (night) { star(x, 90); x.fillStyle = "#fff6c7"; x.beginPath(); x.arc(W * 0.82, H * 0.18, 48 * k, 0, 7); x.fill(); x.fillStyle = sky[0]; x.beginPath(); x.arc(W * 0.85, H * 0.16, 44 * k, 0, 7); x.fill(); }
      else if (!overcast) { x.fillStyle = time === "aksam" ? "#ffb347" : "#ffe27a"; x.beginPath(); x.arc(W * 0.8, H * 0.2, 56 * k, 0, 7); x.fill(); x.fillStyle = "rgba(255,240,180,.25)"; x.beginPath(); x.arc(W * 0.8, H * 0.2, 80 * k, 0, 7); x.fill(); }
    });
    /* 2) Uzak */
    L("far", 0.75, function (x) {
      if (kind === "kir") { ell(x, W * 0.2, H * 0.86, W * 0.42, H * 0.17, farCol); ell(x, W * 0.62, H * 0.88, W * 0.48, H * 0.2, farCol2); ell(x, W * 0.95, H * 0.9, W * 0.35, H * 0.15, farCol); }
      else if (kind === "orman") { for (var i = 0; i < 16; i++) { var tx = (i + 0.5) / 16 * W, th = (90 + (hash("ft" + i) % 60)) * k; x.fillStyle = i % 2 ? farCol2 : farCol; x.beginPath(); x.moveTo(tx, H * 0.78 - th); x.lineTo(tx - 40 * k, H * 0.8); x.lineTo(tx + 40 * k, H * 0.8); x.closePath(); x.fill(); } x.fillStyle = farCol2; x.fillRect(0, H * 0.79, W, H * 0.06); }
      else if (kind === "sehir") { for (var b = 0; b < 20; b++) { var bw = W / 20, bh = (60 + (hash("fb" + b) % 160)) * k; x.fillStyle = b % 2 ? farCol : farCol2; x.fillRect(b * bw + 2, H * 0.84 - bh, bw - 4, bh); } }
      else if (kind === "deniz") {
        x.fillStyle = night ? "#123d63" : overcast ? "#5f86a8" : "#3a9ad9"; x.fillRect(0, H * 0.62, W, H * 0.22);
        if (!night && !overcast) { x.fillStyle = "rgba(255,240,180,.35)"; for (var r2 = 0; r2 < 7; r2++) x.fillRect(W * 0.8 - (26 - r2 * 3) * k, H * (0.63 + r2 * 0.02), (52 - r2 * 6) * k, 5 * k); }
        x.fillStyle = night ? "#0a1a2c" : "#f5f5f5"; x.beginPath(); x.moveTo(W * 0.3, H * 0.65); x.lineTo(W * 0.3, H * 0.59); x.lineTo(W * 0.335, H * 0.65); x.closePath(); x.fill();   // yelkenli
        x.fillStyle = "#5a3825"; x.fillRect(W * 0.285, H * 0.65, W * 0.06, 6 * k);
      }
      else if (kind === "dag") {
        x.fillStyle = night ? "#2a3350" : "#7d8da8"; x.beginPath(); x.moveTo(-W * 0.1, H * 0.9); x.lineTo(W * 0.25, H * 0.28); x.lineTo(W * 0.55, H * 0.9); x.closePath(); x.fill();
        x.fillStyle = "#ffffff"; x.beginPath(); x.moveTo(W * 0.25, H * 0.28); x.lineTo(W * 0.19, H * 0.39); x.lineTo(W * 0.31, H * 0.39); x.closePath(); x.fill();
        x.fillStyle = night ? "#1f2740" : "#5f6f8e"; x.beginPath(); x.moveTo(W * 0.4, H * 0.9); x.lineTo(W * 0.72, H * 0.2); x.lineTo(W * 1.1, H * 0.9); x.closePath(); x.fill();
        x.fillStyle = "#ffffff"; x.beginPath(); x.moveTo(W * 0.72, H * 0.2); x.lineTo(W * 0.64, H * 0.36); x.lineTo(W * 0.8, H * 0.36); x.closePath(); x.fill();
      }
      else if (kind === "uzay") { x.fillStyle = "#b8c0cc"; x.beginPath(); x.arc(W * 0.18, H * 0.22, 34 * k, 0, 7); x.fill(); x.fillStyle = "#98a2b0"; [[-10, -8, 8], [12, 6, 6], [-4, 14, 5]].forEach(function (cr) { x.beginPath(); x.arc(W * 0.18 + cr[0] * k, H * 0.22 + cr[1] * k, cr[2] * k, 0, 7); x.fill(); }); }
      else if (kind === "ic") {
        if (detail === "okul") {   // sınıf: kara tahta, tebeşir yazısı, duvar saati
          x.fillStyle = "#8b5a2b"; x.fillRect(W * 0.5, H * 0.16, W * 0.3, H * 0.28); x.fillStyle = "#2f5d3a"; x.fillRect(W * 0.512, H * 0.175, W * 0.276, H * 0.23);
          x.fillStyle = "#c9a86a"; x.fillRect(W * 0.5, H * 0.44, W * 0.3, 8 * k);
          x.strokeStyle = "rgba(255,255,255,.8)"; x.lineWidth = 3 * k; x.lineCap = "round";
          x.beginPath(); x.moveTo(W * 0.53, H * 0.22); x.lineTo(W * 0.66, H * 0.22); x.moveTo(W * 0.53, H * 0.27); x.lineTo(W * 0.72, H * 0.27); x.moveTo(W * 0.53, H * 0.32); x.lineTo(W * 0.62, H * 0.32); x.stroke();
          x.font = "bold " + Math.round(26 * k) + "px sans-serif"; x.fillStyle = "rgba(255,255,255,.85)"; x.fillText("1 + 1 = 2", W * 0.64, H * 0.385);
          x.fillStyle = "#f5f5f5"; x.beginPath(); x.arc(W * 0.9, H * 0.2, 22 * k, 0, 7); x.fill(); x.strokeStyle = "#333333"; x.lineWidth = 3 * k; x.beginPath(); x.arc(W * 0.9, H * 0.2, 22 * k, 0, 7); x.stroke();
          x.beginPath(); x.moveTo(W * 0.9, H * 0.2); x.lineTo(W * 0.9, H * 0.2 - 14 * k); x.moveTo(W * 0.9, H * 0.2); x.lineTo(W * 0.9 + 10 * k, H * 0.2 + 5 * k); x.stroke();
        } else {
          x.fillStyle = "#c0392b"; x.fillRect(W * 0.62, H * 0.2, W * 0.16, H * 0.2); x.fillStyle = "#f9e79f"; x.fillRect(W * 0.635, H * 0.22, W * 0.13, H * 0.16);
          x.fillStyle = "#2e86c1"; x.beginPath(); x.arc(W * 0.7, H * 0.32, 22 * k, 0, 7); x.fill();
        }
        x.fillStyle = "#8b5a2b"; x.fillRect(W * 0.82, H * 0.3, W * 0.14, H * 0.48);   // kitaplık
        for (var sh = 0; sh < 4; sh++) { var sy2 = H * (0.33 + sh * 0.11); x.fillStyle = "#6b4a2b"; x.fillRect(W * 0.825, sy2 + H * 0.085, W * 0.13, 6 * k); for (var bk = 0; bk < 6; bk++) { x.fillStyle = ["#e63946", "#457b9d", "#f4a261", "#2a9d8f", "#9b5de5", "#ffd166"][(bk + sh) % 6]; x.fillRect(W * (0.83 + bk * 0.02), sy2 + H * 0.015, W * 0.016, H * 0.07); } }
      }
    });
    /* 3) Orta */
    L("mid", 0.9, function (x) {
      if (kind === "kir" || kind === "dag" || kind === "orman") { ell(x, W * 0.25, H * 0.98, W * 0.5, H * 0.26, ground); ell(x, W * 0.78, H * 1.02, W * 0.55, H * 0.3, ground2); }
      if (kind === "kir") {
        flowers(x, 18, H * 0.82);
        if (detail === "park") { var bx0 = W * 0.72, by0 = H * 0.9; x.fillStyle = "#8b5a2b"; x.fillRect(bx0, by0 - 46 * k, 150 * k, 10 * k); x.fillRect(bx0, by0 - 30 * k, 150 * k, 10 * k); x.fillRect(bx0 + 6 * k, by0 - 22 * k, 10 * k, 22 * k); x.fillRect(bx0 + 134 * k, by0 - 22 * k, 10 * k, 22 * k); x.fillStyle = "#5a3825"; x.fillRect(bx0 + 10 * k, by0 - 70 * k, 6 * k, 48 * k); x.fillRect(bx0 + 134 * k, by0 - 70 * k, 6 * k, 48 * k); x.fillRect(bx0 + 10 * k, by0 - 70 * k, 130 * k, 10 * k); }
      } else if (kind === "orman") { for (var bu = 0; bu < 6; bu++) { var bx2 = (bu + 0.5) / 6 * W + ((hash("bu" + bu) % 80) - 40) * k; ell(x, bx2, H * 0.9, 42 * k, 26 * k, bu % 2 ? leaf : leaf2); } }
      else if (kind === "sehir") {
        for (var b = 0; b < 12; b++) { var bw = W / 12, bh = (120 + (hash("b" + b) % 220)) * k, bx = b * bw;
          x.fillStyle = night ? "#1c2740" : overcast ? "#8d97a8" : (b % 2 ? "#9aa5b8" : "#b7c0d0"); x.fillRect(bx + 4, H * 0.9 - bh, bw - 8, bh);
          x.fillStyle = night ? "#ffe9a6" : "#e8f1ff";
          for (var wy = H * 0.9 - bh + 18 * k; wy < H * 0.88; wy += 32 * k) for (var wx = bx + 14 * k; wx < bx + bw - 18 * k; wx += 26 * k) if (hash("w" + b + wx + wy) % 3) x.fillRect(wx, wy, 12 * k, 16 * k); }
        lamp(x, W * 0.18, H * 0.9); lamp(x, W * 0.82, H * 0.9);
      } else if (kind === "deniz") {
        x.fillStyle = night ? "#0f3b5c" : overcast ? "#4d7a9c" : "#2f8fd6"; x.fillRect(0, H * 0.7, W, H * 0.2);
        x.strokeStyle = "rgba(255,255,255,.45)"; x.lineWidth = 3 * k;
        for (var r = 0; r < 5; r++) { x.beginPath(); for (var px = 0; px <= W; px += 20) x.lineTo(px, H * (0.72 + r * 0.04) + Math.sin(px / (40 * k) + r) * 4 * k); x.stroke(); }
        ell(x, W * 0.08, H * 0.9, 60 * k, 26 * k, "#6b7280"); ell(x, W * 0.14, H * 0.91, 36 * k, 18 * k, "#8d99ae");
      }
    });
    /* 4) Ağaçlar (rüzgârda sallanır) */
    if (kind === "kir" || kind === "orman" || kind === "dag") L("trees", 0.93, function (x) {
      if (kind === "kir") [[0.08, 0.95], [0.5, 0.8], [0.9, 1.05]].forEach(function (tp, i) { roundTree(x, W * tp[0], H * 0.905, tp[1] * k * (detail === "park" && i === 1 ? 0.9 : 1)); });
      else if (kind === "orman") for (var i = 0; i < 9; i++) { var tx = (i + 0.5) / 9 * W + ((hash("tr" + i) % 40) - 20) * k, th = (170 + (hash("th" + i) % 90)) * k; pine(x, tx, H * 0.9, th, i); }
      else [[0.1, 150], [0.55, 120], [0.92, 160]].forEach(function (tp, i) { pine(x, W * tp[0], H * 0.9, tp[1] * k, i); });
    });
    /* 5) Zemin */
    L("ground", 1, function (x) {
      if (kind === "kir" || kind === "dag" || kind === "orman") {
        x.fillStyle = ground2; x.fillRect(0, H * 0.9, W, H * 0.1);
        if (kind === "kir") { x.fillStyle = night ? "#3a3326" : "#e9d8a6"; x.fillRect(0, H * 0.905, W, H * 0.045); x.fillStyle = "rgba(0,0,0,.12)"; for (var pb = 0; pb < 14; pb++) { x.beginPath(); x.ellipse((hash("pb" + pb) % 1000) / 1000 * W, H * (0.915 + (hash("pq" + pb) % 100) / 100 * 0.025), 5 * k, 3 * k, 0, 0, 7); x.fill(); } }
        if (kind === "orman") { for (var m = 0; m < 4; m++) { var mx = (hash("m" + m) % 1000) / 1000 * W, my = H * 0.93; x.fillStyle = "#f1e6d0"; x.fillRect(mx - 4 * k, my - 10 * k, 8 * k, 12 * k); x.fillStyle = "#e63946"; x.beginPath(); x.ellipse(mx, my - 10 * k, 12 * k, 7 * k, 0, 0, 7); x.fill(); x.fillStyle = "#fff"; x.beginPath(); x.arc(mx - 4 * k, my - 12 * k, 2 * k, 0, 7); x.arc(mx + 4 * k, my - 11 * k, 1.5 * k, 0, 7); x.fill(); } }
        x.fillStyle = "rgba(0,0,0,.08)"; x.fillRect(0, H * 0.9, W, 3 * k);
      } else if (kind === "sehir") { x.fillStyle = night ? "#2c2f36" : "#6b7280"; x.fillRect(0, H * 0.9, W, H * 0.1); x.fillStyle = night ? "#3a3f4a" : "#9aa3ad"; x.fillRect(0, H * 0.9, W, H * 0.025); x.fillStyle = "#f5f5f5"; for (var d = 0; d < W; d += 80 * k) x.fillRect(d, H * 0.955, 40 * k, 6 * k); }
      else if (kind === "deniz") { x.fillStyle = night ? "#8a7a55" : "#f1deab"; x.beginPath(); x.ellipse(W * 0.5, H * 1.05, W * 0.75, H * 0.2, 0, 0, 7); x.fill(); x.fillStyle = "#f8c8dc"; for (var sh2 = 0; sh2 < 5; sh2++) { var sx2 = (hash("sh" + sh2) % 1000) / 1000 * W; x.beginPath(); x.moveTo(sx2, H * 0.95); x.lineTo(sx2 - 6 * k, H * 0.95 - 8 * k); x.lineTo(sx2 + 6 * k, H * 0.95 - 8 * k); x.closePath(); x.fill(); } }
      else if (kind === "uzay") { x.fillStyle = "#5b6b7a"; x.beginPath(); x.ellipse(W * 0.5, H * 1.05, W * 0.8, H * 0.22, 0, 0, 7); x.fill(); x.fillStyle = "#4a5866"; [[0.3, 0.93, 40], [0.6, 0.96, 26], [0.8, 0.92, 18]].forEach(function (cr) { x.beginPath(); x.ellipse(W * cr[0], H * cr[1], cr[2] * k, cr[2] * 0.4 * k, 0, 0, 7); x.fill(); }); }
      else if (detail === "okul") { x.fillStyle = night ? "#2d3340" : "#d6dbe3"; x.fillRect(0, H * 0.78, W, H * 0.22); x.fillStyle = night ? "#262b36" : "#c3c9d3"; for (var tl = 0; tl < W; tl += 110 * k) x.fillRect(tl, H * 0.78, 2, H * 0.22); x.fillRect(0, H * 0.89, W, 2); x.fillStyle = "rgba(0,0,0,.08)"; x.fillRect(0, H * 0.78, W, 3 * k); }   // sınıf: fayans zemin
      else { x.fillStyle = night ? "#2a2538" : "#d9b58a"; x.fillRect(0, H * 0.78, W, H * 0.22); x.fillStyle = night ? "#1d1a2a" : "#b98b5e"; for (var fl = 0; fl < W; fl += 90 * k) x.fillRect(fl, H * 0.78, 2, H * 0.22); x.fillStyle = night ? "#3b3550" : "#b5484d"; x.beginPath(); x.ellipse(W * 0.5, H * 0.95, W * 0.3, H * 0.05, 0, 0, 7); x.fill(); x.fillStyle = "rgba(255,255,255,.15)"; x.beginPath(); x.ellipse(W * 0.5, H * 0.95, W * 0.22, H * 0.03, 0, 0, 7); x.fill(); }
    });
    return layers;
  }
  function drawFog(W, H) {
    var c = canvas(W, H), x = c.getContext("2d");
    for (var i = 0; i < 14; i++) { var fx0 = (hash("fg" + i) % 1000) / 1000 * W, fy = H * (0.45 + (hash("fh" + i) % 100) / 100 * 0.5), r = (120 + (hash("fr" + i) % 200)) * (H / 720);
      var g = x.createRadialGradient(fx0, fy, 0, fx0, fy, r); g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.beginPath(); x.ellipse(fx0, fy, r * 1.6, r * 0.6, 0, 0, 7); x.fill(); }
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
  function drawBall(kind) {
    var c = canvas(80, 80), x = c.getContext("2d");
    if (kind === "elma") { circle(x, 40, 44, 30, "#e63946"); circle(x, 30, 34, 9, "rgba(255,255,255,.35)", true); x.strokeStyle = "#5a3825"; x.lineWidth = 5; x.lineCap = "round"; x.beginPath(); x.moveTo(40, 16); x.lineTo(44, 4); x.stroke(); ellipse(x, 50, 12, 10, 5, "#43aa8b", -0.5); }
    else if (kind === "tas") { ellipse(x, 40, 44, 30, 24, "#8d99ae"); ellipse(x, 32, 36, 10, 6, "rgba(255,255,255,.3)", 0, true); }
    else if (kind === "kartopu") { circle(x, 40, 42, 30, "#f8fbff"); circle(x, 30, 32, 9, "rgba(255,255,255,.9)", true); }
    else { circle(x, 40, 40, 32, "#e63946"); x.fillStyle = "#ffffff"; x.beginPath(); x.ellipse(40, 40, 32, 12, 0.5, 0, 7); x.fill(); x.fillStyle = "#e63946"; x.beginPath(); x.ellipse(40, 40, 32, 7, 0.5, 0, 7); x.fill(); P(x); x.beginPath(); x.arc(40, 40, 32, 0, 7); x.stroke(); }
    return c;
  }
  function circle(x, cx, cy, r, fill, noStroke) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); if (!noStroke) { P(x); x.stroke(); } }
  function ellipse(x, cx, cy, rx, ry, fill, rot, noStroke) { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); if (!noStroke) { P(x); x.stroke(); } }
  function P(x) { x.lineWidth = 4; x.strokeStyle = "rgba(28,20,40,.55)"; x.lineJoin = "round"; x.lineCap = "round"; }
  function drawHeart(hue) {
    var c = canvas(60, 56), x = c.getContext("2d");
    x.fillStyle = hsl(hue == null ? 345 : hue, 85, 62); x.beginPath(); x.moveTo(30, 52); x.bezierCurveTo(2, 30, 6, 4, 30, 18); x.bezierCurveTo(54, 4, 58, 30, 30, 52); x.fill();
    x.fillStyle = "rgba(255,255,255,.45)"; x.beginPath(); x.ellipse(20, 20, 6, 4, -0.6, 0, 7); x.fill(); return c;
  }
  function drawStars() {
    var c = canvas(120, 120), x = c.getContext("2d");
    for (var i = 0; i < 3; i++) { var a = i / 3 * Math.PI * 2, sx = 60 + Math.cos(a) * 42, sy = 60 + Math.sin(a) * 42; x.fillStyle = "#ffd60a"; x.beginPath();
      for (var p = 0; p < 10; p++) { var r = p % 2 ? 6 : 14, ang = p / 10 * Math.PI * 2 - Math.PI / 2; x.lineTo(sx + Math.cos(ang) * r, sy + Math.sin(ang) * r); } x.closePath(); x.fill(); P(x); x.lineWidth = 2; x.stroke(); }
    return c;
  }
  function drawDrop() { var c = canvas(34, 50), x = c.getContext("2d"); x.fillStyle = "#4cc9f0"; x.beginPath(); x.moveTo(17, 2); x.bezierCurveTo(30, 26, 30, 46, 17, 46); x.bezierCurveTo(4, 46, 4, 26, 17, 2); x.fill(); x.fillStyle = "rgba(255,255,255,.6)"; x.beginPath(); x.ellipse(12, 30, 3, 6, 0.2, 0, 7); x.fill(); return c; }
  function drawSpeedLines() { var c = canvas(140, 90), x = c.getContext("2d"); x.strokeStyle = "rgba(255,255,255,.85)"; x.lineCap = "round"; [[18, 90, 5], [32, 110, 7], [48, 80, 5], [64, 120, 6], [78, 70, 4]].forEach(function (l) { x.lineWidth = l[2]; x.beginPath(); x.moveTo(130, l[0]); x.lineTo(130 - l[1], l[0]); x.stroke(); }); return c; }
  /* Yağmur / kar karosu: dikey periyodu H olan 2H yüksekliğinde desen (kaydırınca kesintisiz döner) */
  function drawPrecip(kind, W, H, seed) {
    var c = canvas(W, H * 2), x = c.getContext("2d"), k = Math.min(W, H) / 720, n = Math.round((W * H) / (kind === "kar" ? 9000 : 5500));
    for (var i = 0; i < n; i++) {
      var px = (hash(seed + "x" + i) % 10000) / 10000 * W, py = (hash(seed + "y" + i) % 10000) / 10000 * H;
      [py, py + H].forEach(function (yy) {
        if (kind === "kar") { var r = (2 + (hash(seed + "r" + i) % 100) / 100 * 3) * k; x.fillStyle = "rgba(255,255,255," + (0.6 + (i % 3) * 0.13) + ")"; x.beginPath(); x.arc(px, yy, r, 0, 7); x.fill(); }
        else { var len = (16 + (hash(seed + "l" + i) % 100) / 100 * 16) * k; x.strokeStyle = "rgba(215,232,255," + (0.35 + (i % 3) * 0.15) + ")"; x.lineWidth = 2 * k; x.lineCap = "round"; x.beginPath(); x.moveTo(px, yy); x.lineTo(px - len * 0.18, yy + len); x.stroke(); }
      });
    }
    return c;
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
      var tg = genAsset("glow", "isik.png", drawGlow);
      for (var ti = 0; ti < 7; ti++) {   // parıltılar: başlık etrafında yavaşça yüzen ışıklar
        var tsz = (0.25 + (hash("tg" + ti) % 100) / 100 * 0.3) * k;
        var TL = Model.newLayer("image", { name: "Parıltı", frames: [tg], base: { x: W * (0.12 + (hash("tx" + ti) % 100) / 100 * 0.76), y: H * (0.15 + (hash("ty" + ti) % 100) / 100 * 0.7), rot: 0, sx: tsz, sy: tsz, opacity: 0.8 } });
        fx(TL, "pulse", 0, null, { strength: 80, speed: 0.4 + (hash("tp" + ti) % 100) / 100 * 0.6 }); fx(TL, "float", 0, null, { strength: Math.round(14 * k), speed: 0.3 + (hash("tf" + ti) % 100) / 100 * 0.3, tilt: 0 }); fx(TL, "fadeOut", 2.5, 3);
        ts.layers.push(TL);
      }
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
      var weather = sa.weather || "", storm = weather === "firtina", rainy = weather === "yagmur" || storm, windy = weather === "ruzgar" || storm;
      if (storm && outdoor) sc.grade = time === "gece" ? { color: "#6b7aa8", alpha: 0.6 } : { color: "#7d8fa6", alpha: 0.5 };   // fırtına: koyu, soğuk ton
      else if (weather === "yagmur" && outdoor) sc.grade = time === "gece" ? { color: "#7f93c8", alpha: 0.5 } : { color: "#9fb6c8", alpha: 0.35 };
      else if (weather === "sis" && outdoor) sc.grade = { color: "#d9dee6", alpha: 0.3 };
      var wx = sa.weather || "";
      sc.background = { type: "color", color: (SKY[time] || SKY.gunduz)[0], color2: "#000000", angle: 0, assetId: null };
      var bgLayers = [], bgCov = [], treesL = null;
      if (userBg) {
        var bgA = project.assets[userBg.assetId], cover = Math.max(W / (bgA ? bgA.width : W), H / (bgA ? bgA.height : H));
        var bgL = Model.newLayer("image", { name: "Arka plan", frames: [userBg.assetId], base: { x: W / 2, y: H / 2, rot: 0, sx: cover, sy: cover, opacity: 1 } });
        bgL.locked = true; bgL.parallax = 0.8;
        bgLayers.push(bgL); bgCov.push(cover);
      } else {   // çizilen arka plan: derinlik katmanları
        var detail = /park|bahce/.test(norm(sa.place)) ? "park" : /okul|sinif|ders|kolej|universite/.test(norm(sa.place)) ? "okul" : "";
        var layerKeys = ["sky", "far", "mid"].concat(kind === "kir" || kind === "orman" || kind === "dag" ? ["trees"] : []).concat(["ground"]);
        var PAR = { sky: 0.6, far: 0.75, mid: 0.9, trees: 0.93, ground: 1 }, NAMES = { sky: "Arka plan", far: "Arka plan · uzak", mid: "Arka plan · orta", trees: "Arka plan · ağaçlar", ground: "Arka plan · zemin" };
        var parts = null;
        layerKeys.forEach(function (lk) {
          var aid = genAsset("bg:" + kind + ":" + time + (wx ? ":" + wx : "") + (detail ? ":" + detail : "") + ":" + lk + ":" + W + "x" + H, "arka plan " + kind + " " + lk + ".png", function () {
            if (!parts) parts = drawBackgroundLayers(kind, time, W, H, wx, detail);
            return parts.filter(function (q) { return q.key === lk; })[0].canvas;
          });
          var BL = Model.newLayer("image", { name: NAMES[lk], frames: [aid], base: { x: W / 2, y: lk === "trees" ? H : H / 2, rot: 0, sx: 1, sy: 1, opacity: 1 } });
          if (lk === "trees") { BL.anchor = { x: 0.5, y: 1 }; treesL = BL; }
          BL.locked = true; BL.parallax = PAR[lk];
          bgLayers.push(BL); bgCov.push(1);
        });
        if (treesL && windy) fx(treesL, "swing", 0, null, { strength: storm ? 2.6 : 1.6, speed: storm ? 0.32 : 0.22 });   // rüzgârda ağaçlar sallanır, fırtınada daha sert
      }
      var pushIn = scenes.length % 2 === 0;   // sahneler sırayla yaklaşır / uzaklaşır: durağan değil, sinema hissi
      bgLayers.forEach(function (BL, bi) { BL.base.sx = BL.base.sy = pushIn ? bgCov[bi] : bgCov[bi] * 1.05; sc.layers.push(BL); });
      {
        if (!userBg && outdoor) {
          [[0.22, 0.14, 0.85, 22, 0], [0.68, 0.2, 0.6, 14, 1]].forEach(function (cl, i) {
            var cid = genAsset("cloud:" + i, "bulut-" + (i + 1) + ".png", function () { return drawCloud(i); });
            var L = Model.newLayer("image", { name: "Bulut " + (i + 1), frames: [cid], base: { x: W * cl[0], y: H * cl[1], rot: 0, sx: cl[2] * k, sy: cl[2] * k, opacity: time === "gece" ? 0.35 : storm ? 0.6 : 0.95 } });
            fx(L, "drift", 0, null, { speed: cl[3] * (windy ? (storm ? 4 : 3) : 1), dir: "right", wrap: "yes" });
            L.parallax = 0.88;
            sc.layers.push(L);
          });
        }
      }
      var ambientAt = sc.layers.length;   // ortam katmanları (kuş, kelebek…) buraya girer: karakterlerin arkasında
      var weatherLayers = [];   // yağmur / kar karakterlerin önüne, sahne sonunda eklenir
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
      /* Ter damlası (korku / gerginlik) */
      function sweat(kn, x, y, at) {
        var did = genAsset("drop", "damla.png", drawDrop), s = 0.55 * k * (chars[kn].charH / (0.42 * base));
        var L = sprite("Damla", did, x, y, s, at, at + 1.3, { opacity: 0.95 });
        fx(L, "popIn", at, at + 0.2); key(L, "y", at, y, "easeInQuad"); key(L, "y", at + 1.3, y + chars[kn].charH * 0.12, "easeInQuad"); fx(L, "fadeOut", at + 0.9, at + 1.3);
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
      /* Hedef, sahnedeki başka bir karakterin üstüne geliyorsa gidiş yönünde onun ötesine (sığmazsa berisine) kaydırılır */
      function freeSpot(kn, nx, t0) {
        var from = curX(kn, t0), dir = nx >= from ? 1 : -1;
        for (var pass = 0; pass < 3; pass++) {
          var hit = null;
          Object.keys(chars).forEach(function (o) { if (o === kn || !chars[o].present || hit) return; var ox = curX(o, t0 + 0.01); if (Math.abs(nx - ox) < besideDist(kn, o, 1.0)) hit = { o: o, x: ox }; });
          if (!hit) break;
          var beyond = hit.x + dir * besideDist(kn, hit.o, 1.1), before = hit.x - dir * besideDist(kn, hit.o, 1.1);
          nx = (beyond > W * 0.06 && beyond < W * 0.94) ? beyond : before;
        }
        return nx;
      }
      /* Tutulan nesneler sahibi hareket edince yere düşer */
      function dropHeld(kn, at) {
        Object.keys(props).forEach(function (pp) {
          var pr = props[pp]; if (pr.holder !== kn || !pr.layer) return;
          var L = pr.layer, y0 = M.trackValue(L.tracks.y, at, L.base.y), gy = chars[kn].ground - 8 * k;
          if (y0 < gy - 4) { key(L, "y", at, y0, "easeInQuad"); key(L, "y", at + 0.45, gy, "easeOutBounce"); }
          pr.holder = null; pr.landed = at + 0.45;
        });
      }
      function moveTo(kn, nx, t0, dur, mode) {
        var c = chars[kn], L = c.layer;
        nx = Math.max(W * 0.06, Math.min(W * 0.94, Math.round(freeSpot(kn, nx, t0))));
        dropHeld(kn, t0);
        var from = curX(kn, t0);
        if (Math.abs(nx - from) < 2) return;
        setFacing(kn, nx > from ? 1 : -1, t0);
        key(L, "x", t0, from, "linear"); key(L, "x", t0 + dur, nx, mode === "run" ? "easeInOutQuad" : "linear");
        walkCycle(kn, t0, t0 + dur, mode === "run" ? 3.2 : 2.2, nx > from ? 1 : -1);
        if (mode === "run") {
          puff(from, c.ground, t0, 0.7);
          var dirR = nx > from ? 1 : -1, sid = genAsset("speed", "hiz.png", drawSpeedLines), ss = 0.5 * k * (c.charH / (0.42 * base));
          var SL2 = sprite("Hız çizgileri", sid, from - dirR * charW(kn) * 0.7, c.ground - c.charH * 0.5, ss, t0 + 0.1, t0 + dur, { opacity: 0.75, flip: dirR < 0 });
          key(SL2, "x", t0 + 0.1, from - dirR * charW(kn) * 0.7, "linear"); key(SL2, "x", t0 + dur, nx - dirR * charW(kn) * 0.7, "linear");
          fx(SL2, "fadeIn", t0 + 0.1, t0 + 0.25); fx(SL2, "fadeOut", t0 + dur - 0.2, t0 + dur);
        }
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
      /* Çizgi roman ses yazısı: GÜM!, HOP!, TAK TAK! — patlayarak belirir, hafifçe yüzer, söner */
      function sfxText(text, x, y, at, hue, scale) {
        if (settings.onomatopoeia === false) return null;
        var s = scale || 1, sz = Math.round(base * 0.07 * s), rot = (hash(text + at.toFixed(1)) % 21) - 10;
        var L = textLayer("Ses yazısı · " + text, text, { start: Math.max(0, at), end: at + 1.0, anchor: { x: 0.5, y: 0.5 },
          base: { x: Math.round(Math.max(sz * 1.5, Math.min(W - sz * 1.5, x))), y: Math.round(Math.max(sz, Math.min(H - sz, y))), rot: rot, sx: 1, sy: 1, opacity: 1 },
          text: { size: sz, font: fonts[2].id, color: hsl(hue == null ? 48 : hue, 95, 60), stroke: "#1b1f2a", strokeWidth: Math.round(5 * k * s), bubble: false, weight: "700", maxWidth: Math.round(W * 0.6) } });
        fx(L, "popIn", at, at + 0.22); fx(L, "float", at, at + 1.0, { strength: Math.round(4 * k), speed: 1.2, tilt: 2 }); fx(L, "fadeOut", at + 0.7, at + 1.0);
        sc.layers.push(L);
        return L;
      }
      /* Kamera sarsıntıları (düşme, gök gürültüsü): sahne sonunda kamera yolunun üstüne eklenir */
      var shakes = [];
      function srnd(tag) { return (hash("s" + sa.index + ":" + sa.place + ":" + tag) % 1000) / 1000; }
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
      function bubble(kn, text, a, b, emotion, inner) {   // inner: düşünce balonu (içinden konuşma)
        var c = chars[kn], cx = curX(kn, a), headTop = c.ground - c.charH;
        var bubbleColor = settings.bubbleStyle === "color" ? hsl(hash(kn) % 360, 70, 90) : "#ffffff";
        var shout = !inner && (emotion === "kizgin" || (/!\s*$/.test(text) && /[A-ZÇĞİÖŞÜ]{3,}/.test(text) && text === text.toLocaleUpperCase("tr")));   // kızgın ya da BÜYÜK HARFLE ÜNLEM → bağırma balonu
        var size = emotion === "fisilti" ? Math.round(bubbleFont * 0.85) : shout ? Math.round(bubbleFont * 1.12) : bubbleFont;
        var L = textLayer("Replik · " + c.def.name + ": " + text.slice(0, 22) + (text.length > 22 ? "…" : ""), text, {
          start: a, end: b, anchor: { x: 0.5, y: 1 },
          base: { x: cx, y: headTop - Math.round(base * 0.015), rot: ((hash(text) % 5) - 2) * 0.7, sx: 1, sy: 1, opacity: 1 },
          text: { size: size, bubbleColor: inner ? "#f4f7ff" : bubbleColor, color: inner ? "#4a5568" : "#1b1f2a", bubble: true, bubbleTail: "left", bubbleShape: inner ? "thought" : shout ? "shout" : "round", weight: "700" }
        });
        var sz = R.layerSize(L, project);
        var half = sz.w / 2 + 8;
        var bx = Math.max(half, Math.min(W - half, cx + (cx < W / 2 ? sz.w * 0.18 : -sz.w * 0.18)));
        L.base.x = Math.round(bx);
        L.base.y = Math.max(sz.h + 8, L.base.y);
        L.text.bubbleTail = cx <= bx ? "left" : "right";
        fx(L, "popIn", a, a + 0.28); fx(L, "fadeOut", Math.max(a + 0.3, b - 0.25), b);
        fx(L, "float", a, b, { strength: Math.round(3 * k), speed: 0.5, tilt: 0.6 });
        if (emotion === "kizgin") { fx(L, "shake", a + 0.2, b, { strength: Math.round(2 * k), speed: 4 }); if (settings.bubbleStyle !== "color") L.text.bubbleColor = "#ffe3e3"; }
        else if (emotion === "korkmus") { fx(L, "jelly", a + 0.2, b, { strength: 6, speed: 2.2 }); if (settings.bubbleStyle !== "color") L.text.bubbleColor = "#e9f3ff"; }
        else if (emotion === "mutlu") fx(L, "bounce", a, Math.min(b, a + 1.2), { strength: Math.round(4 * k), speed: 2, squash: 8 });
        else if (emotion === "saskin") fx(L, "jelly", a, Math.min(b, a + 0.7), { strength: 10, speed: 3 });
        else if (emotion === "uzgun" && settings.bubbleStyle !== "color") L.text.bubbleColor = "#eef0f6";
        else if (emotion === "fisilti" && settings.bubbleStyle !== "color") L.text.bubbleColor = "#f4f4f4";
        if (!inner) cue("pop", a);
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
      var t = 0.7, lastSpeaker = null, usedCam = false, dialogueCount = 0, beats = [], looks = [], emoBeats = [], props = {};
      /* Küçük yardımcı sprite katmanı (nesne, kalp, yıldız, damla, hız çizgisi) */
      function sprite(name, assetId, x, y, scale, at, until, opts) {
        opts = opts || {};
        var L = Model.newLayer("image", { name: name, frames: [assetId], base: { x: Math.round(x), y: Math.round(y), rot: opts.rot || 0, sx: scale * (opts.flip ? -1 : 1), sy: scale, opacity: opts.opacity == null ? 1 : opts.opacity } });
        if (opts.anchor) L.anchor = opts.anchor;
        L.inPoint = Math.max(0, at); L.outPoint = until == null ? null : until;
        sc.layers.push(L);
        return L;
      }
      function headPos(kn, at) { var c = chars[kn]; return { x: curX(kn, at), y: c.ground - c.charH * 0.82 }; }
      /* Nesne fırlatma: elden hedefe (ya da yöne) kavisli uçuş; nesne hedefin elinde kalır */
      function throwProp(kn, a, start, dur) {
        var c = chars[kn], pid = genAsset("prop:" + a.prop, a.prop + ".png", function () { return drawBall(a.prop); });
        var s = (a.prop === "tas" ? 0.5 : 0.6) * k * (c.charH / (0.42 * base));
        var x0 = curX(kn, start) + c.facing * charW(kn) * 0.35, y0 = c.ground - c.charH * 0.55;
        var tk = a.target ? norm(a.target) : null, x1, y1;
        if (tk && chars[tk] && chars[tk].present) { var side = curX(tk, start + dur) > x0 ? -1 : 1; x1 = curX(tk, start + dur) + side * charW(tk) * 0.35; y1 = chars[tk].ground - chars[tk].charH * 0.55; setFacing(kn, curX(tk, start) > x0 ? 1 : -1, start); }
        else { var dirS = a.to === "left" ? -1 : a.to === "right" ? 1 : c.facing || 1; x1 = x0 + dirS * W * 0.5; y1 = c.ground - c.charH * 0.1; }
        if (props[a.prop] && props[a.prop].layer) props[a.prop].layer.outPoint = Math.min(props[a.prop].layer.outPoint == null ? Infinity : props[a.prop].layer.outPoint, start);
        var L = sprite(a.prop === "top" ? "Top" : a.prop === "elma" ? "Elma" : a.prop === "kartopu" ? "Kartopu" : "Taş", pid, x0, y0, s, start, null);
        key(L, "x", start, x0, "linear"); key(L, "x", start + dur, x1, "linear");
        key(L, "y", start, y0, "easeOutQuad"); key(L, "y", start + dur * 0.5, Math.min(y0, y1) - H * 0.22, "easeInQuad"); key(L, "y", start + dur, y1, "easeInQuad");
        fx(L, "spin", start, start + dur, { speed: 1.5, dir: c.facing >= 0 ? "cw" : "ccw" });
        if (!tk || !chars[tk] || !chars[tk].present) { fx(L, "fadeOut", start + dur, start + dur + 0.4); L.outPoint = start + dur + 0.4; }
        cue("whoosh", start + 0.05);
        props[a.prop] = { layer: L, holder: tk && chars[tk] ? tk : null, landed: start + dur };
      }
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
          var inner = /icinden|kendi kendine|aklindan|dusunur|dusunerek|ic ses|icsel|dusunce/.test(norm(it.emotion || ""));   // (içinden): düşünce balonu, ağız kıpırdamaz
          if (it.emotion && !emotion && !inner) warnings.push("Satır " + it.line + ": “(" + it.emotion + ")” duygusu tanınmadı.");
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
            bubble(kn, ch, t, t + d, emotion, inner);
            if (clip) cue("clip", t + 0.1, clip.key);
            if (inner) { fx(chars[kn].layer, "lean", t, t + d, { angle: 3, ramp: 0.4 }); chars[kn].busy.push([t, t + d]); emote(kn, emotion, t, t + d); }   // düşünür: ağız kapalı, hafif eğilir
            else if (clip) talk(kn, t + 0.1, t + 0.1 + clip.duration, emotion, ch, clip.mouth);
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
              if (!inner && chars[o].def.look && !chars[o].def.placeholder) looks.push({ kn: o, a: t, b: t + d });
              if (bang) fx(chars[o].layer, "jelly", t + 0.25, t + 0.6, { strength: 7, speed: 3 });
              if (emotion === "kizgin") fx(chars[o].layer, "lean", t, t + d, { angle: right ? 3 : -3, ramp: 0.4 });
              else if (emotion === "uzgun") fx(chars[o].layer, "lean", t, t + d, { angle: right ? -2 : 2, ramp: 0.6 });
            });
            if (/kizgin|saskin|korkmus|uzgun|fisilti/.test(emotion) && d >= 1.2) emoBeats.push({ t: t, d: d, kn: kn });
            if (emotion === "korkmus") { var hp = headPos(kn, t); sweat(kn, hp.x + chars[kn].facing * chars[kn].charH * 0.22, hp.y + chars[kn].charH * 0.1, t + 0.2); }
            t += d + 0.3 + (/\?\s*$/.test(ch) ? 0.25 : /!\s*$/.test(ch) ? 0.1 : /(…|\.\.\.)\s*$/.test(ch) ? 0.3 : 0);   // soru ve ünlemden sonra tepki beklemesi
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
        if (a.act === "knock" || a.act === "ring") {   // kapı / telefon: ses + ses yazısı; sahnedekiler irkilir, kapıya bakar
          var evKnock = a.act === "knock";
          cue(a.act, start);
          sfxText(evKnock ? "TAK TAK!" : "ZIRR ZIRR!", evKnock ? W * 0.88 : W * 0.5, evKnock ? H * 0.4 : H * 0.18, start + 0.05, evKnock ? 35 : 50, 1);
          order.forEach(function (o) { var oc = chars[o]; if (!oc || !oc.present || !oc.layer) return; fx(oc.layer, "jelly", start + 0.15, start + 0.65, { strength: 8, speed: 3 }); if (evKnock) setFacing(o, 1, start + 0.3); });
          t = start + dur; return;
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
              L = ensurePresent(kn, start); dropHeld(kn, start);
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
              ensurePresent(kn, start); dropHeld(kn, start); fx(c.layer, "bounce", start, start + dur, { strength: Math.round(base * 0.09), speed: 1.25, squash: 35 });
              if (start > 0.25) { var sy0 = M.trackValue(c.layer.tracks.sy, start, c.layer.base.sy); key(c.layer, "sy", start - 0.22, sy0, "easeInQuad"); key(c.layer, "sy", start - 0.05, sy0 * 0.86, "easeOutQuad"); key(c.layer, "sy", start + 0.08, sy0, "easeOutQuad"); }   // hazırlık: çömelme
              for (var lt = start + 0.8; lt <= start + dur + 0.01; lt += 0.8) puff(curX(kn, lt), c.ground, lt - 0.05, 0.9);   // her inişte toz
              if (kn === subs[0]) { cue("boing", start + 0.05); sfxText("HOP!", curX(kn, start) + (c.facing >= 0 ? -1 : 1) * c.charH * 0.5, c.ground - c.charH * 1.1, start + 0.1, 48, 0.9); } break;
            }
            case "spin": ensurePresent(kn, start); fx(c.layer, "spin", start, start + dur, { speed: 1 / dur, dir: "cw" }); break;
            case "turn": ensurePresent(kn, start); setFacing(kn, -c.facing || -1, start + 0.1); break;
            case "fall": {
              L = ensurePresent(kn, start); dropHeld(kn, start);
              key(L, "rot", start, M.trackValue(L.tracks.rot, start, 0)); key(L, "rot", start + dur, c.facing >= 0 ? 82 : -82, "easeOutBounce");
              puff(curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.35, c.ground, start + dur * 0.7, 1.1);
              if (kn === subs[0]) { cue("thud", start + dur * 0.75); sfxText("GÜM!", curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.6, c.ground - c.charH * 0.5, start + dur * 0.72, 18, 1.1); shakes.push({ at: start + dur * 0.72, amp: 0.008, dur: 0.45 }); }
              var stid = genAsset("stars", "yildizlar.png", drawStars), sts = 0.5 * k * (c.charH / (0.42 * base));   // baş döndüren yıldızlar
              var STL = sprite("Yıldızlar", stid, curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.45, c.ground - c.charH * 0.2, sts, start + dur, start + dur + 1.8, { opacity: 0.95 });
              fx(STL, "spin", start + dur, start + dur + 1.8, { speed: 0.8, dir: "cw" }); fx(STL, "fadeIn", start + dur, start + dur + 0.2); fx(STL, "fadeOut", start + dur + 1.4, start + dur + 1.8);
              c.fallen = true; break;
            }
            case "rise": {
              L = ensurePresent(kn, start);
              if (c.fallen) { key(L, "rot", start, M.trackValue(L.tracks.rot, start, 0)); key(L, "rot", start + dur, 0, "easeInOutQuad"); c.fallen = false; }
              if (c.sitting) { key(L, "sy", start, M.trackValue(L.tracks.sy, start, c.scale)); key(L, "sy", start + dur, c.scale, "easeOutBack"); c.sitting = false; }
              break;
            }
            case "fly": {
              L = ensurePresent(kn, start); dropHeld(kn, start);
              key(L, "y", start, M.trackValue(L.tracks.y, start, c.ground)); key(L, "y", start + dur, c.ground - H * 0.32, "easeInOutQuad");
              c.fl = fx(L, "float", start + dur, null, { strength: Math.round(10 * k), speed: 0.7, tilt: 3 }); c.flying = true; break;
            }
            case "land": {
              L = ensurePresent(kn, start);
              key(L, "y", start, M.trackValue(L.tracks.y, start, c.ground)); key(L, "y", start + dur, c.ground, "easeOutBounce");
              if (c.fl) { c.fl.end = start; c.fl = null; } c.flying = false;
              if (kn === subs[0]) { cue("thud", start + dur - 0.05); sfxText("PAT!", curX(kn, start) + c.charH * 0.5, c.ground - c.charH * 0.35, start + dur - 0.05, 30, 0.9); puff(curX(kn, start), c.ground, start + dur - 0.05, 1); }
              break;
            }
            case "wave": ensurePresent(kn, start); fx(c.layer, "swing", start, start + dur, { strength: 6, speed: 2.5 }); break;
            case "laugh": ensurePresent(kn, start); fx(c.layer, "bounce", start, start + dur, { strength: Math.round(base * 0.02), speed: 3, squash: 20 }); if (kn === subs[0]) sfxText("HA HA!", curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.5, c.ground - c.charH * 1.05, start + 0.15, 48, 0.9); break;
            case "cry": ensurePresent(kn, start); fx(c.layer, "lean", start, start + dur, { angle: -8, ramp: 0.4 }); fx(c.layer, "shake", start, start + dur, { strength: Math.round(2 * k), speed: 1.5 }); break;
            case "angry": ensurePresent(kn, start); fx(c.layer, "shake", start, start + dur, { strength: Math.round(7 * k), speed: 1.2 }); fx(c.layer, "jelly", start, start + dur, { strength: 8, speed: 2 }); if (kn === subs[0]) sfxText("GRRR!", curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.5, c.ground - c.charH * 1.05, start + 0.1, 8, 0.9); break;
            case "surprise": ensurePresent(kn, start); fx(c.layer, "jelly", start, start + dur, { strength: 18, speed: 2.5 }); fx(c.layer, "bounce", start, start + Math.min(dur, 0.9), { strength: Math.round(base * 0.03), speed: 1.1, squash: 20 }); if (kn === subs[0]) sfxText("!", curX(kn, start), c.ground - c.charH * 1.15, start + 0.05, 0, 1.3); break;
            case "fear": { ensurePresent(kn, start); fx(c.layer, "shake", start, start + dur, { strength: Math.round(4 * k), speed: 2.2 }); fx(c.layer, "lean", start, start + dur, { angle: -6, ramp: 0.3 }); var fhp = headPos(kn, start); sweat(kn, fhp.x + c.facing * c.charH * 0.22, fhp.y + c.charH * 0.1, start + 0.15); break; }
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
                var hid = genAsset("heart", "kalp.png", function () { return drawHeart(345); }), hcx = (hx + curX(kn, start + dur)) / 2, hcy = c.ground - c.charH * 0.95;
                for (var hi = 0; hi < 3; hi++) {   // kalpler yükselir
                  var ht = start + dur - 0.4 + hi * 0.28, hs = (0.35 + hi * 0.08) * k * (c.charH / (0.42 * base));
                  var HL = sprite("Kalp", hid, hcx + (hi - 1) * c.charH * 0.18, hcy, hs, ht, ht + 1.6, { opacity: 0.95 });
                  fx(HL, "popIn", ht, ht + 0.25); key(HL, "y", ht, hcy, "easeOutQuad"); key(HL, "y", ht + 1.6, hcy - H * 0.2, "easeOutQuad"); fx(HL, "float", ht, ht + 1.6, { strength: Math.round(10 * k), speed: 1.2, tilt: 8 }); fx(HL, "fadeOut", ht + 1.1, ht + 1.6);
                }
              } else fx(c.layer, "lean", start, start + dur, { angle: 6, ramp: 0.3 });
              break;
            }
            case "back": ensurePresent(kn, start); moveTo(kn, curX(kn, start) - (c.facing >= 0 ? 1 : -1) * W * 0.1, start, dur, "walk"); setFacing(kn, c.facing >= 0 ? 1 : -1, start + dur); break;
            case "clap": ensurePresent(kn, start); fx(c.layer, "pulse", start, start + dur, { strength: 10, speed: 3 }); if (kn === subs[0]) { cue("clap", start + 0.1); sfxText("ŞAK ŞAK!", curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.5, c.ground - c.charH * 0.8, start + 0.1, 48, 0.8); } break;
            case "bark": { ensurePresent(kn, start); var nb = norm(it.text), say = /miyav/.test(nb) ? "Miyav!" : /civil|cik cik/.test(nb) ? "Cik cik!" : /kukre|bogur/.test(nb) ? "Grrr!" : "Hav hav!";
              fx(c.layer, "talk", start, start + dur, { strength: Math.round(5 * k), speed: 5 }); fx(c.layer, "bounce", start, start + Math.min(dur, 0.8), { strength: Math.round(base * 0.015), speed: 2.5, squash: 12 }); thought(kn, say, start, start + dur + 0.4); if (kn === subs[0]) cue("pop", start); break; }
            case "sing": { ensurePresent(kn, start); fx(c.layer, "talk", start, start + dur, { strength: Math.round(5 * k), speed: 3 }); fx(c.layer, "float", start, start + dur, { strength: Math.round(6 * k), speed: 0.8, tilt: 4 }); thought(kn, "♪ ♫", start, start + dur); break; }
            case "slide": { ensurePresent(kn, start); var sdx = (a.to === "left" ? -1 : a.to === "right" ? 1 : (c.facing >= 0 ? 1 : -1)) * W * 0.3; var sfrom = curX(kn, start), sto = Math.max(W * 0.06, Math.min(W * 0.94, sfrom + sdx)); setFacing(kn, sto > sfrom ? 1 : -1, start); key(c.layer, "x", start, sfrom, "easeOutCubic"); key(c.layer, "x", start + dur, sto, "easeOutCubic"); fx(c.layer, "lean", start, start + dur, { angle: sto > sfrom ? -10 : 10, ramp: 0.2 }); c.x = sto; break; }
            case "swim": { ensurePresent(kn, start); fx(c.layer, "float", start, start + dur, { strength: Math.round(8 * k), speed: 1.2, tilt: 6 }); moveTo(kn, curX(kn, start) + (a.to === "left" ? -1 : 1) * W * 0.2, start, dur, "walk"); break; }
            case "yawn": ensurePresent(kn, start); fx(c.layer, "lean", start, start + dur, { angle: -6, ramp: 0.5 }); fx(c.layer, "breathe", start, start + dur, { strength: 6, speed: 1 / dur }); break;
            case "throw": {
              ensurePresent(kn, start); fx(c.layer, "swing", start, start + dur, { strength: 12, speed: 1 / dur }); fx(c.layer, "lean", start, start + dur, { angle: c.facing >= 0 ? 8 : -8, ramp: 0.2 });
              if (a.prop && kn === subs[0]) throwProp(kn, a, start, Math.max(0.6, dur + 0.3));
              if (kn === subs[0]) sfxText("FIŞŞ!", curX(kn, start) + (c.facing >= 0 ? 1 : -1) * c.charH * 0.65, c.ground - c.charH * 0.85, start + dur * 0.5, 200, 0.8);
              break;
            }
            case "catch": {
              ensurePresent(kn, start); fx(c.layer, "jelly", start, start + dur, { strength: 14, speed: 3 });
              var pk = a.prop && props[a.prop] ? a.prop : Object.keys(props).filter(function (pp) { return props[pp].holder === kn; })[0];
              if (pk && props[pk].layer) { fx(props[pk].layer, "jelly", Math.max(start, props[pk].landed), Math.max(start, props[pk].landed) + 0.4, { strength: 20, speed: 4 }); props[pk].holder = kn; if (kn === subs[0]) cue("pop", Math.max(start, props[pk].landed)); }
              break;
            }
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
        /* Duygusal anlarda yakın çekim (en az 7 sn arayla): konuşanın başına yaklaşır, replik bitince geri açılır */
        var lastEmo = -99;
        emoBeats.forEach(function (eb) {
          if (eb.t - lastEmo < 7 || eb.t < 0.6 || eb.t + eb.d + 0.6 > sc.duration) return;
          lastEmo = eb.t;
          var c = chars[eb.kn], z = W < H ? 1.2 : 1.28, hx = 0.5 / z, hy = 0.5 / z;
          var cx0 = Math.max(hx, Math.min(1 - hx, curX(eb.kn, eb.t) / W)), cy0 = Math.max(hy, Math.min(1 - hy, (c.ground - c.charH * 0.72) / H));
          var tA = eb.t - 0.35, tB = eb.t + 0.3, tC = eb.t + eb.d - 0.3, tD = eb.t + eb.d + 0.5;
          var zA = M.trackValue(sc.camera.tracks.zoom, tA, sc.camera.base.zoom), zD = M.trackValue(sc.camera.tracks.zoom, tD, sc.camera.base.zoom);
          var xA = M.trackValue(sc.camera.tracks.x, tA, sc.camera.base.x), xD = M.trackValue(sc.camera.tracks.x, tD, sc.camera.base.x);
          var yA = M.trackValue(sc.camera.tracks.y, tA, sc.camera.base.y), yD = M.trackValue(sc.camera.tracks.y, tD, sc.camera.base.y);
          ["zoom", "x", "y"].forEach(function (pp) { sc.camera.tracks[pp] = sc.camera.tracks[pp].filter(function (q) { return q.t <= tA + 1e-4 || q.t >= tD - 1e-4; }); });   // pencere içindeki kayma anahtarları silinir: yakın çekim sabit durur
          camKey("zoom", tA, zA); camKey("zoom", tB, z); camKey("zoom", tC, z); camKey("zoom", tD, zD);
          camKey("x", tA, xA); camKey("x", tB, cx0); camKey("x", tC, cx0); camKey("x", tD, xD);
          camKey("y", tA, yA); camKey("y", tB, cy0); camKey("y", tC, cy0); camKey("y", tD, yD);
        });
      }
      /* Hava durumu: yağmur ve kar karakterlerin önünde, döngüyle akar; rüzgârda yapraklar hızlanır */
      if ((rainy || weather === "kar") && outdoor) {
        var pk = weather === "kar" ? "kar" : "yagmur";   // fırtınada yağmur daha hızlı ve yoğun
        var wid = genAsset("precip:" + pk + ":" + W + "x" + H, pk + ".png", function () { return drawPrecip(pk, W, H, pk + W); });
        [[pk === "kar" ? 7 : storm ? 0.65 : 0.9, storm ? 1 : 0.9, 1], [pk === "kar" ? 11 : storm ? 1.0 : 1.4, storm ? 0.75 : 0.55, 0.7]].forEach(function (cfg, wi) {
          var T = cfg[0], WL = Model.newLayer("image", { name: pk === "kar" ? "Kar" : "Yağmur", frames: [wid], base: { x: 0, y: -H, rot: 0, sx: cfg[2], sy: cfg[2], opacity: cfg[1] } });
          WL.anchor = { x: 0, y: 0 }; WL.locked = true; WL.parallax = 1;
          for (var cyc = 0; cyc * T < sc.duration + T; cyc++) { M.setKey(WL.tracks.y, cyc * T, -H * cfg[2], "linear"); M.setKey(WL.tracks.y, (cyc + 1) * T - 0.001, 0, "step"); }
          if (pk === "kar") fx(WL, "float", 0, null, { strength: Math.round(24 * k), speed: 0.25 + wi * 0.1, tilt: 0 });
          weatherLayers.push(WL);
        });
      }
      if (weather === "sis" && outdoor) {   // sis: karakterlerin önünde yavaşça kayan beyaz tüller
        var fid2 = genAsset("fog:" + W + "x" + H, "sis.png", function () { return drawFog(W, H); });
        [[0.45, 14], [0.3, 24]].forEach(function (cfg, fi) {
          var FG = Model.newLayer("image", { name: "Sis", frames: [fid2], base: { x: W / 2, y: H / 2, rot: 0, sx: 1 + fi * 0.15, sy: 1, opacity: cfg[0] } });
          FG.locked = true; fx(FG, "drift", 0, null, { speed: cfg[1], dir: fi ? "left" : "right", wrap: "yes" });
          weatherLayers.push(FG);
        });
      }
      if (storm) {   // şimşek: tüm kareyi aydınlatan kısa çakmalar (ekran katmanı), ardından gök gürültüsü ve kamera sarsıntısı
        var flid = genAsset("flash:" + W + "x" + H, "simsek.png", function () { var fc = canvas(W, H), fxc = fc.getContext("2d"); fxc.fillStyle = "#ffffff"; fxc.fillRect(0, 0, W, H); return fc; });
        var FL = Model.newLayer("image", { name: "Şimşek", frames: [flid], base: { x: W / 2, y: H / 2, rot: 0, sx: 1, sy: 1, opacity: 0 } });
        FL.locked = true; FL.hud = true;
        var nFl = Math.max(1, Math.min(4, Math.round(sc.duration / 6))), fpeak = outdoor ? 0.85 : 0.45, flashes = 0;
        for (var fi2 = 0; fi2 < nFl; fi2++) {
          var ft = Math.round((0.8 + (fi2 + srnd("fl" + fi2) * 0.8) * ((sc.duration - 1.8) / nFl)) * 100) / 100;
          if (ft + 0.6 > sc.duration) break;
          M.setKey(FL.tracks.opacity, ft, 0, "step"); M.setKey(FL.tracks.opacity, ft + 0.04, fpeak, "step"); M.setKey(FL.tracks.opacity, ft + 0.1, fpeak * 0.25, "step"); M.setKey(FL.tracks.opacity, ft + 0.14, fpeak * 0.8, "linear"); M.setKey(FL.tracks.opacity, ft + 0.4, 0, "linear");   // çift çakma
          var thAt = Math.round((ft + 0.45 + srnd("th" + fi2) * 0.8) * 100) / 100;   // gürleme uzaktan, biraz gecikmeli
          cue("thunder", thAt); shakes.push({ at: thAt, amp: 0.005, dur: 0.5 });
          flashes++;
        }
        if (flashes) { var hudAt = -1; for (var hi2 = 0; hi2 < sc.layers.length; hi2++) if (sc.layers[hi2].hud) { hudAt = hi2; break; } if (hudAt < 0) sc.layers.push(FL); else sc.layers.splice(hudAt, 0, FL); }   // alt yazılar çakmanın üstünde kalır
      }
      if (weatherLayers.length) {   // yağmur, kar ve sis karakterlerin önünde ama replik balonları ve altyazıların altında
        var textAt = -1;
        for (var ti = 0; ti < sc.layers.length; ti++) if (sc.layers[ti].type === "text" && !sc.layers[ti].hud) { textAt = ti; break; }
        if (textAt < 0) weatherLayers.forEach(function (WL) { sc.layers.push(WL); });
        else sc.layers.splice.apply(sc.layers, [textAt, 0].concat(weatherLayers));
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
        if (outdoor && !night && (kind === "orman" || time === "aksam" || windy) && kind !== "deniz") {   // düşen yapraklar (rüzgârda daha hızlı)
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
            fx(LL, "float", 0, null, { strength: Math.round((windy ? 60 : 28) * k), speed: (windy ? 0.9 : 0.45) + rnd01("lv" + li2) * 0.2, tilt: 30 });
            if (windy) fx(LL, "drift", 0, null, { speed: 90 + rnd01("ld" + li2) * 60, dir: "right", wrap: "yes" });
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
      bgLayers.forEach(function (BL, bi) {
        M.setKey(BL.tracks.sx, 0, BL.base.sx, "linear"); M.setKey(BL.tracks.sy, 0, BL.base.sy, "linear");
        M.setKey(BL.tracks.sx, sc.duration, pushIn ? bgCov[bi] * 1.05 : bgCov[bi], "linear"); M.setKey(BL.tracks.sy, sc.duration, pushIn ? bgCov[bi] * 1.05 : bgCov[bi], "linear");
      });
      /* Ortam sesi (sentez): yağmur, rüzgâr, kuşlar, cırcır böcekleri, dalga, şehir, uzay */
      if (settings.sfx !== false) {
        var amb = kind === "ic" ? (rainy ? "rain" : "") : rainy ? "rain" : (windy || weather === "kar") ? "wind" : kind === "deniz" ? "waves" : kind === "sehir" ? "city" : kind === "uzay" ? "space" : (time === "gece" ? "crickets" : "birds");
        if (amb) { var ambCue = { t: 0, type: "amb", amb: amb, dur: Math.round(sc.duration * 100) / 100 }; if (kind === "ic") ambCue.vol = 0.35; sc.sfx.push(ambCue); }   // iç mekânda yağmur camdan kısık duyulur
        if (storm && outdoor) sc.sfx.push({ t: 0, type: "amb", amb: "wind", dur: Math.round(sc.duration * 100) / 100, vol: 0.7 });   // fırtına: yağmurun üstüne rüzgâr uğultusu
      }
      /* Kamera sarsıntısı: düşme ve gök gürültüsünde kısa titreme + hafif yaklaşma (mevcut kamera yolunun üstüne) */
      shakes.forEach(function (sh, si) {
        var n = 7;
        if (sh.at < 0.05 || sh.at + sh.dur > sc.duration) return;
        ["x", "y", "zoom"].forEach(function (prop) {
          var tr = sc.camera.tracks[prop], pts = [];
          for (var i = 0; i <= n; i++) { var tt = Math.round((sh.at + sh.dur * i / n) * 1000) / 1000; pts.push({ t: tt, v: M.trackValue(tr, tt, sc.camera.base[prop]) }); }
          pts.forEach(function (p, i) {
            var decay = 1 - i / n, edge = i === 0 || i === n;
            var d = edge ? 0 : prop === "zoom" ? 0.03 * decay : (srnd("sh" + si + prop + i) - 0.5) * 2 * sh.amp * decay;
            M.setKey(tr, p.t, Math.round((p.v + d) * 10000) / 10000, "linear");
          });
        });
      });
      /* Alan derinliği: kamera yaklaşınca uzak arka plan katmanları bulanır, karakter öne çıkar */
      var zk = sc.camera.tracks.zoom;
      function blurOf(z) { return Math.round(Math.max(0, Math.min(10 * k, (z - 1.1) * 30 * k)) * 10) / 10; }
      if (zk.length && zk.some(function (q) { return blurOf(q.v) > 0; })) bgLayers.forEach(function (BL) { if (BL.parallax <= 0.9) zk.forEach(function (q) { M.setKey(BL.tracks.blur, q.t, blurOf(q.v), q.e); }); });
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
    "Karabaş havlar.                → hayvan sesi balonu (havlar, miyavlar, cıvıldar). Herkes ... → sahnedeki tüm karakterler",
    "SAHNE 2 - PARK - AKŞAM - YAĞMURLU → hava: YAĞMURLU, KARLI, SİSLİ, RÜZGARLI, FIRTINALI (şimşek + gök gürültüsü).   Ali topu Ayşe'ye atar. / Ayşe topu yakalar. → nesne uçar",
    "AYŞE (içinden): Keşke...        → düşünce balonu.   ALİ (kızgın): Kim o?! → bağırma balonu.   Kapı çalar. / Telefon çalar. → ses + TAK TAK! yazısı"
  ].join("\n");

  return { parse: parse, analyze: analyze, analyzeAction: analyzeAction, splitLine: splitLine, lineDuration: lineDuration, emotionOf: emotionOf,
    placeKind: placeKind, build: build, metrics: metrics, voiceKey: voiceKey, voiceLines: voiceLines, mouthPattern: mouthPattern, splitHeading: splitHeading, SAMPLE: SAMPLE, HELP: HELP, norm: norm, titleCase: titleCase };
});
