# Music phase B1 (region episodes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the verse (bars 8-23) the piece tours the regions of the trip: up to three region "episodes" with their own rhythm figure, the voices of that region come forward, and each block ends with a drum fill; everything else keeps the home sound.

**Architecture:** A new pure module `episodes.ts` decides which cards get an episode and which card sounds in a bar. `composePiece` builds a "groove" (slots, hits, strong beats, swing) per card with one small helper, asks `episodeAt` for every bar, uses the episode groove for the bass, the hook rhythm, and (inside episodes only) the kick and the hat, applies a spotlight to the velocity of the routes of the episode card, and adds the bridge fill. Bars outside the verse and pieces without colours are byte-identical to today's.

**Tech Stack:** TypeScript, Vitest.

Spec: `docs/superpowers/specs/2026-10-25-music-phase-b-design.md` (section B1). Correction found while planning (the plan governs where it differs): in today's code the kick (beats 0 and 2), the backbeat (beats 1 and 3) and the hat (eighths) play FIXED patterns and do not read the card's figure; only the bass (`strong`) and the hook (`slots`) do. So inside an episode block the **kick** follows the episode figure's strong beats and the **hat** follows its hit positions; the **backbeat** stays on 1 and 3 as the anchor.

## Global Constraints

- Deterministic: a function of the routes and mode only (no `Math.random`, no clock); ordering ties by `routeHash(card id)` from `globe/src/audio/theory.ts`.
- Episodes only in the verse: bars 8-23 of the 64-bar form (intro 0-7, verse 8-23, build 24-31, chorus 32-51, break 52-55, outro 56-63), read from `FORM`, never hard-coded; verse = four blocks of four bars `A`=home, `B`, `C`, `D`= the first, second, third episode card: no colour → `A A A A`; 1 → `A B A B`; 2 → `A B A C`; 3 → `A B C D`.
- Episode cards: the cards of the coloured routes (`plan.perRoute[i] !== plan.main`), counted by number of routes, most first, ties by `routeHash(card.id)` ascending, at most three.
- Spotlight: the routes whose card is the episode card play at ×1.15, all other routes at ×0.85 (velocity, through `push`'s existing clamp). Bridge: the last bar of each episode-plan block (bars 11, 15, 19, 23) adds a kick on beat 3 and a backbeat hit on beat 3.5 when those roles exist. The tempo and the chord progression never change.
- A piece without colours (one region, or fewer than two routes) and every bar outside the verse must be byte-identical to the piece composed before this plan (golden checks in Task 2). The drone, the key lift, humanize, pan and wet of phase A keep working unchanged.
- No deploy, no push. The credits page stays unpublished. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add` explicit paths only (never `git add -A`; `.claude/`, `tmp-music-v1/` and the three experiment scripts under `scripts/samples/` stay uncommitted).
- Work on branch `feat/ui-v2` from `/Users/okilavuz/Desktop/omer_works/DataRoute`. Type-check `cd globe && npx tsc --noEmit` (silent); tests `npm --prefix globe test` (known flaky: `groove.test.ts`, re-run alone).

## File Structure

| File | Responsibility |
|---|---|
| `globe/src/personal/episodes.ts` (create) | `episodeCards`, `episodeAt`, `EPISODE_CAP`, `VERSE_BLOCK` |
| `globe/src/personal/compose.ts` (modify) | `grooveOf(card)`, the per-bar episode lookup, spotlight, fills, `PersonalStyle.episodes` |
| `globe/test/personal-episodes.test.ts` (create) | unit tests of `episodes.ts` and the composed piece |
| `docs/music-data-mapping.md`, `docs/superpowers/specs/2026-10-25-music-phase-b-design.md` (modify) | the two new mapping rows, the spec correction |

---

### Task 1: `episodes.ts` (pure) with tests

**Files:**
- Create: `globe/src/personal/episodes.ts`, `globe/test/personal-episodes.test.ts`

**Interfaces:**
- Produces: `export const EPISODE_CAP = 3`; `export const VERSE_BLOCK = 4`; `export function episodeCards(plan: CardPlan): GenreCard[]`; `export function episodeAt(bar: number, verseFirst: number, cards: GenreCard[]): { card: GenreCard | null; blockEnd: boolean; block: number }` (`block` = 0-3 inside the verse, -1 outside; `card` null = home; `blockEnd` true on the last bar of each of the four blocks).
- Consumes: `CardPlan`, `GenreCard` from `./genres`; `routeHash` from `../audio/theory`.

- [ ] **Step 1: Write the failing tests** — `globe/test/personal-episodes.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CARDS, planCards, type CardPlan, type GenreCard } from "../src/personal/genres";
import { EPISODE_CAP, episodeAt, episodeCards } from "../src/personal/episodes";
import { buildRoutes } from "../src/personal/routes";

