# Music phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the piece sound more like played music without adding a note that is not a route: stereo space and reverb from the map, human timing, a key lift for trips that cross regions, and a home drone.

**Architecture:** Four small pure modules (`space.ts`, `humanize.ts`, `lift.ts`, drone helpers in `world-voices.ts`) hold the rules and are unit-tested alone; `compose.ts` calls them (pan/wet on every note, a per-bar key shift, a drone pushed through route 0, a timing pass before the drawing lengths are computed); `player.ts` plays the pan and routes notes to three reverb sends.

**Tech Stack:** TypeScript, Vitest, Web Audio.

Spec: `docs/superpowers/specs/2026-10-24-music-phase-a-design.md`.

## Global Constraints

- Everything stays deterministic: a function of the routes and mode only (no `Math.random`, no clock). Hashes come from `routeHash` in `globe/src/audio/theory.ts`.
- No note is added that does not belong to a route: the drone notes belong to route 0 and have `show: false`.
- Home = the first route's starting point (`routes[0].fromLon`). Regions = `route.region`.
- Key lift: `visited` +3 semitones, `wish` +2, only when the routes belong to two or more regions, only in the LAST 8 BARS of the chorus (FORM: intro 8, verse 16, build 8, chorus 20, break 4, outro 8 = 64 bars; the chorus is bars 32-51, so the lift is bars 44-51); the break and the outro return to the home key.
- Timing: offset `±(5 + 13 × looseness) ms`, loudness `×(1 ± 0.06)`; kick/backbeat/hat get 30% of the amount; the drone gets none; an offset never exceeds 20% of the gap to a neighbouring note of the same route and never moves a note before 0; notes of one route sounding at the same moment move together. `looseness = clamp(timeZonesSpanned / 10, 0, 1)`.
- Space: `pan = clamp(wrap(midLon − homeLon) / 100, −0.8, 0.8) × roleWidth` with widths bass 0.15, kick 0.15, backbeat 0.5, hat 0.5, pad 0.6, hook 0.85, pluck 1; `wet = (0.12 + 0.38 × clamp(distKm / 9000, 0, 1)) × roleWet` with bass and kick 0.4, others 1.
- World instruments are not added to the `Instrument` union; the credits page stays unpublished; no deploy (deploying is only `firebase deploy --only hosting:main --project omerkilavuz-9ad41` on the user's word; pushing the branch is also on the user's word).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `git add` explicit paths only (never `git add -A`; `.claude/`, `tmp-music-v1/` and the three experiment scripts under `scripts/samples/` stay uncommitted).
- Work on branch `feat/ui-v2` from `/Users/okilavuz/Desktop/omer_works/DataRoute`. Type-check: `cd globe && npx tsc --noEmit` (silent). Tests: `npm --prefix globe test` (known flaky: `groove.test.ts`, re-run alone).
- An existing test that legitimately breaks because of these rules is adjusted only if it checks something the rules change, and the change is reported; never weaken an assertion silently.

## File Structure

| File | Responsibility |
|---|---|
| `globe/src/personal/space.ts` (create) | `midLon`, `panOf`, `wetOf`, `sendOf` |
| `globe/src/personal/humanize.ts` (create) | `timeZonesSpanned`, `looseness`, `humanize` |
| `globe/src/personal/lift.ts` (create) | `liftFor`, `liftAt`, `LIFT_BARS` |
| `globe/src/personal/world-voices.ts` (modify) | `DRONE_BY_CARD`, `droneVoice` |
| `globe/src/personal/compose.ts` (modify) | `PersonalNote.pan/wet`, `PersonalStyle.lift`, calls the four modules |
| `globe/src/personal/player.ts` (modify) | pan per note, three reverb sends |
| `docs/music-data-mapping.md` (create), `docs/music-genre-cards.md` (modify) | the data → music table, the drone table |
| tests: `personal-space.test.ts`, `player-space.test.ts`, `personal-humanize.test.ts`, `personal-lift.test.ts`, `personal-drone.test.ts` | |

---

### Task 1: Space from the map (pan and reverb)

**Files:**
- Create: `globe/src/personal/space.ts`, `globe/test/personal-space.test.ts`, `globe/test/player-space.test.ts`
- Modify: `globe/src/personal/compose.ts` (`PersonalNote`, composePiece before `push`, `push`), `globe/src/personal/player.ts`

**Interfaces:**
- Produces: `midLon(r: {fromLon:number;toLon:number}): number`; `panOf(r, homeLon: number, role: SpaceRole): number`; `wetOf(r: {distKm:number}, role: SpaceRole): number`; `sendOf(wet: number): 0 | 1 | 2` (wet < 0.25 → 0, < 0.4 → 1, else 2); `type SpaceRole = "pad"|"bass"|"hook"|"pluck"|"backbeat"|"kick"|"hat"`. `PersonalNote` gets `pan?: number` and `wet?: number`.

