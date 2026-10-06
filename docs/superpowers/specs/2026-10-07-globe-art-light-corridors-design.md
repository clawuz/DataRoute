# DataRoute Globe — Işık, atmosfer, rota koridorları ve rota müziği: Tasarım Spec'i

Tarih: 2026-10-07 · Kapsam: `globe/` (collector ve `web/` değişmez) · Önceki spec: `2026-10-06-thy-globe-design.md`

## 1. Amaç
Globe'u "veri işi olduğu ilk bakışta anlaşılan, sanatsal" bir sahneye yaklaştırmak: (a) rota yoğunluğunu gösteren **koridorlar**, (b) gezegenin yaşayan görünümü için **ışık ve atmosfer** katmanları, (c) her koridorun bir ses olduğu, istendiğinde açılan **rota müziği** (sonifikasyon). Yeni görsel öğelerin hiçbiri veri uydurmaz; veriye bağlı olmayan tek öğe (aurora) varsayılan kapalıdır ve açıkça süs olarak işaretlenir.

## 2. Kararlar (kullanıcıdan)
- Öncelik: **ışık ve atmosfer** + **rota koridorları**. Çizgi stili olarak koridorlar seçildi (kuyruklu yaylar, halka dalgaları, akan parçacıklar ve dünün hayaleti bu spec'in dışında; sonraki tur).
- Aurora: eklenir, **varsayılan kapalı**, `A` tuşuyla açılır.
- Rota müziği: **sakin ambiyans**, her yoğun koridor bir pad sesi; `M` ile aç/kapa, **varsayılan kapalı**; hazır müzik dosyası yok (Web Audio ile üretilir).
- Gerçek yıldız haritası eklenir; **indirme öncesi dosya adı, kaynak ve boyut ayrıca kullanıcıya bildirilir ve onay alınır** (NASA kamu malı veri tercih edilir).

## 3. Rota koridorları (`scene/corridors.ts`)
- **Girdi:** `GlobeModel.flights[*].planned` + `from`/`to` (IATA). Yalnızca rotası bilinen uçuşlar.
- **Birleştirme:** her **yönsüz** havalimanı çifti için bir koridor; IST→FRA ve FRA→IST aynı koridora sayılır (anahtar `min(from,to)+max(from,to)`). `count` = penceredeki uçuş sayısı. Saf fonksiyon: `buildCorridors(m: GlobeModel): Corridor[]` (`{ key, fromLat, fromLon, toLat, toLon, distKm, count }`), sayıya göre sıralı.
- **Geometri:** mevcut `plannedArc` büyük daire + yarım sinüs kaldırma (aynı yükseklik profili). Koridor başına bir şerit (aynı instanced ribbon mekanizması, `side: DoubleSide`, derinlik testi açık, derinlik yazma kapalı, additive).
- **Ağırlık → görünüm (saf, testli):** `w = sqrt(count / maxCount)` (0..1). Kalınlık `0.9 + 3.6·w` px; renk rampası düşük→yüksek: soğuk mavi → turuncu → beyaza yakın sıcak; alfa `0.10 + 0.35·w`. Çok seyrek rotalar (tek uçuş) ince ve soluk kalır.
- **Hareket:** rota boyunca çok yavaş (≈ 0,03 turn/sn) bir parlama dalgası; dalga genliği `w` ile artar. `prefers-reduced-motion` altında dalga yok.
- **Planlı yayların yerine geçer:** koridor açıkken `buildArcBuffers` planlı (kind=1) yayları üretmez; gözlenen izler (kind=0) aynen kalır. Böylece örnek sayısı azalır (aynı rota yüzlerce kez çizilmez).
- **Dürüstlük:** HUD'da küçük etiket `ROUTE DENSITY · 24H` (koridor açıkken). Rotası bilinmeyen uçuşlar koridora girmez. Takip modunda seçilen uçuşun kendi planlı yayı eskisi gibi vurgulanır.
- **Kontrol:** `C` tuşu koridor ⇄ eski soluk planlı yaylar. `?art=0` koridoru da kapatır (eski görünüm).

## 4. Işık ve atmosfer
Hepsi Earth shader'ına ve küçük yeni katmanlara eklenir; Dünya'nın fiziksel güneş yönü (`sunDirection`) tek kaynaktır.
- **Alacakaranlık (`earth.ts`, `atmosphere.ts`):** `ndl = dot(N, sun)`; `twilight = smoothstep(-0.18, 0.0, ndl) * (1 - smoothstep(0.0, 0.12, ndl))`; yüzeye `vec3(1.0, 0.55, 0.35) * twilight * 0.35` eklenir; atmosfer rim rengi aynı bantta ısınır. Parlaklık sabitleri yerel tarayıcı kontrolüyle ayarlanır.
- **Bulut gölgesi (`earth.ts`):** gündüz tarafında `cloudShadow = texture(clouds, uv - sunTangentOffset)`; gölge `day *= 1 - 0.35 * shadow * dayAmt`. Ofset güneşin yüzey teğetsel bileşenine göre küçük sabit ölçekli (bulutun yüksekliği gösteriminde abartılı, fiziksel ölçek değil; bu bir görsel ipucudur).
- **Güneş parlaması (`scene/sun-glare.ts`):** güneş yönünde, Dünya'nın arkasında kalınca derinlik testiyle gizlenen additive sprite + hafif halka; kamera güneşe baktığında bloom'u besler.
- **Yıldız haritası (`space.ts`):** prosedürel yıldızların yerine/yanında NASA Deep Star Maps (veya eşdeğer kamu malı) dokusu; dokunun kullanılamadığı durumda mevcut prosedürel yıldızlara düşer. İndirme onayı gerekir (§2).
- **Aurora (`scene/aurora.ts`):** Dünya yarıçapının 1.012 katında iki kutup kabuğu; fragment shader'da enlem 62–78° bandında gürültüyle dalgalanan perde, yalnızca gece tarafında (`ndl < 0`), yeşil→mor. **Veriye bağlı değil (süs).** Varsayılan kapalı, `A` ile açılır. Açıkken HUD'da `AURORA · ILLUSTRATIVE` etiketi.
- **Kalite bağlantısı:** `LEVELS` kalite seviyeleri düşünce önce aurora, sonra bulut gölgesi, sonra güneş parlaması kapanır. `?art=0` tüm yeni efektleri kapatır (koridor dahil).

## 4b. Rota müziği (`audio/route-voices.ts`, `audio/engine.ts`)
Veri-ses eşlemesi (sonifikasyon): sesin müzik olduğu iddiası yok; perde mesafeyi, ses seviyesi yoğunluğu, FOLLOW'daki parlaklık yüksekliği anlatır.
- **Sesler:** `buildCorridors` çıktısından yoğunluğa göre ilk **10** koridor, her biri sürekli çalan bir pad (iki detune'lu osilatör + alçak geçiren filtre + yavaş genlik LFO'su).
- **Nota (saf, testli):** rota anahtarının (`min+max` IATA) kararlı karması → a-minör pentatonik gamdan derece (A C D E G); aynı rota her zaman aynı notayı çalar.
- **Oktav:** mesafe > 6000 km → oktav 2 (≈110 Hz tabanı), 3000–6000 → 3, 1000–3000 → 4, < 1000 → 5.
- **Tını:** bölgeye göre dalga biçimi ve filtre kesim frekansı (yumuşak sinüs/üçgen/hafif testere karışımları); sabit tablo.
- **Ses seviyesi:** `master · w` (w = `sqrt(count/maxCount)`), sınırlayıcı (compressor) toplamı korur; ana seviye varsayılan düşük.
- **Yerleşim (pan):** koridor orta noktasının ekran x konumuna göre `[-1, 1]` (kısıtlı, yavaş yumuşatılmış); Dünya'nın arka yüzündeki koridorlar kısılır.
- **Oda:** üretilmiş dürtü yanıtıyla (≈ 2,5 sn) yankı, ıslak oran %35.
- **Olaylar:** kalkış/iniş olayında o rotanın notasının bir oktav üstünde kısa yumuşak "damla"; saniyede en çok 3.
- **FOLLOW:** takip edilen rotanın sesi +6 dB, diğerleri −6 dB; takip edilen uçuşun yüksekliği o sesin filtre kesimini açar (`cutoff ≈ 300 + 8·alt100` Hz).
- **Kontrol:** `M` tuşu aç/kapa; varsayılan kapalı; tercih `localStorage`'da (try/catch). Ses ilk açılışta kullanıcı tuş hareketiyle başlar (tarayıcı otomatik çalma kuralı). 0,8 sn yumuşak giriş/çıkış; sekme gizlenince `AudioContext` askıya alınır. HUD'da küçük `SOUND ON` göstergesi. `?art=0` sesi de kapalı tutar.
- **Test:** eşleme saf fonksiyonlar (aynı rota → aynı nota, oktav sınırları, seviye yoğunlukla artar, ilk 10 seçimi, pan kısıtı); ses grafiği sahte `AudioContext` ile (düğüm sayısı, `dispose`, `M` aç/kapa, sekme gizlenince askı). Dinleme kontrolü kullanıcıyla yapılır.

## 5. Dosyalar
Yeni: `scene/corridors.ts`, `scene/aurora.ts`, `scene/sun-glare.ts`, `audio/route-voices.ts`, `audio/engine.ts` (rota müziği), `app/art.ts` (`?art`, `A`/`C`/`M` durumu, kalite eşlemesi). Değişen: `scene/earth.ts`, `scene/atmosphere.ts`, `scene/space.ts`, `scene/arcs.ts`, `scene/engine.ts`, `app/controller.ts`, `app/keys.ts` (`A`, `C`, `M`), `hud/GlobeHud.tsx` (etiketler), `README.md`.

## 6. Test
- **Birim (Vitest):** `buildCorridors` (aynı rota N uçuş = 1 koridor, ters yön birleşir, rotasız uçuş dışarıda, sıralama), ağırlık→kalınlık/renk/alfa eğrisi (monoton, sınırlar), alacakaranlık ve gölge fonksiyonlarının TS yansımaları (güneş vektöründen), `art` durumu (`?art=0`, tuşlar, kalite düşüşü sırası), `arcs` koridor açıkken planlı yay üretmez / kapalıyken üretir, HUD etiketleri.
- **Tarayıcı (gözle):** terminatör bandı, bulut gölgesi, güneş parlaması, koridor kalınlıkları (İstanbul çevresinde yığılma yok), FPS ≥ 55 (kalite denetleyici açık); sonuçlar uygulama notlarına yazılır.

## 7. Yayın
Adımlar ayrı commit: (1) koridorlar, (2) alacakaranlık + bulut gölgesi + güneş parlaması, (3) yıldız haritası (onaylı indirme), (4) aurora, (5) rota müziği. Her adım sonrası yerel görsel kontrol; sonunda tek `hosting:globe` deploy (onayla). Eski site ve collector etkilenmez.

## 8. Riskler
- Alacakaranlık ve gölge gündüzü karartabilir → parlaklık ölçümü, sabitler ayarlanır.
- Aurora veri dışı süs → varsayılan kapalı + etiket.
- Koridor ağırlığı rota doğruluğuna bağlı (adsbdb yanlış eşleşme olabilir; spec §12'deki risk geçerli).
- Yıldız dokusu ek indirme (8K ≈ 4–6 MB).

## 7b. Geri alınabilirlik (kullanıcı isteği: "beğenmezsem bu bölümü not al, direkt geri alırız")
- Her bölüm (koridorlar, alacakaranlık+bulut gölgesi+parlama, yıldız haritası, aurora, rota müziği) **kendi commit(ler)iyle** gelir; commit mesajları `art(<bölüm>):` önekini taşır, böylece `git log --grep "^art(sound)"` ile bulunur ve `git revert` ile tek başına geri alınır.
- Bağımsızlık kuralı: bir bölüm başka bölümün koduna bağımlı olmaz (ses `corridors.ts`'in saf `buildCorridors` çıktısını okur ama koridor görselinden bağımsız çalışır; koridor görseli kaldırılsa bile ses için `buildCorridors` kalır). Her bölümün tek bağlantı noktası vardır: engine/controller/keys içinde küçük, işaretli (`// art:<bölüm>`) birkaç satır.
- Uygulama bitince hangi commit'in hangi bölüm olduğu bu spec'in sonundaki "Uygulama notları" tablosuna yazılır (bölüm → commit hash → geri alma komutu); kullanıcı bir bölümü beğenmezse oradan geri alınır.
- Yayın: her bölüm kendi başına deploy edilebilir; beğenilmeyen bölüm geri alınıp yeniden deploy edilir.

## Uygulama notları (uygulama sırasında doldurulur)
| Bölüm | Commit | Geri alma |
|---|---|---|
| Rota koridorları | — | — |
| Alacakaranlık + bulut gölgesi + parlama | — | — |
| Yıldız haritası | — | — |
| Aurora | — | — |
| Rota müziği | — | — |
