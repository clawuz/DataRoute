# Music B0 (original melody in the idiom of the region) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No piece plays a "relative of a known tune" any more: the hook is an original melody whose large contour is the flight's altitude and whose small motif follows the idiom of the region's card.

**Architecture:** A new pure module `idiom.ts` holds a small hand-set table per genre card and one function `walkMotif` that builds the one-bar motifs of a hook route. `composePiece` takes an options argument (`tunes`, default `false`), builds the hook motifs with `walkMotif`, and lifts the line by the altitude arc scaled by the card's `arc`.

**Tech Stack:** TypeScript, Vitest.

Spec: `docs/superpowers/specs/2026-10-25-music-b0-melody-design.md`.

> **As built** (the code is the truth; the code blocks below are the first draft): the drift is `0.6 × bias + 0.15 × dir` when `bias ≠ 0` and `0.4 × dir` otherwise; each idiom has a `cadence` plan (default `[2, 0, 2, 4]`, from the bias when the table gives none: −1 `[2, 0, 2, 0]`, +1 `[2, 2, 4, 4]`); `walkMotif` approaches the cadence from 4 hits on; bar 3 repeats bar 1 only when `cadence[0] === cadence[2]`; `phraseMotifs` builds the four bars. See `globe/src/personal/idiom.ts` and the spec.

## Global Constraints

- Deterministic (no `Math.random`, no clock): the same seeded generator `rng(routeHash(route.key + "hook" + i))` as today; hashes via `routeHash` from `globe/src/audio/theory.ts`.
- `composePiece(mode, routes, opts?: { tunes?: boolean })`: `tunes` defaults to `false`; with `false` no piece has `style.tune`, no tune branch runs and the chord progression comes from the card (`plan.main.prog`) or the common pop progressions, exactly as for a piece that had no tune before. The tune code and its tests stay (they run with `{ tunes: true }`).
- Idiom fields (`step`, `repeat`, `leaps`, `bias`, `span`, `arc`, `start`) as in the spec; walk direction `drift = 0.6 × bias + 0.15 × dir` when `bias ≠ 0`, else `0.4 × dir` (east +1), up with probability `clamp(0.5 + drift/2, 0.1, 0.9)`; every degree inside `[-2, span]`; each bar's motif ends on its cadence degree (A, B, A, B′; default `2, 0, 2, 4`, from the bias when the table gives none; bar 3 repeats bar 1 only when their cadence degrees are equal).
- Everything that is not the hook of a hook route stays as it is: pads, bass, pluck, drums, drone, key lift, episodes, humanize, pan/wet. For pieces that had NO tune before, the notes of every non-hook route must be identical to the code before this plan (proved once with a probe, Task 2).
- No deploy, no push. The credits page stays unpublished. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add` explicit paths only (never `git add -A`; `.claude/`, `tmp-music-v1/` and the three experiment scripts under `scripts/samples/` stay uncommitted).
- Work on branch `feat/ui-v2` from `/Users/okilavuz/Desktop/omer_works/DataRoute`. Type-check `cd globe && npx tsc --noEmit` (silent); tests `npm --prefix globe test` (known flaky: `groove.test.ts`, re-run alone).

## File Structure

| File | Responsibility |
|---|---|
| `globe/src/personal/idiom.ts` (create) | `Idiom`, `DEFAULT_IDIOM`, `IDIOMS`, `idiomOf`, `walkMotif`, `LOW` |
| `globe/src/personal/compose.ts` (modify) | `opts.tunes`, hook motifs from `walkMotif`, altitude arc scaled by `arc` |
| `globe/test/personal-idiom.test.ts` (create) | unit tests of `idiom.ts` |
| existing tests that rely on a tune (modify) | pass `{ tunes: true }` |
| `globe/test/personal-episodes.test.ts` (modify) | golden hashes re-captured (Task 2) |
| `docs/music-data-mapping.md`, `docs/music-genre-cards.md` (modify) | the three new rows, the idiom table |

---

### Task 1: `idiom.ts` (pure) with tests

**Files:** Create `globe/src/personal/idiom.ts`, `globe/test/personal-idiom.test.ts`.

**Interfaces:**
- Produces: `export interface Idiom { step: number; repeat: number; leaps: number[]; bias: -1 | 0 | 1; span: number; arc: number; start: number[] }`; `export const LOW = -2`; `export const DEFAULT_IDIOM: Idiom`; `export const IDIOMS: Record<string, Partial<Idiom>>`; `export const idiomOf = (card: { id: string }): Idiom`; `export function walkMotif(idiom: Idiom, hits: number, dir: 1 | -1, rnd: () => number, start: number, end: number): number[]`.

- [ ] **Step 1: Write the failing tests** — `globe/test/personal-idiom.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CARDS } from "../src/personal/genres";
import { DEFAULT_IDIOM, IDIOMS, LOW, idiomOf, walkMotif, type Idiom } from "../src/personal/idiom";

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};
const I = (o: Partial<Idiom>): Idiom => ({ ...DEFAULT_IDIOM, ...o });
const many = (idiom: Idiom, dir: 1 | -1, n = 600, hits = 8): number[][] => {
  const r = lcg(12345);
  return Array.from({ length: n }, () => walkMotif(idiom, hits, dir, r, idiom.start[0], 2));
};