- [ ] **Step 1: Write the failing tests** — `globe/test/personal-space.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";
import { destinationOf } from "../src/personal/destinations";
import { midLon, panOf, sendOf, wetOf } from "../src/personal/space";

const west = { fromLon: 28.8, toLon: -73.8, distKm: 8000 };
const east = { fromLon: 28.8, toLon: 140.4, distKm: 9000 };

describe("space from the map", () => {
  it("finds the middle of a route the short way round, also over the date line", () => {
    expect(midLon(west)).toBeCloseTo(-22.5, 0);
    expect(Math.abs(Math.abs(midLon({ fromLon: 170, toLon: -170 })) - 180)).toBeLessThan(1);
  });
  it("puts the west on the left and the east on the right, like the map", () => {
    expect(panOf(west, 28.8, "pluck")).toBeLessThan(-0.4);
    expect(panOf(east, 28.8, "pluck")).toBeGreaterThan(0.4);
    expect(Math.abs(panOf(east, 28.8, "pluck"))).toBeLessThanOrEqual(0.8);
  });
  it("keeps the bass and the kick near the centre and the melody wide", () => {
    for (const r of [west, east]) {
      expect(Math.abs(panOf(r, 28.8, "bass"))).toBeLessThan(Math.abs(panOf(r, 28.8, "hook")));
      expect(Math.abs(panOf(r, 28.8, "kick"))).toBeLessThan(Math.abs(panOf(r, 28.8, "pluck")));
    }
  });
  it("gives longer routes more room and the bass less", () => {
    expect(wetOf({ distKm: 9000 }, "pluck")).toBeGreaterThan(wetOf({ distKm: 500 }, "pluck"));
    expect(wetOf({ distKm: 9000 }, "bass")).toBeLessThan(wetOf({ distKm: 9000 }, "pluck"));
    expect(wetOf({ distKm: 20000 }, "pluck")).toBeCloseTo(0.5, 6);
  });
  it("sorts a wet amount into one of three sends", () => {
    expect([sendOf(0.1), sendOf(0.3), sendOf(0.5)]).toEqual([0, 1, 2]);
  });
  it("is on every note of a composed piece, west left, east right", () => {
    const routes = buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST");
    const p = composePiece("visited", routes);
    const home = destinationOf("IST")!.lon;
    expect(p.notes.every((n) => typeof n.pan === "number" && Math.abs(n.pan) <= 0.8 && typeof n.wet === "number" && n.wet >= 0 && n.wet <= 0.5)).toBe(true);
    const sign = (to: string): number[] => p.notes.filter((n) => routes[n.route].to === to).map((n) => n.pan!);
    expect(Math.min(...sign("JFK"))).toBeLessThan(0);
    expect(Math.max(...sign("JFK"))).toBeLessThanOrEqual(0);
    expect(Math.max(...sign("NRT"))).toBeGreaterThan(0);
    expect(Math.min(...sign("NRT"))).toBeGreaterThanOrEqual(0);
    expect(home).toBeGreaterThan(0);
  });
});
```
(`buildRoutes(["JFK","NRT","LHR","DEL"], "IST")` gives routes whose `to` is the place; if a route's `to` is `IST` for a returning leg, filter with `routes[n.route].from === place || routes[n.route].to === place` and keep the sign assertions; adjust the helper accordingly and say so in the report.)

And `globe/test/player-space.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../src/audio/sampler", () => ({
  createSampler: () => ({ use: async () => {}, has: () => true, ensure: async () => {}, dispose: () => {} }),
  setActiveSampler: () => {},
}));
vi.mock("../src/audio/instruments", () => ({ playNote: (...a: unknown[]) => void spy.calls.push(a) }));

import { createPersonalPlayer } from "../src/personal/player";

const node = () => ({ gain: { value: 0, setTargetAtTime() {} }, connect() {}, threshold: {}, ratio: {} });
const ctx = () =>
  ({ currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createDynamicsCompressor: node, createConvolver: () => ({ connect() {} }),
     createBuffer: () => ({ getChannelData: () => new Float32Array(30000) }), resume: async () => {}, close: async () => {} }) as unknown as AudioContext;
const note = (t: number, pan: number, wet: number) => ({ t, d: 1, freq: 440, vel: 1, instrument: "PNO", pan, wet });

describe("player: space", () => {
  beforeEach(() => { spy.calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("plays each note at its pan and sends it to the reverb bus of its wetness", async () => {
    const pl = createPersonalPlayer(ctx());
    pl.play({ notes: [note(0, -0.5, 0.1), note(0.1, 0.6, 0.5), note(0.2, 0.1, 0.12)], duration: 4 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    const [a, b, c] = spy.calls;
    expect((a[3] as { pan: number }).pan).toBe(-0.5);
    expect((b[3] as { pan: number }).pan).toBe(0.6);
    expect(a[1]).toBe(c[1]); // the same send: both dry-ish
    expect(a[1]).not.toBe(b[1]); // the wet one goes elsewhere
    pl.dispose();
  });
  it("plays a note without pan and wet (a solo piece) in the middle", async () => {
    const pl = createPersonalPlayer(ctx());
    pl.play({ notes: [{ t: 0, d: 1, freq: 440, vel: 1, instrument: "PNO" }], duration: 4 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    expect((spy.calls[0][3] as { pan: number }).pan).toBe(0);
    pl.dispose();
  });
});
```
(In `player-space.test.ts` `createGain` must return a distinct object per call so buses can be told apart: `node` already does. The player must call `createGain` once per bus.)

- [ ] **Step 2: Run them and see them fail**

Run: `npm --prefix globe test -- personal-space player-space`
Expected: FAIL (`../src/personal/space` does not exist).

- [ ] **Step 3: Create `globe/src/personal/space.ts`**

```ts
/**
 * Space from the map. A route's place in the stereo field is where its middle lies east or west of home (like the
 * map: west left, east right); its reverb is how far it goes (far = more room). Bass and kick stay near the centre and
 * dry, the melody is wide. Pure functions of the route: nothing here is random.
 */
export type SpaceRole = "pad" | "bass" | "hook" | "pluck" | "backbeat" | "kick" | "hat";

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** a longitude difference brought into −180…180 */
const wrap180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

/** longitude of the middle of a route, going the short way round */
export const midLon = (r: { fromLon: number; toLon: number }): number => wrap180(r.fromLon + wrap180(r.toLon - r.fromLon) / 2);

const WIDTH: Record<SpaceRole, number> = { bass: 0.15, kick: 0.15, backbeat: 0.5, hat: 0.5, pad: 0.6, hook: 0.85, pluck: 1 };
const WET_OF_ROLE: Record<SpaceRole, number> = { bass: 0.4, kick: 0.4, backbeat: 1, hat: 1, pad: 1, hook: 1, pluck: 1 };

/** −1 (left) … 1 (right) */
export const panOf = (r: { fromLon: number; toLon: number }, homeLon: number, role: SpaceRole): number =>
  clamp(wrap180(midLon(r) - homeLon) / 100, -0.8, 0.8) * WIDTH[role];

/** 0 (dry) … 0.5 (wet) */
export const wetOf = (r: { distKm: number }, role: SpaceRole): number => (0.12 + 0.38 * clamp(r.distKm / 9000, 0, 1)) * WET_OF_ROLE[role];

/** the reverb send (0 dry-ish, 1 middle, 2 wet) a note with this wetness is played into */
export const sendOf = (wet: number): 0 | 1 | 2 => (wet < 0.25 ? 0 : wet < 0.4 ? 1 : 2);
```

- [ ] **Step 4: Put pan and wet on the notes** — `compose.ts`

At the top add `import { panOf, wetOf } from "./space";`. In `PersonalNote` add:

```ts
  /** stereo position −1…1 from where the route lies east or west of home (space.ts); absent: the middle */
  pan?: number;
  /** how much reverb the note gets 0…0.5, from the length of the route (space.ts); absent: the middle send */
  wet?: number;
```
In `composePiece`, directly after `const role: PopRole[] = …; order.forEach(…)` (where `role` is filled) add:

```ts
  // space from the map: where each route lies east or west of home, and how far it goes
  const homeLon = routes[0].fromLon;
  const panFor = routes.map((r, i) => panOf(r, homeLon, role[i]));
  const wetFor = routes.map((r, i) => wetOf(r, role[i]));
```
and in `push` replace the pushed object by:

```ts
    notes.push({ t, d, instrument, freq: fit(f, instrument), vel: clamp(vel, 0.05, 1), key: routes[i].key, route: i, via: i, alt: altitudeFt(p, routes[i].distKm), pan: panFor[i], wet: wetFor[i] });
```

- [ ] **Step 5: The player** — `player.ts`

Read the audio graph near the top of `createPersonalPlayer` (the `bus`, `dry`, `conv`, `wet` nodes). Change it so that three note buses exist, each going dry to the existing `bus` and wet through its own send gain into a new `busWet` that feeds the convolver (today `bus` feeds both):

```ts
  // three reverb sends: a note goes to the one that matches its wetness (space.ts); the dry path is the same for all
  const SEND_LEVEL = [0.35, 1, 1.8]; // relative to the single send of before (the middle one is today's sound)
  const busWet = ctx.createGain();
  busWet.connect(conv);
  const noteBus = SEND_LEVEL.map((level) => {
    const nb = ctx.createGain();
    nb.connect(bus);
    const send = ctx.createGain();
    send.gain.value = level;
    nb.connect(send);
    send.connect(busWet);
    return nb;
  });
```
Remove the old direct `bus.connect(conv)`; keep `conv.connect(wet)`. `setSynthMuted` must set the gain of BOTH `bus` and `busWet` (`bus.gain.setTargetAtTime(m ? 0 : 1, …)` and the same for `busWet`). In the scheduling code replace
`playNote(ctx, bus, { when, instrument: n.instrument, …}, { gainScale: 1, cutoffScale: 1, pan: 0 })` by

```ts
      playNote(ctx, noteBus[sendOf(n.wet ?? 0.3)], { when, instrument: n.instrument, freq: n.freq, vel: n.vel, kind: "arr", durSec: n.d }, { gainScale: 1, cutoffScale: 1, pan: n.pan ?? 0 });
```
and add `import { sendOf } from "./space";`. `n.wet ?? 0.3` is the middle send. Keep every other node and the mute behaviour of the existing tests (`player-loading.test.ts`) working.

- [ ] **Step 6: Run the tests**

Run: `npm --prefix globe test -- personal-space player-space player-loading personal` then `cd globe && npx tsc --noEmit`
Expected: PASS, tsc silent. If an existing test breaks only because notes now carry `pan`/`wet`, report it before changing it.

- [ ] **Step 7: Commit**

```bash
git add globe/src/personal/space.ts globe/src/personal/compose.ts globe/src/personal/player.ts globe/test/personal-space.test.ts globe/test/player-space.test.ts
git commit -m "feat(personal): space from the map: pan from the longitude of a route, reverb from its length

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Human timing

**Files:**
- Create: `globe/src/personal/humanize.ts`, `globe/test/personal-humanize.test.ts`
- Modify: `globe/src/personal/compose.ts` (a role map filled in `push`, the call before the `drawDur` loop)

**Interfaces:**
- Produces: `timeZonesSpanned(routes: {fromLon:number;toLon:number}[]): number`; `looseness(zones: number): number`; `humanize(notes: PersonalNote[], o: { loose: number; tight?: (n: PersonalNote) => boolean; skip?: (n: PersonalNote) => boolean }): void` (mutates `t` and `vel`).
- Consumes: `PersonalNote` (Task 1 added fields), `routeHash`.

- [ ] **Step 1: Write the failing tests** — `globe/test/personal-humanize.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { PersonalNote } from "../src/personal/compose";
import { composePiece } from "../src/personal/compose";
import { humanize, looseness, timeZonesSpanned } from "../src/personal/humanize";
import { buildRoutes } from "../src/personal/routes";

const mk = (route: number, t: number, vel = 0.5): PersonalNote => ({ t, d: 0.2, instrument: "PNO", freq: 440, vel, key: `R${route}`, route, via: route, alt: 0 });
const grid = (n: number, gap: number, route = 0): PersonalNote[] => Array.from({ length: n }, (_, k) => mk(route, 1 + k * gap));
const copy = (a: PersonalNote[]): PersonalNote[] => a.map((n) => ({ ...n }));
const meanAbs = (a: PersonalNote[], b: PersonalNote[]): number => a.reduce((s, n, i) => s + Math.abs(n.t - b[i].t), 0) / a.length;

describe("time zones", () => {
  it("measures the span of the end points in hours, over the date line too", () => {
    expect(timeZonesSpanned([{ fromLon: 28.8, toLon: -73.8 }])).toBeCloseTo(102.6 / 15, 1);
    expect(timeZonesSpanned([{ fromLon: 170, toLon: -170 }])).toBeCloseTo(20 / 15, 1);
    expect(timeZonesSpanned([{ fromLon: 10, toLon: 10 }])).toBe(0);
  });
  it("turns them into a looseness between 0 and 1", () => {
    expect(looseness(0)).toBe(0);
    expect(looseness(5)).toBeCloseTo(0.5, 6);
    expect(looseness(30)).toBe(1);
  });
});

describe("humanize", () => {
  it("moves a note by a few milliseconds, never past 20% of the gap, never before zero", () => {
    const a = grid(40, 0.5);
    const b = copy(a);
    humanize(b, { loose: 1 });
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(b[i].t - a[i].t)).toBeLessThanOrEqual(0.018 + 1e-9);
      expect(Math.abs(b[i].t - a[i].t)).toBeLessThanOrEqual(0.2 * 0.5 + 1e-9);
      expect(b[i].t).toBeGreaterThanOrEqual(0);
    }
    expect(meanAbs(a, b)).toBeGreaterThan(0.003);
  });
  it("keeps a route's notes in order, even when they are close together", () => {
    const a = grid(60, 0.05);
    const b = copy(a);
    humanize(b, { loose: 1 });
    for (let i = 0; i + 1 < b.length; i++) expect(b[i + 1].t).toBeGreaterThan(b[i].t);
    for (let i = 0; i < a.length; i++) expect(Math.abs(b[i].t - a[i].t)).toBeLessThanOrEqual(0.2 * 0.05 + 1e-9);
  });
  it("moves the notes of a route that sound together, together", () => {
    const a = [mk(0, 1), mk(0, 1), mk(0, 1), mk(0, 2)];
    const b = copy(a);
    humanize(b, { loose: 1 });
    expect(b[1].t).toBe(b[0].t);
    expect(b[2].t).toBe(b[0].t);
  });
  it("changes the loudness by at most 6%", () => {
    const a = grid(40, 0.5, 3);
    const b = copy(a);
    humanize(b, { loose: 0.5 });
    for (let i = 0; i < a.length; i++) expect(Math.abs(b[i].vel / a[i].vel - 1)).toBeLessThanOrEqual(0.06 + 1e-9);
  });
  it("drifts more over more time zones, and tight notes less than the others", () => {
    const a = grid(200, 0.5);
    const loose = copy(a), calm = copy(a), tight = copy(a);
    humanize(loose, { loose: 1 });
    humanize(calm, { loose: 0 });
    humanize(tight, { loose: 1, tight: () => true });
    expect(meanAbs(a, loose)).toBeGreaterThan(meanAbs(a, calm));
    expect(meanAbs(a, tight)).toBeLessThan(meanAbs(a, loose) * 0.5);
  });
  it("leaves skipped notes alone and is the same every time", () => {
    const a = grid(30, 0.5);
    const b = copy(a), c = copy(a);
    humanize(b, { loose: 1, skip: (n) => n.t < 5 });
    humanize(c, { loose: 1, skip: (n) => n.t < 5 });
    expect(b.filter((n) => n.t < 5).every((n, i) => n.t === a[i].t && n.vel === a[i].vel)).toBe(true);
    expect(b.map((n) => n.t)).toEqual(c.map((n) => n.t));
  });
});