const card = (id: string): GenreCard => CARDS.find((c) => c.id === id)!;
const plan = (main: string, per: string[]): CardPlan => ({ main: card(main), perRoute: per.map(card) });

describe("episodeCards", () => {
  it("is empty when no route is coloured", () => {
    expect(episodeCards(plan("anatolian", ["anatolian", "anatolian"]))).toEqual([]);
  });
  it("orders the colours by their number of routes, most first, and counts only coloured routes", () => {
    const got = episodeCards(plan("anatolian", ["eastasia", "westafrica", "eastasia", "anatolian", "eastasia", "westafrica"]));
    expect(got.map((c) => c.id)).toEqual(["eastasia", "westafrica"]);
  });
  it("keeps at most three colours and breaks ties by the hash of the card id the same way every time", () => {
    const per = ["eastasia", "westafrica", "persian", "tango", "salsa"];
    const a = episodeCards(plan("anatolian", per)).map((c) => c.id);
    expect(a.length).toBe(EPISODE_CAP);
    expect(episodeCards(plan("anatolian", [...per].reverse())).map((c) => c.id)).toEqual(a);
  });
});

describe("episodeAt", () => {
  const E = [card("eastasia"), card("westafrica"), card("persian")];
  const ids = (n: number): (string | null)[] => {
    const cards = E.slice(0, n);
    return [8, 12, 16, 20].map((b) => episodeAt(b, 8, cards).card?.id ?? null);
  };
  it("plays the verse as A A A A, A B A B, A B A C or A B C D", () => {
    expect(ids(0)).toEqual([null, null, null, null]);
    expect(ids(1)).toEqual([null, "eastasia", null, "eastasia"]);
    expect(ids(2)).toEqual([null, "eastasia", null, "westafrica"]);
    expect(ids(3)).toEqual([null, "eastasia", "westafrica", "persian"]);
  });
  it("holds a card for the four bars of its block and marks the last bar", () => {
    const at = (b: number) => episodeAt(b, 8, E);
    expect([12, 13, 14, 15].map((b) => at(b).card?.id)).toEqual(["eastasia", "eastasia", "eastasia", "eastasia"]);
    expect([8, 9, 10, 11, 12, 15, 19, 20, 23].map((b) => at(b).blockEnd)).toEqual([false, false, false, true, false, true, true, false, true]);
    expect([8, 11, 12, 23].map((b) => at(b).block)).toEqual([0, 0, 1, 3]);
  });
  it("is home with no block outside the verse", () => {
    for (const b of [0, 7, 24, 40, 63]) expect(episodeAt(b, 8, E)).toEqual({ card: null, blockEnd: false, block: -1 });
  });
  it("works on a real plan", () => {
    const p = planCards("visited", buildRoutes(["NRT", "LOS", "GRU", "LHR"], "IST"));
    for (const c of episodeCards(p)) expect(c).not.toBe(p.main);
  });
});
```

- [ ] **Step 2: Run them and see them fail** — `npm --prefix globe test -- personal-episodes` → FAIL (module missing).

- [ ] **Step 3: Create `globe/src/personal/episodes.ts`**

```ts
import { routeHash } from "../audio/theory";
import type { CardPlan, GenreCard } from "./genres";

/** a verse of 16 bars cannot tell more than three regions without turning into a list */
export const EPISODE_CAP = 3;
/** bars of one block of the verse */
export const VERSE_BLOCK = 4;

/** which block (A = home, B, C, D = the first, second, third episode card) plays in each of the four verse blocks */
const PATTERN: Record<number, (number | null)[]> = {
  0: [null, null, null, null],
  1: [null, 0, null, 0],
  2: [null, 0, null, 1],
  3: [null, 0, 1, 2],
};

/**
 * The cards that get an episode: the cards of the coloured routes (the routes that play the card of their own destination),
 * the ones with the most routes first, ties by the hash of the card id, at most `EPISODE_CAP`.
 */
