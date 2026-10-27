# The melody bank (form grammars)

Spec: `docs/superpowers/specs/2026-10-27-melody-bank-design.md`. The hook melody of the personal site was a seeded random walk
(`globe/src/personal/idiom.ts`, `phraseMotifs`). This folder makes, offline, a bank of four-bar phrases from one **form grammar per
tradition** and exports it to `globe/src/personal/melody-bank.json` (the site's selector reads it; until the user approves by ear the
default stays the walk).

| file | what |
|---|---|
| `idioms.json` | the idiom of every card (`idiomOf` over `DEFAULT_IDIOM`: span, bias, start, cadence, step, repeat, leaps), dumped from TS |
| `grammar.py` | the eight forms, the operators, `generate(card_id, hits, n, seed)`, `bank_entry` (the diverse selection), `FORM_OF` (all 52 cards) |
| `train.py` | the trained model (spec `2026-10-27-melody-trained-design.md`): `clamp_phrase` (into [-2, span]: octave shift, fold, clamp), `reduce_bar` (h slots; padding repeats marked and left out of the move table), `Model` (moves given previous interval / bar role / slot class, bar operators, rests, start degree; smoothing 0.1, back-off card -> cluster -> all), `generate` / `select` (600 per (card, hits); the slot before each cadence weighed by the move into it; rerank by mean log-likelihood + penalties, with the held-bar penalty and the share of recurring phrases calibrated to the corpus's; 64 sampled from the pool, spread over distinct groups), `mix` (70% trained / 30% grammar), `eligible` (>= 400 phrases from >= 40 pieces) |
| `evaluate.py` | the evaluation (spec section "Evaluation"): per card with a corpus, corpus vs bank vs the old walk at hits 6 / 8: step / leap / repeat / rest shares, interval KL (bank vs corpus, walk vs corpus), recurrence (share of phrases with a repeated / sequenced bar, distinct bar-motifs per phrase), cadence hit rate, the five most common 4-note patterns; exit code 1 when an acceptance rule fails; `--write` rewrites the "Evaluation" section of `docs/music-melody-model-report.md` |
| `walk-samples.json` | 200 phrases of the old walk per card at hits 6 and 8, dumped by `globe/scripts/dump-walk-phrases.ts` (input of `evaluate.py`) |
| `test_evaluate.py` | unittest of the measures and acceptance rules of `evaluate.py` |
| `test_train.py` | unittest of `train.py` on toy corpora, plus the schema of both exported banks (no `symbtr` in the shippable one) |
| `export_bank.py` | all 52 cards x hits 1-9 -> minified JSON, version 2 (strings, `.` = rest), field `sources` per card: `melody-bank.json` (shippable: trained on PDMX / Nottingham only, grammar elsewhere) and `melody-bank.local.json` (git-ignored: plus the SymbTr-trained makam cards); `--grammar-only` writes the grammar bank; `--show` prints trained phrases next to the grammar's; `--examples` prints two phrases of every form |
| `test_grammar.py` | unittest: determinism, bounds, cadences, rests, the signature of every form, the bank file |
| `corpus/` | the phrase-corpus ingest (spec `2026-10-27-melody-trained-design.md`): `symbtr.py`, `pdmx.py`, `nottingham.py`, `common.py` (degrees, bars, windows, a stdlib MIDI reader), the mapping tables `makam-cards.json` and `cards-map.json`, `test_corpus.py` (`python3 -m unittest discover -s scripts/music/melody/corpus`) |
| `build_corpus.py` | runs the three ingestors on `.corpora/` (git-excluded, never committed) -> `.corpora/phrases/<card>.jsonl` and the "Corpus" section of `docs/music-melody-model-report.md` |

## Regenerate

```sh
cd globe && npx --yes vite-node scripts/dump-idioms.ts && cd ..   # after changing IDIOMS / cards in TS: rewrites idioms.json
python3 -m unittest discover -s scripts/music/melody            # tests
python3 scripts/music/melody/build_corpus.py                    # .corpora/phrases (needs the downloaded corpora)
python3 scripts/music/melody/export_bank.py --show              # trains (~3 min) and writes melody-bank.json + melody-bank.local.json
cd globe && npx --yes vite-node scripts/dump-walk-phrases.ts && cd ..   # after changing the walk: rewrites walk-samples.json
python3 scripts/music/melody/evaluate.py --write                 # corpus vs bank vs walk; exit 1 when an acceptance rule fails
```

The exporter is deterministic: phrase *i* of (card, hits) draws from `random.Random(seed)` with `seed` = the first 8 bytes of
SHA-256 of `card|hits|i|0` (never Python's salted `hash()`), so the same code gives the same file.

## The forms

Every bar = the motif (or an operator applied to it) + a connecting line (`toward`: even steps, or a scale turn that goes away from
the goal and comes back instead of a held note) to the bar's cadence. Operators: repeat, `seq` (sequence), `invert`, truncate (a head
of the motif), answer (the same head, another ending), `ornament` (a neighbour note before an accent), `add_rests`.

| form | shape | cards |
|---|---|---|
| seyir | bar 1 dwells on the dominant (3-4) with a hovering motif and a breath; bar 2 = the motif a step or two higher, peak above bar 1, then down to its cadence; bar 3 = the motif lowered or inverted, descending, a breath; bar 4 = the motif low, then step by step to the karar (approach by a step) | anatolian icanadolu mevlevi arabic khaleeji maghrebi persian zeybek akdeniz **flamenco** |
| cyclic | a two-note cell turning over (repeated, or sequenced pair by pair, e.g. 4 4 3 3 2 2); bars 1-2 identical up to the cadence, bar 3 a step lower, bar 4 the cell from the start that leads to the cadence; range <= 5; almost no rests | karadeniz dogu karsilama greek caucasus centralasia celtic mariachi slavic |
| period | antecedent: motif with one leap (gap-fill), then its sequence, a breath before the end of bar 2; consequent: the motif again (bar 3 starts like bar 1), bar 4 liquidates (half the motif + a scale run); tango: no rests, the note before an accent repeats it | classical baroque romantic italian russian chanson fado spguitar cinematic calm nordic tango (and any unknown card) |
| raga | bar 1 rises slowly from the low register with held notes; bar 2 climbs to the dominant; bar 3 reaches the high tonic (5..span) and holds it; bar 4 = bar 2 upside down from below the top (aroh answered by avaroh); breaths at the ends of bars 1-3 | hindustani |
| song | AABA: a one-bar hook (a 2-3 note cell repeated or sequenced) twice, a bridge (the hook inverted and lifted, mean higher), the hook again to the cadence; rests on weak slots | bollywood pop dance epic country cumbia samba bossa |
| riff | a one-bar riff of chord tones 0 2 4 with one passing note and syncopating rests (sometimes the middle accent anticipated), bars 1-2 identical up to the cadence, bar 3 a step up, bar 4 a turnaround; jazz approaches every accent from a step below | funk rnb afrobeat jazz **salsa** |
| arch | a short pentatonic-friendly cell (steps of 1, leaps of 2, a fourth at most) placed higher and higher (with breaths between the cells) to the peak in bar 2 or 3, then lower; a bar enters within a fifth of the cadence before it | eastasia chinese thai andean |
| ostinato | one cell in every bar, each repeat changes one slot (a neighbour, a rest added or filled), range <= 4 | gamelan westafrica eastafrica |

Judgements beyond the spec's table: **flamenco -> seyir** (a Phrygian line that falls home to the tonic) and **salsa -> riff** (a
montuno is a repeated syncopated figure). Forms are generic in the cadence: every card's cadence comes from its idiom
(`[2,0,2,4]`, bias -1 `[2,0,2,0]`, bias +1 `[2,2,4,4]`), so a form's "home" note is the cadence of the bar, not always 0.

Fields: `s` = `b[0][0]`; `span` = highest degree used; `bias` = sign(mean of bar 4 - mean of bar 1) with a dead zone of half a degree
(rests ignored). Cards with a direction draw phrases in that direction (the selection keeps those first); bias-0 cards draw rising,
level and falling ones.

## Size: version 2, compact, 64 phrases per entry

A phrase is one string of four bars joined by `|`, a bar = `hits` characters: the base-36 digit of `degree + 2` (`0`..`9`, `a`, `b`) or
`.` for a rest. Start, span and bias are derived by the selector, the cadence by the card's idiom. With 52 cards x 9 hits x 64 the file
is about 667 KB minified (166 KB gzipped); `--per-entry 48` is the fallback if it ever goes over 1 MB. The list of an entry is ordered so
that any prefix is the most diverse choice (round robin over start degree and direction, then over contour). hits = 1 has a single
possible phrase (every bar is just its cadence) and hits = 2 only a handful, so those entries are shorter.