describe("humanize in a piece", () => {
  it("composes the same piece every time, and a far trip is looser than a near one", () => {
    const near = buildRoutes(["ESB", "ADB", "AYT", "TZX"], "IST");
    const far = buildRoutes(["JFK", "NRT", "LAX", "SYD"], "IST");
    const a = composePiece("visited", far);
    expect(JSON.stringify(composePiece("visited", far).notes)).toBe(JSON.stringify(a.notes));
    // notes on the beat grid of a bar: the farther trip leaves it more
    const off = (p: ReturnType<typeof composePiece>): number => {
      const beat = 60 / p.bpm / 4;
      return p.notes.reduce((s, n) => s + Math.abs(((n.t / beat + 0.5) % 1) - 0.5), 0) / p.notes.length;
    };
    expect(off(composePiece("visited", far))).toBeGreaterThan(off(composePiece("visited", near)) * 0.9);
  });
});
```
(The last integration assertion is deliberately loose because swing and other rules also leave the grid: if it is unstable, replace it by checking `timeZonesSpanned(far) > timeZonesSpanned(near)` and that the composed notes are not all on the exact grid for `far`; say so in the report.)

- [ ] **Step 2: Run them and see them fail** — `npm --prefix globe test -- personal-humanize` → FAIL (module missing).

- [ ] **Step 3: Create `globe/src/personal/humanize.ts`**

```ts
import { routeHash } from "../audio/theory";
import type { PersonalNote } from "./compose";

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** how many time zones (hours of longitude) the end points of the routes span, going the short way round the Earth */
export function timeZonesSpanned(routes: { fromLon: number; toLon: number }[]): number {
  const lons = routes.flatMap((r) => [r.fromLon, r.toLon]).map((x) => ((x % 360) + 360) % 360).sort((a, b) => a - b);
  if (lons.length < 2) return 0;
  let biggestGap = lons[0] + 360 - lons[lons.length - 1];
  for (let i = 1; i < lons.length; i++) biggestGap = Math.max(biggestGap, lons[i] - lons[i - 1]);
  return (360 - biggestGap) / 15;
}