export function episodeCards(plan: CardPlan): GenreCard[] {
  const count = new Map<string, { card: GenreCard; n: number }>();
  for (const c of plan.perRoute) {
    if (c === plan.main) continue;
    const e = count.get(c.id);
    if (e) e.n++;
    else count.set(c.id, { card: c, n: 1 });
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n || routeHash(a.card.id) - routeHash(b.card.id))
    .slice(0, EPISODE_CAP)
    .map((e) => e.card);
}

/**
 * What a bar of the verse plays: `card` is the episode card (null = the home card), `blockEnd` marks the last bar of a block (the bridge
 * fill), `block` is 0-3 inside the verse and -1 outside it. `verseFirst` is the first bar of the verse in the form.
 */
export function episodeAt(bar: number, verseFirst: number, cards: GenreCard[]): { card: GenreCard | null; blockEnd: boolean; block: number } {
  const rel = bar - verseFirst;
  if (rel < 0 || rel >= 4 * VERSE_BLOCK) return { card: null, blockEnd: false, block: -1 };
  const block = Math.floor(rel / VERSE_BLOCK);
  const pick = PATTERN[Math.min(cards.length, EPISODE_CAP)][block];
  return { card: pick === null ? null : cards[pick] ?? null, blockEnd: rel % VERSE_BLOCK === VERSE_BLOCK - 1, block };
}
```

- [ ] **Step 4: Run the tests and see them pass** — `npm --prefix globe test -- personal-episodes` and `cd globe && npx tsc --noEmit`. The test "keeps at most three colours…" depends on the five card ids having different hashes; if two collide, say so and pick other card ids.

- [ ] **Step 5: Commit**

```bash
git add globe/src/personal/episodes.ts globe/test/personal-episodes.test.ts
git commit -m "feat(personal): region episodes: which cards get a verse block and which card sounds in a bar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Episodes in `composePiece`

**Files:**
- Modify: `globe/src/personal/compose.ts`
- Test: `globe/test/personal-episodes.test.ts` (append)

**Interfaces:**
- Consumes: `episodeCards`, `episodeAt` (Task 1); `GenreCard` type; the existing `plan`, `st`, `FORM`, `BARS`, `role`, `slots`, `hits`, `strong`, `swingAmt`, `motifs`, `push`, `v`, bar loop of `composePiece`.
- Produces: `PersonalStyle.episodes?: string[]` (the card ids of the episode cards).

- [ ] **Step 0: Capture the golden baseline BEFORE any edit**

Write a throwaway script (not committed) that, on the current code, prints `routeHash(JSON.stringify(notes))` for: (a) `composePiece(mode, buildRoutes(places, "IST"))` for the one-region trips `["ESB","ADB","AYT","TZX"]` and `["ESB","ADB","AYT","TZX","VAN","GZT"]` in both modes (these have no colours); (b) the notes of `composePiece("visited", buildRoutes(["NRT","LOS","GRU","LHR","DEL","CAI"], "IST"))` that lie OUTSIDE the verse (`t < 8 * bar || t >= 24 * bar` with `bar = 240 / bpm`), and the same for `"wish"` and for the trip `["IKA","NRT","JFK","LOS","SYD","GRU"]` in `visited`. Check first with `planCards` that the coloured trips really have colours (`episodeCards(plan).length >= 1`); pick other places if not, and record how many episode cards each has. Keep the printed numbers: they become constants in the test below.

- [ ] **Step 1: Write the failing tests** — append to `globe/test/personal-episodes.test.ts`

