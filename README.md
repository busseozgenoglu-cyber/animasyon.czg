# Canlandır — görselden çizgi film

Tarayıcıda çalışan animasyon programı. Çizimlerinizi, fotoğraflarınızı ya da çıkartmalarınızı
yükleyin; tek tıkla zıplasın, yürüsün, uçsun; **GIF, MP4, WebM ya da PNG kare dizisi** olarak indirin.
Kurulum yok, sunucu yok, dosyalarınız bilgisayarınızdan çıkmaz.

## Çalıştırma

```bash
npm start            # http://localhost:8080  (Node 18+)
# ya da
python3 -m http.server 8080
```

Dosyayı doğrudan çift tıklayarak açmak yerine bir yerel sunucu kullanın; GIF kodlama işçisi ve
otomatik kayıt `http://` üzerinden çalışır. (Dosyadan açılırsa GIF ana iş parçacığında kodlanır.)

**GitHub Pages ile yayınlamak için:** Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
Derleme adımı yoktur; `.nojekyll` dosyası hazırdır.

## Kolay mod (varsayılan)

Sayfa ilk açıldığında üç adımlı sihirbaz gelir; başka bir şey bilmek gerekmez:

1. **Karakterler** — **🎭 Hazır karakter seç** ile kütüphaneden ekle (18 hazır karakter; tüm kareleri hazır gelir) ya da kart aç, ad yaz, kendi resmini tıkla/sürükle.
   İsteğe bağlı ek resimler (ağzı açık kare, adım kareleri, göz kırpma, duygular); her kartta yüz yönü ve **Boy** seçimi.
2. **Senaryo** — düğmelerle satır ekle: *Yeni sahne*, *Replik ▾* (kim konuşsun), *Eylem ▾* (kim, ne yapsın: girer, zıplar, el sallar…), *Anlatıcı*.
   Yazdıkça sahne/replik sayısı ve tahmini süre görünür. “Örnek senaryoyu yükle” ile hemen deneyebilirsin.
3. **Film** — otomatik üretilen filmi izle, tek tıkla **MP4 / GIF / WebM** indir, istersen projeyi kaydet.

2. adımda **film biçimi** (yatay / kare / dikey) ve isteğe bağlı ince ayarlar (karakter boyu, konuşma hızı, balon rengi, kartlar, ses efektleri);
3. adımda **müzik / ses** ekleme (videolara karışır), tam ekran önizleme, dışa aktarmayı iptal.

“Gelişmiş stüdyo ›” katman, zaman çizelgesi ve efekt düzeyinde ince ayar içindir; oradan **✨ Kolay mod** ile geri dönülür. Tercih hatırlanır.
Uygulama bir kez açıldıktan sonra çevrimdışı da çalışır (service worker) ve telefona "ana ekrana ekle" ile kurulabilir.

## Senaryodan otomatik film

Üstteki **🎬 Senaryo** düğmesi (Ctrl+G): senaryoyu yaz, karakterlerin görsellerini yükle, **Filmi üret** de.
Program sahneleri, arka planları, girişleri/çıkışları, konuşma balonlarını, duyguları ve hareketleri kendisi kurar;
sonuç stüdyoda açılır, istediğin yeri elle düzeltip GIF/MP4 olarak alırsın.

```
BAŞLIK: Kayıp Top
YAZAN: Sen

SAHNE 1 - PARK - GÜNDÜZ
Ali soldan girer.
ALİ: Topum nerede? Sabahtan beri arıyorum.
Ayşe sağdan koşarak girer.
AYŞE (mutlu): Ali! Bak ne buldum!
Ali zıplar.
Ali Ayşe'ye doğru yürür.
ANLATICI: Ve iki arkadaş oynamaya başladı.
Ali ve Ayşe sağa çıkar.
```

