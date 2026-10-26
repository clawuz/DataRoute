# Route data → music: the mapping

The personal piece (`globe/src/personal/compose.ts`) is made only of notes that come from routes. Every musical decision is a rule
that turns data the site has into sound. This page lists each rule and the reason it is heard that way. It is kept in step with the
code: when a rule changes in the code, change it here.

## The rule

A mapping is allowed only if it is:

1. **from data the site has**: per route both end points (lat, lon), distance, region of the far end, the altitude profile along the
   flight, trip/leg index; per selection the mode (visited / wish), the home and the places;
2. **deterministic**: the same selection composes the same piece (no `Math.random`, no clock; variation comes from `routeHash`);
3. **obvious in the direction**: more of X sounds like more of Y, so a listener can learn the map by ear;
4. **listed here**, with the reason.

Existing share links sound different after the music phase A series (pan, humanize, drone, lift): a link stores the selection, not the notes.

## The table

| Data | Musical decision | Why it is heard that way | Where |
|---|---|---|---|
| route distance | role (pad / bass / hook / pluck / drums), phrase length | a longer line is a longer, lower, slower voice | `compose.ts` |
| altitude along the flight | pitch of the line | a climb rises, a descent falls | `compose.ts`, `flight.ts` |
| east / west direction | direction of the melody's walk | travelling east rises | `compose.ts` |
| altitude along the flight | the large contour of the hook: it rises on take-off, plateaus in the cruise, falls on landing; the size is `round(altitude / 39000 × arc)` scale degrees, `arc` being the card's | the melody is the flight | `compose.ts`, `idiom.ts` |
| east / west direction of the hook route | which way the motif's walk tends to go (a weaker pull than the tradition's own direction) | travelling east rises | `compose.ts`, `idiom.ts` |
| destination region (the card of the hook route) | the idiom: stepwise or leaping, how much it repeats, the direction of the line (seyir), range, start degrees, the degrees the bars end on | the melody sounds like where it goes | `idiom.ts`, `genres.ts` |
| destination region | instrument, rhythm figure, melody scale | where you go sounds like there | `genres.ts`, `world-voices.ts` |
| share of routes per region | how many routes take that region's colour | busy regions weigh more | `compose.ts` |
| main card of the piece (usually a card of the starting country; sometimes a lively generic one when the trip has many routes) | tempo, scale, progression, **home drone** | home sets the key of the story | `genres.ts`, `world-voices.ts` |
| mode (been / want to go) | minor or major; **size of the key lift** | wistful vs hopeful | `compose.ts`, `lift.ts` |
| regions crossed | **whether there is a key lift** | a trip inside one region has no journey | `lift.ts` |
| longitude of a route's middle, relative to the start of the first route (the home airport when the trip starts at home) | **stereo position** | east is right, west is left, like the map (when the first route starts at home) | `space.ts` |
| route distance | **reverb amount** | far = distant = more room | `space.ts` |
| time zones spanned by the trip | **how loose the timing is** (jet lag) | the further, the more it drifts | `humanize.ts` |
| number of routes per destination region (card) | **which regions get an episode** (the three with the most routes) and their order | the places you went most are told first | `episodes.ts`, `compose.ts` |
| region (card) of a route | **the rhythm figure of its episode block and the spotlight** (×1.15 for its voices, ×0.85 for the others) | where you go sounds like there, and has its moment | `episodes.ts`, `compose.ts` |

### Formulas and constants

A piece of one route (`composeSolo`) gets none of the following: no pan, wet, lift, drone or humanize.

**Space** (`space.ts`; each note of the piece carries `pan` and `wet`)

- `wrap180(d)` brings a longitude difference into −180…180. `midLon(route)` is the longitude of the middle of the route, going the short way round.
- The reference longitude (`homeLon`) = `fromLon` of the first route, the start of the first route. It is the home airport when the trip starts at home; the code does not check that.
- `pan = clamp(wrap180(midLon − homeLon) / 100, −0.8, 0.8) × width(role)`, so a route 80° or more east of that longitude is fully right (×width), 80° or more west fully left ("home" in `homeLon` is the start of the first route).
  `width`: bass 0.15, kick 0.15, backbeat 0.5, hat 0.5, pad 0.6, hook 0.85, pluck 1.