```ts
import { composePiece } from "../src/personal/compose";
import { routeHash } from "../src/audio/theory";

// GOLDEN: hashes captured with the code BEFORE the episodes (Step 0); fill in the numbers the throwaway script printed
const GOLDEN_NO_COLOUR: [string, "visited" | "wish", number][] = [
  // [places joined by ",", mode, hash of JSON.stringify(notes)]
];
const GOLDEN_OUTSIDE_VERSE: [string, "visited" | "wish", number][] = [
  // [places joined by ",", mode, hash of JSON.stringify(notes outside bars 8-23)]
];
const routesOf = (places: string): ReturnType<typeof buildRoutes> => buildRoutes(places.split(","), "IST");
const outside = (p: ReturnType<typeof composePiece>): typeof p.notes => {
  const bar = 240 / p.bpm;
  return p.notes.filter((n) => n.t < 8 * bar || n.t >= 24 * bar);
};

describe("episodes in a piece: what must not change", () => {
  it("has golden hashes for both kinds of piece", () => {
    expect(GOLDEN_NO_COLOUR.length).toBeGreaterThanOrEqual(4);
    expect(GOLDEN_OUTSIDE_VERSE.length).toBeGreaterThanOrEqual(3);
  });
  it("a piece without colours is exactly the piece of before", () => {
    for (const [places, mode, h] of GOLDEN_NO_COLOUR) expect(routeHash(JSON.stringify(composePiece(mode, routesOf(places)).notes)), places).toBe(h);
  });
  it("every note outside the verse is exactly the note of before", () => {
    for (const [places, mode, h] of GOLDEN_OUTSIDE_VERSE) expect(routeHash(JSON.stringify(outside(composePiece(mode, routesOf(places))))), places).toBe(h);
  });
});

describe("episodes in a piece: what changes in the verse", () => {
  const places = "NRT,LOS,GRU,LHR,DEL,CAI";
  const routes = routesOf(places);
  const p = composePiece("visited", routes);
  const bar = 240 / p.bpm;
  const inBars = (a: number, b: number) => p.notes.filter((n) => n.show !== false && n.t >= a * bar - 0.05 && n.t < b * bar - 0.05);
  it("records the episode cards in the style", () => {
    const eps = episodeCards(planCards("visited", routes)).map((c) => c.id);
    expect(eps.length).toBeGreaterThanOrEqual(1);
    expect(p.style.episodes).toEqual(eps);
  });
  it("brings the voices of the episode region forward and the others back (x1.15 against x0.85)", () => {
    const plan = planCards("visited", routes);
    const e = episodeCards(plan)[0];
    const block = [12, 16].map((b) => ({ b, c: episodeAt(b, 8, episodeCards(plan)).card })).find((x) => x.c)!;
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    const mine = inBars(block.b, block.b + 4).filter((n) => plan.perRoute[n.route] === block.c);
    const others = inBars(block.b, block.b + 4).filter((n) => plan.perRoute[n.route] !== block.c);
    expect(mine.length).toBeGreaterThan(4);
    expect(others.length).toBeGreaterThan(4);
    // the same kind of voice would be needed for an exact ratio: assert the direction and a clear gap
    expect(mean(mine.map((n) => n.vel)) / mean(others.map((n) => n.vel))).toBeGreaterThan(1.1);
    expect(e).toBeTruthy();
  });
  it("ends every verse block with a drum fill: a kick on beat 3 and a backbeat on beat 3.5", () => {
    const beat = bar / 4;
    const fill = (b: number): number => inBars(b, b + 1).filter((n) => Math.abs(((n.t - b * bar) / beat) - 3.5) < 0.05 && n.d < beat * 0.3).length;
    expect([11, 15, 19, 23].filter((b) => fill(b) > 0).length).toBeGreaterThanOrEqual(2);
    expect(fill(9) + fill(10)).toBe(0);
  });
  it("changes the rhythm of the groove inside an episode: the onsets of the lowest voice differ from the home blocks", () => {
    const beat = bar / 4;
    const onsets = (b: number): string => {
      const notes = inBars(b, b + 1);
      const low = Math.min(...notes.map((n) => n.freq));
      return notes.filter((n) => n.freq === low).map((n) => ((n.t - b * bar) / beat).toFixed(1)).join(",");
    };
    const home = onsets(9);
    const eps = [12, 16, 20].filter((b) => episodeAt(b, 8, episodeCards(planCards("visited", routes))).card).map(onsets);
    expect(eps.some((o) => o !== home)).toBe(true);
  });
  it("is deterministic and keeps the invariants (no negative times, no NaN, notes of a route in order)", () => {
    expect(JSON.stringify(composePiece("visited", routes).notes)).toBe(JSON.stringify(p.notes));
    for (const n of p.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite)).toBe(true);
    }
  });
});
```
(The throwaway-baseline numbers go into the two GOLDEN arrays. If the "lowest voice onsets" or "fill" tests turn out unstable because of humanize or the instruments of that selection, replace the helper with a more direct one that identifies the bass route (`role` is not exposed: use the route with the longest total note duration among non-drone notes with the lowest mean pitch) and say so in the report; keep each assertion's meaning. If the spotlight mean ratio is below 1.1 only because the two groups play different roles (a bass note is louder than a hat), compare the SAME route's mean velocity in an episode block against its mean in the home block of the verse instead (route of the episode card: ×1.15 in its block, ×0.85 in the other blocks) and say so.)

