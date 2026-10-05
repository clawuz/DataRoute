# DataRoute — THY 24H Data Tunnel · Tasarım Spec'i

- **Tarih:** 2026-10-05
- **Durum:** Onay bekliyor
- **Referans:** [atc-tunnel-shader](https://github.com/pulkitxm/claude-directory/tree/main/shaders/atc-tunnel-shader)

## 1. Özet

Turkish Airlines'ın son 24 saatlik gerçek uçuş operasyonunu gösteren, kendi kendine çalışan, tam ekran bir data-art installation.

İki sahne var, aynı görsel dilde:

1. **Tunnel.** Referanstaki ray-march warp tunnel. Derinlik = zaman (son 24 saat). Her uçuş, kalkışından inişine (ya da şu ana) kadar tunnel boyunca uzanan bir ışık şerididir. Şeridin yarıçapı gerçek irtifa profilini, açısı destinasyon yönünü, rengi bölgeyi gösterir.
2. **Dünya.** Aynı iridesan malzemeden, prosedürel olarak çizilmiş, dönen bir küre. Aynı şeritler bükülerek gerçek rotalara dönüşür.

Bu iki sahnenin üzerinde, tüm rakamları gerçek veriden gelen bir "enstrüman" HUD'u durur.

**Hedef etki:** İzleyici hem görselden etkilenmeli hem de bunun bir data işi olduğunu rakamlardan okuyabilmeli.

## 2. Hedefler / Hedef dışı

**Hedefler**
- Topluluk ADS-B agregatöründen (adsb.fi; airplanes.live'a geçişe hazır) canlı veri gelir ve 24 saatlik birikim, makine kapalı olsa bile bulutta devam eder.
- ~2.000 uçuşla 1080p–4K arası çözünürlükte 60 fps.
- Deneyim girdi olmadan sonsuza kadar döner. Fare ve klavye girdisi anında tepki alır.
- HUD'daki her sayı ölçülmüş veriden gelir.

**Hedef dışı**
- Geçmiş verinin geriye doğru doldurulması (backfill). İlk 24 saat tunnel kısmen boş olur.
- Yolcu sayısı, doluluk oranı gibi tahmini veya uydurulmuş metrikler.
- Mobil ve dar ekran optimizasyonu (installation hedefli).
- AJet. Filtre bunu tek satırla eklemeye uygun yazılır, ama kapsamda değil.
- Çoklu dil desteği. HUD yalnızca İngilizce.

## 3. Mimari

```
tar1090-db (haftalık) ─┐
adsb.fi /v2/hex ──────┼─► collector (Cloud Function, 2 dk) ──► Storage: state/tracker.json (iç durum)
adsbdb /callsign ─────┘        │                         └──► Storage: public/day.json (public, cache 60 sn)
                               └─► Firestore: routes/{callsign} (7 gün cache)

day.json ──► web (Vite + React + TS + Three.js + D3, Firebase Hosting)
              ├─ data/      fetch + pozisyon/HUD hesapları
              ├─ render/    tunnel · globe · ribbons · bloom · kamera
              ├─ cycle/     faz durum makinesi + girdi yönetimi
              └─ hud/       React overlay
```

### Proje yapısı

```
DataRoute/
  functions/src/
    day-schema.ts               day.json + tracker tipleri (web bunu `import type` ile kullanır; Firebase deploy yalnızca functions/ klasörünü paketlediği için burada)
    fleet.ts                    TC- yolcu jeti filo listesi (tar1090-db, haftalık cache)
    adsb.ts                     ADSBexchange-v2 uyumlu istemci (adsb.fi / airplanes.live)
    routes.ts                   adsbdb sorgusu + Firestore cache
    regions.ts                  ülke → bölge, Istanbul hub mantığı
    tracker.ts                  uçuş segmentasyonu, örnekleme, budama (saf fonksiyonlar)
    publish.ts                  day.json üretimi + istatistikler
    index.ts                    scheduled function
  web/src/
    data/{fetch,mapping,stats}.ts
    render/{engine,tunnel,globe,ribbons,bloom,camera,picking}.ts
    cycle/{machine,input}.ts
    hud/*.tsx
  web/public/fonts/             kullanılan TK font kesitleri (font/ klasöründen kopyalanır)
  web/public/fixture/day.json   fixture modu için örnek veri
  font/                         kullanıcının sağladığı TK fontları (kaynak, değiştirilmez)
  firebase.json · storage.rules · firestore.rules
```

## 4. Veri hattı

### 4.1 Collector

- **Tetikleme:** Cloud Scheduler, 2 dakikada bir. `maxInstances: 1`, timeout 90 sn, 512 MB. Bölge `europe-west1`.
- **Neden OpenSky değil:** Aşama 0'da OpenSky'ın Google Cloud IP'lerini engellediği doğrulandı (bağlantı zaman aşımı). Yerine Google Cloud'dan erişilebilen topluluk agregatörü kullanılıyor.
- **Filo listesi:** Haftada bir `tar1090-db` (`aircraft.csv.gz`, açık kaynak) indirilir; tescili `TC-` ile başlayan ve tipi yolcu jeti olan uçakların hex kodları (~1.000) `state/fleet.json`'a yazılır. Yenileme başarısız olursa eski liste kullanılır.
- **Sağlayıcı:** ADSBexchange-v2 uyumlu `/v2/hex/{a,b,c}` uç noktası. Varsayılan **adsb.fi** (`https://opendata.adsb.fi/api`, anahtar yok, saniyede 1 istek). **airplanes.live** (`https://api.airplanes.live`) erişim onayı gelirse tek bir config parametresiyle (`ADSB_PROVIDER`) seçilir.
- **Sorgu:** Filo 100'lük gruplar halinde sorulur, istekler arası 1,1 sn (~11 istek, ~12 sn/tur).
- **Filtre:** callsign `^THY` ile başlayanlar (yolcu + Turkish Cargo). Yabancı tescilli kiralık (wet-lease) THY uçakları kapsam dışı kalır.
- **Lisans:** adsb.fi verisi kişisel / ticari olmayan kullanım içindir ve adsb.fi'ye linkli atıf zorunludur. `day.json` bir `source: { name, url }` alanı taşır; HUD atıfı buradan gösterir.
- **Uçuş kimliği:**
  - Anahtar `icao24 + callsign`.
  - Şu durumlarda yeni uçuş başlar: önceki kayıt `on_ground` iken şimdi havada; ya da son temastan bu yana 45 dakikadan fazla geçmiş; ya da callsign değişmiş.
- **Örnekleme:** Her tur, havadaki her uçuşa bir örnek ekler: `t` (unix sn), irtifa (`alt_baro`, yoksa `alt_geom`; feet), lat, lon.
- **İniş:** Uçuşun `arr` alanı şu durumlarda kapanır:
  - yerde görüldüğünde (`alt_baro = "ground"`),
  - ya da 45 dakika boyunca temas olmazsa. Bu durumda `arr` = son temas zamanı.
- **Budama:** Her turda `arr < now − 24 saat` olan uçuşlar silinir. Hâlâ devam eden uçuşların 24 saatten eski örnekleri de kırpılır.
- **Eşzamanlılık:** `tracker.json`, okunduğu generation'a koşullu yazılır (`ifGenerationMatch`). Çakışma olursa o tur atlanır.

### 4.2 Rota ve bölge

- **Rota sorgusu:** `adsbdb.com /v0/callsign/{cs}` → kalkış/varış IATA kodu, ülke, lat/lon.
  - Sonuç Firestore'da `routes/{callsign}` dokümanına 7 gün TTL ile yazılır.
  - Bulunamazsa sonuç 24 saat negatif cache'lenir.
- **Istanbul hub:** IST ve SAW "Istanbul" sayılır.
- **Karşı uç:** Uçuşun Istanbul olmayan ucudur. Her iki uç da Istanbul değilse varış noktası alınır.
- **Açı (`bearing`):** Istanbul'dan (41.275°N, 28.752°E) karşı uca olan başlangıç pusula yönü, derece cinsinden.
- **Bölge:** Karşı ucun ülkesinden belirlenir. Değerler:
  - `DOM`: iki uç da Türkiye'de.
  - `EUR`, `MEA` (Orta Doğu), `AFR`, `ASI` (Asya + Okyanusya), `AME` (Kuzey + Güney Amerika).
  - `UNK`: rota bulunamadı. Bu durumda açı = son `true_track` değeri.
- **Uçuş numarası:** `THY` öneki `TK` ile değiştirilir (`THY1` → `TK1`). Gösterimde bu kullanılır.

### 4.3 `day.json` şeması (v1)

```ts
interface DayFile {
  v: 1;
  generatedAt: number;            // unix sn
  collectingSince: number;        // collector'ın ilk başarılı turu
  status: { state: "ok" | "delayed"; lastSuccessAt: number; error?: string };
  source: { name: string; url: string };  // ör. { name: "adsb.fi", url: "https://adsb.fi" } — HUD atıfı
  window: { from: number; to: number };   // to = generatedAt, from = to − 86400
  stats: {
    airborne: number;             // şu an havada
    flights24h: number;           // penceredeki uçuş sayısı
    destinations: number;         // farklı karşı uç havalimanı
    countries: number;
    km24h: number;                // ardışık örnekler arası büyük daire toplamı
  };
  flights: Flight[];
}
interface Flight {
  id: string;                     // icao24-dep
  cs: string;                     // "THY1"
  tk: string;                     // "TK1"
  from?: string; to?: string;     // IATA
  region: "DOM"|"EUR"|"MEA"|"AFR"|"ASI"|"AME"|"UNK";
  bearing: number;                // derece
  dep: number;                    // ilk görülme (unix sn)
  arr: number | null;             // null = havada
  s: [number, number, number, number][]; // [t−dep (sn), irtifa/100 ft (int), lat (4 ondalık), lon (4 ondalık)]
  now?: { gs: number; trk: number };      // yalnızca havadakiler: yer hızı (kt), yön (derece)
}
```

- **Yayın:** `public/day.json` gzip'li olarak, `Cache-Control: public, max-age=60` ile yazılır.
- **Erişim:** Storage rules yalnızca bu dosyaya public okuma izni verir. Bucket'ta Hosting domain'i için CORS ayarlanır.
- **Boyut:** Tahminen gzip'le ~300–400 KB.

### 4.4 Frontend veri akışı

- `day.json` her 120 saniyede bir çekilir. Yeni uçuşlar şerit buffer'larına eklenir, değişenler güncellenir; geçişler yumuşak yapılır.
- Fetch hatasında son veri ekranda kalır. Yeniden deneme aralığı 15 sn'den başlayıp 2 dakikaya kadar artar.
- `?data=fixture` parametresiyle `/fixture/day.json` okunur ve backend gerekmez.

## 5. Görsel eşleme

| Veri | Tunnel | Dünya |
|---|---|---|
| Zaman | `z = −(now − t) / 86400 × 240` (24 saat = 240 birim) | Yok. Yaşa göre parlaklık. |
| İrtifa | `r = 1 − (ft / 41000) × 0.7` (yer = duvar) | Yüzeyden yükseklik, ~40× abartılı |
| Konum | Açı = `bearing` | Gerçek lat/lon. Örnek boşlukları büyük daire enterpolasyonuyla doldurulur. |
| Bölge | Şerit rengi | Şerit rengi |
| Havada | Parlak "baş" sprite'ı + kalın şerit | Aynı |
| Süre | Şerit uzunluğu (kendiliğinden) | Rota uzunluğu |

- **Bölge paleti:** koyu zemin üzerinde yüksek kontrastlı 6 ayrık renk + `UNK` için nötr gri. Renkler implementasyonda dataviz paleti doğrulayıcısıyla seçilir.
- **THY kırmızısı:** yalnızca HUD vurguları ve "havada" göstergesi için kullanılır.

## 6. Render

### Stack
- Three.js (WebGLRenderer, WebGL2) ve `postprocessing` (bloom).
- D3: `d3-geo` (yön, mesafe, büyük daire enterpolasyonu), `d3-scale` / `d3-array` (HUD), `topojson-client`.
- Natural Earth 110m land (public domain): build sırasında 1024×512'lik bir kara maskesi texture'ına dönüştürülür.

### Ortak kamera
- Perspektif kamera, dikey FOV ≈ 90°. Bu, referans shader'daki `normalize(FC*2 − r.xyy)` ışın yönüyle eşleşir.
- Tunnel pass'i kameranın pozisyon ve yönelimini uniform olarak alır. Böylece ray-march tunnel ile şeritler aynı uzayda görünür.

### Tunnel pass
- Tam ekran quad üzerinde referans GLSL, minimum değişiklikle kullanılır.
- Eklenen uniform'lar:
  - `u_flow`: `t/0.2` ilerlemesinin çarpanı. Havadaki uçak sayısının günlük min–max aralığındaki yerine göre 0,6–1,4 arası.
  - `u_energy`: genel parlaklık, varsayılan 0,55.
  - `u_tint`: havadaki uçuşların bölge dağılımından ağırlıklı bir renk.
  - `u_fade`: faz geçişleri için.
- Render ölçeği adaptif kalite sistemine bağlıdır (1.0 / 0.5).

### Globe pass
- Kameradan ray-sphere kesişimi hesaplanır.
- **Kara:** maske texture'ından, tunnel'in cosine-folded iridesan alanıyla boyanır (aynı fonksiyon, küre koordinatlarında).
- **Okyanus:** koyu, üzerinde soluk 15°'lik grid.
- **Atmosfer:** Fresnel rim, ton eşleme `tanh`.
- Küre yavaşça döner (~0,6°/sn).

### Ribbons
- Tek bir instanced mesh, her segment bir instance.
- Attribute'lar:
  - `pTunnel`, `pGlobe` (vec3)
  - `tAbs`: zaman damgası
  - `flightIdx`
  - `region` ve `airborne` (bir data texture'dan okunur)
- **Vertex shader:**
  - `pos = mix(pTunnel, pGlobe, smoothstep(stagger))`. `stagger`, `u_morph` ve uçuş başına bir hash'ten hesaplanır.
  - Genişlik ekran uzayında hesaplanır.
  - `tAbs > u_currentTime` olan segmentler gizlenir. Bu, TripsLayer tekniğiyle yapılan replay.
- **Fragment shader:** bölge rengi × fog (`exp`, tunnel'le aynı yoğunluk) × "baş" yakınlığı. Additive blending, depth write kapalı.
- **Baş sprite'ları:** havadaki uçuşlar için ayrı bir points katmanı. Hafif nabız gibi atar.
- **Bloom:** yalnızca ribbon ve baş katmanlarına, yarım çözünürlükte uygulanır.

### Picking
- Her karede değil, ~10 Hz'de çalışır.
- Görünür şerit örnekleri CPU'da ekrana yansıtılır ve basit bir grid üzerinden en yakın nokta aranır.
- Eşik 12 px. En yakın uçuş hover/spotlight hedefi olur.

### Adaptif kalite
- FPS 5 saniye boyunca 45'in altında kalırsa: önce tunnel ölçeği 0,5'e iner, sonra bloom çözünürlüğü düşer.
- FPS 10 saniye boyunca 58'in üstünde kalırsa bir kademe geri yükselir.

## 7. Döngü ve etkileşim

### Faz durum makinesi (varsayılan ~3 dakika)

| Faz | Süre | Kamera / sahne |
|---|---|---|
| `REPLAY` | 90 sn | Kamera `z(now−24h)` noktasından `z(now)`'a ilerler. `u_currentTime` window.from'dan now'a akar. |
| `EXIT` | 8 sn | Kamera geri çekilir. Tunnel `u_fade` ile söner, globe belirir, `u_morph` 0→1 olur. |
| `GLOBAL` | 60 sn | Kamera küre etrafında yavaşça yörüngede döner. Spotlight her 8 sn'de bir değişir. |
| `DIVE` | 8 sn | Kamera Istanbul'a dalar, `u_morph` 1→0 olur, tunnel belirir. Sonra `REPLAY`'e dönülür. |

- Faz 1'de (bkz. §10) döngü `REPLAY → LIVE (30 sn) → REPLAY` şeklindedir. `LIVE` fazında kamera "şimdi"de durur ve yavaşça döner.
- Faz 2'de `LIVE` korunur ve şu sıra kullanılır: `REPLAY → LIVE → EXIT → GLOBAL → DIVE`.

### Girdi
- Herhangi bir fare veya klavye girdisi gelince deneyim **manuel moda** geçer.
- Son girdiden 20 saniye sonra otomatik döngü kaldığı fazdan devam eder.
- **Fare:**
  - Hover: tooltip.
  - Tıklama: o uçuşu spotlight'a sabitler.
  - Sürükleme: GLOBAL fazında küreyi döndürür.
- **Klavye:**

| Tuş | İşlev |
|---|---|
| `Space` | Duraklat / devam et |
| `←` `→` | Replay'de 1 saat geri/ileri |
| `G` | Tunnel ↔ dünya (EXIT/DIVE geçişini tetikler) |
| `H` | HUD'u gizle |
| `F` | Tam ekran |

- **`prefers-reduced-motion`:** akış hızı ×0,4, morph süresi ×2, sayaç tick animasyonları kapalı.

## 8. HUD

- **Dil:** İngilizce.
- **Ölçek:** Değerler `vmin` cinsinden. Hedef çözünürlük 16:9, 1080p–4K.

### Fontlar
Yalnızca kullanılan kesitler `web/public/fonts`'a kopyalanır:
- TK Display Condensed (SemiBold, Bold): başlık ve büyük sayaçlar.
- TK Text Wide Medium: büyük harf, geniş harf aralığıyla etiketler.
- TK Text (Regular, Medium): gövde metni ve tooltip'ler.

Sayılarda `font-variant-numeric: tabular-nums` kullanılır. Font `tnum` desteklemiyorsa sayılar sabit genişlikli rakam hücrelerinde gösterilir.

### Bileşenler

| Bölge | İçerik |
|---|---|
| Sol üst | `TURKISH AIRLINES · 24H OPERATIONS` (kromatik RGB split). Faz göstergesi: `● REPLAY 08:42 UTC` / `● LIVE` / `● GLOBAL VIEW` |
| Sağ üst | Sayaçlar: `AIRBORNE`, `FLIGHTS · 24H`, `DESTINATIONS`, `KM FLOWN`. Değer değişince tick animasyonu. |
| Sol kenar | İrtifa histogramı `FL000–FL410`. Havadaki uçuşlar, 2.000 ft'lik bin'ler. |
| Alt şerit | 24 saatlik kalkış histogramı (saatlik) + replay playhead'i. GLOBAL fazında `TOP DESTINATIONS` (ilk 10) olur. |
| Sağ alt | Bölge çubukları. Renkleri şerit renkleriyle aynı (lejant işlevi de görür). |
| Spotlight kartı | `TK1 · IST → JFK`, `FL370`, `GS 488 KT`, `ELAPSED 06:12`, mini irtifa profili. Uçuşa ince bir çizgiyle bağlı. |
| Alt sol | `SOURCE: ADSB.FI · UPDATED 14 S AGO · 2,031 FLIGHTS` (kaynak adı ve linki `day.json.source`'tan) |

- **Durum metinleri:**
  - `DATA DELAYED · LAST UPDATE 12 MIN AGO` (amber)
  - `COLLECTING · STARTED 2H AGO`
- **Hız (`GS`):** `Flight.now.gs` alanından gelir. Sağlayıcının `gs` alanından (knot) gelir.

## 9. Hata durumları

| Durum | Davranış |
|---|---|
| Sağlayıcı (adsb.fi) ya da filo DB hatası / 429 | Tur atlanır ve loglanır. `status.state = "delayed"`, son veri korunur. |
| adsbdb hatası | Bölge `UNK`, açı = true track. Bir sonraki turda tekrar denenir. |
| Storage yazma çakışması | Tur atlanır. |
| `day.json` yok (ilk kurulum) | Tunnel varsayılan parametrelerle akar, HUD `COLLECTING` gösterir. |
| Frontend fetch hatası | Son veri kalır, yeniden deneme 15 sn → 2 dk arası artan aralıklarla. |
| WebGL2 yok / shader derleme hatası | Sade bir hata ekranı ve hata metni. |
| Düşük FPS | Adaptif kalite (§6). |

## 10. Aşamalar

- **Aşama 0: Ön kontrol (tamamlandı, 2026-10-05).** OpenSky Cloud Functions'tan erişilemez (bağlantı zaman aşımı); adsb.fi ve tar1090-db erişilebilir (adsb.fi 151 ms). Veri kaynağı buna göre değiştirildi.
- **Aşama 1:** Veri hattı + tunnel + ribbons + bloom + picking + HUD + `REPLAY ⇄ LIVE` döngüsü + fixture modu. Kendi başına tamamlanmış bir deneyim olarak teslim edilir.
- **Aşama 2:** Globe pass + kara maskesi + morph + `EXIT / GLOBAL / DIVE` fazları + küre sürükleme.

## 11. Test

- **Collector (Vitest):**
  - `tracker`: segmentasyon (yerden kalkış, 45 dk boşluk, callsign değişimi), örnekleme, budama.
  - `regions`: hub mantığı, yön hesabı, ülke → bölge eşlemesi.
  - `publish`: istatistikler, şema.
  - Fixture olarak gerçek adsb.fi yanıt formatından türetilmiş örnekler kullanılır.
- **Entegrasyon:** Firebase Emulator'da (Functions + Storage + Firestore) iki tur çalıştırılıp `day.json` doğrulanır.
- **Web (Vitest):** `mapping` (tunnel ve dünya pozisyonları, büyük daire enterpolasyonu), `stats` (histogramlar), `cycle/machine` (faz geçişleri, manuel mod ve 20 sn sonra geri dönüş).
- **Görsel ve performans:** Fixture verisiyle ve canlı veriyle tarayıcı önizlemesinde, 1080p ve 4K'da FPS ölçümü. Kabul kriteri: 2.000 uçuşla ≥ 55 fps (adaptif kalite devredeyken).

## 12. Maliyet ve operasyon

- Firebase Blaze planı. Tahmini aylık maliyet:
  - Functions $0, Scheduler $0, Firestore $0.
  - Storage ~$0,20, Hosting egress $0–birkaç cent.
  - **Toplam: ayda $0–1.**
- Kurulumda **$5'lık bir bütçe alarmı** tanımlanır.
- Artifact Registry'ye bir temizleme politikası eklenir (eski function imajları silinir).

## 13. Riskler

- adsb.fi ücretsiz bir topluluk servisi; erişimi kısıtlayabilir veya kapatabilir. Azaltma: airplanes.live'a config ile geçiş hazır (erişim onayı gerekir).
- Ticari kullanım: adsb.fi koşulları izin vermez. Proje ticarileşirse sağlayıcıyla anlaşma gerekir.
- adsbdb rota kapsamı eksik olabilir. Etkisi: `UNK` oranı yükselir. Collector her turda bu oranı loglar.
- ADS-B kapsama boşlukları (okyanus, Afrika). Enterpolasyonla kapatılır.
- TK fontlarının lisansı. Installation dışında yayınlanacaksa kontrol edilmeli.
