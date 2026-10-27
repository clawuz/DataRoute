# The melody bank: phrases a musician of the tradition could play (M0 + M2 of the melody model plan)

Date: 2026-10-27. Branch: `feat/ui-v2`. Plan file of the approved decision: `/Users/okilavuz/.claude/plans/refactored-tumbling-rose.md` (offline model → baked bank; PDMX + grammar corpora; all 52 cards; SymbTr never ships).
This spec covers the first listenable step: **the grammar corpora exported as the bank, the selector in the site, the `?melody=` flag, the evaluation report.** PDMX data and the learned model (M1, M3) come after the user has listened.

## Why

`phraseMotifs` (idiom.ts) is a seeded random walk: no motif that comes back, no seyir, no breath. The bank replaces it with phrases made by **form grammars** (one form per tradition) from which many phrases are generated offline and stored in `globe/src/personal/melody-bank.json`.

## The bank format (version 2: compact; replaces the first format)

```json
{ "version": 2, "cards": { "<card id>": { "<hits>": ["5342|4531|5342|2224", "..."] } } }
```
- `<hits>` 1–9 (all nine for every card). A phrase is a string of four bars joined by `|`; each bar has exactly `<hits>` characters: a scale degree `d ∈ [-2, 9]` as the base-36 digit of `d + 2` (`0`…`9`, `a`, `b`) or `.` for a rest.
- The last character of every bar is a digit (never a rest) and equals the card's cadence degree + 2 for that bar. Slot 0 of bar 1 is never a rest.
- Start degree, span, bias and the cadence are derived from the string by the selector; nothing else is stored.
- 64 phrases per (card, hits) (the generator keeps the most distinct by (form, start, contour)); target < 1 MB minified, < 200 KB gzipped; `scripts/music/melody/export_bank.py --per-entry N` sets N (reduce to 48 if over).
- hits = 1 and 2 have few distinct phrases: store what exists.

## The forms (generator in `scripts/music/melody/grammar.py`, deterministic: seed = hash of card id, hits, index)

Each form builds the four bars from a **motif** (a short contour over `hits` slots) and **operators**: `repeat`, `sequence(step)` (the motif a scale step higher/lower), `invert`, `truncate`, `answer` (a different ending), `ornament` (a neighbour note before an accented slot, probability by card), `rest(p)` (some off-slots become `null`, never the first slot of bar 1 and never the last of a bar). Degrees are clamped into `[-2, span]`; the last slot of each bar is forced to the cadence. `dir` (east/west) is not used by the bank (the selector uses it, see below).

| form id | shape | used by |
|---|---|---|
| `seyir` | bar 1 hovers around the dominant (degree 3–4) with a small motif; bar 2 rises (sequence +1/+2) toward the high degrees (4–span); bar 3 descends stepwise (motif inverted/lowered) ; bar 4 resolves to the karar (0) with a stepwise approach. Rests: a breath after the motif in bar 1 and bar 3 (p 0.25 on off-slots). Ornament p 0.2 | anatolian, icanadolu, mevlevi, arabic, khaleeji, maghrebi, persian, zeybek, akdeniz |
| `cyclic` | a two-slot-group cell repeated: bars 1–2 the same cell (repeat), bar 3 the cell lowered by a step, bar 4 the cell with the cadence; almost no rests; repeat-note probability high (0.3); narrow span (≤ 5) | karadeniz, dogu, karsilama, greek, caucasus, centralasia, celtic, mariachi, balkan: slavic |
| `period` | antecedent (bars 1–2: motif, then its sequence, ends on the half cadence degree 2/4) and consequent (bars 3–4: the same motif, ends on the tonic); stepwise with one leap; rests only at the end of bar 2 | classical, baroque, romantic, italian, russian, chanson, fado, spguitar, cinematic, calm, nordic, tango (dotted feel: no rests, repeats on accents) |
| `raga` | bar 1 low (degrees −2…1) slow-rising stepwise, bar 2 up to the dominant (4), bar 3 the high tonic (5–span) with a held note (repeat), bar 4 descent to 0 stepwise; rests at the ends of bars 1–3 (p 0.35) | hindustani |
| `song` | AABA: bars 1, 2 the same 1-bar hook (repeat), bar 3 a contrasting bar (higher, inverse contour), bar 4 the hook ending on the cadence; syncopation: rests on the weak slots (p 0.2) | bollywood, pop, dance, epic, country, cumbia, samba, bossa, kpop-like (none) |
| `riff` | a 1-bar riff built from chord-tone degrees (0, 2, 4) with a passing note, repeated in bars 1–2, answered in bar 3 (a step up), turnaround in bar 4; many rests (p 0.35 on off-slots), syncopated accents | funk, rnb, afrobeat, jazz (jazz adds an approach note a step below the target on every strong slot) |
| `arch` | one arch over four bars: rise in bars 1–2, peak in bar 2–3, fall in 3–4; stepwise, pentatonic-friendly (steps of 1, leaps of 2), rests between motifs (p 0.3) | eastasia, chinese, thai, andean |
| `ostinato` | the same 1-bar cell in all bars, one slot changes per repeat (the cell breathes), tiny span (≤ 4), rests p 0.15 | gamelan, westafrica, eastafrica |

