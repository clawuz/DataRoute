# Regional Turkish music: what the research says and what the cards do

Date: 2026-10-28. Web research (searches, mostly blogs and theses; the sources are in the answer to the user and below). Findings marked ✔ are consistent across sources; ○ weak or one source.

## Karadeniz (Black Sea) — card `karadeniz`
- ✔ The **kemençe** (3 strings tuned in fourths, bowed, played with the fingertips; the strings are often played in **pairs**, so one kemençe gives a melody and a continuous drone-like second voice, often in parallel fourths) leads around Trabzon and Giresun; the **tulum** (bagpipe, continuous drone) leads further east (Rize, Artvin; also accordion in Artvin).
- ✔ **Horon** is in aksak metres: 2/4, 4/4, 5/8, **7/8**, 9/8, and the fast *dik horon* in 4/4, 7/8 or 7/16 (sources disagree between 7/8 and 9/8 as "the" horon). ✔ It starts slow (*düz / yayma horon*) and speeds up.
- ○ Makams: hicaz, hüseyni, uşşak, rast, kürdi (one site; no scholarly confirmation found). ○ No reliable BPM range found (the 90–132 figures come from an AI-prompt site).
- Card now: cell 7/8 `[2,2,3]`, USSAK, kemençe double stop + grace notes, tulum drone. Missing: the slow-to-fast form, the 9/8 and 4/4 variants, the real kemençe tone (the recordings are poor).

## Doğu Anadolu — card `dogu`
- ✔ Halay is mostly 2/4 or 4/4 led by hard davul strokes; some regions use aksak (9/8, 5/8) (one weak source). ✔ It starts with a slow heavy section (Erzurum, Kars, Ardahan bar: dignified) and accelerates. ✔ Davul and zurna are the backbone; bağlama, mey, kaval or clarinet are added by region.
- ○ No source for the makams of Erzurum/Kars/Van halay. Card now: 4/4, HICAZ, zurna, davul (frame drum). Missing: the slow-to-fast form and the heavy davul accent.

## Ege (Aegean) zeybek — card `zeybek`
- ✔ **9-beat** metres: *ağır zeybek* 9/4 (or 9/2), *yürük (kıvrak) zeybek* 9/8 (or 9/16); groupings 3+2+2+2, 2+2+2+3, 2+2+3+2. ✔ The final (karar) is on **rast, dügâh or segâh**, associated with hüseyni. ✔ Instruments: zurna, kaval, darbuka, davul; violin (hüzün) and clarinet are common.
- Card changed today: scale RAST (wish SEGAH) instead of uşşak/hicaz, cell `[3,2,2,2]`, bpm 78–96, melody clarinet, violin, saz.

## İç Anadolu — cards `icanadolu`, `mevlevi`
- ✔ Two families: **uzun hava** (unmetered, free, a fixed scale and seyir, like the **bozlak** of Central Anatolia: yiğitleme, güzelleme, yanık, ağıt; lines of 11 or 14 syllables) and **kırık hava** (metered, a fixed usul: koşma, güzelleme, taşlama). In Konya the instrumental interludes of long airs have a usul, in other places the saz does not play in the free parts.
- Card now: düyek 8 `[2,1,1,2,2]`, saz and bağlama. Missing: an unmetered **uzun hava** intro (the taksim/alap-like free-time form of the idioms plan).

## Akdeniz / Yörük — card `akdeniz`
- Not found in this round (no usable source for the Çukurova/Antalya yörük rhythms). The card remains my judgement (aksak 10 `[3,2,2,3]`, HICAZ, kanun, ud).

## What to do next (needs the form slice of `docs/music-instrument-idioms.md`)
1. A **slow-to-fast form** for horon and halay (`karadeniz`, `dogu`): the piece starts sparse and slow in feel and thickens: by density now, by tempo ramp later.
2. An **uzun hava intro** (free time, one voice over a drone) for `icanadolu` and `mevlevi`.
3. The 9/8, 4/4 and 7/16 **variants** of the horon (`cells` per card chosen by the route hash).
4. A real kemençe recording (the Freesound search found only NC excerpts; the current `KEMENCE_REAL` is NC).
