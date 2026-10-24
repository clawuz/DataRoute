# Music phase A: home drone, key lift, human timing, space from the map

Date: 2026-10-24. Branch: `feat/ui-v2`. Builds on `2026-10-24-world-instruments-design.md` (done, live).

## Goal

The piece is made of notes that all come from routes. This phase makes it sound more like music played by people, **without adding a
single note that is not a route**: each change is a rule that turns route data into a musical decision. Four changes:

1. **Home drone** — the starting country's tonic hums under the whole trip ("home").
2. **Key lift** — when the trip crosses more than one region, the last part of the chorus lifts to a brighter key; the next section returns home.
3. **Human timing** — tiny deterministic timing and loudness differences, looser when the trip crosses more time zones.
4. **Space from the map** — stereo position from the route's longitude, reverb from its length.

Out of scope (later phases): call-and-response between voices, voice leading and cadences, MIDI/score export, per-route flight
frequency (not available on this site), world-voice gaps for bass and drums.

## Data → music mapping (the rule of this phase and of every later one)

Every mapping must be (1) from data the site has, (2) deterministic, (3) perceptually obvious in the direction ("more of X sounds like
more of Y"), (4) listed in `docs/music-data-mapping.md` with the reason. Data available per route: both end points (lat, lon), distance,
region of the far end, the altitude profile along the flight, trip/leg index, and the selection (mode, home, places).

| Data | Musical decision | Why it is heard that way | Status |
|---|---|---|---|
| route distance | role (pad/bass/hook/pluck/drums), phrase length | longer line = longer, lower, slower voice | exists |
| altitude along the flight | pitch of the line | climb rises, descent falls | exists |
| east/west direction | direction of the melody's walk | travelling east rises | exists |
| destination region | instrument, rhythm figure, melody scale | where you go sounds like there | exists |
| share of routes per region | how many routes take that region's colour | busy regions weigh more | exists |
| starting country | tempo, scale, progression, **home drone** | home sets the key of the story | drone: **new** |
| mode (been / want to go) | minor or major; **type of key lift** | wistful vs hopeful | lift: **new** |
| regions crossed | **whether there is a key lift** | a trip that stays in one region has no "journey" | **new** |
| longitude of the route's midpoint, relative to home | **stereo position** | east is right, west is left, like the map | **new** |
| route distance | **reverb amount** | far = distant = more room | **new** |
| time zones spanned by the trip | **how loose the timing is** (jet lag) | the further, the more it drifts | **new** |
| latitude | (not used in phase A: no clear, safe musical dimension) | | later |

## 1. Home drone

- A held tonic (and the fifth above it) of the **main card's key** — the home — sounds from the intro to the end, in the quiet of the
  mix. It is played by the **first route of the trip** (route index 0: the home leg), so every note still belongs to a route; the notes
  are `show: false` (they sound, the music box does not draw them again).
- Instrument by the main card (a table in `world-voices.ts`, default `CELLO`): `hindustani` → `TANPURA`; `celtic`, `karsilama` →
  `BAGPIPE_DRONE`; `anatolian`, `arabic`, `persian`, `centralasia` → `CELLO` (held, low); `baroque` → `RENORGAN`; others → `CELLO`.
  Plucked tanpura is re-struck every two bars; held instruments are re-struck every four bars (a note of the chord progression's length).
- Level: 0.22 × the section level; absent in the `break`; during the key lift it is silent (it is "home", the piece is away) and it returns
  in the outro. Pitch: two octaves below the bass line's tonic, inside the instrument's range (`fit`).
- With one route there is no piece-level drone (the solo piece stays as it is).

## 2. Key lift

- Condition: the routes of the piece belong to **two or more regions** (`route.region`, counting the main card's region) — the
  trip really crosses regions. Otherwise no lift.
- What: the **last 8 bars of the chorus** are transposed: `visited` (minor) → **+3 semitones** (the relative major: arrival),
  `wish` (major) → **+2** (a whole step up: hope). The `break` and the `outro` return to the home key.
- Implementation: a per-bar `lift(bar)` added to `st.shift` wherever pitches are computed in the bar loop (chords, bass, hook, pluck,
  tune); the drone ignores it (it is silent then). The public-domain tunes of `melodies.ts` are transposed with the rest.
- Notes outside an instrument's range are folded by `fit`/`limitsOf` as before.

## 3. Human timing

- Every note (except the drone, and the kick/backbeat hits, which get 30% of the amount) gets a deterministic offset in time and a
  small change of loudness, from `routeHash(route key + note index)`.
- Amount: timing `±(5 + 13 × looseness) ms`, loudness `×(1 ± 0.06)`. `looseness = clamp(timeZonesSpanned / 10, 0, 1)` where
  `timeZonesSpanned = (max longitude − min longitude over all route end points, wrapped) / 15`.
- Never breaks the existing invariants: the offset is clamped to 20% of the gap to the neighbouring notes of the same route, so notes of a
  route keep their order and `drawDur` (never into the next note) still holds; no note starts before 0 or ends after the piece.
- Pad chords struck together keep their small "roll" (already in the code); the offset is applied per chord, not per tone.

## 4. Space from the map

- `PersonalNote` gets `pan` (−1…1) and `wet` (0…1), computed in `compose.ts`' `push` from the route and the role.
- `pan = clamp(wrap(midLon − homeLon) / 100, −0.8, 0.8) × roleWidth`; `roleWidth`: bass and kick 0.15, backbeat and hat 0.5, pad 0.6,
  hook 0.85, pluck 1. (`wrap` brings a longitude difference into −180…180.) Home = the first route's `from`.
- `wet = (0.12 + 0.38 × clamp(distKm / 9000, 0, 1)) × roleWet`; `roleWet`: bass and kick 0.4, others 1.
- Player: `playNote(..., { pan: n.pan })` (the option already exists and is 0 today) and three reverb sends (dry-heavy, medium, wet-heavy
  buses feeding the existing convolver at different levels); a note goes to the nearest send by `wet`. The recorded clip taps after the
  compressor as before.

## Data and docs

- `docs/music-data-mapping.md` (new): the table above, with one line of reasoning per row and the formulas, kept in step with the code.
- `docs/music-genre-cards.md`: the drone table.

## Testing and verification

- Vitest, all deterministic: the drone exists in a multi-route piece, belongs to route 0, is `show: false`, is silent during the lift and
  the break and present in the outro; no lift when all routes are in one region, a lift of +3 / +2 in the right bars otherwise, and the
  break/outro are back at the home key; timing offsets keep per-route order, stay inside the stated bounds and are larger for a trip
  across more time zones; `pan` is negative for a westward route from IST and positive for an eastward one, bass nearer the centre than
  pluck; `wet` grows with distance; the same selection composes the same piece twice.
- The existing composer tests stay green; any test that counted notes or compared exact timing is adjusted only if it checks something
  these rules legitimately change, and the change is reported.
- Listening is the user's: a fixed list of 8 reference selections (one region, three regions, a long list, a Gulf start, a Far-East start,
  mode visited and wish) is composed before and after and the notes of each are summarised in the report (drone present, lift bars, pan
  and wet ranges). There is no browser check available in the automated session.
- No deploy: deploying is only `firebase deploy --only hosting:main` on the user's word; push of the branch also on the user's word.

## Risks

- Existing share links sound different (intended, as after the world-instruments change).
- The key lift can put a recording outside its range: `limitsOf` folds by octaves; the tests check no note leaves the range of its instrument.
- Timing jitter on top of the sampler's own latency is inaudible; on very short notes the clamp keeps the order.
- A drone under pieces already full of pads can crowd the low end: its level is low and the bass keeps `roleWidth` 0.15 near the centre.
