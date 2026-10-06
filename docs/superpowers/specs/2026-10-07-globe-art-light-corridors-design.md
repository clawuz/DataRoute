# DataRoute Globe — Işık, atmosfer ve rota koridorları: Tasarım Spec'i

Tarih: 2026-10-07 · Kapsam: `globe/` (collector ve `web/` değişmez) · Önceki spec: `2026-10-06-thy-globe-design.md`

## 1. Amaç
Globe'u "veri işi olduğu ilk bakışta anlaşılan, sanatsal" bir sahneye yaklaştırmak: (a) rota yoğunluğunu gösteren **koridorlar**, (b) gezegenin yaşayan görünümü için **ışık ve atmosfer** katmanları. Yeni görsel öğelerin hiçbiri veri uydurmaz; veriye bağlı olmayan tek öğe (aurora) varsayılan kapalıdır ve açıkça süs olarak işaretlenir.

## 2. Kararlar (kullanıcıdan)
- Öncelik: **ışık ve atmosfer** + **rota koridorları**. Çizgi stili olarak koridorlar seçildi (kuyruklu yaylar, halka dalgaları, akan parçacıklar ve dünün hayaleti bu spec'in dışında; sonraki tur).
- Aurora: eklenir, **varsayılan kapalı**, `A` tuşuyla açılır.
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

## 5. Dosyalar
Yeni: `scene/corridors.ts`, `scene/aurora.ts`, `scene/sun-glare.ts`, `app/art.ts` (`?art`, `A`/`C` durumu, kalite eşlemesi). Değişen: `scene/earth.ts`, `scene/atmosphere.ts`, `scene/space.ts`, `scene/arcs.ts`, `scene/engine.ts`, `app/controller.ts`, `app/keys.ts` (`A`, `C`), `hud/GlobeHud.tsx` (etiketler), `README.md`.

## 6. Test
- **Birim (Vitest):** `buildCorridors` (aynı rota N uçuş = 1 koridor, ters yön birleşir, rotasız uçuş dışarıda, sıralama), ağırlık→kalınlık/renk/alfa eğrisi (monoton, sınırlar), alacakaranlık ve gölge fonksiyonlarının TS yansımaları (güneş vektöründen), `art` durumu (`?art=0`, tuşlar, kalite düşüşü sırası), `arcs` koridor açıkken planlı yay üretmez / kapalıyken üretir, HUD etiketleri.
- **Tarayıcı (gözle):** terminatör bandı, bulut gölgesi, güneş parlaması, koridor kalınlıkları (İstanbul çevresinde yığılma yok), FPS ≥ 55 (kalite denetleyici açık); sonuçlar uygulama notlarına yazılır.

## 7. Yayın
Adımlar ayrı commit: (1) koridorlar, (2) alacakaranlık + bulut gölgesi + güneş parlaması, (3) yıldız haritası (onaylı indirme), (4) aurora. Her adım sonrası yerel görsel kontrol; sonunda tek `hosting:globe` deploy (onayla). Eski site ve collector etkilenmez.

## 8. Riskler
- Alacakaranlık ve gölge gündüzü karartabilir → parlaklık ölçümü, sabitler ayarlanır.
- Aurora veri dışı süs → varsayılan kapalı + etiket.
- Koridor ağırlığı rota doğruluğuna bağlı (adsbdb yanlış eşleşme olabilir; spec §12'deki risk geçerli).
- Yıldız dokusu ek indirme (8K ≈ 4–6 MB).
