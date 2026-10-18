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

1. **Karakterler** — kart aç, ad yaz, resmi tıkla ya da sürükle. İsteğe bağlı ek resimler (ağzı açık kare, adım kareleri, duygular).
2. **Senaryo** — düğmelerle satır ekle: *Yeni sahne*, *Replik ▾* (kim konuşsun), *Eylem ▾* (kim, ne yapsın: girer, zıplar, el sallar…), *Anlatıcı*.
   Yazdıkça sahne/replik sayısı ve tahmini süre görünür. “Örnek senaryoyu yükle” ile hemen deneyebilirsin.
3. **Film** — otomatik üretilen filmi izle, tek tıkla **MP4 / GIF / WebM** indir, istersen projeyi kaydet.

2. adımda **film biçimi** (yatay / kare / dikey) ve isteğe bağlı ince ayarlar (karakter boyu, konuşma hızı, balon rengi, kartlar);
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
- **Karakter görselleri:** her karaktere bir duruş görseli yeter; saydam PNG'lerin boş kenarları kendiliğinden kırpılır. İstersen ağzı açık kare (konuşma), adım kareleri (yürüme) ve
  duygu görselleri ekle; dosya adından rol tahmin edilir (`ali-konusma.png`, `ayse-yuru1.png`, `ali-mutlu.png`). Görseli olmayan
  karakter için isimli renkli bir yer tutucu çizilir.

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
| `director.js` | Senaryo ayrıştırıcı, eylem/duygu çözümleme, otomatik sahneleme, prosedürel arka plan ve yer tutucu karakterler |
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
