# Açılış filmi — kare kare

Kaynak: `globe/src/personal/intro-film.ts` (zaman → kamera/metin, saf fonksiyon) ve `globe/src/personal/IntroFilm.tsx` (sahne + yükleme kapısı).
Film, canlı ekranın kendi küresi üzerinde oynar; ayrı bir video yoktur. Kullanıcıya bilgi verilmez: dev dünya → rotalar → modüller.

## 0. Yükleme kapısı (film başlamadan önce)

| Aşama | Ne görünür | Ne duyulur |
|---|---|---|
| Splash | Logo, `A WORLD OF MUSIC`, ince çizgi + `TUNING THE WORLD` | Sessiz (müzik kapalı) |
| Hazır | Küre, harita, gökyüzü, fontlar, kayıt yüklendi → çizgi yerine `LISTEN TO THE WORLD` butonu | Sessiz |
| Dokunuş | Buton tıklanınca film başlar | Dokunuşun içinde ses kilidi açılır (telefon çalar) |

Yarım yüklenmiş küre / müzik kutusu hiç görünmez, bozuk ses hiç çalmaz. Ağ 40 sn takılırsa (`WAIT_CAP_MS`) kapı yine de açılır.

## 1. Sahne planı (mevcut uygulama, 20,2 sn)

| Süre (sn) | Kamera (mesafe / odak) | Rotalar & ses | Metin |
|---|---|---|---|
| 0,0–1,2 | 9 → uzak, Atlantik üstü (8°K, 50°B) | Siyahtan açılır (`black` 1→0) | — |
| 0,2–3,2 | Dev dünya döner, 9 → 1,96'ya yaklaşır; odak 35°K, 28,7°D (İstanbul) | Gün tekrarı başlar, müzik açık; rota parlaması düşük (`dim` 0,3) | — |
| 3,2–6,3 | 1,96 → ~2,1 yavaş geri; hafif kayma doğuya | İstanbul'dan rotalar açılır; her nota kendi rotasını yakar; halo 0,3 → 1,9 | — |
| 6,3–7,6 | Aynı | Enstrüman/ritim katmanları devrede; soldan koyu perde | Perde 0 → 0,7 |
| 7,0–7,9 | Aynı | — | Marka (THY lockup) belirir |
| 9,0 / 10,8 | Aynı | — | `We fly to the most countries.` → `Now we make them play.` |
| 11,9–12,8 | Aynı | — | `A WORLD OF MUSIC` |
| 12,8–16,0 | Kamera tutar (~2,2) | Sesler tek kompozisyon gibi akar | Metin kalır |
| 16,0–16,8 | — | — | Metin ve perde çıkar |
| 16,8–19,8 | 2,25 → 3,2; odak → 20°K, 30°D | Müzik fade-out; rota parlaklığı 1'e döner | — |
| 19,8–20,2 | Canlı ekran görünümü | Film biter: canlı ekran başa sarılır, mobilya (HUD) girer | — |

`?filmat=<sn>` ile filmi o saniyede dondurup tek kare incelemek mümkün.

## 2. İstenen yapı ile fark

İstenen kurgu 15 sn idi (3 / 2 / 2 / 3 / 5). Uygulamadaki film 20,2 sn ve beat'ler şöyle eşleşiyor:

| İstenen beat | Karşılığı | Fark |
|---|---|---|
| 0–3 yaklaşma | 0,2–3,2 | Aynı |
| 3–5 rotalar açılır | 3,2–6,3 | ~1 sn uzun |
| 5–7 enstrümanlar/notalar | 6,3–9 (metin öncesi) | Notaların rotadan çıkması şimdilik yalnız ışık (parçacık yok) |
| 7–10 kamera geri çekilir, küre+rota bütünleşir | Yok — kamera ~2,2'de tutuyor, geri çekilme 16,8'de | **Eksik**: ortadaki "geri çekil" planı |
| 10–15 yerine oturur + kısa metin | 9–16,8 metin, 16,8–19,8 oturma | Metin önce, oturma sonra (sıra ters) |

## 3. Önerilen düzeltme (onay verirsen uygularım)

Süreyi 15 sn'ye çekmek, "geri çekil" beat'ini eklemek:

1. 0–3: değişmez.
2. 3–5: rotalar İstanbul'dan açılır (`dim` 0,3 → 0,5).
3. 5–7: halo 1,2'ye çıkar; her notada rotanın ucundan küçük parlak nokta (heads.ts zaten var, yalnız boyutu notaya bağlanır).
4. 7–10: mesafe 2,1 → 3,0 (geri çekilme), `dim` → 0,8; rotalar kürenin üstüne oturur.
5. 10–15: oturma 3,0 → 3,2 + tek cümle (`Every Destination Has a Sound.`), 13,8'de metin çıkar, 15'te canlı ekrana geçiş; müzik 12–14,7 arası fade-out.

Değişiklik yalnız `intro-film.ts` sabitleri ve `shotAt` eğrilerinde; `IntroFilm.tsx` dokunulmaz. Metin kararı: mevcut iki satır + marka mı kalsın, tek cümle mi olsun — bunu sen seç.