- **Sahne başlığı:** `SAHNE 1 - MEKÂN - ZAMAN` (zaman: GÜNDÜZ, SABAH, AKŞAM, GECE). Yüklenen arka plan adı mekânla eşleşirse o kullanılır;
  yoksa mekâna (park, orman, şehir, deniz, dağ, oda, uzay…) ve zamana göre çizilmiş bir arka plan üretilir (bulutlar akar).
- **Replik:** `ALİ: metin` — balon karakterin başının üstünde çıkar, konuşurken karakter kıpırdar (konuşma karesi yüklediysen ağzı oynar).
  Parantez içi duygu: `(mutlu)`, `(üzgün)`, `(kızgın)`, `(şaşkın)`, `(korkmuş)`, `(fısıldayarak)`, `(düşünceli)`, `(yorgun)`.
- **Eylem:** düz cümle — girer, çıkar, yürür, koşar, zıplar, döner, düşer, kalkar, uçar, iner, el sallar, güler, ağlar, kızar, şaşırır,
  korkar, dans eder, oturur, uyur, uyanır, düşünür, bakar/görür, sarılır, alkışlar, şarkı söyler, geri çekilir, kayar, yüzer, esner,
  atar, yakalar, yatar, büyür, küçülür, saklanır, bekler. Yön: `sağdan/soldan`, `sağa/sola`;
  hedef: `Ali Ayşe'ye doğru yürür`, `Ali Ayşe'ye sarılır`; birlikte: `Ali ve Ayşe`, `Herkes`; süre: `2 saniye bekler`; hız: `koşarak`, `yavaşça`.
  Ünlemle biten replikte karakter hafifçe zıplar, soru işaretinde başını yana eğer; dinleyen karakter konuşana döner ve başını sallar.
- **Arka plan:** her sahnede kilitli bir “Arka plan” katmanı olarak gelir ve yavaşça yaklaşır/uzaklaşır (kamera hissi); bulutlar akar.
- **Anlatıcı:** `ANLATICI: metin` → alt yazı.
- **Kamera:** `Kamera Ayşe'ye yaklaşır.` (yakın çekim), `Kamera uzaklaşır.` (genel plan), `Kamera sağa kayar.` (kaydırma), `Yakın çekim: Ali`.
  Kamera hareketi sıradaki replikle örtüşür; stüdyoda sahne özelliklerindeki **Kamera** bölümünden ve zaman çizelgesindeki kamera satırından elle de kurulur.
- **Ses efektleri:** balon açılırken *pop*, giriş/çıkışta *vınn*, zıplamada *boing*, düşmede *güm*, alkış, başlıkta çan. Dosya gerekmez (tarayıcıda sentezlenir);
  önizlemede çalar, WebM/MP4 dışa aktarımına müzikle birlikte karışır. Sihirbazın ayarlarından kapatılabilir.
- **Hava durumu:** sahne başlığına `YAĞMURLU`, `KARLI`, `SİSLİ` ekle (`SAHNE 2 - PARK - AKŞAM - YAĞMURLU`): yağmur ya da kar karakterlerin önünde akar, ton soğur.
- **Nesneler:** `Ali topu Ayşe'ye atar.` → top kavisle uçar ve Ayşe'nin eline gelir; `Ayşe topu yakalar.` (top, elma, taş, kartopu). Sarılınca kalpler yükselir,
  düşünce baş döndüren yıldızlar döner, korkuda ter damlası düşer, koşuda hız çizgileri çıkar.