/** 0 (everyone on the beat) … 1 (a trip that crosses ten time zones or more: jet lag) */
export const looseness = (zones: number): number => clamp(zones / 10, 0, 1);

export interface HumanizeOptions {
  /** 0…1, see `looseness` */
  loose: number;
  /** notes that stay tight (kick, backbeat, hat): 30% of the drift */
  tight?: (n: PersonalNote) => boolean;
  /** notes that are not touched (the drone) */
  skip?: (n: PersonalNote) => boolean;
}

const unit = (key: string): number => ((routeHash(key) % 2001) - 1000) / 1000; // −1…1, the same for the same key

/**
 * A few milliseconds of difference in time and a few percent in loudness, so that the music is played and not
 * printed. Deterministic (from the route and the moment). Notes of one route that sound at the same moment move
 * together; an offset never passes 20% of the gap to the neighbouring notes of the same route, so a route's notes
 * keep their order.
 */
export function humanize(notes: PersonalNote[], o: HumanizeOptions): void {
  const amount = (5 + 13 * clamp(o.loose, 0, 1)) / 1000;
  const byRoute = new Map<number, PersonalNote[]>();
  for (const n of notes) if (!o.skip?.(n)) byRoute.set(n.route, [...(byRoute.get(n.route) ?? []), n]);
  for (const [route, list] of byRoute) {
    const times = [...new Set(list.map((n) => n.t))].sort((a, b) => a - b);
    const offset = new Map<number, number>();
    times.forEach((t, k) => {
      const gapBefore = k > 0 ? t - times[k - 1] : Infinity;
      const gapAfter = k + 1 < times.length ? times[k + 1] - t : Infinity;
      const tightNote = list.filter((n) => n.t === t).every((n) => o.tight?.(n));
      const raw = unit(`${route}|${t.toFixed(4)}`) * amount * (tightNote ? 0.3 : 1);
      const limit = 0.2 * Math.min(gapBefore, gapAfter);
      offset.set(t, clamp(Math.max(raw, -t), -limit, limit));
    });
    for (const n of list) {
      const t0 = n.t;
      n.vel = clamp(n.vel * (1 + 0.06 * unit(`${route}|${t0.toFixed(4)}|${n.instrument}|${n.freq.toFixed(1)}`)), 0.05, 1);
      n.t = t0 + (offset.get(t0) ?? 0);
    }
  }
}
```
(`offset` is built from the ORIGINAL times of a route before any `t` is changed; the last loop applies it. If a test fails because of the `clamp(Math.max(raw, -t), -limit, limit)` expression, keep the invariants the tests state, not this exact expression.)

- [ ] **Step 4: Call it from `composePiece`** — `compose.ts`

Add `import { humanize, looseness, timeZonesSpanned } from "./humanize";`. Keep a map of the role of every pushed note: right after the `notes` array is declared add `const roleOfNote = new Map<PersonalNote, string>();` and in `push` replace `notes.push({...})` by

```ts
    const note: PersonalNote = { t, d, instrument, freq: fit(f, instrument), vel: clamp(vel, 0.05, 1), key: routes[i].key, route: i, via: i, alt: altitudeFt(p, routes[i].distKm), pan: panFor[i], wet: wetFor[i] };
    notes.push(note);
    roleOfNote.set(note, role[i]);
