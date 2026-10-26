# Destination Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every selection sounds like where it goes: 11 new genre cards, airport-level destination mapping, the main style from the weight of the destinations, home as intro/outro/drone.

**Architecture:** Data in `genres.ts` / `idiom.ts` / `world-voices.ts`; the mapping in `genres.ts` (`BY_AIRPORT`, `cardsOfAirport`); the plan in `planCards`; the journey in `journey.ts` + `compose.ts`. Spec: `docs/superpowers/specs/2026-10-26-destination-styles-design.md` (read it first: it holds every number).

**Tech Stack:** TypeScript, vitest (`cd globe && npx vitest run`, `npx tsc --noEmit`).

## Global Constraints

- Existing cards keep their values; only the listed new cards are added (spec section 1, values verbatim).
- Voices must exist in `globe/src/audio/world-pack.ts` (`WORLD_INSTRUMENTS`) or the base instrument set, or be a world family; a test checks it.
- Deterministic: no `Math.random`; picks by `routeHash`.
- Golden hashes of `globe/test/personal-episodes.test.ts` are re-captured only where the plan says; the comment above them is extended with the reason. Recapture helper: `/tmp/probe/recap.py "<reason>"` (run from `globe/`; it rewrites the three golden lists from the code's current output).
- Documentation follows the code: `docs/music-genre-cards.md` (cards table, idiom table, drone table), `docs/music-data-mapping.md` (rows with a Where cell).
- No push, no deploy.

---

### Task 1: The 11 new cards

**Files:** Modify `globe/src/personal/genres.ts` (`BASE_CARDS`; use existing scale constants, add none unless a card needs one), `globe/src/personal/idiom.ts` (`IDIOMS`), `globe/src/personal/world-voices.ts` (`DRONE_BY_CARD`: `karadeniz: "BAGPIPE_DRONE"`), `docs/music-genre-cards.md`. Test: `globe/test/personal-cards-new.test.ts`.

**Interfaces:** Produces the card ids `karadeniz icanadolu akdeniz dogu zeybek greek italian classical rnb country spguitar` in `CARDS`/`BASE_CARDS` with the fields of `GenreCard`.

- [ ] **Step 1: Write the failing tests** (`personal-cards-new.test.ts`): for each new id, `CARDS.find` exists; scale has 5 or 7 entries, strictly ascending, first 0, last < 12; `bpm` low ≥ 76 and high ≤ 126, low ≤ high; `cell` has ≥ 1 positive entry and the sum of |cell| ≥ 2; `accent` (when present) has the same length as `cell`; `held`, `melody`, `pluck` non-empty; every voice resolves: it is a key of `WORLD_FAMILIES`, or a member of the base `Instrument` names (import `WORLD_INSTRUMENTS` from `../src/audio/world-pack` and the instrument list that `theory.ts` exports, or check by `sampler`/`limitsOf` returning a range — look at how `personal-world.test.ts` checks voices and do the same); `IDIOMS` has the id (import from `idiom.ts`); `docs/music-genre-cards.md` mentions the id (read the file with `node:fs`). Also: `CARDS.length` is 38.
- [ ] **Step 2: Run to see them fail.** `cd globe && npx vitest run test/personal-cards-new.test.ts`
- [ ] **Step 3: Add the 11 cards** to `BASE_CARDS` exactly as the spec table says (copy the shape of the existing entries: look at `anatolian`, `funk`, `romantic` for every field incl. `perc` and `swing`). Choose, where the table says nothing, `fast` only for karadeniz and dogu. Add the `IDIOMS` entries (suggested: karadeniz `{ step: 0.7, repeat: 0.3, leaps: [2], bias: -1, span: 5, arc: 2, start: [3, 4, 2] }`, icanadolu `{ step: 0.8, repeat: 0.25, leaps: [2], bias: -1, span: 5, arc: 2, start: [3, 4, 2] }`, akdeniz `{ step: 0.7, repeat: 0.2, leaps: [2, 3], bias: -1, span: 6, arc: 3, start: [3, 4, 2] }`, dogu `{ step: 0.6, repeat: 0.35, leaps: [2], bias: 0, span: 5, arc: 2, start: [0, 2, 4] }`, zeybek `{ step: 0.8, repeat: 0.2, leaps: [2], bias: -1, span: 5, arc: 2, start: [4, 3, 2] }`, greek `{ step: 0.65, repeat: 0.25, leaps: [2, 3], bias: 0, span: 6, arc: 2, start: [0, 2, 4] }`, italian `{ step: 0.55, repeat: 0.1, leaps: [2, 3, 4], bias: 0, span: 7, arc: 3 }`, classical `{ step: 0.7, repeat: 0.05, leaps: [2, 3], bias: 0, span: 7, arc: 2 }`, rnb `{ step: 0.6, repeat: 0.2, leaps: [2, 3], bias: 0, span: 6, arc: 2, start: [0, 2, 4] }`, country `{ step: 0.7, repeat: 0.15, leaps: [2, 4], bias: 0, span: 6, arc: 2, start: [0, 2, 4] }`, spguitar `{ step: 0.7, repeat: 0.1, leaps: [2, 3], bias: -1, span: 6, arc: 2, start: [4, 2, 0] }`). Add the drone entry. Fix every existing test whose count of cards or ids changes (e.g. `CARDS.length`, the docs-vs-cards test): update the number with a comment, never loosen a check.
- [ ] **Step 4: Docs.** In `docs/music-genre-cards.md` add the 11 cards to the cards list/table (same columns as the existing ones), to the idiom table (all values `idiomOf` returns for them: print them with a scratch test run outside the repo or read `idiom.ts` + defaults), and the drone table; say that the Turkish regional cards approximate zurna, tulum, ud, tambur and davul with the pack's instruments.
- [ ] **Step 5: Run everything.** `cd globe && npx tsc --noEmit && npx vitest run` — all green (the goldens do not change in this task: the new cards are not reachable yet; if one changes, find out why before touching it).
- [ ] **Step 6: Commit.** `git add -A globe docs && git commit -m "feat(personal): eleven new genre cards: Black Sea, Central Anatolia, Mediterranean, East Anatolia, Aegean, Greek, Italian, classical, R&B, country, Spanish guitar"`

### Task 2: Airport-level destination mapping

**Files:** Modify `globe/src/personal/genres.ts` (`BY_AIRPORT`, `cardsOfAirport`, `BY_ISO` for GR, IT, ES, DE, AT, CH, GB, AU, CY if missing), `docs/music-genre-cards.md` (a "Where each card plays" section), `docs/music-data-mapping.md`. Test: `globe/test/personal-airports.test.ts`.

**Interfaces:** `cardsOfAirport(iata: string, region: string): GenreCard[]` keeps its signature; consults `BY_AIRPORT[iata]` first.

- [ ] **Step 1: Failing tests.** (a) every airport of `destinations.json` (import it) returns ≥ 1 card from `cardsOfAirport(i, region)` (use `destinationOf(i)?.region ?? "UNK"`); (b) the Turkish groups of spec section 2: `TZX`→first card `karadeniz`, `ESB`→`icanadolu`, `AYT`→`akdeniz`, `ADB`→`zeybek`, `VAN`→`dogu`, `IST` list contains `anatolian` and `jazz`; (c) `ATH`→`greek`, `FCO`→`italian` first, `SVQ`→`flamenco` first, `MAD`→`spguitar` first, `DFW`→`country` first, `ATL`→`rnb` first, `JFK` list contains `jazz` and `classical`, `LHR` contains `celtic`, `EDI`→`celtic`; (d) every id of `CARDS` is reachable: the union over all airports of `cardsOfAirport` covers every card id (cards reachable only through region fallbacks count; if a card is not reachable, add it to the right table — do not weaken the test); (e) deterministic.
- [ ] **Step 2: See them fail.**
- [ ] **Step 3: Implement.** Add `const BY_AIRPORT: Record<string, string[]>` built from small groups (a helper `group(ids, cards)` that spreads the airports) exactly as spec section 2; `cardsOfAirport` returns `BY_AIRPORT[iata]` mapped by `byId` when present. Update `BY_ISO` for IT (`["italian","romantic"]`), GR (`["greek"]`), ES (`["spguitar","flamenco"]`), DE/AT/CH (`["classical","baroque"]`, DE adds `pop`), GB (`["pop","classical","celtic"]`), AU (`["country","pop"]`), US (`["pop","jazz","country","rnb"]`), CY (`["greek","anatolian"]`), TR default (`["anatolian","karsilama","cinematic","jazz"]` for the unlisted Marmara airports).
- [ ] **Step 4: Run all; recapture the goldens** with `cd globe && python3 /tmp/probe/recap.py "destination styles: airport-level cards"` ONLY if the golden tests fail (they will for pieces that touch the changed countries); check the diff of the golden file shows only hash changes and the comment.
- [ ] **Step 5: Docs.** The "Where each card plays" section (airport groups, as in the spec) and a data-mapping row (`destination airport → card list → the voices, scale, figure, tempo of the piece`).
- [ ] **Step 6: Commit.** `git add -A globe docs && git commit -m "feat(personal): destinations choose their style by airport: Turkish regions, Greece, Italy, Spain, the United States, Germany, the United Kingdom"`

### Task 3: The main style follows the destinations; home keeps the intro, the outro and the drone

**Files:** Modify `globe/src/personal/genres.ts` (`planCards`, `CardPlan`), `globe/src/personal/journey.ts`, `globe/src/personal/compose.ts` (drone, journey wiring), `docs/music-data-mapping.md`, `docs/music-genre-cards.md`, the journey test. Test: `globe/test/personal-plan.test.ts`, update `globe/test/personal-journey.test.ts`.

**Interfaces:**
- `CardPlan` gains `home: GenreCard` (the choice `planCards` made before this task for `main`: the `homeCards` pick or the generic one; keep the code that produced it, same hash inputs).
- `planCards(...).main` = the card with the most routes among `colourCardOf(routes[i], i)` (ties: larger sum of `distKm`, then smaller `routeHash(card.id)`); for no routes it keeps `{ main: CARDS[0], home: CARDS[0], perRoute: [] }`.
- `Journey` = `{ home: GenreCard | null; transit: GenreCard | null }`; `journeyOf(routes, plan)`: `home` = `plan.home` when it is not `plan.main`, else null; `transit` as today; null when both null. `journeyCard(section, j)`: intro/outro → `j.home` (null = main); verse → `j.transit ?? undefined`; build/chorus → null (main); break → `j.transit`.
- `compose.ts`: `droneVoice(plan.home.id)`; the grooves map includes `journey.home` and `journey.transit`; `style.journey` = `[journey.home?.id, journey.transit?.id]` filtered.

- [ ] **Step 1: Failing tests** `personal-plan.test.ts`: for `buildRoutes(["JFK","LAX","MIA"... ], "IST")` style selections the main card is the most frequent far-end card (compute the expectation in the test from `colourCardOf`, with the tie rule written out in the test); eight US routes from `h=IST` do not give a Turkish main (`anatolian`, `karsilama`, `cinematic`, `romantic`, `jazz` are allowed only if they are what the destinations vote); `plan.home` for `h=IST` is among `cardsOfAirport("IST", ...)` ∪ `generic` pool; deterministic; one route → main = its far end card. Update `personal-journey.test.ts` to the new `Journey` shape and sections (home in intro/outro, transit in verse/break, main in build/chorus).
- [ ] **Step 2: See them fail.**
- [ ] **Step 3: Implement** `planCards` (keep `allocateColour` call with the new main), `CardPlan.home`, `journey.ts`, the `compose.ts` wiring (drone by home; `style.journey`; the grooves map). Everything that read `plan.main` for tempo, scale, chords, groove, tune stays on `plan.main` (it is now the destination style).
- [ ] **Step 4: Run all.** Recapture the goldens with `python3 /tmp/probe/recap.py "the main card follows the destinations"` after checking that only expected tests fail (goldens, journey) and that the invariants tests (NaN, order, ranges, determinism, drone, humanize) pass untouched. Fix real failures in the code, not in the tests.
- [ ] **Step 5: Docs.** `docs/music-data-mapping.md`: replace the journey rows (intro/outro home, verse Istanbul, build/chorus main = destination) and add the rows "the card most routes go to → tempo, scale, chords, groove"; `docs/music-genre-cards.md`: say that the main card is the destination's and home is `plan.home`.
- [ ] **Step 6: Commit.** `git add -A globe docs && git commit -m "feat(personal): the main style follows the destinations; home keeps the intro, the outro and the drone"`

### Task 4: Variety audit

**Files:** Create `scripts/music/variety-audit.mjs` is NOT needed: write the probe as a vitest file that is deleted after the numbers are copied; Modify `docs/music-genre-cards.md` (a "Variety" section with the numbers). Test: `globe/test/personal-variety.test.ts` (kept, light).

- [ ] **Step 1:** A scratch test (not committed) over 300 selections built with a seeded generator from `destinations.json` (3–8 places; half with `home` "IST", half journeys): record `planCards(...).main.id`, `styleFor(...).bpm`, `plan.home.id`. Print: the count per main card (sorted), the number of distinct main cards, the bpm min/median/max, the share of the most frequent card, how many pieces have `home !== main`.
- [ ] **Step 2:** Add the kept test `personal-variety.test.ts` with 120 selections: at least 15 distinct main cards, no card is the main card in more than 25% of them, bpm spans at least 30 bpm. If it fails, report the numbers and find out why (the mapping tables, the tie rule) — do not weaken the thresholds without telling the controller.
- [ ] **Step 3:** Docs: paste the numbers of Step 1 in a "Variety" section.
- [ ] **Step 4: Run all and commit.** `git add -A globe docs && git commit -m "test(personal): variety audit: the main style spreads over the cards"`