Cards not named above (hip, any card added later) default to `period`. A table in `grammar.py` (`FORM_OF`) lists all 52 card ids explicitly (read the ids from `globe/src/personal/genres.ts` `BASE_CARDS`; a test checks that every card id has a form).

## The selector in the site (`globe/src/personal/melody-bank.ts`)

- `import bank from "./melody-bank.json"` (static; `resolveJsonModule`); `pickPhrase(cardId: string, hits: number, idiom: Idiom, dir: 1 | -1, rnd: () => number, start: number): (number | null)[][] | null` returns null when the card or `hits` has no entry (the caller falls back to the walk).
- Candidate filter in this order, relaxing step by step when empty: (1) `span ≤ idiom.span`; (2) `s` equals `start` (the route's start degree from `idiom.start`, `+2` for a second voice as today) else `s ∈ idiom.start`; (3) for `idiom.bias ≠ 0` the phrase `bias` equals `idiom.bias`, else for `bias 0` with `dir`: prefer `bias === dir` with probability 0.6 (drawn from `rnd`). Choose index `floor(rnd() × n)`.
- Shift by `start − s` only if the whole phrase stays within `[LOW, span]`, else no shift. Force the last entry of each bar to `idiom.cadence[bar]` (same contract as `phraseMotifs`).
- `phraseMotifs(idiom, hits, dir, rnd, startOf, opts?)`: when `opts?.melody === "bank"` and `pickPhrase` returns a phrase, return it; else the existing walk. Types: bars are `(number | null)[]`.

## The site (`compose.ts`, `Experience.tsx`)

- `composePiece(mode, routes, opts?: { tunes?: boolean; melody?: "walk" | "bank" })`; default **`"walk"`** until the user approves by ear (then `"bank"`).
- In the hook branch a `null` degree is a rest: no note, but `hi` still advances (the index keeps stepping through the motif as today). Nothing else changes; the call-and-response inversion (`2 * m[0] - m[hi % m.length]`) skips nulls (a null stays a rest in the answer and the reply uses the nearest earlier non-null degree for `m[0]`).
- `Experience.tsx`: `?melody=bank` (or `walk`) in the URL → `composePiece(…, { melody })` for the main piece; share links do not carry it.

## Evaluation (`scripts/music/melody/evaluate.py`, report `docs/music-melody-model-report.md`)

For the bank and for the walk (dumped by a TS probe `globe/scripts/dump-walk.ts` run with `npx vite-node`; it writes `scripts/music/melody/walk-samples.json`: 200 phrases per (card, hits=6)): per card — share of steps / leaps / repeats / rests, number of distinct bar-motifs per phrase (repetition), contour (first, mid, last bar means), range, cadence hit rate (must be 100%), distinct-phrase ratio. The report is a table (bank vs walk) and a short reading per form. Acceptance (checked by the script, exit code 1 otherwise): cadence hit 100%, no bar ends on a rest, all degrees in range, repetition (distinct bar-motifs per phrase) lower than the walk's for every card, rest share ≤ 0.45.

## Not in this step

PDMX data and the learned model; ornament/rhythm of the notes (durations come from the groove as today); changing the default.

## Testing

- Python: `scripts/music/melody/test_grammar.py` (unittest): determinism; bounds; last of each bar is a number and equals the cadence; no rest on slot 0 of bar 1; each form's signature (seyir: bar 4 ends at the karar and bar 2 max > bar 1 max; raga: bar 3 contains the highest degree; ostinato: bars share ≥ 70% of entries; period: bar 3 starts like bar 1; riff: bars 1 and 2 equal); all 52 card ids have a form; size of the bank file < 400 KB.
- TS (`globe/test/personal-melody-bank.test.ts`): bank schema; every card and every `hits` 1–9 present; every phrase respects the invariants above; `pickPhrase` determinism and constraints (start, span, cadence); `phraseMotifs` with `melody: "bank"` satisfies the properties of `personal-idiom.test.ts` (bounds, cadence ends, determinism); composed pieces with `melody: "bank"` over 100 selections: no NaN/negative, ranges, hook notes exist, rests produce no note; `melody` default is `walk` (a golden-free check: composePiece without option equals composePiece with `"walk"`).
- The goldens do not change in this step (the default stays `walk`).
