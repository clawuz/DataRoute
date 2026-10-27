# Altitude feel: the music opens up as the plane climbs

Date: 2026-10-27. Branch: `feat/ui-v2`. The user: "the loudness of every note rising with the altitude would relax us? is it that way now?" — then agreed to the proposal below ("önerin iyi").

## Today

The altitude of the flight sets the pitch of the hook (scale degrees), the octave of the pluck, and the height of the note in the music box. The loudness of a note comes from its role and the section (intro 0.45 … chorus 1 … outro 0.78), not from the altitude. The sampled voices have a fixed filter; `cutoffScale` exists only for the synth fallback.

## The rule (a data → music mapping, listed in `docs/music-data-mapping.md`)

`h = altitude(note) / cruise(route)` (0 on the ground, 1 at cruise; `altitudeFt` and `cruiseFt` of `flight.ts`; the note's own `alt` is the altitude, the cruise is `cruiseFt(route.distKm)`).

| What | Rule | Why it is heard that way |
|---|---|---|
| **loudness** | `vel × (0.88 + 0.24 × h)`: −12% on the ground, +12% at cruise (then the existing clamp) | take-off swells, cruise is full, landing settles: the breath of the flight |
| **brightness** | a per-note low-pass on the drawn (not hidden) sampled notes: cutoff `1400 + 7600 × h^1.2` Hz, Q 0.6 | close to the ground the sound is warm and near, up high it is open and airy |
| **room** | the note's reverb `wet + 0.10 × (h − 0.5)` (clamped to 0…0.5), so it picks its send with `sendOf` | high up it is wider; the ground is close |

All three are small on purpose; they sit under the section levels (the section curve stays the big shape). Constants live in one place (`altitude-feel.ts`) so that they can be tuned by ear.

## Code

- `globe/src/personal/altitude-feel.ts` (pure): `heightOf(alt, distKm): number` (0..1), `velScale(h)`, `cutoffOf(h)`, `wetShift(h)`.
- `compose.ts` `push`: vel scaled by `velScale(h)`, wet shifted; `PersonalNote.bright?: number` (the cutoff in Hz) set on drawn notes. Hidden gesture notes copy `wet` from their source (and no `bright`: they are short; they use the sampler's own filter).
- `player.ts` → `playNote` → `sampler.play`: an optional `cutoffHz` parameter: when present and the instrument is sampled, a `BiquadFilterNode` (lowpass, Q 0.6) is inserted before the gain, `frequency` = the cutoff (follow how the instrument's own `filter` is created; if the instrument already has a filter, use the lower cutoff of the two, or chain the new one after it: keep the cheaper). No change for notes without it. Node budget: the filter is created only for notes with `bright`; measure the extra nodes (the review's estimate: voices ringing ≈ 42 median) and report.
- Not for percussion roles (`kick`, `backbeat`, `hat`) and not for the drone (they keep `vel` and no filter).

## Not in this step

Altitude → tempo or key; per-route filters with automation.

## Testing

- `altitude-feel.ts` unit tests: `heightOf(0) = 0`, `heightOf(cruise) = 1`, monotone; the three mappings at 0, 0.5, 1; clamps.
- Composed pieces: for a 3-route piece the mean `vel` of the drawn notes of a route in the climb (alt < 30% of cruise) is lower than in the cruise for the same role (compare same instrument and role); `bright` present only on drawn non-percussion non-drone notes; `wet` within 0…0.5; determinism; no NaN.
- Sampler: a note with `cutoffHz` creates a lowpass with that frequency; without it nothing changes (the existing tests).
- Goldens re-captured (reason in the comment).
