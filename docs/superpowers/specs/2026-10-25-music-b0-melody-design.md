# Music B0: an original melody from the route, in the idiom of the region

Date: 2026-10-25. Branch: `feat/ui-v2`. Builds on phases A and B1 (built; the user has not listened yet).

## Why

Today about half of the pieces play a public-domain tune (`melodies.ts`: Ode to Joy, Greensleeves, Üsküdar …) as "a relative of the tune: the same
shape, a few passing notes moved". The user's ear, and a musician's, would say the same: **a tune that is almost the known one is worse than either
the real tune or none**: the ear keeps looking for the original and hears errors. In the other half of the pieces the hook is a random walk on the
scale with a small lift from the flight's altitude. And on makam cards (Anatolian, Karşılama, Arabic, Persian … with micro-tonal scales) no known tune
can play at all.

Decision (the user's, 2026-10-25): **no more "relative tunes" by default; every hook is an original melody made of the route, in the idiom of the
region** (options A + C of the proposal). Exact quotations of a known tune can come back later as a separate, honest feature.

## What changes

1. **The tunes are off by default.** `composePiece(mode, routes, opts?: { tunes?: boolean })`; `opts.tunes` defaults to `false`. The tune code
   stays (and stays tested with `{ tunes: true }`) for a later "exact quotation" feature. Share links and the site call it without options: no
   piece plays a tune any more.
2. **The hook's motif comes from an idiom, not from a uniform random walk.** A new pure module `idiom.ts` holds, per genre card, a small set of
   numbers that describe how a melody of that tradition moves, and functions (`walkMotif`, `phraseMotifs`) that build the four one-bar motifs (A, B, A, B′) of a
   hook route from them. The motifs are still deterministic (the same seeded generator as today); each bar ends on a cadence degree of the idiom (default
   `2, 0, 2, 4`; see the cadence plan below).
3. **The flight is the large-scale contour.** Today the altitude of the flight lifts the melody by 0-3 scale degrees. The same rule stays but its
   size is the card's `arc` (1-4 degrees, `round(altitude / 39000 × arc)`): a climb rises, the cruise plateaus, a descent falls, and the motif (small scale) rides on that arc.

### The idiom of a card (hand-set, to be tuned by ear)

There is no melodic-interval statistics corpus in the project (the reference stats hold scales and rhythms only). The numbers below are **musical
judgement of the known character of each tradition**, written down as a table so that they can be tuned by listening; they are not measurements and
the docs say so.

| Field | Meaning | Range |
|---|---|---|
| `step` | share of moves that are a scale step (the rest are leaps) | 0.3-0.9 |
| `repeat` | share of moves that repeat the note | 0-0.4 |
| `leaps` | sizes (in scale degrees) a leap may have | e.g. [2], [2,3], [2,4] |
| `bias` | −1 descending seyir (Anatolian, Arabic, Persian, flamenco), 0 arch, +1 ascending (alap-like, Hindustani) | −1, 0, 1 |
| `span` | the highest scale degree the motif may reach (the lowest is −2) | 4-7 |
| `arc` | how many degrees the flight's altitude lifts the line | 1-5 |
| `start` | degrees a motif may start on (the dominant for makams) | list |
| `cadence` | the end degrees of bars A, B, A, B′. Default `[2, 0, 2, 4]`; when the table gives none it comes from the bias: −1 → `[2, 0, 2, 0]` (the line comes home on the karar), +1 → `[2, 2, 4, 4]` (it ends high); an explicit entry wins | four degrees |

The walk's direction at every move: `drift = 0.6 × bias + 0.15 × dir` when `bias ≠ 0`, and `drift = 0.4 × dir` when the bias is 0 (`dir` = direction of the
route, east +1, west −1); the line goes up with probability `clamp(0.5 + drift / 2, 0.1, 0.9)`. So the tradition wins over the heading of the flight where it
has a direction (the first version, `0.4 × dir + 0.4 × bias`, let an opposite heading cancel the bias), and the heading decides where it has none.

**Approach to the cadence.** In a bar of 4 hits or more, the move that produces the second-to-last degree goes toward the cadence degree by
`min(2, |gap| − 1)` degrees (it stops one step short; if that is 0 or less it stays), so the last note is not a doubled one. A bar with fewer hits has no such move.

**The return.** Bar 3 repeats bar 1 exactly only when `cadence[0] === cadence[2]` (the default and the descending plans). With the ascending plan
`[2, 2, 4, 4]` the four bars are independent walks. In the verse the hook plays the first two bars of each four-bar block, in the chorus all four.

The numbers of the table are hand-set judgements, to be tuned by ear (see `idiom.ts`).

## Data → music (rows added to `docs/music-data-mapping.md`)

| Data | Decision | Why it is heard that way |
|---|---|---|
| altitude along the flight | the large contour of the hook (rises on take-off, plateaus in the cruise, falls on landing), size = the card's `arc` | the melody is the flight |
| east / west direction of the route | which way the motif tends to walk | travelling east rises |
| destination region (the card of the hook route) | the idiom: stepwise or leaping, repeating, seyir direction, range, start degree | the melody sounds like where it goes |

## Not in this step

Exact quotation of a tune; statistics-derived idioms (needs the corpora downloaded again); makam seyir rules beyond direction, start and range;
the camera and the corridor of short routes on the globe (a visual change, to be tried by eye).

## Testing

- `idiom.ts` pure unit tests: determinism; every degree inside `[−2, span]`; the motifs end on the cadence degrees; the share of steps, repeats and
  leaps follows the idiom over many samples; the direction follows `drift` (descending bias goes down more often than up).
- `composePiece`: no piece has `style.tune` without `{ tunes: true }`; with `{ tunes: true }` the tune branch still works (the existing tune tests
  move to the option); notes of every route that is NOT a hook route are unchanged against the code before this step (a hash of those notes,
  checked once from the base code); only the hook routes' notes change.
- Over a few hundred selections: no NaN/negative times, every note in its instrument's range, the hook of a descending-bias card ends lower than it
  starts more often than an ascending-bias card's.
- The golden hashes of phase B1 (pieces without colours, bars outside the verse) change legitimately because the hook changed: they are re-captured
  after the invariant above is shown, and a comment says so.

## Risks

- Hand-set idioms may sound alike or wrong: the user listens, the table is the one place to tune.
- A flat plateau in the cruise (the arc is constant for 64% of the flight) makes a static line: the motif's moves ride on it, `repeat` is capped at
  0.4 so the line does not stall.
- Removing the tunes makes every piece "new": nothing is recognisable. That is the intent.
