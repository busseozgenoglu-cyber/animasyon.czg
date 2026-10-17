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

## Üç adımda çizgi film

1. **Görsel ekle.** PNG, JPG, WebP, GIF, SVG; sürükle-bırak ya da yapıştır. Birden çok çizimi
   *Kare dizisi* olarak eklerseniz sırayla oynar (yürüme döngüsü, konuşan ağız).
2. **Hareket seç.** Katmanı tıklayın, sağ panelden efekt ekleyin; güç, hız, yön ve süreyi kaydırıcılarla ayarlayın.
3. **Dışa aktar.** Sağ üstten GIF, MP4, WebM ya da PNG dizisi. Projeyi `.canlandir.json` olarak kaydedip sonra açabilirsiniz.

İlk açılışta **Örnek film** düğmesi hazır bir mini filmle başlar.

## Özellikler

- **Katmanlar:** görsel, çok kareli dizi (döngü / gidip gel / bir kez), metin ve konuşma balonu (yazı tipi, kontur, kuyruk, harf harf yazma).
- **24 hareket efekti:**
  - Sürekli: Zıpla, Süzül, Titre, Sallan, Dön, Nefes Al, Nabız, Yalpala, Yürü, Kay, Yanıp Sön, Çevir, Jöle, Daire Çiz
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
| `demo.js` | Tuvalde çizilen örnek film |
| `lib/gif-encoder.js`, `lib/gif-worker.js` | Bağımlılıksız GIF89a kodlayıcı (medyan kesme, Floyd–Steinberg, LZW) |
| `lib/mp4-muxer.js` | WebCodecs H.264 çıktısını MP4'e yazan muxer |
| `lib/webm-fix.js` | MediaRecorder WebM'ine süre bilgisi ekler |
| `lib/zip.js` | Bağımlılıksız ZIP yazıcı |
| `serve.js` | Yerel statik sunucu (`npm start`) |

Üçüncü parti bağımlılık yoktur; derleme adımı yoktur.

## Testler

```bash
npm test                 # birim testleri (GIF, ZIP, hareket motoru, MP4 muxer, WebM) — Node yeter
npm i -D playwright && npx playwright install chromium
npm run test:e2e         # tarayıcıda uçtan uca akış: içe alma, efekt, gizmo, anahtar kare, dışa aktarma, otomatik kayıt
```

`ffprobe` ve `unzip` yüklüyse birim testleri üretilen dosyaları onlarla da doğrular.

## Tarayıcı desteği

Güncel Chrome, Edge, Firefox ve Safari. MP4 çıktısı H.264 kodlayabilen tarayıcılarda (Chrome, Edge, Safari;
Firefox'ta işletim sistemi destekliyorsa) açılır; diğerlerinde WebM ve GIF her zaman vardır.

Geliştiren: [Ganz Dijital](https://ganzz.digital)