```
Directly before the line `// the box draws a route's notes one after another: …` (the `byRoute` / `drawDur` block) insert:

```ts
  // played, not printed: a few milliseconds and a few percent, looser the more time zones the trip crosses
  humanize(notes, {
    loose: looseness(timeZonesSpanned(routes)),
    tight: (x) => ["kick", "backbeat", "hat"].includes(roleOfNote.get(x) ?? ""),
    skip: (x) => roleOfNote.get(x) === "drone",
  });
```

- [ ] **Step 5: Run the tests** — `npm --prefix globe test -- personal-humanize personal` and `cd globe && npx tsc --noEmit`. The existing "a route's notes never overlap in the drawing" test must still pass (the drawing lengths are computed after the timing pass). Report any other test that breaks and why.

- [ ] **Step 6: Commit**

```bash
git add globe/src/personal/humanize.ts globe/src/personal/compose.ts globe/test/personal-humanize.test.ts
git commit -m "feat(personal): human timing: milliseconds of drift in time and loudness, looser over more time zones

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Key lift in the last bars of the chorus

**Files:**
- Create: `globe/src/personal/lift.ts`, `globe/test/personal-lift.test.ts`
- Modify: `globe/src/personal/compose.ts` (`PersonalStyle.lift`, the bar loop: `cr`, the tune push, the hook pitch)

**Interfaces:**
- Produces: `LIFT_BARS = 8`; `liftFor(mode: PersonalMode, regions: string[]): number` (0 when fewer than two distinct regions, else +3 for `visited`, +2 for `wish`); `liftAt(bar: number, chorusFirst: number, chorusLen: number, lift: number): number` (`lift` for the last `LIFT_BARS` bars of the chorus, 0 elsewhere). `PersonalStyle.lift?: number`.

- [ ] **Step 1: Write the failing tests** — `globe/test/personal-lift.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { LIFT_BARS, liftAt, liftFor } from "../src/personal/lift";
import { buildRoutes } from "../src/personal/routes";

