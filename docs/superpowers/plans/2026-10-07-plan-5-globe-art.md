# Plan 5 — Globe art: route corridors, light & atmosphere, route music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route-density corridors, a more alive planet (twilight band, cloud shadows, sun glare, real star map, optional aurora) and an optional route-driven ambient soundscape to the globe — every part individually revertable.

**Architecture:** A small pure `art` state module (`?art`, `C`/`A`/`M` keys, quality gating) feeds an `Effects` object to the engine/controller. Corridors are a new instanced-ribbon mesh built from a pure `buildCorridors(model)`; light effects are shader additions plus two small meshes; sound is a self-contained `audio/` module (no scene imports): a continent orchestra on one 96 BPM clock whose notes come from real departures/landings. Each section is its own commit series with prefix `art(<section>):` and `// art:<section>` markers at its few integration points so `git revert` removes it cleanly.

**Tech Stack:** TypeScript, Three.js ~0.186 (ShaderMaterial/instancing), Web Audio API, React, Vitest (+ jsdom), Vite. Spec: `docs/superpowers/specs/2026-10-07-globe-art-light-corridors-design.md`.

## Global Constraints

- Work in `globe/` only (plus README, spec notes table); never touch `web/` source, `functions/`, fonts, credentials, `.claude/`.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commit message prefix per section: `art(core):`, `art(corridors):`, `art(light):`, `art(stars):`, `art(aurora):`, `art(sound):`, `art(docs):`.
- Revertability (user request): a section never depends on another section's code; integration points are small and marked `// art:<section>`. The controller feeds sound from the model's departures/landings and (for stereo pan) corridor midpoints; the `audio/` files import nothing from `scene/`. Record section → commit hashes in the spec's "Uygulama notları" table at the end (Task 7).
- Time contract (unchanged): `cur`/`u` seconds relative to `window.from`; float32 GPU time = seconds since engine start (`rel(nowSec)`), never epoch.
- Earth-fixed unit sphere via `latLonToVec3`; scene altitude radius `altitudeRadius()` + `ARC_BASE_LIFT` (0.002); Earth group rotation `earthRotationRad(absTime)`; sun in the inertial frame (`sunDirection`).
- Defaults: corridors **on**, aurora **off**, sound **off**. `?art=0` disables every new effect (twilight, cloud shadows, glare, star map, aurora, corridors, sound) and restores the previous look. Preferences persist in `localStorage` key `dataroute.art` (always try/catch; page must work without storage).
- Quality gating (spec §4): `LEVELS` index 0 = all effects; index ≥ 1 turns aurora off; index ≥ 2 also turns cloud shadows off. Twilight, glare, corridors never gate on quality (cheap).
- Honesty: corridors only from routed flights, label `ROUTE DENSITY · 24H` while on; aurora is decorative (label `AURORA · ILLUSTRATIVE` while on; default off); sound is a generative sonification of real departures/landings (label `SOUND ON`): pitch = route (distance sets the octave), loudness/density = traffic, FOLLOW brightness = altitude; each continent has its own instrument, scale and rhythm on one shared 96 BPM clock and Am–F–C–G progression. HUD text English upper-case; attribution/credit lines unchanged and still visible when HUD hidden.
- Downloads need explicit user approval with file name, URL and size stated first (star map, Task 4); stop and ask if the user has not approved.
- Test hygiene: pure modules have hand-checkable tests; no test asserts nothing; GL shader code is verified visually by the controller (record observations in the spec's notes table).

## File Structure

| File | Responsibility |
|---|---|
| `globe/src/app/art.ts` (new) | `ArtState`, `initArt`, `toggleArt`, `persistArt`, `Effects`, `effectsFor` |
| `globe/src/scene/corridors.ts` (new) | `buildCorridors`, `corridorWeight`, `corridorStyle`, `buildCorridorBuffers`, `createCorridors` |
| `globe/src/scene/light.ts` (new) | pure `twilightAmount`, `cloudShadowShift` (mirrors of the GLSL) |
| `globe/src/scene/sun-glare.ts` (new) | additive sun glare billboard |
| `globe/src/scene/star-uv.ts` (new) | pure `starUV` |
| `globe/src/scene/aurora.ts` (new) | pure `auroraBand`, shell mesh |
| `globe/src/audio/theory.ts`, `score.ts` (new) | pure clock/harmony/rhythm grids, scales, event → note planning |
| `globe/src/audio/instruments.ts`, `engine.ts` (new) | per-continent synth recipes, chord bed, Web Audio engine (`createRouteSound`) |
| `globe/src/app/keys.ts`, `controller.ts`, `hud-model.ts`, `hud/GlobeHud.tsx`, `styles.css` (mod) | keys, art state, snapshot field, `ArtNotes` |
| `globe/src/scene/{arcs,earth,atmosphere,space,textures,engine}.ts` (mod) | integration points |

Tests: `globe/test/{art,corridors,light,star-uv,aurora,theory,score,route-sound}.test.ts(x)` (new) and extensions of `keys`, `controller`, `arcs`, `hud`, `scene-materials`.

Existing code you will use (verify exact names by reading): `GlobeModel`/`GlobeFlight` (`planned`, `from`, `to`, `regionIdx`, `type`) in `globe/src/model/globe-model.ts`; `plannedArc`, `plannedLiftPeak` in `geo3d/great.ts`; `latLonToVec3`, `altitudeRadius` in `geo3d/vec.ts`; `buildArcBuffers`/`createArcs` in `scene/arcs.ts`; `createEarth`/`EARTH_FRAG` in `scene/earth.ts`; `createAtmosphere`; `createSpace`; `LEVELS` in `@web/render/quality`; `REGIONS`/`REGION_RGB` in `@web/data/palette`; controller (`setPerf`, `pushHud`, `onKey`, events via `diffEvents`/`addEvents`); engine (`frameBody`, `setModel`, `screenOf`, `dispose`, `rel`).

---

### Task 1: Art state, keys, HUD notes (core)

**Files:**
- Create: `globe/src/app/art.ts`
- Modify: `globe/src/app/keys.ts`, `globe/src/app/hud-model.ts`, `globe/src/app/controller.ts`, `globe/src/scene/engine.ts` (interface + stub), `globe/src/hud/GlobeHud.tsx`, `globe/src/styles.css`, `globe/test/controller.test.ts` (engine mock)
- Test: `globe/test/art.test.ts`, `globe/test/keys.test.ts`, `globe/test/controller.test.ts`, `globe/test/hud.test.tsx`

**Interfaces:**
- Produces:
  - `art.ts`: `interface ArtState { enabled: boolean; corridors: boolean; aurora: boolean; sound: boolean }`; `type ArtAction = "corridors" | "aurora" | "sound"`; `const ART_STORAGE_KEY = "dataroute.art"`; `initArt(search: string, read?: (key: string) => string | null): ArtState`; `toggleArt(s: ArtState, a: ArtAction): ArtState` (no-op when `!enabled`); `persistArt(s: ArtState, write?: (key: string, value: string) => void): void`; `interface Effects { twilight: boolean; cloudShadow: boolean; glare: boolean; aurora: boolean; corridors: boolean; sound: boolean; starMap: boolean }`; `effectsFor(s: ArtState, qualityLevel: number): Effects`.
  - `keys.ts`: `GlobeCommand` gains `"toggleCorridors" | "toggleAurora" | "toggleSound"`; keys `c`/`C`, `a`/`A`, `m`/`M`.
  - `GlobeEngine.setEffects(e: Effects): void` (stored; later tasks apply it).
  - `GlobeHudSnapshot.art: ArtState`; `EMPTY_GLOBE_SNAPSHOT.art = { enabled: true, corridors: true, aurora: false, sound: false }`.
  - `GlobeHud` renders `ArtNotes` (class `art-notes`): lines `ROUTE DENSITY · 24H` (corridors), `AURORA · ILLUSTRATIVE` (aurora), `SOUND ON` (sound); nothing when `!art.enabled`.

- [ ] **Step 1: Failing tests**

`globe/test/art.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ART_STORAGE_KEY, effectsFor, initArt, persistArt, toggleArt } from "../src/app/art";

const none = () => null;

describe("initArt", () => {
  it("defaults: corridors on, aurora and sound off", () => {
    expect(initArt("", none)).toEqual({ enabled: true, corridors: true, aurora: false, sound: false });
  });
  it("?art=0 disables everything", () => {
    expect(initArt("?art=0", none)).toEqual({ enabled: false, corridors: false, aurora: false, sound: false });
  });
  it("stored preferences override the defaults; garbage is ignored", () => {
    const read = (k: string) => (k === ART_STORAGE_KEY ? JSON.stringify({ corridors: false, aurora: true, sound: true }) : null);
    expect(initArt("", read)).toEqual({ enabled: true, corridors: false, aurora: true, sound: true });
    expect(initArt("", () => "{nope")).toEqual({ enabled: true, corridors: true, aurora: false, sound: false });
    expect(initArt("", () => JSON.stringify({ corridors: "yes" }))).toEqual({ enabled: true, corridors: true, aurora: false, sound: false });
  });
  it("survives a throwing storage", () => {
    expect(() => initArt("", () => { throw new Error("blocked"); })).not.toThrow();
  });
});

describe("toggleArt / persistArt", () => {
  it("toggles one flag; disabled art ignores toggles", () => {
    const s = initArt("", none);
    expect(toggleArt(s, "aurora").aurora).toBe(true);
    expect(toggleArt(s, "corridors").corridors).toBe(false);
    const off = initArt("?art=0", none);
    expect(toggleArt(off, "sound")).toEqual(off);
  });
  it("persists only the three user flags and swallows storage errors", () => {
    const seen: [string, string][] = [];
    persistArt(initArt("", none), (k, v) => seen.push([k, v]));
    expect(seen).toEqual([[ART_STORAGE_KEY, JSON.stringify({ corridors: true, aurora: false, sound: false })]]);
    expect(() => persistArt(initArt("", none), () => { throw new Error("quota"); })).not.toThrow();
  });
});

describe("effectsFor", () => {
  const on = { enabled: true, corridors: true, aurora: true, sound: true };
  it("everything at quality 0", () => {
    expect(effectsFor(on, 0)).toEqual({ twilight: true, cloudShadow: true, glare: true, aurora: true, corridors: true, sound: true, starMap: true });
  });
  it("aurora goes first (level 1), then cloud shadows (level 2); others never gate", () => {
    expect(effectsFor(on, 1)).toMatchObject({ aurora: false, cloudShadow: true, glare: true, twilight: true });
    expect(effectsFor(on, 2)).toMatchObject({ aurora: false, cloudShadow: false, glare: true, twilight: true, corridors: true });
  });
  it("aurora needs both the toggle and a good quality level", () => {
    expect(effectsFor({ ...on, aurora: false }, 0).aurora).toBe(false);
  });
  it("art disabled → every effect off", () => {
    expect(Object.values(effectsFor(initArt("?art=0", none), 0)).every((v) => v === false)).toBe(true);
  });
});
```

Add to `globe/test/keys.test.ts` inside the mapping test: `expect(keyToCommand("c")).toBe("toggleCorridors"); expect(keyToCommand("C")).toBe("toggleCorridors"); expect(keyToCommand("a")).toBe("toggleAurora"); expect(keyToCommand("m")).toBe("toggleSound"); expect(keyToCommand("M")).toBe("toggleSound");`

Controller tests (use the existing `setup`; add `setEffects: vi.fn()` to the engine mock and return `engine` — it already returns it):
```ts
  it("art keys toggle corridors/aurora/sound, publish the state and push effects to the engine", async () => {
    const h = setup();
    await flush();
    h.frame(0.3);
    expect(h.store.get().art).toEqual({ enabled: true, corridors: true, aurora: false, sound: false });
    h.c.onKey("a");
    h.c.onKey("c");
    h.c.onKey("m");
    expect(h.store.get().art).toEqual({ enabled: true, corridors: false, aurora: true, sound: true });
    const last = (h.engine.setEffects as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(last).toMatchObject({ corridors: false, aurora: true, sound: true });
    h.c.dispose();
  });

  it("a quality drop turns the aurora off in the pushed effects", async () => {
    const h = setup();
    await flush();
    h.c.onKey("a");
    h.c.setPerf(40, 1);
    const last = (h.engine.setEffects as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(last.aurora).toBe(false);
    h.c.dispose();
  });
```
HUD test in `hud.test.tsx`:
```tsx
describe("ArtNotes", () => {
  it("lists only the active art features; nothing when art is disabled", () => {
    const on = render(<GlobeHud store={createStore(snap({ art: { enabled: true, corridors: true, aurora: true, sound: true } }))} />).container;
    expect(text(on)).toContain("ROUTE DENSITY · 24H");
    expect(text(on)).toContain("AURORA · ILLUSTRATIVE");
    expect(text(on)).toContain("SOUND ON");
    const off = render(<GlobeHud store={createStore(snap({ art: { enabled: false, corridors: false, aurora: false, sound: false } }))} />).container;
    expect(off.querySelector(".art-notes")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd globe && npx vitest run test/art.test.ts test/keys.test.ts` (and the controller/hud files) → FAIL.

- [ ] **Step 3: Implement**

`globe/src/app/art.ts`:
```ts
export interface ArtState {
  /** master switch: false when the URL has ?art=0 */
  enabled: boolean;
  corridors: boolean;
  aurora: boolean;
  sound: boolean;
}
export type ArtAction = "corridors" | "aurora" | "sound";
export const ART_STORAGE_KEY = "dataroute.art";

const DEFAULTS = { corridors: true, aurora: false, sound: false };

function defaultRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function defaultWrite(key: string, value: string): void {
  localStorage.setItem(key, value);
}

export function initArt(search: string, read: (key: string) => string | null = defaultRead): ArtState {
  if (new URLSearchParams(search).get("art") === "0") return { enabled: false, corridors: false, aurora: false, sound: false };
  const s: ArtState = { enabled: true, ...DEFAULTS };
  try {
    const raw = read(ART_STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      for (const k of ["corridors", "aurora", "sound"] as const) if (typeof o[k] === "boolean") s[k] = o[k] as boolean;
    }
  } catch {
    /* blocked storage or garbage: keep defaults */
  }
  return s;
}

export function toggleArt(s: ArtState, a: ArtAction): ArtState {
  return s.enabled ? { ...s, [a]: !s[a] } : s;
}

export function persistArt(s: ArtState, write: (key: string, value: string) => void = defaultWrite): void {
  try {
    write(ART_STORAGE_KEY, JSON.stringify({ corridors: s.corridors, aurora: s.aurora, sound: s.sound }));
  } catch {
    /* storage unavailable */
  }
}

export interface Effects {
  twilight: boolean;
  cloudShadow: boolean;
  glare: boolean;
  aurora: boolean;
  corridors: boolean;
  sound: boolean;
  starMap: boolean;
}

/** Which effects run for an art state at a quality level (0 = best). Aurora drops first, then cloud shadows. */
export function effectsFor(s: ArtState, qualityLevel: number): Effects {
  if (!s.enabled) return { twilight: false, cloudShadow: false, glare: false, aurora: false, corridors: false, sound: false, starMap: false };
  return {
    twilight: true,
    cloudShadow: qualityLevel < 2,
    glare: true,
    aurora: s.aurora && qualityLevel < 1,
    corridors: s.corridors,
    sound: s.sound,
    starMap: true,
  };
}
```
`keys.ts`: add the three commands to the union and cases `"c"|"C"` → `toggleCorridors`, `"a"|"A"` → `toggleAurora`, `"m"|"M"` → `toggleSound` (before `default`).

`engine.ts`: add `import type { Effects } from "../app/art";`, `setEffects(e: Effects): void;` to `GlobeEngine`, a `let effects: Effects | null = null;` in `createGlobeEngine`, and in the returned object `setEffects(e) { effects = e; // art:core — later sections apply it }` (keep `effects` referenced, e.g. exported getter not needed; add `void effects;` if the linter complains).

`hud-model.ts`: `import type { ArtState } from "./art";`, add `art: ArtState;` to `GlobeHudSnapshot`, `art: { enabled: true, corridors: true, aurora: false, sound: false }` to `EMPTY_GLOBE_SNAPSHOT`.

`controller.ts`: imports `{ effectsFor, initArt, persistArt, toggleArt, type ArtState } from "./art"`; state `let art: ArtState = initArt(typeof window === "undefined" ? "" : window.location.search);` — better, take it from deps: add optional `search?: string` to `GlobeControllerDeps` (App passes `window.location.search`; tests default to `""` and a storage-less environment — the default `read` already try/catches, but jsdom/node `localStorage` may be missing: it is caught). Keep `let perfLevel = 0`. Helper `pushEffects()`:
```ts
  const pushEffects = () => d.engine.setEffects(effectsFor(art, perf.level)); // art:core
```
Call `pushEffects()` once after `d.engine.setFrameSource(frame)` and in `setPerf` after storing `perf`. In `onKey`, before the follow-specific handling: 
```ts
      if (cmd === "toggleCorridors" || cmd === "toggleAurora" || cmd === "toggleSound") {
        art = toggleArt(art, cmd === "toggleCorridors" ? "corridors" : cmd === "toggleAurora" ? "aurora" : "sound");
        persistArt(art);
        pushEffects();
        pushHud();
        return;
      }
```
and `art,` in the `store.set({...})` object (`art` field). `App.tsx`: pass `search` into `createController`.

`GlobeHud.tsx`: add
```tsx
export function ArtNotes({ art }: { art: GlobeHudSnapshot["art"] }) {
  if (!art.enabled) return null;
  const lines = [art.corridors && "ROUTE DENSITY · 24H", art.aurora && "AURORA · ILLUSTRATIVE", art.sound && "SOUND ON"].filter(Boolean) as string[];
  if (lines.length === 0) return null;
  return <div className="art-notes label">{lines.map((l) => <div key={l}>{l}</div>)}</div>;
}
```
render `<ArtNotes art={s.art} />` right after `<ModeLine s={s} />` (inside `.hud` so it fades with H; attribution lines are unaffected). `styles.css`: `.art-notes { position: absolute; left: 3vmin; top: 12.6vmin; font-size: calc(0.85 * var(--u)); letter-spacing: 0.14em; color: var(--ink-dim); line-height: 1.6; }` and in the portrait media block `.art-notes { top: 12.4vmin; }` (counters start at 13vmin: check there is no overlap; adjust if needed).

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build` in `globe/`.

- [ ] **Step 5: Commit**
```bash
git add globe
git commit -m "art(core): art state, C/A/M keys, effects plumbing and HUD notes"
```

---

### Task 2: Route corridors

**Files:**
- Create: `globe/src/scene/corridors.ts`
- Modify: `globe/src/scene/arcs.ts`, `globe/src/scene/engine.ts`
- Test: `globe/test/corridors.test.ts`, `globe/test/arcs.test.ts`

**Interfaces:**
- Consumes: `GlobeModel`, `plannedArc`, `latLonToVec3`, `Effects` (Task 1).
- Produces:
  - `corridors.ts`: `interface Corridor { key: string; a: string; b: string; fromLat: number; fromLon: number; toLat: number; toLon: number; distKm: number; count: number; regionIdx: number }`; `corridorKey(from: string, to: string): string` (`"min-max"`); `buildCorridors(m: GlobeModel): Corridor[]` (sorted by count desc then key); `corridorWeight(count: number, max: number): number`; `interface CorridorStyle { widthPx: number; alpha: number; rgb: [number, number, number] }`; `corridorStyle(w: number): CorridorStyle`; `CORRIDOR_POINTS = 64`; `buildCorridorBuffers(cs: Corridor[]): CorridorBuffers`; `createCorridors(m: GlobeModel): Corridors` with `{ mesh, corridors, uniforms: { uRes, uWidth, uTime, uHighlight }, indexOf(from?: string, to?: string): number, setResolution(w,h,pr), dispose() }`.
  - `arcs.ts`: `buildArcBuffers(m, opts?: { planned?: boolean })` and `createArcs(m, opts?)` — `planned: false` skips the planned-route instances (default true).

- [ ] **Step 1: Failing tests** — `globe/test/corridors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { CORRIDOR_POINTS, buildCorridorBuffers, buildCorridors, corridorKey, corridorStyle, corridorWeight } from "../src/scene/corridors";
import { FROM, flight, makeDay } from "./helpers";

const s = (lon: number): [number, number, number, number][] => [[0, 300, 41, 29], [600, 350, 42, lon]];
const model = (flights: ReturnType<typeof flight>[]) => buildGlobeModel(makeDay({ flights }));

describe("buildCorridors", () => {
  it("merges flights on the same route, in both directions", () => {
    const m = model([
      flight({ from: "IST", to: "JFK", s: s(20) }),
      flight({ from: "JFK", to: "IST", s: s(10) }),
      flight({ from: "IST", to: "JFK", s: s(15) }),
      flight({ from: "IST", to: "LHR", s: s(5) }),
    ]);
    const cs = buildCorridors(m);
    expect(cs.map((c) => [c.key, c.count])).toEqual([["IST-JFK", 3], ["IST-LHR", 1]]);
    expect(corridorKey("JFK", "IST")).toBe("IST-JFK");
  });

  it("keeps a single orientation (a→b by sorted code) so coordinates agree with the key", () => {
    const m = model([flight({ from: "JFK", to: "IST", s: s(10) })]);
    const c = buildCorridors(m)[0];
    expect([c.a, c.b]).toEqual(["IST", "JFK"]);
    expect(c.fromLat).toBeCloseTo(41.2613, 3); // IST
    expect(c.toLat).toBeCloseTo(40.6398, 3); // JFK
  });

  it("ignores flights without a known route or with the same endpoints", () => {
    const m = model([flight({ s: s(20) }), flight({ from: "IST", to: "IST", s: s(20) }), flight({ from: "IST", to: "ZZZ", s: s(20) })]);
    expect(buildCorridors(m)).toEqual([]);
  });

  it("sorts by traffic, then key", () => {
    const m = model([
      flight({ from: "IST", to: "LHR", s: s(5) }),
      flight({ from: "IST", to: "ESB", s: s(5) }),
      flight({ from: "IST", to: "JFK", s: s(5) }),
      flight({ from: "IST", to: "JFK", s: s(5) }),
    ]);
    expect(buildCorridors(m).map((c) => c.key)).toEqual(["IST-JFK", "ESB-IST", "IST-LHR"]);
  });
});

describe("corridor style", () => {
  it("weight is sqrt-scaled and bounded", () => {
    expect(corridorWeight(1, 100)).toBeCloseTo(0.1, 9);
    expect(corridorWeight(100, 100)).toBe(1);
    expect(corridorWeight(5, 0)).toBe(0);
  });
  it("width and alpha grow monotonically; colour goes cool → warm → near white", () => {
    let pw = -1, pa = -1;
    for (let w = 0; w <= 1.0001; w += 0.1) {
      const st = corridorStyle(Math.min(1, w));
      expect(st.widthPx).toBeGreaterThanOrEqual(pw);
      expect(st.alpha).toBeGreaterThanOrEqual(pa);
      pw = st.widthPx;
      pa = st.alpha;
    }
    expect(corridorStyle(0).widthPx).toBeCloseTo(0.9, 9);
    expect(corridorStyle(1).widthPx).toBeCloseTo(4.5, 9);
    expect(corridorStyle(0).alpha).toBeCloseTo(0.1, 9);
    expect(corridorStyle(1).alpha).toBeCloseTo(0.45, 9);
    const [r0, , b0] = corridorStyle(0).rgb;
    const [r1, g1, b1] = corridorStyle(1).rgb;
    expect(b0).toBeGreaterThan(r0); // cool
    expect(r1).toBeGreaterThan(0.95);
    expect(g1).toBeGreaterThan(0.9);
    expect(b1).toBeGreaterThan(0.8); // near white
  });
});

describe("buildCorridorBuffers", () => {
  it("emits CORRIDOR_POINTS-1 instances per corridor with matching attribute sizes", () => {
    const m = model([flight({ from: "IST", to: "JFK", s: s(20) }), flight({ from: "IST", to: "LHR", s: s(5) })]);
    const cs = buildCorridors(m);
    const b = buildCorridorBuffers(cs);
    const n = (CORRIDOR_POINTS - 1) * cs.length;
    expect(b.count).toBe(n);
    expect(b.a.length).toBe(n * 3);
    expect(b.b.length).toBe(n * 3);
    expect(b.u.length).toBe(n * 2);
    expect(b.s.length).toBe(n * 2);
    expect(b.color.length).toBe(n * 3);
    expect(b.misc.length).toBe(n * 4);
    expect(b.misc[3]).toBe(0); // corridor index of the first corridor
    expect(b.misc[(CORRIDOR_POINTS - 1) * 4 + 3]).toBe(1);
  });
  it("is empty for no corridors", () => {
    expect(buildCorridorBuffers([]).count).toBe(0);
  });
});
```
Extend `arcs.test.ts` (mirror how existing tests build a routed flight): `buildArcBuffers(m, { planned: false })` has **zero** instances whose `info[i*4+1] === 1` while the default call still has them, and the observed (kind 0) count is identical in both.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — `globe/src/scene/corridors.ts`:

```ts
import {
  AdditiveBlending, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, ShaderMaterial, Vector2,
} from "three";
import { plannedArc } from "../geo3d/great";
import { latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { ARC_BASE_LIFT } from "./arcs";

export const CORRIDOR_POINTS = 64;

export interface Corridor {
  key: string;
  a: string;
  b: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distKm: number;
  count: number;
  regionIdx: number;
}

export const corridorKey = (from: string, to: string) => (from < to ? `${from}-${to}` : `${to}-${from}`);

/** One corridor per undirected airport pair among routed flights (planned route known), sorted by traffic. */
export function buildCorridors(m: GlobeModel): Corridor[] {
  const map = new Map<string, Corridor>();
  for (const f of m.flights) {
    const pl = f.planned;
    if (!pl || !f.from || !f.to || f.from === f.to) continue;
    if (![pl.fromLat, pl.fromLon, pl.toLat, pl.toLon, pl.distKm].every(Number.isFinite) || pl.distKm < 1) continue;
    const key = corridorKey(f.from, f.to);
    const cur = map.get(key);
    if (cur) {
      cur.count++;
      continue;
    }
    const forward = f.from < f.to; // a = smaller code
    map.set(key, {
      key,
      a: forward ? f.from : f.to,
      b: forward ? f.to : f.from,
      fromLat: forward ? pl.fromLat : pl.toLat,
      fromLon: forward ? pl.fromLon : pl.toLon,
      toLat: forward ? pl.toLat : pl.fromLat,
      toLon: forward ? pl.toLon : pl.fromLon,
      distKm: pl.distKm,
      count: 1,
      regionIdx: f.regionIdx,
    });
  }
  return [...map.values()].sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
}

export const corridorWeight = (count: number, max: number): number => (max > 0 ? Math.sqrt(Math.min(count, max) / max) : 0);

export interface CorridorStyle {
  widthPx: number;
  alpha: number;
  rgb: [number, number, number];
}

const RAMP: [number, [number, number, number]][] = [
  [0, [0.25, 0.45, 1.0]], // sparse: cool blue
  [0.5, [1.0, 0.55, 0.2]], // busy: orange
  [1, [1.0, 0.95, 0.85]], // busiest: near white
];

function ramp(w: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, w));
  for (let i = 1; i < RAMP.length; i++) {
    if (x <= RAMP[i][0]) {
      const [x0, c0] = RAMP[i - 1];
      const [x1, c1] = RAMP[i];
      const t = (x - x0) / (x1 - x0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export function corridorStyle(w: number): CorridorStyle {
  const x = Math.min(1, Math.max(0, w));
  return { widthPx: 0.9 + 3.6 * x, alpha: 0.1 + 0.35 * x, rgb: ramp(x) };
}

export interface CorridorBuffers {
  a: Float32Array;
  b: Float32Array;
  /** arc fraction at the segment start and end (for width taper and the shimmer wave) */
  u: Float32Array;
  /** arc length in radians at start/end */
  s: Float32Array;
  color: Float32Array;
  /** width px, alpha, weight, corridor index */
  misc: Float32Array;
  count: number;
}

const R_KM = 6371.0088;

export function buildCorridorBuffers(cs: Corridor[]): CorridorBuffers {
  const n = (CORRIDOR_POINTS - 1) * cs.length;
  const out: CorridorBuffers = {
    a: new Float32Array(n * 3), b: new Float32Array(n * 3), u: new Float32Array(n * 2), s: new Float32Array(n * 2),
    color: new Float32Array(n * 3), misc: new Float32Array(n * 4), count: n,
  };
  const max = cs.length ? cs[0].count : 0;
  let i = 0;
  cs.forEach((c, ci) => {
    const w = corridorWeight(c.count, max);
    const st = corridorStyle(w);
    const { points } = plannedArc({ lat: c.fromLat, lon: c.fromLon }, { lat: c.toLat, lon: c.toLon }, CORRIDOR_POINTS);
    for (let k = 0; k + 1 < points.length; k++, i++) {
      const p = points[k];
      const q = points[k + 1];
      out.a.set(latLonToVec3(p.lat, p.lon, p.radius + ARC_BASE_LIFT), i * 3);
      out.b.set(latLonToVec3(q.lat, q.lon, q.radius + ARC_BASE_LIFT), i * 3);
      out.u[i * 2] = p.u;
      out.u[i * 2 + 1] = q.u;
      out.s[i * 2] = (p.u * c.distKm) / R_KM;
      out.s[i * 2 + 1] = (q.u * c.distKm) / R_KM;
      out.color.set(st.rgb, i * 3);
      out.misc[i * 4] = st.widthPx;
      out.misc[i * 4 + 1] = st.alpha;
      out.misc[i * 4 + 2] = w;
      out.misc[i * 4 + 3] = ci;
    }
  });
  return out;
}

const VERT = /* glsl */ `
uniform vec2 uRes;
uniform float uWidth;
uniform float uHighlight;
attribute vec2 aCorner;
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aU;
attribute vec2 aS;
attribute vec3 aColor;
attribute vec4 aMisc;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vS;
varying float vW;
void main() {
  bool hi = abs(aMisc.w - uHighlight) < 0.5;
  vec4 cA = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
  vec4 cB = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
  vec2 sA = cA.xy / cA.w * uRes;
  vec2 sB = cB.xy / cB.w * uRes;
  vec2 dir = sB - sA;
  dir = length(dir) < 1e-4 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 n = vec2(-dir.y, dir.x);
  float u = mix(aU.x, aU.y, aCorner.y);
  float taper = 0.55 + 0.45 * sin(3.14159265 * u); // thicker mid-route, thinner at the airports
  float w = uWidth * aMisc.x * taper * (hi ? 1.6 : 1.0);
  vec4 c = mix(cA, cB, aCorner.y);
  c.xy += n * aCorner.x * w / uRes * c.w;
  gl_Position = c;
  vColor = aColor;
  vAlpha = aMisc.y * (hi ? 2.2 : 1.0);
  vEdge = aCorner.x;
  vS = mix(aS.x, aS.y, aCorner.y);
  vW = aMisc.z;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vS;
varying float vW;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vEdge));
  float wave = 1.0 + 0.45 * vW * sin(vS * 28.0 - uTime * 0.9); // slow shimmer; busier corridors shimmer more
  gl_FragColor = vec4(vColor * vAlpha * edge * wave, 1.0);
}
`;

export interface CorridorUniforms {
  uRes: { value: Vector2 };
  uWidth: { value: number };
  uTime: { value: number };
  uHighlight: { value: number };
}

export interface Corridors {
  mesh: Mesh;
  corridors: Corridor[];
  uniforms: CorridorUniforms;
  indexOf(from?: string, to?: string): number;
  setResolution(w: number, h: number, pixelRatio: number): void;
  dispose(): void;
}

export function createCorridors(m: GlobeModel): Corridors {
  const corridors = buildCorridors(m);
  const buf = buildCorridorBuffers(corridors);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute("aCorner", new Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2));
  geometry.setAttribute("aA", new InstancedBufferAttribute(buf.a, 3));
  geometry.setAttribute("aB", new InstancedBufferAttribute(buf.b, 3));
  geometry.setAttribute("aU", new InstancedBufferAttribute(buf.u, 2));
  geometry.setAttribute("aS", new InstancedBufferAttribute(buf.s, 2));
  geometry.setAttribute("aColor", new InstancedBufferAttribute(buf.color, 3));
  geometry.setAttribute("aMisc", new InstancedBufferAttribute(buf.misc, 4));
  geometry.instanceCount = buf.count;
  const uniforms: CorridorUniforms = {
    uRes: { value: new Vector2(1, 1) },
    uWidth: { value: 1 },
    uTime: { value: 0 },
    uHighlight: { value: -1 },
  };
  const material = new ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: AdditiveBlending,
    side: DoubleSide, depthTest: true, depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const index = new Map(corridors.map((c, i) => [c.key, i]));
  return {
    mesh,
    corridors,
    uniforms,
    indexOf: (from, to) => (from && to ? (index.get(corridorKey(from, to)) ?? -1) : -1),
    setResolution(w, h, pixelRatio) {
      uniforms.uRes.value.set(w, h);
      uniforms.uWidth.value = pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```
Note the circular import risk: `corridors.ts` imports `ARC_BASE_LIFT` from `arcs.ts`; `arcs.ts` must NOT import corridors. Keep it that way.

`arcs.ts`: change signatures to `buildArcBuffers(m: GlobeModel, opts: { planned?: boolean } = {})` and `createArcs(m: GlobeModel, opts: { planned?: boolean } = {})`; wrap the whole "planned route" block in `if (opts.planned !== false) { … }` (a `// art:corridors` comment on that guard); pass `opts` through in `createArcs`.

`engine.ts` (all lines marked `// art:corridors`):
1. imports `createCorridors, type Corridors` from `./corridors`;
2. `let corridors: Corridors | null = null;` and `const planned = () => !(effects?.corridors ?? false);` hmm — default before the first `setEffects`: `effects` is null → treat corridors as **off** until the controller pushes effects (the controller calls `pushEffects()` right after `setFrameSource`, before data arrives, so by the first `setModel` the flag is correct).
3. In `setModel`: dispose/remove `corridors` along with `arcs`; after creating `arcs = createArcs(m, { planned: planned() })` also `if (effects?.corridors) { corridors = createCorridors(m); earthGroup.add(corridors.mesh); }`; size it (`corridors?.setResolution(size.w*pr, size.h*pr, pr)`) wherever `arcs.setResolution` is called (in `resize()` and in `setModel`).
4. `setEffects(e)`: `const prev = effects; effects = e; if (model && prev?.corridors !== e.corridors) rebuildOverlays();` where `rebuildOverlays()` re-runs the arcs/corridors creation part of `setModel` for the current `model` (extract that part into a local function used by both).
5. In `frameBody`: `if (corridors) { corridors.uniforms.uTime.value = rel(f.nowSec); const fl = f.follow ? model?.flights[f.follow.flight] : undefined; corridors.uniforms.uHighlight.value = fl ? corridors.indexOf(fl.from, fl.to) : -1; }`.
6. `dispose()`: `corridors?.dispose()`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Controller visual check** (not delegated): restart `globe-dev`, open `http://localhost:5174/?data=fixture` and the live data page. Verify: corridors visible with thickness/colour by traffic, no pile-up of faint dashed arcs, `C` toggles back to dashed planned arcs and forth without errors, FPS ≥ 55, HUD shows `ROUTE DENSITY · 24H`, following a flight brightens its corridor. Record observations/tuning constants in the spec notes table.

- [ ] **Step 6: Commit**
```bash
git add globe
git commit -m "art(corridors): one corridor per route, width/colour by traffic, C toggles"
```

---

### Task 3: Light — twilight band, cloud shadows, sun glare

> Not: alacakaranlık bandı (twilight) uygulandı, kullanıcı beğenmedi ve kaldırıldı (`art(light): remove the twilight band`); aşağıdaki twilight adımları tarihçe olarak kalır, bulut gölgesi ve güneş parlaması geçerlidir.

**Files:**
- Create: `globe/src/scene/light.ts`, `globe/src/scene/sun-glare.ts`
- Modify: `globe/src/scene/earth.ts`, `globe/src/scene/atmosphere.ts`, `globe/src/scene/engine.ts`
- Test: `globe/test/light.test.ts`, `globe/test/scene-materials.test.ts`

**Interfaces:**
- Consumes: `Effects` (Task 1).
- Produces:
  - `light.ts`: `twilightAmount(ndl: number): number` = `smoothstep(-0.18, 0, ndl) * (1 - smoothstep(0, 0.12, ndl))`; `smoothstep(e0, e1, x)`; `CLOUD_SHADOW_K = 0.015`; `cloudShadowShift(sun: Vec3, normal: Vec3, k?: number): { du: number; dv: number }` — `east = normalize(cross([0,1,0], normal))`, `north = cross(normal, east)`, `sunT = sun − normal·dot(normal, sun)`, `coslat = max(sqrt(1 − normal.y²), 0.05)`, `du = (k · dot(sunT, east) / coslat) / (2π)`, `dv = k · dot(sunT, north) / π` (UV offset toward the sun: the shadow of a cloud falls on the ground away from the sun, so the ground samples the cloud map displaced toward the sun).
  - Earth uniforms `uTwilight`, `uCloudShadow` (0/1) and `Earth.setLight(e: { twilight: boolean; cloudShadow: boolean }): void`; Atmosphere uniform `uTwilight` and `Atmosphere.setTwilight(on: boolean): void`.
  - `sun-glare.ts`: `createSunGlare(): { mesh: Mesh; setSun(dir: [number, number, number]): void; setVisible(v: boolean): void; dispose(): void }`.

- [ ] **Step 1: Failing tests** — `globe/test/light.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cloudShadowShift, smoothstep, twilightAmount } from "../src/scene/light";

describe("twilightAmount", () => {
  it("is zero deep in day and night, peaks at the terminator", () => {
    expect(twilightAmount(-0.4)).toBe(0);
    expect(twilightAmount(0.3)).toBe(0);
    expect(twilightAmount(0)).toBeCloseTo(1, 9);
  });
  it("rises through the night side and falls through the day side, continuously", () => {
    expect(twilightAmount(-0.09)).toBeGreaterThan(twilightAmount(-0.15));
    expect(twilightAmount(0.06)).toBeLessThan(twilightAmount(0.0));
    expect(twilightAmount(0.06)).toBeGreaterThan(twilightAmount(0.11));
  });
  it("smoothstep clamps", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 9);
  });
});

describe("cloudShadowShift", () => {
  const k = 0.02;
  it("sun to the east of a point on the equator shifts the lookup east (+u)", () => {
    const { du, dv } = cloudShadowShift([1, 0, 0], [0, 0, 1], k);
    expect(du).toBeCloseTo(k / (2 * Math.PI), 9);
    expect(dv).toBeCloseTo(0, 9);
  });
  it("sun to the north shifts the lookup north (+v)", () => {
    const { du, dv } = cloudShadowShift([0, 1, 0], [0, 0, 1], k);
    expect(du).toBeCloseTo(0, 9);
    expect(dv).toBeCloseTo(k / Math.PI, 9);
  });
  it("sun straight overhead casts no offset", () => {
    const { du, dv } = cloudShadowShift([0, 0, 1], [0, 0, 1], k);
    expect(du).toBeCloseTo(0, 12);
    expect(dv).toBeCloseTo(0, 12);
  });
  it("stays finite at the poles", () => {
    const r = cloudShadowShift([1, 0, 0], [0, 1, 0], k);
    expect(Number.isFinite(r.du) && Number.isFinite(r.dv)).toBe(true);
  });
});
```
In `scene-materials.test.ts`: assert `Earth` exposes `uTwilight`/`uCloudShadow` in `createEarth().uniforms`, `earth.setLight({ twilight: false, cloudShadow: true })` sets them to 0 / 1 (the existing "every uniform declared in EARTH_FRAG exists" test must keep passing), and that `createAtmosphere()` has `setTwilight`. Sun glare: `createSunGlare()` is a mesh with `visible` toggled by `setVisible`, positioned along `setSun` direction (unit direction × 30), and `dispose()` does not throw.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`globe/src/scene/light.ts`:
```ts
import type { Vec3 } from "../geo3d/vec";

export const CLOUD_SHADOW_K = 0.015; // radians of apparent cloud-to-ground displacement (a visual cue, not physical scale)

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Warm band around the terminator (mirrored in earth.ts and atmosphere.ts GLSL). */
export const twilightAmount = (ndl: number): number => smoothstep(-0.18, 0, ndl) * (1 - smoothstep(0, 0.12, ndl));

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** UV displacement toward the sun used to sample the cloud map for the ground shadow (mirrored in earth.ts GLSL). */
export function cloudShadowShift(sun: Vec3, normal: Vec3, k = CLOUD_SHADOW_K): { du: number; dv: number } {
  const east = norm(cross([0, 1, 0], normal));
  const north = cross(normal, east);
  const d = dot(normal, sun);
  const sunT: Vec3 = [sun[0] - normal[0] * d, sun[1] - normal[1] * d, sun[2] - normal[2] * d];
  const coslat = Math.max(Math.sqrt(Math.max(0, 1 - normal[1] * normal[1])), 0.05);
  return { du: (k * dot(sunT, east)) / coslat / (2 * Math.PI), dv: (k * dot(sunT, north)) / Math.PI };
}
```
(At the exact poles `cross([0,1,0], normal)` is the zero vector and `norm` returns the unit `[0,1,0]`-style fallback; the result stays finite, which the test pins.)

`earth.ts` shader additions (all inside `EARTH_FRAG`/`main`, with `// art:light` comments):
```glsl
uniform float uTwilight;
uniform float uCloudShadow;
float smooth01(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
```
After `float dayAmt = …;`:
```glsl
  float tw = uTwilight * smooth01(-0.18, 0.0, ndl) * (1.0 - smooth01(0.0, 0.12, ndl));
```
Cloud shadow right after `float cloud = …;` and before `albedo` is built:
```glsl
  if (uCloudShadow > 0.5 && uHasTex > 0.5) {
    vec3 eastW = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-6, 0.0, 0.0));
    vec3 northW = cross(N, eastW);
    vec3 sunT = uSunDir - N * dot(N, uSunDir);
    float coslat = max(sqrt(max(0.0, 1.0 - N.y * N.y)), 0.05);
    vec2 sh = vec2(dot(sunT, eastW) / coslat / (2.0 * PI), dot(sunT, northW) / PI) * 0.015;
    float shadow = textureGrad(uClouds, vec2(uv.x + uCloudDrift + sh.x, uv.y + sh.y), gx, gy).r;
    dayCol *= 1.0 - 0.35 * shadow * dayAmt * (1.0 - cloud);
  }
```
(`dayCol` is declared `vec3 dayCol = …` earlier; keep it non-const.) Twilight contribution just before the final tone mapping line: `col += vec3(1.0, 0.55, 0.35) * tw * 0.35;`. `createEarth` adds `uTwilight: { value: 0 }`, `uCloudShadow: { value: 0 }` to `uniforms` and the `EarthUniforms` type, `setLight(e)` sets them from booleans, and nothing else changes (the `Earth` interface gains `setLight`).

`atmosphere.ts`: add `uniform float uTwilight;` to FRAG; compute `float nd = dot(normalize(vWN), uSunDir); float tw = uTwilight * smoothstep(-0.18, 0.0, nd) * (1.0 - smoothstep(0.0, 0.12, nd));` then `float i = pow(rim, uPower) * uIntensity * max(sunSide, tw * 0.9); vec3 col = mix(uColor, vec3(1.0, 0.55, 0.35), tw * 0.7); gl_FragColor = vec4(col * i, 1.0);`. Add the uniform (`uTwilight: { value: 0 }`) and `setTwilight(on) { uniforms.uTwilight.value = on ? 1 : 0; }` to the `Atmosphere` interface.

`sun-glare.ts`:
```ts
import { AdditiveBlending, Mesh, PlaneGeometry, ShaderMaterial } from "three";

const DISTANCE = 30; // inside the camera far plane (50): the Earth in front hides it through the depth test

const VERT = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize; // camera-facing billboard
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float core = 1.0 / (1.0 + pow(r * 7.0, 2.0));
  float halo = exp(-r * 2.8) * 0.35;
  float ring = exp(-pow((r - 0.62) * 9.0, 2.0)) * 0.10;
  float edge = 1.0 - smoothstep(0.85, 1.0, r);
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * (core + halo + ring) * edge, 1.0);
}
`;

export interface SunGlare {
  mesh: Mesh;
  setSun(dir: [number, number, number]): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function createSunGlare(): SunGlare {
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: { uSize: { value: 14 } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, blending: AdditiveBlending, depthTest: true, depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    setSun(dir) {
      const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      mesh.position.set((dir[0] / l) * DISTANCE, (dir[1] / l) * DISTANCE, (dir[2] / l) * DISTANCE);
    },
    setVisible(v) {
      mesh.visible = v;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```
`engine.ts` (`// art:light`): create `const glare = createSunGlare(); scene.add(glare.mesh);` (not in `earthGroup`: the sun lives in the inertial frame); in `frameBody` after `earth.setSun(sun)` add `glare.setSun(sun);`; in `setEffects(e)` add `earth.setLight({ twilight: e.twilight, cloudShadow: e.cloudShadow }); atmosphere.setTwilight(e.twilight); glare.setVisible(e.glare);`; in `dispose()` `glare.dispose()`. Because `setEffects` may arrive after the first frame, also initialise with all three off (the uniforms default to 0 / invisible).

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Controller visual check:** compare with `?art=0` (old look). Check: warm band follows the terminator and moves with time; cloud shadows visible on the day side without turning it muddy; glare appears when the sun is near the limb and vanishes behind the Earth; day side brightness not noticeably reduced (tune `0.35` shadow strength, `0.35` twilight gain, `uSize` if needed); no console errors; FPS ≥ 55. Record tuning in the spec notes table.

- [ ] **Step 6: Commit**
```bash
git add globe
git commit -m "art(light): twilight band, cloud shadows and sun glare"
```

---

### Task 4: Real star map (needs download approval)

**Files:**
- Create: `globe/src/scene/star-uv.ts`, `globe/public/textures/stars-4k.jpg` (after approval)
- Modify: `globe/src/scene/space.ts`, `globe/src/scene/textures.ts`, `globe/src/scene/engine.ts`, `globe/src/styles.css` (none), `NOTICE`
- Test: `globe/test/star-uv.test.ts`, `globe/test/scene-materials.test.ts`

- [ ] **Step 0 (controller): approved download and conversion.** NASA SVS "Deep Star Maps 2020" (public domain), celestial (ICRF/J2000) coordinates, plate carrée, **centred on 0 h right ascension with right ascension increasing to the left**: `https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.exr` (4096×2048, ≈ 34 MB, only EXR is published; no JPG). Already shown to the user for approval (record the answer). After approval: `curl -sSL -C - -o /private/tmp/claude-504/starmap_2020_4k.exr <url>` (retry the resume loop until the size matches `content-length`), convert the linear HDR EXR to an 8-bit sRGB JPEG with a mild highlight roll-off, e.g. `ffmpeg -y -i starmap_2020_4k.exr -vf "format=gbrpf32le,zscale=transfer=linear:npl=100,tonemap=hable:desat=0,zscale=transfer=bt709,format=yuvj420p" -q:v 3 globe/public/textures/stars-4k.jpg` (if the ffmpeg build lacks `zscale`, use Python Pillow/NumPy instead: read with ffmpeg to 16-bit PNG, then `out = np.clip(lin / (1 + lin), 0, 1) ** (1/2.2)`), check `sips -g pixelWidth -g pixelHeight` = 4096×2048 and the file is a few MB, delete the temporary EXR. If the user declines or the conversion fails, skip this task (mark it in the notes table) and continue with Task 5.

**Interfaces:**
- Produces: `star-uv.ts`: `starUV(dir: [number, number, number]): { u: number; v: number }` (inertial frame: right ascension `α = atan2(x, z)` measured from +z toward +x, declination `δ = asin(y)`; NASA convention — map centred on 0 h with RA increasing to the left — gives `u = fract(0.5 − α / 2π)`, `v = (δ + π/2) / π`); `Space.setStarMap(tex: Texture | null): void`; `loadStarMap(): Promise<Texture | null>` in `textures.ts` (returns null on failure, never throws).

- [ ] **Step 1: Failing tests** — `globe/test/star-uv.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { starUV } from "../src/scene/star-uv";

describe("starUV", () => {
  it("the celestial poles map to the top/bottom rows", () => {
    expect(starUV([0, 1, 0]).v).toBeCloseTo(1, 9);
    expect(starUV([0, -1, 0]).v).toBeCloseTo(0, 9);
    expect(starUV([0, 0, 1]).v).toBeCloseTo(0.5, 9);
  });
  it("NASA convention: 0 h at the centre, right ascension increases to the left", () => {
    expect(starUV([0, 0, 1]).u).toBeCloseTo(0.5, 9); // RA 0 h
    expect(starUV([1, 0, 0]).u).toBeCloseTo(0.25, 9); // RA 6 h
    expect(starUV([0, 0, -1]).u).toBeCloseTo(0, 9); // RA 12 h (image edge)
    expect(starUV([-1, 0, 0]).u).toBeCloseTo(0.75, 9); // RA 18 h
  });
});
```
`scene-materials.test.ts`: `createSpace()` exposes `setStarMap`; calling it with `null` keeps the procedural stars (`uHasStarMap` 0) and with a `Texture` sets 1; `dispose()` does not throw.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `star-uv.ts`:
```ts
export function starUV(dir: [number, number, number]): { u: number; v: number } {
  const [x, y, z] = dir;
  const l = Math.hypot(x, y, z) || 1;
  const a = Math.atan2(x, z); // right ascension from +z toward +x
  let u = 0.5 - a / (2 * Math.PI); // NASA map: 0 h at the centre, RA increasing to the left
  u -= Math.floor(u);
  return { u, v: (Math.asin(Math.max(-1, Math.min(1, y / l))) + Math.PI / 2) / Math.PI };
}
```
`space.ts` stars fragment shader: add `uniform sampler2D uStarMap; uniform float uHasStarMap;`, and in `main` after `dir`:
```glsl
  vec3 col = starLayer(dir, 90.0, 0.965, 0.30) + starLayer(dir, 40.0, 0.985, 0.38) * 1.4;
  if (uHasStarMap > 0.5) {
    float a = atan(dir.x, dir.z) / 6.28318530718;
    float u = fract(0.5 - a); // NASA convention: 0 h at the centre, RA increasing to the left
    float v = (asin(clamp(dir.y, -1.0, 1.0)) + 1.57079632679) / 3.14159265359;
    // seam-safe derivatives (same trick as the Earth shader)
    vec2 uv = vec2(u, v);
    vec2 uvB = vec2(fract(u + 0.5), v);
    vec2 dxA = dFdx(uv), dyA = dFdy(uv), dxB = dFdx(uvB), dyB = dFdy(uvB);
    bool useB = max(abs(dxA.x), abs(dyA.x)) > max(abs(dxB.x), abs(dyB.x));
    vec3 map = textureGrad(uStarMap, uv, useB ? dxB : dxA, useB ? dyB : dyA).rgb;
    col = map * 1.15;
  }
  gl_FragColor = vec4(col, 1.0);
```
(replace the existing two lines `vec3 col = …; gl_FragColor = …;`). Uniforms: `uStarMap: { value: null }`, `uHasStarMap: { value: 0 }`. `Space.setStarMap(tex)` sets texture/flag (and `tex.wrapS = RepeatWrapping; tex.colorSpace = NoColorSpace` handled in `loadStarMap`). `textures.ts`:
```ts
export async function loadStarMap(load: (url: string) => Promise<Texture> = (u) => new TextureLoader().loadAsync(u)): Promise<Texture | null> {
  try {
    const t = await load("/textures/stars-4k.jpg");
    t.colorSpace = NoColorSpace;
    t.wrapS = RepeatWrapping;
    return t;
  } catch (e) {
    console.warn("[textures] star map unavailable", e);
    return null;
  }
}
```
Add a test for `loadStarMap` (success sets `colorSpace`/`wrapS`; a rejected loader resolves to `null` and warns once — spy on `console.warn`). `engine.ts` (`// art:stars`): after creating `space`, `loadStarMap().then((t) => { if (disposed) { t?.dispose(); return; } if (t) { starTex = t; space.setStarMap(effects?.starMap === false ? null : t); } });`; keep `let starTex: Texture | null = null;` so `setEffects(e)` can toggle `space.setStarMap(e.starMap ? starTex : null)`; dispose `starTex` in `dispose()`. `NOTICE`: add the NASA Deep Star Maps attribution line.

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Controller visual check:** the sky must look like the real sky: verify orientation with known features — the band of the Milky Way should look continuous (no seam, no mirrored text-like patterns), the north celestial pole direction (camera looking along +y from the origin side is not reachable; instead compare with an astronomy reference using `sunDirection` at the March equinox: the Sun should sit in front of the constellation Pisces/Aquarius region and the Milky Way centre (Sagittarius, RA ≈ 17h45m, Dec ≈ −29°) should be opposite to the Sun at the equinox's December solstice…). Practical check: compare the sky with a real star chart of Orion (RA 5h30m, Dec −5°) and Cassiopeia (RA 1h, Dec +60°); the W of Cassiopeia and Orion's belt orientation must not be mirrored. If the sky is mirrored, the inertial frame handedness is the cause: fix `starUV` and the shader together (mirror u: `u = fract(0.5 + a/2π)`) and say so in the notes table. Verify `?art=0` shows the procedural stars again and FPS ≥ 55.

- [ ] **Step 6: Commit**
```bash
git add globe NOTICE
git commit -m "art(stars): NASA Deep Star Maps sky behind the Earth"
```

---

### Task 5: Aurora (optional, default off)

**Files:**
- Create: `globe/src/scene/aurora.ts`
- Modify: `globe/src/scene/engine.ts`
- Test: `globe/test/aurora.test.ts`, `globe/test/scene-materials.test.ts`

**Interfaces:**
- Produces: `auroraBand(latDeg: number): number` = `smoothstep(58, 66, |lat|) * (1 − smoothstep(76, 82, |lat|))`; `createAurora(): { mesh: Mesh; setSun(dir: [number, number, number]): void; setTime(sec: number): void; setVisible(v: boolean): void; dispose(): void }`. The shell is a child of `earthGroup`? **No** — the sun lives in the inertial frame while the Earth turns, so the shell must be in the Earth-fixed frame (child of `earthGroup`) and receive the sun direction in the object frame: pass the world-space sun and use `modelMatrix` in the shader (as the Earth shader does with `vWorldN`).

- [ ] **Step 1: Failing tests** — `globe/test/aurora.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { auroraBand, createAurora } from "../src/scene/aurora";

describe("auroraBand", () => {
  it("lives in the auroral ovals only, symmetric north/south", () => {
    expect(auroraBand(0)).toBe(0);
    expect(auroraBand(45)).toBe(0);
    expect(auroraBand(70)).toBeCloseTo(1, 9);
    expect(auroraBand(-70)).toBeCloseTo(1, 9);
    expect(auroraBand(88)).toBe(0);
  });
  it("fades in and out smoothly", () => {
    expect(auroraBand(62)).toBeGreaterThan(auroraBand(59));
    expect(auroraBand(79)).toBeLessThan(auroraBand(75));
  });
});

describe("createAurora", () => {
  it("is hidden by default and can be shown, timed and disposed", () => {
    const a = createAurora();
    expect(a.mesh.visible).toBe(false);
    a.setVisible(true);
    a.setSun([1, 0, 0]);
    a.setTime(12.5);
    expect(a.mesh.visible).toBe(true);
    expect(() => a.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** `globe/src/scene/aurora.ts`:
```ts
import { AdditiveBlending, FrontSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";

export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Auroral oval weight by latitude (mirrored in the shader). */
export const auroraBand = (latDeg: number): number => {
  const a = Math.abs(latDeg);
  return smooth(58, 66, a) * (1 - smooth(76, 82, a));
};

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorldN;
varying vec3 vWorldPos;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vObj;
varying vec3 vWorldN;
varying vec3 vWorldPos;
#define PI 3.14159265359

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float sm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

void main() {
  vec3 d = normalize(vObj);
  float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float lon = atan(d.x, d.z);
  float band = sm(58.0, 66.0, abs(lat)) * (1.0 - sm(76.0, 82.0, abs(lat)));
  float night = 1.0 - sm(-0.05, 0.12, dot(normalize(vWorldN), uSunDir));
  // curtains: vertical streaks along longitude drifting slowly
  float curtain = noise(vec2(lon * 9.0 + uTime * 0.05, lat * 0.4)) * 0.6 + noise(vec2(lon * 23.0 - uTime * 0.08, lat * 1.1)) * 0.4;
  curtain = smoothstep(0.35, 0.85, curtain);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(normalize(vWorldN), V), 0.0), 1.4); // curtains read best near the limb
  float h = clamp((abs(lat) - 60.0) / 20.0, 0.0, 1.0);
  vec3 col = mix(vec3(0.15, 1.0, 0.45), vec3(0.65, 0.3, 1.0), h);
  float i = band * night * curtain * (0.25 + 0.75 * rim) * (0.75 + 0.25 * sin(uTime * 0.7 + lon * 3.0));
  gl_FragColor = vec4(col * i * 0.9, 1.0);
}
`;

export interface Aurora {
  mesh: Mesh;
  setSun(dir: [number, number, number]): void;
  setTime(sec: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function createAurora(): Aurora {
  const uniforms = { uSunDir: { value: new Vector3(1, 0, 0) }, uTime: { value: 0 } };
  const geometry = new SphereGeometry(1.014, 96, 64);
  const material = new ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: AdditiveBlending,
    side: FrontSide, depthTest: true, depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    setSun(dir) {
      uniforms.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
    },
    setTime(sec) {
      uniforms.uTime.value = sec % 10000;
    },
    setVisible(v) {
      mesh.visible = v;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```
`engine.ts` (`// art:aurora`): `const aurora = createAurora(); earthGroup.add(aurora.mesh);` (Earth-fixed child); in `frameBody` after the sun is computed: `aurora.setSun(sun); aurora.setTime(rel(f.nowSec));`; in `setEffects(e)`: `aurora.setVisible(e.aurora)`; `dispose()` `aurora.dispose()`. The shell is hidden by default, so a disabled aurora costs nothing.

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Controller visual check:** press `A` on the night side with a camera that sees a polar region (drag the globe): green→purple curtains in the 62–78° bands only on the night side, no hard edge at the terminator; `A` off removes them; HUD shows `AURORA · ILLUSTRATIVE` while on; when quality level rises to 1 (simulate by lowering FPS or temporarily forcing `setPerf(30, 1)` in the console-free way via the existing quality controller) the aurora switches off. Note tuning in the spec notes table.

- [ ] **Step 6: Commit**
```bash
git add globe
git commit -m "art(aurora): optional decorative polar curtains (A, default off)"
```

---

### Task 6: Music theory and score (pure)

**Files:**
- Create: `globe/src/audio/theory.ts`, `globe/src/audio/score.ts`
- Test: `globe/test/theory.test.ts`, `globe/test/score.test.ts`

**Interfaces:**
- Consumes: `GlobeModel` (`flights[*]`: `dep`, `end`, `status`, `from`, `to`, `regionIdx`, `planned`), `REGIONS` from `@web/data/palette`. These files must **not** import anything from `globe/src/scene/*` or Three.js (revertability: the audio module stands alone).
- Produces:
  - `theory.ts`: `BPM = 96`, `BEAT_SEC = 60/96`, `BEATS_PER_CHORD = 16`; `interface Chord { name: string; root: number; third: number; fifth: number }` (semitones above A); `PROGRESSION: Chord[]` (Am, F, C, G); `chordAtBeat(beat: number): Chord`; `chordAtTime(sec: number): Chord`; `type RegionName = (typeof REGIONS)[number]`; `interface RegionMusic { scale: number[]; perBeat: number; swing: number; octaves: [number, number]; followChord?: boolean }`; `REGION_MUSIC: Partial<Record<RegionName, RegionMusic>>`; `hasMusic(r: RegionName): boolean`; `routeKey(from: string | undefined, to: string | undefined, id: string): string` (`"min-max"` when both airports are known, else the flight id); `routeHash(key: string): number` (FNV-1a 32-bit); `octaveFor(distKm: number): 2 | 3 | 4 | 5`; `freqOf(oct: number, semis: number): number` (`110 · 2^(oct−2) · 2^(semis/12)`); `pickNote(region, key, distKm, chord, beat, kind): number | null`; `stepSec(region)`, `slotIndex(sec, region)`, `slotTime(region, index)`.
  - `score.ts`: `MAX_RANGE_SEC = 600`, `LOOKAHEAD_SEC = 0.06`, `MAX_NOTES_PER_STEP = 2`; `interface ScoreEvent { kind: "dep" | "arr"; key: string; regionIdx: number; distKm: number; at: number }`; `eventsBetween(m: GlobeModel, from: number, to: number): ScoreEvent[]`; `interface PlannedNote { when: number; region: RegionName; freq: number; vel: number; kind: "dep" | "arr"; key: string }`; `velocityFor(n: number): number`; `planNotes(events: ScoreEvent[], nowSec: number): PlannedNote[]`.

- [ ] **Step 1: Failing tests** — `globe/test/theory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REGIONS } from "@web/data/palette";
import {
  BEAT_SEC, BEATS_PER_CHORD, BPM, PROGRESSION, REGION_MUSIC, chordAtBeat, chordAtTime, freqOf, hasMusic, octaveFor,
  pickNote, routeHash, routeKey, slotIndex, slotTime, stepSec,
} from "../src/audio/theory";

const A_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]); // pitch classes of natural A minor above A

describe("clock and harmony", () => {
  it("96 BPM and a four-chord loop of 16 beats each", () => {
    expect(BPM).toBe(96);
    expect(BEAT_SEC).toBeCloseTo(0.625, 12);
    expect(BEATS_PER_CHORD).toBe(16);
    expect(PROGRESSION.map((c) => c.name)).toEqual(["Am", "F", "C", "G"]);
    expect(chordAtBeat(0).name).toBe("Am");
    expect(chordAtBeat(15).name).toBe("Am");
    expect(chordAtBeat(16).name).toBe("F");
    expect(chordAtBeat(32).name).toBe("C");
    expect(chordAtBeat(48).name).toBe("G");
    expect(chordAtBeat(64).name).toBe("Am");
    expect(chordAtBeat(-5).name).toBe("Am");
    expect(chordAtTime(16 * BEAT_SEC + 0.01).name).toBe("F");
  });
  it("every chord tone and every region scale stays inside A natural minor", () => {
    for (const c of PROGRESSION) for (const s of [c.root, c.third, c.fifth]) expect(A_MINOR.has(((s % 12) + 12) % 12)).toBe(true);
    for (const m of Object.values(REGION_MUSIC)) for (const s of m!.scale) expect(A_MINOR.has(s)).toBe(true);
  });
  it("octaves follow the distance buckets", () => {
    expect([7000, 4000, 2000, 500, 6000, 1000].map(octaveFor)).toEqual([2, 3, 4, 5, 3, 4]);
  });
  it("freqOf anchors A2 = 110 Hz", () => {
    expect(freqOf(2, 0)).toBe(110);
    expect(freqOf(3, 0)).toBe(220);
    expect(freqOf(2, 12)).toBeCloseTo(220, 9);
  });
  it("keys are order-independent; hashes are stable", () => {
    expect(routeKey("JFK", "IST", "x")).toBe("IST-JFK");
    expect(routeKey("IST", undefined, "f7")).toBe("f7");
    expect(routeHash("IST-JFK")).toBe(routeHash("IST-JFK"));
  });
});

describe("rhythm grids are integer fractions of the beat, so the polyrhythm never drifts", () => {
  const at = (r: (typeof REGIONS)[number], k: number) => slotTime(r, k);
  it("coincide with whole beats", () => {
    expect(at("DOM", 3)).toBeCloseTo(3 * BEAT_SEC, 12);
    expect(at("EUR", 4)).toBeCloseTo(2 * BEAT_SEC, 12);
    expect(at("AFR", 6)).toBeCloseTo(2 * BEAT_SEC, 12);
    expect(at("ASI", 8)).toBeCloseTo(2 * BEAT_SEC, 12);
    expect(at("AME", 1)).toBeCloseTo(2 * BEAT_SEC, 12);
  });
  it("step sizes", () => {
    expect(stepSec("EUR")).toBeCloseTo(BEAT_SEC / 2, 12);
    expect(stepSec("AFR")).toBeCloseTo(BEAT_SEC / 3, 12);
    expect(stepSec("ASI")).toBeCloseTo(BEAT_SEC / 4, 12);
    expect(stepSec("AME")).toBeCloseTo(BEAT_SEC * 2, 12);
  });
  it("the Middle East swings its off-steps late; others do not", () => {
    expect(slotTime("MEA", 0)).toBe(0);
    expect(slotTime("MEA", 1)).toBeCloseTo(BEAT_SEC / 2 + 0.25 * (BEAT_SEC / 2), 12);
    expect(slotTime("EUR", 1)).toBeCloseTo(BEAT_SEC / 2, 12);
  });
  it("slotIndex picks the first slot at or after the time", () => {
    expect(slotIndex(0, "EUR")).toBe(0);
    expect(slotIndex(0.01, "EUR")).toBe(1);
    expect(slotIndex(BEAT_SEC / 2, "EUR")).toBe(1);
  });
});

describe("pickNote", () => {
  it("is deterministic and drawn from the region scale at the clamped octave", () => {
    const f = pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "dep")!;
    expect(pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "dep")).toBe(f);
    expect(REGION_MUSIC.EUR!.scale.map((s) => freqOf(4, s)).some((x) => Math.abs(x - f) < 1e-9)).toBe(true);
  });
  it("clamps the octave into the region's range (Middle East 3–4, Asia 4–5)", () => {
    const low = pickNote("MEA", "IST-DXB", 9000, PROGRESSION[0], 0, "dep")!; // octaveFor = 2 → clamped to 3
    expect(REGION_MUSIC.MEA!.scale.map((s) => freqOf(3, s)).some((x) => Math.abs(x - low) < 1e-9)).toBe(true);
    const hi = pickNote("ASI", "IST-NRT", 200, PROGRESSION[0], 0, "dep")!; // octaveFor = 5, allowed
    expect(REGION_MUSIC.ASI!.scale.map((s) => freqOf(5, s)).some((x) => Math.abs(x - hi) < 1e-9)).toBe(true);
  });
  it("landings sound an octave lower when that stays audible", () => {
    const dep = pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "dep")!;
    expect(pickNote("EUR", "IST-FRA", 2000, PROGRESSION[0], 0, "arr")).toBeCloseTo(dep / 2, 9);
  });
  it("domestic follows the chord: root on even beats, fifth on odd beats, landings the fifth", () => {
    const am = PROGRESSION[0];
    expect(pickNote("DOM", "ESB-IST", 350, am, 0, "dep")).toBeCloseTo(freqOf(1, am.root), 9);
    expect(pickNote("DOM", "ESB-IST", 350, am, 1, "dep")).toBeCloseTo(freqOf(1, am.fifth), 9);
    expect(pickNote("DOM", "ESB-IST", 350, am, 0, "arr")).toBeCloseTo(freqOf(1, am.fifth), 9);
  });
  it("unknown region is silent", () => {
    expect(hasMusic("UNK")).toBe(false);
    expect(pickNote("UNK", "a-b", 100, PROGRESSION[0], 0, "dep")).toBeNull();
  });
});
```

`globe/test/score.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { BEAT_SEC, slotIndex, slotTime } from "../src/audio/theory";
import { LOOKAHEAD_SEC, MAX_NOTES_PER_STEP, MAX_RANGE_SEC, eventsBetween, planNotes, velocityFor, type ScoreEvent } from "../src/audio/score";
import { FROM, flight, makeDay } from "./helpers";

// regions: DOM 0, EUR 1, MEA 2, AFR 3, ASI 4, AME 5, UNK 6
const model = () =>
  buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", region: "AME", dep: FROM + 1000, arr: FROM + 5000, end: "LANDED", s: [[0, 300, 41, 29], [3000, 370, 45, -20]] }),
        flight({ from: "IST", to: "LHR", region: "EUR", dep: FROM + 2000, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 10]] }),
        flight({ from: "IST", to: "ESB", region: "DOM", dep: FROM + 3000, arr: FROM + 4000, end: "LAST_CONTACT", s: [[0, 300, 41, 29], [900, 100, 40, 33]] }),
      ],
    }),
  );
const ev = (o: Partial<ScoreEvent>): ScoreEvent => ({ kind: "dep", key: "IST-FRA", regionIdx: 1, distKm: 2000, at: 0, ...o });

describe("eventsBetween", () => {
  it("returns departures in (from, to] and arrivals only for landed flights", () => {
    const m = model();
    const e = eventsBetween(m, 500, 2500);
    expect(e.map((x) => [x.kind, x.key, x.at])).toEqual([["dep", "IST-JFK", 1000], ["dep", "IST-LHR", 2000]]);
    const arr = eventsBetween(m, 4500, 5100);
    expect(arr.map((x) => [x.kind, x.key, x.at])).toEqual([["arr", "IST-JFK", 5000]]);
  });
  it("last-contact and airborne flights never produce arrivals", () => {
    expect(eventsBetween(model(), 3500, 4500).some((x) => x.kind === "arr")).toBe(false);
  });
  it("the interval is open at the start and closed at the end", () => {
    const m = model();
    expect(eventsBetween(m, 1000, 1500)).toEqual([]);
    expect(eventsBetween(m, 900, 1000).length).toBe(1);
  });
  it("carries region index and distance; jumps and rewinds produce nothing", () => {
    const m = model();
    expect(eventsBetween(m, 500, 1500)[0]).toMatchObject({ regionIdx: 5, key: "IST-JFK" });
    expect(eventsBetween(m, 500, 1500)[0].distKm).toBeGreaterThan(7000);
    expect(eventsBetween(m, 0, MAX_RANGE_SEC + 1)).toEqual([]);
    expect(eventsBetween(m, 2500, 500)).toEqual([]);
  });
});

describe("velocityFor", () => {
  it("grows with the number of merged events and is capped at 1", () => {
    expect(velocityFor(1)).toBeCloseTo(0.65, 12);
    expect(velocityFor(2)).toBeGreaterThan(velocityFor(1));
    expect(velocityFor(10)).toBe(1);
  });
});

describe("planNotes", () => {
  it("places notes on the region grid, never earlier than now + lookahead", () => {
    const now = 3.1;
    const [n] = planNotes([ev({ regionIdx: 1 })], now);
    const idx = slotIndex(now + LOOKAHEAD_SEC, "EUR");
    expect(n.when).toBeCloseTo(slotTime("EUR", idx), 12);
    expect(n.when).toBeGreaterThanOrEqual(now + LOOKAHEAD_SEC);
    expect(n.region).toBe("EUR");
  });
  it("different regions land on their own grids (polyrhythm)", () => {
    const notes = planNotes([ev({ regionIdx: 1 }), ev({ regionIdx: 3, key: "IST-CAI" }), ev({ regionIdx: 4, key: "IST-NRT" })], 0.01);
    const by = Object.fromEntries(notes.map((n) => [n.region, n.when]));
    expect(by.ASI).toBeLessThan(by.AFR);
    expect(by.AFR).toBeLessThan(by.EUR);
  });
  it("at most MAX_NOTES_PER_STEP notes per region and step; extras raise the velocity", () => {
    const many = Array.from({ length: 5 }, (_, i) => ev({ key: `A${i}-IST`, regionIdx: 1 }));
    const notes = planNotes(many, 0);
    expect(notes).toHaveLength(MAX_NOTES_PER_STEP);
    expect(notes[0].vel).toBeCloseTo(velocityFor(5), 12);
    const single = planNotes([ev({})], 0);
    expect(notes[0].vel).toBeGreaterThan(single[0].vel);
  });
  it("arrivals are softer and an octave lower than departures", () => {
    const [d] = planNotes([ev({ kind: "dep" })], 0);
    const [a] = planNotes([ev({ kind: "arr" })], 0);
    expect(a.freq).toBeCloseTo(d.freq / 2, 9);
    expect(a.vel).toBeCloseTo(d.vel * 0.6, 12);
  });
  it("departures come before arrivals when a step overflows; UNK is silent; empty in, empty out", () => {
    const notes = planNotes([ev({ kind: "arr", key: "Z-IST" }), ev({ kind: "dep", key: "B-IST" }), ev({ kind: "dep", key: "A-IST" })], 0);
    expect(notes.map((n) => n.kind)).toEqual(["dep", "dep"]);
    expect(planNotes([ev({ regionIdx: 6 })], 0)).toEqual([]);
    expect(planNotes([], 0)).toEqual([]);
  });
  it("is deterministic", () => {
    const e = [ev({}), ev({ regionIdx: 2, key: "IST-DXB", distKm: 3000 })];
    expect(planNotes(e, 1.234)).toEqual(planNotes(e, 1.234));
    expect(BEAT_SEC).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd globe && npx vitest run test/theory.test.ts test/score.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `globe/src/audio/theory.ts`:

```ts
import { REGIONS } from "@web/data/palette";

export const BPM = 96;
export const BEAT_SEC = 60 / BPM;
export const BEATS_PER_CHORD = 16;

/** Semitones above A for each chord tone. */
export interface Chord {
  name: string;
  root: number;
  third: number;
  fifth: number;
}

export const PROGRESSION: Chord[] = [
  { name: "Am", root: 0, third: 3, fifth: 7 },
  { name: "F", root: 8, third: 0, fifth: 3 },
  { name: "C", root: 3, third: 7, fifth: 10 },
  { name: "G", root: 10, third: 2, fifth: 5 },
];

export function chordAtBeat(beat: number): Chord {
  const i = Math.floor(Math.max(0, beat) / BEATS_PER_CHORD) % PROGRESSION.length;
  return PROGRESSION[i];
}
export const chordAtTime = (sec: number): Chord => chordAtBeat(Math.floor(sec / BEAT_SEC));

export type RegionName = (typeof REGIONS)[number];

export interface RegionMusic {
  /** semitones above A, all inside natural A minor */
  scale: number[];
  /** grid steps per beat (integer fractions of the beat keep the polyrhythm aligned) */
  perBeat: number;
  /** delay of odd steps as a fraction of a step */
  swing: number;
  /** [min, max] octave (110·2^(oct−2) Hz anchors A2); equal = fixed register */
  octaves: [number, number];
  followChord?: boolean;
}

export const REGION_MUSIC: Partial<Record<RegionName, RegionMusic>> = {
  DOM: { scale: [], perBeat: 1, swing: 0, octaves: [1, 1], followChord: true },
  EUR: { scale: [0, 3, 5, 7, 10], perBeat: 2, swing: 0, octaves: [3, 5] },
  MEA: { scale: [0, 3, 5, 7, 8], perBeat: 2, swing: 0.25, octaves: [3, 4] },
  AFR: { scale: [0, 3, 5, 7, 10], perBeat: 3, swing: 0, octaves: [4, 5] },
  ASI: { scale: [0, 2, 3, 7, 8], perBeat: 4, swing: 0, octaves: [4, 5] },
  AME: { scale: [0, 5, 7, 10], perBeat: 0.5, swing: 0, octaves: [3, 3] },
};

export const hasMusic = (r: RegionName): boolean => !!REGION_MUSIC[r];

export function routeKey(from: string | undefined, to: string | undefined, id: string): string {
  return from && to ? (from < to ? `${from}-${to}` : `${to}-${from}`) : id;
}

/** FNV-1a, 32-bit. */
export function routeHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function octaveFor(distKm: number): 2 | 3 | 4 | 5 {
  if (distKm > 6000) return 2;
  if (distKm >= 3000) return 3;
  if (distKm >= 1000) return 4;
  return 5;
}

export const freqOf = (oct: number, semis: number): number => 110 * 2 ** (oct - 2) * 2 ** (semis / 12);

export function pickNote(region: RegionName, key: string, distKm: number, chord: Chord, beat: number, kind: "dep" | "arr"): number | null {
  const m = REGION_MUSIC[region];
  if (!m) return null;
  if (m.followChord) return freqOf(m.octaves[0], kind === "arr" || beat % 2 !== 0 ? chord.fifth : chord.root);
  const oct = Math.min(m.octaves[1], Math.max(m.octaves[0], octaveFor(distKm)));
  const f = freqOf(oct, m.scale[routeHash(key) % m.scale.length]);
  return kind === "arr" && f / 2 >= 55 ? f / 2 : f;
}

export const stepSec = (region: RegionName): number => BEAT_SEC / (REGION_MUSIC[region]?.perBeat ?? 1);
export const slotIndex = (sec: number, region: RegionName): number => Math.ceil(sec / stepSec(region) - 1e-9);
export function slotTime(region: RegionName, index: number): number {
  const step = stepSec(region);
  const swing = REGION_MUSIC[region]?.swing ?? 0;
  return index * step + (index % 2 !== 0 ? swing * step : 0);
}
```

`globe/src/audio/score.ts`:
```ts
import { REGIONS } from "@web/data/palette";
import type { GlobeModel } from "../model/globe-model";
import { BEAT_SEC, chordAtBeat, hasMusic, pickNote, routeKey, slotIndex, slotTime, type RegionName } from "./theory";

export const MAX_RANGE_SEC = 600;
export const LOOKAHEAD_SEC = 0.06;
export const MAX_NOTES_PER_STEP = 2;

export interface ScoreEvent {
  kind: "dep" | "arr";
  key: string;
  regionIdx: number;
  distKm: number;
  /** flight time, seconds relative to window.from */
  at: number;
}

/** Departures and landings (landed flights only) inside (from, to]; big jumps and rewinds yield nothing. */
export function eventsBetween(m: GlobeModel, from: number, to: number): ScoreEvent[] {
  if (!(to > from) || to - from > MAX_RANGE_SEC) return [];
  const out: ScoreEvent[] = [];
  for (const f of m.flights) {
    const key = routeKey(f.from, f.to, f.id);
    const distKm = f.planned?.distKm ?? 1500;
    if (f.dep > from && f.dep <= to) out.push({ kind: "dep", key, regionIdx: f.regionIdx, distKm, at: f.dep });
    if (f.status === "LANDED" && f.end > from && f.end <= to) out.push({ kind: "arr", key, regionIdx: f.regionIdx, distKm, at: f.end });
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface PlannedNote {
  when: number;
  region: RegionName;
  freq: number;
  vel: number;
  kind: "dep" | "arr";
  key: string;
}

export const velocityFor = (n: number): number => Math.min(1, 0.5 + 0.15 * n);

/** Maps events to notes on each region's grid; extra simultaneous events raise velocity instead of adding notes. */
export function planNotes(events: ScoreEvent[], nowSec: number): PlannedNote[] {
  const start = nowSec + LOOKAHEAD_SEC;
  const groups = new Map<string, { region: RegionName; idx: number; evs: ScoreEvent[] }>();
  for (const e of events) {
    const region = REGIONS[e.regionIdx];
    if (!region || !hasMusic(region)) continue;
    const idx = slotIndex(start, region);
    const gk = `${region}:${idx}`;
    const g = groups.get(gk);
    if (g) g.evs.push(e);
    else groups.set(gk, { region, idx, evs: [e] });
  }
  const out: PlannedNote[] = [];
  for (const { region, idx, evs } of groups.values()) {
    evs.sort((a, b) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "dep" ? -1 : 1));
    const when = slotTime(region, idx);
    const beat = Math.floor(when / BEAT_SEC);
    const chord = chordAtBeat(beat);
    const vel = velocityFor(evs.length);
    for (const e of evs.slice(0, MAX_NOTES_PER_STEP)) {
      const freq = pickNote(region, e.key, e.distKm, chord, beat, e.kind);
      if (freq === null) continue;
      out.push({ when, region, freq, vel: e.kind === "arr" ? vel * 0.6 : vel, kind: e.kind, key: e.key });
    }
  }
  return out.sort((a, b) => a.when - b.when || a.region.localeCompare(b.region));
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add globe
git commit -m "art(sound): music theory, rhythm grids and score planning (pure)"
```

---

### Task 7: Instruments and sound engine

**Files:**
- Create: `globe/src/audio/instruments.ts`, `globe/src/audio/engine.ts`
- Test: `globe/test/route-sound.test.ts`

**Interfaces:**
- Consumes: `PlannedNote`, `ScoreEvent`, `planNotes` (Task 6); `PROGRESSION`, `chordAtTime`, `freqOf`, `REGIONS`.
- Produces:
  - `instruments.ts`: `interface NoteOpts { gainScale: number; cutoffScale: number; pan: number }`; `playNote(ctx: AudioContext, dest: AudioNode, n: PlannedNote, o: NoteOpts): void`.
  - `engine.ts`: `interface SoundFocus { regionIdx: number | null; alt100: number }`; `interface RouteSound { setEnabled(on: boolean): void; schedule(events: ScoreEvent[], focus?: SoundFocus | null, pans?: Map<string, { pan: number; visible: boolean }>): void; setEnergy(e: number): void; dispose(): void }`; `createRouteSound(opts?: { createContext?: () => AudioContext }): RouteSound`.

Instrument recipes (all synthesised per note; the gain envelope peak is `0.22 · vel · gainScale`, doubled decay for landings `kind === "arr"`; every oscillator `start(when)` / `stop(when + attack + decay + 0.1)`; a per-note `GainNode` → `StereoPannerNode` → `dest`):
- **DOM** (kick-like pulse): sine, frequency `2·f → f` over 60 ms (`exponentialRampToValueAtTime`), attack 0.005, decay 0.45.
- **EUR** (vibraphone): sine `f` (decay 1.4) + sine `4·f` at 0.25 peak (decay 0.35); attack 0.004.
- **MEA** (oud): sawtooth `f` → lowpass (cutoff `3200·cutoffScale` falling to `600·cutoffScale` over 0.25 s, Q 0.8), decay 0.9; for departures a grace note first: same recipe at `f / 2^(2/12)`, `when − 0.07`, 0.35 × velocity.
- **AFR** (kalimba): sine `f` (decay 0.6) + sine `2.76·f` at 0.35 peak (decay 0.18).
- **ASI** (koto): triangle, frequency `1.02·f → f` over 30 ms, lowpass `4200·cutoffScale`, decay 0.75.
- **AME** (strings pad): two sawtooth at `f` detuned ±5 cents, lowpass `900·cutoffScale`, attack 1.2, decay 2.6.

Engine behaviour:
- No `AudioContext` until `setEnabled(true)` (browser autoplay rule). Default `createContext = () => new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()`; everything wrapped so a missing/blocked Web Audio makes the module a silent no-op, never an exception.
- Graph: `master` (gain 0) → `DynamicsCompressor` (threshold −24, ratio 4) → destination; `bus` → `dry` (0.7) → `master` and `bus` → `convolver` (generated 2.5 s stereo noise impulse with exponential decay) → `wet` (0.3) → `master`; notes and the bed connect to `bus`.
- Chord bed: three sine/triangle oscillators (root octave 2, third and fifth octave 3) → lowpass 500 Hz → `bedGain` → `bus`; `setEnergy(e)` (e clamped to 0..1) sets `bedGain` target `0.035 · e^0.7` (`setTargetAtTime`, 0.8 s) and, when `chordAtTime(ctx.currentTime)` changed since the last call, glides the three oscillator frequencies to the new chord (`setTargetAtTime(freq, now, 1.2)`).
- `schedule(events, focus, pans)`: ignored while disabled or before the context exists; otherwise `planNotes(events, ctx.currentTime)` and `playNote` for each planned note with `gainScale = focus?.regionIdx == null ? 1 : (REGIONS.indexOf(n.region) === focus.regionIdx ? 1.6 : 0.7)`, `cutoffScale = focus matches ? 0.6 + 0.8 · clamp(alt100/410, 0, 1) : 1`, `pan = clamp(pans.get(n.key)?.pan ?? 0, −1, 1)` and a ×0.3 gain factor when `pans.get(n.key)?.visible === false`.
- `setEnabled(true)`: lazily build everything, `ctx.resume()`, ramp `master` to 1 (`setTargetAtTime(1, t, 0.25)`), register a `visibilitychange` handler (suspend when hidden and enabled, resume when visible); if the context stays `suspended` (autoplay blocked), install one-shot `pointerdown`/`keydown` listeners that `resume()` and remove themselves. `setEnabled(false)`: ramp `master` to 0, then `suspend()` after ~1 s.
- `dispose()`: stop and disconnect bed oscillators, remove listeners, `close()` the context; safe to call twice and before any enable.

- [ ] **Step 1: Failing tests** — `globe/test/route-sound.test.ts` (hand-written fake audio graph; every node records connections; params record calls):

```ts
import { describe, expect, it, vi } from "vitest";
import { BEAT_SEC, freqOf } from "../src/audio/theory";
import { createRouteSound } from "../src/audio/engine";
import type { ScoreEvent } from "../src/audio/score";

class P {
  value = 0;
  calls: { fn: string; args: number[] }[] = [];
  setValueAtTime = vi.fn((...a: number[]) => { this.calls.push({ fn: "set", args: a }); });
  linearRampToValueAtTime = vi.fn((...a: number[]) => { this.calls.push({ fn: "lin", args: a }); });
  exponentialRampToValueAtTime = vi.fn((...a: number[]) => { this.calls.push({ fn: "exp", args: a }); });
  setTargetAtTime = vi.fn((...a: number[]) => { this.value = a[0]; this.calls.push({ fn: "target", args: a }); });
  cancelScheduledValues = vi.fn();
}
class Node { connect = vi.fn((x: unknown) => x); disconnect = vi.fn(); }
class Osc extends Node { type = "sine"; frequency = new P(); detune = new P(); start = vi.fn(); stop = vi.fn(); onended: (() => void) | null = null; }
class Gain extends Node { gain = new P(); }
class Filt extends Node { type = "lowpass"; frequency = new P(); Q = new P(); }
class Pan extends Node { pan = new P(); }
class Conv extends Node { buffer: unknown = null; }
class Comp extends Node { threshold = new P(); ratio = new P(); attack = new P(); release = new P(); knee = new P(); }

function fakeCtx() {
  const c = {
    state: "suspended" as string,
    currentTime: 0,
    sampleRate: 48000,
    destination: new Node(),
    oscs: [] as Osc[],
    gains: [] as Gain[],
    pans: [] as Pan[],
    createOscillator() { const o = new Osc(); c.oscs.push(o); return o; },
    createGain() { const g = new Gain(); c.gains.push(g); return g; },
    createBiquadFilter: () => new Filt(),
    createStereoPanner() { const p = new Pan(); c.pans.push(p); return p; },
    createConvolver: () => new Conv(),
    createDynamicsCompressor: () => new Comp(),
    createBuffer: (ch: number, len: number) => ({ numberOfChannels: ch, length: len, getChannelData: () => new Float32Array(len) }),
    resume: vi.fn(async () => { c.state = "running"; }),
    suspend: vi.fn(async () => { c.state = "suspended"; }),
    close: vi.fn(async () => { c.state = "closed"; }),
  };
  return c;
}
const make = () => {
  const ctx = fakeCtx();
  const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext });
  return { ctx, s };
};
const BED_OSCS = 3;
const ev = (regionIdx: number, o: Partial<ScoreEvent> = {}): ScoreEvent => ({ kind: "dep", key: "IST-FRA", regionIdx, distKm: 2000, at: 0, ...o });

describe("route sound engine", () => {
  it("creates no audio context until enabled (autoplay rule); scheduling while disabled does nothing", () => {
    const create = vi.fn(() => fakeCtx() as unknown as AudioContext);
    const s = createRouteSound({ createContext: create });
    s.schedule([ev(1)]);
    s.setEnergy(0.5);
    expect(create).not.toHaveBeenCalled();
    s.dispose();
  });

  it("enabling builds the graph, resumes the context and starts the three-oscillator chord bed", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.oscs).toHaveLength(BED_OSCS);
    s.dispose();
    expect(ctx.close).toHaveBeenCalled();
  });

  it("each continent plays its own instrument (oscillator layout per note)", () => {
    const counts: Record<string, number> = {};
    for (const [name, region] of [["DOM", 0], ["EUR", 1], ["MEA", 2], ["AFR", 3], ["ASI", 4], ["AME", 5]] as const) {
      const { ctx, s } = make();
      s.setEnabled(true);
      const before = ctx.oscs.length;
      s.schedule([ev(region)]);
      counts[name] = ctx.oscs.length - before;
      s.dispose();
    }
    expect(counts).toEqual({ DOM: 1, EUR: 2, MEA: 2, AFR: 2, ASI: 1, AME: 2 });
  });

  it("unknown-region events stay silent", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    const before = ctx.oscs.length;
    s.schedule([ev(6)]);
    expect(ctx.oscs.length).toBe(before);
    s.dispose();
  });

  it("the focused continent is louder than the others", () => {
    const peak = (focusRegion: number | null) => {
      const { ctx, s } = make();
      s.setEnabled(true);
      const before = ctx.gains.length;
      s.schedule([ev(1)], { regionIdx: focusRegion, alt100: 300 });
      const lin = ctx.gains.slice(before).flatMap((g) => g.gain.calls.filter((c) => c.fn === "lin").map((c) => c.args[0]));
      s.dispose();
      return Math.max(...lin);
    };
    expect(peak(1)).toBeGreaterThan(peak(null));
    expect(peak(null)).toBeGreaterThan(peak(4));
  });

  it("pans notes from the screen map and quietens back-side routes", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    const before = ctx.pans.length;
    s.schedule([ev(1)], null, new Map([["IST-FRA", { pan: -0.4, visible: true }]]));
    expect(ctx.pans[before].pan.value).toBeCloseTo(-0.4, 9);
    s.dispose();
  });

  it("the chord bed follows the progression: Am → F after 16 beats", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    s.setEnergy(0.6);
    ctx.currentTime = 16 * BEAT_SEC + 0.1;
    s.setEnergy(0.6);
    const rootTargets = ctx.oscs[0].frequency.calls.filter((c) => c.fn === "target").map((c) => c.args[0]);
    expect(rootTargets.some((f) => Math.abs(f - freqOf(2, 8)) < 1e-6)).toBe(true); // F root, octave 2
    s.dispose();
  });

  it("disabling fades the master out and suspends later; dispose is idempotent", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    s.setEnabled(false);
    expect(ctx.gains[0].gain.calls.some((c) => c.fn === "target" && c.args[0] === 0)).toBe(true);
    s.dispose();
    expect(() => s.dispose()).not.toThrow();
  });

  it("a missing Web Audio implementation never throws", () => {
    const s = createRouteSound({ createContext: () => { throw new Error("no audio"); } });
    expect(() => { s.setEnabled(true); s.schedule([ev(1)]); s.setEnergy(1); s.dispose(); }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** `instruments.ts` and `engine.ts` exactly per the recipes and engine behaviour above. Implementation notes: build the per-note envelope with a helper `env(g: GainNode, t: number, peak: number, attack: number, decay: number)`: `g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)`; make landings' decay `×2` and peak `×1` (their velocity is already ×0.6); each oscillator's `onended` disconnects its per-note chain; the first `GainNode` created by `playNote` per oscillator is the envelope gain whose `linearRampToValueAtTime` first argument is the peak (the tests read it). The bed oscillators for the chord: root `freqOf(2, chord.root)`, third `freqOf(3, chord.third)`, fifth `freqOf(3, chord.fifth)`. Impulse response: stereo `Float32Array`s `(Math.random()*2−1) · (1 − i/len)^3`, length `2.5 · sampleRate`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add globe
git commit -m "art(sound): per-continent instruments, chord bed and Web Audio engine"
```

---

### Task 8: Sound wiring in the controller (`M`)

**Files:**
- Modify: `globe/src/app/controller.ts`
- Test: `globe/test/controller.test.ts`

**Interfaces:**
- Consumes: Task 1 (`effectsFor`, `pushEffects`), Task 2 (`buildCorridors`), Task 6 (`eventsBetween`, `routeKey`), Task 7 (`createRouteSound`, `RouteSound`).
- Produces: optional controller deps `sound?: RouteSound` and `viewportWidth?: () => number` (tests inject a stub; production defaults: `createRouteSound()` and `window.innerWidth`).

Behaviour (`// art:sound` markers at each integration line):
- `pushEffects()` (Task 1): `const e = effectsFor(art, perf.level); d.engine.setEffects(e); if (e.sound !== soundOn) { soundOn = e.sound; sound.setEnabled(e.sound); prevSoundCur = null; }`.
- Every `frame()` while `soundOn && model`: `cur` as computed for the frame; `if (prevSoundCur !== null) { const ev = eventsBetween(model, prevSoundCur, cur); if (ev.length) sound.schedule(ev, soundFocus(), pans); } prevSoundCur = cur;` (`eventsBetween` already ignores backwards moves, pauses and jumps > 600 s such as rewind blends, scrubs and data-window shifts).
- `pans` (a `Map<string, { pan: number; visible: boolean }>`) is refreshed every HUD tick for the busiest 40 corridors (cached `buildCorridors(model)` per model): `pan = clamp((x − vw/2)/(vw/2), −1, 1)` from `engine.screenOf(midLat, midLon)` where the midpoint is `interpolateGreatCircle(fromLat, fromLon, toLat, toLon, 0.5)` (`@collector/geo`), `visible` from the same call.
- `soundFocus()` = while following: `{ regionIdx: followedFlight.regionIdx, alt100: latest telemetry alt100 }`, else `null`.
- Every HUD tick while sound is on: `sound.setEnergy(clamp01(base.counters.airborne / 150))`.
- Data swap: shift `prevSoundCur -= next.from − prev.from` next to the other window shifts (`liveFrozen`, follow clock).
- `onKey("m")` toggles through the existing art plumbing (Task 1); `dispose()` calls `sound.dispose()`.

- [ ] **Step 1: Failing tests** (stub sound: `{ setEnabled: vi.fn(), schedule: vi.fn(), setEnergy: vi.fn(), dispose: vi.fn() }`; extend `setup` with `sound?: RouteSound` and `viewportWidth` passed through to `createController`):
```ts
  it("M turns the sound on and off through the stub; nothing is scheduled while it is off", async () => {
    const sound = { setEnabled: vi.fn(), schedule: vi.fn(), setEnergy: vi.fn(), dispose: vi.fn() };
    const h = setup({ sound });
    await flush();
    h.frame(0.3);
    expect(sound.schedule).not.toHaveBeenCalled();
    h.c.onKey("m");
    expect(sound.setEnabled).toHaveBeenLastCalledWith(true);
    h.c.onKey("m");
    expect(sound.setEnabled).toHaveBeenLastCalledWith(false);
    h.c.dispose();
    expect(sound.dispose).toHaveBeenCalled();
  });

  it("in a replay the departure of the routed flight is scheduled as a note on its corridor", async () => {
    const sound = { setEnabled: vi.fn(), schedule: vi.fn(), setEnergy: vi.fn(), dispose: vi.fn() };
    const h = setup({ sound });
    await flush();
    h.c.onKey("m");
    h.c.onKey("r"); // REPLAY: 24 h in 180 s → 480 s of flight time per second
    for (let i = 0; i < 200; i++) h.frame(1);
    const events = sound.schedule.mock.calls.flatMap((c) => c[0] as { kind: string; key: string; regionIdx: number }[]);
    expect(events.some((e) => e.kind === "dep" && e.key === "IST-JFK" && e.regionIdx === 5)).toBe(true);
    h.c.dispose();
  });

  it("publishes the airborne energy while on and keeps the stub quiet while off", async () => {
    const sound = { setEnabled: vi.fn(), schedule: vi.fn(), setEnergy: vi.fn(), dispose: vi.fn() };
    const h = setup({ sound });
    await flush();
    h.frame(0.3);
    expect(sound.setEnergy).not.toHaveBeenCalled();
    h.c.onKey("m");
    h.frame(0.3);
    expect(sound.setEnergy).toHaveBeenCalled();
    const e = sound.setEnergy.mock.calls.at(-1)![0] as number;
    expect(e).toBeGreaterThanOrEqual(0);
    expect(e).toBeLessThanOrEqual(1);
    h.c.dispose();
  });

  it("jumps (scrubs, rewinds) never flood the score", async () => {
    const sound = { setEnabled: vi.fn(), schedule: vi.fn(), setEnergy: vi.fn(), dispose: vi.fn() };
    const h = setup({ sound });
    await flush();
    h.c.onKey("m");
    h.frame(0.1);
    h.c.onKey("ArrowLeft"); // one-hour scrub: a 3600 s jump
    h.frame(0.1);
    expect(sound.schedule).not.toHaveBeenCalled();
    h.c.dispose();
  });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** per the behaviour list above; wrap nothing in try/catch beyond what the audio engine already guarantees (the stub and real engine never throw).

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Listening check (user):** open the page, press `M`; confirm `SOUND ON` in the HUD and no console errors; then ask the user to listen in a REPLAY (`R`): each continent should sound different (vibraphone Europe, oud Middle East, kalimba Africa, koto Asia, strings pad Americas, deep pulse domestic), the rhythms should interlock without drifting, the chord should move every ≈ 10 s, and quiet hours should thin out. Record their feedback and any gain/cutoff/velocity/tempo changes in the spec notes table.

- [ ] **Step 6: Commit**
```bash
git add globe
git commit -m "art(sound): wire the continent orchestra into the controller (M)"
```

---

### Task 9: Ensemble extension — 8-chord harmony, piano (west/north Europe), Istanbul ney

**Files:**
- Modify: `globe/src/audio/theory.ts`, `globe/src/audio/score.ts`, `globe/src/audio/instruments.ts`, `globe/src/audio/engine.ts`
- Test: `globe/test/theory.test.ts`, `globe/test/score.test.ts`, `globe/test/route-sound.test.ts`

Spec: `docs/superpowers/specs/2026-10-07-globe-art-light-corridors-design.md` §4b (updated: progression, piano, ney, roles). The `audio/` files still must not import from `globe/src/scene/*` or Three.js (`@collector/regions` and `@collector/geo` are fine).

**Interfaces:**
- `theory.ts`:
  - `BEATS_PER_CHORD = 8`; `PROGRESSION` = Am, F, C, G, Am, **Dm** (`{ name: "Dm", root: 5, third: 8, fifth: 0 }`), F, G (8 chords, period 64 beats); `chordAtBeat` / `chordAtTime` use the new length.
  - `type Instrument = RegionName | "PNO" | "NEY" | "CLA" | "SAX" | "TPT"`; `REGION_MUSIC` is replaced by `INSTRUMENT_MUSIC: Partial<Record<Instrument, RegionMusic>>` (keep `REGION_MUSIC` as an alias export of the same object so existing imports keep working) with two new entries: `PNO: { scale: [], perBeat: 2, swing: 0, octaves: [3, 5], arpeggio: true }` and `NEY: { scale: [], perBeat: 1, swing: 0, octaves: [4, 4], melody: true }` (add optional `arpeggio?: boolean`, `melody?: boolean` to `RegionMusic`); `hasMusic(i: Instrument)`, `stepSec`, `slotIndex`, `slotTime` accept `Instrument`.
  - `isWestNorth(lat: number, lon: number): boolean` = `lon < 20 || lat > 52`.
  - `const NEY_MOTIF = [0, 3, 2, 0, 7, 10, 0, 5]` (semitones above A; A C B A E G A D).
  - `snapToChord(semis: number, chord: Chord): number` — pitch class (0..11) of the chord tone (root/third/fifth, each `mod 12`) with the smallest circular distance to `semis mod 12`; ties → the lower pitch class.
  - `neyNote(slot: number, beat: number, chord: Chord, kind: "dep" | "arr"): number` — `semis = NEY_MOTIF[((slot % 8) + 8) % 8]`; when `beat % 4 === 0` it is replaced by `snapToChord(semis, chord)`; frequency `freqOf(kind === "arr" ? 3 : 4, semis)`.
  - `pianoNote(key: string, distKm: number, chord: Chord, kind): number` — tones `[chord.root, chord.third, chord.fifth, chord.root + 12]`, index `routeHash(key) % 4`, octave `clamp(octaveFor(distKm), 3, 5)`, `freqOf(oct, tone)`; landings an octave lower when that stays ≥ 55 Hz.
  - `pickNote(instrument, key, distKm, chord, beat, kind)` keeps its signature but takes `Instrument`; for `PNO` it returns `pianoNote(...)`; `NEY` is handled by `neyNote` in the score (it needs the slot), so `pickNote("NEY", …)` returns `null`.
- `score.ts`:
  - `ScoreEvent` gains `farLat?: number; farLon?: number; istanbul: boolean`. In `eventsBetween`: `istanbul` is true for a departure whose `f.from` is an Istanbul airport (`isIstanbul` from `@collector/regions`) and for a landing whose `f.to` is one; `farLat/farLon` are the coordinates of the end that is NOT the Istanbul end taken from `f.planned` (`toLat/toLon` when `f.from` is Istanbul, otherwise `fromLat/fromLon`; if neither end is Istanbul use the `to` end; undefined without `planned`).
  - `PlannedNote.region` becomes `instrument: Instrument` (rename the field everywhere: score, engine, tests).
  - `instrumentFor(e: ScoreEvent): Instrument | null` — `REGIONS[e.regionIdx]`; when that is `"EUR"` and `farLat/farLon` are finite and `isWestNorth(farLat, farLon)` → `"PNO"`; `null` when the region has no music.
  - `planNotes(events, nowSec)`: for every event, (1) the continent note exactly as before but with `instrumentFor(e)` (piano uses the same grid/grouping/`MAX_NOTES_PER_STEP`/velocity rules as the other instruments); (2) when `e.istanbul`, additionally a **NEY** note on the NEY grid: group by NEY slot, at most **1** ney note per slot (departures before landings, then key order), velocity `velocityFor(count)` (landings ×0.6), frequency `neyNote(slotIndex, beat, chord, e.kind)` where `slotIndex = slotIndex(start, "NEY")`, `when = slotTime("NEY", slotIndex)`, `beat = Math.floor(when / BEAT_SEC)`, `chord = chordAtBeat(beat)`. The ney melody therefore advances with **time**, not with the event count.
- `instruments.ts`: two new recipes in `playNote` (same envelope helper; peak `0.22 · vel · gainScale`; landings' decay ×2):
  - **PNO** (piano): triangle `f` (decay 2.0) + sine `2f` at 0.4 peak (decay 1.2) + sine `3f` at 0.15 peak (decay 0.7); attack 0.003; lowpass `5000 · cutoffScale` on the sum.
  - **NEY**: a note-long vibrato oscillator pair — sine `f` and triangle `f` at 0.5 peak (frequency `0.97·f → f` over 80 ms), a vibrato LFO (5 Hz, depth 12 cents applied to `detune`, starting after 0.15 s), lowpass `2400 · cutoffScale`, plus **breath noise**: a short white-noise `AudioBufferSource` (0.5 s buffer built once per engine and cached in a WeakMap by context) through a bandpass at `f` (Q 2) at 0.18 peak; attack 0.12, decay 1.4 (landing 2.8).
- `engine.ts`: `instrumentRegionIdx(i: Instrument): number | null` (`PNO` → the `EUR` index, `NEY` → `null`, regions → their `REGIONS.indexOf`) used for the focus boost (a followed European flight boosts both its vibraphone and piano; ney is never boosted but its filter still scales with altitude only when the followed flight has an Istanbul end — keep it simple: ney ignores focus).

- [ ] **Step 1: Failing tests** (update the existing files; keep every still-valid assertion):
  - `theory.test.ts`: progression names `["Am","F","C","G","Am","Dm","F","G"]`; `chordAtBeat(8).name === "F"`, `(16) "C"`, `(24) "G"`, `(32) "Am"`, `(40) "Dm"`, `(48) "F"`, `(56) "G"`, `(64) "Am"`; the "inside A minor" test now also covers `Dm` (root 5, third 8, fifth 0) and the scales of `PNO`/`NEY` (empty scales are fine; check `NEY_MOTIF` values are all in the A-minor pitch-class set); `chordAtTime(8 * BEAT_SEC + 0.01).name === "F"`; `isWestNorth`: London (51.5, −0.5) true, Madrid (40.4, −3.7) true, Stockholm (59.6, 18.0) true, Athens (37.9, 23.7) false, Bucharest (44.4, 26.1) false, Moscow (55.9, 37.4) true (lat > 52 — documents the rule), Belgrade (44.8, 20.3) false; `snapToChord`: against Am chord (0,3,7) → `snapToChord(2, Am) === 3`? (distance to 3 is 1, to 0 is 2 → 3), `snapToChord(10, Am) === 7` (G → E at 3 vs A at 2: A pc 0 distance 2, E pc 7 distance 3 → returns 0; compute by hand and assert the true result), tie rule; `neyNote`: weak beat keeps the motif note (`neyNote(1, 1, Am, "dep")` = `freqOf(4, 3)`), strong beat snaps (`neyNote(5, 4, Am, "dep")`: motif[5]=10 snapped to the nearest Am tone — assert by hand), slots wrap mod 8 and negative slots are safe, landings use octave 3; `pianoNote`: deterministic, the frequency is one of `[root, third, fifth, root+12]` at the clamped octave for the given chord, landings an octave lower; `pickNote("NEY", …)` is `null`; `hasMusic("PNO")`/`hasMusic("NEY")` true.
  - `score.test.ts`: `eventsBetween` sets `istanbul` correctly (outbound dep true, its landing abroad false; an inbound flight's departure false, its landing at IST true) and `farLat/farLon` (IST→JFK: JFK coordinates for both events; JFK→IST: JFK coordinates too); `planNotes` routes a west-European event (far end London) to `"PNO"`, an east-European one (far end Athens) to `"EUR"`; an Istanbul-end event yields an extra `"NEY"` note whose `when` lies on the NEY (quarter-note) grid; at most one NEY note per slot; the NEY frequency for the same slot is identical whatever the route key (melody follows time); events without `istanbul` produce no NEY note; all previously valid expectations (grid alignment, ≤ 2 per step, arrivals softer/lower) still hold with the `instrument` field name.
  - `route-sound.test.ts`: oscillator counts per instrument for a single event: `PNO` 3, `NEY` 2 (plus one `AudioBufferSourceNode` for the breath noise — extend the fake context with `createBufferSource()` and `createBuffer` already exists; count buffer sources separately), existing instruments unchanged; focus: a followed European flight (region idx 1) boosts a `PNO` note too; the NEY note ignores focus.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** per the interfaces above (reuse `freqOf`, `octaveFor`, `routeHash`; keep functions pure; update the `REGIONS`-based lookups in `planNotes`/engine to `Instrument`).
- [ ] **Step 4: Run to verify pass** — `cd globe && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Step 5: Commit**
```bash
git add globe
git commit -m "art(sound): 8-chord harmony, piano for west/north Europe and an Istanbul ney melody"
```
- [ ] **Step 6: Listening check (user):** with `M` on in a REPLAY, the ney should carry a recognisable 8-note tune on the beat whenever Istanbul traffic is busy, the piano should arpeggiate the current chord for west/north European routes, and the chord should move every ≈ 5 s through Am F C G Am Dm F G; record feedback and tweaks (ney breath/vibrato, piano brightness, levels) in the spec notes table.

---

### Task 10: Music v2 — four-section form, data-born ney melody, flowing piano, euclidean rhythm

**Files:**
- Create: `globe/src/audio/form.ts`, `globe/src/audio/melody.ts`
- Modify: `globe/src/audio/theory.ts`, `globe/src/audio/score.ts`, `globe/src/audio/instruments.ts`, `globe/src/audio/engine.ts`, `globe/src/app/controller.ts` (only the `schedule` call: pass the local hour)
- Test: `globe/test/form.test.ts`, `globe/test/melody.test.ts` (new); `globe/test/theory.test.ts`, `globe/test/score.test.ts`, `globe/test/route-sound.test.ts`, `globe/test/controller.test.ts` (update)

Spec: `docs/superpowers/specs/2026-10-07-globe-art-light-corridors-design.md` §4c (and §4b for what stays). The `audio/` files still must not import from `globe/src/scene/*` or Three.js. Everything pure stays pure; the only mutable music state lives in the engine (`NeyState`, piano arpeggio state, section epoch) and is advanced through the pure functions below.

**Interfaces:**
- `theory.ts`:
  - `Chord` gains `seventh?: number; ninth?: number` (semitones above A). Replace `PROGRESSION`/`BEATS_PER_CHORD`/`BPM`/`BEAT_SEC` usage by per-section data from `form.ts`; keep `BPM`/`BEAT_SEC`/`PROGRESSION` exported only if other code still needs them (otherwise remove and update tests) — the DAY section's tempo is 96.
  - `euclid(k: number, n: number): boolean[]` (Bjorklund / even spacing; `euclid(5, 8)` = `[true,false,true,true,false,true,true,false]`, `euclid(3, 8)` = `[true,false,false,true,false,false,true,false]`, `euclid(2, 4)` = `[true,false,true,false]`; `k ≥ n` → all true; `k ≤ 0` → all false; always `n` long and exactly `k` trues).
  - `PATTERNS: Partial<Record<Instrument, boolean[]>>`: DOM `euclid(2,4)`, EUR `euclid(5,8)`, MEA `euclid(3,8)`, AFR `euclid(5,12)`, ASI `euclid(5,16)`, PNO `euclid(6,8)`; AME and NEY have no pattern.
  - `nextActiveSlot(instrument: Instrument, slot: number): number` — first slot index `≥ slot` whose step (`slot mod pattern length`) is active; instruments without a pattern return `slot`.
  - `stepSec(inst, bpm)`, `slotIndex(sec, inst, bpm)`, `slotTime(inst, index, bpm)` take the tempo explicitly (`beatSec = 60 / bpm`), times are relative to the section epoch (the caller adds the epoch).
  - `chordAtBeat(beat: number, progression: Chord[], beatsPerChord: number): Chord`.
- `form.ts`:
  - `type SectionId = "NIGHT" | "MORNING" | "DAY" | "EVENING"`; `interface Section { id: SectionId; bpm: number; progression: Chord[]; beatsPerChord: number; wet: number; maxNotes: number; neyOct: number; instruments: ReadonlySet<Instrument> }` and `SECTIONS: Record<SectionId, Section>` with exactly the spec §4c table (NIGHT 72 BPM `[Am(add9), Am9, Fmaj7, Gsus4]` instruments `NEY, AME, PNO, DOM` maxNotes 1 wet 0.45 neyOct 3; MORNING 84 `[Am, F, C, G]` + `EUR, AFR, ASI, CLA` maxNotes 2 wet 0.35 neyOct 4; DAY 96 `[C, G, Am, F]` all instruments incl. `MEA, CLA, TPT` maxNotes 2 wet 0.25 neyOct 4; EVENING 80 `[Dm, Am, F, C, Dm, F, G, Am]` instruments `NEY, AME, PNO, EUR, MEA, DOM, CLA, SAX` maxNotes 2 wet 0.40 neyOct 4); `beatsPerChord = 8` everywhere. Chords (semitones above A, tones as `root/third/fifth/seventh/ninth`): Am 0/3/7/10/2, Am(add9) 0/3/7/–/2, Am9 0/3/7/10/2, F 8/0/3 (Fmaj7 seventh 7), C 3/7/10 (Cmaj7 seventh 2), G 10/2/5 (Gsus4 = third 3 instead of 2: 10/3/5), Dm 5/8/0 (seventh 3). All tones must lie in the A-natural-minor pitch classes `{0,2,3,5,7,8,10}`.
  - `istanbulHour(absUnixSec: number): number` = `((absUnixSec / 3600 + 3) mod 24)` normalised to `[0, 24)`; `sectionAt(localHour: number): Section` — `[0,6)` NIGHT, `[6,12)` MORNING, `[12,18)` DAY, `[18,24)` EVENING (hours wrap with `mod 24`).
- `melody.ts`:
  - `NEY_LADDER`: the A-natural-minor degrees as absolute semitones above A2 (`[0,2,3,5,7,8,10]` repeated over octaves 0–3, i.e. 28 entries, each `+12·octave`), ladder index = scale-degree index; `ladderFreq(i)` = `110 · 2^(NEY_LADDER[i]/12)` (A2 = 110 Hz).
  - `interface NeyState { last: number; cell: number; restUntilBeat: number }`, `initNey(sec: Section): NeyState` (`last` = ladder index of A at the section's `neyOct`, `cell = 0`, `restUntilBeat = 0`).
  - `bearingOf(farLat: number, farLon: number): number` — initial bearing from Istanbul (41.2613, 28.742) with `initialBearing` from `@collector/geo`.
  - `contourFor(bearing: number): "up" | "down" | "arch"` (`|bearing − 0| < 30` or `|bearing − 180| < 30` → arch, else `< 180` → up, else down) and `stepFor(distKm: number): 1 | 2 | 3` (`< 1500` → 1, `< 4000` → 2, else 3).
  - `interface NeyNote { freq: number; slotOffset: number; vel: number; grace: boolean; long: boolean }`; `neyCell(e: { distKm: number; farLat?: number; farLon?: number; kind: "dep" | "arr" }, st: NeyState, chord: Chord, beat: number, sec: Section): { notes: NeyNote[]; state: NeyState }`:
    - while `beat < st.restUntilBeat` → `{ notes: [], state: st }` (phrase rest);
    - range: ladder indices `[lo, hi]` = `[7·(neyOct−2), 7·(neyOct−2) + 11]` (a ten-degree window above the section's base octave), all moves clamped/reflected into it;
    - first note `n0`: among ladder indices in `[lo, hi]` whose pitch class (`NEY_LADDER[i] mod 12`) is a chord tone (root/third/fifth and, when present, seventh/ninth) choose the one nearest to `st.last` with `n0 ≠ st.last` (ties → lower);
    - contour/step from `bearingOf` (`kind === "arr"`: the contour is reversed, arrivals are an octave-of-ladder lower but never below `lo`) and `stepFor(distKm)`; `up`: `n1 = n0 + step`, `n2 = n1 + (step ≥ 2 ? −1 : +1)`; `down`: mirrored; `arch`: `n1 = n0 + step`, `n2 = n0` moved one degree down; leap rule: after a step ≥ 2 the next move is one degree in the opposite direction (as written);
    - slot offsets `0, 1, 2` (consecutive eighth-note steps of the ney grid), velocities `0.8, 0.9, 0.7` times `vel` scaling applied by the caller; `grace = true` on the first note when `beat % 4 === 0` (strong beat);
    - phrase counter: after 4 cells (`st.cell === 3`) emit **instead of a cell** a single **cadence** note (`long: true`, slotOffset 0, velocity 1.0) on the chord **root or fifth** nearest `st.last` and set `restUntilBeat = beat + 2`, `cell = 0`; otherwise `cell + 1`;
    - state `last` = the last emitted ladder index.
  - `interface PianoState { i: number; chordKey: string }`, `initPiano(): PianoState`; `pianoNext(st: PianoState, chord: Chord, chordKey: string, oct: number): { notes: { freq: number; offsetSec: number }[]; state: PianoState }` — arpeggio pattern `[root, fifth, third + 12, fifth]` (semitones above A relative to the clamped octave `oct` in 3..5, `freq = freqOf(oct, tone)`); when `chordKey !== st.chordKey` return the **roll** `[root, fifth, third + 12]` with `offsetSec` `0, 0.03, 0.06` and `i = 3`; otherwise one note and `i + 1`.
  - **Wind ensemble (new, spec §4c):** extend `Instrument` with `"CLA" | "SAX" | "TPT"` (register them in `INSTRUMENT_MUSIC` with `perBeat: 2`, no pattern, no swing; they are driven by the ney cell, never by `pickNote`, which returns `null` for them). `NeyNote` gains `idx: number` (the ladder index it was built from). `windParts(cell: NeyNote[], chord: Chord, sec: Section): { instrument: "CLA" | "SAX" | "TPT"; freq: number; slotOffset: number; vel: number; long: boolean }[]` is a pure function applied to every emitted ney cell or cadence (a cell has `long === false` notes, a cadence is a single `long: true` note): for `"CLA" ∈ sec.instruments` and a normal cell → each note's ladder index `idx − 2` (diatonic third below) at `0.7 ×` its velocity, same slot offsets; for `"SAX" ∈ sec.instruments` → the **first** note of a normal cell and the cadence note at ladder index `idx − 4` (a fifth below), `long: true`, `0.6 ×` velocity; for `"TPT" ∈ sec.instruments` → only the cadence note at ladder index `idx + 7` (an octave up), `long: true`, `0.9 ×` velocity. Indices are clamped into `[0, NEY_LADDER.length − 1]` (reflect at the bounds); frequencies `ladderFreq(i)`. Winds inherit the ney's slots and phrase rests (they never play during a rest).
- `score.ts`:
  - `interface ScoreClock { epoch: number; section: Section; chordKey: string }`-free: keep `planNotes` pure with the new signature `planNotes(events: ScoreEvent[], nowSec: number, ctx: { epoch: number; section: Section; ney: NeyState; piano: PianoState }): { notes: PlannedNote[]; ney: NeyState; piano: PianoState }`.
  - Instruments not in `ctx.section.instruments` are dropped. Per instrument and grid slot the cap is `ctx.section.maxNotes` (NEY cells are not capped but obey the phrase rest). Event times are quantised: `start = nowSec + LOOKAHEAD_SEC − ctx.epoch`; `slot = nextActiveSlot(inst, slotIndex(start, inst, bpm))`; `when = ctx.epoch + slotTime(inst, slot, bpm)`; chord = `chordAtBeat(floor(slotBeat), progression, beatsPerChord)` with `slotBeat = slotTime / beatSec`.
  - NEY events (`e.istanbul`) go through `neyCell` (each note placed at `slot + slotOffset` on the NEY grid — NEY grid is 2 per beat now: `perBeat: 2`); PNO events through `pianoNext` (the `chordKey` is `chord.name` plus the chord's progression index); other instruments keep `pickNote` (their note selection from §4b is unchanged).
  - `PlannedNote` gains optional `grace?: boolean; long?: boolean; offsetSec?: number` (the piano roll offsets are added to `when`).
- `instruments.ts`: three new recipes — **CLA** (clarinet): sine `f` + sine `3f` at 0.33 peak + sine `5f` at 0.15 peak, attack 0.06, decay 1.0 (long ×2.5), lowpass `3000 · cutoffScale`, light vibrato (5 Hz, ±8 cent, after 0.2 s); **SAX**: sawtooth `f` through lowpass `1800 · cutoffScale`, slow amplitude "growl" (LFO 3 Hz depth 0.15 of the peak), delayed vibrato (5.5 Hz, ±20 cent after 0.25 s), breath noise at 0.1 peak through a bandpass at `f` (reuse the cached noise buffer), attack 0.05, decay 1.6 (long ×2.5); **TPT**: two sawtooth `f` and `f` detuned +6 cent through a lowpass sweeping `800 → 3500 · cutoffScale` over 80 ms, attack 0.04, decay 0.9 (long ×2.0). NEY honours `grace` (a note one ladder degree above at `when − 0.06`, 0.4 × velocity) and `long` (decay ×2.5); everything else unchanged.
- `engine.ts`: `schedule(events, focus, pans, localHour?)`; the engine keeps `section` (from `sectionAt(localHour ?? 12)`), `epoch` (audio time at the first schedule/section change: when `sectionAt(localHour).id` differs from the current, set `epoch = ctx.currentTime` and `neyState = initNey(section)`), `neyState`, `pianoState`; `setEnergy` uses the section's progression for the chord bed, now **four** oscillators (root oct 2; fifth oct 3; seventh — or third when absent — oct 3; ninth — or fifth when absent — oct 4) and sets the reverb wet gain target to `section.wet`; velocity is scaled by `0.6 + 0.4 · energy` (the last `setEnergy` value).
- `controller.ts`: `sound.schedule(ev, focus, pans, istanbulHour(model.from + cur))` (import `istanbulHour` from `../audio/form`).

- [ ] **Step 1: Failing tests** (write them from the interface contracts; hand-check every numeric expectation):
  - `form.test.ts`: `sectionAt` boundaries (`0 → NIGHT`, `5.99 → NIGHT`, `6 → MORNING`, `11.99 → MORNING`, `12 → DAY`, `18 → EVENING`, `23.99 → EVENING`, `24 → NIGHT`, `-1 → EVENING`), BPMs 72/84/96/80, `istanbulHour(0) === 3`, `istanbulHour(21 * 3600) === 0` (21:00 UTC = 00:00 Istanbul), instruments sets as specified (e.g. NIGHT has `NEY` and not `AFR`/`CLA`; MORNING has `CLA` but not `SAX`/`TPT`; DAY has `MEA`, `CLA`, `TPT` but not `SAX`; EVENING has `CLA`, `SAX` but not `TPT`), every chord tone of every progression ∈ A-minor pitch classes, progressions have 4/4/4/8 chords and `beatsPerChord === 8`.
  - `theory.test.ts`: `euclid` cases above and the counts (`euclid(5,12)` has 5 trues, length 12; `euclid(5,16)` 5 of 16), `nextActiveSlot("EUR", 1)` = 2 for `euclid(5,8)` (`[T,F,T,T,F,T,T,F]` → slot 1 inactive → 2), wraps (`nextActiveSlot("EUR", 8)` = 8), instruments without pattern return the same slot, tempo-aware `stepSec("EUR", 96)` = `0.625 / 2`, `slotTime("MEA", 1, 96)` keeps the swing; `chordAtBeat(9, DAY.progression, 8).name === "G"`; update/remove the old fixed-progression tests.
  - `melody.test.ts` (add): `windParts` per section — NIGHT returns `[]`; MORNING returns clarinet notes only (each ney note shifted two ladder degrees down, 0.7× velocity, same offsets); DAY returns clarinet notes for a normal cell and, for the cadence, the trumpet note an octave (7 degrees) above with `long: true` and no clarinet doubling of the cadence; EVENING returns clarinet notes plus one sax note (first note, five degrees down, `long: true`) per cell and a sax note on the cadence; ladder indices stay within bounds at the extremes.
  - `melody.test.ts`: `bearingOf` (IST→JFK ≈ 300°–310° west-northwest → contour `down`; IST→DXB ≈ 120° → `up`; IST→Moscow ≈ 40° → `up`; IST→JNB ≈ 190° → `arch`: compute with the real function and assert contour categories), `stepFor` thresholds, `neyCell` (a west flight produces three notes with ladder moves `−step`; an east flight `+step`; the first note is a chord tone and differs from `st.last`; all notes stay inside `[lo, hi]`; a leap ≥ 2 is followed by a one-degree move back; the 4th cell becomes a single `long` cadence note on the chord root or fifth and sets `restUntilBeat = beat + 2`; during the rest `notes` is empty; the strong-beat first note has `grace: true`; the same inputs give the same output), `pianoNext` (sequence of five calls on one chord = `[root, fifth, third+12, fifth, root]`; a new `chordKey` returns the three-note roll with offsets `0, 0.03, 0.06`).
  - `score.test.ts`: planning drops instruments outside the section (NIGHT drops AFR/ASI/EUR/MEA events, DAY keeps them); `maxNotes` per slot per instrument (1 at night, 2 by day); events land on active euclidean steps and on the instrument grid relative to the epoch (`when = epoch + slotTime(...)`); NEY events produce cells (3 notes on consecutive NEY slots) and thread `NeyState`; PNO events thread `PianoState` and produce a roll after a chord change; arrivals still softer and an octave lower for non-melodic instruments; determinism with equal inputs.
  - `route-sound.test.ts`: a section change (`schedule(..., localHour 13)` after `localHour 2`) resets the epoch and uses the DAY chord bed (the bed root glides to C: `freqOf(2, 3)`); the chord bed has four oscillators; the reverb wet target equals the section's `wet`; NIGHT ignores an `ASI` event (no new oscillators); the ney `grace` note adds one oscillator; single-note oscillator layouts for the new winds (clarinet 3 oscillators, saxophone 2 + its vibrato LFO + 1 buffer source, trumpet 2) and that DAY plays a trumpet on a cadence while MORNING does not; existing behaviours (no context before enable, focus boost, dispose) still hold.
  - `controller.test.ts`: the stub `schedule` receives `localHour` as the 4th argument and it equals `istanbulHour(model.from + cur)`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** per the contracts; keep helpers small and pure; update every call site and test of changed signatures; remove dead code (old fixed `NEY_MOTIF`, `neyNote`, `pianoNote`, `snapToChord` only if nothing else uses it — `snapToChord` may stay as a helper if `neyCell` uses chord-tone snapping).
- [ ] **Step 4: Run to verify pass** — `cd globe && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Step 5: Commit**
```bash
git add globe
git commit -m "art(sound): music v2 — four-section form, data-born ney melody, flowing piano, euclidean rhythm"
```
- [ ] **Step 6: Listening check (user):** REPLAY with `M` on: the night should be sparse and low (ney solo over the pad), the morning builds, midday is the brightest with the full ensemble, the evening winds down to a closing Am; the ney should tell a different tune every time (phrases of four little cells then a held note and a breath); the piano should flow in arpeggios and open each new chord. Record feedback and tuning (tempos, cell length, piano density, wet levels) in the spec notes table.

---

### Task 11: Music scope — routes → waves (replaces "AIRBORNE BY AIRCRAFT")

**Files:**
- Create: `globe/src/audio/notes-bus.ts`, `globe/src/audio/scope.ts`, `globe/src/hud/MusicScope.tsx`
- Modify: `globe/src/audio/engine.ts` (wall-clock planning, dry run, `onNote`, `info`), `globe/src/audio/instruments.ts` (only if needed for the time offset), `globe/src/scene/corridors.ts` (pulse), `globe/src/scene/engine.ts` (`pulseRoute`), `globe/src/app/controller.ts`, `globe/src/app/hud-model.ts` (remove `aircraftAirborne`/`aircraftBreakdown`/`TYPE_NAMES`, add `music`), `globe/src/hud/GlobeHud.tsx` (remove `AircraftBars`, add the scope), `globe/src/App.tsx` (create the bus), `globe/src/styles.css`
- Test: `globe/test/scope.test.ts`, `globe/test/notes-bus.test.ts` (new); `globe/test/route-sound.test.ts`, `globe/test/corridors.test.ts`, `globe/test/controller.test.ts`, `globe/test/hud.test.tsx`, `globe/test/follow-hud.test.ts` (update: it contains the `aircraftBreakdown` tests)

Spec: §4d. The `audio/` files still must not import from `globe/src/scene/*` or Three.js; `MusicScope.tsx` imports only audio-side pure modules and React.

**Interfaces:**
- `notes-bus.ts`: `interface NoteEvent { instrument: Instrument; freq: number; vel: number; kind: "dep" | "arr"; key: string; at: number; long?: boolean }` (`at` = wall-clock seconds when it sounds); `interface NoteBus { subscribe(fn: (n: NoteEvent) => void): () => void; emit(n: NoteEvent): void }`; `createNoteBus(): NoteBus` (same shape as `createLabelBus`).
- `scope.ts` (pure): `INSTRUMENT_COLOR: Record<Instrument, string>` (hex; EUR `#3FC8F2`, PNO `#9fe3ff`, MEA `#F7C548`, AFR `#7BD389`, ASI `#F2508F`, AME `#A98BFF`, DOM `#F2F4F8`, NEY `#E30A17`, CLA `#ff9f43`, SAX `#e8b64a`, TPT `#fff1cf`, UNK `#6B7280`); `LANE_ORDER: Instrument[]` (NEY, CLA, SAX, TPT, PNO, EUR, MEA, AFR, ASI, AME, DOM); `DECAY_SEC: Partial<Record<Instrument, number>>` (visual time constants: DOM 0.45, EUR 1.2, PNO 1.6, MEA 0.8, AFR 0.45, ASI 0.6, AME 2.2, NEY 1.1, CLA 0.9, SAX 1.4, TPT 0.8); `interface Lane { amp: number; phase: number; hz: number }`; `visualHz(freq: number): number` = `2 + 2 · log2(freq / 110)` clamped to `[1, 14]` (monotonic in pitch); `stepLane(l: Lane, dt: number, decaySec: number, hit?: { freq: number; vel: number }): Lane` — `amp *= exp(−dt / decaySec)`; a hit sets `amp = max(amp, vel)` and `hz = visualHz(freq)`; `phase += 2π · hz · dt` (phase continuous, wrapped to `[0, 2π)`); `laneSample(l: Lane): number` = `l.amp · sin(l.phase)`.
- `audio/engine.ts` (`RouteSound`): `createRouteSound({ createContext?, now? })` where `now: () => number` is wall-clock seconds (default `performance.now() / 1000`). `schedule(events, focus, pans, localHour)` **always plans** (section/epoch, `NeyState`, `PianoState` advance on the wall clock `now()`), emits a `NoteEvent` to subscribers for every planned note (`at = note.when`), and plays the notes **only when enabled and a context exists**, translating times: `ctxTime = ctx.currentTime + (note.when − now())` (clamped to `≥ ctx.currentTime`). `setEnergy` likewise records the energy always. New: `onNote(fn: (n: NoteEvent) => void): () => void` and `info(): { section: SectionId; chord: string; bpm: number; instruments: Instrument[] }` (chord = the chord name at the wall-clock now). Existing behaviours (no context before enable, autoplay resume, dispose idempotent, errors swallowed) stay.
- `corridors.ts`: instanced attribute `aPulse` (1 float per instance, dynamic), `Corridors.pulse(index: number, amount?: number)` (adds `amount`, default 1, clamped to 1.5), `Corridors.indexOfKey(key: string): number`, `Corridors.update(dt: number)` (decays all active pulses by `exp(−dt / 0.6)`, writes the instance buffers of changed corridors and sets `needsUpdate`, removes pulses below 0.01). The vertex shader scales width by `1 + 0.8·pulse`, alpha by `1 + 3·pulse`, and blends the colour toward white by `min(1, pulse)`.
- `scene/engine.ts`: `GlobeEngine.pulseRoute(key: string): void` (no-op without corridors); `frameBody` calls `corridors.update(dt)`.
- `controller.ts`: the sound wiring now calls `sound.schedule(...)` and `sound.setEnergy(...)` **always** (muted too; the engine decides what is audible); it subscribes once: `const off = sound.onNote((n) => { d.noteBus?.emit(n); d.engine.pulseRoute(n.key); })`, unsubscribes in `dispose()`; new optional dep `noteBus?: NoteBus`; the snapshot gets `music: { on: boolean; section: SectionId; chord: string; bpm: number; instruments: Instrument[] }` (from `sound.info()` at the HUD tick; `on` = sound enabled). Remove the aircraft breakdown from the snapshot.
- `MusicScope.tsx`: `MusicScope({ bus, music }: { bus: NoteBus; music: GlobeHudSnapshot["music"] })` — a `<canvas>` (class `music-scope`) with its own `requestAnimationFrame` loop (started in an effect, cancelled on unmount); one `Lane` per instrument in `LANE_ORDER` that is in `music.instruments`; bus notes call `stepLane` hits (queued and applied at `note.at`); lanes are drawn as horizontal scrolling traces: keep a ring buffer of `laneSample` values (≈ 160 samples at 30 Hz), draw a polyline per lane in `INSTRUMENT_COLOR` with `globalCompositeOperation = "lighter"`, line width 1.2 px × DPR, alpha 0.9, lane height `100 % / lanes`; the sound-off state dims lines to 0.55 alpha and shows `SOUND OFF · PRESS M` over the canvas; below the canvas a label `ROUTES → MUSIC · <SECTION> · <CHORD> · <BPM> BPM`. Must not throw when `canvas.getContext("2d")` is null (jsdom) — it simply renders the label.
- `GlobeHud.tsx`: remove `AircraftBars`; render `<MusicScope bus={noteBus} music={s.music} />` in its place (always visible, also while following; the region bars keep hiding while following); `GlobeHud` gets an optional `noteBus` prop (`App.tsx` creates it with `useMemo(createNoteBus, [])` and passes it to the controller and to `GlobeHud`).
- `styles.css`: remove the aircraft-bars rules; `.music-scope` block at the former position (bottom-right above the region bars: width ≈ 26vmin, height ≈ 15vmin, label font like the region labels), portrait position adjusted so it does not overlap the region bars.

- [ ] **Step 1: Failing tests:**
  - `scope.test.ts`: `visualHz` monotonic in frequency and clamped to `[1, 14]` (`visualHz(110) === 2`, `visualHz(220) === 4`); `stepLane` — a hit sets `amp = max(amp, vel)` and `hz`; with no hit `amp` decays exponentially (`amp(t = decaySec) ≈ amp0 / e` within 1e-9); phase advances `2π·hz·dt` and wraps into `[0, 2π)`; `laneSample` bounded by `amp`; every `LANE_ORDER` instrument has a colour and a decay.
  - `notes-bus.test.ts`: subscribe/emit/unsubscribe (like the label bus).
  - `route-sound.test.ts`: while disabled `schedule` creates **no** context but emits `NoteEvent`s through `onNote` (with `at` on the instrument grid relative to the wall-clock epoch); while enabled the oscillator start times equal `ctx.currentTime + (when − now())` for an injected `now`; `info()` reports section/chord/bpm/instruments for a given `localHour`; unsubscribe stops events; existing tests keep passing (adapt only where the old API assumed an audio clock for planning).
  - `corridors.test.ts` (extend; `createCorridors` works under jsdom/vitest for geometry only): `indexOfKey("IST-JFK")` matches `indexOf("IST","JFK")`; `pulse(i)` raises that corridor's instances in the `aPulse` attribute to 1 and leaves others at 0; `update(0.6)` decays to ≈ `1/e`; many `update` calls remove it; `pulse` clamps at 1.5.
  - `controller.test.ts`: `schedule` and `setEnergy` are called **even while sound is off** (update the earlier "nothing is scheduled while off" expectations deliberately: while off only `setEnabled(false)`-state differs); `sound.onNote` handlers forward to `engine.pulseRoute(key)` and to the injected `noteBus`; `dispose()` unsubscribes; the snapshot has `music` with the `sound.info()` fields and `on` reflecting `M`; the aircraft breakdown field is gone.
  - `hud.test.tsx`: `MusicScope` renders the label text for a given `music` (`ROUTES → MUSIC · DAY · C · 96 BPM`), shows `SOUND OFF · PRESS M` when `on` is false, does not throw under jsdom (no 2D context) and the old `AIRBORNE BY AIRCRAFT` text no longer appears; remove the `AircraftBars`/`aircraftBreakdown` tests everywhere (also in `follow-hud.test.ts`).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** per the contracts; keep `scope.ts` pure; do not import scene/Three from `audio/` or `MusicScope.tsx`; mark integration lines `// art:sound`.
- [ ] **Step 4: Run to verify pass** — `cd globe && npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Step 5: Commit**
```bash
git add globe
git commit -m "art(sound): ROUTES → MUSIC scope panel and route-line pulses (replaces the aircraft bars)"
```
- [ ] **Step 6: Visual check (controller) and listening (user):** the bottom-right panel shows the instrument waves bursting with each note and the matching route corridor flashing on the globe; with `M` off the scope still animates and says `SOUND OFF · PRESS M`; the aircraft bars are gone; the panel does not overlap the region bars in desktop or portrait.

---

### Task 12: Docs, notes table, deploy

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-07-globe-art-light-corridors-design.md`

- [ ] **Step 1: README** — in the Globe section add:
```markdown
Art layers: `C` route corridors (traffic-weighted, on by default) · `A` aurora (decorative, off by default) · `M` route music (off by default; a generative continent orchestra: every departure/landing is a note — Europe vibraphone, Middle East oud, Africa kalimba, Asia koto, Americas strings, domestic pulse — on one 96 BPM clock over an Am–F–C–G progression).
Cloud shadows, sun glare and the real star map are always on (cloud shadows switch off at quality level 2 or worse). `?art=0` turns every art layer off and restores the plain look. Preferences persist in the browser.
```
- [ ] **Step 2: Fill the notes table** at the end of the spec: for each section the commit hash(es) (`git log --oneline --grep "^art("`), the exact revert command (`git revert <hash>` — for multi-commit sections `git revert <newest>^..<oldest>`), the controller's visual-check observations and the tuning constants that were changed.
- [ ] **Step 3: Full verification** — `cd globe && npx vitest run && npx tsc --noEmit && npm run build`; `cd ../functions && npx vitest run` (untouched; must pass).
- [ ] **Step 4: Deploy (ask the user first)** — `firebase deploy --only hosting:globe --project omerkilavuz-9ad41 --non-interactive`; verify `/`, `/textures/stars-4k.jpg` (if added) return 200 and the old site's assets are unchanged; open the live page, check no console errors, FPS ≥ 55, and that `?art=0` shows the previous look.
- [ ] **Step 5: Commit**
```bash
git add README.md docs
git commit -m "art(docs): art layer keys and implementation notes"
```

---

## Outcome notes (fill in during execution)

- Task 2/3/5: record visual-check observations and tuned constants in the spec notes table.
- Task 4: record the approved star-map file (name, URL, size) and whether the orientation check required mirroring `u`.
- Task 8: record the user's listening feedback (levels, timbre) and any changes.

## Not in this plan

Comet tails, ripples at airports, flowing particles, "yesterday's ghost" (data-art alternatives), wind/jet-stream layer, cinematic director camera, story ticker, poster/time-lapse export, local high-resolution surface tiles.