describe("idiomOf", () => {
  it("gives every card an idiom with sane values", () => {
    for (const c of CARDS) {
      const i = idiomOf(c);
      expect(i.step).toBeGreaterThanOrEqual(0.3);
      expect(i.step).toBeLessThanOrEqual(0.9);
      expect(i.repeat).toBeGreaterThanOrEqual(0);
      expect(i.repeat).toBeLessThanOrEqual(0.4);
      expect(i.leaps.length).toBeGreaterThan(0);
      expect(i.span).toBeGreaterThanOrEqual(4);
      expect(i.span).toBeLessThanOrEqual(7);
      expect(i.arc).toBeGreaterThanOrEqual(1);
      expect(i.arc).toBeLessThanOrEqual(4);
      expect(i.start.every((s) => s >= LOW && s <= i.span)).toBe(true);
    }
  });
  it("names only cards that exist, and falls back to the default", () => {
    const ids = new Set(CARDS.map((c) => c.id));
    for (const id of Object.keys(IDIOMS)) expect(ids.has(id), id).toBe(true);
    expect(idiomOf({ id: "no-such-card" })).toEqual(DEFAULT_IDIOM);
  });
  it("makes makam cards descend and Hindustani ascend", () => {
    expect(idiomOf({ id: "anatolian" }).bias).toBe(-1);
    expect(idiomOf({ id: "hindustani" }).bias).toBe(1);
  });
});

describe("walkMotif", () => {
  it("is deterministic and ends on the cadence degree", () => {
    const a = walkMotif(I({}), 6, 1, lcg(7), 2, 4);
    const b = walkMotif(I({}), 6, 1, lcg(7), 2, 4);
    expect(a).toEqual(b);
    expect(a.length).toBe(6);
    expect(a[a.length - 1]).toBe(4);
    expect(a[0]).toBe(2);
  });
  it("stays inside [LOW, span]", () => {
    for (const span of [4, 6, 7]) for (const m of many(I({ span, leaps: [2, 4] }), 1)) for (const d of m) {
      expect(d).toBeGreaterThanOrEqual(LOW);
      expect(d).toBeLessThanOrEqual(span);
    }
  });
  it("copes with one hit and with many", () => {
    expect(walkMotif(I({}), 1, 1, lcg(1), 3, 0)).toEqual([0]);
    expect(walkMotif(I({}), 12, -1, lcg(1), 3, 2).length).toBe(12);
  });
  it("follows the share of steps, repeats and leaps of the idiom", () => {
    const moves = (idiom: Idiom): number[] => many(idiom, 1).flatMap((m) => m.slice(0, -1).slice(1).map((d, k) => Math.abs(d - m[k])));
    const stepwise = moves(I({ step: 0.9, repeat: 0, leaps: [3], span: 7 }));
    const leaping = moves(I({ step: 0.3, repeat: 0, leaps: [3], span: 7 }));
    const share1 = (xs: number[]): number => xs.filter((x) => x === 1).length / xs.length;
    expect(share1(stepwise)).toBeGreaterThan(share1(leaping) + 0.4);
    const rep = moves(I({ step: 0.6, repeat: 0.3, span: 7 }));
    expect(rep.filter((x) => x === 0).length / rep.length).toBeGreaterThan(0.2);
    expect(rep.filter((x) => x === 0).length / rep.length).toBeLessThan(0.4);
  });
  it("walks the way the route and the tradition pull", () => {
    const slope = (idiom: Idiom, dir: 1 | -1): number => {
      const ms = many(idiom, dir);
      return ms.reduce((s, m) => s + (m[m.length - 2] - m[0]), 0) / ms.length;
    };
    const base = I({ span: 7, repeat: 0, step: 0.7 });
    expect(slope({ ...base, bias: -1 }, -1)).toBeLessThan(-0.5);
    expect(slope({ ...base, bias: 1 }, 1)).toBeGreaterThan(0.5);
    expect(slope({ ...base, bias: 0 }, 1)).toBeGreaterThan(slope({ ...base, bias: 0 }, -1) + 0.5);
  });
});
```

- [ ] **Step 2: Run them and see them fail** — `npm --prefix globe test -- personal-idiom` → FAIL (module missing).

- [ ] **Step 3: Create `globe/src/personal/idiom.ts`**

```ts
/**
 * How a melody of a tradition moves, as a few numbers per genre card. These are HAND-SET judgements of the known character
 * of each tradition, written down as a table so that they can be tuned by listening: they are not measurements (the reference
 * statistics of the project hold scales and rhythms, not melodic intervals). The large contour of a hook is the flight's
 * altitude; the small motif rides on it and is made by `walkMotif`.
 */
