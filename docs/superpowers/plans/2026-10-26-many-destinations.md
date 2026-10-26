# Many Destinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With many destinations the dominant region leads the piece, and the verse tells up to six regions.

**Architecture:** `genres.ts` (clusters, `planCards` tally), `episodes.ts` (2-bar blocks for 4–6 colours). Spec: `docs/superpowers/specs/2026-10-26-many-destinations-design.md`.

**Tech Stack:** TypeScript, vitest (`cd globe && npx vitest run`, `npx tsc --noEmit`).

## Global Constraints

- 0–3 episode cards: `episodeAt` and everything composed from it stay byte-identical to today (the kept tests prove it).
- Deterministic; ties by `routeHash`.
- Goldens (`globe/test/personal-episodes.test.ts`) re-captured only with `cd globe && python3 /tmp/probe/recap.py "<reason>"` after the failures are understood; the "no colour" rows keep their premise (`episodeCards` empty): change places, not assertions.
- Docs follow the code: `docs/music-data-mapping.md` (rows with a Where cell), `docs/music-genre-cards.md`.
- No push, no deploy.

---

### Task 1: Clusters and the main card by dominant region

**Files:** Modify `globe/src/personal/genres.ts` (`CLUSTER_OF`, `clusterOf`, `planCards`), `docs/music-data-mapping.md`, `docs/music-genre-cards.md` (cluster table). Test: `globe/test/personal-clusters.test.ts`; adjust `personal-plan.test.ts` only where an expectation follows from the new rule.

- [ ] **Step 1: Failing tests** (`personal-clusters.test.ts`): every card of `CARDS` is in `CLUSTER_OF` and every key of it is a card; 13 distinct clusters; plan cases built with `buildRoutes([...], "IST")`: (a) places `["NRT","PEK","SIN","CAI","LOS","GRU"]`… compute expectations in the test from `colourCardOf` and `clusterOf` using the rule written out (cluster count, then sum of `distKm`, then `routeHash(clusterId)`; inside the cluster the card with most routes, ties by distance then `routeHash(card.id)`), not hard-coded ids; (b) a case where the leading CLUSTER has more routes in total than the most frequent CARD (e.g. `["DXB","RUH","DOH","NRT","NRT"... ]` — build one so the Gulf cluster (khaleeji + arabic cards) beats a single card with 2 routes) and assert `main` is in that cluster; (c) one route: main is its far-end card; no routes: unchanged.
- [ ] **Step 2:** See them fail. **Step 3:** Implement `CLUSTER_OF` (the table of the spec), `clusterOf(card)`, and the two-step choice in `planCards` (keep `home`, `colourOf`, `allocateColour`, determinism).
- [ ] **Step 4:** Run all; recapture the goldens only if the failing tests are understood. The variety test must pass (report the numbers if not). **Step 5:** Docs (cluster table; mapping row: "the dominant region of the destinations → the main card"). **Step 6:** Commit: `feat(personal): the dominant region of the destinations leads the piece`.

### Task 2: More regions told in the verse

**Files:** Modify `globe/src/personal/episodes.ts` (`EPISODE_CAP` 6, `VERSE_SHORT_BLOCK`, `episodeAt`), `docs/music-data-mapping.md`. Test: `globe/test/personal-episodes.test.ts` (extend the `episodeAt`/`episodeCards` unit tests; keep the old ones byte-identical), `globe/test/personal-many.test.ts` for composed pieces.

- [ ] **Step 1: Failing tests:** `episodeAt` for 4, 5, 6 card lists gives the eight-block patterns of the spec (`block` 0–7, card per bar), `blockEnd` on the last bar of every 2-bar block, `{ card: null, blockEnd: false, block: -1 }` outside the verse; the old tests for 0–3 cards unchanged; `episodeCards` caps at 6 (a plan with 8 distinct coloured cards gives 6); composed piece with ≥ 4 coloured cards (e.g. `buildRoutes(["NRT","LOS","GRU","DEL","MAD","JFK","CAI","FCO"], "IST")`: assert `style.episodes.length >= 4`): no NaN/negative times, notes in order per route, the bass rhythm positions inside two different 2-bar episode blocks differ (as the existing B1 test does for 4-bar blocks), fills (kick beat 3 / backbeat 3.5) at the last bar of each 2-bar block of the verse only, none outside the verse.
- [ ] **Step 2:** See them fail. **Step 3:** Implement `episodeAt` (4-bar blocks and old patterns for 0–3 cards; 2-bar blocks for 4–6 cards) and `EPISODE_CAP = 6`; check `compose.ts` for any assumption of four blocks (grep `VERSE_BLOCK`, `block`), and fix it if needed.
- [ ] **Step 4:** Run all; recapture goldens only if failing tests are understood (pieces with ≥ 4 colours change; pieces with 0–3 do not: the `GOLDEN_NO_COLOUR` and the three-episode rows must stay identical if their episode count is ≤ 3, otherwise explain). **Step 5:** Docs (the episodes section: the 2-bar case; mapping row). **Step 6:** Commit: `feat(personal): the verse tells up to six regions in two-bar blocks`.
