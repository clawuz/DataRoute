# All Airports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 13 more genre cards and a card list for every big country and city, so most of the 351 airports sound like where they are.

**Architecture:** Same files as the destination styles: `genres.ts` (`BASE_CARDS`, `BY_AIRPORT`, `BY_ISO`), `idiom.ts`, `world-voices.ts` (`DRONE_BY_CARD`), docs, tests. Spec: `docs/superpowers/specs/2026-10-26-all-airports-design.md` (every value is in it).

**Tech Stack:** TypeScript, vitest (`cd globe && npx vitest run`, `npx tsc --noEmit`).

## Global Constraints

- Existing cards keep their values; new cards verbatim from the spec table.
- Voices must exist in the pack / base instruments / world families (same check as `personal-cards-new.test.ts`).
- Deterministic; picks by `routeHash`.
- Goldens (`globe/test/personal-episodes.test.ts`) are re-captured only with `cd globe && python3 /tmp/probe/recap.py "<reason>"`, after the failing tests are understood; the "no colour" golden rows must keep their premise (`episodeCards` empty): change a row's places, not the assertion, when a mapping change breaks it.
- Docs follow the code (`docs/music-genre-cards.md`: cards, idiom table, drone, "Where each card plays"; `docs/music-data-mapping.md`).
- No push, no deploy.

---

### Task 1: The 13 new cards

**Files:** Modify `globe/src/personal/genres.ts` (`BASE_CARDS`), `globe/src/personal/idiom.ts` (`IDIOMS`), `globe/src/personal/world-voices.ts` (`DRONE_BY_CARD`), `docs/music-genre-cards.md`; extend `globe/test/personal-cards-new.test.ts` (the 13 ids, `CARDS.length` 51; also make its docs-presence check stricter: the id must appear in a table row `| <id> |`, which also fixes the weak check of the earlier task).

**Interfaces:** Produces card ids `samba afrobeat bollywood khaleeji maghrebi russian thai chinese cumbia andean caucasus fado chanson`.

- [ ] **Step 1:** Extend the test (13 ids, count 51, strict docs rows); run it and see it fail.
- [ ] **Step 2:** Add the 13 cards exactly as the spec table says (look at the 11 cards added in the previous task for the shape, incl. `perc`, `bass`, `swing`; `fast` is false for all), the 13 idiom entries and the drone entry.
- [ ] **Step 3:** Docs: the cards table (cards list), the idiom rows (values `idiomOf` returns: derive the cadence from the bias as the earlier rows do), the drone row.
- [ ] **Step 4:** `cd globe && npx tsc --noEmit && npx vitest run` green (the goldens must not change: the cards are not reachable yet; if the reachability test of the airport tests fails because the new cards are unreachable, that test is allowed to fail until Task 2 — mark nothing skipped; just do Task 1 and 2 in this order and commit Task 1 only when the whole suite is green, so if that test fails in Task 1, extend its expectation list in Task 2 instead and say so).
- [ ] **Step 5:** Commit: `feat(personal): thirteen more cards: samba, afrobeat, Bollywood, khaleeji, Maghreb, Russian, Thai, Chinese, cumbia, Andean, Caucasus, fado, chanson`.

### Task 2: A card list for every big country and city

**Files:** Modify `globe/src/personal/genres.ts` (`BY_AIRPORT` groups, `BY_ISO`), `docs/music-genre-cards.md` ("Where each card plays"), `docs/music-data-mapping.md`; extend `globe/test/personal-airports.test.ts`.

- [ ] **Step 1: Failing tests:** one per spec bullet: the first card of: GRU `samba`, LOS `afrobeat`, ABV `westafrica`, BOM `bollywood`, DEL `hindustani`, ISB `hindustani`, RUH `khaleeji`, DXB `khaleeji`, CMN `maghrebi`, CAI `arabic`, SVO `russian`, MSQ `slavic`, BKK `thai`, PEK `chinese`, URC `chinese`, HKG `chinese`, SIN `chinese`, BOG `cumbia`, CCS `salsa`, UIO `andean`, SCL `andean`, TBS `caucasus`, EVN `caucasus`, GYD `caucasus`, LIS `fado`, CDG `chanson`, MRS `jazz`; membership checks for the second cards; the existing reachability test now covers all 51 cards; every airport still has ≥ 1 card.
- [ ] **Step 2:** See them fail. **Step 3:** Implement the lists exactly as the spec's "Where every card plays" (use the existing `group()` helper for airport groups, `BY_ISO` for whole countries; keep all earlier entries unless the spec replaces them: SA AE QA KW BH OM, MA DZ TN LY, RU, IN, PK, CN, HK TW MO, SG, TH, CO, VE, PA, EC, CL, GE, AM, AZ, PT, FR, NG, GH, BR).
- [ ] **Step 4:** Run all; recapture the goldens (`python3 /tmp/probe/recap.py "all airports: a card list for every big country and city"`) only after the failing tests are understood; the "no colour" premise rows keep `episodeCards` empty (if a row breaks, change its places to a same-card region). The variety test must still pass (report the numbers if it does not).
- [ ] **Step 5:** Docs ("Where each card plays": the new bullets; mapping row). **Step 6:** Commit: `feat(personal): every big country and city chooses its own style (Russia, India, China, the Gulf, the Maghreb, Brazil, Nigeria, France, Portugal, the Caucasus, the Andes)`.