export interface Idiom {
  /** share of moves that are one scale step (the rest are leaps) */
  step: number;
  /** share of moves that repeat the note */
  repeat: number;
  /** sizes, in scale degrees, a leap may have */
  leaps: number[];
  /** −1 descending seyir (Anatolian, Arabic, Persian, flamenco), 0 arch, +1 ascending (alap-like) */
  bias: -1 | 0 | 1;
  /** the highest scale degree the motif may reach */
  span: number;
  /** how many degrees the altitude of the flight lifts the line */
  arc: number;
  /** the degrees a motif may start on */
  start: number[];
}

/** the lowest scale degree a motif may reach */
export const LOW = -2;

export const DEFAULT_IDIOM: Idiom = { step: 0.65, repeat: 0.15, leaps: [2, 3], bias: 0, span: 6, arc: 3, start: [0, 2, 4] };

export const IDIOMS: Record<string, Partial<Idiom>> = {
  cinematic: { step: 0.6, repeat: 0.1, leaps: [2, 3], span: 6, arc: 3 },
  romantic: { step: 0.7, repeat: 0.05, leaps: [2, 4], span: 7, arc: 3 },
  baroque: { step: 0.75, repeat: 0.05, leaps: [2, 3], span: 7, arc: 2 },
  anatolian: { step: 0.8, repeat: 0.25, leaps: [2], bias: -1, span: 5, arc: 2, start: [3, 4, 2] },
  karsilama: { step: 0.7, repeat: 0.2, leaps: [2], bias: 0, span: 5, arc: 2, start: [0, 2, 4] },
  arabic: { step: 0.8, repeat: 0.2, leaps: [2], bias: -1, span: 6, arc: 3, start: [3, 4, 2] },
  persian: { step: 0.8, repeat: 0.25, leaps: [2], bias: -1, span: 6, arc: 3, start: [3, 4, 2] },
  hindustani: { step: 0.85, repeat: 0.3, leaps: [2], bias: 1, span: 7, arc: 4, start: [0, 2, 4] },
  eastasia: { step: 0.35, repeat: 0.1, leaps: [2, 3], span: 4, arc: 2 },
  gamelan: { step: 0.5, repeat: 0.35, leaps: [2], span: 4, arc: 1 },
  westafrica: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 4, arc: 2 },
  eastafrica: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 4, arc: 2 },
  salsa: { step: 0.55, repeat: 0.25, leaps: [2, 3], span: 6, arc: 2 },
  mariachi: { step: 0.55, repeat: 0.2, leaps: [2, 3], span: 6, arc: 2 },
  bossa: { step: 0.6, repeat: 0.15, leaps: [2, 3], span: 6, arc: 3 },
  tango: { step: 0.6, repeat: 0.15, leaps: [2, 3], bias: -1, span: 6, arc: 3 },
  flamenco: { step: 0.8, repeat: 0.3, leaps: [2], bias: -1, span: 5, arc: 2, start: [4, 3, 2] },
  celtic: { step: 0.55, repeat: 0.1, leaps: [2, 3, 4], span: 7, arc: 3 },
  nordic: { step: 0.85, repeat: 0.3, leaps: [2], span: 5, arc: 2 },
  calm: { step: 0.85, repeat: 0.3, leaps: [2], span: 5, arc: 2 },
  slavic: { step: 0.7, repeat: 0.15, leaps: [2, 3], bias: -1, span: 6, arc: 3 },
  centralasia: { step: 0.6, repeat: 0.3, leaps: [2, 3], bias: -1, span: 6, arc: 2 },
  dance: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 6, arc: 2 },
  epic: { step: 0.5, repeat: 0.1, leaps: [2, 4, 5], span: 7, arc: 4 },
  jazz: { step: 0.5, repeat: 0.1, leaps: [2, 3, 4], span: 7, arc: 3 },
  funk: { step: 0.4, repeat: 0.4, leaps: [3, 4], span: 6, arc: 2 },
  pop: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 6, arc: 3 },
};