- `wet = (0.12 + 0.38 × clamp(distKm / 9000, 0, 1)) × wetOfRole(role)`: 0.12 for a very short route, 0.5 from 9000 km. `wetOfRole`: bass and kick 0.4, every other role 1.
- Player: a note goes to one of three reverb sends by its `wet`: below 0.25 the first (dry-ish), below 0.4 the middle one, otherwise the wet one (`sendOf`).

**Looseness** (`humanize.ts`)

- `timeZonesSpanned` = the span of the longitudes of all route end points, going the short way round the Earth (360° minus the biggest empty gap), divided by 15.
- `looseness = clamp(timeZonesSpanned / 10, 0, 1)`: ten time zones or more is the loosest.
- Time offset of a moment: up to `±(5 + 13 × looseness)` ms (5 ms tight, 18 ms loosest); loudness `× (1 ± 0.06)`, clamped to 0.05…1.
  Both come from `routeHash` of the route and the moment, so they are the same on every run.
- Kick, backbeat and hat get 30% of the time offset. The drone is not touched.
- Notes of one route that start at the same moment (a chord) move together. An offset never passes 20% of the gap to the neighbouring moments of the same route, and never moves a note before 0, so a route's notes keep their order. Different routes drift independently.

**Key lift** (`lift.ts`)

- There is a lift when the routes belong to two or more different `region` values; the regions counted are those of the routes (`new Set(routes.map(r => r.region)).size >= 2`).
- Size: up a minor third (**+3**) for a `visited` trip: the same mood, higher; up a whole step (**+2**) for a `wish`. The chords keep their thirds and the scales stay the same, so a minor piece stays minor. It is also written to `style.lift` (0 = none).
- Bars: the **last 8 bars of the chorus**. The form is 64 bars (intro 8, verse 16, build 8, chorus 20, break 4, outro 8), so the chorus is bars 32–51 and the lift is **bars 44–51** (0-based). The break (52–55) and the outro (56–63) are back in the home key.
- It is added to the key shift of those bars wherever pitches are computed (chords, bass, hook, pluck, and the public-domain tune when tunes are switched on, see "The hook's melody"). A note of the tune takes the lift of the bar it sounds in, so a tune that started before bar 44 is lifted from bar 44 on, and one that runs into the break is home again there.
- A possible later change: a real switch to the relative major would need the major scale and major thirds for the lifted bars.

**Home drone** (`world-voices.ts`, `compose.ts`)

- Instrument from the main card of the piece (usually a card of the starting country; with about 10% probability for fewer than 6 routes, 20% from 6 routes and 40% from 10 routes it is a lively generic card instead, `takeGeneric` in `planCards`): `hindustani` → `TANPURA`; `celtic`, `karsilama` → `BAGPIPE_DRONE`; `baroque` → `RENORGAN`; every other card → `CELLO` (`DRONE_BY_CARD`, `droneVoice`). The family is resolved by `routeHash` of the first route like any other voice.
- Notes: the tonic and the fifth above it (+7 semitones) of the home key, one octave below the key root, folded into the range of the instrument (`fit`). The key is the piece's own, **not** the lifted one.
- Re-struck every 2 bars for the plucked tanpura, every 4 bars for the other instruments; a note ends before the next silent bar.
- Level: tonic `0.22`, fifth `0.15`, times the section level and the outro fade.
- Silent in the break (bars 52–55). Additionally silent in the lifted bars 44–51 when the trip crosses regions (lift ≠ 0), so then it plays in bars 0–43 and 56–63. With no lift (a one-region trip, which includes any all-Turkey trip) it plays through bar 51 and again in the outro.
- Played by the **first route** (route 0, the home leg): `route: 0`, `show: false` (it sounds, the music box does not draw it). A piece of one route (the solo piece) has no drone.
- `pan` 0 and `wet` 0.3 (the middle send); no timing drift.