- [ ] **Step 2: Run them and see them fail** — `npm --prefix globe test -- personal-episodes` → the golden tests may PASS already (they describe unchanged things), the "what changes" tests FAIL (`p.style.episodes` undefined, no spotlight, no fills).

- [ ] **Step 3: The groove helper and the episode lookup** — `compose.ts`

Add imports `import { episodeAt, episodeCards } from "./episodes";` and `import type { GenreCard } from "./genres";` (merge with the existing `./genres` import). In `PersonalStyle` add:

```ts
  /** the cards that get a block of the verse (episodes.ts), in the order they are told */
  episodes?: string[];
```
Replace the block that builds `fig`, `figTotal`, `slots`, `hits`, `strong`, `swingAmt` (the lines under the comment "the groove of one bar: the figure of the main card, stretched to four beats") by:

```ts
  // the groove of one bar: the figure of a card, stretched to four beats (the main card's, or an episode card's in the verse)
  const grooveOf = (card: GenreCard) => {
    const fig = card.cell;
    const figTotal = fig.reduce((x, y) => x + Math.abs(y), 0);
    const gs: { start: number; len: number; hit: boolean; accent: number }[] = [];
    let at = 0;
    fig.forEach((c, k) => {
      const len = (Math.abs(c) / figTotal) * 4;
      gs.push({ start: at, len, hit: c > 0, accent: card.accent?.[k] || 1 });
      at += len;
    });
    const gh = gs.filter((x) => x.hit);
    return { slots: gs, hits: gh, strong: gh.filter((x, k) => k === 0 || x.accent >= 1.1).slice(0, 4), swing: card.swing ?? st.swing };
  };
  const main = grooveOf(plan.main);
  const { slots, hits, strong } = main;
  const swingAmt = main.swing;
  // region episodes: the verse tells the regions of the trip, each with the groove of its own card
  const eps = episodeCards(plan);
  style.episodes = eps.map((c) => c.id);
  const verseFirst = FORM.slice(0, FORM.findIndex(([name]) => name === "verse")).reduce((s, [, m]) => s + m, 0);
  const grooves = new Map<string, ReturnType<typeof grooveOf>>(eps.map((c) => [c.id, grooveOf(c)]));
```
(`slots`, `hits`, `strong`, `swingAmt` keep their names and values, so the motif builder and the tune code are untouched.)

- [ ] **Step 4: Use it in the bar loop** — `compose.ts`

At the top of the bar loop body (after `const full = …`) add:

```ts
    const ep = episodeAt(b, verseFirst, eps);
    const g = ep.card ? grooves.get(ep.card.id)! : main;
```
Inside the route loop, directly after `const r = routes[i];` add the spotlight and use it for every velocity of the route's notes:

```ts
      // the voices of the region whose turn it is come forward, the others step back
      const spot = ep.card ? (plan.perRoute[i] === ep.card ? 1.15 : 0.85) : 1;
      const vs = (x: number): number => v(x) * spot;
```
and replace EVERY `v(` call inside the route loop (pad, bass, tune, hook, pluck, backbeat, kick, hat pushes) by `vs(`; the drone block after the route loop keeps `v(`. Then, inside the route loop:

- **bass:** use `g.strong` and `g.slots` instead of `strong` and `slots` (`const roots = g.strong.length ? g.strong : [g.slots[0]];`).
- **hook (non-tune):** use `g.slots` instead of `slots` in `slots.forEach(...)`, `slots[k + 1]`, and `g.swing` instead of `swingAmt` in the push; guard the motif index: `m[hi % m.length]` (the episode figure may have more hits than the motif).
- **pluck:** use `g.swing` instead of `swingAmt`.
- **kick:** replace the beats line by

```ts
        const epBeats = ep.card ? [...new Set([0, ...g.strong.map((s) => Math.round(s.start * 4) / 4)])] : null;
        const beats = section === "build" ? [0, 1, 2, 3] : epBeats ?? [0, 2];
        if (ep.blockEnd && !beats.includes(3)) beats.push(3);
```
  (keeps the existing `forEach` that pushes each beat unchanged below it; `epBeats` positions are fractions of a beat inside the bar: `t0 + bt * beat` already handles that).
- **backbeat:** after the existing `section === "build"` line add `if (ep.blockEnd) push(i, t0 + 3.5 * beat, beat * 0.25, inst, 200, vs(0.4), phaseAt(i, b, 0.9));`
- **hat:** replace the loop line by