export const idiomOf = (card: { id: string }): Idiom => ({ ...DEFAULT_IDIOM, ...(IDIOMS[card.id] ?? {}) });

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/**
 * The scale degrees of the hits of ONE bar: a walk that starts on `start`, moves by steps, repeats and leaps as the idiom says, is
 * pulled by the heading of the route (`dir`) and by the idiom's own direction (`bias`), stays inside [LOW, span] and ends on the
 * cadence degree `end`. `rnd` is a seeded generator: the same input gives the same bar.
 */
export function walkMotif(idiom: Idiom, hits: number, dir: 1 | -1, rnd: () => number, start: number, end: number): number[] {
  const out: number[] = [];
  const drift = 0.4 * dir + 0.4 * idiom.bias;
  const pUp = clamp(0.5 + drift / 2, 0.1, 0.9);
  let d = clamp(start, LOW, idiom.span);
  for (let k = 0; k < hits; k++) {
    out.push(d);
    if (rnd() < idiom.repeat) continue;
    const up = rnd() < pUp ? 1 : -1;
    const size = rnd() < idiom.step ? 1 : idiom.leaps[Math.floor(rnd() * idiom.leaps.length)];
    d += up * size;
    if (d > idiom.span) d = idiom.span - (d - idiom.span);
    if (d < LOW) d = LOW + (LOW - d);
    d = clamp(d, LOW, idiom.span);
  }
  if (out.length > 0) out[out.length - 1] = end;
  return out;
}
```

- [ ] **Step 4: Run the tests and see them pass** — `npm --prefix globe test -- personal-idiom` and `cd globe && npx tsc --noEmit`. If a statistical test is too tight for the reflection at the bounds, widen its tolerance a little and say so; never weaken an assertion to the point of passing for the wrong reason.

- [ ] **Step 5: Commit**

```bash
git add globe/src/personal/idiom.ts globe/test/personal-idiom.test.ts
git commit -m "feat(personal): idiom of a card: how its melodies move, and the walk that builds a hook motif

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The hook uses the idiom; the tunes are off

**Files:**
- Modify: `globe/src/personal/compose.ts`
- Modify: every existing test that relies on a tune playing (find them: `grep -rln "style.tune\|tune\b\|uskudar\|twinkle" globe/test`), `globe/test/personal-episodes.test.ts` (golden numbers)
- Test: `globe/test/personal-idiom.test.ts` (append)

**Interfaces:**
- Consumes: `idiomOf`, `walkMotif` (Task 1).
- Produces: `composePiece(mode: PersonalMode, routes: PersonalRoute[], opts?: { tunes?: boolean }): PersonalPiece`.

- [ ] **Step 0: Capture the baseline BEFORE any edit** — with a throwaway script (not committed) on the CURRENT code: for 40 deterministic selections (2-9 places, both modes, homes IST / another / none) compose each piece and save, outside the repo (scratch dir), the full note list as JSON together with `style.tune` and the roles of the routes (recompute the roles as `globe/test/personal-episodes.test.ts` does: `SMALL`/`BASE` by route length). You need it in Step 5 for the invariant.

