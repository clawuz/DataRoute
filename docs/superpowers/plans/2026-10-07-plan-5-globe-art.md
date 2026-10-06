# Plan 5 — Globe art: route corridors, light & atmosphere, route music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route-density corridors, a more alive planet (twilight band, cloud shadows, sun glare, real star map, optional aurora) and an optional route-driven ambient soundscape to the globe — every part individually revertable.

**Architecture:** A small pure `art` state module (`?art`, `C`/`A`/`M` keys, quality gating) feeds an `Effects` object to the engine/controller. Corridors are a new instanced-ribbon mesh built from a pure `buildCorridors(model)`; light effects are shader additions plus two small meshes; sound is a self-contained `audio/` module driven by the same pure corridors. Each section is its own commit series with prefix `art(<section>):` and `// art:<section>` markers at its few integration points so `git revert` removes it cleanly.

**Tech Stack:** TypeScript, Three.js ~0.186 (ShaderMaterial/instancing), Web Audio API, React, Vitest (+ jsdom), Vite. Spec: `docs/superpowers/specs/2026-10-07-globe-art-light-corridors-design.md`.

## Global Constraints

- Work in `globe/` only (plus README, spec notes table); never touch `web/` source, `functions/`, fonts, credentials, `.claude/`.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commit message prefix per section: `art(core):`, `art(corridors):`, `art(light):`, `art(stars):`, `art(aurora):`, `art(sound):`, `art(docs):`.
- Revertability (user request): a section never depends on another section's code; integration points are small and marked `// art:<section>`. Sound reads `buildCorridors` output only. Record section → commit hashes in the spec's "Uygulama notları" table at the end (Task 7).
- Time contract (unchanged): `cur`/`u` seconds relative to `window.from`; float32 GPU time = seconds since engine start (`rel(nowSec)`), never epoch.
- Earth-fixed unit sphere via `latLonToVec3`; scene altitude radius `altitudeRadius()` + `ARC_BASE_LIFT` (0.002); Earth group rotation `earthRotationRad(absTime)`; sun in the inertial frame (`sunDirection`).
- Defaults: corridors **on**, aurora **off**, sound **off**. `?art=0` disables every new effect (twilight, cloud shadows, glare, star map, aurora, corridors, sound) and restores the previous look. Preferences persist in `localStorage` key `dataroute.art` (always try/catch; page must work without storage).
- Quality gating (spec §4): `LEVELS` index 0 = all effects; index ≥ 1 turns aurora off; index ≥ 2 also turns cloud shadows off. Twilight, glare, corridors never gate on quality (cheap).
- Honesty: corridors only from routed flights, label `ROUTE DENSITY · 24H` while on; aurora is decorative (label `AURORA · ILLUSTRATIVE` while on; default off); sound is a sonification (label `SOUND ON`): pitch = route distance, loudness = traffic, FOLLOW brightness = altitude. HUD text English upper-case; attribution/credit lines unchanged and still visible when HUD hidden.
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
| `globe/src/audio/route-voices.ts` (new) | pure route → voice mapping |
| `globe/src/audio/engine.ts` (new) | Web Audio soundscape (`createRouteSound`) |
| `globe/src/app/keys.ts`, `controller.ts`, `hud-model.ts`, `hud/GlobeHud.tsx`, `styles.css` (mod) | keys, art state, snapshot field, `ArtNotes` |
| `globe/src/scene/{arcs,earth,atmosphere,space,textures,engine}.ts` (mod) | integration points |

Tests: `globe/test/{art,corridors,light,star-uv,aurora,route-voices,route-sound}.test.ts(x)` (new) and extensions of `keys`, `controller`, `arcs`, `hud`, `scene-materials`.

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

