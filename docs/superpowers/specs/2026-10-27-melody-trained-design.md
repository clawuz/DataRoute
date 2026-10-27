# The melody bank trained on real music (M1 of the melody model plan)

Date: 2026-10-27. Branch: `feat/ui-v2`. Continues `2026-10-27-melody-bank-design.md` (compact bank format v2, the selector, `?melody=`). The user: "the bank must be trained by scanning the existing genres on the internet; this way no good piece comes out." and chose: NC data may be used for training, **nothing derived from NC data ships until the user approves the licence** (local listening only).

## Data (downloaded 2026-10-27 into `.corpora/`, git-excluded; the site never reads it)

| Source | Where on disk | Licence | What it gives |
|---|---|---|---|
| PDMX (Zenodo 15571083): `PDMX.csv` (metadata) + `mid.tar.gz` (MIDI) | `.corpora/pdmx/` | CC BY 4.0 (checked on Zenodo) | 222k public-domain MuseScore scores: classical, jazz, folk, pop |
| SymbTr (GitHub MTG/SymbTr, 2200 pieces, 155 makams, txt + MusicXML) | `.corpora/symbtr/repo/` (`txt/`, `MusicXML/`) | CC BY-NC-SA 4.0 (`LICENSE`) | Turkish makam melodies with comma-accurate pitches and usul |
| Nottingham (GitHub jukedeck/nottingham-dataset): ABC + MIDI | `.corpora/nottingham/repo/` | repo GPL-3.0, data open-access | 1000+ British/American folk tunes |

`mid.tar.gz` is extracted on demand into `.corpora/pdmx/mid/` (about 1–2 GB; delete after the phrase corpus is built if disk is tight).
`docs/music-melody-model-report.md` carries a licence ledger: source, licence, number of pieces used per card, shippable yes/no.

## The phrase corpus (`scripts/music/melody/corpus/`, output `.corpora/phrases/<card>.jsonl`)

Every source piece becomes bars of notes `(onset in bar 0..1, degree, duration in bars)`; **degrees are indices into the TARGET card's scale** (the same integer scale degrees the bank uses: 0 = the tonic/karar, negative below, up to 9 above):
- **SymbTr** (`txt/*.txt`, tab-separated; columns `Sira Kod Nota53 NotaAE Koma53 KomaAE Pay Payda Ms LNS Bas Soz1 Offset`; the file name is `makam--form--usul--title--composer.txt`; rows with `Kod` 51 are usul/rest markers; `Koma53` is the pitch in 53 commas, `Pay/Payda` the duration as a fraction of a whole note, `Offset` the onset in quarter-beats-of-the-measure scale): the karar is the last note of the piece (commas relative to it); a comma pitch maps to the nearest degree of the card's scale (card scale semitones × 53/12 = commas, octave-extended); makam → cards by `makam-cards.json` (written by hand: hicaz family → karsilama, akdeniz, zeybek, arabic, khaleeji, maghrebi; uşşak/hüseyni/bayati family → anatolian, icanadolu, dogu, karadeniz; rast/segah/nihavend/saba family → mevlevi, persian; the rest → anatolian), usul (the part after the makam in the file name) → bars: a bar is one usul cycle (`Pay/Payda` of the usul from the `Bas`/`Offset` marks).
- **PDMX** (`PDMX.csv` columns include genres, tags, key, tempo, n_tracks, subset flags; `mid/` MIDI): use the `no_license_conflict` subset and public-domain flag; the melody is the highest-pitched voice of the track with the most notes (skyline); the tonic and mode from the key signature metadata (fall back to the most frequent pitch class); degrees mapped to the card's scale by nearest scale index relative to the tonic; cards by `cards-map.json` (genres/tags/instruments to cards: classical → classical, romantic, baroque, italian, russian, chanson, fado; jazz → jazz, bossa, samba; country/folk → country, celtic, nordic, slavic; pop/rock → pop, rnb, dance; world tags → matching cards where they exist; cards without PDMX material get none).
- **Nottingham**: ABC/MIDI, key from the `K:` field, degrees as for PDMX → celtic, country, nordic.
- Phrases: windows of 4 consecutive bars aligned to bar starts, stride 2 bars; keep a window when it has ≥ 3 notes per bar on average and ≤ 40% rest time; store `{ src, piece, bars: [[[onset, degree, dur], …] × 4] }`.
- Per card a report of how many phrases came from which source.