describe("lift", () => {
  it("is nothing when the trip stays in one region, a relative major (+3) for a visited trip and a whole step (+2) for a wish", () => {
    expect(liftFor("visited", ["EUR", "EUR"])).toBe(0);
    expect(liftFor("visited", ["EUR", "ASI"])).toBe(3);
    expect(liftFor("wish", ["EUR", "ASI", "AME"])).toBe(2);
  });
  it("lifts only the last bars of the chorus", () => {
    const at = (b: number): number => liftAt(b, 32, 20, 3);
    expect([31, 32, 43].map(at)).toEqual([0, 0, 0]);
    expect([44, 47, 51].map(at)).toEqual([3, 3, 3]);
    expect([52, 55, 56, 63].map(at)).toEqual([0, 0, 0, 0]);
    expect(LIFT_BARS).toBe(8);
  });
});

describe("lift in a piece", () => {
  const lowest = (p: ReturnType<typeof composePiece>, bar: number): number => {
    const bt = (60 / p.bpm) * 4;
    // the drone (show: false, Task 4) is not part of the chords: only notes that are drawn count
    const inBar = p.notes.filter((n) => n.show !== false && n.t >= bar * bt - 1e-6 && n.t < (bar + 1) * bt - 1e-6);
    return 12 * Math.log2(Math.min(...inBar.map((n) => n.freq)) / 110);
  };
  const pc = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
  it("records the lift in the style: 3 across regions, 0 in one region", () => {
    expect(composePiece("visited", buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST")).style.lift).toBe(3);
    expect(composePiece("wish", buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST")).style.lift).toBe(2);
    expect(composePiece("visited", buildRoutes(["ESB", "ADB", "AYT", "TZX"], "IST")).style.lift).toBe(0);
  });
  it("sounds the same chord a step higher, then goes home", () => {
    const routes = buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST");
    const p = composePiece("visited", routes);
    // bars 40 and 44 and 56 are the first chord of the progression again: the bass note sits `lift` higher in bar 44 only
    expect(pc(lowest(p, 44) - lowest(p, 40))).toBe(3);
    expect(pc(lowest(p, 56) - lowest(p, 40))).toBe(0);
    expect(pc(lowest(p, 48) - lowest(p, 36))).toBe(3);
  });
  it("does not lift a trip inside one region", () => {
    const p = composePiece("visited", buildRoutes(["ESB", "ADB", "AYT", "TZX"], "IST"));
    expect(pc(lowest(p, 44) - lowest(p, 40))).toBe(0);
  });
});
```
(Bars 40/44/48 and 36 share chord index `b % 4 === 0`. If the progression has fewer than four distinct chords per four bars or the lowest note of a bar is a drone/pad instead of the bass, adjust which bars are compared so that equal chords are compared, keeping the assertion that the lift is `liftFor(...)` semitones modulo octaves; explain in the report.)

- [ ] **Step 2: Run them and see them fail** — `npm --prefix globe test -- personal-lift` → FAIL (module missing).

- [ ] **Step 3: Create `globe/src/personal/lift.ts`**

```ts
import type { PersonalMode } from "./codec";

/** how many bars at the end of the chorus are lifted */
export const LIFT_BARS = 8;

/**
 * The key lift of a trip that really crosses regions: a visited (minor) trip arrives in the relative major (+3
 * semitones), a wish (major) rises a whole step (+2). A trip inside one region has none.
 */
export const liftFor = (mode: PersonalMode, regions: string[]): number => (new Set(regions).size < 2 ? 0 : mode === "visited" ? 3 : 2);

/** the lift (semitones) of a bar: only the last `LIFT_BARS` bars of the chorus are lifted */
export const liftAt = (bar: number, chorusFirst: number, chorusLen: number, lift: number): number =>
  bar >= chorusFirst + chorusLen - LIFT_BARS && bar < chorusFirst + chorusLen ? lift : 0;
```

- [ ] **Step 4: Use it in `compose.ts`**

Add `import { liftAt, liftFor } from "./lift";`. In `PersonalStyle` add `/** semitones the last bars of the chorus are lifted (lift.ts): 0 when the trip stays in one region */ lift?: number;`. In `composePiece`, after `const plan = planCards(...)` is available (near `const END_T`), add:

```ts
  // the key lift: a trip across regions arrives somewhere brighter in the last bars of the chorus, then goes home
  const lift = liftFor(mode, routes.map((r) => r.region));
  style.lift = lift;
  const chorusFirst = FORM.slice(0, FORM.findIndex(([name]) => name === "chorus")).reduce((s, [, m]) => s + m, 0);
  const chorusLen = FORM.find(([name]) => name === "chorus")![1];
```
In the bar loop add at its top `const sh = st.shift + liftAt(b, chorusFirst, chorusLen, lift);` and replace `st.shift` by `sh` in exactly these three places of the loop: `const cr = chord.root + st.shift;`, the tune push `hz(KEY_ROOT + st.shift + 12 + semis)`, and the hook `let semis = KEY_ROOT + st.shift + sc[…]`. Do not touch `composeSolo`.

- [ ] **Step 5: Run the tests** — `npm --prefix globe test -- personal-lift personal personal-world` and `cd globe && npx tsc --noEmit`. Notes pushed into a lifted bar may leave an instrument's range: `fit` folds them (nothing to do); the existing tests of ranges must stay green.

- [ ] **Step 6: Commit**

```bash
git add globe/src/personal/lift.ts globe/src/personal/compose.ts globe/test/personal-lift.test.ts
git commit -m "feat(personal): a trip across regions lifts the key in the last bars of the chorus and then goes home

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Home drone

**Files:**
- Modify: `globe/src/personal/world-voices.ts` (`DRONE_BY_CARD`, `droneVoice`), `globe/src/personal/compose.ts` (the drone in the bar loop; the drawing lengths skip it), `globe/test/personal.test.ts` (the "never overlap in the drawing" test counts only drawn notes)
- Test: `globe/test/personal-drone.test.ts` (create)

**Interfaces:**
- Consumes: `liftAt`/`lift`/`chorusFirst`/`chorusLen` (Task 3), `roleOfNote` (Task 2), `resolveVoice`.
- Produces: `droneVoice(cardId: string): Voice` and `DRONE_BY_CARD`.

- [ ] **Step 1: Write the failing tests** — `globe/test/personal-drone.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";
import { droneVoice } from "../src/personal/world-voices";

const bars = (p: ReturnType<typeof composePiece>): number => (60 / p.bpm) * 4;
const drone = (p: ReturnType<typeof composePiece>) => p.notes.filter((n) => n.show === false && n.route === 0 && n.vel > 0 && n.pan === 0);

describe("home drone", () => {
  it("is chosen by the card of home, with a held low voice as the default", () => {
    expect(droneVoice("hindustani")).toBe("TANPURA");
    expect(droneVoice("celtic")).toBe("BAGPIPE_DRONE");
    expect(droneVoice("baroque")).toBe("RENORGAN");
    expect(droneVoice("anything-else")).toBe("CELLO");
  });
  const routes = buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST");
  const p = composePiece("visited", routes);
  it("belongs to the first route, is not drawn again and sounds from the start", () => {
    const d = drone(p);
    expect(d.length).toBeGreaterThan(4);
    expect(d.every((n) => n.route === 0 && n.show === false)).toBe(true);
    expect(Math.min(...d.map((n) => n.t))).toBeLessThan(2 * bars(p));
  });
  it("is silent in the break and in the lifted bars, and back in the outro", () => {
    const d = drone(p);
    const inBars = (a: number, b: number): number => d.filter((n) => n.t >= a * bars(p) - 1e-6 && n.t < b * bars(p) - 1e-6).length;
    expect(inBars(44, 52)).toBe(0); // the lifted bars (visited trip across regions)
    expect(inBars(52, 56)).toBe(0); // the break
    expect(inBars(56, 64)).toBeGreaterThan(0); // the outro: home again
    expect(inBars(8, 44)).toBeGreaterThan(0);
    for (const n of d) expect(n.t + n.d).toBeLessThanOrEqual(44 * bars(p) + 1e-6 + (n.t >= 56 * bars(p) ? 1e9 : 0));
  });
  it("is the tonic and its fifth, in the octave of the bass", () => {
    const pcs = new Set(drone(p).map((n) => ((Math.round(12 * Math.log2(n.freq / 110)) % 12) + 12) % 12));
    expect(pcs.size).toBe(2);
    const [a, b] = [...pcs].sort((x, y) => x - y);
    expect([(b - a) % 12, (a - b + 12) % 12]).toContain(7);
  });
  it("is not in a solo piece, and does not change the composition of the same selection", () => {
    expect(drone(composePiece("visited", buildRoutes(["JFK"], "IST"))).length).toBe(0);
    expect(JSON.stringify(composePiece("visited", routes).notes)).toBe(JSON.stringify(p.notes));
  });
});
```
(The `drone()` filter relies on drone notes being the only `show: false` notes with `pan === 0`; if other `show: false` notes exist or the instrument check is cleaner, filter by `instrument === droneVoice(p.style.cards![0])` resolved the same way, and say so in the report.)

- [ ] **Step 2: Run them and see them fail** — `npm --prefix globe test -- personal-drone` → FAIL (`droneVoice` missing).

- [ ] **Step 3: The voice table** — append to `world-voices.ts`

```ts
/** the held low voice of home, by the card of the starting country; anything not listed is a cello */
export const DRONE_BY_CARD: Record<string, Voice> = {
  hindustani: "TANPURA",
  celtic: "BAGPIPE_DRONE",
  karsilama: "BAGPIPE_DRONE",
  baroque: "RENORGAN",
};
export const droneVoice = (cardId: string): Voice => DRONE_BY_CARD[cardId] ?? "CELLO";
```

- [ ] **Step 4: The drone in `compose.ts`**

Add `droneVoice` to the existing `import { resolveVoice, … } from "./world-voices";` of `compose.ts`. Before the bar loop, after `lift`/`chorusFirst`/`chorusLen`, add:

```ts
  // home: the tonic and its fifth hum under the trip, played by the first route (nothing is added that is not a route).
  // A plucked drone is struck every two bars, a held one every four; it is silent in the break and in the lifted bars.
  const droneInst = resolveVoice(droneVoice(plan.main.id), routeHash(routes[0].key));
  const droneEvery = droneInst === "TANPURA" ? 2 : 4;
  const silentBar = (b: number): boolean => sectionOf(b).section === "break" || liftAt(b, chorusFirst, chorusLen, lift) !== 0;
```
Inside the bar loop, after the `for (let i = 0; i < n; i++) {…}` route loop (still inside `for (let b …)`), add:

```ts
    if (b % droneEvery === 0 && !silentBar(b)) {
      let len = 1;
      while (len < droneEvery && b + len < BARS && !silentBar(b + len)) len++;
      [0, 7].forEach((semi, k) => {
        const note: PersonalNote = {
          t: t0, d: len * bar * 0.98, instrument: droneInst, freq: fit(hz(KEY_ROOT + st.shift - 12 + semi), droneInst), vel: clamp(v(k === 0 ? 0.22 : 0.15), 0.05, 1),
          key: routes[0].key, route: 0, via: 0, alt: altitudeFt(0.5, routes[0].distKm), show: false, pan: 0, wet: 0.3,
        };
        notes.push(note);
        roleOfNote.set(note, "drone");
      });
    }
```
In the `byRoute`/`drawDur` block exclude the drone: change `for (const x of notes) byRoute.set(...)` to skip notes with `roleOfNote.get(x) === "drone"`, and after that block give drone notes `x.drawDur = x.d`. The drone uses the home tonic `st.shift` (not `sh`): it is silent in the lifted bars anyway.

In `globe/test/personal.test.ts` the test "draws every note only until the next note of the same route" groups notes by route: change its grouping to take only notes drawn (`n.show !== false`), nothing else.

- [ ] **Step 5: Run the tests** — `npm --prefix globe test -- personal-drone personal personal-world personal-lift personal-humanize` and `cd globe && npx tsc --noEmit`; then the full `npm --prefix globe test`. Report any other test that changes and why.

- [ ] **Step 6: Commit**

```bash
git add globe/src/personal/world-voices.ts globe/src/personal/compose.ts globe/test/personal-drone.test.ts globe/test/personal.test.ts
git commit -m "feat(personal): the tonic of home hums under the trip, played by the first route

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Data mapping doc, cards doc, final check

**Files:**
- Create: `docs/music-data-mapping.md`
- Modify: `docs/music-genre-cards.md`

- [ ] **Step 1: Write `docs/music-data-mapping.md`**

Title "Route data → music: the mapping". Sections: the rule (every mapping from data the site has, deterministic, obvious in direction, listed here with the reason), the table from the spec (copy it, with the formulas: pan, wet, looseness, lift, drone), a short "how to add a mapping" list (data → decision → why it is heard that way → a test), and a "not mapped yet" list (latitude, flight frequency: not carried on this site, delay, local time of day: would break determinism).

- [ ] **Step 2: Cards doc** — in `docs/music-genre-cards.md` add a section "Home drone" with the table: `hindustani` → TANPURA, `celtic`, `karsilama` → BAGPIPE_DRONE, `baroque` → RENORGAN, every other card → CELLO; one sentence on when it is silent (break, lifted bars).

- [ ] **Step 3: Whole check** — `npm --prefix globe test` (all green, `groove.test.ts` may be re-run alone), `cd globe && npx tsc --noEmit` (silent), `npm --prefix globe run build:personal` (builds).

- [ ] **Step 4: Summarise the eight reference selections** (a throwaway script or test, not committed): one region (`ESB,ADB,AYT`), three regions (`NRT,LOS,GRU`), a long list of ten, a Gulf start (places `CAI,AMM,BEY`, home `DXB`), a Far-East start (places `ICN,PEK,BKK`, home `NRT`), each composed in `visited` and `wish`: print per selection the drone present (yes/no, instrument), `style.lift`, the range of `pan` and `wet`, and the mean timing offset against an un-humanized composition if easy; paste the table into the task report. Listening is the user's.

- [ ] **Step 5: Commit**

```bash
git add docs/music-data-mapping.md docs/music-genre-cards.md
git commit -m "docs: the route data → music mapping and the home drone table

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