- [ ] **Step 1: Write the failing tests** — append to `globe/test/personal-idiom.test.ts`

```ts
import { composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";

const SELECTIONS: [string, string | undefined][] = [
  ["NRT,LOS,GRU,LHR,DEL,CAI", "IST"], ["ESB,ADB,AYT", "IST"], ["IKA,NRT,JFK,LOS,SYD,GRU", "IST"], ["CAI,AMM,BEY", "DXB"],
  ["ICN,PEK,BKK", "NRT"], ["VIE,FCO,MXP,ZRH,BRU,WAW,PRG,BUD", "IST"], ["NRT,DPS,JFK,LOS,GRU,LHR,DEL,NBO,SYD,CAI", "IST"], ["MAD,LHR,CDG,FRA,AMS", undefined],
];
const routesOf = (s: string, home?: string) => buildRoutes(s.split(","), home);

describe("tunes are off by default", () => {
  it("no piece plays a tune unless it is asked to", () => {
    for (const [s, h] of SELECTIONS) for (const mode of ["visited", "wish"] as const) expect(composePiece(mode, routesOf(s, h)).style.tune, `${s} ${mode}`).toBeUndefined();
  });
  it("still plays one with { tunes: true } for some pieces (the tune code is kept)", () => {
    const withTune = SELECTIONS.flatMap(([s, h]) => (["visited", "wish"] as const).map((m) => composePiece(m, routesOf(s, h), { tunes: true }).style.tune)).filter(Boolean);
    expect(withTune.length).toBeGreaterThan(0);
  });
  it("is deterministic with and without the option", () => {
    const [s, h] = SELECTIONS[0];
    expect(JSON.stringify(composePiece("visited", routesOf(s, h)).notes)).toBe(JSON.stringify(composePiece("visited", routesOf(s, h)).notes));
  });
});

describe("the hook is an original melody of the idiom", () => {
  it("has no NaN or out-of-range notes over many selections, with and without tunes", () => {
    for (const [s, h] of SELECTIONS) for (const mode of ["visited", "wish"] as const) for (const tunes of [false, true]) {
      const p = composePiece(mode, routesOf(s, h), { tunes });
      for (const n of p.notes) expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite), `${s} ${mode}`).toBe(true);
    }
  });
});
```
(Add a test that proves the motif source changed: pick two selections whose hook route's card has `bias` −1 and +1 respectively if you can find them cheaply (e.g. a hook route with the Anatolian card vs the Hindustani card: use `planCards` and the roles to find the hook route), and assert that the mean pitch slope of the hook notes over bars 8-15 of the descending card is lower than that of the ascending card; if no robust pair exists, replace by a test that composing the same selection with the `anatolian` idiom bias changed is impossible in production code and rely on the unit tests: say so in the report.)

- [ ] **Step 2: Run them and see them fail** — `npm --prefix globe test -- personal-idiom` → the tune tests FAIL (`style.tune` still set for some pieces; the options argument is not accepted).

- [ ] **Step 3: Edit `compose.ts`**

1. Imports: `import { idiomOf, walkMotif } from "./idiom";`.
2. Signature: `export function composePiece(mode: PersonalMode, routes: PersonalRoute[], opts: { tunes?: boolean } = {}): PersonalPiece {` — and the line `const tune = tuneFor(plan.main, mode, routes);` becomes `const tune = opts.tunes ? tuneFor(plan.main, mode, routes) : null;` (keep `if (tune) style.tune = tune.id;`). Do NOT change `composeSolo` or the `routes.length === 1` early return (they do not use tunes).
3. Replace the `motifs` block (the `routes.map((r, i) => { if (role[i] !== "hook") return null; const hh = ...; const make = (end) => {... random walk ...}; return [make(2), make(0), make(2), make(4)] ... })`) by:

```ts
  const motifs = routes.map((r, i) => {
    if (role[i] !== "hook") return null;
    const idiom = idiomOf(plan.perRoute[i]);
    const rnd = rng(routeHash(r.key + "hook" + i));
    const dir: 1 | -1 = r.toLon >= r.fromLon ? 1 : -1;
    // each bar's motif is a walk of the idiom of the route's own card, pulled by the heading of the route; it ends on the cadence degree
    const make = (end: number): number[] =>
      walkMotif(idiom, hits.length, dir, rnd, idiom.start[Math.floor(rnd() * idiom.start.length)] + (occ[i] % 2) * 2, end);
    return [make(2), make(0), make(2), make(4)] as number[][]; // four bars: A B A B′
  });
```
4. In the hook loop replace the altitude lift `const lift = Math.round((altitudeFt(phaseAt(i, b, sl.start / 4), r.distKm) / 39000) * 3);` by `... / 39000) * idiomOf(plan.perRoute[i]).arc);` (compute `idiomOf(plan.perRoute[i]).arc` once per route outside the bar loop into an `arcOf` array and use that).
5. Update the doc comment of `composePiece`/the hook if it talks about tunes.

- [ ] **Step 4: Move the tune tests to the option** — every existing test that expects a tune to play (found with the grep) passes `{ tunes: true }` to `composePiece`; do not change what they assert. Run the whole suite and fix only what the option or the new motifs legitimately change (report each).

- [ ] **Step 5: Prove the invariant, then re-capture the goldens**

With a throwaway script (deleted afterwards) compare, for the 40 baseline selections of Step 0 that had NO tune in the base (`style.tune` undefined), the new `composePiece(mode, routes)` against the baseline: the notes of every route that is NOT a hook route must be IDENTICAL (JSON), and the notes of hook routes must differ for most of them. Print the counts in the report. For pieces that HAD a tune in the base the chord progression also changes (the tune forced one): do not compare those.
The golden hashes in `globe/test/personal-episodes.test.ts` (`GOLDEN_NO_COLOUR`, `GOLDEN_NO_COLOUR_DRUMS`, `GOLDEN_OUTSIDE_VERSE`) change legitimately because the hook changed. Re-capture them with the NEW code (a throwaway script printing the hashes), replace the numbers, and put one comment above them: `// re-captured at music B0 (the hook is an original melody now); the invariant "only hook routes' notes changed" was checked against the code before`. The test's purpose from now on is a regression guard for the episodes and the fills.

- [ ] **Step 6: Run everything** — `npm --prefix globe test` (flaky `groove`: re-run alone), `cd globe && npx tsc --noEmit`. Probe a few hundred selections (throwaway): 0 NaN, every note in its instrument's range (`limitsOf`), no negative times.

- [ ] **Step 7: Commit**

```bash
git add globe/src/personal/compose.ts globe/test
git commit -m "feat(personal): the hook is an original melody of the idiom of its region; the tunes are off by default

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Docs and a melody printout

**Files:** Modify `docs/music-data-mapping.md`, `docs/music-genre-cards.md`.

- [ ] **Step 1:** `docs/music-data-mapping.md`: add the three rows of the spec's data table (with the "Where" cell: `compose.ts`, `idiom.ts`) and a short section "The hook's melody": the contour from the altitude (size = the card's `arc`), the motif walk and its drift formula (`0.6 × bias + 0.15 × dir`, or `0.4 × dir` without a bias; up with probability `clamp(0.5 + drift/2, 0.1, 0.9)`), the cadence plan (default `2, 0, 2, 4`), the statement that the idioms are hand-set judgements and are tuned by ear, and that tunes are off by default (`composePiece(..., { tunes: true })` plays them; nothing on the site does). Also remove or correct any sentence in the docs that says half of the pieces play a known tune.
- [ ] **Step 2:** `docs/music-genre-cards.md`: the idiom table (card → step, repeat, leaps, bias, span, arc, start) exactly as in `idiom.ts`.
- [ ] **Step 3: Whole check** — `npm --prefix globe test`, `cd globe && npx tsc --noEmit`, `npm --prefix globe run build:personal`.
- [ ] **Step 4: Melody printout** (throwaway script, DELETE before committing; paste into the report): for the eight selections of `personal-idiom.test.ts` in `visited`, print the hook route's scale degrees of bars 8-15 (the verse) as text (e.g. `3 3 4 3 | 2 2 3 2 | ...`), the card of that route and its bias, and the number of distinct pitches; this lets the user see whether the lines differ by region.
- [ ] **Step 5: Commit**

```bash
git add docs/music-data-mapping.md docs/music-genre-cards.md
git commit -m "docs: the hook's melody comes from the route and the idiom of its region

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