## The model (`scripts/music/melody/train.py`): grammar skeleton + learned note moves

For each card (target `hits` h = 1..9) from its phrase corpus:
1. **Reduce** each bar to h slots (`reduce_bar(notes, h)`): if the bar has ≥ h notes keep the first and last and the h−2 longest of the middle in time order; if fewer, repeat the longest note into the gaps and mark one gap in four as a rest when the source had a rest there. The last slot of each bar becomes the card's cadence degree for that bar (the contract of the bank); the original degree before the cadence is kept for the statistics.
2. **Learn** (with additive smoothing 0.1 and back-off card → cluster (`CLUSTER_OF`) → all): (a) `P(interval | previous interval, bar role 1..4, slot class)` where interval is the signed scale-degree step between consecutive slots (clipped to ±5) and slot class is first / middle / last; (b) bar-level operator frequencies: for bar k ≥ 2 the probability that it is a **repeat** of an earlier bar, a **sequence** of it by ±1/±2 degrees, an **inversion**, or **new**; (c) rest probability by slot class; (d) start-degree distribution of bar 1; (e) span and range per card.
3. **Generate** 600 phrases per (card, h): bar 1 by sampling (start from (d), moves from (a)), bars 2–4 by sampling the operator from (b) (a `repeat`/`sequence`/`inversion` reuses an earlier bar; `new` samples as bar 1), rests from (c), then clamp to `[-2, span]` and force the cadence ends; **rerank** by the mean log-likelihood of the moves under (a) plus a structure score (has a recurring bar or sequence: +; more than 40% rests: −; all-same-note bar: −) and keep 64 with the most distinct (start, contour, operator pattern).
4. A card with fewer than 200 phrases in its corpus falls back to the **grammar** phrases of Task 1 for that card (listed in the report as `source: grammar`).
5. Two outputs: `globe/src/personal/melody-bank.json` = every card from **shippable** sources only (PDMX, Nottingham, grammar) and `globe/src/personal/melody-bank.local.json` (git-ignored) = the same plus the SymbTr-trained makam cards. A field `"sources": { "<card>": ["pdmx", …] }` is stored in both; the shippable file must contain no `symbtr`.

## The selector change

`melody-bank.ts` loads `melody-bank.local.json` when it exists (`import.meta.glob("./melody-bank.local.json", { eager: true })`) and otherwise `melody-bank.json`; `?melody=bank` uses it; a dev-only `?melody=bank-shippable` forces the shippable file. A test fails when `melody-bank.json` has any card whose `sources` includes `symbtr`.

## Evaluation (report appended to `docs/music-melody-model-report.md`)

Per card: corpus size by source; step/leap/repeat/rest shares of the corpus vs the generated bank vs the old walk; KL divergence of the interval distribution (bank vs corpus, walk vs corpus); repetition (distinct bar-motifs per phrase); cadence hit rate; the five most common 4-note patterns in corpus vs bank. Acceptance (script exit code): for every card with a corpus the bank's interval KL is lower than the walk's; cadence hit 100%; no bar ends on a rest.

## Limits (to say to the user)

- SymbTr is classical Ottoman art music (peşrev, şarkı, ilahi): good makam grammar, but not the regional folk (Karadeniz, İç Anadolu, Doğu Anadolu) the user wants for those cards: those use the makam-family mapping above and say so.
- A statistical model reproduces the style of its data at the level of moves and phrase structure; it does not "understand" a piece. The user's ear decides.

## Testing

Python unit tests (`unittest`) for: the SymbTr parser on a fixture of three real rows files, comma → degree mapping, `reduce_bar`, the corpus window rules, determinism of train/generate (fixed seed), cadence ends, bank schema; TS tests: the ship check (no `symbtr` in `melody-bank.json`), the loader picks local over shippable, the earlier bank tests still green.