**Region episodes** (`episodes.ts`, `compose.ts`)

- The verse (bars 8-23) is four blocks of four bars. `A` is home (the main card); `B`, `C`, `D` are the first, second and third episode card.
  Episode cards are the cards of the coloured routes (a route is coloured when its card is not the main card), the card with the most routes first,
  ties by `routeHash` of the card id, at most three (`episodeCards`). A coloured route can be in the same country as home: a country has several cards.
  The cards are written to `style.episodes` (only when there are any: a piece without episodes has no `episodes` in its style).

| episode cards | bars 8-11 | 12-15 | 16-19 | 20-23 |
|---|---|---|---|---|
| none (every route plays the main card) | A | A | A | A |
| 1 | A | B | A | B |
| 2 | A | B | A | C |
| 3 | A | B | C | D |

- Beats are counted from 0: beat 0 is the first beat of the bar, beat 3 the fourth, 3.5 the last half beat.
- Inside an episode block the figure of the episode card (stretched to four beats, same tempo) drives: the **bass** (its strong beats), the **hook's rhythm**
  (hit places; the hook's notes still snap to the chord on strong places), the **pluck's swing**, the **kick** (beat 0, the first beat, always, and the exact strong beats of the figure, on the bass) and the **hat**
  (its hit places instead of straight eighths, swung on the odd slots of the figure exactly like the hook: a rest counts as a slot). The **backbeat** stays on beats 1 and 3 (the second and fourth beat, as in the other sections) and the chords and progression stay the main card's. In the home blocks of the verse everything is as before.
- **Spotlight:** in an episode block the voices of routes whose card is the episode card play at ×1.15, the others at ×0.85. The hook's public-domain tune (only with `{ tunes: true }`) works the
  spotlight out per note from the bar the note sounds in (an 8-bar tune that starts at bar 8 is spotlit by the block of each bar); the other voices by the bar they start in.
- A hook that plays a public-domain tune (only with `{ tunes: true }`) keeps the tune's rhythm; only the spotlight applies to it. The drone is not spotlit.
- **Bridge fill:** on the last bar of every four-bar block of the verse (bars 11, 15, 19, 23) the kick adds a hit on beat 3 (the fourth beat; if it is not already there) and the backbeat a hit on the
  last half beat (3.5). They exist only in a piece that has episodes, and only where those drum roles exist: the kick fill from five routes, the backbeat fill from six.
- A piece where every route plays the main card has no episodes and its verse is unchanged (no fills either), and every bar outside the verse is unchanged.

## The hook's melody

Every hook is an original melody made of the route; no piece plays a known tune any more (the "relatives of public-domain tunes" are
**off by default**: `composePiece(mode, routes, { tunes: true })` plays them, nothing on the site passes it; the code and its tests are
kept for a possible later exact quotation). The hook of a hook route is built in `idiom.ts` from the idiom of the route's own card
(a coloured route uses the card of its destination).

- **Large contour from the flight.** Each note is lifted by `round(altitude / 39000 × arc)` scale degrees, where the altitude is that of the
  flight at the note (a climb rises, the cruise plateaus, a descent falls) and `arc` (1-4 degrees) is the card's.
- **Small motif from the idiom.** A card's idiom is a few numbers: `step` (share of moves that are one scale step), `repeat` (share that
  repeat the note), `leaps` (sizes of the other moves), `bias` (−1 descending seyir, 0 arch, +1 ascending), `span` (highest degree; the
  lowest is −2), `arc`, `start` (degrees a bar may start on) and `cadence`. The table is in `music-genre-cards.md`.