- **Hayvanlar:** `Karabaş havlar.`, `Pamuk miyavlar.`, `Cik cıvıldar.`, `Karabaş kuyruk sallar.` → ses balonu ve hareket.
- **Kalabalık:** 4+ karakterde boylar kendiliğinden küçülür, sığmayınca arka sıra açılır (arka sıra daha küçük ve yukarıda, önü kapatmaz).
- **Canlandırma ayrıntıları:** konuşurken ağız gerçek sese (seslendirme klibinin zarfı) ya da metnin hece ritmine göre açılıp kapanır; cümle başlarında el-kol jestleri yapılır,
  dinleyen karakter konuşana bakar (göz yönü); yürüyüş 4 karelik temas–geçiş döngüsüyle ve adım sesleriyle; zıplamadan önce çömelme (hazırlık);
  sahneler arası sırayla silme ve siyaha geçiş, son sahnede iris kapanışı; gece mavisi / akşam turuncusu / sabah sıcaklığı renk tonu;
  kamera hareketinde arka plan ve bulutlar daha az kayar (paralaks derinliği) ve kamera konuşana doğru fark edilmeden kayar;
  kızgın, şaşkın, korkmuş, üzgün ve fısıltılı repliklerde kamera konuşana yakın çekim yapar; soru ve ünlemden sonra kısa bir tepki beklemesi vardır;
  seslendirme sırasında müzik kısılır (önizlemede ve videoda); başlık kartında parıltılar süzülür;
  yürürken hareket yönüne eğilir, dönüşte esner, varışta yerine oturur; zıplayınca ve düşünce yerde toz bulutu çıkar; boş anlarda ufak kıpırdanır;
  dinleyenler ünlemde irkilir, öfkeli replikte geri çekilir, üzgün replikte yaklaşır. Kamera ipucu olmayan konuşmalı sahnelerde kamera fark edilmeden yaklaşır.
  Çizilen arka planlarda ortam canlıdır: gündüz kuşlar geçer, kırda ve ormanda kelebekler uçar, gece ateşböcekleri ve parıldayan yıldızlar, akşam ve ormanda düşen yapraklar, uzayda kuyruklu yıldız.
- **Karakter görselleri:** her karaktere bir duruş görseli yeter; saydam PNG'lerin boş kenarları kendiliğinden kırpılır. İstersen ağzı açık kare (konuşma), adım kareleri (yürüme),
  göz kırpma karesi ve duygu görselleri ekle; dosya adından rol tahmin edilir (`ali-konusma.png`, `ayse-yuru1.png`, `ali-kirpma.png`, `ali-mutlu.png`).
  Her karakter yerde yumuşak bir **gölge** taşır (zıplayınca küçülür) ve göz kırpma karesi varsa 2–5 saniyede bir **göz kırpar**.
- **Hazır karakterler (🎭):** 18 karakterlik kütüphane — Ali, Ayşe, Can, Elif, Anne, Baba, Dede, Nine, Öğretmen, Kral, Prenses, Şövalye, Korsan, Uzaylı, Robi (robot),
  Karabaş (köpek), Pamuk (kedi), Cik (kuş). Hepsi aynı çizgi film üslubunda, tuvalde çizilir; duruş, 2 konuşma, 2 yürüme, göz kırpma ve 4 duygu karesiyle gelir.
  Adı yeniden yazılabilir (`Karabaş` → `Boncuk`); **Boy** seçicisiyle sahnedeki boyu ayarlanır (çocuklar, yaşlılar ve evcil hayvanlar kendiliğinden daha kısa gelir). Senaryoda geçen ama görseli olmayan karakter, adı kütüphanedekiyle eşleşiyorsa o karakterle,
  eşleşmiyorsa isim etiketli otomatik bir karakterle çizilir. `Köpek sağdan girer.` gibi bir girişle sahneye gelen ad kendiliğinden karakter sayılır.

## Seslendirme: karakterler kendi sesiyle konuşsun (SesKlon)

Canlandır, [SesKlon](https://github.com/busseozgenoglu-cyber/ganzlab) ile (kendi bilgisayarında çalışan, Türkçe'ye özel ses klonlama
ve metin seslendirme sunucusu) replikleri gerçek sesle okutur:

1. SesKlon'u kur ve çalıştır (`docker compose up -d` ya da `run.sh` / `run.ps1`) → **http://localhost:8000**. **Sesler** sekmesinden
   10–15 saniyelik kayıtlarla sesler ekle (her karakter için bir ses; izinli kayıtlar).
