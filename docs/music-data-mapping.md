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
| altitude along the flight (height `h` = altitude / the route's cruise) | loudness: `vel × (0.88 + 0.24 h)`, 12% softer on the ground, 12% louder at cruise (drums and drone keep their level) | take-off swells, cruise is full, landing settles: the breath of the flight | `altitude-feel.ts`, `compose.ts` |
| altitude along the flight | brightness: a per-note low-pass at `1400 + 7600 h^1.2` Hz (Q 0.6) on drawn melodic notes of the sampled instruments | close to the ground the sound is warm and near, up high it is open and airy | `altitude-feel.ts`, `compose.ts`, `sampler.ts` |
| altitude along the flight | room: the reverb send of a note moves by `0.10 (h − 0.5)` (clamped to 0…0.5; hidden gesture notes copy their source) | high up it is wider, the ground is close | `altitude-feel.ts`, `compose.ts`, `space.ts` |
| altitude along the flight (phase of the route's phrase) | the flight runs (nağme): in a bar of a hook route that begins the climb (phase at the bar start below 0.18) the last beat is a rising run of four sixteenths, 1 to 4 scale degrees above the bar's last hook degree; in a bar that ends the descent (phase at the bar end above 0.82) a falling one; none where the hook has a hit at beat 3 or later, none in call-and-response bars; velocity ×0.8, on the scale of the route's card | the music box shows the plane climbing and coming down; the ear hears it at every take-off and landing of a phrase | `altitude-feel.ts` (`flightRun`), `compose.ts` |
| east / west direction of the hook route | which way the motif's walk tends to go (a weaker pull than the tradition's own direction) | travelling east rises | `compose.ts`, `idiom.ts` |
| destination region (the card of the hook route) | the idiom: stepwise or leaping, how much it repeats, the direction of the line (seyir), range, start degrees, the degrees the bars end on | the melody sounds like where it goes | `idiom.ts`, `genres.ts` |
| destination region | instrument, rhythm figure, melody scale | where you go sounds like there | `genres.ts`, `world-voices.ts` |
| destination airport | the card list of the airport (airport table, then country, then region), the hash of the route picks one | the voices, scale, figure and tempo of the piece: Trabzon sounds of the Black Sea, Seville of flamenco, Dallas of country, Moscow of the Russian romance, Mumbai of Bollywood | `genres.ts` (`BY_AIRPORT`) |
| share of routes per region | how many routes take that region's colour | busy regions weigh more | `compose.ts` |
| the dominant region of the destinations (the cluster of cards with the most routes; ties: the larger total distance, then the smaller hash of the cluster id), then inside it the card with the most routes (the main card; same ties) | tempo, scale, progression, groove | the piece plays the sound of where the trip goes | `genres.ts` (`planCards`) |
| home card (`plan.home`: a card of the starting airport; sometimes a lively generic one when the trip has many routes) | the intro, the outro and the **home drone** | home opens and closes the story | `genres.ts`, `world-voices.ts` |
| mode (been / want to go) | minor or major; **size of the key lift** | wistful vs hopeful | `compose.ts`, `lift.ts` |
| regions crossed | **whether there is a key lift** | a trip inside one region has no journey | `lift.ts` |
| longitude of a route's middle, relative to the start of the first route (the home airport when the trip starts at home) | **stereo position** | east is right, west is left, like the map (when the first route starts at home) | `space.ts` |
| route distance | **reverb amount** | far = distant = more room | `space.ts` |
| time zones spanned by the trip | **how loose the timing is** (jet lag) | the further, the more it drifts | `humanize.ts` |
| number of routes per destination region (card) | **which regions get an episode** (up to six, the ones with the most routes; with 1-3 they get four-bar blocks, with 4-6 two-bar blocks) and their order | the places you went most are told first | `episodes.ts`, `compose.ts` |
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

- Instrument from the home card of the piece (`plan.home`, usually a card of the starting country; with about 10% probability for fewer than 6 routes, 20% from 6 routes and 40% from 10 routes it is a lively generic card instead, `takeGeneric` in `planCards`): `hindustani` → `TANPURA`; `celtic`, `karsilama` → `BAGPIPE_DRONE`; `baroque` → `RENORGAN`; every other card → `CELLO` (`DRONE_BY_CARD`, `droneVoice`). The family is resolved by `routeHash` of the first route like any other voice.
- Notes: the tonic and the fifth above it (+7 semitones) of the home key, one octave below the key root, folded into the range of the instrument (`fit`). The key is the piece's own, **not** the lifted one.
- Re-struck every 2 bars for the plucked tanpura, every 4 bars for the other instruments; a note ends before the next silent bar.
- Level: tonic `0.22`, fifth `0.15`, times the section level and the outro fade.
- Silent in the break (bars 52–55). Additionally silent in the lifted bars 44–51 when the trip crosses regions (lift ≠ 0), so then it plays in bars 0–43 and 56–63. With no lift (a one-region trip, which includes any all-Turkey trip) it plays through bar 51 and again in the outro.
- Played by the **first route** (route 0, the home leg): `route: 0`, `show: false` (it sounds, the music box does not draw it). A piece of one route (the solo piece) has no drone.
- `pan` 0 and `wet` 0.3 (the middle send); no timing drift.

**Region episodes** (`episodes.ts`, `compose.ts`)

- The verse (bars 8-23) is four blocks of four bars with up to three episode cards (below); with four to six episode cards it is eight blocks of two bars (see the end of this list). `A` is the main card (the destinations' sound); `B`, `C`, `D` are the first, second and third episode card.
  Episode cards are the cards of the coloured routes (a route is coloured when its card is not the main card), the card with the most routes first,
  ties by `routeHash` of the card id, at most six (`episodeCards`, `EPISODE_CAP`). A coloured route can be in the same country as home: a country has several cards.
  The cards are written to `style.episodes` (only when there are any: a piece without episodes has no `episodes` in its style).

| episode cards | bars 8-11 | 12-15 | 16-19 | 20-23 |
|---|---|---|---|---|
| none (every route plays the main card) | A | A | A | A |
| 1 | A | B | A | B |
| 2 | A | B | A | C |
| 3 | A | B | C | D |

  With **4, 5 or 6** episode cards (many destinations) the verse is eight blocks of two bars (bars 8-9, 10-11, ... 22-23; `VERSE_SHORT_BLOCK = 2`), `0..5` being the episode cards in order:
  4 cards: A 0 1 2 3 0 1 A; 5 cards: A 0 1 2 3 4 0 A; 6 cards: A 0 1 2 3 4 5 A. The bridge fill closes every two-bar block (bars 9, 11, 13, ... 23), and everything else about an episode (groove, spotlight, tune spotlight) works per block as before.

- Beats are counted from 0: beat 0 is the first beat of the bar, beat 3 the fourth, 3.5 the last half beat.
- Inside an episode block the figure of the episode card (stretched to four beats, same tempo) drives: the **bass** (its strong beats), the **hook's rhythm**
  (hit places; the hook's notes still snap to the chord on strong places), the **pluck's swing**, the **kick** (beat 0, the first beat, always, and the exact strong beats of the figure, on the bass) and the **hat**
  (its hit places instead of straight eighths, swung on the odd slots of the figure exactly like the hook: a rest counts as a slot). The **backbeat** stays on beats 1 and 3 (the second and fourth beat, as in the other sections) and the chords and progression stay the main card's. In the home blocks of the verse everything is as before.
- **Spotlight:** in an episode block the voices of routes whose card is the episode card play at ×1.15, the others at ×0.85. The hook's public-domain tune (only with `{ tunes: true }`) works the
  spotlight out per note from the bar the note sounds in (an 8-bar tune that starts at bar 8 is spotlit by the block of each bar); the other voices by the bar they start in.
- A hook that plays a public-domain tune (only with `{ tunes: true }`) keeps the tune's rhythm; only the spotlight applies to it. The drone is not spotlit.
- **Bridge fill:** on the last bar of every four-bar block of the verse (bars 11, 15, 19, 23) the kick adds a hit on beat 3 (the fourth beat; if it is not already there) and the backbeat a hit on the
  last half beat (3.5). They exist only in a piece that has episodes, and only where those drum roles exist: the kick fill from five routes, the backbeat fill from six.
- A piece where every route plays the main card has no episodes and its verse is unchanged (no fills either), and every bar outside the verse is unchanged, except the intro and the outro when the home card differs from the main card (they play the home groove).

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

## Gestures

After the notes are made and humanized, `applyGestures` (`personal/gestures.ts`, wired at the end of `composePiece`) plays each instrument the way it is played. The notes it adds are hidden (`show: false`): they sound but are not drawn on the globe or in the music box, and they do not change how long a drawn note is drawn. Every number is a hand-set judgement to tune by ear.

| Instrument | Gesture | Why it is heard that way | Where |
|---|---|---|---|
| kemençe (hook / melody notes of 0.2 s or more) | a second string a fourth below (double stop), a grace note a tone above on each beat, a held open tonic at the start of each bar (silent in the break and in the lifted bars, like the home drone) | the bow touches two strings, and the open string drones under the horon | `gestures.ts` |
| saz, bağlama | on strong beats two open strings struck just after the note (şelpe); a long hook note slides up from a semitone low on a third of the notes | the plectrum sweeps across strings; the left hand slides into notes | `gestures.ts` |
| kanun, santur (long hook / melody notes) | a tremolo of quick repeated hits over the note, the first hit with an octave above; it stops 10 ms before the next note of its route and instrument | two plectra on a plucked string cannot sustain, so they repeat | `gestures.ts` |
| nylon guitar (plucked role) | a chord strum on the beat (spread by card: flamenco 55 ms with five notes, bossa and samba 18 ms, others 25 ms), down strokes on beats 0 and 2 of the bar only | the right hand brushes the strings, it does not hit them at once | `gestures.ts` |
| upright bass | in a jazz card a walking line of four quarter notes a bar (root, fifth, third, an approach to the next root; the first note is cut to one beat so it does not overlap the walk); in country, bossa, samba, salsa and tango the second bass note of a bar is the fifth | jazz bass walks the chord; folk and Latin bass alternates root and fifth | `gestures.ts` |
| tanpura (the drone) | a cycle of strokes every beat on the tonic drone note: Pa, high Sa, high Sa, low Sa (the drone's own fifth is dropped: the cycle holds it) | the four strings are plucked one after another, never struck together | `gestures.ts` |
| ney | notes slide up from a little below, deeper (two semitones) at the start of a phrase after a breath | the breath finds the pitch, it does not start on it | `gestures.ts` |
| saz, bağlama (widened) | the strum also on plucked-role notes that start on beat 0 or 2 of the bar, whatever their velocity (hook notes on any beat still need `vel >= 0.5`) | the plectrum sweeps the strings on every beat of the accompaniment | `gestures.ts` |
| kanun, santur (widened) | plucked role: a roll of two hidden notes (+12 and +19 st at 35 and 70 ms) on beats 0 and 2 of the bar; hook notes of 0.3 s or more get the tremolo | the plectra run up the strings | `gestures.ts` |
| harp, folk harp | plucked role, first note of a bar: a hidden rising glissando of four chord tones every 45 ms | the hand sweeps up the chord | `gestures.ts` |
| piano family (PNO, STEINWAY, KAWAI, KNIGHTPNO, UPRIGHTPNO, EKEYS, RHODES, NS_EKEYS_*, NS_KEYS_AC_*) | hook notes on a beat get a hidden octave below; the first plucked note of a bar gets a hidden left-hand bass (chord root, an octave down, 1.5 beats) | two hands | `gestures.ts` |
| accordion | oom-pah: bass note on beats 0 and 2, a two-note chord stab on beats 1 and 3 (one set per route, bar and beat) | the left-hand bass and chord buttons | `gestures.ts` |
| violin | hook: glide into the first note after a gap of 0.3 s; a hidden fifth below on notes of 0.5 s or more | the finger slides into a phrase; the bow touches two strings | `gestures.ts` |
| koto, kayageum, dan tranh, psaltery | plucked role: a hidden repeat 60 ms later; hook notes of 0.35 s or more get the tremolo | a plucked string dies fast, so it is plucked again | `gestures.ts` |
| tenor sax, clarinet, flute, oboe, duduk, shakuhachi, erhu | hook notes of 0.3 s or more slide up from below on a third of them | the breath or finger finds the pitch | `gestures.ts` |
| steel / electric guitars (NS_GUITAR_AC_*, NS_GUITAR_EL_*) | plucked role: the same strum as the nylon guitar (beats 0 and 2); in the country card boom-chick: bass on beats 0 and 2, strum on 1 and 3 | the thumb plays the bass, the fingers the chord | `gestures.ts` |
| bagpipe | a hidden grace note a tone above, 40 ms before a note that repeats the previous pitch | the chanter has no tongue, a grace note separates equal notes | `gestures.ts` |

Notes a gesture adds are brought into the instrument's range by octaves (`compose.ts`); one that then repeats the pitch of a drawn note of its route and instrument within 50 ms is dropped. They take the role of the note they were made from (also when that note is dropped), and are left out of the `drawDur` pass. The sampler and the player glide a note that carries `glide` (semitones below its pitch), and a hidden note of 0.2 s or less carries `short`: the sampler lets it ring out for 0.25 s instead of 1.2 s (many of them sound together on a phone). A note carries the resolved name of its voice (`NS_EKEYS_069`, not the family `EKEYS`), so numbered families are matched by prefix.

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
| the main card (the card most routes go to) | the build and the chorus play it (it is the main card of the piece: tempo, scale, chords and groove) | the song arrives where the trip goes | `genres.ts` (`planCards`), `journey.ts` |
| the home card (`plan.home`, when it is not the main card) | the intro and the outro play the home groove | the piece starts and ends at the sound of where it leaves | `journey.ts`, `compose.ts` |

A trip with one sound (same card all through) has no journey and is unchanged. The key, the chords and the instruments of each route stay as they are; the stage changes the rhythm figure and who is spotlit (a card that no route plays only changes the figure).
