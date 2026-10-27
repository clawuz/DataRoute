# Gestures: instruments are played the way they are played (slice 1)

Date: 2026-10-27. Branch: `feat/ui-v2`. From `docs/music-instrument-idioms.md` (research and plan, section 3 A, "first slice").

## Why

Every instrument gets "one note on a slot". A kemençe, a saz, a kanun, a nylon guitar and an upright bass should each do what they do in their tradition.
This slice adds an **articulation layer**: after the notes are made and humanized, an instrument's notes are turned into gestures (extra quiet notes, spread chords,
tremolo, grace notes, a glide, walking lines). Extra notes sound but are not drawn (`show: false`); the note that was there stays the drawn one.

## The gestures (slice 1; every number is a hand-set judgement to tune by ear)

`applyGestures(notes, ctx)`: pure, deterministic (a hash of `note.key`, `note.t`, the instrument), returns a new array (the input notes are kept in it, possibly changed:
shortened or replaced by their own first hit; added notes are marked `show: false`, `route`/`via`/`key`/`alt`/`pan`/`wet` copied from the source note).

`ctx`: `{ bar: number (seconds), beat: number (seconds), cardOf(route: number): string (the card id of the note's route), roleOf(note): string, chordAt(bar: number): { root: number; third: 3 | 4 } (semitones above the key root; the key root is `KEY_ROOT` in compose), keyRoot: number, hz(semis): number }`. The module imports nothing from `compose.ts`.

| Instrument (any role unless said) | Gesture |
|---|---|
| `KEMENCE_MAKAM` (hook/melody notes with `d ≥ 0.2`) | **doubleStop**: a second note a perfect fourth below (−5 semitones), `vel × 0.5`, same `t` and `d`, hidden. **graceIn**: on every note that starts on a beat (`t` within 20 ms of a multiple of `beat`) a grace note a whole tone above (+2), 55 ms before the beat, `d` 0.05 s, `vel × 0.45`, hidden; and the main note starts on its beat as before. **drone**: on the first note of every bar, a held open-string note two octaves... (the tonic: `keyRoot` as frequency, −12 st) lasting to the end of the bar, `vel × 0.3`, hidden. |
| `SAZ`, `BAGLAMA_MAKAM`, `BAGLAMA_EXTRA` (any role) | **strum** on strong beats (the note's `vel ≥ 0.5` and its `t` within 20 ms of a beat): two notes below it (−7 and −12 semitones) at +12 ms and +24 ms, `d` 0.14 s, `vel × 0.4`, hidden (the şelpe). **glideNote**: a hook note with `d ≥ 0.3` starts a semitone low (`glide: 1`) when `hash % 3 === 0`. |
| `KANUN`, `SANTUR` (hook/melody notes with `d ≥ 0.45`) | **tremolo**: the note is repeated every 0.075 s over its length (at most 14 hits), hits after the first are hidden, `vel × 0.55` each, the first hit keeps its `vel` and its drawn state and its `d` becomes 0.075 s... (the drawn note keeps its original `d` for the ribbon: set `drawDur` is computed later from `d`, so keep the first note's `d` and let the tremolo hits be separate hidden notes); **octave**: the first hit also gets a hidden note an octave above, `vel × 0.4`. |
| `NYLONGUITAR` (pluck role) | **strum**: on every note that starts on a beat, two more chord notes (the chord from `chordAt`: root+third+fifth of the same octave as the note: pick the two chord tones nearest above the note) strum up/down: spread by card: `flamenco` 55 ms (five notes: add the octave), `spguitar`, `bossa`, `samba` 18 ms, any other card 25 ms; the note itself stays first; `vel × 0.6`, hidden. Down-strokes on beats 0 and 2 of the bar, up-strokes (reversed order) on 1 and 3. |
| `UPRIGHTBASS` (bass role) | **walk** when the card of its route is `jazz`: per bar four quarter notes: root, the fifth above, the third (from `chordAt`), and an approach note a semitone below the next bar's root; the bar's first bass note is the drawn note, the other three are hidden (`vel × 0.8`). **alternate** when the card is `country`, `bossa`, `samba`, `salsa` or `tango`: the second bass note of a bar sounds the fifth (−5 st from the root, one octave down if it would pass the root) instead of the root. |
| `TANPURA` (drone role, `show: false`) | **cycle**: the drone note is replaced by strokes every beat over its length: Pa (+7 st), Sa an octave up (+12), Sa an octave up (+12), Sa low (0), each `vel × 0.7` of the original, `d` 1.6 beats. |
| `NEY_MAKAM` (hook/melody notes with `d ≥ 0.35`) | **glideNote** as for the saz (`hash % 2 === 0`), and the note starts 2 semitones low (`glide: 2`) on phrase starts (the first note after a gap of ≥ 0.4 s in its route). |

`PersonalNote` gains `glide?: number` (semitones below the target the note starts, rising to the target in 0.08 s). The player passes it on; the sampler applies it as a per-note `detune` ramp (the existing per-instrument `glide` of `SampleInstrument` keeps working: the per-note value is added when both exist).

## Wiring (`compose.ts`)

- `applyGestures` runs **after** `humanize` (so the spacing of a strum is not disturbed) and before the `drawDur` computation.
- The `drawDur` loop (`byRoute`) must skip notes with `show === false` (as the drone is skipped) so that hidden grace notes do not shorten the drawn notes.
- Every added note gets `roleOfNote` of its source (or the role "gesture").
- `PersonalPiece.notes` grows. The player passes `glide` and `short` on; `clipNotes` carries a hidden note across the clip's start only while more than 0.2 s of it is left (the home drone and the kemençe drone, the tanpura strokes), so that the tail of a tremolo or a strum is not carried into the clip.
- Gestures never move a note earlier than 0 s (clamp), and never add a note after `END_T + 1.5 s`.

## Not in this slice

Form templates (drone instead of chords, AABA, 12-bar, taksim/alap intros); gestures for the jazz piano/guitar comping, fiddle, tabla, gamelan, mbira, accordion, strings trills; real microtonal pitch per note.

## Testing

- `gestures.ts` unit tests, one per gesture, with synthetic notes: counts, times, hidden flags, velocities, determinism, no note before 0, the source notes unchanged except the documented ones; an instrument without a gesture is returned untouched (same objects).
- Player/sampler: a note with `glide` ramps the detune (a fake AudioContext as in the existing sampler tests); a note without it is unchanged.
- Composed pieces over 300 selections: no NaN/negative, ranges respected (`fit`), `drawDur` bounds, notes of a route in order, no hidden note is drawn (`show === false` ones are skipped by `Experience`), counts of notes stay below a bound (≤ 6000 per piece), determinism.
- Goldens re-captured (reason in the comment).