2. Canlandır'da 1. adımdaki **🎙️ Seslendirme** panelini aç, adresi (ve varsa API anahtarını) yaz, **Bağlan** de. Her karakter kartında
   **ses seçici** ve **▶ dene** çıkar; **Sesleri otomatik eşle** adı tutan sesi karaktere verir. Anlatıcı sesi ve konuşma stili panelden seçilir.
3. **Filmi üret** deyince replik ve anlatım parçaları sırayla seslendirilir (düğme ilerlemeyi gösterir; **durdur** dersen eldeki seslerle devam eder).
   Balonlar ve ağız hareketi gerçek konuşma süresine göre kurulur; sesler önizlemede çalar ve MP4/WebM dışa aktarımına müzik ve efektlerle birlikte karışır.

- Üretilen sesler projede saklanır (aynı metin + ses + duygu yeniden istenmez); parantez duygusu (`(mutlu)`, `(üzgün)`…) SesKlon'un duygu
  etiketine çevrilir. Sunucuya ulaşılamazsa film sessiz üretilir ve not düşülür.
- Sesli MP4 kaydedemeyen tarayıcılarda (ör. Firefox) film sesiyle birlikte WebM olarak verilir.
- CPU'da üretim yavaştır (10 sn ses ≈ 1–3 dk); NVIDIA GPU önerilir. Sunucu başka bir makinedeyse adresi ona göre yaz (SesKlon CORS'u açıktır;
  internete açıyorsan API anahtarı ve HTTPS kullan).
- Test için gerçek sunucu olmadan: `node test/mock-sesklon.js 8000` sahte bir SesKlon başlatır (sinüs sesli).

## Üç adımda çizgi film

1. **Görsel ekle.** PNG, JPG, WebP, GIF, SVG; sürükle-bırak ya da yapıştır. Birden çok çizimi
   *Kare dizisi* olarak eklerseniz sırayla oynar (yürüme döngüsü, konuşan ağız).
2. **Hareket seç.** Katmanı tıklayın, sağ panelden efekt ekleyin; güç, hız, yön ve süreyi kaydırıcılarla ayarlayın.
3. **Dışa aktar.** Sağ üstten GIF, MP4, WebM ya da PNG dizisi. Projeyi `.canlandir.json` olarak kaydedip sonra açabilirsiniz.

İlk açılışta **Örnek film** düğmesi hazır bir mini filmle başlar.

## Özellikler

- **Katmanlar:** görsel, çok kareli dizi (döngü / gidip gel / bir kez), metin ve konuşma balonu (yazı tipi, kontur, kuyruk, harf harf yazma).
- **26 hareket efekti:**
  - Sürekli: Zıpla, Süzül, Titre, Sallan, Dön, Nefes Al, Nabız, Yalpala, Yürü, Kay, Yanıp Sön, Çevir, Jöle, Konuş, Eğil, Daire Çiz
  - Giriş: Kayarak, Belir, Büyüyerek, Düşerek, Patlayarak, Yazarak/Süpürerek
  - Çıkış: Kayarak, Kaybol, Küçülerek, Düşerek
