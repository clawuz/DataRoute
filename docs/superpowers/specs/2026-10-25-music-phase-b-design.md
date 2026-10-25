# Music phase B: region episodes, conversation, breath

Date: 2026-10-25. Branch: `feat/ui-v2`. Builds on `2026-10-24-music-phase-a-design.md` (built; the user listens to it locally first).

## Goal

Phase A made the sound more human and gave the piece a home. Phase B gives it **a shape that follows the trip**: the regions you
cross become sections with their own rhythm, the voices answer each other, and the piece breathes. The ground rules of phase A stay:
no note that is not a route's, deterministic (a function of the routes and mode), every data → music mapping listed in
`docs/music-data-mapping.md` with the reason it is heard that way, and everything checked by tests and by the user's ear.

Phase B is delivered in three steps. Each step is its own plan, built, then **listened to by the user before the next starts**.

| Step | What | Detail in this document |
|---|---|---|
| **B1** | Region episodes: the verse becomes a tour of the regions of the trip, each with its own rhythm figure; the home theme returns | full design |
| **B2** | Conversation: call-and-response between voices, cadences, voice leading in the pad | outline, to be detailed after B1 is heard |
| **B3** | Breath and more data: dynamics curve, a silence before the chorus, further data mappings tried one at a time | outline, to be detailed after B2 |

Out of scope for all of B: MIDI export, score view, listening page (phase C), new instruments (the missing ones are parked), flight
frequency (the data is not on this site), the tune-length bug of `melodies.ts` (separate fix).

## B1. Region episodes

### The idea

A musician would keep one recognisable skeleton and let the **feel** change from place to place on top of a common pulse. Today every
voice of the groove (bass, kick, backbeat, hat, the hook's rhythm) rides on the figure of the **main card** (`plan.main.cell`/`accent`),
and only the instruments and the melody scale change by region. B1 makes the rhythm figure change too, and lets the voices of the region
whose turn it is come forward — in the **verse**, and only there, so that the build, the chorus (with the key lift), the break and the
outro keep the home sound and the piece stays recognisable.

### Definitions

- **Colours of the trip:** the cards of the coloured routes (`plan.perRoute[i] !== plan.main`), counted by number of routes per card.
  A route is coloured when its card differs from the main card, so a trip inside one country can have colours too (a country has several cards).
  Cards with the most routes first; ties by `routeHash(card id)`.
- **Episode cards:** the first three colours (cap 3: a verse of 16 bars cannot tell more without becoming a list). Further colours are
  not given an episode (their routes still sound in every bar as today).
- **Home:** the main card (the refrain).

### The schedule (bars of the 64-bar form: intro 0-7, verse 8-23, build 24-31, chorus 32-51, break 52-55, outro 56-63)

The verse is four blocks of four bars, `A` = home, `B`, `C`, `D` = the first, second, third episode card:

| episode cards | verse blocks (bars 8-11, 12-15, 16-19, 20-23) |
|---|---|
| none (every route plays the main card) | A A A A (unchanged piece) |
| 1 | A B A B |
| 2 | A B A C |
| 3 | A B C D |

Every other section plays the home figure. (Why: the verse is where a trip "tells where it went"; the chorus is the song.)

### What changes inside an episode block

1. **Figure:** the kick, backbeat and hat do not read the card's figure today; they play fixed patterns (kick on beats 0 and 2, backbeat on
   beats 1 and 3, hat in straight eighths; beats counted from 0). So inside an episode block the **bass** and the **hook's rhythm** follow the
   figure of the episode card (the `slots`/`hits`/`strong` derived from `cell` and `accent`), the **kick** plays the exact strong beats of that
   figure (where the bass plays them; beat 0 always), the **hat** plays its hit positions (swung on the odd slots of the figure, like the hook), and the **backbeat stays on beats 1 and 3**. The bar is
   still four beats and the tempo does not change (the cell is stretched to four beats as today), so the transitions are smooth. Chords and the
   progression stay the main card's.
2. **Spotlight:** the routes whose card is the episode card play at level ×1.15, the other routes ×0.85, so the instruments of the
   region come forward. (Applied to the velocity of each note by route; clamped as everywhere. The hook's tune branch works it out per note from the bar the note sounds in, the other voices by the bar they start in. A hook that plays a public-domain tune keeps the tune's rhythm; only the spotlight applies to it. The drone is not spotlit.)
3. **Bridge:** in a piece that has episodes, the last bar of every block of the verse (bars 11, 15, 19, 23) adds a short drum fill: the backbeat voice's extra hit on
   beat 3.5 (the one the build already has) and a kick on beat 3 (beats counted from 0, as in item 1). The kick fill needs the kick role (from five routes), the backbeat fill the backbeat role (from six); if the piece has neither role (fewer than five routes) the bar
   is simply the last bar of the block.