- **The walk** (`walkMotif`) runs once per bar, seeded by the route (deterministic). Every move goes up with probability
  `clamp(0.5 + drift / 2, 0.1, 0.9)`, where `drift = 0.6 × bias + 0.15 × dir` when the card has a bias (the tradition wins over the
  heading of the route) and `drift = 0.4 × dir` when it has none; `dir` is +1 for a route that flies east, −1 west.
- **Cadence.** A phrase is four bars (A, B, A, B′); each bar ends on its cadence degree. Default `2, 0, 2, 4`; when a card gives none it comes
  from the bias: descending `2, 0, 2, 0` (the line comes home on the karar), ascending `2, 2, 4, 4` (it ends high). From 4 hits in a
  bar on, the move into the second-to-last note goes toward the cadence degree by up to 2 degrees and stops one step short of it, so the last
  note is not a doubled one; a bar with fewer hits has no such move.
- **The return.** Bar 3 repeats bar 1 exactly only when their cadence degrees are the same (`cadence[0] === cadence[2]`: true for the
  default and the descending plans, not for the ascending one, whose four bars are independent walks).
- In the verse the hook answers in the first two bars of each four-bar block (bars 8, 9, 12, 13, ...); in the chorus it plays all four bars, an octave up.
  The strong places of the groove still snap to a chord tone.
- **The numbers of the idioms are hand-set judgements** of the known character of each tradition, not measurements (the reference
  statistics hold scales and rhythms, not melodic intervals). They are meant to be tuned by listening: the table is the one place to do it.

## How to add a mapping

1. **Data**: name the field the site already has (a route field, the mode, the home, the places). If it is not there, it does not go in yet.
2. **Decision**: say which single musical choice it drives (a number, an instrument, a bar range) and write the formula with its constants.
3. **Why it is heard that way**: one line that makes the direction obvious (more of X → more of Y). If you cannot write it, the mapping will not be heard.
4. **A test**: a deterministic Vitest in `globe/test/` that composes a fixed selection and checks the direction and the bounds, and one that the same selection composes the same piece twice.
5. Add the row and the formula to this page in the same commit. Share links of existing pieces will sound different; say so.

## Not mapped yet

- **Latitude**: no clear, safe musical dimension.
- **Flight frequency** (how often a route is flown): the site does not carry it.
- **Delay** and other live flight data: not part of a personal selection.
- **Local time of day**: would make the same selection sound different at different times, which breaks determinism.


## Note length by route length (rank)

| Data | Decision | Why it is heard that way | Where |
|---|---|---|---|
| rank of the route's distance within the selection (1 = longest) | pad ×0.7–1.3, bass and hook ×0.8–1.2 held longer for longer routes (drums unchanged) | a longer flight is a longer breath; the shortest routes stay clipped | `compose.ts` (pad, bass, hook) |

## Call and response (experiment, B2 first step)

| Data | Decision | Why it is heard that way | Where |
|---|---|---|---|
| the pluck route of the selection (from 4 routes) | in the odd bars of the chorus it answers in the second half of the bar with the hook's motif turned upside down around its first note; the hook rests there and the pluck's own eighths rest too | a phrase and its reply: the melody breathes instead of running on | `compose.ts` (`answerer`, hook branch) |

## The journey: where it leaves, Istanbul, where it arrives

| Data | Decision | Why it is heard that way | Where |
|---|---|---|---|
| the trip changes planes at Istanbul away from home | the verse and the break play the Turkish card's rhythm (episodes.ts is replaced in the verse by blocks of the Turkish figure) | the middle of the trip sounds like Turkey | `journey.ts`, `compose.ts` (`stageAt`) |
| the destination (last leg's far end with a transit; the card with the most routes otherwise) | the build and the chorus play the destination card's rhythm figure, and its routes come forward (x1.15, the others x0.85) | the song arrives where the trip goes | same |
| the home card (where the trip leaves) | the intro and the outro stay home | the piece starts and ends at its own sound | same |

A trip with one sound (same card all through) has no journey and is unchanged. The key, the chords and the instruments of each route stay as they are; the stage changes the rhythm figure and who is spotlit (a card that no route plays only changes the figure).