- **Anahtar kareler:** konum, ölçek, açı, opaklık; 13 geçiş eğrisi (poz-poz için *ani geçiş* dahil); sahnede gizmo ile taşı/ölçekle/döndür; zaman çizelgesinde sürükle.
- **Sahneler:** peş peşe tek film, siyaha geçiş, sahne başına arka plan (renk, geçiş, görsel, saydam).
- **Ses:** MP3/WAV/OGG; önizlemede oynar, WebM ve (tarayıcı destekliyorsa) MP4'e karışır.
- **Dışa aktarma:** GIF (kendi kodlayıcımız, arka planda işçi), WebM (süre bilgisi düzeltmeli), MP4 H.264
  (WebCodecs + kendi muxer'ımız; yoksa MediaRecorder; ikisi de yoksa seçenek kapalı — Chrome, Edge, Safari üretir),
  PNG kare dizisi (ZIP, saydamlık korunur), tek kare PNG, proje dosyası.
- Geri al / ileri al, IndexedDB otomatik kayıt, soğan zarı, ızgara, klavye kısayolları (uygulamadaki **?** düğmesi), dar ekran düzeni.

## Dosyalar

| Dosya | Görev |
| --- | --- |
| `index.html`, `style.css` | Arayüz iskeleti ve tema |
| `app.js` | Durum, geçmiş, içe alma, oynatma, sahne tuvali ve gizmo, klavye, otomatik kayıt |
| `ui.js` | Katman listesi, özellikler paneli, zaman çizelgesi, sahne sekmeleri, dışa aktarma penceresi |
| `motion.js` | Easing eğrileri, anahtar kare enterpolasyonu, efekt tanımları |
| `model.js` | Proje veri modeli, varsayılanlar, dosya doğrulama |
| `render.js` | Sahne çizimi, metin/balon, isabet testi, küçük resimler |
| `exporter.js` | GIF / video / PNG-ZIP / proje dosyası üretimi, sahneleri birleştiren zaman çizgisi |
| `easy.js` | Kolay mod: üç adımlı sihirbaz (karakter kartları, satır ekleme düğmeleri, önizleme, tek tıkla indirme) |
| `director.js` | Senaryo ayrıştırıcı, eylem/duygu/kamera çözümleme, otomatik sahneleme (kalabalık yerleşimi, göz kırpma, gölge, kamera ve ses ipuçları), prosedürel arka plan |
| `characters.js` | Hazır karakter kütüphanesi: parametrik insanlar, robot, köpek, kedi, kuş; tüm roller tuvalde çizilir |
| `sfx.js` | Sentezlenmiş ses efektleri ve seslendirme klipleri (Web Audio): sahne ipuçlarını önizlemede çalar, dışa aktarıma karıştırır |
| `voice.js` | SesKlon istemcisi: bağlantı, ses listesi, replik seslendirme (iş kuyruğu), karakter ses seçiciler ve panel |
| `test/mock-sesklon.js` | Testler için sahte SesKlon sunucusu (API sözleşmesinin kullanılan bölümü) |
| `demo.js` | Tuvalde çizilen örnek film |
| `lib/gif-encoder.js`, `lib/gif-worker.js` | Bağımlılıksız GIF89a kodlayıcı (medyan kesme, Floyd–Steinberg, LZW) |
| `lib/mp4-muxer.js` | WebCodecs H.264 çıktısını MP4'e yazan muxer |
| `lib/webm-fix.js` | MediaRecorder WebM'ine süre bilgisi ekler |
| `lib/zip.js` | Bağımlılıksız ZIP yazıcı |
| `serve.js` | Yerel statik sunucu (`npm start`) |
| `sw.js`, `manifest.webmanifest` | Çevrimdışı çalışma ve ana ekrana kurulum (PWA) |

Üçüncü parti bağımlılık yoktur; derleme adımı yoktur.

## Testler

```bash
npm test                 # birim testleri (GIF, ZIP, hareket motoru, MP4 muxer, WebM, senaryo ayrıştırıcı) — Node yeter
npm i -D playwright && npx playwright install chromium
npm run test:e2e         # tarayıcıda uçtan uca akış: içe alma, efekt, gizmo, anahtar kare, dışa aktarma, otomatik kayıt
```

`ffprobe` ve `unzip` yüklüyse birim testleri üretilen dosyaları onlarla da doğrular.

## Tarayıcı desteği

Güncel Chrome, Edge, Firefox ve Safari. MP4 çıktısı H.264 kodlayabilen tarayıcılarda (Chrome, Edge, Safari;
Firefox'ta işletim sistemi destekliyorsa) açılır; diğerlerinde WebM ve GIF her zaman vardır.

Geliştiren: [Ganz Dijital](https://ganzz.digital)