```ts
        if (ep.card) {
          // inside an episode the hat plays the hit places of the episode figure instead of straight eighths
          g.hits.forEach((sl, k) => push(i, t0 + sl.start * beat + (k % 2 ? g.swing * beat * 0.33 * sl.len : 0), beat * 0.2, inst, 200, vs(sl.accent >= 1.1 ? 0.3 : 0.2), phaseAt(i, b, sl.start / 4)));
        } else {
          for (let e = 0; e < 8; e++) push(i, t0 + e * 0.5 * beat + (e % 2 ? swingAmt * beat * 0.33 : 0), beat * 0.2, inst, 200, vs(e % 2 ? 0.3 : 0.2), phaseAt(i, b, e / 8));
        }
```
Do not change anything else (the tune branch, the chord/pad code, the drone, lift, humanize, space).

- [ ] **Step 5: Run the tests**

Run: `npm --prefix globe test -- personal-episodes personal personal-lift personal-drone personal-humanize personal-space personal-world` and `cd globe && npx tsc --noEmit`, then the full `npm --prefix globe test`. The golden tests must pass UNCHANGED (this proves nothing moved outside episodes): if one fails, find the cause (most likely a `v(` → `vs(` replacement in a place that is also used outside episodes with `spot ≠ 1`, or the `m[hi % m.length]` guard changing a bar outside the verse: for `hi < m.length` it is identical) and fix the code, never the golden number. Report any other existing test that changes and why.

- [ ] **Step 6: Commit**

```bash
git add globe/src/personal/compose.ts globe/test/personal-episodes.test.ts
git commit -m "feat(personal): the verse tells the regions of the trip: episode grooves, spotlight and fills

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Docs, spec correction, final check

**Files:**
- Modify: `docs/music-data-mapping.md`, `docs/superpowers/specs/2026-10-25-music-phase-b-design.md`

- [ ] **Step 1: Mapping doc** — in `docs/music-data-mapping.md` add two rows to the table (status "new"): "number of routes per destination region → which regions get an episode (the three with the most routes) and their order — the places you went most are told first" and "region of a route → the rhythm figure of its episode block and the spotlight (×1.15 for its voices, ×0.85 for the others) — where you go sounds like there, and has its moment"; and a short section "Region episodes" with the schedule table (`A A A A`, `A B A B`, `A B A C`, `A B C D` over bars 8-11, 12-15, 16-19, 20-23), what follows the episode figure (bass strong beats, the hook's rhythm, the kick's strong beats and the hat's hit positions inside episode blocks; the backbeat and the chords stay), the bridge fill (kick beat 3 and backbeat beat 3.5 on bars 11, 15, 19, 23) and "a piece without colours, and every bar outside the verse, is unchanged".
- [ ] **Step 2: Spec correction** — in the B1 section of `docs/superpowers/specs/2026-10-25-music-phase-b-design.md` correct "What changes inside an episode block", item 1: today the kick, backbeat and hat play fixed patterns, so inside an episode the bass and the hook follow the episode figure, the kick plays its strong beats, the hat its hit positions, and the backbeat stays on beats 1 and 3.
- [ ] **Step 3: Whole check** — `npm --prefix globe test`, `cd globe && npx tsc --noEmit`, `npm --prefix globe run build:personal`.
- [ ] **Step 4: Reference summary** (throwaway script/test, DELETE before committing; paste the table into the report): for the eight reference selections (`ESB,ADB,AYT`; `NRT,LOS,GRU`; the ten-place wish list `NRT,DPS,JFK,LOS,GRU,LHR,DEL,NBO,SYD,CAI`; places `CAI,AMM,BEY` home `DXB`; places `ICN,PEK,BKK` home `NRT`; `NRT,LOS,GRU,LHR,DEL,CAI`; `IKA,NRT,JFK,LOS,SYD,GRU`; one more of your choice), each in `visited` and `wish`: `style.episodes`, the verse pattern (`A A A A`, `A B A B`, …), the number of notes in bars 8-23 against the piece before this plan (from `git stash`-free means: the golden numbers or the old code from `git show HEAD~N` in a scratch copy outside the repo), and whether a fill exists in bars 11, 15, 19, 23.
- [ ] **Step 5: Commit**

```bash
git add docs/music-data-mapping.md docs/superpowers/specs/2026-10-25-music-phase-b-design.md
git commit -m "docs: region episodes in the data mapping; the spec follows the code (fixed drum patterns)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
