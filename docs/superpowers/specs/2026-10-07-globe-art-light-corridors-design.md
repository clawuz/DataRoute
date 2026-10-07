# DataRoute Globe — Işık, atmosfer, rota koridorları ve rota müziği: Tasarım Spec'i

Tarih: 2026-10-07 · Kapsam: `globe/` (collector ve `web/` değişmez) · Önceki spec: `2026-10-06-thy-globe-design.md`

## 1. Amaç
Globe'u "veri işi olduğu ilk bakışta anlaşılan, sanatsal" bir sahneye yaklaştırmak: (a) rota yoğunluğunu gösteren **koridorlar**, (b) gezegenin yaşayan görünümü için **ışık ve atmosfer** katmanları, (c) her koridorun bir ses olduğu, istendiğinde açılan **rota müziği** (sonifikasyon). Yeni görsel öğelerin hiçbiri veri uydurmaz; veriye bağlı olmayan tek öğe (aurora) varsayılan kapalıdır ve açıkça süs olarak işaretlenir.

## 2. Kararlar (kullanıcıdan)
- Öncelik: **ışık ve atmosfer** + **rota koridorları**. Çizgi stili olarak koridorlar seçildi (kuyruklu yaylar, halka dalgaları, akan parçacıklar ve dünün hayaleti bu spec'in dışında; sonraki tur).
- Aurora: eklenir, **varsayılan kapalı**, `A` tuşuyla açılır.
- Rota müziği: önce sakin ambiyans seçildi, sonra kullanıcı isteğiyle **kıta bazlı orkestraya** genişledi: kalkışlar nota, her kıtanın kendi çalgı/tını/ritim/skalası, ortak 96 BPM saat ve Am–F–C–G armoni; `M` ile aç/kapa, **varsayılan kapalı**; hazır müzik dosyası yok (Web Audio ile üretilir).
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
- **Alacakaranlık:** alacakaranlık bandı denendi, kullanıcı beğenmedi, kaldırıldı. (Bulut gölgesi ve güneş parlaması kalır.)
- **Bulut gölgesi (`earth.ts`):** gündüz tarafında `cloudShadow = texture(clouds, uv - sunTangentOffset)`; gölge `day *= 1 - 0.35 * shadow * dayAmt`. Ofset güneşin yüzey teğetsel bileşenine göre küçük sabit ölçekli (bulutun yüksekliği gösteriminde abartılı, fiziksel ölçek değil; bu bir görsel ipucudur).
- **Güneş parlaması (`scene/sun-glare.ts`):** güneş yönünde, Dünya'nın arkasında kalınca derinlik testiyle gizlenen additive sprite + hafif halka; kamera güneşe baktığında bloom'u besler.
- **Yıldız haritası (`space.ts`):** prosedürel yıldızların yerine/yanında NASA Deep Star Maps (veya eşdeğer kamu malı) dokusu; dokunun kullanılamadığı durumda mevcut prosedürel yıldızlara düşer. İndirme onayı gerekir (§2).
- **Aurora (`scene/aurora.ts`):** Dünya yarıçapının 1.012 katında iki kutup kabuğu; fragment shader'da enlem 62–78° bandında gürültüyle dalgalanan perde, yalnızca gece tarafında (`ndl < 0`), yeşil→mor. **Veriye bağlı değil (süs).** Varsayılan kapalı, `A` ile açılır. Açıkken HUD'da `AURORA · ILLUSTRATIVE` etiketi.
- **Kalite bağlantısı:** `LEVELS` kalite seviyeleri düşünce önce aurora, sonra bulut gölgesi, sonra güneş parlaması kapanır. `?art=0` tüm yeni efektleri kapatır (koridor dahil).

## 4b. Rota müziği: kıta orkestrası (`audio/theory.ts`, `audio/score.ts`, `audio/instruments.ts`, `audio/engine.ts`)
Veriye dayalı üretken müzik (sonifikasyon). **Hangi nota ne zaman çalar** gerçek kalkış/inişlerden gelir; **nasıl çaldığı** (çalgı, ritim, skala, armoni) müzik teorisiyle belirlenir. Sesin sabit bir "beste" olduğu iddiası yok; her açılışta gerçek uçuşlar neyse o çalar.
- **Ortak çatı:** tek ana saat **96 BPM** (vuruş = 0,625 sn). Her kıtanın ritim ızgarası ana vuruşun **tam sayı bölümü** (poliritim kayma yapmaz). Armoni 8 akorluk döngü **Am – F – C – G | Am – Dm – F – G**, her akor **8 vuruş** (≈ 5 sn), tam döngü 64 vuruş (40 sn), sürekli döner (24 saatlik tekrarda ≈ 4,5 kez). Bütün skalalar a-minörün alt kümesi: akor değişince çarpışmaz.
- **Zaman kaynağı:** ekranda gösterilen zaman `cur` ilerledikçe, `(önceki cur, şimdiki cur]` aralığındaki **kalkışlar** (uçuşun `dep` zamanı) ve **inişler** (yalnızca `LANDED` uçuşların `end` zamanı) nota olur. REPLAY'de 24 saat 3 dk'da çalar; canlıda gerçek zamanda. Geri sarma, kaydırma ve rewind gibi büyük sıçramalarda (aralık > 600 sn ya da geriye) olay üretilmez.
- **Kıtalar** (bölge dizini `REGIONS` sırasında):

| Kıta | Çalgı (Web Audio sentezi) | Izgara (vuruş başına) | Skala (A'dan yarım ses) | Register |
|---|---|---|---|---|
| DOM yurt içi | derin sinüs "kalp atışı" (kick benzeri perde düşüşü) | 1 (çeyrek) | akor kökü (çift vuruş) / beşlisi (tek vuruş) | A1 (55 Hz) civarı |
| EUR doğu/güney Avrupa | vibrafon/marimba: sinüs + 4× üst ton, kısa sönüm | 2 (sekizlik) | A minör pentatonik `[0,3,5,7,10]` | mesafeyle 3–5. oktav |
| EUR batı/kuzey Avrupa (**piyano**) | piyano: üçgen + 2× + 3× sinüs, çok kısa atak, uzun sönüm | 2 | akorun arpej tonları (kök, üçlü, beşli, kök+oktav) | mesafeyle 3–5. oktav |
| **İSTANBUL ucu (ney)** | ney benzeri nefesli: sinüs+üçgen, vibrato, yukarıdan kayma, nefes gürültüsü | 1 (çeyrek), adımda tek nota | sabit 8 notalık motif `[0,3,2,0,7,10,0,5]`, güçlü vuruşlarda akor tonuna yaslanır | 4. oktav (inişte 3.) |
| MEA Orta Doğu | ud: testere → alçak geçiren (kesim hızla iner) + önünde süsleme notası | 2, odd adımlar %25 gecikmeli (sallantı) | `[0,3,5,7,8]` (A C D E F) | 3–4. oktav |
| AFR Afrika | kalimba: sinüs + 2,76× metalik üst ton, kısa | 3 (üçleme, 12/8 hissi) | `[0,3,5,7,10]` | 4–5. oktav |
| ASI Asya-Pasifik | koto: üçgen dalga + hafif perde düşüşü, hızlı pluck | 4 (onaltılık) | `[0,2,3,7,8]` (A B C E F, Hirajoshi tadı) | 4–5. oktav |
| AME Amerika | geniş yaylı pad: iki detune testere, yavaş atak/bırakış | 0,5 (iki vuruşta 1) | `[0,5,7,10]` (A D E G, açık beşliler) | 3. oktav |
| UNK | sessiz | — | — | — |

- **Avrupa bölünmesi:** varış (İstanbul'un karşı ucu) boylamı < 20°D ya da enlemi > 52°K olan Avrupa rotaları **piyano**, diğerleri vibrafon.
- **İstanbul neyi (melodi hattı):** olayın İstanbul ucunda olduğu kalkışlar (`from` İstanbul) ve inişler (`to` İstanbul, yalnızca LANDED) ney notası olur; diğer ucun (ör. JFK) olayları ney çalmaz. Not, olay sayısıyla değil **zamanla** ilerler: `motif[çeyrek-nota ızgara indeksi mod 8]`; güçlü vuruşta (`beat % 4 == 0`) o anki akorun en yakın akor tonuna yaslanır (kök/üçlü/beşli; eşitlikte alçak olan). Yani ney sabit bir ezgiyi yürütür, olaylar ezginin hangi vuruşlarda duyulacağını belirler; aynı olay akışı aynı melodiyi verir. İniş: 3. oktav, daha yumuşak. Adımda tek nota; fazla olaylar velocity'ye eklenir.
- **Roller / register:** bas = yurt içi kalp atışı + akor yatağı (A1–G2, yatak 2–3. oktav); armonik dolgu = Amerika pad'i (3. oktav); **melodi = ney**; karşı hat = piyano arpejleri; renk = vibrafon, ud, kalimba, koto. Ney 4. oktav merkezli, diğer pentatonik çalgılar kendi aralıklarında; hepsi a-minör içinde kaldığından akor değişince çarpışmaz (Dm de D F A = a-minör notaları).
- **Nota seçimi (saf, testli):** `scale[routeHash(rota) % uzunluk]`; oktav mesafeye göre (kıtanın aralığına kıstırılır). DOM akor kökü/beşlisi çalar (armoniyi taşır).
- **İniş:** bir oktav aşağıda (DOM'da akorun beşlisi), 0,6× velocity, uzun sönüm.
- **Yoğunluk sınırı:** kıta başına adımda en çok 2 nota; fazla olaylar notayı atmaz, velocity'yi artırır (`min(1, 0,5 + 0,15·n)`).
- **Yatak:** düşük seviyeli akor pad'i (kök, üçlü, beşli; alçak geçiren), akor sınırında yumuşak geçişle akoru izler; seviyesi tüm trafik yoğunluğuna (`airborne/150`, 0..1) bağlı.
- **Dinamik yay:** gece seyrek/ince, sabah–öğle dolu orkestra kendiliğinden veriden çıkar.
- **FOLLOW:** takip edilen uçuşun kıtası ×1,6 öne çıkar, diğerleri ×0,7; takip edilen uçuşun yüksekliği o kıtanın çalgı filtresini açar (`kesim × (0,6 + 0,8·alt100/410)`).
- **Yerleşim:** notanın rotasının ekran konumuna göre sol-sağ (pan) ve arka yüzde kalan rotalar kısık (×0,3).
- **Oda:** üretilmiş yankı (≈ 2,5 sn), ıslak %30.
- **Kontrol:** `M` tuşu aç/kapa, varsayılan **kapalı**, tercih `localStorage`'da; ses ilk açılışta kullanıcı tuş hareketiyle başlar; 0,8 sn yumuşak giriş/çıkış; sekme gizlenince askı. HUD'da `SOUND ON`. `?art=0` sesi kapalı tutar.
- **Test:** teori ve skor saf fonksiyonlar (ızgaralar tam sayı oranlı, akor sırası, nota ⊂ skala, aralık olayları, ızgaraya oturtma, adım başına ≤ 2 nota, velocity, iniş oktavı); ses motoru sahte `AudioContext` ile (çalgı başına düğüm sayısı, odak, akor geçişi, hız sınırı, `dispose`). Dinleme ve denge kullanıcıyla (ilk sürümden sonra çalgı seviyeleri ve tınılar kulağa göre ayarlanır).

## 4c. Müzik v2: sinematik minimalist, dört bölümlü (kullanıcı isteği: "ezgi sabit olmamalı, müzik yapısı daha etkili olmalı")
§4b'deki sabit 8 notalık ney motifi ve tek akor döngüsü **kaldırılır**; yerine form, veriden doğan ezgi, euclidean ritim ve zengin armoni gelir. Karakter: sinematik minimalist (uzun cümleler, nefes alan, piyano ve yaylı pad merkezli, ney baş melodi).
- **Form (İstanbul yerel saati = UTC+3, REPLAY'de gösterilen saat; 24 saat = 3 dk):**

| Bölüm | Saat | BPM | Akorlar (A'ya göre yarım ses; renk tonlarıyla) | Aktif çalgılar | Adımda azami nota | Yankı (ıslak) |
|---|---|---|---|---|---|---|
| NIGHT | 00–06 | 72 | Am(add9) · Am9 · Fmaj7 · Gsus | NEY, AME, PNO, DOM | 1 | 0,45 |
| MORNING | 06–12 | 84 | Am · F · C · G | + EUR, AFR, ASI, CLA | 2 | 0,35 |
| DAY | 12–18 | 96 | C · G · Am · F (parlak, C majör tadı) | hepsi (+ MEA, CLA, TPT) | 2 | 0,25 |
| EVENING | 18–24 | 80 | Dm · Am · F · C · Dm · F · G · Am (Am'de çözülme) | NEY, AME, PNO, EUR, MEA, DOM, CLA, SAX | 2 | 0,40 |

Her akor 8 vuruş; bölüm değişimi bir bölüm epoch'u başlatır (ızgaralar ve akor sayımı o andan sayılır). Tüm akorlar a-minör/do-majör ailesi: önceki skalalar çarpışmaz.
- **Zenginleştirilmiş akorlar:** `Chord`'a 7. ve 9. ton eklenir (Am9, Fmaj7, Cmaj7, G sus4, Dm7); alttaki pad dört sesli (kök oktav 2, beşli oktav 3, 7./3. oktav 3, 9. oktav 4) ve akor değişiminde yumuşak geçer.
- **Ney: veriden doğan ezgi.** Her İstanbul-ucu olay 3 notalık bir **ezgi hücresi** üretir (ardışık sekizlik adımlarda): hücrenin eğrisi rotanın İstanbul'dan **başlangıç yönüyle** belirlenir (0–180° → yükselen, 180–360° → alçalan; ±30° içinde kuzey/güney → yay), adım büyüklüğü mesafeyle (< 1500 km: 1 derece, < 4000 km: 2, daha uzun: 3). **Ses geçişi:** ilk nota bir önceki notaya en yakın akor tonu (aynı notayı tekrarlama), güçlü vuruşta akor tonu, ≥ 2 derecelik atlayıştan sonra ters yönde bir adım. **Cümle:** 4 hücre = 1 cümle; ardından akor kökü/beşlisinde **uzun cümle sonu notası** ve 2 vuruş sessizlik; sonra yeni cümle. Güçlü vuruşta kısa süs notası. Kayıt bölümle değişir (gece 3.–4. oktav, gün 4.–5.). Durum (`NeyState`) saf bir fonksiyonla ilerler; aynı olay akışı aynı ezgiyi verir (ama her günün uçuşları farklı olduğundan ezgi her gün farklı).
- **Üfleme topluluğu (ney + klarnet + saksafon + trompet):** hepsi aynı İstanbul ezgi hücresinden türer (veri yine melodiyi belirler), bölümlere göre girer: **NIGHT** yalnız ney; **MORNING** ney + **klarnet** (hücrenin her notasını diyatonik **bir üçlü aşağıdan**, 0,7× velocity, aynı adımlarda); **DAY** ney (lider) + klarnet + **trompet** (yalnız **cümle sonu** notasını **bir oktav yukarıdan**, parlak vurgulu, uzun); **EVENING** ney + klarnet + **saksafon** (her hücrenin **ilk** notasının **bir beşli aşağısında** uzun, sıcak tutulan nota, 0,6× velocity; cümle sonunda da). Kayıt: klarnet 3–4. oktav, saksafon 2–4, trompet 4–5. Sentez: **klarnet** = sinüs `f` + sinüs `3f` (0,33) + `5f` (0,15), nefesli atak 0,06 s, alçak geçiren 3000 Hz, hafif vibrato; **saksafon** = alçak geçirenli testere (1800 Hz) + hafif "growl" (yavaş genlik titreşimi) + nefes gürültüsü, gecikmeli vibrato (5,5 Hz, ±20 cent); **trompet** = iki hafif detune testere, parlak atak (alçak geçiren 800 → 3500 Hz içinde 80 ms), atak 0,04 s, sönüm 0,9 s.
- **Piyano: akan arpejler.** Hash yerine sıralı arpej deseni (kök – beşli – üçlü(+oktav) – beşli); akor değiştikten sonraki ilk olayda akor üç notayla açılarak çalınır (roll, notalar arası 30 ms). Oktav mesafeyle (3–5).
- **Ritim: euclidean desenler.** Çalgıların ızgarası aynı kalır (tam sayı bölümleri), ama olay çalgının **sonraki aktif adımına** oturur: DOM E(2,4) (1. ve 3. vuruş), EUR E(5,8) (2/vuruşta, 4 vuruş), MEA E(3,8) (sallantılı), AFR E(5,12) (3/vuruşta), ASI E(5,16) (4/vuruşta), PNO E(6,8). AME ve NEY desensiz. Böylece grup nefes alır, her olay çalmaz.
- **Dinamik yay:** velocity ve yoğunluk bölümle ve trafik yoğunluğuyla (`airborne/150`) ölçeklenir; yankı ıslak oranı bölüme göre `setTargetAtTime`.
- **Test:** `sectionAt`/`istanbulHour` sınırları, ilerleyişlerin a-minör içinde kalması, euclidean desenlerin sayıları ve `nextActiveSlot`, ney hücresi (yön/mesafe → eğri/adım, tekrar yok, cümle sonu, sessizlik), piyano arpej sırası ve roll, bölümlere göre çalgı süzmesi ve adım başına nota sınırı, ses motorunda bölüm değişimi/epoch ve yeni çalgı düğüm sayıları (saf/sahte `AudioContext`). Müziksel kalite dinlemeyle.

## 4d. Müzik görselleştirmesi: "ROUTES → MUSIC" paneli (kullanıcı isteği: müzik verisi ses dalgası olarak, "AIRBORNE BY AIRCRAFT" modülünün yerine; çizgilerin müziği oluşturduğu görünmeli)
- **Panel:** sağ alttaki "AIRBORNE BY AIRCRAFT" çubukları **kaldırılır** (bileşen, CSS, `aircraftAirborne` alanı, `aircraftBreakdown` ve testleri silinir) ve yerine `MusicScope` gelir: çalgı başına bir **dalga şeridi** (osiloskop görünümü, sola akan). Şeritler kıta paletinin renklerini taşır (EUR camgöbeği, PNO açık camgöbeği, MEA amber, AFR yeşil, ASI pembe, AME mor, DOM beyaz; NEY THY kırmızısı; CLA turuncu, SAX altın, TPT sıcak beyaz). Yalnızca o anki bölümün çalgıları gösterilir.
- **Dalga neyi gösterir:** bir nota çalındığında o çalgının şeridinde dalga **patlar**: genlik = velocity, sönüm çalgının gerçek sönümüne yakın (pad/uzun notalar yavaş, pluck hızlı), dalganın sıklığı notanın perdesiyle (logaritmik) artar; alttaki akor yatağı ince, yavaş bir taban çizgisi olarak enerjiyle (`airborne/150`) kabarır.
- **Çizgiler müziği oluşturuyor:** her nota, onu doğuran **rotanın koridorunu** küreyi üzerinde kısa süre **parlatır** (genişler ve beyaza yaklaşır, ≈ 0,6 sn sönüm). Yani küredeki rota çizgisi yanar → panelde o çalgının dalgası patlar → kulakta nota duyulur.
- **Alt satır:** `ROUTES → MUSIC · <BÖLÜM> · <AKOR> · <BPM> BPM` (ör. `ROUTES → MUSIC · DAY · C · 96 BPM`). Ses kapalıyken de panel **çalışır** (görsel skor: "SOUND OFF · PRESS M"); notalar ses açık olsun olmasın aynı planlayıcıdan gelir, `M` yalnızca sesi açar.
- **Veri akışı:** planlayıcı artık ses bağlamından bağımsız duvar saatiyle (`performance.now()`) planlar; ses açıkken notalar `ctx.currentTime + (when − şimdi)` zamanına çevrilerek çalınır. Motor her planlanan nota için bir `NoteEvent` yayar; denetleyici bunu (a) `NoteBus` aracılığıyla `MusicScope`'a, (b) `GlobeEngine.pulseRoute(key)` ile koridor parlamasına iletir.
- **Test:** saf osiloskop adımı (`stepLane`: vuruş genliği, üstel sönüm, perde→görsel sıklık monoton, faz sürekli), `NoteBus`, motorun kuru çalışması (ses kapalıyken `NoteEvent` yayınlar, ses bağlamı oluşturmaz; açıkken zaman dönüşümü), koridor `pulse` (tampon değerleri ve sönüm, `indexOfKey`), denetleyici köprüsü (not → `pulseRoute`), `MusicScope` render (jsdom'da canvas yoksa çökmez) ve eski modülün tamamen kaldırıldığı.

## 4e. Müzik v3: Farandole ruhunda groove — irtifa çizgileri, caz armonisi, davul (kullanıcı isteği; **§4b/§4c'nin olay-başına-nota mantığının yerine geçer**)
Kullanıcı: "hangi uçuşun notası ft'e göre yükselip alçalmalı, daha hareketlenmeli; şu an tek tek nota basıyor gibi, bir harmoni içinde değil; Bob James – Farandole'a benzer bir harmoni." Hedef Farandole'un **ruhu** (sürücü ostinato bas, senkoplu klavye komping'i, pirinç vuruşları, caz akorları üzerinde akan çizgiler); eser kopyalanmaz.
- **Zaman modeli:** müzik artık olaylarla değil **sürekli 16'lık adım saatiyle** akar (bar = 16 adım, adım = `60/bpm/4`; odd adımlar `swing` kadar geç). Planlayıcı 0,25 sn ileriye bakan bir zamanlayıcıyla (≈ 40 ms'de bir `tick`) adımları üretir; ses kapalıyken de (kuru çalışma) aynı notaları `NoteEvent` olarak yayınlar (görsel için).
- **Anahtar ve armoni:** merkez **re minör**. Akorlar caz akorları (7./9./11. tonlar) ve her akorun bir **akor skalası** vardır; tüm perdeler çalındığı anda o akorun skalasına (ve güçlü adımda akor tonlarına) **oturtulur**: çatışma olmaz. Akor tabanı (A'ya göre yarım ses): Dm9 (kök 5; ton 5,8,0,3,7; skala dorian 5,7,8,10,0,2,3), Bbmaj7 (1; 1,5,8,0; lidyen 1,3,5,7,8,10,0), Gm9 (10; 10,1,5,8,0; dorian 10,0,1,3,5,7,8), A7(b9) (0; 0,4,7,10,1; frigyen dominant 0,1,4,5,7,8,10), C7(9) (3; 3,7,10,1,5; miksolidyen 3,5,7,8,10,0,1), Fmaj7 (8; 8,0,3,7; lidyen 8,10,0,2,3,5,7), Em7b5 (7; 7,10,1,5; lokriyen 7,8,10,0,1,3,5).
- **Bölümler** (İstanbul yerel saati; `sectionAt` aynı):

| Bölüm | BPM | Swing | Akor ilerleyişi (bar/akor) | Ritim bölümü |
|---|---|---|---|---|
| NIGHT | 84 | 0,15 | Dm9 · Bbmaj7 · Gm9 · A7b9 (2 bar/akor) | kick 1 ve 3 çok kısık, hi-hat yarım, uzun bas notaları, hafif klavye arpej; pirinç yok |
| MORNING | 100 | 0,12 | Dm9 · Bbmaj7 · Gm7 · A7b9 · Dm9 · Bbmaj7 · Em7b5 · A7b9 (1) | hafif kick/snare, sekizlik hat, seyrek bas, komping; klarnet |
| DAY | 116 | 0,10 | Dm9 · Bbmaj7 · Gm9 · C7(9) · Fmaj7 · Bbmaj7 · Em7b5 · A7b9 (1) | tam groove: senkoplu kick, snare 2-4, 16'lık hat + açık hat, sekizlik bas ostinato, Rhodes komping, trompet/saksafon vuruşları |
| EVENING | 92 | 0,12 | Fmaj7 · Gm9 · Em7b5 · A7b9 · Dm9 · Bbmaj7 · Gm9 · Dm9 (1; Dm9'da çözülme) | yumuşak kick/snare, bas, komping, saksafon uzun notalar |

- **Groove (saf, 16 adımlık desenler):** DAY kick `[0,6,10]`, snare `[4,12]`, hat 16'lık (vurgu 8'lik adımlarda), açık hat `[14]`; bas ostinato adımları `[0,3,6,8,11,14]` (kök, kök, beşli, oktav kök, ♭7 ya da bir sonraki akora yarım ses yaklaşım, beşli); Rhodes komping adımları `[2,7,10]` (voicing: 3., 7., 9., 5. ton); pirinç vuruşları `[3,11]` (kısa, akor tonları 3./7./9., oktav 4–5). MORNING kick `[0,10]`, snare `[4,12]` kısık, hat 8'lik, bas `[0,6,8,14]`, komping `[2,10]`. NIGHT kick `[0,8]` çok kısık, hat `[4,12]` çok kısık, bas `[0]` uzun, komping arpej `[0,6,10]`. EVENING kick `[0,8]`, snare `[12]` kısık, hat 8'lik kısık, bas `[0,8,11]`, komping `[2,8]`, bar başında saksafon uzun nota.
- **Uçuş çizgileri (irtifa = perde):** havadaki uçuşlardan en çok **12** tanesi (takip edilen uçuş her zaman; geri kalanı rotanın uçuş sayısına göre, kıta başına en çok 4, eşitlikte kararlı hash) kendi çizgisini çalar. Her çizgi: perde = o anki **irtifa** (`alt100`) akor skalasından kurulmuş 3 oktavlık bir merdivende (`scaleLadder`) `round(alt100/410 · (n−1))`; tırmanışta (`vs > 300 ft/dk`) bir derece yukarı, alçalışta (`< −300`) bir derece aşağı eğilim; güçlü adımlarda (`adım % 4 == 0`) en yakın akor tonuna yaslanır. Ritim: `euclid(3 + hash % 4, 16)` kaydırılmış (`hash % 16`), desende aktif adımda nota. Çalgı kıtaya göre (batı/kuzey Avrupa piyano, doğu/güney Avrupa vibrafon, MEA ud, AFR kalimba, ASI koto, AME pad (uzun notalar), DOM/UNK Rhodes). Kazanç `0,5/√N`. Tırmanan uçuşun çizgisi yükselir, alçalanın iner.
- **Ney ve üflemeliler (İstanbul olayları):** ezgi hücresi mantığı aynı (§4c) ama **akor skalası merdiveniyle**; klarnet/trompet/saksafon rolleri aynı. Kıta başına olay-nota çalgıları (§4b) **kaldırıldı**; yerlerini uçuş çizgileri aldı.
- **Çalgılar (sentez, yeni):** Rhodes (sinüs + 2× çan + kısa tine, tremolo hafif), bas (sinüs + alçak geçirenli testere), kick (perde düşüşlü sinüs), snare (gürültü patlaması + 180 Hz ton), hi-hat/açık hat (yüksek geçirenli gürültü, 40/200 ms), pirinç vuruşu (trompet/saksafon tarifleri kısa).
- **Görselleştirme (panel güncellenir):** ROUTES → MUSIC paneli üstte bir **perde şeridi** (piyano-roll gibi: x = zaman, y = perde, log) olur: her uçuş çizgisi kıtasının renginde, irtifasıyla yükselip alçalan bir iz bırakır; notalar iz üzerinde nokta olarak yanar. Altta ritim şeridi: kick/snare/hat/bas dalga patlamaları. Not çalındığında ilgili rotanın koridoru yanar (mevcut). Etiket: `ROUTES → MUSIC · <BÖLÜM> · <AKOR> · <BPM> BPM`.
- **Test:** akor tonları/skalaları (doğru pc'ler, tonlar ⊂ skala), `chordAtStep`/bar sayımı, `grooveStep` desenleri (bölümlere göre vuruş sayıları ve adımlar), `scaleLadder` (sıralı, 3 oktav), `lineNote` (irtifa monoton ⇒ perde monoton, tırmanış/alçalış eğilimi, güçlü adımda akor tonu, her perde skalada), `selectLines` (en çok 12, takip edilen dahil, kıta başına ≤ 4, kararlı), `euclid` kaydırma; motor: kuru çalışma, adım zamanlaması ve swing, bölüm değişimi, çalgı düğüm sayıları (sahte `AudioContext`); denetleyici: gökyüzü beslemesi (irtifa, vs), panel akışı. Müziksel kalite dinlemeyle.

## 5. Dosyalar
Yeni: `scene/corridors.ts`, `scene/aurora.ts`, `scene/sun-glare.ts`, `audio/theory.ts`, `audio/score.ts`, `audio/instruments.ts`, `audio/engine.ts` (rota müziği), `app/art.ts` (`?art`, `A`/`C`/`M` durumu, kalite eşlemesi). Değişen: `scene/earth.ts`, `scene/atmosphere.ts`, `scene/space.ts`, `scene/arcs.ts`, `scene/engine.ts`, `app/controller.ts`, `app/keys.ts` (`A`, `C`, `M`), `hud/GlobeHud.tsx` (etiketler), `README.md`.

## 6. Test
- **Birim (Vitest):** `buildCorridors` (aynı rota N uçuş = 1 koridor, ters yön birleşir, rotasız uçuş dışarıda, sıralama), ağırlık→kalınlık/renk/alfa eğrisi (monoton, sınırlar), gölge fonksiyonunun TS yansıması (güneş vektöründen), `art` durumu (`?art=0`, tuşlar, kalite düşüşü sırası), `arcs` koridor açıkken planlı yay üretmez / kapalıyken üretir, HUD etiketleri.
- **Tarayıcı (gözle):** bulut gölgesi, güneş parlaması, koridor kalınlıkları (İstanbul çevresinde yığılma yok), FPS ≥ 55 (kalite denetleyici açık); sonuçlar uygulama notlarına yazılır.

## 7. Yayın
Adımlar ayrı commit: (1) koridorlar, (2) bulut gölgesi + güneş parlaması, (3) yıldız haritası (onaylı indirme), (4) aurora, (5) rota müziği. Her adım sonrası yerel görsel kontrol; sonunda tek `hosting:globe` deploy (onayla). Eski site ve collector etkilenmez.

## 8. Riskler
- Bulut gölgesi gündüzü karartabilir → parlaklık ölçümü, sabitler ayarlanır.
- Aurora veri dışı süs → varsayılan kapalı + etiket.
- Koridor ağırlığı rota doğruluğuna bağlı (adsbdb yanlış eşleşme olabilir; spec §12'deki risk geçerli).
- Yıldız dokusu ek indirme (8K ≈ 4–6 MB).

## 7b. Geri alınabilirlik (kullanıcı isteği: "beğenmezsem bu bölümü not al, direkt geri alırız")
- Her bölüm (koridorlar, bulut gölgesi+parlama, yıldız haritası, aurora, rota müziği) **kendi commit(ler)iyle** gelir; commit mesajları `art(<bölüm>):` önekini taşır, böylece `git log --grep "^art(sound)"` ile bulunur ve `git revert` ile tek başına geri alınır.
- Bağımsızlık kuralı: bir bölüm başka bölümün koduna bağımlı olmaz (ses `corridors.ts`'in saf `buildCorridors` çıktısını okur ama koridor görselinden bağımsız çalışır; koridor görseli kaldırılsa bile ses için `buildCorridors` kalır). Her bölümün tek bağlantı noktası vardır: engine/controller/keys içinde küçük, işaretli (`// art:<bölüm>`) birkaç satır.
- Uygulama bitince hangi commit'in hangi bölüm olduğu bu spec'in sonundaki "Uygulama notları" tablosuna yazılır (bölüm → commit hash → geri alma komutu); kullanıcı bir bölümü beğenmezse oradan geri alınır.
- Yayın: her bölüm kendi başına deploy edilebilir; beğenilmeyen bölüm geri alınıp yeniden deploy edilir.

## Uygulama notları
| Bölüm | Commit | Geri alma |
|---|---|---|
| Çekirdek (`art.ts`, tuşlar, efekt altyapısı, HUD) | ce19e46, de7278e, 59d1cf1 | `git revert 59d1cf1 de7278e ce19e46` (diğer bölümler çekirdeğe bağlıdır; en son geri alın) |
| Rota koridorları | 4d4536b | `git revert 4d4536b` |
| Bulut gölgesi + güneş parlaması | 2fa789d, 74f04aa, 2472a11 (alacakaranlık eklendi, sonra kaldırıldı) | `git revert 2472a11 74f04aa 2fa789d` |
| Yıldız haritası | 8934651, dd7abab | `git revert dd7abab 8934651` |
| Aurora | f1a1d47, 985055c | `git revert 985055c f1a1d47` |
| Rota müziği | 7b459ae, 3a84843, 075d0a2, 08180d4 | `git revert 08180d4 075d0a2 3a84843 7b459ae` |
| Müzik v2: piyano + ney + 8 akorlu armoni | 3389a06 | `git revert 3389a06` |
| Müzik v2: dört bölümlü form, veriden doğan ney melodisi, öklid ritmi, akan piyano | fdec1af | `git revert fdec1af` |
| Nefesli topluluk (klarnet, saksafon, trompet) | fdec1af (müzik v2 ile birlikte) | `git revert fdec1af` (ayrı commit değildir; müzik v2 ile birlikte geri alınır) |
| Kapsam paneli (ROUTES → MUSIC) ve rota çizgisi nabızları | b4e6549, 7fcc885, dc57f5b | `git revert dc57f5b 7fcc885 b4e6549` (eski uçak çubukları ve motorun ses-saati planlaması geri gelir) |

Gözlemler:
- Koridorlar çiziliyor (gündüz tarafında krem/turuncu); İstanbul çevresi hâlâ beyaza doyuyor.
- Güneş parlaması limbde doğrulandı.
- Yıldız haritası ayarlandıktan sonra ince; takımyıldızlara göre yönelim henüz doğrulanmadı.
- Alacakaranlık bandı kullanıcı tercihiyle kaldırıldı.
- Aurora ve ses henüz kullanıcı tarafından incelenmedi (ses için dinleme gerekir).
- Kapsam paneli koyu bir zemin üzerinde çiziliyor; SOUND OFF durumunda da çalışıyor; konsol hatası yok.
- Akor etiketi doğal harf büyüklüğüyle gösteriliyor (AM/PM gibi okunmuyor).
- Müzik kalitesi ve nefesli topluluk dengesi kullanıcının dinlemesini bekliyor.