- [ ] **Step 0 (controller): resolve and approve the download.** Find the NASA SVS "Deep Star Maps 2020" equatorial-coordinates equirectangular image at roughly 4096×2048 (not the galactic-coordinates variant; if only 8k or galactic is offered, report the options). Use `curl -sI -L <url>` (HEAD only) to get the final URL, content type and size. **Ask the user to approve** (state file name, source URL, size ≈ 4–6 MB, public-domain NASA data). Do not download before approval. After approval: `curl -sSL -C - -o /tmp/starmap.jpg <url>`, convert with `sips -z 2048 4096 -s format jpeg -s formatOptions 85 /tmp/starmap.jpg --out globe/public/textures/stars-4k.jpg` (skip resizing if it is already 4096×2048), check the size with `ls -l`, delete the temp file. If the user declines, skip this task (the section is optional; mark it in the notes table) and continue with Task 5.

**Interfaces:**
- Produces: `star-uv.ts`: `starUV(dir: [number, number, number], flip = false): { u: number; v: number }` (inertial frame: right ascension `α = atan2(x, z)` measured from +z toward +x, declination `δ = asin(y)`; `u = fract(α / 2π)` mirrored to `1 − u` when `flip`; `v = (δ + π/2) / π`); `Space.setStarMap(tex: Texture | null): void`; `loadStarMap(): Promise<Texture | null>` in `textures.ts` (returns null on failure, never throws).

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
  it("right ascension grows from +z toward +x over one turn of u", () => {
    expect(starUV([0, 0, 1]).u).toBeCloseTo(0, 9);
    expect(starUV([1, 0, 0]).u).toBeCloseTo(0.25, 9);
    expect(starUV([0, 0, -1]).u).toBeCloseTo(0.5, 9);
    expect(starUV([-1, 0, 0]).u).toBeCloseTo(0.75, 9);
  });
  it("flip mirrors u", () => {
    expect(starUV([1, 0, 0], true).u).toBeCloseTo(0.75, 9);
  });
});
```
`scene-materials.test.ts`: `createSpace()` exposes `setStarMap`; calling it with `null` keeps the procedural stars (`uHasStarMap` 0) and with a `Texture` sets 1; `dispose()` does not throw.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `star-uv.ts`:
```ts
export function starUV(dir: [number, number, number], flip = false): { u: number; v: number } {
  const [x, y, z] = dir;
  const l = Math.hypot(x, y, z) || 1;
  const a = Math.atan2(x, z); // right ascension from +z toward +x
  let u = a / (2 * Math.PI);
  u -= Math.floor(u);
  return { u: flip ? (1 - u) % 1 : u, v: (Math.asin(Math.max(-1, Math.min(1, y / l))) + Math.PI / 2) / Math.PI };
}
```
`space.ts` stars fragment shader: add `uniform sampler2D uStarMap; uniform float uHasStarMap; uniform float uStarFlip;`, and in `main` after `dir`:
```glsl
  vec3 col = starLayer(dir, 90.0, 0.965, 0.30) + starLayer(dir, 40.0, 0.985, 0.38) * 1.4;
  if (uHasStarMap > 0.5) {
    float a = atan(dir.x, dir.z) / 6.28318530718;
    float u = fract(a);
    u = uStarFlip > 0.5 ? 1.0 - u : u;
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
(replace the existing two lines `vec3 col = …; gl_FragColor = …;`). Uniforms: `uStarMap: { value: null }`, `uHasStarMap: { value: 0 }`, `uStarFlip: { value: STAR_FLIP ? 1 : 0 }` with `export const STAR_FLIP = false;` in `star-uv.ts` — **set after the visual check below**. `Space.setStarMap(tex)` sets texture/flag (and `tex.wrapS = RepeatWrapping; tex.colorSpace = NoColorSpace` handled in `loadStarMap`). `textures.ts`:
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

- [ ] **Step 5: Controller visual check:** the sky must look like the real sky: verify orientation with known features — the band of the Milky Way should look continuous (no seam, no mirrored text-like patterns), the north celestial pole direction (camera looking along +y from the origin side is not reachable; instead compare with an astronomy reference using `sunDirection` at the March equinox: the Sun should sit in front of the constellation Pisces/Aquarius region and the Milky Way centre (Sagittarius, RA ≈ 17h45m, Dec ≈ −29°) should be opposite to the Sun at the equinox's December solstice…). Practical check: flip `STAR_FLIP` and compare the two looks against a real star chart of Orion (RA 5h30m, Dec −5°) and Cassiopeia (RA 1h, Dec +60°); the W of Cassiopeia must not be mirrored. Choose `STAR_FLIP` accordingly and commit the constant. Verify `?art=0` shows the procedural stars again and FPS ≥ 55.

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

### Task 6: Route music (sound)

**Files:**
- Create: `globe/src/audio/route-voices.ts`, `globe/src/audio/engine.ts`
- Modify: `globe/src/app/controller.ts`, `globe/src/app/art.ts` (none), `globe/src/App.tsx` (none)
- Test: `globe/test/route-voices.test.ts`, `globe/test/route-sound.test.ts`, `globe/test/controller.test.ts`

**Interfaces:**
- Consumes: `Corridor`, `buildCorridors` (Task 2; only the pure functions — no scene import), `REGIONS`, `Effects` (Task 1).
- Produces:
  - `route-voices.ts`: `MAX_VOICES = 10`; `SCALE_SEMITONES = [0, 3, 5, 7, 10]` (A minor pentatonic); `routeHash(key: string): number` (FNV-1a 32-bit); `octaveFor(distKm: number): 2 | 3 | 4 | 5`; `noteFreq(key: string, distKm: number): number` (`110 · 2^((oct − 2)) · 2^(semitones/12)`); `interface Timbre { wave: "sine" | "triangle" | "sawtooth"; cutoff: number }`; `TIMBRES: Timbre[]` (one per `REGIONS` index); `interface VoiceSpec { key: string; freq: number; wave: Timbre["wave"]; cutoff: number; gain: number; pan: number }`; `voiceSpecs(cs: Corridor[], pans?: Map<string, { pan: number; visible: boolean }>): VoiceSpec[]` (top `MAX_VOICES` by count; `gain = master · sqrt(count/max) · octaveTrim`, with `octaveTrim = 1 / 2^((oct − 2)/2)`; hidden (back side) corridors get `gain × 0.3`; `pan` clamped to [−1, 1]); `corridorMidpoint(c: Corridor): { lat: number; lon: number }` (great-circle midpoint via `interpolateGreatCircle(..., 0.5)` from `@collector/geo`).
  - `audio/engine.ts`: `interface RouteSound { setEnabled(on: boolean): void; update(specs: VoiceSpec[], focus: { key: string | null; alt100: number } | null): void; ping(key: string, freq: number): void; dispose(): void }`; `createRouteSound(opts?: { createContext?: () => AudioContext; now?: () => number }): RouteSound`.
  - Controller: when `effects.sound` is on, every HUD tick computes `voiceSpecs(corridors, pans)` with pans from `engine.screenOf(midpoint)` and `RouteSound.update(...)`; events `DEPARTED`/`LANDED` call `ping`.

- [ ] **Step 1: Failing tests** — `globe/test/route-voices.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MAX_VOICES, SCALE_SEMITONES, TIMBRES, noteFreq, octaveFor, routeHash, voiceSpecs } from "../src/audio/route-voices";
import type { Corridor } from "../src/scene/corridors";
import { REGIONS } from "@web/data/palette";

const cor = (key: string, count: number, distKm: number, regionIdx = 1): Corridor => {
  const [a, b] = key.split("-");
  return { key, a, b, fromLat: 41, fromLon: 29, toLat: 50, toLon: 8, distKm, count, regionIdx };
};

describe("note mapping", () => {
  it("the same route always maps to the same note, in the pentatonic scale", () => {
    expect(noteFreq("IST-FRA", 2000)).toBe(noteFreq("IST-FRA", 2000));
    const base = 110 * 2 ** 2; // octave 4
    const semis = SCALE_SEMITONES.map((s) => base * 2 ** (s / 12));
    expect(semis.some((f) => Math.abs(f - noteFreq("IST-FRA", 2000)) < 1e-6)).toBe(true);
  });
  it("octaves follow the distance buckets", () => {
    expect(octaveFor(7000)).toBe(2);
    expect(octaveFor(4000)).toBe(3);
    expect(octaveFor(2000)).toBe(4);
    expect(octaveFor(500)).toBe(5);
    expect(octaveFor(6000)).toBe(3); // 3000–6000 includes 6000
    expect(octaveFor(1000)).toBe(4);
  });
  it("long routes are lower than short ones for the same key", () => {
    expect(noteFreq("IST-JFK", 8000)).toBeLessThan(noteFreq("IST-JFK", 500));
  });
  it("hash is stable and spreads keys over the five degrees", () => {
    expect(routeHash("IST-JFK")).toBe(routeHash("IST-JFK"));
    const degrees = new Set(["IST-JFK", "IST-LHR", "IST-FRA", "ESB-IST", "IST-DXB", "IST-SIN", "IST-NRT", "IST-CAI"].map((k) => routeHash(k) % 5));
    expect(degrees.size).toBeGreaterThan(2);
  });
  it("has one timbre per region", () => {
    expect(TIMBRES).toHaveLength(REGIONS.length);
  });
});

describe("voiceSpecs", () => {
  const many = Array.from({ length: 14 }, (_, i) => cor(`A${String(i).padStart(2, "0")}-IST`, 100 - i * 5, 2000 + i * 100));
  it("keeps the busiest MAX_VOICES corridors", () => {
    const v = voiceSpecs(many);
    expect(v).toHaveLength(MAX_VOICES);
    expect(v[0].key).toBe(many[0].key);
  });
  it("loudness grows with traffic and is trimmed for higher octaves", () => {
    const [busy, quiet] = voiceSpecs([cor("IST-FRA", 100, 2000), cor("IST-LHR", 4, 2000)]);
    expect(busy.gain).toBeGreaterThan(quiet.gain);
    const [low, high] = voiceSpecs([cor("IST-JFK", 50, 8000), cor("IST-ESB", 50, 300)]);
    expect(high.gain).toBeLessThan(low.gain);
  });
  it("pans come from the screen map, clamped; back-side corridors are quieter", () => {
    const pans = new Map([["IST-FRA", { pan: 3, visible: true }], ["IST-LHR", { pan: -0.5, visible: false }]]);
    const v = voiceSpecs([cor("IST-FRA", 10, 2000), cor("IST-LHR", 10, 2000)], pans);
    expect(v[0].pan).toBe(1);
    expect(v[1].pan).toBe(-0.5);
    expect(v[1].gain).toBeCloseTo(v[0].gain * 0.3, 9);
  });
  it("is empty with no corridors", () => {
    expect(voiceSpecs([])).toEqual([]);
  });
});
```

`globe/test/route-sound.test.ts` — a hand-written fake audio context (all nodes record calls; params have `value`, `setTargetAtTime`, `cancelScheduledValues`, `setValueAtTime`, `linearRampToValueAtTime`):
```ts
import { describe, expect, it, vi } from "vitest";
import { createRouteSound } from "../src/audio/engine";
import type { VoiceSpec } from "../src/audio/route-voices";

class P { value = 0; setTargetAtTime = vi.fn((v: number) => { this.value = v; }); setValueAtTime = vi.fn(); linearRampToValueAtTime = vi.fn(); cancelScheduledValues = vi.fn(); }
class N { connect = vi.fn((x: unknown) => x); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn(); }
class Osc extends N { type = "sine"; frequency = new P(); detune = new P(); }
class Gain extends N { gain = new P(); }
class Filt extends N { type = "lowpass"; frequency = new P(); Q = new P(); }
class Pan extends N { pan = new P(); }
class Conv extends N { buffer: unknown = null; }
class Comp extends N { threshold = new P(); ratio = new P(); attack = new P(); release = new P(); knee = new P(); }
function fakeCtx() {
  const c = {
    state: "suspended" as string, currentTime: 0, sampleRate: 48000, destination: new N(),
    oscs: [] as Osc[], gains: [] as Gain[],
    createOscillator() { const o = new Osc(); c.oscs.push(o); return o; },
    createGain() { const g = new Gain(); c.gains.push(g); return g; },
    createBiquadFilter: () => new Filt(), createStereoPanner: () => new Pan(), createConvolver: () => new Conv(),
    createDynamicsCompressor: () => new Comp(),
    createBuffer: (ch: number, len: number) => ({ numberOfChannels: ch, length: len, getChannelData: () => new Float32Array(len) }),
    resume: vi.fn(async () => { c.state = "running"; }), suspend: vi.fn(async () => { c.state = "suspended"; }), close: vi.fn(async () => { c.state = "closed"; }),
  };
  return c;
}
const spec = (i: number): VoiceSpec => ({ key: `K${i}`, freq: 110 + i, wave: "sine", cutoff: 800, gain: 0.05, pan: 0 });

describe("route sound", () => {
  it("creates no audio context until it is enabled (browser autoplay rule)", () => {
    const create = vi.fn(() => fakeCtx() as unknown as AudioContext);
    const s = createRouteSound({ createContext: create });
    s.update([spec(1)], null);
    expect(create).not.toHaveBeenCalled();
    s.dispose();
  });

  it("enabling resumes the context and voices follow the specs (max 10)", () => {
    const ctx = fakeCtx();
    const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext });
    s.setEnabled(true);
    expect(ctx.resume).toHaveBeenCalled();
    s.update(Array.from({ length: 12 }, (_, i) => spec(i)), null);
    // two detuned oscillators per voice + one LFO per voice, capped at 10 voices
    expect(ctx.oscs.length).toBe(10 * 3);
    s.update([spec(0)], null);
    s.dispose();
    expect(ctx.close).toHaveBeenCalled();
  });

  it("disabling fades the master out and suspends", async () => {
    const ctx = fakeCtx();
    const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext });
    s.setEnabled(true);
    s.setEnabled(false);
    expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalled(); // master gain
    s.dispose();
  });

  it("limits pings to three per second", () => {
    const ctx = fakeCtx();
    let t = 1000;
    const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext, now: () => t });
    s.setEnabled(true);
    const before = ctx.oscs.length;
    for (let i = 0; i < 10; i++) s.ping("IST-FRA", 220);
    expect(ctx.oscs.length - before).toBe(3);
    t += 1100;
    s.ping("IST-FRA", 220);
    expect(ctx.oscs.length - before).toBe(4);
    s.dispose();
  });

  it("the focused voice is louder and its filter opens with altitude", () => {
    const ctx = fakeCtx();
    const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext });
    s.setEnabled(true);
    s.update([spec(1), spec(2)], { key: "K1", alt100: 370 });
    s.update([spec(1), spec(2)], { key: "K1", alt100: 100 });
    s.dispose();
    expect(ctx.oscs.length).toBeGreaterThan(0);
  });
});
```
(The last test only protects against throwing; add stronger assertions on the `setTargetAtTime` arguments of the focused vs unfocused voice gain and the filter `frequency` (`300 + 8·alt100`) once you wire concrete node references — expose the created nodes through the fake the same way `oscs`/`gains` are recorded, and assert `gain(focus) ≈ 2 × spec.gain` and `gain(other) ≈ 0.5 × spec.gain` as the final `setTargetAtTime` value, and the filter frequency `300 + 8 * 370 = 3260`.)

Controller tests (extend the harness: `setup` accepts `sound?: RouteSound` passed through a new optional dep `sound` — controller creates `createRouteSound()` by default; tests inject a stub with `vi.fn()`s):
- With effects.sound false (default) `update` is never called; after `onKey("m")` and a HUD tick `update` receives specs for the model's corridors (non-empty for a routed flight).
- A DEPARTED/LANDED event after a data swap calls `ping` with the corridor key (`"IST-JFK"`) while sound is on, and not while it is off.
- `onKey("m")` calls `setEnabled(true)`, the second press `setEnabled(false)`; `dispose()` calls `sound.dispose()`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** `globe/src/audio/route-voices.ts`:
```ts
import { interpolateGreatCircle } from "@collector/geo";
import { REGIONS } from "@web/data/palette";
import type { Corridor } from "../scene/corridors";

export const MAX_VOICES = 10;
export const SCALE_SEMITONES = [0, 3, 5, 7, 10]; // A minor pentatonic
const MASTER = 0.06;
const BASE_HZ = 110; // A2

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

export function noteFreq(key: string, distKm: number): number {
  const oct = octaveFor(distKm);
  const semis = SCALE_SEMITONES[routeHash(key) % SCALE_SEMITONES.length];
  return BASE_HZ * 2 ** (oct - 2) * 2 ** (semis / 12);
}

export interface Timbre {
  wave: "sine" | "triangle" | "sawtooth";
  cutoff: number;
}

// DOM, EUR, MEA, AFR, ASI, AME, UNK (same order as REGIONS)
export const TIMBRES: Timbre[] = [
  { wave: "sine", cutoff: 900 },
  { wave: "triangle", cutoff: 1100 },
  { wave: "sawtooth", cutoff: 520 },
  { wave: "sine", cutoff: 1300 },
  { wave: "triangle", cutoff: 1500 },
  { wave: "sine", cutoff: 700 },
  { wave: "sine", cutoff: 600 },
];
void REGIONS; // TIMBRES is indexed by REGIONS order

export interface VoiceSpec {
  key: string;
  freq: number;
  wave: Timbre["wave"];
  cutoff: number;
  gain: number;
  pan: number;
}

export function voiceSpecs(cs: Corridor[], pans: Map<string, { pan: number; visible: boolean }> = new Map()): VoiceSpec[] {
  const top = cs.slice(0, MAX_VOICES);
  const max = cs.length ? cs[0].count : 0;
  return top.map((c) => {
    const oct = octaveFor(c.distKm);
    const t = TIMBRES[c.regionIdx] ?? TIMBRES[TIMBRES.length - 1];
    const p = pans.get(c.key);
    const trim = 1 / 2 ** ((oct - 2) / 2);
    const weight = max > 0 ? Math.sqrt(c.count / max) : 0;
    return {
      key: c.key,
      freq: noteFreq(c.key, c.distKm),
      wave: t.wave,
      cutoff: t.cutoff,
      gain: MASTER * weight * trim * (p && !p.visible ? 0.3 : 1),
      pan: p ? Math.max(-1, Math.min(1, p.pan)) : 0,
    };
  });
}

export function corridorMidpoint(c: Corridor): { lat: number; lon: number } {
  const [lat, lon] = interpolateGreatCircle(c.fromLat, c.fromLon, c.toLat, c.toLon, 0.5);
  return { lat, lon };
}
```
`globe/src/audio/engine.ts` — Web Audio graph (create nodes lazily on the first `setEnabled(true)` so no `AudioContext` exists before a user gesture; `createContext` default `() => new (window.AudioContext ?? (window as any).webkitAudioContext)()`):
- `ctx`; `master = ctx.createGain()` (gain 0) → `comp = ctx.createDynamicsCompressor()` (threshold −24, ratio 4) → `ctx.destination`; reverb: `convolver` with a generated impulse response (2.5 s, exponentially decaying noise, stereo) fed by `wetGain` (0.35) from a `bus` gain; `bus` → `master` (dry 0.65 via `dryGain`) and `bus` → `convolver` → `wetGain` → `master`.
- Voice = `{ o1, o2 (detune ±6 cents), filter (lowpass, Q 0.7), gain, pan, lfo (0.05–0.12 Hz derived from `freq`), lfoGain (0.18·gain) }`; chain `o1,o2 → filter → gain → pan → bus`; the LFO modulates `gain.gain`.
- `update(specs, focus)`: first ensure `ctx` exists and `enabled`; create voices for new keys (cap `MAX_VOICES`), set `frequency/type/filter cutoff/gain/pan` with `setTargetAtTime(v, now, 0.6)` for existing ones; voices for keys no longer present fade to 0 over ~1 s then stop/disconnect; focused voice: `gain × 2`, filter cutoff `300 + 8·alt100`, other voices `gain × 0.5` while a focus exists; no focus → the spec values.
- `ping(key, freq)`: only when enabled; rate limit 3 per rolling second via `now()` (default `performance.now`); a sine at `freq·2` through the `bus` with attack 0.01 s and exponential decay ~1.4 s, then stop.
- `setEnabled(true)`: lazily create everything, `ctx.resume()`, ramp `master` to 1 over 0.8 s (`setTargetAtTime(1, t, 0.25)`); register `visibilitychange` (suspend when hidden and enabled, resume when visible). `setEnabled(false)`: ramp master to 0 (`setTargetAtTime(0, t, 0.25)`), then `ctx.suspend()` after ~1 s (guard with the latest state); autoplay: if `ctx.state` stays `suspended` after `resume()` (the browser blocked it), install one-shot `pointerdown`/`keydown` listeners on `window` that call `resume()` and remove themselves.
- `dispose()`: stop every oscillator, disconnect, remove listeners, `ctx.close()`; safe to call twice and before any enable.
- Everything inside try/catch where browsers may throw (e.g. `AudioContext` missing → `setEnabled` becomes a no-op and the module never throws).

`controller.ts` (`// art:sound`): imports `buildCorridors`, `Corridor` from `../scene/corridors`, `voiceSpecs`, `corridorMidpoint` from `../audio/route-voices`, `createRouteSound, RouteSound` from `../audio/engine`; new optional dep `sound?: RouteSound`; `const sound = d.sound ?? createRouteSound();`; cache `let corridorModel: GlobeModel | null = null; let corridorList: Corridor[] = [];` refreshed lazily from `model`. Track `let soundOn = false;` — in `pushEffects()` (Task 1) compute `const e = effectsFor(art, perf.level); d.engine.setEffects(e); if (e.sound !== soundOn) { soundOn = e.sound; sound.setEnabled(e.sound); }`. In `pushHud()` (4 Hz), when `soundOn && model`: build `pans` via `d.engine.screenOf(mid.lat, mid.lon)` for the top `MAX_VOICES` corridors (`pan = (x - vw/2)/(vw/2)` with `vw = d.viewportWidth?.() ?? (typeof window === "undefined" ? 1000 : window.innerWidth)`; add `viewportWidth?: () => number` to deps for tests), `sound.update(voiceSpecs(corridorList, pans), focus)` where `focus` is the followed flight's corridor key and `telemetry alt100` (use the existing `follow` + `telemetryAt` values; `null` when not following; corridor key via `corridorKey(f.from, f.to)` when both exist). After `events = addEvents(...)` in `onData`: `if (soundOn) for (const e of evs) if ((e.kind === "DEPARTED" || e.kind === "LANDED") && e.from && e.to) { const c = corridorList.find((x) => x.key === corridorKey(e.from!, e.to!)); if (c) sound.ping(c.key, noteFreq(c.key, c.distKm)); }`. `dispose()` also calls `sound.dispose()`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Controller listening check** (the user does the final listening; you can only verify wiring): open the page, press `M`, confirm in the browser console-free way that `SOUND ON` appears in the HUD, no console errors, and `M` again clears it; verify with `javascript_tool` that an `AudioContext` exists after the first press and is `running` (`window` has no global handle — temporarily log nothing; instead check the HUD and the absence of errors). Ask the user to listen: calm pad voices, no clipping, volume comfortable, FOLLOW changes brightness with altitude, pings gentle. Record their feedback and any gain/cutoff changes in the notes table.

- [ ] **Step 6: Commit**
```bash
git add globe
git commit -m "art(sound): route-driven ambient soundscape (M, default off)"
```

---

### Task 7: Docs, notes table, deploy

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-07-globe-art-light-corridors-design.md`

- [ ] **Step 1: README** — in the Globe section add:
```markdown
Art layers: `C` route corridors (traffic-weighted, on by default) · `A` aurora (decorative, off by default) · `M` route music (off by default; pitch = route distance, loudness = traffic).
Twilight band, cloud shadows, sun glare and the real star map are always on; `?art=0` turns every art layer off and restores the plain look. Preferences persist in the browser.
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
- Task 4: record the approved star-map file (name, URL, size) and the chosen `STAR_FLIP`.
- Task 6: record the user's listening feedback (levels, timbre) and any changes.

## Not in this plan

Comet tails, ripples at airports, flowing particles, "yesterday's ghost" (data-art alternatives), wind/jet-stream layer, cinematic director camera, story ticker, poster/time-lapse export, local high-resolution surface tiles.