4. The hook's motif is built for the main figure's number of hits; for an episode the hook uses its motif with the hit count of the
   episode figure by repeating or truncating the motif's degrees (no new random numbers: the motif of a hook route is cycled with the
   existing `motifs[i][b % 4]` and the index `hi` that the hook loop already keeps).

### Data → music (added to `docs/music-data-mapping.md`)

| Data | Decision | Why it is heard that way |
|---|---|---|
| number of routes per destination region | which regions get an episode (top three) and their order | the places you went most are told first |
| region of a route | the rhythm figure of the episode, the spotlight | where you go sounds like there, and has its moment |

### Code shape

- `globe/src/personal/episodes.ts` (new, pure): `episodeCards(plan: CardPlan): GenreCard[]` (the top-three colours) and
  `episodeAt(bar: number, cards: GenreCard[]): { card: GenreCard | null; blockEnd: boolean }` (the table above; `card` null = home).
- `compose.ts`: the groove helpers that build `slots`/`hits`/`strong` from a card become a function `groove(card)` (memoised by card id),
  the bar loop asks `episodeAt(b, cards)` and takes `groove(card ?? plan.main)`; spotlight and bridge as above.
  `PersonalStyle.episodes?: string[]` records the card ids, only when there are episodes (for tests and for a future display of the structure).
- Nothing changes for a piece without colours (every route plays the main card): it is byte-identical to today's (no episodes, no fills, no `episodes` in its style).

### Tests

- `episodeCards`: ordering by route count then hash, cap of three, none when there is no colour; `episodeAt` returns the table for 0, 1, 2, 3
  cards, home outside the verse, `blockEnd` on bars 11/15/19/23 only.
- Composed piece: for a trip with three colours the bass notes of bars 12-15 and 16-19 sit on different rhythm positions (compare the
  onset positions within the bar of the bass route against each card's figure); a piece without colours is identical to the one
  composed before this change (a fixed selection checked against a stored hash of its notes, or the same piece composed with the
  episode lookup disabled); the spotlight raises the velocity of the episode route's notes on average by about 35% over the others
  (1.15 / 0.85 = 1.35) in an episode block; the fills exist in bars 11, 15, 19, 23 and nowhere else in the verse.
- Determinism and the invariants of phase A (no negative times, no NaN, notes of one route in order, `drawDur` bounds, ranges).

### Risks

- A figure change can make the hook's strong beats land off the chord tones: the existing chord-tone snapping (`tones`) is kept; the test
  checks that hook notes on accented slots are within 1.5 semitones of a chord tone as today.
- A figure with many hits (aksak 9/8) under a hook written for fewer hits sounds busier: the motif cycling keeps the line's contour.
- With few routes the colours are few: the schedule falls back to `A A A A` or `A B A B`, never to an empty verse.

## B2. Conversation (outline)

- **Call and response:** in the chorus and the build, the hook and a second melodic voice (a pluck or second hook route) alternate by
  half-bars instead of sounding together; the second voice answers with the hook's motif turned upside down.
- **Cadences:** the last bar of every four-bar phrase ends the hook on a chord tone and holds it; the pad resolves.
- **Voice leading:** the pad tones of a chord are chosen as the inversion nearest to the previous chord.
- Questions for the user after hearing B1: should the answer voice be a region's instrument (coloured route) or the home instrument?

## B3. Breath and more data (outline)

- **Dynamics curve:** a smooth level curve inside a section instead of steps (crescendo through the build).
- **A silence:** one beat of rest before the chorus' first downbeat, and in the break only the pad and the hat remain.
- **More data mappings, one at a time, each tried by ear:** latitude → brightness (a filter or a register nudge); speed → hook density;
  if flight frequency can be carried to the site, rhythmic density per route; local time of day cannot be used (it would break determinism).
- Each mapping is added only if the user hears it as obvious, then listed in `docs/music-data-mapping.md`.

## Process

1. B1: a plan (writing-plans), built by subagents with reviews as in phase A, a final review, then the user listens locally.
2. The user's ear decides: spotlight strength, whether episodes are too short (a cap of 3 vs 4), whether the verse alone is enough.
3. B2 and B3 are detailed only after the step before has been heard.
4. No deploy and no push without the user's word.

## Decisions taken here (change them before the plan if you disagree)

- Episodes only in the verse; the chorus, the build, the break and the outro keep the home figure.
- Cap of three episode cards; ordered by the number of routes.
- Spotlight ×1.15 / ×0.85; the bridge is a small fill, not a new section.
