# DataRoute — THY Globe: Tasarım Spec'i

- **Tarih:** 2026-10-06
- **Durum:** Onay bekliyor (kullanıcı tasarımı ve 2026-10-06 ek kararlarını sözlü onayladı; yazılı spec incelemesi bekleniyor)
- **Öncülleri:** `2026-10-05-thy-data-tunnel-design.md` (veri hattı §4 aynen geçerli), Plan 1 (collector, canlı), Plan 2 (tunnel sürümü, yayında ve **değişmeyecek**)
- **Görsel referans:** [jsulpis/realtime-planet-shader](https://github.com/jsulpis/realtime-planet-shader) (GPL-3.0)

## 1. Özet

Tunnel sürümü veriyi okunur kıldı ama "tek bir noktaya akan çizgiler" gibi göründü. Yeni sürümde **dünya ana sahnedir**:

- Gerçek zamanlı dönen, gece şehir ışıkları ve atmosferi olan bir Dünya.
- THY uçuşları, gerçek enlem/boylam/irtifa örneklerinden geçen **kıvrımlı yaylar**.
- Arka planda mevcut iridesan tunnel shader'ı, yıldızların üzerinde soluk bir nebula.
- İki mod:
  - **GLOBE:** tek ekran, kamera sabit.
  - **FOLLOW:** bir uçuş seçilince kamera o yayın boyunca akar. Ekrandaki irtifa, hız, yön vb. her değer kameranın o anki konumundan hesaplanır ve ona birebir senkrondur.

## 2. Kararlar (kullanıcıdan)

| Konu | Karar |
|---|---|
| Önceki build | `omerkilavuz-9ad41.web.app`'te olduğu gibi kalır. `web/` dokunulmaz. |
| Yeni sürüm | Ayrı uygulama `globe/`, ayrı Hosting sitesi **`dataroute-tk`** → `https://dataroute-tk.web.app`. Site kimlikleri nokta içeremez; uygunluk oluştururken kontrol edilir, doluysa `dataroute-tk-globe` denenir. |
| GPL | Kullanıcı: "GPL sorununu boşver, referanstan kopyala." Referans repodan alınan kod/shader parçalarının üstünde yazarın telif başlığı korunur, `NOTICE` dosyasına kaynak yazılır. **`LICENSE` dosyasına dokunulmaz;** lisans yönetimi sahibindedir. |
| Dokular | 8K gündüz + 8K gece. Kaynak ve lisans indirme öncesi ayrıca onaya sunulur (§9). |
| GLOBE | İstendiğinde tek ekran; kamera yaylar boyunca akmaz. |
| Veri kalitesi | Collector düzeltilir (§4.2); globe her rotalı uçuş için soluk **planlı rota yayı** + parlak **gözlenen iz** çizer. |
| FOLLOW hızı | Varsayılan **×240** (8 saatlik uçuş ≈ 2 dk). |
| LIVE | Varsayılan açılış modu: **otomatik tur + tahmini (extrapolated) başlar + olay akışı**; aksiyon durmaz. |
| FOLLOW | Seçili uçuşun yayı boyunca kamera akar; yükseklik, hız vb. değerler doğru ve senkron. |

## 3. Mimari

```
day.json (+ airports) ──► globe/ (Vite + React + TS + Three.js)
                            ├─ astro/     GMST, güneş konumu (saf fonksiyonlar)
                            ├─ geo3d/     enlem/boylam→xyz, eğri, telemetri (saf)
                            ├─ scene/     earth, space, atmosphere, arcs, heads, airports
                            ├─ camera/    GLOBE ⇄ FOLLOW kamera donanımı + geçişler
                            ├─ app/       controller (veri, döngü, seçim, HUD)
                            └─ hud/       sayaçlar, FlightPanel, kaynak/atıf
web/src/data/*  ← `@web/*` takma adıyla paylaşılır (model, timeline, source, palette)
```

- **Paylaşım:** `globe/`, veri katmanını `web/src/data` altından içe aktarır (`@web/*` → `../web/src/*`) ve `@collector/*`'i kullanmaya devam eder. `web/` içindeki hiçbir dosya değiştirilmez.
- **Sahne:** Three.js, 3B bir küre mesh'i. Referanstaki ışın-izleme (ray-trace) yaklaşımı **kullanılmaz** (sabit kameraya çivili, derinlik üretmez). Görünüm bileşenleri küre üstüne taşınır (§5).
- **Derinlik:** Dünya derinlik yazar; yaylar ve başlar derinlik testiyle küre tarafından doğru gizlenir.
- **Render sırası:** uzay → tunnel nebulası → Dünya → atmosfer kabuğu → yaylar → başlar → bloom.

## 4. Veri değişiklikleri (Plan 1'e ek)

### 4.1 Havalimanları
`day.json`'a isteğe bağlı bir alan eklenir (şema v1 geriye uyumlu; eski istemciler yok sayar):

```ts
airports?: Record<string, { lat: number; lon: number; country: string; name?: string }>; // IATA → konum
```

- Collector, günün uçuşlarında geçen havalimanlarını (≈ 230 adet) route önbelleğindeki koordinatlardan üretir. IST ve SAW her zaman dahildir.
- Alan yoksa (eski dosya) globe havalimanı düğümlerini ve planlı yayları çizmez; gözlenen izler çalışır.
- Konum kaynağı adsbdb'dir (havalimanı referans noktası). Rota bilinmeyen uçuşlar (ölçülen ≈ %4) için havalimanı işareti konmaz.

### 4.2 Veri kalitesi: kapsam boşlukları ve "iniş" sınıflaması (ölçüme dayalı)
**Ölçüm (2026-10-06, 1.151 rotalı ve "inmiş" kayıtlı uçuş):** yalnızca 414'ünün (%36) son noktası varış havalimanına 100 km'den yakın; son nokta–varış mesafesi medyanı 754 km, 90. yüzdelik 6.769 km; son noktadaki medyan irtifa ≈ 9.200 ft. Nedenler:
1. adsb.fi alıcıları okyanus, Afrika ve Asya'da seyrek: uçak sinyal dışına çıkıyor.
2. `tracker.step` 45 dakikalık sessizlikten sonra uçuşu "indi" sayıp kapatıyor; sinyal dönünce aynı uçak **yeni uçuş** oluyor (örnek: THY6275 → JFK iki kayıt).

**Düzeltme (`functions/src/tracker.ts`, `publish.ts`, `day-schema.ts`):**
- Her uçuşa `end: "AIRBORNE" | "LANDED" | "LAST_CONTACT"` eklenir. `arr` yalnızca `LANDED` ve `LAST_CONTACT` için dolu, anlamı "son temas zamanı"dır.
- **LANDED:** yerde görüldüğünde; ya da 45 dk sessizlikte, rota biliniyorsa **son nokta varış havalimanına ≤ 150 km ve irtifa < 150 (15.000 ft)** ise.
- **LAST_CONTACT:** 45 dk sessizlik ve LANDED koşulu sağlanmıyorsa. Uçuş **hemen kapatılmaz**: 14 saat boyunca "beklemede" kalır.
- **Birleştirme:** Aynı `icao24` + aynı çağrı kodu ile ≤ 14 saat içinde yeniden görülürse ve fiziksel olarak mümkünse (son nokta ile yeni ilk nokta arasındaki büyük daire mesafesi ≤ 950 km/sa × geçen saat + 100 km) ve önceki uçuş `LANDED` değilse, yeni örnekler **aynı uçuşa eklenir**, aradaki süre bir `gaps` listesine yazılır.
- `Flight.gaps?: [number, number][]`: boşluk başlangıç/bitiş (uçuşa göre göreli saniye). Globe boşlukları soluk çizer.
- 14 saat sonra hâlâ görülmeyen `LAST_CONTACT` uçuşlar kesinleşir. `LANDED` uçuşun ardından aynı uçak yeniden havalanırsa yeni uçuş başlar (mevcut kural).
- Geçmiş 24 saatlik veri yeniden birleştirilmez; yeni kural yeni uçuşlardan itibaren geçerlidir (pencere bir gün içinde yenilenir).
- Testler: boşlukla birleştirme, LANDED ve LAST_CONTACT sınıflaması, imkânsız sıçrayışta birleştirmeme, 14 saat sonra kesinleşme, `gaps` serileştirmesi.

## 5. Sahne ayrıntıları

### 5.1 Koordinat ve zaman sözleşmesi
- **Dünya sabit çerçevesi (ECEF benzeri):** `x = cosφ·sinλ`, `y = sinφ`, `z = cosφ·cosλ`. Y kutup ekseni, λ=0 → +z, doğu → +x. Referans shader'ın `atan(x, z)` / `asin(y)` dokulama kuralıyla aynıdır; dokular bu formülle örneklenir, mesh UV'sine güvenilmez.
- **Atalet çerçevesi:** Kamera ve güneş burada. Dünya, Y ekseni etrafında **Greenwich yıldız açısı θ** kadar doğuya döner: `earthGroup.rotation.y = θ`. Atalet +z yönü, ilkbahar noktasıdır (RA=0); RA, +z'den +x'e doğru artar.
- **Görüntülenen an:** `T = window.from + tRel`. GLOBE'da döngü zamanıdır (REPLAY 24 saat / 90 sn; LIVE gerçek saat). FOLLOW'da uçuş saatidir (§6.3).

### 5.2 Gerçek zamanlı dönüş ve güneş (`astro/`)
Saf fonksiyonlar, Astronomical Almanac düşük duyarlıklı formülleri (~0,01°):
- `jd = unixSec/86400 + 2440587.5`, `n = jd − 2451545.0`
- `gmstDeg = (280.46061837 + 360.98564736629·n) mod 360`
- Güneş: `L = 280.460 + 0.9856474·n`, `g = 357.528 + 0.9856003·n`, `λecl = L + 1.915·sin g + 0.020·sin 2g`, `ε = 23.439 − 4e-7·n`; `α = atan2(cos ε·sin λecl, cos λecl)`, `δ = asin(sin ε·sin λecl)`.
- Güneş yönü (atalet): `s = (cosδ·sinα, sinδ, cosδ·cosα)`.
- Alt-solar nokta: enlem = δ, boylam = α − θ.
- REPLAY'de 24 saat 90 sn'ye sıkıştığı için Dünya bir tam tur döner, gündüz/gece sınırı süpürülür. LIVE'da gerçek hızdadır (saatte 15°).
- Kullanıcı sürükleme ofseti (yaw/pitch), kameraya uygulanır; fiziksel dönüşü bozmaz.

### 5.3 Dünya (`scene/earth`)
- `SphereGeometry` (yüksek segment) + özel `ShaderMaterial`. Referanstan uyarlanan bileşenler: gündüz rengi, gece şehir ışıkları (güneşe göre karartılmış), bulut karışımı, specular, bump'tan normal, Reinhard tarzı ton eşleme, vinyet.
- Güneş yönü, atalet çerçevesinde `uSunDir` olarak verilir; ışıklandırma Dünya dönüşünden bağımsız doğru terminatörü üretir.
- **Atmosfer:** Fresnel tabanlı ikinci bir kabuk (arka yüz, additive).
- **Uzay:** Yıldız dokusu (küre içi). **Nebula:** Plan 2'deki tunnel shader'ı düşük enerjiyle tam ekran arka plan olarak çizilir (kamera bağımsız, yavaş akış).

### 5.4 Yaylar (`scene/arcs`, `geo3d/curve`)
- Her uçuşun `s` örnekleri (zaman, irtifa/100 ft, enlem, boylam) → 3B noktalar: `P = (1 + k·alt_km/6371)·ecef(φ, λ)`, **k = 30** (görsel abartı). HUD gerçek irtifayı gösterir.
- Noktalar arası **Catmull-Rom** (centripetal) eğri, zaman parametreli. Her uçuş, model kurulurken en fazla 96 noktaya eşit zaman aralıklarıyla yeniden örneklenir; toplam segment sayısı böylece sınırlı kalır.
- **Planlı rota:** rotası bilinen (havalimanları `airports`'ta bulunan) her uçuşta kalkış ile varış havalimanı arasında **soluk bir büyük daire yayı** (irtifa kaldırması yarım sinüs, tepe ≈ seyir irtifası) her zaman çizilir. Üstüne **gözlenen iz** parlak çizilir. `gaps` aralıkları ve gözlenmeyen kısımlar soluk kalır.
- **Gözlenen parça** düz çizgi, **projected** parçalar kesikli:
  - Havadaki uçuşun henüz uçulmamış kısmı: son örnekten varış havalimanına büyük daire yayı.
  - Kalkış ve iniş uçları: havalimanı ile ilk/son örnek arasındaki kısa bağlantı.
  - Bu parçalar HUD'da "PROJECTED" olarak etiketlenir, gerçek veri gibi sunulmaz.
- İstanbul nabız atan bir düğüm, destinasyonlar iniş anında yanıp sönen noktalar.
- Zaman kırpma Plan 2'deki gibi: `t > uCur` olan segmentler çizilmez, baş (head) kamera noktasındadır.
- Renk: Plan 2'nin bölge paleti; yaşa göre soluk (`exp(−2.2·yaş)`), gece tarafında parlaklık artışı yok (fiziksel olmayan efekt eklenmez).
- Derinlik testi açık, derinlik yazma kapalı, additive karışım; bloom `postprocessing`.
- Seçim: Plan 2'deki ekran uzayı en yakın nokta yöntemi (12 px), kürenin arkasındaki noktalar elenir (kamera-küre görünürlük testi).

## 6. Modlar ve kamera

### 6.1 Kamera donanımı (`camera/`)
- Durum makinesi: `GLOBE → TO_FOLLOW → FOLLOW → TO_GLOBE → GLOBE`.
- **GLOBE kamerası:** Dünya merkezli yörünge, sabit uzaklık (≈ 3,2 R), hafif kuzey eğimi; sürükleme yaw/pitch ofseti ekler, bırakınca atalet (damping 0,95).
- **FOLLOW kamerası (chase):** Pozisyon = `P(u) − tangent·0,35 + up·0,12` (R=1 birimi), `up` yerel yüzey normali. Bakış hedefi = yayda ilerideki nokta `P(u + Δ)`. Pozisyon ve hedef kritik sönümlü yumuşatma (smooth damp) ile izlenir; yön ani dönüşü yoktur.
- **Geçişler:** `TO_FOLLOW` ve `TO_GLOBE` 2,5 sn, ease-in-out; küresel yörünge üzerinde yay boyunca geçer (kameranın Dünya'yı kesmesi engellenir: yarıçap alt sınırı 1,05 R). Geçiş sırasında Dünya dönüşü ve HUD sürer.
- `prefers-reduced-motion`: geçiş süreleri ×2, kamera sallanması/dönüş ×0,4.

### 6.2 GLOBE ve LIVE
- **Açılış modu LIVE**'dır (gerçek "şimdi"). REPLAY elle seçilir (`R`); 24 saat **3 dk**'da oynar (×480), 15 sn LIVE beklemesi yoktur: bitince LIVE'a döner.
- **Tahmini başlar (extrapolated):** Her havadaki uçuşun başı, iki örnek arasında son ölçülen yer hızı ve yönle her karede ilerletilir (büyük daire üstünde); yeni veri gelince 1,5 sn'lik yumuşatmayla düzeltilir. HUD'da başlar "EXTRAPOLATED" etiketiyle ayrılır; ölçülen değerler "UPDATED 38 S AGO" ile yaşını gösterir. Tahmin en çok 5 dk sürer, sonra baş durur ve "LAST CONTACT" olur.
- **Otomatik tur (LIVE'da):** GLOBE (≈ 25 sn) → havadaki bir uçuş seçilir (uzun menzillileri tercih eder) → FOLLOW'da **catch-up**: o ana kadar uçulan iz ×240 ile oynatılır, canlı başa ulaşınca kısa süre (≈ 20 sn) canlı kalınır → GLOBE'a dönülür → bir sonraki. Seçim son 3 turdakini tekrarlamaz. Girdi gelince tur durur (manuel mod), 20 sn sonra kaldığı yerden sürer.
- **Olay akışı:** kalkış/iniş ve LAST CONTACT olayları (`TK1 DEPARTED IST → JFK`, `TK80 LANDED ESB`) alt köşede akar (son 6 satır). Olay anında ilgili havalimanı düğümü nabız atar. Olaylar veri yenilenmelerinde önceki ve yeni model karşılaştırılarak çıkarılır; ilk yüklemede olay üretilmez.
- Sürekli hareket: kamera GLOBE'da çok yavaş bir yaw sürüklenmesi (≈ 0,6°/sn, fiziksel dönüşten ayrı, `prefers-reduced-motion`'da ×0,4) yapar.
- Etkileşim: sürükle (döndür), üzerine gel (tooltip), tıkla (FOLLOW), `Space`, `←` `→`, `R` (REPLAY ⇄ LIVE), `T` (otomatik tur aç/kapa), `H`, `F`.

### 6.3 FOLLOW ve zaman modeli
- Seçim: bir yayın üstüne tıklama (ya da otomatik spotlight'a tıklama). `Esc`, boş yere tıklama ya da `G` GLOBE'a döner.
- **Uçuş saati `u`**: `[dep, end]` aralığında ilerler. `end`, inmiş uçuşta iniş zamanı, havadaki uçuşta son örnek zamanıdır.
- **Oynatma hızı:** varsayılan **×240**; süre `clamp((end − dep)/240, 25 sn, 240 sn)` olacak şekilde hız türetilir (8 saatlik uçuş ≈ 2 dk; 1 saatlik 25 sn'ye kıstırılır, çok uzun uçuş en fazla 4 dk). `Space` duraklatır, `←` `→` ±5 dk atlar, `[` `]` hızı sırayla ×60, ×120, ×240, ×480, ×960 basamaklarında değiştirir.
- **Zaman senkronu:** `T = dep + u` olduğundan Dünya dönüşü, gündüz/gece sınırı ve HUD saati aynı saati kullanır; uçak gerçekten karanlığa uçar.
- Havadaki uçuşta baş canlı noktaya ulaşınca hız ×1'e iner, kamera tahmini başı izler ("LIVE HEAD · EXTRAPOLATED"). `LAST_CONTACT` uçuşta kamera son gözlenen noktada durur ve "LAST CONTACT" yazar; kapsam boşluklarından (`gaps`) geçerken değerler "NO DATA" olur ve kamera boşluğu planlı yay üstünde aynı hızla geçer.
- Veri yenilenirken (2 dk) seçili uçuş `id` ile korunur; kaybolursa FOLLOW kapanır ve GLOBE'a dönülür.

## 7. HUD ve doğru değerler

Tüm değerler **kameranın o anki uçuş saatinden** hesaplanır (`geo3d/telemetry`, saf fonksiyonlar). Hiçbir değer uydurulmaz.

| Alan | Tanım |
|---|---|
| ALT | Örnek irtifalarının zamanda doğrusal ara değeri; `FL370` ve `37,000 FT` (çözünürlük 100 ft) |
| GS | Her segment için büyük daire mesafesi ÷ Δt (knot); segment ortası noktaları arasında doğrusal geçişle yumuşatılır. Toplayıcı 2 dk'da bir örnek aldığı için **2 dakikalık ortalamadır**; HUD alt notunda belirtilir |
| HDG | Segmentin başlangıç pusula yönü; ortalar arasında açısal ara değer |
| VS | Segment irtifa farkı ÷ Δt (ft/dk), aynı yumuşatma |
| PHASE | `CLIMB` (VS > +300 ft/dk ve alt < 0,9·maks), `DESCENT` (VS < −300), aksi `CRUISE`; projected parçada `—` |
| DIST | Katedilen büyük daire toplamı / toplam. `LANDED` uçuşta gözlenen toplam; havada veya `LAST_CONTACT`'ta gözlenen + planlı rota kalanı, "EST" etiketli. Boşluklardaki mesafe planlı yaydan sayılır ve "EST" olur |
| ELAPSED | `u − dep` |
| REMAINING / ETA | `LANDED` uçuşta `arr − u`; havada kalan mesafe ÷ son 3 segmentin ortalama hızı, **"EST"** etiketli; `LAST_CONTACT`'ta gösterilmez |
| UTC / LOCAL | `T` (UTC); yerel güneş saati = UTC + boylam/15 |
| Profil | İrtifa-zaman mini grafiği, **geçerli konumu gösteren imleç** (kamera ile görsel senkron) |
| Rota şeridi | `IST ──●── JFK`, ilerleme çubuğu |

GLOBE'daki sayaçlar (AIRBORNE, FLIGHTS·24H, DESTINATIONS, KM FLOWN), bölge çubukları, kalkış histogramı, kaynak/atıf satırı Plan 2 ile aynı mantık ve metinlerle gelir (`SOURCE: ADSB.FI` bağlantılı, DELAYED/COLLECTING durumları, `H` ile gizlenince atıf soluk kalır). Dil İngilizce, TK fontları (Plan 2'deki yöntemle `globe/public/fonts`, git dışı, siteye kopyalanır; kullanıcı yayında fontların sunulmasını onaylamıştır).

## 8. Hata durumları
Plan 2 §9 ile aynı (veri gecikmesi, collecting, yükleme, WebGL2 yok) artı:
- **Doku yüklenemedi:** düz renkli Dünya + uyarı satırı; sahne çalışmaya devam eder.
- **8K doku desteklenmiyor / bellek düşük:** `MAX_TEXTURE_SIZE < 8192`, `navigator.deviceMemory ≤ 4` ya da kalite denetleyicisi 10 sn düşük FPS görürse 4K dokulara düşülür (aynı dosya adı + `-4k` sürümü yayında tutulur).
- **Seçili uçuşun verisi eksik** (tek örnek): FOLLOW devre dışı, tooltip'te "TRACK TOO SHORT".

## 9. Dokular ve lisans
- Gündüz ve gece için 8192×4096. Tahmini GPU belleği (sıkıştırmasız, mipmap'li) iki doku için ≈ 350 MB: sergi makinesi hedeflenir; zayıf cihazlarda 4K'ya düşülür (§8).
- Tercih edilen kaynak: Solar System Scope (CC BY 4.0, atıf zorunlu) ya da NASA Blue Marble / Black Marble (kamu malı). **İndirmeden önce dosya adları, kaynak URL'leri ve boyutlar kullanıcıya ayrıca bildirilir ve onay alınır.**
- HUD alt satırında doku atfı gösterilir. Referans repodaki shader parçaları için `NOTICE` dosyası.

## 10. Aşamalar
- **Aşama A:** Collector'a `airports` + veri kalitesi düzeltmesi (§4.2) + `globe/` iskeleti + astro/geo3d çekirdek modüller + Dünya/uzay/atmosfer + planlı ve gözlenen yaylar + GLOBE/LIVE modu (tahmini başlar, olay akışı) + temel HUD + yeni siteye deploy. Kendi başına çalışan bir teslimdir.
- **Aşama B:** FOLLOW modu (kamera donanımı, geçişler, telemetri, FlightPanel) + oynatma kontrolleri + otomatik tur + deploy.

## 11. Test
- **Saf modüller (Vitest):**
  - `astro`: bilinen anlarda GMST (J2000'de 280,46°), 2026-03-20 öğlen alt-solar enlem ≈ 0, 2026-06-21 ≈ +23,4°, 12:00 UTC alt-solar boylam ≈ 0 ± 4,5° (zaman denklemi).
  - `geo3d`: enlem/boylam→xyz ve geri (yuvarlak gidiş-dönüş), Catmull-Rom'un örnek noktalardan geçmesi, zaman parametreli örnekleme, antimeridyen.
  - `telemetry`: sentetik bir uçuşta GS/HDG/VS/PHASE/DIST/ELAPSED beklenen değerlerle (elle hesaplanmış), projected parçanın etiketlenmesi.
  - `camera`: durum makinesi geçişleri, `Esc`/tıklama ile dönüş, yarıçap alt sınırı (kamera Dünya'nın içine girmez), smooth damp yakınsaması.
- **Collector:** `airports` üretimi (benzersiz, IST/SAW dahil), şema geriye uyumu, fixture; §4.2'deki sınıflama ve birleştirme testleri (önceki ölçüm: %36 → hedef: yeni uçuşlarda LANDED olmayan hiçbir uçuş "iniş" sayılmaz).
- **LIVE:** `deadReckon` (örnekler arası başın büyük daire üstünde doğru ilerlemesi, yumuşatmalı düzeltme, 5 dk sonra durma), `events` (iki model karşılaştırması: kalkış/iniş/LAST CONTACT, ilk yüklemede olay yok), otomatik tur seçicisi (son 3'ü tekrarlamaz, uzun menzil tercihi).
- **Görsel ve performans (tarayıcıda, gerçek veri + fixture):** GLOBE ve FOLLOW ekran görüntüleri; ≥ 55 fps (1080p, ~2.200 yay, kalite denetleyicisi açık); FOLLOW sırasında HUD değerlerinin kameranın konumuyla uyuştuğunun elle kontrolü (ALT imleci, DIST, UTC/terminatör).

## 12. Riskler
- **8K doku belleği ve ilk yükleme süresi** (tahmini onlarca MB): `-4k` yedek sürüm ve ilerlemeli yükleme göstergesi.
- **Alıcı kapsamı:** okyanus/Afrika/Asya'da izler boşluklu; ölçüm: eski kuralla uçuşların yalnızca %36'sı varış havalimanına ulaşıyordu. Düzeltme + planlı yay bunu örter ama gerçek veri gibi göstermez.
- **Rota doğruluğu:** adsbdb çağrı kodunu planlı rotaya eşler; yanlış eşleşme olabilir (ölçülmedi). `LANDED` sınıflaması varış yakınlığını kontrol ettiği için yanlış eşleşmeyi ele verir.
- **2 dakikalık örnekleme:** kamera yolu 2 dk'lık noktalardan geçen eğridir; hız/yön ortalamadır. Bu sınır HUD'da yazar.
- **GPL:** kod kopyalanırsa türev eser GPL-3.0 yükümlülükleri doğurur; karar sahibindedir.
- **adsb.fi koşulları** (kişisel/ticari olmayan, atıf) ve **TK font lisansı** önceki spec'lerdeki gibi geçerlidir.
- **Site kimliği** (`dataroute-tk`) alınmış olabilir; yedek ad tanımlıdır.
