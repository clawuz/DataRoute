# Regional Turkish music: what the research says and what the cards do

Date: 2026-10-28. Web research (searches, mostly blogs and theses; the sources are in the answer to the user and below). Findings marked ✔ are consistent across sources; ○ weak or one source.

## Karadeniz (Black Sea) — card `karadeniz`
- ✔ The **kemençe** (3 strings tuned in fourths, bowed, played with the fingertips; the strings are often played in **pairs**, so one kemençe gives a melody and a continuous drone-like second voice, often in parallel fourths) leads around Trabzon and Giresun; the **tulum** (bagpipe, continuous drone) leads further east (Rize, Artvin; also accordion in Artvin).
- ✔ **Horon** is in aksak metres: 2/4, 4/4, 5/8, **7/8**, 9/8, and the fast *dik horon* in 4/4, 7/8 or 7/16 (sources disagree between 7/8 and 9/8 as "the" horon). ✔ It starts slow (*düz / yayma horon*) and speeds up.
- ○ Makams: hicaz, hüseyni, uşşak, rast, kürdi (one site; no scholarly confirmation found). ○ No reliable BPM range found (the 90–132 figures come from an AI-prompt site).
- Card now: cell 7/8 `[2,2,3]`, USSAK, kemençe double stop + grace notes, tulum drone. Missing: the slow-to-fast form, the 9/8 and 4/4 variants, the real kemençe tone (the recordings are poor; added on 2026-10-28 from the Turkish Music Portal, restricted terms, see below).
- **Status (2026-10-28):** done: `form: "horon"` (düz horon intro: a long call over the drone and the kudüm; yayma horon verse; dik horon build and chorus: the figure twice a bar) and the variants `cells` 7/8 `[2,2,3]`, 9/8 `[2,2,2,3]`, 4/4 `[1,1,1,1]`, 7/8 alt `[3,2,2]`. Still missing: the 7/16 horon, a real tempo ramp, a better kemençe recording.
- **Instruments (2026-10-28):** the real Black Sea kemençe and the tulum are in the pack, cut from the Turkish Music Portal sound samples (Türk Kültür Vakfı; **RESTRICTED terms**, flagged in the ledger and on the credits page, not to be deployed without written permission): KEMENCE_KARADENIZ (5 zones G4-E5, one of them the open-string fourth E4+A4) and TULUM (4 zones A4-E5; D5 and E5 sound over the pipes' A4, the instrument's own two-voice sound). The card: melody KEMENCE_KARADENIZ, TULUM, BAGPIPE; held TULUM, BAGPIPE_DRONE, CELLO. The kemençe takes the slide, the titreme and the mordent but no added double stop (the recording plays its parallel fourths itself); the tulum the bagpipe's grace note before a repeated pitch.
- **The portal recordings as melody data: not done.** The kemençe plays two strings at once and the tulum's melody sounds over a held A4, so a pitch tracker cannot tell the melody line reliably: pyin and an upper-partial tracker agree within 50 cents on only 40% (kemençe) and 58% (tulum) of the loud frames, the disagreements are whole tones and fifths (D5 or E5, C5 or D5), and 47-60% of the upper line's runs are shorter than 46 ms. Degree sequences from them would be guesses, so none were written (and none would go into the repo or the shippable bank).

## Doğu Anadolu — card `dogu`
- ✔ Halay is mostly 2/4 or 4/4 led by hard davul strokes; some regions use aksak (9/8, 5/8) (one weak source). ✔ It starts with a slow heavy section (Erzurum, Kars, Ardahan bar: dignified) and accelerates. ✔ Davul and zurna are the backbone; bağlama, mey, kaval or clarinet are added by region.
- ○ No source for the makams of Erzurum/Kars/Van halay. Card now: 4/4, HICAZ, zurna, davul (frame drum). Missing: the slow-to-fast form and the heavy davul accent.
- **Status (2026-10-28):** done: `form: "halay"` (intro, break and outro: the davul alone on the strong places, heavy, under a long zurna call; build and chorus: the figure twice a bar with the davul on both repeats) and the variants `cells` 4/4, 2/4 `[1,1]`, 9/8 `[2,2,2,3]`, 5/8 `[2,2,1]`.

## Ege (Aegean) zeybek — card `zeybek`
- ✔ **9-beat** metres: *ağır zeybek* 9/4 (or 9/2), *yürük (kıvrak) zeybek* 9/8 (or 9/16); groupings 3+2+2+2, 2+2+2+3, 2+2+3+2. ✔ The final (karar) is on **rast, dügâh or segâh**, associated with hüseyni. ✔ Instruments: zurna, kaval, darbuka, davul; violin (hüzün) and clarinet are common.
- Card changed today: scale RAST (wish SEGAH) instead of uşşak/hicaz, cell `[3,2,2,2]`, bpm 78–96, melody clarinet, violin, saz.
- **Status (2026-10-28):** done: the three groupings as `cells` (3+2+2+2, 2+2+2+3, 2+2+3+2), one per piece. No form (the ağır/yürük contrast is not modelled).

## İç Anadolu — cards `icanadolu`, `mevlevi`
- ✔ Two families: **uzun hava** (unmetered, free, a fixed scale and seyir, like the **bozlak** of Central Anatolia: yiğitleme, güzelleme, yanık, ağıt; lines of 11 or 14 syllables) and **kırık hava** (metered, a fixed usul: koşma, güzelleme, taşlama). In Konya the instrumental interludes of long airs have a usul, in other places the saz does not play in the free parts.
- Card now: düyek 8 `[2,1,1,2,2]`, saz and bağlama. Missing: an unmetered **uzun hava** intro (the taksim/alap-like free-time form of the idioms plan).
- **Status (2026-10-28):** done: `form: "uzunhava"` on icanadolu and mevlevi: the intro and the outro in free time (no drums, bass or pluck; the pad held a bar; the hook in long notes off the grid, a breath every second bar), a pick-up in bar 7, the metre from bar 8.

## Akdeniz / Yörük — card `akdeniz`
- Not found in this round (no usable source for the Çukurova/Antalya yörük rhythms). The card remains my judgement (aksak 10 `[3,2,2,3]`, HICAZ, kanun, ud).

## What to do next (needs the form slice of `docs/music-instrument-idioms.md`)
Status 2026-10-28: items 1-3 are done (spec `docs/superpowers/specs/2026-10-28-regional-forms-design.md`); item 4 is open.
1. A **slow-to-fast form** for horon and halay (`karadeniz`, `dogu`): the piece starts sparse and slow in feel and thickens: by density now, by tempo ramp later.
2. An **uzun hava intro** (free time, one voice over a drone) for `icanadolu` and `mevlevi`.
3. The 9/8, 4/4 and 7/16 **variants** of the horon (`cells` per card chosen by the route hash).
4. A real kemençe recording (the Freesound search found only NC excerpts; the current `KEMENCE_REAL` is NC). Done 2026-10-28 for the Black Sea card: KEMENCE_KARADENIZ and TULUM from the Turkish Music Portal (RESTRICTED terms, not to be deployed without written permission).
