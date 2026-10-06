# Plan 3 — THY Globe, Aşama A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new, separately hosted `globe/` app: a real-time-rotating Earth with day/night, city lights and atmosphere, over a nebula/stars background, where every THY flight is a curved 3D arc (faint planned route + bright observed track, gaps honestly shown), airports are marked at true coordinates, the LIVE mode keeps moving (extrapolated heads, event feed, slow camera drift) and REPLAY plays the last 24 h in 3 minutes. Also fix the collector so tracks are no longer split at ADS-B coverage gaps and "landed" only means landed.

**Architecture:**
- Collector (`functions/`) gains flight `end`/`gaps` classification, a merge-across-gaps rule and a published `airports` table.
- `globe/` is a new Vite + React + Three.js app. It reuses the Plan 2 data/cycle/HUD modules through the `@web/*` alias (`web/` is never modified) and the collector schema through `@collector/*`.
- Pure, unit-tested modules (`astro`, `geo3d`, `model`, `camera rig`) feed a Three.js scene: 3D sphere with a ported planet look (the reference ray-trace shader cannot take a moving camera or depth), instanced screen-space ribbon arcs with depth testing, head/airport point layers, bloom. A non-React controller owns data polling, LIVE/REPLAY time, events and the HUD snapshot.

**Tech Stack:** Node 22 / TypeScript / Vitest (collector); React 19, Vite 8, Three.js `~0.186` (pinned: `postprocessing` 6.39 requires `three < 0.187`), `postprocessing`, Vitest 4 (+ jsdom) for `globe/`; Firebase Hosting (new site `dataroute-tk`).

**Spec:** `docs/superpowers/specs/2026-10-06-thy-globe-design.md`. This plan covers **Aşama A only** (FOLLOW camera, flight telemetry panel and the automatic tour are Plan 4).

## Global Constraints

- **Coordinates (Earth-fixed, Y = polar axis):** `x = cosφ·sinλ`, `y = sinφ`, `z = cosφ·cosλ` (λ = 0 → +z, east → +x). Textures are sampled with `u = (atan(x, z) + π)/2π`, `v = (asin(y) + π/2)/π` from the object-space direction (never mesh UVs).
- **Inertial frame:** camera and sun live here. `earthGroup.rotation.y = θ` where θ = Greenwich mean sidereal angle of the displayed UTC instant. Sun direction (inertial) `= (cosδ·sinα, sinδ, cosδ·cosα)` (RA α from +z toward +x). Formulas (exact): `n = unix/86400 + 2440587.5 − 2451545.0`; `gmstDeg = (280.46061837 + 360.98564736629·n) mod 360`; `L = 280.460 + 0.9856474·n`, `g = 357.528 + 0.9856003·n`, `λecl = L + 1.915·sin g + 0.020·sin 2g`, `ε = 23.439 − 4e-7·n`, `α = atan2(cos ε·sin λecl, cos λecl)`, `δ = asin(sin ε·sin λecl)`; sub-solar longitude `= α − gmst`.
- **Altitude:** arc radius `= 1 + 30·(alt100·100·0.3048/1000)/6371.0088` (ALT_EXAG = 30; FL370 → 1.0531). Arcs add a constant `0.002` base lift to avoid z-fighting with the Earth. HUD (Plan 4) shows true altitude.
- **Arcs:** each flight is resampled to ≤ 96 points per continuous run; a sample pair is a **break** (not drawn as observed) when `t[i+1] − t[i] > 600 s` or it matches a `gaps` interval (±1 s). Rotas known (both airports present in `airports`) always get a faint **planned** great-circle arc (48 points, lift peak `0.004 + 0.049·min(1, √(distKm/2500))`, profile `sin(πu)^0.6`, dashed). Observed solid, bright. Unknown routes (`UNK`) get no planned arc and no airport marker.
- **Never fabricate:** extrapolated heads are labelled `EXTRAPOLATED`; they last at most **300 s** after the last observed sample (`EXTRAPOLATE_MAX_SEC = 300`), then disappear (`LAST CONTACT`). Planned/gap parts are never drawn as observed.
- **Time:** LIVE displayed time = wall clock (`cur = nowMs/1000 − model.from`, capped to `span + 360`); Earth rotation and sun use `absTime = model.from + cur`. REPLAY runs `replayStart → span` in **180 s** (`GLOBE_CYCLE.replaySec`), then switches to LIVE; there is no LIVE hold phase. Manual mode: any input, 20 s idle resumes.
- **Camera (GLOBE):** distance `3.2` (Earth radius 1), pitch clamp ±1.2 rad, drag inertia damping `0.95`/frame@60 fps, idle yaw drift `0.6°/s` (×0.4 with `prefers-reduced-motion`), initial yaw faces 30°E.
- **Quality:** reuse Plan 2's `@web/render/quality` levels (tunnel/bloom scale steps). Texture tier `8k` only if `MAX_TEXTURE_SIZE ≥ 8192`, `deviceMemory > 4` (default 8 when unknown) and not a coarse-pointer device; else `4k`; if loading fails the Earth falls back to flat colours with a warning line.
- **Region palette, formats, HUD language (English), TK fonts (never committed; copied from `../font` into git-ignored `globe/public/fonts`; user approved serving them on the deployed site)** — identical to Plan 2. The source line (`SOURCE: ADSB.FI`, linked) and imagery credit are always visible; `H` hides everything except the source line (dimmed).
- **Events:** last 6 shown; computed by diffing consecutive models; none on the first load; a new flight counts as `DEPARTED` only if its departure is within 900 s of `generatedAt`.
- **Data compatibility:** `Flight.end`, `Flight.gaps`, `DayFile.airports` are optional in the type; globe treats a flight without `end` as `LAST_CONTACT` when `arr !== null`, `AIRBORNE` otherwise.
- **Hosting:** new Firebase Hosting site **`dataroute-tk`** (`https://dataroute-tk.web.app`); the existing tunnel site `omerkilavuz-9ad41` is untouched. Fallback site id if taken: `dataroute-tk-globe`.
- **Licensing:** parts adapted from `jsulpis/realtime-planet-shader` (GPL-3.0) keep the author's credit in the file header and are listed in `NOTICE`; the owner explicitly accepted this. **Do not edit `LICENSE`.** Textures are NASA imagery (public domain, credited in the HUD).
- **Do not modify anything under `web/`.** Never commit `font/`, `web/public/fonts/`, `globe/public/fonts/`, `web/dist/`, `globe/dist/`, `.claude/`.
- **Commit trailer** on every commit: a blank line then exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
DataRoute/
  NOTICE                                   third-party notices (Task 9)
  firebase.json · .firebaserc              hosting array with targets (Task 13)
  functions/src/
    day-schema.ts                          + FlightEnd, gaps, DayAirport, airports? (Task 1)
    tracker.ts                             merge across gaps, LANDED/LAST_CONTACT (Task 1)
    publish.ts · routes.ts                 end/gaps/airports, airport names (Task 2)
  functions/scripts/make-fixture.ts        end/gaps/airports in the fixture (Task 2)
  globe/
    package.json · tsconfig.json · vite.config.ts · index.html
    scripts/copy-fonts.mjs
    public/textures/                       day-8k/4k, night-8k/4k, clouds-2k (Task 8)
    src/
      main.tsx · App.tsx · styles.css
      astro/index.ts                       GMST, sun position/direction (Task 5)
      geo3d/{vec,great,resample}.ts        sphere math, planned arcs, track resampling (Task 6)
      model/{globe-model,dead-reckon,events,head-smoother}.ts  (Task 7)
      scene/{textures,earth,atmosphere,space}.ts  (Tasks 8–9)
      scene/{arcs,heads,airports,picking3d}.ts    (Task 10)
      scene/engine.ts · camera/globe-rig.ts       (Task 11)
      app/{keys,controller}.ts                    (Task 11)
      hud/GlobeHud.tsx                            (Task 12)
    test/                                  one test file per module
```

---

### Task 1: Schema extension and tracker merge/classification (collector)

**Files:**
- Modify: `functions/src/day-schema.ts`, `functions/src/tracker.ts`
- Test: `functions/test/tracker.test.ts` (replace whole file)

**Interfaces:**
- Consumes: `haversineKm` (`functions/src/geo.ts`), existing `AircraftState`, `TrackedFlight`, `TrackerState`.
- Produces (`day-schema.ts`): `type FlightEnd = "AIRBORNE" | "LANDED" | "LAST_CONTACT"`; `TrackedFlight.end?: FlightEnd`, `TrackedFlight.gaps?: [number, number][]` (absolute unix s); `Flight.end?: FlightEnd`, `Flight.gaps?: [number, number][]` (seconds relative to `dep`); `interface DayAirport { lat: number; lon: number; country: string; name?: string }`; `DayFile.airports?: Record<string, DayAirport>`; `Airport.name?: string`.
- Produces (`tracker.ts`): constants `GAP = 2700`, `WINDOW = 86400`, `RESUME_WINDOW = 14 * 3600`, `LANDED_KM = 150`, `LANDED_ALT100 = 150`, `NO_ROUTE_LANDED_ALT100 = 30`, `MAX_SPEED_KMH = 1250`, `JUMP_MARGIN_KM = 100`; `isLanded(f: TrackedFlight): boolean`; `endOf(f: TrackedFlight): FlightEnd`; `emptyState`, `step` (same signatures).

Rules implemented by `step` (see Global Constraints and spec §4.2):
- New flight when: airborne after a `LANDED` end, callsign changed, or the airframe returns infeasibly/too late.
- 45 min of silence → `finalize`: `LANDED` if `isLanded` (route known: last altitude < 15,000 ft **and** last point ≤ 150 km from the destination airport; no route: last altitude < 3,000 ft) else `LAST_CONTACT` (`arr = lastContact`, stays resumable for 14 h).
- A returning aircraft (same `icao24` **and** callsign, ≤ 14 h, great-circle distance from the last sample ≤ `1250 km/h × Δt + 100 km`) re-opens its `LAST_CONTACT` flight: `end = "AIRBORNE"`, `arr = null`, and `[lastContact, returnTime]` is appended to `gaps`.
- A ground sighting of an open or resumable flight ends it as `LANDED` at the sighting time.
- Pruning, sample trimming and gap trimming (`gap end < cutoff` removed) as before.
- Legacy rows (no `end`): `arr === null` → open; a legacy row with `arr` set is never resumable; `endOf` classifies it with `isLanded` for publishing.

- [ ] **Step 1: Extend the schema**

In `functions/src/day-schema.ts`:
- In `interface Airport` add `name?: string;` after `lon: number;`.
- After the `Sample` type add:
```ts
export type FlightEnd = "AIRBORNE" | "LANDED" | "LAST_CONTACT";
```
- In `interface TrackedFlight` add (after `lastContact: number;`):
```ts
  end?: FlightEnd;
  /** coverage gaps inside the flight, absolute unix s [from, to] */
  gaps?: [number, number][];
```
- In `interface Flight` add (after `arr: number | null;`):
```ts
  end?: FlightEnd;
  /** coverage gaps, seconds relative to `dep` */
  gaps?: [number, number][];
```
- Before `export interface DayFile` add:
```ts
export interface DayAirport {
  lat: number;
  lon: number;
  country: string; // ISO 3166-1 alpha-2
  name?: string;
}
```
- In `interface DayFile`, after `flights: Flight[];` add:
```ts
  /** IATA → position, for every airport used by a routed flight (+ IST, SAW) */
  airports?: Record<string, DayAirport>;
```

- [ ] **Step 2: Replace `functions/test/tracker.test.ts` entirely (failing tests)**

```ts
import { describe, expect, it } from "vitest";
import type { AircraftState, RouteInfo, TrackedFlight, TrackerState } from "../src/day-schema.js";
import { GAP, RESUME_WINDOW, WINDOW, emptyState, endOf, isLanded, step } from "../src/tracker.js";

const T0 = 1_800_000_000;
const ac = (o: Partial<AircraftState> = {}): AircraftState => ({
  icao24: "abc123",
  cs: "THY1",
  t: T0,
  lat: 41,
  lon: 29,
  alt100: 100,
  onGround: false,
  gs: 300,
  trk: 300,
  ...o,
});

const ESB = { iata: "ESB", country: "TR", lat: 41.01, lon: 29.05 }; // 150 km radius contains (41, 29)
const JFK = { iata: "JFK", country: "US", lat: 40.6398, lon: -73.7789 };
const IST = { iata: "IST", country: "TR", lat: 41.2613, lon: 28.742 };
const toESB: RouteInfo = { origin: IST, destination: ESB };
const toJFK: RouteInfo = { origin: IST, destination: JFK };

describe("tracker.step", () => {
  it("opens a flight for an airborne aircraft", () => {
    const s = step(emptyState(T0), [ac()], T0);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ id: `abc123-${T0}`, cs: "THY1", dep: T0, arr: null, end: "AIRBORNE", lastContact: T0 });
    expect(s.flights[0].samples).toEqual([[T0, 100, 41, 29]]);
    expect(s.flights[0].now).toEqual({ gs: 300, trk: 300 });
    expect(s.lastSuccessAt).toBe(T0);
  });

  it("ignores aircraft on ground with no open flight", () => {
    expect(step(emptyState(T0), [ac({ onGround: true })], T0).flights).toHaveLength(0);
  });

  it("appends samples, rounds coords, reuses previous altitude when null", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 120, alt100: null, lat: 41.123456, lon: 29.987654 })], T0 + 120);
    expect(s.flights[0].samples[1]).toEqual([T0 + 120, 100, 41.1235, 29.9877]);
  });

  it("skips non-advancing timestamps", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac()], T0 + 120);
    expect(s.flights[0].samples).toHaveLength(1);
  });

  it("closes on landing", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 600, onGround: true })], T0 + 600);
    expect(s.flights[0]).toMatchObject({ arr: T0 + 600, end: "LANDED" });
    expect(s.flights[0].now).toBeUndefined();
  });

  it("starts a new flight after landing and taking off again", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 600, onGround: true })], T0 + 600);
    s = step(s, [ac({ t: T0 + 3600 })], T0 + 3600);
    expect(s.flights.map((f) => f.arr)).toEqual([T0 + 600, null]);
    expect(s.flights.map((f) => f.end)).toEqual(["LANDED", "AIRBORNE"]);
  });

  it("starts a new flight when the callsign changes", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 120, cs: "THY2" })], T0 + 120);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0].arr).toBe(T0);
    expect(s.flights[0].end).toBe("LAST_CONTACT");
    expect(s.flights[1].cs).toBe("THY2");
  });

  it("merges a returning aircraft after a coverage gap into the same flight", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + GAP + 1, lat: 41.2, lon: 29.2 })], T0 + GAP + 1);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ arr: null, end: "AIRBORNE" });
    expect(s.flights[0].gaps).toEqual([[T0, T0 + GAP + 1]]);
    expect(s.flights[0].samples).toHaveLength(2);
  });

  it("does not merge across a physically impossible jump", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + GAP + 1, lat: -30, lon: 150 })], T0 + GAP + 1);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0]).toMatchObject({ end: "LAST_CONTACT", arr: T0 });
    expect(s.flights[1]).toMatchObject({ end: "AIRBORNE", arr: null });
  });

  it("marks silent flights LAST_CONTACT after the gap and keeps them resumable", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [], T0 + GAP);
    expect(s.flights[0].arr).toBeNull();
    s = step(s, [], T0 + GAP + 1);
    expect(s.flights[0]).toMatchObject({ arr: T0, end: "LAST_CONTACT" });
    // reappears 3 h later within reach
    s = step(s, [ac({ t: T0 + 10800, lat: 41.5, lon: 29.5 })], T0 + 10800);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ arr: null, end: "AIRBORNE" });
    expect(s.flights[0].gaps).toEqual([[T0, T0 + 10800]]);
  });

  it("does not resume after the 14 h resume window", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [], T0 + GAP + 1);
    const late = T0 + RESUME_WINDOW + 1;
    s = step(s, [ac({ t: late })], late);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0].end).toBe("LAST_CONTACT");
  });

  it("classifies a silent flight near its destination at low altitude as LANDED", () => {
    let s = step(emptyState(T0), [ac({ alt100: 40 })], T0);
    s.flights[0].route = toESB;
    s = step(s, [], T0 + GAP + 1);
    expect(s.flights[0]).toMatchObject({ end: "LANDED", arr: T0 });
  });

  it("classifies a silent high-altitude flight far from its destination as LAST_CONTACT", () => {
    let s = step(emptyState(T0), [ac({ alt100: 370 })], T0);
    s.flights[0].route = toJFK;
    s = step(s, [], T0 + GAP + 1);
    expect(s.flights[0]).toMatchObject({ end: "LAST_CONTACT", arr: T0 });
  });

  it("a ground sighting of a resumable flight resumes and lands it", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [], T0 + GAP + 1);
    s = step(s, [ac({ t: T0 + 7200, onGround: true, lat: 41.3, lon: 29.3 })], T0 + 7200);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ end: "LANDED", arr: T0 + 7200 });
    expect(s.flights[0].gaps).toEqual([[T0, T0 + 7200]]);
  });

  it("prunes flights that landed before the window, trims old samples and gaps", () => {
    const late = T0 + 700 + WINDOW - 60;
    const prev: TrackerState = {
      v: 1,
      collectingSince: T0,
      lastSuccessAt: late,
      flights: [
        { id: "a", icao24: "a", cs: "THY1", dep: T0, arr: T0 + 600, lastContact: T0 + 600, samples: [[T0, 100, 41, 29]] },
        {
          id: "b", icao24: "b", cs: "THY9", dep: T0 + 700, arr: null, lastContact: late,
          samples: [[T0 + 700, 100, 41, 29], [late, 100, 41, 29]],
          gaps: [[T0 + 690, T0 + 700], [late - 200, late - 100]], // first gap ends before the cutoff (T0 + 701)
        },
      ],
    };
    const now = T0 + 701 + WINDOW; // cutoff = T0 + 701
    const s = step(prev, [], now);
    expect(s.flights.map((f) => f.cs)).toEqual(["THY9"]);
    expect(s.flights[0].arr).toBeNull();
    expect(s.flights[0].dep).toBe(T0 + 700);
    expect(s.flights[0].samples).toEqual([[late, 100, 41, 29]]);
    expect(s.flights[0].gaps).toEqual([[late - 200, late - 100]]);
  });

  it("does not mutate the previous state", () => {
    let a = step(emptyState(T0), [ac()], T0);
    a = step(a, [ac({ t: T0 + GAP + 1, lat: 41.2, lon: 29.2 })], T0 + GAP + 1); // creates gaps
    const snapshot = JSON.stringify(a);
    step(a, [ac({ t: T0 + GAP + 121, lat: 41.3, lon: 29.3 })], T0 + GAP + 121);
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it("preserves collectingSince and route", () => {
    const prev: TrackerState = step(emptyState(T0 - 50), [ac()], T0);
    prev.flights[0].route = null;
    const s = step(prev, [ac({ t: T0 + 120 })], T0 + 120);
    expect(s.collectingSince).toBe(T0 - 50);
    expect(s.flights[0].route).toBeNull();
  });
});

describe("isLanded / endOf", () => {
  const flight = (o: Partial<TrackedFlight>): TrackedFlight => ({
    id: "x", icao24: "x", cs: "THY1", dep: T0, arr: T0 + 100, lastContact: T0 + 100, samples: [[T0 + 100, 40, 41, 29]], ...o,
  });

  it("route known: needs low altitude AND ≤150 km from the destination", () => {
    expect(isLanded(flight({ route: toESB }))).toBe(true);
    expect(isLanded(flight({ route: toJFK }))).toBe(false); // far away
    expect(isLanded(flight({ route: toESB, samples: [[T0, 200, 41, 29]] }))).toBe(false); // too high
  });

  it("no route: only a very low last altitude counts", () => {
    expect(isLanded(flight({ route: null, samples: [[T0, 20, 41, 29]] }))).toBe(true);
    expect(isLanded(flight({ route: undefined, samples: [[T0, 40, 41, 29]] }))).toBe(false);
  });

  it("no samples → not landed", () => {
    expect(isLanded(flight({ samples: [] }))).toBe(false);
  });

  it("endOf honours an explicit end and classifies legacy rows", () => {
    expect(endOf(flight({ end: "LAST_CONTACT", route: toESB }))).toBe("LAST_CONTACT");
    expect(endOf(flight({ arr: null }))).toBe("AIRBORNE");
    expect(endOf(flight({ route: toESB }))).toBe("LANDED"); // legacy, but actually near destination
    expect(endOf(flight({ route: toJFK }))).toBe("LAST_CONTACT");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd functions && npx vitest run test/tracker.test.ts`
Expected: FAIL — `RESUME_WINDOW`, `endOf`, `isLanded` are not exported.

- [ ] **Step 4: Replace `functions/src/tracker.ts` entirely**

```ts
import type { AircraftState, FlightEnd, TrackedFlight, TrackerState } from "./day-schema.js";
import { haversineKm } from "./geo.js";

export const GAP = 45 * 60;
export const WINDOW = 86400;
export const RESUME_WINDOW = 14 * 3600;
export const LANDED_KM = 150;
export const LANDED_ALT100 = 150; // 15,000 ft
export const NO_ROUTE_LANDED_ALT100 = 30; // 3,000 ft
export const MAX_SPEED_KMH = 1250;
export const JUMP_MARGIN_KM = 100;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function emptyState(now: number): TrackerState {
  return { v: 1, collectingSince: now, lastSuccessAt: 0, flights: [] };
}

/** True when the flight's last observed point is consistent with having landed. */
export function isLanded(f: TrackedFlight): boolean {
  const last = f.samples[f.samples.length - 1];
  if (!last) return false;
  const dest = f.route?.destination;
  if (dest) return last[1] < LANDED_ALT100 && haversineKm(last[2], last[3], dest.lat, dest.lon) <= LANDED_KM;
  return last[1] < NO_ROUTE_LANDED_ALT100;
}

/** Explicit `end`, else derived (legacy rows that only carry `arr`). */
export function endOf(f: TrackedFlight): FlightEnd {
  if (f.end) return f.end;
  if (f.arr === null) return "AIRBORNE";
  return isLanded(f) ? "LANDED" : "LAST_CONTACT";
}

export function step(prev: TrackerState, aircraft: AircraftState[], now: number): TrackerState {
  const flights: TrackedFlight[] = prev.flights.map((f) => {
    const copy: TrackedFlight = { ...f, samples: [...f.samples] };
    if (f.gaps) copy.gaps = f.gaps.map((g) => [g[0], g[1]] as [number, number]);
    return copy;
  });
  const open = new Map<string, TrackedFlight>(); // still being tracked
  const pending = new Map<string, TrackedFlight>(); // LAST_CONTACT, may still resume
  for (const f of flights) {
    if (f.arr === null) open.set(f.icao24, f);
    else if (f.end === "LAST_CONTACT" && now - f.lastContact <= RESUME_WINDOW) {
      const cur = pending.get(f.icao24);
      if (!cur || f.lastContact > cur.lastContact) pending.set(f.icao24, f);
    }
  }

  const settle = (f: TrackedFlight, end: FlightEnd, at: number) => {
    f.end = end;
    f.arr = at;
    delete f.now;
    open.delete(f.icao24);
    if (end === "LAST_CONTACT") pending.set(f.icao24, f);
  };
  const finalize = (f: TrackedFlight) => {
    if (isLanded(f)) settle(f, "LANDED", f.lastContact);
    else settle(f, "LAST_CONTACT", f.lastContact);
  };
  const tryResume = (a: AircraftState): TrackedFlight | undefined => {
    const p = pending.get(a.icao24);
    if (!p || p.cs !== a.cs) return undefined;
    const dt = a.t - p.lastContact;
    if (dt < 0 || dt > RESUME_WINDOW) return undefined;
    const last = p.samples[p.samples.length - 1];
    if (!last) return undefined;
    const reach = (MAX_SPEED_KMH * dt) / 3600 + JUMP_MARGIN_KM;
    if (haversineKm(last[2], last[3], a.lat, a.lon) > reach) return undefined;
    pending.delete(a.icao24);
    p.end = "AIRBORNE";
    p.arr = null;
    (p.gaps ??= []).push([p.lastContact, a.t]);
    open.set(a.icao24, p);
    return p;
  };

  for (const a of aircraft) {
    let f = open.get(a.icao24);
    if (f && f.cs !== a.cs) {
      finalize(f); // new callsign = new flight
      f = undefined;
    }
    if (f && a.t - f.lastContact > GAP) {
      finalize(f);
      f = undefined;
    }
    if (!f) f = tryResume(a);
    if (a.onGround) {
      if (f) settle(f, "LANDED", a.t);
      continue;
    }
    if (!f) {
      f = {
        id: `${a.icao24}-${a.t}`,
        icao24: a.icao24,
        cs: a.cs,
        dep: a.t,
        arr: null,
        end: "AIRBORNE",
        lastContact: a.t,
        samples: [],
      };
      flights.push(f);
      open.set(a.icao24, f);
    }
    const last = f.samples[f.samples.length - 1];
    if (!last || a.t > last[0]) {
      f.samples.push([a.t, a.alt100 ?? last?.[1] ?? 0, round4(a.lat), round4(a.lon)]);
    }
    f.lastContact = Math.max(f.lastContact, a.t);
    f.now = { gs: a.gs ?? 0, trk: a.trk ?? 0 };
  }

  for (const f of [...open.values()]) {
    if (now - f.lastContact > GAP) finalize(f);
  }

  const cutoff = now - WINDOW;
  const kept = flights.filter((f) => f.arr === null || f.arr >= cutoff);
  for (const f of kept) {
    const i = f.samples.findIndex((s) => s[0] >= cutoff);
    if (i > 0) f.samples.splice(0, i);
    else if (i === -1 && f.samples.length > 1) f.samples.splice(0, f.samples.length - 1);
    if (f.gaps) {
      f.gaps = f.gaps.filter((g) => g[1] >= cutoff);
      if (f.gaps.length === 0) delete f.gaps;
    }
  }

  return { v: 1, collectingSince: prev.collectingSince, lastSuccessAt: now, flights: kept };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS (the other suites are untouched; `publish.test.ts` and `fixture.test.ts` still pass because publish/fixture do not use the new fields yet).

- [ ] **Step 6: Commit**

```bash
git add functions/src/day-schema.ts functions/src/tracker.ts functions/test/tracker.test.ts
git commit -m "feat(functions): merge flights across coverage gaps, classify LANDED vs LAST_CONTACT"
```

---

### Task 2: Publish `end`, `gaps`, `airports`; airport names; fixture

**Files:**
- Modify: `functions/src/publish.ts`, `functions/src/routes.ts`, `functions/scripts/make-fixture.ts`
- Test: `functions/test/publish.test.ts`, `functions/test/routes.test.ts`, `functions/test/fixture.test.ts` (extend; do not weaken existing assertions)

**Interfaces:**
- Consumes: `endOf` (Task 1), `DayAirport`, `Flight.end/gaps`, `DayFile.airports`.
- Produces: `buildDayFile` now also returns `airports` (every airport of every routed flight, plus `IST` and `SAW`, lat/lon rounded to 4 decimals) and per flight `end` (always set) and `gaps` (only when non-empty, relative to `dep`); `routes.ts` carries the optional airport `name` from adsbdb.

- [ ] **Step 1: Write the failing tests**

Append to `functions/test/publish.test.ts` (inside the file, after the existing `describe` block; add the extra imports at the top: `import { endOf } ...` is NOT needed):

```ts
describe("buildDayFile — end, gaps, airports", () => {
  const SAW_FALLBACK = { lat: 40.8986, lon: 29.3092, country: "TR" };
  const state2: TrackerState = {
    v: 1,
    collectingSince: NOW - 7200,
    lastSuccessAt: NOW,
    flights: [
      {
        id: "a-1", icao24: "a", cs: "THY1", dep: NOW - 3600, arr: null, end: "AIRBORNE", lastContact: NOW,
        samples: [[NOW - 3600, 0, 0, 0], [NOW, 370, 0, 1]],
        gaps: [[NOW - 3000, NOW - 2400]],
        now: { gs: 480, trk: 300 },
        route: { origin: { ...IST, name: "Istanbul Airport" }, destination: JFK },
      },
      {
        id: "b-1", icao24: "b", cs: "THY2", dep: NOW - 7000, arr: NOW - 100, end: "LAST_CONTACT", lastContact: NOW - 100,
        samples: [[NOW - 7000, 350, 1, 0], [NOW - 100, 300, 2, 0]],
        route: { origin: LHR, destination: IST },
      },
      // legacy row: no `end`, arr set, nowhere near its destination → LAST_CONTACT
      {
        id: "c-1", icao24: "c", cs: "THY3", dep: NOW - 900, arr: NOW - 300, lastContact: NOW - 300,
        samples: [[NOW - 900, 300, 10, 10]], route: { origin: IST, destination: JFK },
      },
    ],
  };
  const day = buildDayFile(state2, NOW, { state: "ok", lastSuccessAt: NOW }, SRC);

  it("every flight carries an end; gaps are relative to dep and only present when non-empty", () => {
    expect(day.flights.map((f) => f.end)).toEqual(["AIRBORNE", "LAST_CONTACT", "LAST_CONTACT"]);
    expect(day.flights[0].gaps).toEqual([[600, 1200]]);
    expect(day.flights[1].gaps).toBeUndefined();
  });

  it("publishes the airports of routed flights plus IST and SAW, with names when known", () => {
    expect(Object.keys(day.airports!).sort()).toEqual(["IST", "JFK", "LHR", "SAW"]);
    expect(day.airports!.JFK).toEqual({ lat: 40.6398, lon: -73.7789, country: "US" });
    expect(day.airports!.IST).toEqual({ lat: 41.2613, lon: 28.742, country: "TR", name: "Istanbul Airport" });
    expect(day.airports!.SAW).toEqual(SAW_FALLBACK);
  });

  it("publishes IST/SAW even when no flight is routed", () => {
    const empty = buildDayFile({ v: 1, collectingSince: NOW, lastSuccessAt: NOW, flights: [] }, NOW, { state: "ok", lastSuccessAt: NOW }, SRC);
    expect(Object.keys(empty.airports!).sort()).toEqual(["IST", "SAW"]);
  });
});
```

Append to `functions/test/routes.test.ts` inside `describe("fetchRoute", ...)`:
```ts
  it("keeps the airport name when adsbdb provides one", async () => {
    const withName = JSON.parse(JSON.stringify(THY1));
    withName.response.flightroute.origin.name = "Istanbul Airport";
    const r = await fetchRoute(respond(200, withName) as unknown as typeof fetch, "THY1");
    expect(r?.origin.name).toBe("Istanbul Airport");
    expect(r?.destination.name).toBeUndefined();
  });
```

Append to `functions/test/fixture.test.ts` inside the `describe`:
```ts
  it("publishes airports, flight ends and some coverage gaps", () => {
    expect(day.airports!.IST).toBeDefined();
    expect(Object.keys(day.airports!).length).toBeGreaterThan(40);
    expect(day.flights.every((f) => f.end)).toBe(true);
    expect(day.flights.some((f) => f.end === "LAST_CONTACT")).toBe(true);
    expect(day.flights.some((f) => f.end === "LANDED")).toBe(true);
    expect(day.flights.some((f) => f.gaps && f.gaps.length > 0)).toBe(true);
  });

  it("only airborne flights are AIRBORNE", () => {
    for (const f of day.flights) expect(f.end === "AIRBORNE").toBe(f.arr === null);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd functions && npx vitest run test/publish.test.ts test/routes.test.ts test/fixture.test.ts`
Expected: FAIL (no `end`, `airports`, `gaps`, `name`).

- [ ] **Step 3: `routes.ts` — carry the airport name**

In `functions/src/routes.ts`, in `interface AdsbdbAirport` add `name?: string;` and replace `toAirport` with:
```ts
const toAirport = (a: AdsbdbAirport): Airport => ({
  iata: a.iata_code,
  country: a.country_iso_name,
  lat: a.latitude,
  lon: a.longitude,
  ...(a.name ? { name: a.name } : {}),
});
```

- [ ] **Step 4: `publish.ts` — end, gaps, airports**

In `functions/src/publish.ts`:
- Change the imports to:
```ts
import type { DayAirport, DayFile, DaySource, DayStatus, Flight, TrackedFlight, TrackerState } from "./day-schema.js";
import { haversineKm, initialBearing } from "./geo.js";
import { resolveEndpoint } from "./regions.js";
import { WINDOW, endOf } from "./tracker.js";
```
- After `const round1 = ...` add:
```ts
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

// Always published so the globe can mark the hub even on an empty day.
const HUB_AIRPORTS: Record<string, DayAirport> = {
  IST: { lat: 41.2613, lon: 28.742, country: "TR", name: "Istanbul Airport" },
  SAW: { lat: 40.8986, lon: 29.3092, country: "TR" },
};
```
- In `toFlight`, replace the construction of `out` and what follows with:
```ts
  const out: Flight = {
    id: f.id,
    cs: f.cs,
    tk: f.cs.replace(/^THY/, "TK"),
    from: f.route?.origin.iata,
    to: f.route?.destination.iata,
    region: ep?.region ?? "UNK",
    bearing: round1(ep ? ep.bearing : fallbackBearing(f)),
    dep: f.dep,
    arr: f.arr,
    end: endOf(f),
    s: f.samples.map(([t, alt, lat, lon]) => [t - f.dep, alt, lat, lon]),
  };
  if (f.gaps && f.gaps.length > 0) out.gaps = f.gaps.map(([a, b]) => [a - f.dep, b - f.dep]);
  if (f.arr === null && f.now) out.now = f.now;
  return out;
```
- In `buildDayFile`, before `return`, build the airports table and add it to the returned object:
```ts
  const airports: Record<string, DayAirport> = { ...HUB_AIRPORTS };
  for (const f of state.flights) {
    if (!f.route) continue;
    for (const a of [f.route.origin, f.route.destination]) {
      airports[a.iata] = {
        lat: round4(a.lat),
        lon: round4(a.lon),
        country: a.country,
        ...(a.name ? { name: a.name } : {}),
      };
    }
  }
```
and add `airports,` as the last property of the returned `DayFile` object (after `flights: state.flights.map(toFlight),`).

- [ ] **Step 5: `make-fixture.ts` — ends, gaps, airports**

In `functions/scripts/make-fixture.ts` replace the block from the line `const airborne = dep + dur > now;` through the closing `});` of `flights.push({ ... })` with:
```ts
      const airborne = dep + dur > now;
      // ~6 % of flights lose coverage in the middle (a gap), ~4 % of completed ones never reappear.
      const rGap = rnd();
      const rLost = rnd();
      const lostCompleted = !airborne && rLost < 0.04 && samples.length > 8;
      let kept = samples;
      let lostAt: number | null = null;
      if (lostCompleted) {
        const cut = Math.floor(samples.length * (0.45 + 0.35 * rnd()));
        kept = samples.slice(0, cut);
        lostAt = kept[kept.length - 1][0];
      }
      let gaps: [number, number][] | undefined;
      if (rGap < 0.06 && kept.length > 12) {
        const i0 = Math.floor(kept.length * 0.35);
        const i1 = Math.floor(kept.length * 0.6);
        gaps = [[kept[i0][0], kept[i1][0]]];
        kept = [...kept.slice(0, i0 + 1), ...kept.slice(i1)];
      }
      const last = kept[kept.length - 1];
      const prev = kept.length > 1 ? kept[kept.length - 2] : null;
      const trk = prev
        ? initialBearing(prev[2], prev[3], last[2], last[3])
        : initialBearing(origin.lat, origin.lon, destination.lat, destination.lon);
      const icao24 = Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0");
      flights.push({
        id: `${icao24}-${dep}`,
        icao24,
        cs: `THY${1 + Math.floor(rnd() * 2999)}`,
        dep,
        arr: airborne ? null : lostAt ?? dep + dur,
        end: airborne ? "AIRBORNE" : lostAt !== null ? "LAST_CONTACT" : "LANDED",
        lastContact: last[0],
        samples: kept,
        ...(gaps ? { gaps } : {}),
        route: unrouted ? null : { origin, destination },
        ...(airborne ? { now: { gs: Math.round(440 + rnd() * 60), trk: Math.round(trk * 10) / 10 } } : {}),
      });
```
(The `Sample`, `TrackedFlight` imports already exist in that file; no new imports are needed.)

- [ ] **Step 6: Run tests, typecheck, regenerate the fixture**

Run: `cd functions && npx vitest run && npx tsc --noEmit && npm run fixture`
Expected: all PASS; fixture printed (flights ≈ 2,100–2,300, airborne ≈ 280–320). If a pre-existing fixture assertion (volume, airborne-at-window-start > 100, UNK < 10 %) fails because the random stream shifted, fix **only** by adjusting `TARGET_FLIGHTS` (never the assertions) and re-run. Confirm `node -e "const d=require('../web/public/fixture/day.json');console.log(Object.keys(d.airports).length, d.flights.filter(f=>f.end==='LAST_CONTACT').length)"` prints two positive numbers.

- [ ] **Step 7: Commit**

```bash
git add functions/src/publish.ts functions/src/routes.ts functions/scripts/make-fixture.ts functions/test web/public/fixture/day.json
git commit -m "feat(functions): publish flight end/gaps and an airports table"
```

---

### Task 3: Deploy the collector and verify live output (controller)

This task changes the live Cloud Function; the user approved collector deploys. Run it in the controller session (or a subagent with deploy authority). No code changes.

- [ ] **Step 1: Build and test**

Run: `cd functions && npm run build && npx vitest run`
Expected: build OK, all tests PASS.

- [ ] **Step 2: Deploy only the collector**

```bash
firebase deploy --only functions:collect --project omerkilavuz-9ad41 --non-interactive --force
```
Expected: `collect(europe-west1) Successful update operation`.

- [ ] **Step 3: Verify after ≥ 2 scheduler runs (~5 min, poll with a bounded loop; foreground `sleep` may be blocked, use `perl -e 'select(undef,undef,undef,20)'`)**

```bash
firebase functions:log --only collect --project omerkilavuz-9ad41 | grep -E "collect ok|failed" | tail -4
curl -s "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media" \
 | jq -c '{status: .status.state, airports: (.airports|length), hasIST: (.airports.IST!=null), ends: ([.flights[].end]|group_by(.)|map({(.[0]):length})|add), withGaps: ([.flights[]|select(.gaps)]|length)}'
```
Expected: `collect ok` lines; `status: "ok"`; `airports` > 100; `hasIST: true`; `ends` has `AIRBORNE`, `LANDED`, `LAST_CONTACT` keys (legacy rows are classified, so LAST_CONTACT is large on day one); `withGaps` starts at 0 and grows as returning aircraft are merged.

- [ ] **Step 4: Record the outcome**

Append the numbers (airports, ends, withGaps) to the commit message of the next task's commit or to `docs/superpowers/plans/2026-10-06-plan-3-globe-phase-a.md` under a short "Outcome" note at the end of the plan; no separate commit is required.

---

### Task 4: Scaffold `globe/` (aliases, single React/three instance, fonts)

**Files:**
- Create: `globe/package.json`, `globe/tsconfig.json`, `globe/vite.config.ts`, `globe/index.html`, `globe/scripts/copy-fonts.mjs`, `globe/src/main.tsx`, `globe/src/App.tsx`, `globe/src/styles.css`, `globe/test/helpers.ts`, `globe/public/fixture/day.json` (generated)
- Modify: `.gitignore`, `functions/scripts/make-fixture.ts`
- Test: `globe/test/smoke.test.tsx`

**Interfaces:**
- Produces: aliases `@collector/*` → `../functions/src/*`, `@web/*` → `../web/src/*`; `globe/test/helpers.ts` exports `FROM`, `AIRPORTS`, `flight(o)`, `makeDay(partial)`.

Critical: `web/` files import `react`, `three`, `postprocessing` from `web/node_modules`; `globe/` has its own copies. Two React copies break hooks ("Invalid hook call"), two three copies break `instanceof`. `resolve.dedupe` forces every import to resolve from `globe/node_modules`. The smoke test proves it.

- [ ] **Step 1: `.gitignore` additions**

Append to the repo-root `.gitignore`:
```
globe/public/fonts/
globe/dist/
```

- [ ] **Step 2: Package, config, entry files**

`globe/package.json`:
```json
{
  "name": "dataroute-globe",
  "private": true,
  "type": "module",
  "scripts": {
    "fonts": "node scripts/copy-fonts.mjs",
    "predev": "npm run fonts",
    "dev": "vite --port 5174 --strictPort",
    "prebuild": "npm run fonts",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

Run:
```bash
cd globe && npm install react react-dom three@~0.186.0 postprocessing && npm install -D vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @types/react @types/react-dom @types/three@~0.186.0 @types/node@^22
```

`globe/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["vite/client", "node"],
    "paths": {
      "@collector/*": ["../functions/src/*"],
      "@web/*": ["../web/src/*"]
    }
  },
  "include": ["src", "test", "vite.config.ts"]
}
```
Contingency (only if `tsc` later reports type conflicts between `web/node_modules/@types/*` and `globe/node_modules/@types/*`): add to `paths` the entries `"three": ["./node_modules/@types/three"]`, `"react": ["./node_modules/@types/react"]`, `"react/jsx-runtime": ["./node_modules/@types/react/jsx-runtime"]`, `"react-dom": ["./node_modules/@types/react-dom"]`, `"react-dom/client": ["./node_modules/@types/react-dom/client"]`.

`globe/vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@collector": here("../functions/src"), "@web": here("../web/src") },
    // web/ modules must use globe's copies of these (one React, one three).
    dedupe: ["react", "react-dom", "three", "postprocessing"],
  },
  server: { fs: { allow: [".."] } },
  test: { include: ["test/**/*.test.{ts,tsx}"], environment: "node" },
});
```

`globe/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>THY 24H Operations · Globe</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`globe/scripts/copy-fonts.mjs` (identical logic to `web/scripts/copy-fonts.mjs`):
```js
// Copies the licensed TK web fonts from ../font into public/fonts (git-ignored, never committed).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "font");
const out = join(root, "public", "fonts");
const FILES = [
  "TK_DISPLAY/TK_Display_Web_WOFF2/TK_Display_Condensed_WOFF2/TKDisplayCondensed-SemiBold.woff2",
  "TK_DISPLAY/TK_Display_Web_WOFF2/TK_Display_Condensed_WOFF2/TKDisplayCondensed-Bold.woff2",
  "TK_TEXT/TK_Text_Web_WOFF2/TK_Text_Wide_WOFF2/TKTextWide-Medium.woff2",
  "TK_TEXT/TK_Text_Web_WOFF2/TK_Text_Regular_WOFF2/TKText-Regular.woff2",
  "TK_TEXT/TK_Text_Web_WOFF2/TK_Text_Regular_WOFF2/TKText-Medium.woff2",
];

if (!existsSync(src)) {
  console.warn(`[fonts] ${src} not found — the HUD falls back to system fonts`);
  process.exit(0);
}
mkdirSync(out, { recursive: true });
let copied = 0;
for (const file of FILES) {
  const from = join(src, file);
  if (!existsSync(from)) {
    console.warn(`[fonts] missing ${file}`);
    continue;
  }
  copyFileSync(from, join(out, file.split("/").pop()));
  copied++;
}
console.log(`[fonts] copied ${copied}/${FILES.length} files to public/fonts`);
```

`globe/src/main.tsx`:
```tsx
import { createRoot } from "react-dom/client";
import "@web/styles.css"; // base theme, fonts, HUD styles shared with the tunnel build
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

`globe/src/App.tsx` (placeholder, replaced in Task 11):
```tsx
export function App() {
  return <canvas className="stage" />;
}
```

`globe/src/styles.css` (globe-specific rules are appended in later tasks):
```css
/* Globe-specific styles (HUD additions are appended in Task 12). */
body { background: #02030a; }
```

`globe/test/helpers.ts`:
```ts
import type { DayAirport, DayFile, Flight } from "@collector/day-schema";

export const FROM = 1_800_000_000;

export const AIRPORTS: Record<string, DayAirport> = {
  IST: { lat: 41.2613, lon: 28.742, country: "TR", name: "Istanbul Airport" },
  JFK: { lat: 40.6398, lon: -73.7789, country: "US" },
  LHR: { lat: 51.47, lon: -0.454, country: "GB" },
  ESB: { lat: 40.128, lon: 32.995, country: "TR" },
};

let seq = 0;
export function flight(o: Partial<Flight> & { s: Flight["s"] }): Flight {
  seq++;
  return {
    id: `f${seq}`,
    cs: `THY${seq}`,
    tk: `TK${seq}`,
    region: "EUR",
    bearing: 300,
    dep: FROM,
    arr: null,
    end: "AIRBORNE",
    ...o,
  };
}

export function makeDay(partial: Partial<DayFile> = {}): DayFile {
  return {
    v: 1,
    generatedAt: FROM + 86400,
    collectingSince: FROM,
    status: { state: "ok", lastSuccessAt: FROM + 86400 },
    source: { name: "adsb.fi", url: "https://adsb.fi" },
    window: { from: FROM, to: FROM + 86400 },
    stats: { airborne: 0, flights24h: 0, destinations: 0, countries: 0, km24h: 0 },
    flights: [],
    airports: AIRPORTS,
    ...partial,
  };
}
```

- [ ] **Step 2b: Generate the fixture for the globe too**

`?data=fixture` fetches `/fixture/day.json`; Vite serves only `globe/public`. In `functions/scripts/make-fixture.ts` replace the `if (isMain) { ... }` block with:
```ts
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const day = makeFixture(Math.floor(Date.now() / 1000), 42);
  for (const out of [
    resolve(here, "../../web/public/fixture/day.json"),
    resolve(here, "../../globe/public/fixture/day.json"),
  ]) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(day));
  }
  console.log(`wrote web + globe fixtures: ${day.stats.flights24h} flights, ${day.stats.airborne} airborne`);
}
```
Then run `cd functions && npm run fixture && npx vitest run` (all PASS) and confirm `globe/public/fixture/day.json` exists and contains `airports` (`node -e "console.log(Object.keys(require('../globe/public/fixture/day.json').airports).length)"` prints a number > 40).

- [ ] **Step 3: Write the failing smoke test**

`globe/test/smoke.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REGIONS } from "@web/data/palette";
import { createStore, useStore } from "@web/hud/store";
import { FROM, flight, makeDay } from "./helpers";

function Probe({ store }: { store: ReturnType<typeof createStore<string>> }) {
  const v = useStore(store);
  return <span>{v}</span>;
}

describe("globe scaffold", () => {
  it("resolves @web/* and shares one React instance with web modules", () => {
    expect(REGIONS).toHaveLength(7);
    const { container } = render(<Probe store={createStore("ok")} />);
    expect(container.textContent).toBe("ok");
  });

  it("test helpers build a valid day", () => {
    const day = makeDay({ flights: [flight({ s: [[0, 100, 41, 29]] })] });
    expect(day.window.from).toBe(FROM);
    expect(day.flights[0].end).toBe("AIRBORNE");
    expect(Object.keys(day.airports!)).toContain("IST");
  });
});
```

- [ ] **Step 4: Run to verify it fails, then passes**

Run (before creating the config files this fails; after Step 2 it must pass):
`cd globe && npx vitest run && npx tsc --noEmit && npm run build`
Expected: smoke tests PASS, `tsc` clean (apply the contingency `paths` if needed and mention it in the report), `npm run fonts` prints `copied 5/5 files`, `vite build` writes `dist/`. `git status` must not list `globe/public/fonts/` or `globe/dist/`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore functions/scripts/make-fixture.ts globe/package.json globe/package-lock.json globe/tsconfig.json globe/vite.config.ts globe/index.html globe/scripts globe/src globe/test globe/public/fixture
git commit -m "feat(globe): scaffold Vite app sharing web/ and collector modules via aliases"
```

---

### Task 5: Astronomy (Earth rotation angle, sun position)

**Files:**
- Create: `globe/src/astro/index.ts`
- Test: `globe/test/astro.test.ts`

**Interfaces:**
- Produces: `julianDay(unixSec): number`, `gmstDeg(unixSec): number` (0–360), `interface SunPosition { raDeg: number; decDeg: number }`, `sunPosition(unixSec): SunPosition`, `sunDirection(unixSec): [number, number, number]` (unit, inertial frame), `earthRotationRad(unixSec): number`, `subSolarPoint(unixSec): { latDeg: number; lonDeg: number }` (lon in (−180, 180]), `wrap180(deg): number`.

Reference values below were computed with these exact formulas (Global Constraints) and agree with published almanac values (J2000 sun RA 281.27°, dec −23.03°; solstice declination ±23.44°; equation-of-time-sized sub-solar longitude offsets).

- [ ] **Step 1: Write the failing test**

`globe/test/astro.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { earthRotationRad, gmstDeg, julianDay, sunDirection, sunPosition, subSolarPoint, wrap180 } from "../src/astro";

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0) / 1000; // 946728000
const at = (iso: string) => Date.parse(iso) / 1000;

describe("astro", () => {
  it("julian day of the unix epoch and J2000", () => {
    expect(julianDay(0)).toBe(2440587.5);
    expect(julianDay(J2000)).toBeCloseTo(2451545.0, 6);
  });

  it("GMST at J2000 is 280.4606°", () => {
    expect(gmstDeg(J2000)).toBeCloseTo(280.4606, 3);
  });

  it("GMST advances 360° per sidereal day", () => {
    const t = at("2026-10-06T00:00:00Z");
    const a = gmstDeg(t);
    const b = gmstDeg(t + 86164.0905);
    const d = Math.abs(((b - a + 540) % 360) - 180);
    expect(d).toBeLessThan(0.01);
  });

  it("sun position at J2000", () => {
    const p = sunPosition(J2000);
    expect(p.raDeg).toBeCloseTo(281.2858, 2);
    expect(p.decDeg).toBeCloseTo(-23.0334, 2);
  });

  it("declination at equinox and solstices", () => {
    expect(sunPosition(at("2026-03-20T12:00:00Z")).decDeg).toBeCloseTo(-0.0434, 2);
    expect(sunPosition(at("2026-06-21T12:00:00Z")).decDeg).toBeCloseTo(23.4351, 2);
    expect(sunPosition(at("2026-12-21T12:00:00Z")).decDeg).toBeCloseTo(-23.4345, 2);
  });

  it("sub-solar point on 2026-10-06 12:00 UTC", () => {
    const p = subSolarPoint(at("2026-10-06T12:00:00Z"));
    expect(p.latDeg).toBeCloseTo(-5.2293, 2);
    expect(p.lonDeg).toBeCloseTo(-2.9744, 2);
  });

  it("sub-solar longitude is within the equation of time of 0° at 12:00 UTC all year", () => {
    for (const m of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const p = subSolarPoint(Date.UTC(2026, m, 15, 12, 0, 0) / 1000);
      expect(Math.abs(p.lonDeg)).toBeLessThan(4.5);
    }
  });

  it("sun direction is a unit vector matching (cosδ sinα, sinδ, cosδ cosα)", () => {
    const t = at("2026-10-06T12:00:00Z");
    const [x, y, z] = sunDirection(t);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
    const p = sunPosition(t);
    const a = (p.raDeg * Math.PI) / 180;
    const d = (p.decDeg * Math.PI) / 180;
    expect(x).toBeCloseTo(Math.cos(d) * Math.sin(a), 9);
    expect(y).toBeCloseTo(Math.sin(d), 9);
    expect(z).toBeCloseTo(Math.cos(d) * Math.cos(a), 9);
  });

  it("earthRotationRad is GMST in radians", () => {
    expect(earthRotationRad(J2000)).toBeCloseTo((280.4606 * Math.PI) / 180, 4);
  });

  it("wrap180", () => {
    expect(wrap180(190)).toBeCloseTo(-170, 9);
    expect(wrap180(-190)).toBeCloseTo(170, 9);
    expect(wrap180(0)).toBe(0);
    expect(wrap180(360)).toBeCloseTo(0, 9);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd globe && npx vitest run test/astro.test.ts`
Expected: FAIL — cannot resolve `../src/astro`.

- [ ] **Step 3: Implement**

`globe/src/astro/index.ts`:
```ts
const DEG = Math.PI / 180;
const mod360 = (x: number) => ((x % 360) + 360) % 360;

/** Wrap an angle in degrees to [-180, 180). */
export const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export const julianDay = (unixSec: number) => unixSec / 86400 + 2440587.5;

/** Greenwich mean sidereal angle in degrees [0, 360). */
export function gmstDeg(unixSec: number): number {
  const n = julianDay(unixSec) - 2451545.0;
  return mod360(280.46061837 + 360.98564736629 * n);
}

export interface SunPosition {
  raDeg: number;
  decDeg: number;
}

/** Low-precision (~0.01°) apparent sun position (Astronomical Almanac). */
export function sunPosition(unixSec: number): SunPosition {
  const n = julianDay(unixSec) - 2451545.0;
  const L = mod360(280.46 + 0.9856474 * n);
  const g = mod360(357.528 + 0.9856003 * n) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const epsilon = (23.439 - 4e-7 * n) * DEG;
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  return { raDeg: mod360(ra / DEG), decDeg: dec / DEG };
}

/** Unit vector toward the sun in the inertial frame (Y = polar axis, RA from +z toward +x). */
export function sunDirection(unixSec: number): [number, number, number] {
  const { raDeg, decDeg } = sunPosition(unixSec);
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.sin(a), Math.sin(d), Math.cos(d) * Math.cos(a)];
}

/** Angle to apply as `earthGroup.rotation.y` (radians). */
export function earthRotationRad(unixSec: number): number {
  return gmstDeg(unixSec) * DEG;
}

export function subSolarPoint(unixSec: number): { latDeg: number; lonDeg: number } {
  const p = sunPosition(unixSec);
  return { latDeg: p.decDeg, lonDeg: wrap180(p.raDeg - gmstDeg(unixSec)) };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd globe && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add globe/src/astro globe/test/astro.test.ts
git commit -m "feat(globe): Earth rotation angle and sun position"
```

---

### Task 6: 3D geometry (sphere mapping, planned arcs, track resampling)

**Files:**
- Create: `globe/src/geo3d/vec.ts`, `globe/src/geo3d/great.ts`, `globe/src/geo3d/resample.ts`
- Test: `globe/test/geo3d.test.ts`

**Interfaces:**
- Consumes: `haversineKm`, `interpolateGreatCircle` from `@collector/geo`.
- Produces:
  - `vec.ts`: `type Vec3 = [number, number, number]`, `R_EARTH_KM = 6371.0088`, `ALT_EXAG = 30`, `latLonToVec3(latDeg, lonDeg, radius = 1): Vec3`, `vec3ToLatLon(v: Vec3): { lat: number; lon: number }`, `altitudeRadius(alt100: number): number`.
  - `great.ts`: `interface LatLon { lat: number; lon: number }`, `destinationPoint(latDeg, lonDeg, bearingDeg, distKm): [number, number]`, `plannedLiftPeak(distKm): number`, `interface ArcPoint { lat: number; lon: number; radius: number; u: number }`, `plannedArc(from: LatLon, to: LatLon, n: number): { points: ArcPoint[]; distKm: number }`.
  - `resample.ts`: `interface TrackPoint { t: number; alt100: number; lat: number; lon: number }`, `resampleRun(t: ArrayLike<number>, alt: ArrayLike<number>, lat: ArrayLike<number>, lon: ArrayLike<number>, i0: number, i1: number, maxPts: number): TrackPoint[]`.

- [ ] **Step 1: Write the failing test**

`globe/test/geo3d.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { destinationPoint, plannedArc, plannedLiftPeak } from "../src/geo3d/great";
import { resampleRun } from "../src/geo3d/resample";
import { ALT_EXAG, R_EARTH_KM, altitudeRadius, latLonToVec3, vec3ToLatLon } from "../src/geo3d/vec";

describe("vec", () => {
  it("cardinal points", () => {
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    close(latLonToVec3(0, 0), [0, 0, 1]);
    close(latLonToVec3(0, 90), [1, 0, 0]);
    close(latLonToVec3(90, 0), [0, 1, 0]);
    close(latLonToVec3(0, -90), [-1, 0, 0]);
    close(latLonToVec3(0, 0, 2), [0, 0, 2]);
  });

  it("round trip", () => {
    for (const [lat, lon] of [[41.26, 28.74], [-33.9, 151.2], [0, 179.9], [60, -170], [-80, 10]]) {
      const r = vec3ToLatLon(latLonToVec3(lat, lon, 1.03));
      expect(r.lat).toBeCloseTo(lat, 9);
      expect(r.lon).toBeCloseTo(lon, 9);
    }
  });

  it("altitudeRadius", () => {
    expect(ALT_EXAG).toBe(30);
    expect(R_EARTH_KM).toBe(6371.0088);
    expect(altitudeRadius(0)).toBe(1);
    expect(altitudeRadius(-5)).toBe(1);
    expect(altitudeRadius(370)).toBeCloseTo(1.0531, 4);
  });
});

describe("great circle helpers", () => {
  it("destinationPoint", () => {
    const [la, lo] = destinationPoint(0, 0, 90, 111.1949);
    expect(la).toBeCloseTo(0, 3);
    expect(lo).toBeCloseTo(1, 3);
    const [la2, lo2] = destinationPoint(41.275, 28.752, 308.918, 8027);
    expect(la2).toBeCloseTo(40.64, 1);
    expect(lo2).toBeCloseTo(-73.78, 1);
    const [, lo3] = destinationPoint(0, 179, 90, 222.39);
    expect(lo3).toBeCloseTo(-179, 2);
  });

  it("plannedLiftPeak is distance based and capped", () => {
    expect(plannedLiftPeak(0)).toBeCloseTo(0.004, 9);
    expect(plannedLiftPeak(625)).toBeCloseTo(0.0285, 4);
    expect(plannedLiftPeak(2500)).toBeCloseTo(0.053, 9);
    expect(plannedLiftPeak(10000)).toBeCloseTo(0.053, 9);
  });

  it("plannedArc IST → JFK", () => {
    const { points, distKm } = plannedArc({ lat: 41.2613, lon: 28.742 }, { lat: 40.6398, lon: -73.7789 }, 48);
    expect(points).toHaveLength(48);
    expect(distKm).toBeCloseTo(8027.1, 0);
    expect(points[0].u).toBe(0);
    expect(points[47].u).toBe(1);
    expect(points[0].lat).toBeCloseTo(41.2613, 5);
    expect(points[0].lon).toBeCloseTo(28.742, 5);
    expect(points[47].lat).toBeCloseTo(40.6398, 5);
    expect(points[47].lon).toBeCloseTo(-73.7789, 5);
    expect(points[0].radius).toBeCloseTo(1, 9);
    expect(points[47].radius).toBeCloseTo(1, 9);
    const mid = points.reduce((m, p) => Math.max(m, p.radius), 0);
    expect(mid).toBeCloseTo(1 + plannedLiftPeak(distKm), 3);
  });

  it("plannedArc between identical points does not blow up", () => {
    const { points } = plannedArc({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }, 8);
    expect(points).toHaveLength(8);
    expect(points[3].lat).toBeCloseTo(10, 9);
  });
});

describe("resampleRun", () => {
  const t = [0, 100, 200, 300];
  const alt = [100, 100, 100, 100];
  const lat = [0, 0, 0, 0];
  const lon = [0, 10, 20, 30];

  it("returns the raw samples when the run is short enough", () => {
    const out = resampleRun(t, alt, lat, lon, 0, 3, 10);
    expect(out).toHaveLength(4);
    expect(out[2]).toEqual({ t: 200, alt100: 100, lat: 0, lon: 20 });
  });

  it("resamples evenly in time with great-circle interpolation", () => {
    const out = resampleRun(t, alt, lat, lon, 0, 3, 3);
    expect(out.map((p) => p.t)).toEqual([0, 150, 300]);
    expect(out[1].lon).toBeCloseTo(15, 6);
    expect(out[1].lat).toBeCloseTo(0, 6);
    expect(out[1].alt100).toBeCloseTo(100, 6);
    expect(out[0].lon).toBeCloseTo(0, 9);
    expect(out[2].lon).toBeCloseTo(30, 6);
  });

  it("works on a sub-range and handles one-point and empty ranges", () => {
    expect(resampleRun(t, alt, lat, lon, 1, 2, 5).map((p) => p.t)).toEqual([100, 200]);
    expect(resampleRun(t, alt, lat, lon, 2, 2, 5)).toEqual([{ t: 200, alt100: 100, lat: 0, lon: 20 }]);
    expect(resampleRun(t, alt, lat, lon, 3, 2, 5)).toEqual([]);
  });

  it("interpolates altitude smoothly and never below zero", () => {
    const out = resampleRun([0, 100, 200, 300], [0, 400, 400, 0], [0, 0, 0, 0], [0, 1, 2, 3], 0, 3, 7);
    expect(out).toHaveLength(4); // n = 4 < maxPts → raw
    const out2 = resampleRun([0, 100, 200, 300, 400, 500], [0, 400, 400, 400, 400, 0], [0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5], 0, 5, 11);
    expect(out2).toHaveLength(6);
    const many = resampleRun(
      Array.from({ length: 40 }, (_, i) => i * 60),
      Array.from({ length: 40 }, (_, i) => (i < 5 ? i * 80 : 400)),
      Array.from({ length: 40 }, () => 0),
      Array.from({ length: 40 }, (_, i) => i * 0.1),
      0, 39, 12,
    );
    expect(many).toHaveLength(12);
    for (const p of many) expect(p.alt100).toBeGreaterThanOrEqual(0);
    expect(many[0].alt100).toBeCloseTo(0, 6);
    expect(many[11].alt100).toBeCloseTo(400, 6);
  });

  it("handles the antimeridian", () => {
    const out = resampleRun([0, 100, 200], [100, 100, 100], [0, 0, 0], [179, -179, -177], 0, 2, 2);
    expect(out).toHaveLength(2);
    const out3 = resampleRun([0, 100, 200, 300], [100, 100, 100, 100], [0, 0, 0, 0], [178, 179, -179, -178], 0, 3, 3);
    expect(Math.abs(out3[1].lon)).toBeCloseTo(180, 4); // midpoint of 178 → -178 crosses ±180
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd globe && npx vitest run test/geo3d.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `vec.ts`**

`globe/src/geo3d/vec.ts`:
```ts
export type Vec3 = [number, number, number];

export const R_EARTH_KM = 6371.0088;
export const ALT_EXAG = 30; // visual altitude exaggeration

const DEG = Math.PI / 180;

/** Earth-fixed unit-sphere mapping: lon 0 → +z, east → +x, Y = polar axis. */
export function latLonToVec3(latDeg: number, lonDeg: number, radius = 1): Vec3 {
  const φ = latDeg * DEG;
  const λ = lonDeg * DEG;
  return [radius * Math.cos(φ) * Math.sin(λ), radius * Math.sin(φ), radius * Math.cos(φ) * Math.cos(λ)];
}

export function vec3ToLatLon(v: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lat: Math.asin(Math.max(-1, Math.min(1, v[1] / r))) / DEG, lon: Math.atan2(v[0], v[2]) / DEG };
}

/** Scene radius for an altitude given in hundreds of feet (ALT_EXAG applied). */
export function altitudeRadius(alt100: number): number {
  const km = (Math.max(alt100, 0) * 100 * 0.3048) / 1000;
  return 1 + (ALT_EXAG * km) / R_EARTH_KM;
}
```

- [ ] **Step 4: Implement `great.ts`**

`globe/src/geo3d/great.ts`:
```ts
import { haversineKm, interpolateGreatCircle } from "@collector/geo";
import { R_EARTH_KM } from "./vec";

const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

/** Point reached from (lat, lon) travelling `distKm` along the initial bearing on a great circle. */
export function destinationPoint(latDeg: number, lonDeg: number, bearingDeg: number, distKm: number): [number, number] {
  const φ1 = latDeg * DEG;
  const λ1 = lonDeg * DEG;
  const θ = bearingDeg * DEG;
  const δ = distKm / R_EARTH_KM;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [φ2 / DEG, wrap180(λ2 / DEG)];
}

/** Lift above the surface at the middle of a planned arc, in scene units. */
export function plannedLiftPeak(distKm: number): number {
  return 0.004 + 0.049 * Math.min(1, Math.sqrt(distKm / 2500));
}

export interface ArcPoint {
  lat: number;
  lon: number;
  radius: number;
  u: number;
}

/** Great-circle arc with a half-sine altitude profile; `n` points inclusive of both ends. */
export function plannedArc(from: LatLon, to: LatLon, n: number): { points: ArcPoint[]; distKm: number } {
  const distKm = haversineKm(from.lat, from.lon, to.lat, to.lon);
  const peak = plannedLiftPeak(distKm);
  const points: ArcPoint[] = [];
  for (let k = 0; k < n; k++) {
    const u = n > 1 ? k / (n - 1) : 0;
    const [lat, lon] = interpolateGreatCircle(from.lat, from.lon, to.lat, to.lon, u);
    points.push({ lat, lon, radius: 1 + peak * Math.pow(Math.sin(Math.PI * u), 0.6), u });
  }
  return { points, distKm };
}
```

- [ ] **Step 5: Implement `resample.ts`**

`globe/src/geo3d/resample.ts`:
```ts
import { interpolateGreatCircle } from "@collector/geo";

export interface TrackPoint {
  t: number;
  alt100: number;
  lat: number;
  lon: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, f: number): number {
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  );
}

/**
 * Resamples the continuous run of samples [i0..i1] (inclusive) into at most `maxPts` points evenly spaced in
 * time. Position follows the great circle between neighbouring samples; altitude uses a Catmull-Rom spline.
 * Runs that already fit are returned unchanged.
 */
export function resampleRun(
  t: ArrayLike<number>,
  alt: ArrayLike<number>,
  lat: ArrayLike<number>,
  lon: ArrayLike<number>,
  i0: number,
  i1: number,
  maxPts: number,
): TrackPoint[] {
  const n = i1 - i0 + 1;
  if (n <= 0) return [];
  const raw = (i: number): TrackPoint => ({ t: t[i], alt100: alt[i], lat: lat[i], lon: lon[i] });
  if (n === 1) return [raw(i0)];
  const count = Math.max(2, Math.min(maxPts, n));
  if (count === n) {
    const out: TrackPoint[] = [];
    for (let i = i0; i <= i1; i++) out.push(raw(i));
    return out;
  }
  const t0 = t[i0];
  const span = t[i1] - t0;
  const out: TrackPoint[] = [];
  let seg = i0;
  for (let k = 0; k < count; k++) {
    const tk = t0 + (span * k) / (count - 1);
    while (seg < i1 - 1 && t[seg + 1] < tk) seg++;
    const ta = t[seg];
    const tb = t[seg + 1];
    const f = tb > ta ? Math.min(1, Math.max(0, (tk - ta) / (tb - ta))) : 0;
    const [la, lo] = interpolateGreatCircle(lat[seg], lon[seg], lat[seg + 1], lon[seg + 1], f);
    const a = catmullRom(alt[Math.max(seg - 1, i0)], alt[seg], alt[seg + 1], alt[Math.min(seg + 2, i1)], f);
    out.push({ t: tk, alt100: Math.max(0, a), lat: la, lon: lo });
  }
  return out;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd globe && npx vitest run && npx tsc --noEmit`
Expected: all PASS. If the "antimeridian" or "smoothly" assertions fail because of arithmetic in the test (not the implementation), recompute the expected value by hand against the formulas above, keep the intent (midpoint of 178°→−178° is ±180°; first/last altitude preserved; never negative) and explain the adjustment in the report; do not weaken the intent.

- [ ] **Step 7: Commit**

```bash
git add globe/src/geo3d globe/test/geo3d.test.ts
git commit -m "feat(globe): sphere mapping, planned great-circle arcs and track resampling"
```

---

### Task 7: Globe model, dead reckoning, events, head smoothing

**Files:**
- Create: `globe/src/model/globe-model.ts`, `globe/src/model/dead-reckon.ts`, `globe/src/model/events.ts`, `globe/src/model/head-smoother.ts`
- Test: `globe/test/globe-model.test.ts`, `globe/test/dead-reckon.test.ts`, `globe/test/events.test.ts`, `globe/test/head-smoother.test.ts`

**Interfaces:**
- Consumes: `buildModel`, `FlightRec`, `Model` (`@web/data/model`); `sampleAt` (`@web/data/mapping`); `haversineKm`, `initialBearing` (`@collector/geo`); `destinationPoint` (Task 6); `DayFile`, `Flight`, `FlightEnd`, `DayAirport` (`@collector/day-schema`).
- Produces:
  - `globe-model.ts`: `interface PlannedRoute { fromLat: number; fromLon: number; toLat: number; toLon: number; distKm: number }`; `interface GlobeFlight extends FlightRec { status: FlightEnd; gaps: [number, number][]; lastT: number; trk?: number; planned?: PlannedRoute }` (times in seconds relative to `window.from`; **`status`**, because `FlightRec.end` is already the numeric end time); `interface GlobeModel extends Model { flights: GlobeFlight[]; airports: Record<string, DayAirport>; traffic: Map<string, number> }`; `statusOf(f: Pick<Flight, "end" | "arr">): FlightEnd`; `buildGlobeModel(day: DayFile): GlobeModel`.
  - `dead-reckon.ts`: `EXTRAPOLATE_MAX_SEC = 300`; `interface HeadState { lat: number; lon: number; alt100: number; extrapolated: boolean; ageSec: number }`; `headState(f: GlobeFlight, cur: number): HeadState | null`.
  - `events.ts`: `type EventKind = "DEPARTED" | "LANDED" | "LAST_CONTACT"`; `interface FlightEvent { id: string; kind: EventKind; tk: string; from?: string; to?: string; airport?: string; at: number }` (`at` = unix s); `diffEvents(prev: GlobeModel | null, next: GlobeModel): FlightEvent[]`.
  - `head-smoother.ts`: `SMOOTH_SEC = 1.5`; `class HeadSmoother { onSwap(prev: ReadonlyMap<string, [number, number]>, next: ReadonlyMap<string, [number, number]>, nowSec: number): void; apply(id: string, lat: number, lon: number, nowSec: number): [number, number] }`.

- [ ] **Step 1: Write the failing tests**

`globe/test/globe-model.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel, statusOf } from "../src/model/globe-model";
import { AIRPORTS, FROM, flight, makeDay } from "./helpers";

describe("statusOf", () => {
  it("explicit end wins; legacy rows never claim LANDED", () => {
    expect(statusOf({ end: "LANDED", arr: 5 })).toBe("LANDED");
    expect(statusOf({ arr: null })).toBe("AIRBORNE");
    expect(statusOf({ arr: 5 })).toBe("LAST_CONTACT");
  });
});

describe("buildGlobeModel", () => {
  const day = makeDay({
    flights: [
      flight({ id: "a", from: "IST", to: "JFK", dep: FROM + 1000, arr: null, end: "AIRBORNE", s: [[0, 0, 41, 29], [120, 100, 42, 28]], gaps: [[30, 60]], now: { gs: 480, trk: 300 } }),
      flight({ id: "b", from: "LHR", to: "IST", dep: FROM + 2000, arr: FROM + 5000, end: "LANDED", s: [[0, 300, 51, 0], [600, 10, 41, 29]] }),
      flight({ id: "c", dep: FROM + 3000, arr: FROM + 3100, end: "LAST_CONTACT", s: [[0, 300, 10, 10]] }),
      flight({ id: "empty", s: [] }),
    ],
  });
  const m = buildGlobeModel(day);

  it("keeps the base model fields and drops empty flights", () => {
    expect(m.from).toBe(FROM);
    expect(m.flights.map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(m.flights[0].t[0]).toBe(1000);
  });

  it("adds status, relative gaps, last sample time and track", () => {
    const [a, b, c] = m.flights;
    expect(a.status).toBe("AIRBORNE");
    expect(a.gaps).toEqual([[1030, 1060]]);
    expect(a.lastT).toBe(1120);
    expect(a.trk).toBe(300);
    expect(b.status).toBe("LANDED");
    expect(b.gaps).toEqual([]);
    expect(b.trk).toBeUndefined();
    expect(c.status).toBe("LAST_CONTACT");
  });

  it("derives planned routes only when both airports are known", () => {
    const [a, b, c] = m.flights;
    expect(a.planned).toMatchObject({ fromLat: AIRPORTS.IST.lat, toLon: AIRPORTS.JFK.lon });
    expect(a.planned!.distKm).toBeCloseTo(8027.1, 0);
    expect(b.planned).toBeDefined();
    expect(c.planned).toBeUndefined();
    const noAirports = buildGlobeModel(makeDay({ airports: undefined, flights: [flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] })] }));
    expect(noAirports.flights[0].planned).toBeUndefined();
    expect(noAirports.airports).toEqual({});
  });

  it("counts traffic per known airport", () => {
    expect(m.traffic.get("IST")).toBe(2);
    expect(m.traffic.get("JFK")).toBe(1);
    expect(m.traffic.get("LHR")).toBe(1);
    expect(m.traffic.has("ESB")).toBe(false);
  });
});
```

`globe/test/dead-reckon.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import { EXTRAPOLATE_MAX_SEC, headState } from "../src/model/dead-reckon";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];

// dep = FROM → relative times start at 0; samples every 120 s along the equator, 1° apart.
const base = { dep: FROM, s: [[0, 300, 0, 0], [120, 300, 0, 1]] as [number, number, number, number][] };

describe("headState", () => {
  it("is null before the first sample", () => {
    expect(headState(one({ ...base, dep: FROM + 500 }), 100)).toBeNull();
  });

  it("interpolates observed positions", () => {
    const h = headState(one({ ...base, arr: null, end: "AIRBORNE" }), 60)!;
    expect(h).toMatchObject({ extrapolated: false, ageSec: 0 });
    expect(h.lon).toBeCloseTo(0.5, 6);
    expect(h.alt100).toBeCloseTo(300, 6);
  });

  it("extrapolates an airborne flight with the last reported speed and track", () => {
    const f = one({ ...base, arr: null, end: "AIRBORNE", now: { gs: 480, trk: 90 } });
    const h = headState(f, 180)!; // 60 s after the last sample
    expect(h.extrapolated).toBe(true);
    expect(h.ageSec).toBe(60);
    // 480 kt = 888.96 km/h → 14.816 km in 60 s → 0.13325° of longitude at the equator
    expect(h.lon).toBeCloseTo(1.13325, 3);
    expect(h.lat).toBeCloseTo(0, 4);
    expect(h.alt100).toBe(300);
  });

  it("falls back to the last segment's speed and bearing when no live report exists", () => {
    const f = one({ ...base, arr: null, end: "AIRBORNE" }); // no `now`
    const h = headState(f, 180)!;
    expect(h.extrapolated).toBe(true);
    expect(h.lon).toBeCloseTo(1.5, 2); // segment speed = 1° / 120 s → 60 s more = 0.5°
  });

  it("stops after EXTRAPOLATE_MAX_SEC", () => {
    const f = one({ ...base, arr: null, end: "AIRBORNE", now: { gs: 480, trk: 90 } });
    expect(EXTRAPOLATE_MAX_SEC).toBe(300);
    expect(headState(f, 120 + 300)).not.toBeNull();
    expect(headState(f, 120 + 301)).toBeNull();
  });

  it("never extrapolates flights that are not airborne", () => {
    const f = one({ ...base, arr: FROM + 120, end: "LAST_CONTACT" });
    expect(headState(f, 60)!.extrapolated).toBe(false);
    expect(headState(f, 121)).toBeNull();
  });
});
```

`globe/test/events.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { diffEvents } from "../src/model/events";
import { buildGlobeModel } from "../src/model/globe-model";
import { FROM, flight, makeDay } from "./helpers";

const NOW1 = FROM + 86400;
const NOW2 = NOW1 + 120;
const mk = (generatedAt: number, flights: ReturnType<typeof flight>[]) =>
  buildGlobeModel(makeDay({ generatedAt, window: { from: generatedAt - 86400, to: generatedAt }, flights }));

const cruising = (id: string, o: Partial<Parameters<typeof flight>[0]> = {}) =>
  flight({ id, tk: `TK-${id}`, from: "IST", to: "JFK", dep: NOW1 - 3000, s: [[0, 300, 41, 29], [600, 370, 45, 20]], ...o });

describe("diffEvents", () => {
  it("emits nothing on the first load", () => {
    expect(diffEvents(null, mk(NOW1, [cruising("a")]))).toEqual([]);
  });

  it("DEPARTED for a fresh flight with a recent departure", () => {
    const prev = mk(NOW1, []);
    const next = mk(NOW2, [cruising("new", { dep: NOW2 - 200 })]);
    expect(diffEvents(prev, next)).toEqual([
      { id: "new:DEPARTED", kind: "DEPARTED", tk: "TK-new", from: "IST", to: "JFK", airport: "IST", at: NOW2 - 200 },
    ]);
  });

  it("no DEPARTED for a flight that departed long ago", () => {
    expect(diffEvents(mk(NOW1, []), mk(NOW2, [cruising("old", { dep: NOW2 - 5000 })]))).toEqual([]);
  });

  it("LANDED when an airborne flight ends as LANDED", () => {
    const prev = mk(NOW1, [cruising("a")]);
    const next = mk(NOW2, [cruising("a", { arr: NOW2 - 60, end: "LANDED" })]);
    expect(diffEvents(prev, next)).toEqual([
      { id: "a:LANDED", kind: "LANDED", tk: "TK-a", from: "IST", to: "JFK", airport: "JFK", at: NOW2 - 60 },
    ]);
  });

  it("LAST_CONTACT when an airborne flight goes silent", () => {
    const prev = mk(NOW1, [cruising("a")]);
    const next = mk(NOW2, [cruising("a", { arr: NOW2 - 2800, end: "LAST_CONTACT" })]);
    const ev = diffEvents(prev, next);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ id: "a:LAST_CONTACT", kind: "LAST_CONTACT", tk: "TK-a" });
  });

  it("resuming (LAST_CONTACT → AIRBORNE) and unchanged flights are silent", () => {
    const prev = mk(NOW1, [cruising("a", { arr: NOW1 - 100, end: "LAST_CONTACT" }), cruising("b")]);
    const next = mk(NOW2, [cruising("a"), cruising("b")]);
    expect(diffEvents(prev, next)).toEqual([]);
  });

  it("events are sorted by time", () => {
    const prev = mk(NOW1, [cruising("a"), cruising("b")]);
    const next = mk(NOW2, [
      cruising("a", { arr: NOW2 - 10, end: "LANDED" }),
      cruising("b", { arr: NOW2 - 90, end: "LANDED" }),
      cruising("c", { dep: NOW2 - 300 }),
    ]);
    expect(diffEvents(prev, next).map((e) => e.id)).toEqual(["c:DEPARTED", "b:LANDED", "a:LANDED"]);
  });
});
```

`globe/test/head-smoother.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { HeadSmoother, SMOOTH_SEC } from "../src/model/head-smoother";

const m = (...e: [string, [number, number]][]) => new Map<string, [number, number]>(e);

describe("HeadSmoother", () => {
  it("starts at the previous position and converges to the new one", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["a", [10, 20]]), m(["a", [10.2, 20.4]]), 100);
    expect(SMOOTH_SEC).toBe(1.5);
    const [la0, lo0] = s.apply("a", 10.2, 20.4, 100);
    expect(la0).toBeCloseTo(10, 9);
    expect(lo0).toBeCloseTo(20, 9);
    const [laH, loH] = s.apply("a", 10.2, 20.4, 100.75);
    expect(laH).toBeCloseTo(10.1, 6); // smoothstep(0.5) = 0.5
    expect(loH).toBeCloseTo(20.2, 6);
    const [la1, lo1] = s.apply("a", 10.2, 20.4, 101.5);
    expect(la1).toBe(10.2);
    expect(lo1).toBe(20.4);
    expect(s.apply("a", 10.5, 20.5, 101.6)).toEqual([10.5, 20.5]); // offset discarded
  });

  it("passes unknown flights through and ignores flights missing from either side", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["gone", [1, 1]]), m(["new", [2, 2]]), 0);
    expect(s.apply("gone", 1, 1, 0)).toEqual([1, 1]);
    expect(s.apply("new", 2, 2, 0)).toEqual([2, 2]);
  });

  it("takes the short way across the antimeridian", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["a", [0, 179.9]]), m(["a", [0, -179.9]]), 0);
    const [, lo] = s.apply("a", 0, -179.9, 0);
    expect(Math.abs(lo)).toBeCloseTo(179.9, 6);
  });

  it("skips negligible offsets", () => {
    const s = new HeadSmoother();
    s.onSwap(m(["a", [5, 5]]), m(["a", [5, 5]]), 0);
    expect(s.apply("a", 5, 5, 0.1)).toEqual([5, 5]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd globe && npx vitest run test/globe-model.test.ts test/dead-reckon.test.ts test/events.test.ts test/head-smoother.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `globe-model.ts`**

`globe/src/model/globe-model.ts`:
```ts
import type { DayAirport, DayFile, Flight, FlightEnd } from "@collector/day-schema";
import { haversineKm } from "@collector/geo";
import { buildModel, type FlightRec, type Model } from "@web/data/model";

export interface PlannedRoute {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distKm: number;
}

/** All times are seconds relative to `window.from` (like FlightRec). */
export interface GlobeFlight extends FlightRec {
  status: FlightEnd;
  gaps: [number, number][];
  lastT: number;
  trk?: number;
  planned?: PlannedRoute;
}

export interface GlobeModel extends Model {
  flights: GlobeFlight[];
  airports: Record<string, DayAirport>;
  /** number of flights using each known airport */
  traffic: Map<string, number>;
}

/** Legacy rows without `end`: arr set means we lost contact — never claim LANDED. */
export function statusOf(f: Pick<Flight, "end" | "arr">): FlightEnd {
  return f.end ?? (f.arr === null ? "AIRBORNE" : "LAST_CONTACT");
}

export function buildGlobeModel(day: DayFile): GlobeModel {
  const base = buildModel(day);
  const raw = new Map(day.flights.map((f) => [f.id, f]));
  const airports = day.airports ?? {};
  const traffic = new Map<string, number>();

  const flights = base.flights.map((fr): GlobeFlight => {
    const f = raw.get(fr.id)!;
    const a = f.from ? airports[f.from] : undefined;
    const b = f.to ? airports[f.to] : undefined;
    for (const code of [f.from, f.to]) {
      if (code && airports[code]) traffic.set(code, (traffic.get(code) ?? 0) + 1);
    }
    const planned: PlannedRoute | undefined =
      a && b
        ? { fromLat: a.lat, fromLon: a.lon, toLat: b.lat, toLon: b.lon, distKm: haversineKm(a.lat, a.lon, b.lat, b.lon) }
        : undefined;
    return {
      ...fr,
      status: statusOf(f),
      gaps: (f.gaps ?? []).map(([s, e]) => [fr.dep + s, fr.dep + e] as [number, number]),
      lastT: fr.t[fr.t.length - 1],
      ...(f.now ? { trk: f.now.trk } : {}),
      ...(planned ? { planned } : {}),
    };
  });

  return { ...base, flights, airports, traffic };
}
```

- [ ] **Step 4: Implement `dead-reckon.ts`**

`globe/src/model/dead-reckon.ts`:
```ts
import { haversineKm, initialBearing } from "@collector/geo";
import { sampleAt } from "@web/data/mapping";
import { destinationPoint } from "../geo3d/great";
import type { GlobeFlight } from "./globe-model";

export const EXTRAPOLATE_MAX_SEC = 300;

export interface HeadState {
  lat: number;
  lon: number;
  alt100: number;
  extrapolated: boolean;
  ageSec: number;
}

const KT_TO_KMH = 1.852;

/**
 * Where the head of a flight is at relative time `cur`. Observed while inside the sampled track; for airborne
 * flights up to EXTRAPOLATE_MAX_SEC beyond the last sample the head is dead-reckoned along the great circle
 * (and flagged `extrapolated`); afterwards it disappears. Non-airborne flights are never extrapolated.
 */
export function headState(f: GlobeFlight, cur: number): HeadState | null {
  if (cur < f.t[0]) return null;
  if (f.status !== "AIRBORNE" || cur <= f.lastT) {
    const s = sampleAt(f, cur);
    return s ? { lat: s.lat, lon: s.lon, alt100: s.alt, extrapolated: false, ageSec: 0 } : null;
  }
  const dt = cur - f.lastT;
  if (dt > EXTRAPOLATE_MAX_SEC) return null;

  const n = f.t.length;
  let gs = f.gs !== undefined && f.gs > 0 ? f.gs : undefined; // knots
  let trk = f.trk;
  if (n >= 2) {
    const dtSeg = f.t[n - 1] - f.t[n - 2];
    if (gs === undefined && dtSeg > 0) {
      gs = haversineKm(f.lat[n - 2], f.lon[n - 2], f.lat[n - 1], f.lon[n - 1]) / (dtSeg / 3600) / KT_TO_KMH;
    }
    if (trk === undefined) trk = initialBearing(f.lat[n - 2], f.lon[n - 2], f.lat[n - 1], f.lon[n - 1]);
  }
  if (gs === undefined || trk === undefined) return null;

  const distKm = (gs * KT_TO_KMH * dt) / 3600;
  const [lat, lon] = destinationPoint(f.lat[n - 1], f.lon[n - 1], trk, distKm);
  return { lat, lon, alt100: f.alt[n - 1], extrapolated: true, ageSec: dt };
}
```

- [ ] **Step 5: Implement `events.ts`**

`globe/src/model/events.ts`:
```ts
import type { GlobeFlight, GlobeModel } from "./globe-model";

export type EventKind = "DEPARTED" | "LANDED" | "LAST_CONTACT";

export interface FlightEvent {
  id: string;
  kind: EventKind;
  tk: string;
  from?: string;
  to?: string;
  airport?: string;
  /** unix seconds */
  at: number;
}

const RECENT_DEPARTURE_SEC = 900;

function event(kind: EventKind, f: GlobeFlight, at: number, airport?: string): FlightEvent {
  return { id: `${f.id}:${kind}`, kind, tk: f.tk, from: f.from, to: f.to, airport, at };
}

/** Events that happened between two consecutive models. None on the first load. */
export function diffEvents(prev: GlobeModel | null, next: GlobeModel): FlightEvent[] {
  if (!prev) return [];
  const before = new Map(prev.flights.map((f) => [f.id, f]));
  const out: FlightEvent[] = [];
  for (const f of next.flights) {
    const p = before.get(f.id);
    if (!p) {
      const dep = next.from + f.dep;
      if (dep >= next.generatedAt - RECENT_DEPARTURE_SEC) out.push(event("DEPARTED", f, dep, f.from));
      continue;
    }
    if (p.status === "AIRBORNE" && f.status === "LANDED") out.push(event("LANDED", f, next.from + f.end, f.to));
    else if (p.status === "AIRBORNE" && f.status === "LAST_CONTACT") out.push(event("LAST_CONTACT", f, next.from + f.end));
  }
  return out.sort((a, b) => a.at - b.at);
}
```

- [ ] **Step 6: Implement `head-smoother.ts`**

`globe/src/model/head-smoother.ts`:
```ts
export const SMOOTH_SEC = 1.5;

const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

/** After a data refresh heads jump to their newly measured positions; this eases the jump over SMOOTH_SEC. */
export class HeadSmoother {
  private offsets = new Map<string, { dLat: number; dLon: number; t0: number }>();

  onSwap(prev: ReadonlyMap<string, [number, number]>, next: ReadonlyMap<string, [number, number]>, nowSec: number): void {
    this.offsets.clear();
    for (const [id, p] of prev) {
      const n = next.get(id);
      if (!n) continue;
      const dLat = p[0] - n[0];
      const dLon = wrap180(p[1] - n[1]);
      if (Math.abs(dLat) < 1e-6 && Math.abs(dLon) < 1e-6) continue;
      this.offsets.set(id, { dLat, dLon, t0: nowSec });
    }
  }

  apply(id: string, lat: number, lon: number, nowSec: number): [number, number] {
    const o = this.offsets.get(id);
    if (!o) return [lat, lon];
    const k = (nowSec - o.t0) / SMOOTH_SEC;
    if (k >= 1) {
      this.offsets.delete(id);
      return [lat, lon];
    }
    const w = 1 - k * k * (3 - 2 * k);
    return [lat + o.dLat * w, wrap180(lon + o.dLon * w)];
  }
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd globe && npx vitest run && npx tsc --noEmit`
Expected: all PASS. If a numeric expectation fails, first re-derive it by hand (distances: 480 kt × 1.852 = 888.96 km/h; 111.195 km per degree of equatorial longitude), then report DONE_WITH_CONCERNS rather than editing expectations to fit.

- [ ] **Step 8: Commit**

```bash
git add globe/src/model globe/test
git commit -m "feat(globe): globe model, dead-reckoned heads, flight events and head smoothing"
```

---

### Task 8: Earth textures (acquisition + loader with tier fallback)

**Files:**
- Create: `globe/public/textures/day-8k.jpg`, `day-4k.jpg`, `night-8k.jpg`, `night-4k.jpg`, `clouds-2k.jpg`, `globe/src/scene/textures.ts`
- Test: `globe/test/textures.test.ts`

**Interfaces:**
- Produces: `type TextureTier = "8k" | "4k"`; `interface TierInputs { maxTextureSize: number; deviceMemory?: number; coarsePointer: boolean }`; `chooseTier(i: TierInputs): TextureTier`; `interface EarthTextureUrls { day: string; night: string; clouds: string }`; `textureUrls(tier: TextureTier): EarthTextureUrls`; `interface EarthTextures { tier: TextureTier; day: Texture; night: Texture; clouds: Texture }`; `detectTierInputs(renderer: WebGLRenderer): TierInputs`; `loadEarthTextures(renderer: WebGLRenderer, preferred: TextureTier, onProgress: (p: number) => void, load?: (url: string) => Promise<Texture>): Promise<EarthTextures | null>`.

- [ ] **Step 1 (controller, REQUIRES USER APPROVAL): acquire the imagery**

Downloading files needs the user's explicit yes. Ask once, naming exactly:

| File | Source | Size |
|---|---|---|
| `land_shallow_topo_8192.tif` (Blue Marble, 8192×4096, day) | `https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_8192.tif` | 27.8 MB |
| `BlackMarble_2016_3km.jpg` (VIIRS night lights) | `https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg` | 8.1 MB |
| `cloud_combined_2048.jpg` (cloud composite, 2048×1024) | `https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg` | 0.8 MB |

(All NASA Earth Observatory / Visible Earth imagery, public domain with credit. Total ≈ 37 MB download; the committed JPEGs are far smaller.) Only after approval:

```bash
mkdir -p globe/public/textures
curl -fsSL -o /tmp/land_shallow_topo_8192.tif https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_8192.tif
curl -fsSL -o /tmp/BlackMarble_2016_3km.jpg https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg
curl -fsSL -o globe/public/textures/clouds-2k.jpg https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
sips -s format jpeg -s formatOptions 88 /tmp/land_shallow_topo_8192.tif --out globe/public/textures/day-8k.jpg
sips -z 4096 8192 -s format jpeg -s formatOptions 88 /tmp/BlackMarble_2016_3km.jpg --out globe/public/textures/night-8k.jpg
sips -z 2048 4096 -s formatOptions 88 globe/public/textures/day-8k.jpg --out globe/public/textures/day-4k.jpg
sips -z 2048 4096 -s formatOptions 88 globe/public/textures/night-8k.jpg --out globe/public/textures/night-4k.jpg
sips -g pixelWidth -g pixelHeight globe/public/textures/*.jpg
ls -l globe/public/textures
```
Verify: `day-8k` and `night-8k` are 8192×4096, `*-4k` are 4096×2048, `clouds-2k` is 2048×1024, and every file is a 2:1 equirectangular image (open `day-8k.jpg` and `night-8k.jpg` with the Read tool or a browser tab and look: continents upright, Greenwich/Africa near the centre, north up). If `day-8k` is not 8192 wide, stop and report. Credits to show in the HUD (Task 12): `EARTH IMAGERY: NASA EARTH OBSERVATORY (BLUE MARBLE · BLACK MARBLE)`.

- [ ] **Step 2: Write the failing test**

`globe/test/textures.test.ts`:
```ts
import { Texture, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { chooseTier, loadEarthTextures, textureUrls } from "../src/scene/textures";

const renderer = { capabilities: { getMaxAnisotropy: () => 16 } } as unknown as WebGLRenderer;

describe("chooseTier", () => {
  it("8k only on capable, non-touch, well-provisioned devices", () => {
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 8, coarsePointer: false })).toBe("8k");
    expect(chooseTier({ maxTextureSize: 8192, coarsePointer: false })).toBe("8k"); // memory unknown → assume 8
    expect(chooseTier({ maxTextureSize: 4096, deviceMemory: 8, coarsePointer: false })).toBe("4k");
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 4, coarsePointer: false })).toBe("4k");
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 8, coarsePointer: true })).toBe("4k");
  });
});

describe("textureUrls", () => {
  it("builds per-tier urls; clouds are always 2k", () => {
    expect(textureUrls("8k")).toEqual({ day: "/textures/day-8k.jpg", night: "/textures/night-8k.jpg", clouds: "/textures/clouds-2k.jpg" });
    expect(textureUrls("4k").day).toBe("/textures/day-4k.jpg");
  });
});

describe("loadEarthTextures", () => {
  const okLoad = async () => new Texture();

  it("loads the preferred tier, applies anisotropy and reports progress up to 1", async () => {
    const progress: number[] = [];
    const t = await loadEarthTextures(renderer, "8k", (p) => progress.push(p), okLoad);
    expect(t!.tier).toBe("8k");
    expect(t!.day.anisotropy).toBe(8);
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("falls back from 8k to 4k when the 8k files fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const urls: string[] = [];
    const load = async (url: string) => {
      urls.push(url);
      if (url.includes("8k")) throw new Error("404");
      return new Texture();
    };
    const t = await loadEarthTextures(renderer, "8k", () => {}, load);
    expect(t!.tier).toBe("4k");
    expect(urls.some((u) => u.includes("day-4k"))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1); // the failed 8k attempt is logged once
    warn.mockRestore();
  });

  it("returns null when every tier fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = await loadEarthTextures(renderer, "8k", () => {}, async () => {
      throw new Error("boom");
    });
    expect(t).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2); // 8k and 4k
    warn.mockRestore();
  });

  it("a 4k request never tries 8k", async () => {
    const urls: string[] = [];
    await loadEarthTextures(renderer, "4k", () => {}, async (u) => {
      urls.push(u);
      return new Texture();
    });
    expect(urls.every((u) => !u.includes("8k"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd globe && npx vitest run test/textures.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `textures.ts`**

`globe/src/scene/textures.ts`:
```ts
import { TextureLoader, type Texture, type WebGLRenderer } from "three";

export type TextureTier = "8k" | "4k";

export interface TierInputs {
  maxTextureSize: number;
  deviceMemory?: number;
  coarsePointer: boolean;
}

/** 8K day/night maps cost ≈ 350 MB of GPU memory; only use them where that is safe. */
export function chooseTier(i: TierInputs): TextureTier {
  return i.maxTextureSize >= 8192 && (i.deviceMemory ?? 8) > 4 && !i.coarsePointer ? "8k" : "4k";
}

export interface EarthTextureUrls {
  day: string;
  night: string;
  clouds: string;
}

export const textureUrls = (tier: TextureTier): EarthTextureUrls => ({
  day: `/textures/day-${tier}.jpg`,
  night: `/textures/night-${tier}.jpg`,
  clouds: "/textures/clouds-2k.jpg",
});

export interface EarthTextures {
  tier: TextureTier;
  day: Texture;
  night: Texture;
  clouds: Texture;
}

export function detectTierInputs(renderer: WebGLRenderer): TierInputs {
  const gl = renderer.getContext();
  return {
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    coarsePointer: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
  };
}

const defaultLoad = (url: string) => new TextureLoader().loadAsync(url);

/**
 * Loads day/night/clouds for `preferred`; on failure retries once with the 4k tier. Returns null when nothing
 * could be loaded (the Earth then renders with flat colours). `onProgress` reports completed files / total.
 */
export async function loadEarthTextures(
  renderer: WebGLRenderer,
  preferred: TextureTier,
  onProgress: (p: number) => void,
  load: (url: string) => Promise<Texture> = defaultLoad,
): Promise<EarthTextures | null> {
  const tiers: TextureTier[] = preferred === "8k" ? ["8k", "4k"] : ["4k"];
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const tier of tiers) {
    const urls = textureUrls(tier);
    let done = 0;
    const track = (url: string) =>
      load(url).then((t) => {
        t.anisotropy = aniso;
        done++;
        onProgress(done / 3);
        return t;
      });
    try {
      const [day, night, clouds] = await Promise.all([track(urls.day), track(urls.night), track(urls.clouds)]);
      return { tier, day, night, clouds };
    } catch (e) {
      console.warn(`[textures] ${tier} failed`, e);
    }
  }
  return null;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd globe && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add globe/src/scene/textures.ts globe/test/textures.test.ts globe/public/textures
git commit -m "feat(globe): NASA Earth imagery (8k/4k/2k) and tiered texture loader"
```

---

### Task 9: Earth, atmosphere, space (stars + nebula)

**Files:**
- Create: `globe/src/scene/earth.ts`, `globe/src/scene/atmosphere.ts`, `globe/src/scene/space.ts`, `NOTICE`
- Test: `globe/test/scene-materials.test.ts`

**Interfaces:**
- Consumes: `EarthTextures` (Task 8); `createTunnel`, `Tunnel` from `@web/render/tunnel` (Plan 2: `{ uniforms: { u_res, u_time, u_energy, u_tint, u_fade }, display: Mesh, setSize(w, h, scale), render(r), dispose() }`).
- Produces:
  - `earth.ts`: `EARTH_VERT`, `EARTH_FRAG`, `interface Earth { mesh: Mesh; uniforms: EarthUniforms; setTextures(t: EarthTextures | null): void; setSun(dir: [number, number, number]): void; setCloudDrift(x: number): void; dispose(): void }`, `createEarth(): Earth`.
  - `atmosphere.ts`: `interface Atmosphere { mesh: Mesh; setSun(dir: [number, number, number]): void; dispose(): void }`, `createAtmosphere(): Atmosphere`.
  - `space.ts`: `interface Space { stars: Mesh; nebula: Tunnel; update(camera: PerspectiveCamera): void; dispose(): void }`, `createSpace(): Space`.

GPU shader code cannot be exercised by unit tests; tests assert structure only. The controller verifies the look in a real browser at the end of Task 11. Allowed tuning constants (record any change): `uExposure` 1.0–2.0, `uGamma` 0.35–0.6, night-light gain `1.7`, atmosphere `uIntensity` 0.6–2.0, `uPower` 1.5–4, `uRimScale` 2.5–5, nebula `u_energy` 0.2–0.45.

- [ ] **Step 1: Write the failing test**

`globe/test/scene-materials.test.ts`:
```ts
import { AdditiveBlending, BackSide, Matrix3, PerspectiveCamera, Texture } from "three";
import { describe, expect, it } from "vitest";
import { createAtmosphere } from "../src/scene/atmosphere";
import { EARTH_FRAG, createEarth } from "../src/scene/earth";
import { createSpace } from "../src/scene/space";
import type { EarthTextures } from "../src/scene/textures";

describe("earth", () => {
  it("is a unit sphere with the planet look wired to uniforms", () => {
    const e = createEarth();
    const g = e.mesh.geometry as unknown as { parameters: { radius: number } };
    expect(g.parameters.radius).toBe(1);
    for (const needle of ["sphereUV", "uSunDir", "uNight", "uClouds", "uHasTex", "reinhard"]) {
      expect(EARTH_FRAG).toContain(needle);
    }
    expect(e.uniforms.uHasTex.value).toBe(0);
    e.dispose();
  });

  it("setSun normalises, setTextures toggles uHasTex, setCloudDrift wraps", () => {
    const e = createEarth();
    e.setSun([0, 3, 4]);
    expect(e.uniforms.uSunDir.value.length()).toBeCloseTo(1, 9);
    expect(e.uniforms.uSunDir.value.y).toBeCloseTo(0.6, 9);
    const tex: EarthTextures = { tier: "4k", day: new Texture(), night: new Texture(), clouds: new Texture() };
    e.setTextures(tex);
    expect(e.uniforms.uHasTex.value).toBe(1);
    expect(e.uniforms.uDay.value).toBe(tex.day);
    e.setTextures(null);
    expect(e.uniforms.uHasTex.value).toBe(0);
    e.setCloudDrift(2.25);
    expect(e.uniforms.uCloudDrift.value).toBeCloseTo(0.25, 9);
    e.dispose();
  });
});

describe("atmosphere", () => {
  it("is an additive back-face shell slightly larger than the Earth", () => {
    const a = createAtmosphere();
    const m = a.mesh.material as import("three").ShaderMaterial;
    expect(m.side).toBe(BackSide);
    expect(m.blending).toBe(AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    expect((a.mesh.geometry as unknown as { parameters: { radius: number } }).parameters.radius).toBeGreaterThan(1.02);
    a.setSun([1, 0, 0]);
    expect(m.uniforms.uSunDir.value.x).toBeCloseTo(1, 9);
    a.dispose();
  });
});

describe("space", () => {
  it("has a depth-tested star quad and a nebula tunnel with low energy", () => {
    const s = createSpace();
    const mat = s.stars.material as import("three").ShaderMaterial;
    expect(mat.depthTest).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.uniforms.uInvRot.value).toBeInstanceOf(Matrix3);
    expect(s.nebula.uniforms.u_energy.value).toBeLessThan(0.5);
    s.dispose();
  });

  it("update copies the camera orientation and projection into the star uniforms", () => {
    const s = createSpace();
    const cam = new PerspectiveCamera(40, 2, 0.05, 50);
    cam.position.set(0, 0, 3.2);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    s.update(cam);
    const u = (s.stars.material as import("three").ShaderMaterial).uniforms;
    expect(u.uAspect.value).toBe(2);
    expect(u.uTanHalf.value).toBeCloseTo(Math.tan((40 * Math.PI) / 360), 9);
    s.dispose();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd globe && npx vitest run test/scene-materials.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `earth.ts`**

`globe/src/scene/earth.ts`:
```ts
/*
 * Earth look (day/night blend, night lights, cloud mix, Reinhard-style tone mapping) adapted from
 * "realtime-planet-shader" by Julien Sulpis — https://github.com/jsulpis/realtime-planet-shader (GPL-3.0).
 * Re-implemented on a 3D sphere mesh so that arcs can be depth-tested and the camera can move.
 * See /NOTICE.
 */
import { Mesh, ShaderMaterial, SphereGeometry, Vector3, type Texture } from "three";
import type { EarthTextures } from "./textures";

export const EARTH_VERT = /* glsl */ `
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

export const EARTH_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform float uHasTex;
uniform vec3 uSunDir;
uniform float uCloudDrift;
uniform float uExposure;
uniform float uGamma;
varying vec3 vObj;
varying vec3 vWorldN;
varying vec3 vWorldPos;
#define PI 3.14159265359

vec2 sphereUV(vec3 p) {
  vec3 d = normalize(p);
  float lon = atan(d.x, d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  return vec2((lon + PI) / (2.0 * PI), (lat + PI * 0.5) / PI);
}

vec3 reinhard(vec3 c) {
  c *= uExposure / (1.0 + c / uExposure);
  return pow(c, vec3(uGamma));
}

void main() {
  vec3 N = normalize(vWorldN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 uv = sphereUV(vObj);
  float ndl = dot(N, uSunDir);
  float dayAmt = smoothstep(-0.10, 0.22, ndl);

  vec3 dayCol = uHasTex > 0.5 ? texture2D(uDay, uv).rgb : vec3(0.10, 0.22, 0.45);
  float cloud = uHasTex > 0.5 ? texture2D(uClouds, vec2(fract(uv.x + uCloudDrift), uv.y)).r : 0.0;
  float ocean = clamp((dayCol.b - max(dayCol.r, dayCol.g)) * 6.0, 0.0, 1.0);

  vec3 albedo = mix(dayCol, vec3(1.0), cloud * 0.6);
  float diffuse = pow(clamp(ndl, 0.0, 1.0), 0.85) * 1.15;
  vec3 col = albedo * (0.015 + diffuse);

  vec3 R = reflect(-uSunDir, N);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(R, V), 0.0), 36.0) * ocean * (1.0 - cloud) * 0.45 * dayAmt;

  vec3 night = uHasTex > 0.5 ? pow(texture2D(uNight, uv).rgb, vec3(1.7)) : vec3(0.0);
  col += night * vec3(1.0, 0.78, 0.5) * 1.7 * (1.0 - dayAmt) * (1.0 - cloud * 0.65);

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.10, 0.32, 0.95) * fres * (0.10 + 0.9 * dayAmt) * 0.9;

  gl_FragColor = vec4(reinhard(col), 1.0);
}
`;

export interface EarthUniforms {
  uDay: { value: Texture | null };
  uNight: { value: Texture | null };
  uClouds: { value: Texture | null };
  uHasTex: { value: number };
  uSunDir: { value: Vector3 };
  uCloudDrift: { value: number };
  uExposure: { value: number };
  uGamma: { value: number };
}

export interface Earth {
  mesh: Mesh;
  uniforms: EarthUniforms;
  setTextures(t: EarthTextures | null): void;
  setSun(dir: [number, number, number]): void;
  setCloudDrift(x: number): void;
  dispose(): void;
}

export function createEarth(): Earth {
  const uniforms: EarthUniforms = {
    uDay: { value: null },
    uNight: { value: null },
    uClouds: { value: null },
    uHasTex: { value: 0 },
    uSunDir: { value: new Vector3(1, 0, 0) },
    uCloudDrift: { value: 0 },
    uExposure: { value: 1.5 },
    uGamma: { value: 1 / 2.4 },
  };
  const geometry = new SphereGeometry(1, 128, 96);
  const material = new ShaderMaterial({ uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms,
    setTextures(t) {
      uniforms.uDay.value = t?.day ?? null;
      uniforms.uNight.value = t?.night ?? null;
      uniforms.uClouds.value = t?.clouds ?? null;
      uniforms.uHasTex.value = t ? 1 : 0;
    },
    setSun(dir) {
      uniforms.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
    },
    setCloudDrift(x) {
      uniforms.uCloudDrift.value = ((x % 1) + 1) % 1;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 4: Implement `atmosphere.ts`**

`globe/src/scene/atmosphere.ts`:
```ts
import { AdditiveBlending, BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWN;
void main() {
  vN = normalize(normalMatrix * normal);
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Back faces of a shell slightly larger than the Earth: -dot(N, view axis) is 0 at the shell's outer silhouette
// and grows towards the Earth's limb, giving a glow that fades outwards.
const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPower;
uniform float uRimScale;
varying vec3 vN;
varying vec3 vWN;
void main() {
  float rim = clamp(-dot(normalize(vN), vec3(0.0, 0.0, 1.0)) * uRimScale, 0.0, 1.0);
  float sunSide = clamp(dot(normalize(vWN), uSunDir) * 0.8 + 0.45, 0.0, 1.0);
  float i = pow(rim, uPower) * uIntensity * sunSide;
  gl_FragColor = vec4(uColor * i, 1.0);
}
`;

export interface Atmosphere {
  mesh: Mesh;
  setSun(dir: [number, number, number]): void;
  dispose(): void;
}

export function createAtmosphere(): Atmosphere {
  const uniforms = {
    uSunDir: { value: new Vector3(1, 0, 0) },
    uColor: { value: new Color(0.22, 0.5, 1.0) },
    uIntensity: { value: 1.2 },
    uPower: { value: 2.6 },
    uRimScale: { value: 3.4 },
  };
  const geometry = new SphereGeometry(1.045, 96, 64);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    setSun(dir) {
      uniforms.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 5: Implement `space.ts`**

`globe/src/scene/space.ts`:
```ts
import { AdditiveBlending, Matrix3, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial } from "three";
import { createTunnel, type Tunnel } from "@web/render/tunnel";

const STARS_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const STARS_FRAG = /* glsl */ `
precision highp float;
uniform mat3 uInvRot;
uniform float uAspect;
uniform float uTanHalf;
varying vec2 vNdc;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 starLayer(vec3 d, float scale, float threshold, float size) {
  vec3 g = d * scale;
  vec3 id = floor(g);
  vec3 f = fract(g) - 0.5;
  float h = hash31(id);
  if (h < threshold) return vec3(0.0);
  float r = length(f);
  float s = 1.0 - smoothstep(0.0, size, r);
  float bright = (h - threshold) / (1.0 - threshold);
  vec3 tint = mix(vec3(0.70, 0.82, 1.0), vec3(1.0, 0.90, 0.75), hash31(id + 7.0));
  return tint * s * s * (0.25 + 1.4 * bright);
}

void main() {
  vec3 dir = normalize(uInvRot * vec3(vNdc.x * uAspect * uTanHalf, vNdc.y * uTanHalf, -1.0));
  vec3 col = starLayer(dir, 90.0, 0.965, 0.30) + starLayer(dir, 40.0, 0.985, 0.38) * 1.4;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Space {
  stars: Mesh;
  nebula: Tunnel;
  update(camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createSpace(): Space {
  const uniforms = {
    uInvRot: { value: new Matrix3() },
    uAspect: { value: 1 },
    uTanHalf: { value: Math.tan((40 * Math.PI) / 360) },
  };
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: STARS_VERT,
    fragmentShader: STARS_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true, // sits at the far plane: the Earth (nearer) hides it
    depthWrite: false,
  });
  const stars = new Mesh(geometry, material);
  stars.frustumCulled = false;

  const nebula = createTunnel();
  nebula.uniforms.u_energy.value = 0.3;

  return {
    stars,
    nebula,
    update(camera) {
      uniforms.uInvRot.value.setFromMatrix4(camera.matrixWorld);
      uniforms.uAspect.value = camera.aspect;
      uniforms.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      nebula.dispose();
    },
  };
}
```

- [ ] **Step 6: `NOTICE`**

Create `NOTICE` at the repo root:
```
DataRoute — third-party notices

1. globe/src/scene/earth.ts
   The Earth shading approach (day/night blend, night lights, cloud mix, Reinhard-style tone mapping) is adapted
   from "realtime-planet-shader" by Julien Sulpis, https://github.com/jsulpis/realtime-planet-shader,
   licensed under GPL-3.0. How this repository is licensed with respect to that work is decided by the
   repository owner.

2. Earth imagery (globe/public/textures)
   NASA Earth Observatory / Visible Earth: Blue Marble (land_shallow_topo), Black Marble 2016 (Suomi NPP VIIRS),
   cloud composite. NASA imagery is generally not copyrighted; credit "NASA Earth Observatory".

3. Live aircraft data: adsb.fi open data (personal, non-commercial use; attribution required).
   Flight routes: adsbdb. Aircraft registry: tar1090-db (open source).

4. TK fonts are licensed and are not stored in git; they are copied into the build from a local folder.
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd globe && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add globe/src/scene/earth.ts globe/src/scene/atmosphere.ts globe/src/scene/space.ts globe/test/scene-materials.test.ts NOTICE
git commit -m "feat(globe): Earth, atmosphere shell, stars and nebula background"
```

---

### Task 10: Arcs, heads, airports and 3D picking

**Files:**
- Create: `globe/src/scene/arcs.ts`, `globe/src/scene/heads.ts`, `globe/src/scene/airports.ts`, `globe/src/scene/picking3d.ts`
- Test: `globe/test/arcs.test.ts`, `globe/test/heads.test.ts`, `globe/test/airports.test.ts`, `globe/test/picking3d.test.ts`

**Interfaces:**
- Consumes: `GlobeModel`, `GlobeFlight` (Task 7); `headState`, `HeadSmoother` (Task 7); `latLonToVec3`, `altitudeRadius`, `R_EARTH_KM` (Task 6); `plannedArc`, `resampleRun` (Task 6); `REGION_RGB` (`@web/data/palette`).
- Produces:
  - `arcs.ts`: `ARC_BASE_LIFT = 0.002`, `MAX_RUN_POINTS = 96`, `PLANNED_POINTS = 48`, `BREAK_SEC = 600`, `ARC_WIDTH_PX = 1.6`, `isBreak(f: GlobeFlight, i: number): boolean`, `interface ArcBuffers { a: Float32Array; b: Float32Array; t: Float32Array; info: Float32Array; s: Float32Array; count: number }` (per segment: `a`,`b` = vec3 Earth-fixed positions; `t` = [tA, tB] seconds relative to `window.from` — for planned segments `[dep, end]`; `info` = [regionIdx, kind (0 observed, 1 planned), flightIdx, 0]; `s` = [sA, sB] path coordinate in scene units for dashes), `buildArcBuffers(m: GlobeModel): ArcBuffers`, `interface Arcs { mesh: Mesh; uniforms: ArcUniforms; setResolution(w: number, h: number, pixelRatio: number): void; dispose(): void }`, `createArcs(m: GlobeModel): Arcs`.
  - `heads.ts`: `HEAD_SIZE_PX = 8`, `MAX_HEADS = 4096`, `HEAD_LIFT = 0.004`, `interface HeadBuffers { pos: Float32Array; color: Float32Array; flight: Float32Array; flag: Float32Array }`, `computeHeads(m: GlobeModel, cur: number, nowSec: number, smoother: HeadSmoother | null, out: HeadBuffers, max?: number): { count: number; extrapolated: number }`, `headLatLons(m: GlobeModel, cur: number): Map<string, [number, number]>`, `interface Heads { points: Points; data: HeadBuffers & { count: number }; update(m: GlobeModel, cur: number, nowSec: number, highlight: number, smoother: HeadSmoother | null): { count: number; extrapolated: number }; setPixelRatio(pr: number): void; dispose(): void }`, `createHeads(): Heads`.
  - `airports.ts`: `airportSize(count: number, maxCount: number, isHub: boolean): number`, `interface Airports { points: Points; codes: string[]; pulse(iata: string, nowSec: number): void; setNow(nowSec: number): void; setPixelRatio(pr: number): void; dispose(): void }`, `createAirports(m: GlobeModel): Airports`.
  - `picking3d.ts`: `PICK_RADIUS_PX = 12`, `interface PickIndex { xyz: Float32Array; t: Float32Array; flight: Int32Array; count: number }`, `buildPickIndex(m: GlobeModel, stride?: number): PickIndex`, `pickFlight(idx: PickIndex, heads: { pos: Float32Array; flight: Float32Array; count: number } | null, cur: number, world: Matrix4, camera: PerspectiveCamera, width: number, height: number, x: number, y: number, maxPx?: number): number` (flight index or −1).

Notes for the implementer: arcs and heads are children of the Earth-fixed group (their `modelMatrix` carries the Earth rotation). Material rules learned in Plan 2: ribbon materials must be `side: DoubleSide` (the quad winding is view dependent, back-face culling would drop every ribbon); never use reversed `smoothstep` edges; transparent additive layers use `depthTest: true, depthWrite: false` here so the Earth hides what is behind it.

- [ ] **Step 1: Write the failing tests**

`globe/test/arcs.test.ts`:
```ts
import { DoubleSide, type ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { ARC_BASE_LIFT, ARC_WIDTH_PX, BREAK_SEC, buildArcBuffers, createArcs, isBreak } from "../src/scene/arcs";
import { buildGlobeModel } from "../src/model/globe-model";
import { altitudeRadius } from "../src/geo3d/vec";
import { FROM, flight, makeDay } from "./helpers";

const model = buildGlobeModel(
  makeDay({
    flights: [
      // observed with a coverage gap between t=240 and t=5000 (relative to dep = FROM + 100)
      flight({
        id: "a", from: "IST", to: "JFK", region: "AME", dep: FROM + 100, arr: null, end: "AIRBORNE",
        s: [[0, 100, 41, 29], [120, 100, 42, 28], [240, 100, 43, 27], [4900, 300, 50, -30], [5020, 300, 51, -31]],
        gaps: [[240, 4900]],
      }),
      // no route known → observed only
      flight({ id: "b", region: "UNK", dep: FROM + 200, arr: FROM + 500, end: "LAST_CONTACT", s: [[0, 200, 10, 10], [120, 200, 10.5, 10.5]] }),
      // single sample → no segments at all
      flight({ id: "c", dep: FROM + 300, s: [[0, 100, 0, 0]] }),
    ],
  }),
);

describe("isBreak", () => {
  const f = model.flights[0];
  it("breaks on a matching gap or a long silence, not on normal spacing", () => {
    expect(BREAK_SEC).toBe(600);
    expect(isBreak(f, 0)).toBe(false);
    expect(isBreak(f, 1)).toBe(false);
    expect(isBreak(f, 2)).toBe(true); // 240 → 4900 matches the gap
    expect(isBreak(f, 3)).toBe(false);
  });
  it("breaks on dt > BREAK_SEC even without a gap record", () => {
    const g = { ...f, gaps: [] };
    expect(isBreak(g, 2)).toBe(true);
  });
});

describe("buildArcBuffers", () => {
  const b = buildArcBuffers(model);
  const kinds = Array.from({ length: b.count }, (_, i) => b.info[i * 4 + 1]);

  it("observed runs skip the gap; planned arc is added only for routed flights", () => {
    // flight a: run1 (3 pts → 2 seg) + run2 (2 pts → 1 seg) = 3 observed; planned = 47
    // flight b: 1 observed, no planned; flight c: nothing
    expect(kinds.filter((k) => k === 0)).toHaveLength(4);
    expect(kinds.filter((k) => k === 1)).toHaveLength(47);
    expect(b.count).toBe(51);
  });

  it("segment attributes", () => {
    const rel = FROM + 100 - FROM; // dep relative to window.from
    const first = 0;
    expect(b.info[first * 4]).toBe(5); // AME index in REGIONS
    expect(b.info[first * 4 + 2]).toBe(0); // flight index
    expect(Array.from(b.t.slice(0, 2))).toEqual([rel + 0, rel + 120]);
    const len = Math.hypot(b.a[0], b.a[1], b.a[2]);
    expect(len).toBeCloseTo(altitudeRadius(100) + ARC_BASE_LIFT, 5);
  });

  it("planned segments carry [dep, end] and a dash coordinate that grows along the arc", () => {
    const i = kinds.findIndex((k) => k === 1);
    const f = model.flights[0];
    expect(b.t[i * 2]).toBe(f.dep);
    expect(b.t[i * 2 + 1]).toBe(f.end);
    expect(b.s[i * 2 + 1]).toBeGreaterThan(b.s[i * 2]);
    const last = kinds.lastIndexOf(1);
    expect(b.s[last * 2 + 1]).toBeCloseTo(f.planned!.distKm / 6371.0088, 3);
    expect(b.info[i * 4 + 2]).toBe(0);
  });

  it("all positions are finite", () => {
    for (const v of [b.a, b.b, b.t, b.s]) expect(Array.from(v).every(Number.isFinite)).toBe(true);
  });
});

describe("createArcs", () => {
  it("is a double-sided, depth-tested additive instanced mesh", () => {
    const a = createArcs(model);
    const m = a.mesh.material as ShaderMaterial;
    expect(m.side).toBe(DoubleSide);
    expect(m.depthTest).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect((a.mesh.geometry as unknown as { instanceCount: number }).instanceCount).toBe(51);
    expect(a.uniforms.uColors.value).toHaveLength(7);
    a.setResolution(1920, 1080, 2);
    expect(a.uniforms.uRes.value.toArray()).toEqual([1920, 1080]);
    expect(a.uniforms.uWidth.value).toBeCloseTo(ARC_WIDTH_PX * 2, 9);
    a.dispose();
  });
});
```

`globe/test/heads.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { HeadSmoother } from "../src/model/head-smoother";
import { HEAD_LIFT, computeHeads, createHeads, headLatLons, type HeadBuffers } from "../src/scene/heads";
import { ARC_BASE_LIFT } from "../src/scene/arcs";
import { altitudeRadius } from "../src/geo3d/vec";
import { REGION_RGB } from "@web/data/palette";
import { FROM, flight, makeDay } from "./helpers";

const model = buildGlobeModel(
  makeDay({
    flights: [
      flight({ id: "a", region: "EUR", dep: FROM + 1000, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [120, 300, 0, 1]], now: { gs: 480, trk: 90 } }),
      flight({ id: "b", region: "AME", dep: FROM + 1000, arr: FROM + 1060, end: "LAST_CONTACT", s: [[0, 200, 10, 10], [60, 200, 10, 11]] }),
    ],
  }),
);
const buffers = (n = 8): HeadBuffers => ({ pos: new Float32Array(n * 3), color: new Float32Array(n * 3), flight: new Float32Array(n), flag: new Float32Array(n) });

describe("computeHeads", () => {
  it("observed heads carry region colour, flight index and no extrapolation flag", () => {
    const out = buffers();
    const r = computeHeads(model, 1060, 0, null, out);
    expect(r).toEqual({ count: 2, extrapolated: 0 });
    expect(Array.from(out.color.slice(0, 3))).toEqual(REGION_RGB[1].map(Math.fround));
    expect(Array.from(out.flight.slice(0, 2))).toEqual([0, 1]);
    const len = Math.hypot(out.pos[0], out.pos[1], out.pos[2]);
    expect(len).toBeCloseTo(altitudeRadius(300) + ARC_BASE_LIFT + HEAD_LIFT, 4);
  });

  it("extrapolated heads are flagged and counted; heads past their end disappear", () => {
    const out = buffers();
    const r = computeHeads(model, 1000 + 180, 0, null, out); // a: 60 s past its last sample; b: ended at 1060
    expect(r).toEqual({ count: 1, extrapolated: 1 });
    expect(out.flag[0]).toBe(1);
  });

  it("respects the capacity", () => {
    expect(computeHeads(model, 1060, 0, null, buffers(1), 1).count).toBe(1);
  });

  it("applies the smoother offsets", () => {
    const s = new HeadSmoother();
    s.onSwap(new Map([["a", [5, 5]]]), new Map([["a", [0, 0.5]]]), 10);
    const out = buffers();
    computeHeads(model, 1060, 10, s, out);
    // flight a at cur=1060 is at lon 0.5; offset pulls it towards (5,5) at t0
    const lat = (Math.asin(out.pos[1] / Math.hypot(out.pos[0], out.pos[1], out.pos[2])) * 180) / Math.PI;
    expect(lat).toBeCloseTo(5, 3);
  });
});

describe("headLatLons", () => {
  it("lists airborne heads by flight id", () => {
    const m = headLatLons(model, 1060);
    expect(m.has("a")).toBe(true);
    expect(m.has("b")).toBe(false); // not airborne
    expect(m.get("a")![1]).toBeCloseTo(0.5, 6);
  });
});

describe("createHeads", () => {
  it("sets the draw range from update()", () => {
    const h = createHeads();
    const r = h.update(model, 1060, 0, -1, null);
    expect(r.count).toBe(2);
    expect(h.points.geometry.drawRange.count).toBe(2);
    expect(h.data.count).toBe(2);
    h.dispose();
  });
});
```

`globe/test/airports.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { airportSize, createAirports } from "../src/scene/airports";
import { buildGlobeModel } from "../src/model/globe-model";
import { FROM, flight, makeDay } from "./helpers";

describe("airportSize", () => {
  it("hub is largest, others grow with traffic", () => {
    expect(airportSize(0, 10, true)).toBe(14);
    expect(airportSize(1, 10, false)).toBeLessThan(airportSize(9, 10, false));
    expect(airportSize(10, 10, false)).toBeLessThanOrEqual(12);
    expect(airportSize(0, 10, false)).toBeCloseTo(4, 9);
    expect(airportSize(5, 0, false)).toBeCloseTo(4, 9); // maxCount guard
  });
});

describe("createAirports", () => {
  const model = buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] }),
        flight({ from: "LHR", to: "IST", s: [[0, 1, 1, 1]] }),
      ],
    }),
  );

  it("marks every airport with traffic plus the hub, at true positions", () => {
    const a = createAirports(model);
    expect(a.codes.sort()).toEqual(["IST", "JFK", "LHR"]);
    const pos = a.points.geometry.getAttribute("position");
    expect(pos.count).toBe(3);
    a.dispose();
  });

  it("pulse records the wall-clock time on the matching airport only", () => {
    const a = createAirports(model);
    a.pulse("JFK", 123);
    const pulse = a.points.geometry.getAttribute("aPulse");
    const i = a.codes.indexOf("JFK");
    expect(pulse.getX(i)).toBe(123);
    expect(pulse.getX(a.codes.indexOf("IST"))).toBe(-1e9);
    a.pulse("XXX", 5); // unknown code is ignored
    a.dispose();
  });

  it("still marks IST on an empty model", () => {
    const empty = buildGlobeModel(makeDay({ flights: [] }));
    const a = createAirports(empty);
    expect(a.codes).toEqual(["IST"]);
    a.dispose();
  });
});
```
(`AIRPORTS` in the helpers contains IST, JFK, LHR, ESB; `buildGlobeModel` counts traffic only for airports present in `day.airports`, so ESB, which no flight uses, is not marked.)

`globe/test/picking3d.test.ts`:
```ts
import { Matrix4, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { buildPickIndex, pickFlight } from "../src/scene/picking3d";
import { FROM, flight, makeDay } from "./helpers";

const model = buildGlobeModel(
  makeDay({
    flights: [
      flight({ id: "front", dep: FROM + 100, s: [[0, 0, 0, 0], [120, 0, 0.5, 0.5]] }), // faces the camera (lon 0)
      flight({ id: "back", dep: FROM + 100, s: [[0, 0, 0, 180], [120, 0, 0, 179]] }), // far side
    ],
  }),
);
const camera = () => {
  const c = new PerspectiveCamera(40, 1, 0.05, 50);
  c.position.set(0, 0, 3.2);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
};

describe("buildPickIndex", () => {
  it("indexes samples with stride and always the last sample", () => {
    const idx = buildPickIndex(model, 3);
    expect(idx.count).toBe(4); // each flight: sample 0 and the last (1)
    expect(Array.from(idx.flight)).toEqual([0, 0, 1, 1]);
  });
});

describe("pickFlight", () => {
  const idx = buildPickIndex(model, 1);
  const cur = 1000;

  it("picks the flight under the cursor", () => {
    expect(pickFlight(idx, null, cur, new Matrix4(), camera(), 800, 800, 400, 400)).toBe(0);
  });

  it("ignores points on the far side of the Earth", () => {
    // 'back' projects to the screen centre too, but is hidden behind the globe
    const camBack = camera();
    expect(pickFlight(idx, null, cur, new Matrix4(), camBack, 800, 800, 400, 400)).toBe(0);
  });

  it("returns -1 away from every point and for points in the future", () => {
    expect(pickFlight(idx, null, cur, new Matrix4(), camera(), 800, 800, 20, 20)).toBe(-1);
    expect(pickFlight(idx, null, 50, new Matrix4(), camera(), 800, 800, 400, 400)).toBe(-1); // before dep
  });

  it("also picks heads", () => {
    const heads = { pos: new Float32Array([0, 0, 1.01]), flight: new Float32Array([1]), count: 1 };
    const none = buildPickIndex(model, 1);
    none.count = 0;
    expect(pickFlight(none, heads, cur, new Matrix4(), camera(), 800, 800, 400, 400)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd globe && npx vitest run test/arcs.test.ts test/heads.test.ts test/airports.test.ts test/picking3d.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `arcs.ts`**

`globe/src/scene/arcs.ts`:
```ts
import {
  AdditiveBlending,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import { REGION_RGB } from "@web/data/palette";
import { plannedArc } from "../geo3d/great";
import { resampleRun } from "../geo3d/resample";
import { R_EARTH_KM, altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";

export const ARC_BASE_LIFT = 0.002;
export const MAX_RUN_POINTS = 96;
export const PLANNED_POINTS = 48;
export const BREAK_SEC = 600;
export const ARC_WIDTH_PX = 1.6;

/** True when the sample pair (i, i+1) is a coverage gap and must not be drawn as observed track. */
export function isBreak(f: GlobeFlight, i: number): boolean {
  if (f.t[i + 1] - f.t[i] > BREAK_SEC) return true;
  return f.gaps.some(([g0, g1]) => Math.abs(f.t[i] - g0) <= 1 && Math.abs(f.t[i + 1] - g1) <= 1);
}

export interface ArcBuffers {
  a: Float32Array;
  b: Float32Array;
  t: Float32Array;
  info: Float32Array;
  s: Float32Array;
  count: number;
}

export function buildArcBuffers(m: GlobeModel): ArcBuffers {
  const a: number[] = [];
  const b: number[] = [];
  const t: number[] = [];
  const info: number[] = [];
  const s: number[] = [];
  let count = 0;
  const push = (pa: number[], pb: number[], tA: number, tB: number, region: number, kind: number, fi: number, sA: number, sB: number) => {
    a.push(pa[0], pa[1], pa[2]);
    b.push(pb[0], pb[1], pb[2]);
    t.push(tA, tB);
    info.push(region, kind, fi, 0);
    s.push(sA, sB);
    count++;
  };

  m.flights.forEach((f, fi) => {
    const n = f.t.length;
    // observed runs, split at coverage gaps
    let i0 = 0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      if (last || isBreak(f, i)) {
        if (i > i0) {
          const pts = resampleRun(f.t, f.alt, f.lat, f.lon, i0, i, MAX_RUN_POINTS);
          for (let k = 0; k + 1 < pts.length; k++) {
            const p = pts[k];
            const q = pts[k + 1];
            push(
              latLonToVec3(p.lat, p.lon, altitudeRadius(p.alt100) + ARC_BASE_LIFT),
              latLonToVec3(q.lat, q.lon, altitudeRadius(q.alt100) + ARC_BASE_LIFT),
              p.t, q.t, f.regionIdx, 0, fi, 0, 0,
            );
          }
        }
        i0 = i + 1;
      }
    }
    // planned route (origin → destination), always available for routed flights
    if (f.planned) {
      const { points, distKm } = plannedArc(
        { lat: f.planned.fromLat, lon: f.planned.fromLon },
        { lat: f.planned.toLat, lon: f.planned.toLon },
        PLANNED_POINTS,
      );
      for (let k = 0; k + 1 < points.length; k++) {
        const p = points[k];
        const q = points[k + 1];
        push(
          latLonToVec3(p.lat, p.lon, p.radius + ARC_BASE_LIFT),
          latLonToVec3(q.lat, q.lon, q.radius + ARC_BASE_LIFT),
          f.dep, f.end, f.regionIdx, 1, fi,
          (p.u * distKm) / R_EARTH_KM, (q.u * distKm) / R_EARTH_KM,
        );
      }
    }
  });

  return {
    a: Float32Array.from(a),
    b: Float32Array.from(b),
    t: Float32Array.from(t),
    info: Float32Array.from(info),
    s: Float32Array.from(s),
    count,
  };
}

const ARC_VERT = /* glsl */ `
uniform float uCur;
uniform float uWindow;
uniform vec2 uRes;
uniform float uWidth;
uniform float uHighlight;
uniform vec3 uColors[7];
attribute vec2 aCorner;
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aT;
attribute vec4 aInfo;
attribute vec2 aS;
varying vec3 vColor;
varying float vAlpha;
varying float vS;
varying float vKind;

void hide() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vColor = vec3(0.0);
  vAlpha = 0.0;
  vS = 0.0;
  vKind = 0.0;
}

void main() {
  float kind = aInfo.y;
  bool hi = abs(aInfo.z - uHighlight) < 0.5;
  vec3 col = uColors[int(aInfo.x + 0.5)];
  vec3 pa = aA;
  vec3 pb = aB;
  float alpha;
  if (kind < 0.5) {
    if (aT.x > uCur) { hide(); return; }
    float k = 1.0;
    if (aT.y > uCur) {
      k = clamp((uCur - aT.x) / max(aT.y - aT.x, 1e-3), 0.0, 1.0);
      pb = mix(aA, aB, k);
    }
    float t = mix(aT.x, mix(aT.x, aT.y, k), aCorner.y);
    float age = clamp((uCur - t) / uWindow, 0.0, 1.0);
    alpha = exp(-age * 2.2) * (hi ? 1.0 : 0.85);
  } else {
    if (aT.x > uCur) { hide(); return; }
    float after = max(uCur - aT.y, 0.0) / uWindow;
    alpha = 0.16 * exp(-after * 8.0) * (hi ? 3.0 : 1.0);
  }
  vec4 cA = projectionMatrix * modelViewMatrix * vec4(pa, 1.0);
  vec4 cB = projectionMatrix * modelViewMatrix * vec4(pb, 1.0);
  vec2 sA = cA.xy / cA.w * uRes;
  vec2 sB = cB.xy / cB.w * uRes;
  vec2 dir = sB - sA;
  dir = length(dir) < 1e-4 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 n = vec2(-dir.y, dir.x);
  float w = uWidth * (hi ? 2.2 : 1.0) * (kind < 0.5 ? 1.0 : 0.7);
  vec4 c = mix(cA, cB, aCorner.y);
  c.xy += n * aCorner.x * w / uRes * c.w;
  gl_Position = c;
  vColor = hi ? mix(col, vec3(1.0), 0.4) : col;
  vAlpha = alpha;
  vS = mix(aS.x, aS.y, aCorner.y);
  vKind = kind;
}
`;

const ARC_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vS;
varying float vKind;
void main() {
  if (vAlpha <= 0.002) discard;
  if (vKind > 0.5 && fract(vS * 90.0) > 0.55) discard;
  gl_FragColor = vec4(vColor * vAlpha, 1.0);
}
`;

export interface ArcUniforms {
  uCur: { value: number };
  uWindow: { value: number };
  uRes: { value: Vector2 };
  uWidth: { value: number };
  uHighlight: { value: number };
  uColors: { value: Vector3[] };
}

export interface Arcs {
  mesh: Mesh;
  uniforms: ArcUniforms;
  setResolution(w: number, h: number, pixelRatio: number): void;
  dispose(): void;
}

export function createArcs(m: GlobeModel): Arcs {
  const buf = buildArcBuffers(m);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute("aCorner", new Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2));
  geometry.setAttribute("aA", new InstancedBufferAttribute(buf.a, 3));
  geometry.setAttribute("aB", new InstancedBufferAttribute(buf.b, 3));
  geometry.setAttribute("aT", new InstancedBufferAttribute(buf.t, 2));
  geometry.setAttribute("aInfo", new InstancedBufferAttribute(buf.info, 4));
  geometry.setAttribute("aS", new InstancedBufferAttribute(buf.s, 2));
  geometry.instanceCount = buf.count;

  const uniforms: ArcUniforms = {
    uCur: { value: 0 },
    uWindow: { value: 86400 },
    uRes: { value: new Vector2(1, 1) },
    uWidth: { value: ARC_WIDTH_PX },
    uHighlight: { value: -1 },
    uColors: { value: REGION_RGB.map(([r, g, b]) => new Vector3(r, g, b)) },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: ARC_VERT,
    fragmentShader: ARC_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    setResolution(w, h, pixelRatio) {
      uniforms.uRes.value.set(w, h);
      uniforms.uWidth.value = ARC_WIDTH_PX * pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 4: Implement `heads.ts`**

`globe/src/scene/heads.ts`:
```ts
import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from "three";
import { REGION_RGB } from "@web/data/palette";
import { altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import { headState } from "../model/dead-reckon";
import type { GlobeModel } from "../model/globe-model";
import type { HeadSmoother } from "../model/head-smoother";
import { ARC_BASE_LIFT } from "./arcs";

export const HEAD_SIZE_PX = 8;
export const MAX_HEADS = 4096;
export const HEAD_LIFT = 0.004;

export interface HeadBuffers {
  pos: Float32Array;
  color: Float32Array;
  flight: Float32Array;
  flag: Float32Array;
}

/** Writes one head per flight that has one at relative time `cur`. Returns the counts. */
export function computeHeads(
  m: GlobeModel,
  cur: number,
  nowSec: number,
  smoother: HeadSmoother | null,
  out: HeadBuffers,
  max = MAX_HEADS,
): { count: number; extrapolated: number } {
  let n = 0;
  let extrapolated = 0;
  for (let fi = 0; fi < m.flights.length && n < max; fi++) {
    const f = m.flights[fi];
    const h = headState(f, cur);
    if (!h) continue;
    let lat = h.lat;
    let lon = h.lon;
    if (smoother) [lat, lon] = smoother.apply(f.id, lat, lon, nowSec);
    const p = latLonToVec3(lat, lon, altitudeRadius(h.alt100) + ARC_BASE_LIFT + HEAD_LIFT);
    out.pos[n * 3] = p[0];
    out.pos[n * 3 + 1] = p[1];
    out.pos[n * 3 + 2] = p[2];
    const [r, g, b] = REGION_RGB[f.regionIdx];
    out.color[n * 3] = r;
    out.color[n * 3 + 1] = g;
    out.color[n * 3 + 2] = b;
    out.flight[n] = fi;
    out.flag[n] = h.extrapolated ? 1 : 0;
    if (h.extrapolated) extrapolated++;
    n++;
  }
  return { count: n, extrapolated };
}

/** Current head positions of airborne flights by flight id (used to ease jumps when new data arrives). */
export function headLatLons(m: GlobeModel, cur: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const f of m.flights) {
    if (f.status !== "AIRBORNE") continue;
    const h = headState(f, cur);
    if (h) out.set(f.id, [h.lat, h.lon]);
  }
  return out;
}

const HEAD_VERT = /* glsl */ `
uniform float uSize;
uniform float uTime;
uniform float uHighlight;
attribute vec3 aColor;
attribute float aFlight;
attribute float aFlag;
varying vec3 vColor;
varying float vFlag;
varying float vHi;
void main() {
  vColor = aColor;
  vFlag = aFlag;
  vHi = abs(aFlight - uHighlight) < 0.5 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float pulse = 1.0 + 0.2 * sin(uTime * 3.0 + aFlight * 1.7);
  gl_PointSize = uSize * pulse * (vHi > 0.5 ? 2.0 : 1.0);
}
`;

const HEAD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vFlag;
varying float vHi;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float solid = 1.0 - smoothstep(0.0, 0.5, d);
  float ring = smoothstep(0.18, 0.30, d) * (1.0 - smoothstep(0.40, 0.50, d));
  float a = vFlag > 0.5 ? ring : solid;
  vec3 col = mix(vColor, vec3(1.0), 0.35 + 0.4 * vHi);
  gl_FragColor = vec4(col * a * 1.5, 1.0);
}
`;

export interface Heads {
  points: Points;
  data: HeadBuffers & { count: number };
  update(m: GlobeModel, cur: number, nowSec: number, highlight: number, smoother: HeadSmoother | null): { count: number; extrapolated: number };
  setPixelRatio(pr: number): void;
  dispose(): void;
}

export function createHeads(): Heads {
  const data = {
    pos: new Float32Array(MAX_HEADS * 3),
    color: new Float32Array(MAX_HEADS * 3),
    flight: new Float32Array(MAX_HEADS),
    flag: new Float32Array(MAX_HEADS),
    count: 0,
  };
  const geometry = new BufferGeometry();
  const attrs = {
    position: new BufferAttribute(data.pos, 3).setUsage(DynamicDrawUsage),
    aColor: new BufferAttribute(data.color, 3).setUsage(DynamicDrawUsage),
    aFlight: new BufferAttribute(data.flight, 1).setUsage(DynamicDrawUsage),
    aFlag: new BufferAttribute(data.flag, 1).setUsage(DynamicDrawUsage),
  };
  for (const [k, v] of Object.entries(attrs)) geometry.setAttribute(k, v);
  geometry.setDrawRange(0, 0);
  const uniforms = { uSize: { value: HEAD_SIZE_PX }, uTime: { value: 0 }, uHighlight: { value: -1 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: HEAD_VERT,
    fragmentShader: HEAD_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    data,
    update(m, cur, nowSec, highlight, smoother) {
      const r = computeHeads(m, cur, nowSec, smoother, data);
      data.count = r.count;
      geometry.setDrawRange(0, r.count);
      for (const a of Object.values(attrs)) a.needsUpdate = true;
      uniforms.uTime.value = nowSec % (2 * Math.PI);
      uniforms.uHighlight.value = highlight;
      return r;
    },
    setPixelRatio(pr) {
      uniforms.uSize.value = HEAD_SIZE_PX * pr;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 5: Implement `airports.ts`**

`globe/src/scene/airports.ts`:
```ts
import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from "three";
import { latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";

const HUB = "IST";

export function airportSize(count: number, maxCount: number, isHub: boolean): number {
  if (isHub) return 14;
  const k = maxCount > 0 ? Math.sqrt(Math.min(count, maxCount) / maxCount) : 0;
  return 4 + 8 * k;
}

const VERT = /* glsl */ `
uniform float uPixelRatio;
attribute float aSize;
attribute vec3 aColor;
attribute float aPulse;
varying vec3 vColor;
varying float vPulse;
uniform float uNow;
void main() {
  vColor = aColor;
  vPulse = aPulse > -1e8 ? exp(-(uNow - aPulse) * 0.9) : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (1.0 + 2.2 * vPulse);
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vPulse;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float dot_ = 1.0 - smoothstep(0.0, 0.22, d);
  float ring = smoothstep(0.30, 0.38, d) * (1.0 - smoothstep(0.44, 0.50, d)) * vPulse;
  float a = dot_ * 0.9 + ring;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

export interface Airports {
  points: Points;
  codes: string[];
  pulse(iata: string, nowSec: number): void;
  setNow(nowSec: number): void;
  setPixelRatio(pr: number): void;
  dispose(): void;
}

export function createAirports(m: GlobeModel): Airports {
  const codes = new Set<string>([HUB]);
  for (const code of m.traffic.keys()) codes.add(code);
  const list = [...codes].filter((c) => m.airports[c] || c === HUB);
  // the hub must exist even when the day file has no airports table (older files)
  const fallbackHub = { lat: 41.2613, lon: 28.742 };
  let maxCount = 0;
  for (const [code, n] of m.traffic) if (code !== HUB) maxCount = Math.max(maxCount, n);

  const pos = new Float32Array(list.length * 3);
  const size = new Float32Array(list.length);
  const color = new Float32Array(list.length * 3);
  const pulse = new Float32Array(list.length).fill(-1e9);
  list.forEach((code, i) => {
    const a = m.airports[code] ?? fallbackHub;
    const p = latLonToVec3(a.lat, a.lon, 1.003);
    pos.set(p, i * 3);
    size[i] = airportSize(m.traffic.get(code) ?? 0, maxCount, code === HUB);
    if (code === HUB) color.set([0.89, 0.04, 0.09], i * 3);
    else color.set([0.82, 0.9, 1.0], i * 3);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("aSize", new BufferAttribute(size, 1));
  geometry.setAttribute("aColor", new BufferAttribute(color, 3));
  const pulseAttr = new BufferAttribute(pulse, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute("aPulse", pulseAttr);
  const uniforms = { uPixelRatio: { value: 1 }, uNow: { value: 0 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    codes: list,
    pulse(iata, nowSec) {
      const i = list.indexOf(iata);
      if (i < 0) return;
      pulse[i] = nowSec;
      pulseAttr.needsUpdate = true;
    },
    setNow(nowSec) {
      uniforms.uNow.value = nowSec;
    },
    setPixelRatio(pr) {
      uniforms.uPixelRatio.value = pr;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 6: Implement `picking3d.ts`**

`globe/src/scene/picking3d.ts`:
```ts
import { Vector3, type Matrix4, type PerspectiveCamera } from "three";
import { altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { ARC_BASE_LIFT } from "./arcs";

export const PICK_RADIUS_PX = 12;

export interface PickIndex {
  xyz: Float32Array;
  t: Float32Array;
  flight: Int32Array;
  count: number;
}

/** Earth-fixed positions of every `stride`-th observed sample (and the last one) with its time. */
export function buildPickIndex(m: GlobeModel, stride = 3): PickIndex {
  let cap = 0;
  for (const f of m.flights) cap += Math.ceil(f.t.length / stride) + 1;
  const xyz = new Float32Array(cap * 3);
  const t = new Float32Array(cap);
  const flight = new Int32Array(cap);
  let n = 0;
  m.flights.forEach((f, fi) => {
    const len = f.t.length;
    for (let i = 0; i < len; i += stride) {
      const p = latLonToVec3(f.lat[i], f.lon[i], altitudeRadius(f.alt[i]) + ARC_BASE_LIFT);
      xyz.set(p, n * 3);
      t[n] = f.t[i];
      flight[n++] = fi;
    }
    if ((len - 1) % stride !== 0) {
      const i = len - 1;
      const p = latLonToVec3(f.lat[i], f.lon[i], altitudeRadius(f.alt[i]) + ARC_BASE_LIFT);
      xyz.set(p, n * 3);
      t[n] = f.t[i];
      flight[n++] = fi;
    }
  });
  return { xyz, t, flight, count: n };
}

const v = new Vector3();
const cam = new Vector3();

/**
 * Nearest flight (observed point or head) within `maxPx` of the cursor, ignoring points hidden behind the
 * Earth (a point is visible when dot(p, cameraPosition) > 1 for a unit sphere) and samples in the future.
 */
export function pickFlight(
  idx: PickIndex,
  heads: { pos: Float32Array; flight: Float32Array; count: number } | null,
  cur: number,
  world: Matrix4,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  x: number,
  y: number,
  maxPx = PICK_RADIUS_PX,
): number {
  cam.copy(camera.position);
  let best = -1;
  let bestD = maxPx * maxPx;
  const test = (px: number, py: number, pz: number, flight: number) => {
    v.set(px, py, pz).applyMatrix4(world);
    if (v.dot(cam) < 1.0) return;
    v.project(camera);
    if (v.z < -1 || v.z > 1) return;
    const sx = ((v.x + 1) / 2) * width;
    const sy = ((1 - v.y) / 2) * height;
    const d = (sx - x) ** 2 + (sy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = flight;
    }
  };
  for (let i = 0; i < idx.count; i++) {
    if (idx.t[i] > cur) continue;
    test(idx.xyz[i * 3], idx.xyz[i * 3 + 1], idx.xyz[i * 3 + 2], idx.flight[i]);
  }
  if (heads) {
    for (let i = 0; i < heads.count; i++) test(heads.pos[i * 3], heads.pos[i * 3 + 1], heads.pos[i * 3 + 2], heads.flight[i]);
  }
  return best;
}
```

- [ ] **Step 7: Run all tests, typecheck, build**

Run: `cd globe && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, build succeeds. Hand-check any failing expectation against the formulas before changing it: planned segments = `PLANNED_POINTS − 1 = 47`; flight "a" has 3 observed segments (run 1: 3 samples → 2 segments, run 2: 2 samples → 1); `altitudeRadius(100) = 1.014353`.

- [ ] **Step 8: Commit**

```bash
git add globe/src/scene/arcs.ts globe/src/scene/heads.ts globe/src/scene/airports.ts globe/src/scene/picking3d.ts globe/test
git commit -m "feat(globe): planned and observed arcs, heads, airport markers and 3D picking"
```

---

### Task 11: Camera rig, engine, controller and the live canvas

**Files:**
- Create: `globe/src/camera/globe-rig.ts`, `globe/src/app/keys.ts`, `globe/src/app/hud-model.ts`, `globe/src/scene/engine.ts`, `globe/src/app/controller.ts`
- Modify: `globe/src/App.tsx` (replace the placeholder)
- Test: `globe/test/globe-rig.test.ts`, `globe/test/keys.test.ts`, `globe/test/hud-model.test.ts`, `globe/test/controller.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–10; from `@web`: `advance`, `TUNNEL_PERIOD` (`render/clocks`), `LEVELS`, `initQuality`, `updateQuality` (`render/quality`), `ScreenPoint` (`render/picking`), `applyAction`, `initCycle`, `stepCycle`, `Bounds`, `CycleConfig`, `CycleState` (`cycle/machine`), `createPoller`, `dataUrl`, `isFixture` (`data/source`), `buildTimeline`, `Timeline` (`data/timeline`), `buildSnapshot`, `EMPTY_SNAPSHOT`, `HudSnapshot` (`hud/snapshot`), `Store`, `createStore` (`hud/store`).
- Produces:
  - `globe-rig.ts`: `RIG_DISTANCE = 3.2`, `PITCH_LIMIT = 1.2`, `IDLE_YAW_RATE` (0.6° in rad/s), `DAMPING_PER_SEC = 0.95 ** 60`, `INITIAL_PITCH = 0.35`, `interface RigState { yaw: number; pitch: number; yawVel: number; pitchVel: number; dragging: boolean }`, `initialYaw(gmstRad: number, lonDeg: number): number`, `initRig(yaw: number): RigState`, `dragRig(s: RigState, dYaw: number, dPitch: number, dt: number): RigState`, `releaseRig(s: RigState): RigState`, `stepRig(s: RigState, dt: number, idleRate: number): RigState`, `rigPosition(s: RigState, dist?: number): [number, number, number]`.
  - `keys.ts`: `type GlobeCommand = "togglePause" | "scrubBack" | "scrubForward" | "toggleReplay" | "toggleHud" | "fullscreen"`, `SCRUB_SEC = 3600`, `keyToCommand(key: string): GlobeCommand | null`.
  - `hud-model.ts`: `interface EventLine { id: string; kind: EventKind; text: string; at: number }`, `interface AirportLabel { iata: string; x: number; y: number; visible: boolean }`, `interface GlobeHudSnapshot extends HudSnapshot { mode: "LIVE" | "REPLAY"; events: EventLine[]; labels: AirportLabel[]; extrapolated: number; textureProgress: number; textureNote: string; credit: string }`, `EMPTY_GLOBE_SNAPSHOT`, `CREDIT`, `MAX_EVENTS = 6`, `LABEL_COUNT = 12`, `LIVE_OVERRUN_SEC = 360`, `eventText(e: FlightEvent): string`, `addEvents(prev: EventLine[], evs: FlightEvent[]): EventLine[]`, `pickLabelAirports(m: GlobeModel, n: number): string[]`, `liveCur(m: GlobeModel, nowSec: number): number`.
  - `engine.ts`: `interface GlobeFrameInput { absTime: number; cur: number; highlight: number; nowSec: number }`, `interface GlobeEngineOptions { reducedMotion: boolean; onPerf?: (fps: number, level: number) => void; onError?: (msg: string) => void }`, `interface GlobeEngine { setModel(m: GlobeModel | null, cur: number, nowSec: number): void; loadTextures(onProgress: (p: number) => void): Promise<"8k" | "4k" | null>; setFrameSource(fn: ((dt: number) => GlobeFrameInput) | null): void; pick(x: number, y: number, cur: number): number; screenOf(lat: number, lon: number, alt100?: number): ScreenPoint; dragBy(dxPx: number, dyPx: number, dtSec: number): void; endDrag(): void; pulseAirport(iata: string, nowSec: number): void; headsInfo(): { count: number; extrapolated: number }; dispose(): void }`, `createGlobeEngine(canvas: HTMLCanvasElement, opts: GlobeEngineOptions): GlobeEngine`, `hasWebGL2(): boolean`.
  - `controller.ts`: `GLOBE_CYCLE: CycleConfig = { replaySec: 180, liveSec: Number.POSITIVE_INFINITY, holdSec: 20 }`, `HUD_TICK_SEC = 0.25`, `PICK_INTERVAL_MS = 100`, `FIXTURE_LIVE_LOOP_SEC = 240`, `interface GlobeControllerDeps { engine: GlobeEngine; store: Store<GlobeHudSnapshot>; url: string; fixture: boolean; debug: boolean; reducedMotion: boolean; nowMs: () => number; fetch?: typeof fetch; visible?: () => boolean }`, `interface GlobeController { onKey(key: string): void; onPointerMove(x: number, y: number): void; onPointerLeave(): void; onInteract(): void; refresh(): void; setPerf(fps: number, level: number): void; setTextureState(progress: number, note: string): void; dispose(): void }`, `createController(d: GlobeControllerDeps): GlobeController`.

Behaviour (Global Constraints): opens in **LIVE**; `R` toggles REPLAY (180 s, then back to LIVE); `←`/`→` scrub ∓1 h (from LIVE they start a REPLAY near "now"); `Space` pauses (LIVE freezes `cur`); in **fixture mode** LIVE loops `span + (wall seconds mod 240)` so heads visibly extrapolate (the fixture is a stale snapshot, never "delayed"); events are diffed on every data swap, the airport pulses; hover picks at ≤ 10 Hz with a trailing pick; `onPointerLeave` clears hover.

- [ ] **Step 1: Write the failing tests**

`globe/test/globe-rig.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  DAMPING_PER_SEC, IDLE_YAW_RATE, INITIAL_PITCH, PITCH_LIMIT, RIG_DISTANCE,
  dragRig, initRig, initialYaw, releaseRig, rigPosition, stepRig,
} from "../src/camera/globe-rig";

describe("globe rig", () => {
  it("constants", () => {
    expect(RIG_DISTANCE).toBe(3.2);
    expect(PITCH_LIMIT).toBe(1.2);
    expect(IDLE_YAW_RATE).toBeCloseTo((0.6 * Math.PI) / 180, 12);
    expect(DAMPING_PER_SEC).toBeCloseTo(0.95 ** 60, 12);
  });

  it("initialYaw faces the given longitude at the given sidereal angle", () => {
    expect(initialYaw(1, 30)).toBeCloseTo(1 + (30 * Math.PI) / 180, 12);
    expect(initRig(2)).toEqual({ yaw: 2, pitch: INITIAL_PITCH, yawVel: 0, pitchVel: 0, dragging: false });
  });

  it("idle drift advances yaw at the idle rate", () => {
    const s = stepRig(initRig(0), 2, IDLE_YAW_RATE);
    expect(s.yaw).toBeCloseTo(2 * IDLE_YAW_RATE, 12);
    expect(stepRig(initRig(0), 2, 0).yaw).toBe(0);
  });

  it("drag inertia decays exponentially after release", () => {
    let s = dragRig(initRig(0), 0.1, 0, 0.1); // 1 rad/s
    expect(s.dragging).toBe(true);
    expect(s.yawVel).toBeCloseTo(1, 9);
    s = releaseRig(s);
    expect(s.dragging).toBe(false);
    const after = stepRig(s, 1, 0);
    expect(after.yaw).toBeCloseTo(0.1 + 1, 9);
    expect(after.yawVel).toBeCloseTo(DAMPING_PER_SEC, 9);
    let t = after;
    for (let i = 0; i < 10; i++) t = stepRig(t, 1, 0);
    expect(Math.abs(t.yawVel)).toBeLessThan(1e-6);
  });

  it("stepRig does nothing while dragging", () => {
    const s = dragRig(initRig(0), 0.1, 0, 0.1);
    expect(stepRig(s, 1, IDLE_YAW_RATE)).toBe(s);
  });

  it("pitch is clamped by drag and by inertia", () => {
    const s = dragRig(initRig(0), 0, 5, 0.1);
    expect(s.pitch).toBe(PITCH_LIMIT);
    const r = stepRig({ yaw: 0, pitch: 1.19, yawVel: 0, pitchVel: 1, dragging: false }, 1, 0);
    expect(r.pitch).toBe(PITCH_LIMIT);
    expect(r.pitchVel).toBe(0);
  });

  it("rigPosition", () => {
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    close(rigPosition({ ...initRig(0), pitch: 0 }), [0, 0, 3.2]);
    close(rigPosition({ ...initRig(Math.PI / 2), pitch: 0 }), [3.2, 0, 0]);
    const p = rigPosition({ ...initRig(0.7), pitch: 0.7 }, 5);
    expect(Math.hypot(...p)).toBeCloseTo(5, 9);
  });
});
```

`globe/test/keys.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SCRUB_SEC, keyToCommand } from "../src/app/keys";

describe("keyToCommand", () => {
  it("maps the installation keys", () => {
    expect(SCRUB_SEC).toBe(3600);
    expect(keyToCommand(" ")).toBe("togglePause");
    expect(keyToCommand("ArrowLeft")).toBe("scrubBack");
    expect(keyToCommand("ArrowRight")).toBe("scrubForward");
    expect(keyToCommand("r")).toBe("toggleReplay");
    expect(keyToCommand("R")).toBe("toggleReplay");
    expect(keyToCommand("h")).toBe("toggleHud");
    expect(keyToCommand("F")).toBe("fullscreen");
    expect(keyToCommand("g")).toBeNull(); // the globe toggle belongs to Plan 4
    expect(keyToCommand("x")).toBeNull();
  });
});
```

`globe/test/hud-model.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MAX_EVENTS, addEvents, eventText, liveCur, pickLabelAirports } from "../src/app/hud-model";
import type { FlightEvent } from "../src/model/events";
import { buildGlobeModel } from "../src/model/globe-model";
import { FROM, flight, makeDay } from "./helpers";

const ev = (kind: FlightEvent["kind"], o: Partial<FlightEvent> = {}): FlightEvent => ({
  id: `x:${kind}`, kind, tk: "TK1", from: "IST", to: "JFK", airport: "IST", at: 100, ...o,
});

describe("eventText", () => {
  it("formats the three kinds", () => {
    expect(eventText(ev("DEPARTED"))).toBe("TK1 DEPARTED IST → JFK");
    expect(eventText(ev("LANDED"))).toBe("TK1 LANDED JFK");
    expect(eventText(ev("LAST_CONTACT"))).toBe("TK1 LAST CONTACT");
    expect(eventText(ev("DEPARTED", { from: undefined, to: undefined }))).toBe("TK1 DEPARTED ??? → ???");
    expect(eventText(ev("LANDED", { to: undefined }))).toBe("TK1 LANDED ???");
  });
});

describe("addEvents", () => {
  it("appends, de-duplicates by id and keeps the newest MAX_EVENTS", () => {
    expect(MAX_EVENTS).toBe(6);
    let lines = addEvents([], [ev("DEPARTED", { id: "a", at: 1 })]);
    lines = addEvents(lines, [ev("DEPARTED", { id: "a", at: 1 }), ev("LANDED", { id: "b", at: 2 })]);
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
    for (let i = 0; i < 10; i++) lines = addEvents(lines, [ev("LANDED", { id: `n${i}`, at: 10 + i })]);
    expect(lines).toHaveLength(6);
    expect(lines[5].id).toBe("n9");
    expect(lines[0].id).toBe("n4");
    expect(lines[5].text).toBe("TK1 LANDED JFK");
  });
});

describe("pickLabelAirports", () => {
  const m = buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] }),
        flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] }),
        flight({ from: "IST", to: "LHR", s: [[0, 1, 1, 1]] }),
      ],
    }),
  );
  it("IST first, then busiest airports, limited to n", () => {
    expect(pickLabelAirports(m, 3)).toEqual(["IST", "JFK", "LHR"]);
    expect(pickLabelAirports(m, 2)).toEqual(["IST", "JFK"]);
    expect(pickLabelAirports(m, 1)).toEqual(["IST"]);
  });
  it("still returns IST for a model without traffic", () => {
    expect(pickLabelAirports(buildGlobeModel(makeDay({ flights: [] })), 5)).toEqual(["IST"]);
  });
});

describe("liveCur", () => {
  const m = buildGlobeModel(makeDay({ flights: [flight({ s: [[0, 1, 1, 1]] })] })); // from = FROM, span = 86400
  it("follows the wall clock and is capped at span + 360", () => {
    expect(liveCur(m, FROM + 86400 + 30)).toBe(86430);
    expect(liveCur(m, FROM + 86400 + 99999)).toBe(86400 + 360);
    expect(liveCur(m, FROM - 50)).toBe(0);
  });
});
```

`globe/test/controller.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { EMPTY_GLOBE_SNAPSHOT, type GlobeHudSnapshot } from "../src/app/hud-model";
import { GLOBE_CYCLE, createController } from "../src/app/controller";
import { createStore } from "@web/hud/store";
import type { GlobeEngine, GlobeFrameInput } from "../src/scene/engine";
import { FROM, flight, makeDay } from "./helpers";

const flush = () => new Promise((r) => setTimeout(r, 0));
const G1 = FROM + 86400;
const G2 = G1 + 120;

const dayAt = (generatedAt: number, flights: ReturnType<typeof flight>[]) =>
  makeDay({ generatedAt, window: { from: generatedAt - 86400, to: generatedAt }, collectingSince: generatedAt - 86400, flights });

const airborne = (end: "AIRBORNE" | "LANDED", arr: number | null) =>
  flight({
    id: "a", tk: "TK-a", from: "IST", to: "JFK", region: "AME", dep: G1 - 3000, arr, end,
    s: [[0, 300, 41, 29], [600, 370, 45, 20], [2900, 370, 55, -20]],
    now: { gs: 480, trk: 300 },
  });

function setup(opts: { fixture?: boolean; days?: ReturnType<typeof makeDay>[]; now?: { ms: number } } = {}) {
  let frameFn: ((dt: number) => GlobeFrameInput) | null = null;
  const engine: GlobeEngine = {
    setModel: vi.fn(),
    loadTextures: vi.fn(async () => null),
    setFrameSource: (fn) => {
      frameFn = fn;
    },
    pick: vi.fn(() => 0),
    screenOf: () => ({ x: 100, y: 200, visible: true }),
    dragBy: vi.fn(),
    endDrag: vi.fn(),
    pulseAirport: vi.fn(),
    headsInfo: () => ({ count: 1, extrapolated: 3 }),
    dispose: vi.fn(),
  };
  const store = createStore<GlobeHudSnapshot>(EMPTY_GLOBE_SNAPSHOT);
  const days = opts.days ?? [dayAt(G1, [airborne("AIRBORNE", null)])];
  const clock = opts.now ?? { ms: (G1 + 30) * 1000 };
  let call = 0;
  const c = createController({
    engine,
    store,
    url: "u",
    fixture: opts.fixture ?? false,
    debug: false,
    reducedMotion: false,
    nowMs: () => clock.ms,
    fetch: (async () => new Response(JSON.stringify(days[Math.min(call++, days.length - 1)]))) as unknown as typeof fetch,
  });
  return { c, engine, store, clock, frame: (dt: number) => frameFn!(dt) };
}

describe("globe controller", () => {
  it("opens in LIVE with the model loaded and no events", async () => {
    const h = setup();
    await flush();
    expect(h.engine.setModel).toHaveBeenCalledTimes(1);
    h.frame(0.3);
    const s = h.store.get();
    expect(s.ready).toBe(true);
    expect(s.mode).toBe("LIVE");
    expect(s.events).toEqual([]);
    expect(s.extrapolated).toBe(3);
    h.c.dispose();
  });

  it("LIVE time follows the wall clock; absTime = window.from + cur", async () => {
    const h = setup();
    await flush();
    const f = h.frame(0.016);
    expect(f.cur).toBe(86430);
    expect(f.absTime).toBe(G1 - 86400 + 86430);
    expect(f.nowSec).toBe(G1 + 30);
    h.clock.ms += 10_000;
    expect(h.frame(0.016).cur).toBe(86440);
    h.c.dispose();
  });

  it("a data swap that lands a flight produces an event and pulses the airport", async () => {
    const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null)]), dayAt(G2, [airborne("LANDED", G2 - 60)])] });
    await flush();
    h.c.refresh();
    await flush();
    h.frame(0.3);
    expect(h.store.get().events.map((e) => e.text)).toEqual(["TK-a LANDED JFK"]);
    expect(h.engine.pulseAirport).toHaveBeenCalledWith("JFK", expect.any(Number));
    expect(h.engine.setModel).toHaveBeenCalledTimes(2);
    h.c.dispose();
  });

  it("R switches to a 3-minute REPLAY and back to LIVE when it ends", async () => {
    const h = setup();
    await flush();
    h.c.onKey("r");
    h.frame(0.5);
    expect(h.store.get().mode).toBe("REPLAY");
    expect(GLOBE_CYCLE.replaySec).toBe(180);
    const first = h.frame(0.5).cur;
    const later = h.frame(10).cur;
    expect(later).toBeGreaterThan(first);
    for (let i = 0; i < 400; i++) h.frame(0.5); // 200 s > 180 s
    h.frame(0.3);
    expect(h.store.get().mode).toBe("LIVE");
    h.c.dispose();
  });

  it("Space freezes LIVE time and resumes on the second press", async () => {
    const h = setup();
    await flush();
    const before = h.frame(0.016).cur;
    h.c.onKey(" ");
    h.clock.ms += 5000;
    const frozen1 = h.frame(0.016).cur;
    h.clock.ms += 5000;
    const frozen2 = h.frame(0.016).cur;
    expect(frozen1).toBe(frozen2);
    expect(frozen1).toBeGreaterThanOrEqual(before);
    h.c.onKey(" ");
    h.clock.ms += 5000;
    expect(h.frame(0.016).cur).toBeGreaterThan(frozen2);
    h.c.dispose();
  });

  it("H hides the HUD", async () => {
    const h = setup();
    await flush();
    h.c.onKey("h");
    h.frame(0.3);
    expect(h.store.get().hidden).toBe(true);
    h.c.dispose();
  });

  it("fixture mode loops LIVE time inside [span, span + 240)", async () => {
    const h = setup({ fixture: true });
    await flush();
    for (const dt of [0, 100_000, 237_000, 241_000]) {
      h.clock.ms += dt;
      const cur = h.frame(0.016).cur;
      expect(cur).toBeGreaterThanOrEqual(86400);
      expect(cur).toBeLessThan(86400 + 240);
    }
    h.c.dispose();
  });

  it("hover: synchronous first pick, trailing pick, pointer leave clears it", async () => {
    const h = setup();
    await flush();
    h.c.onPointerMove(10, 20);
    expect(h.engine.pick).toHaveBeenCalledTimes(1);
    h.c.onPointerMove(11, 21); // inside the 100 ms window → deferred
    expect(h.engine.pick).toHaveBeenCalledTimes(1);
    h.clock.ms += 150;
    h.frame(0.016);
    expect(h.engine.pick).toHaveBeenCalledTimes(2);
    expect(h.engine.pick).toHaveBeenLastCalledWith(11, 21, expect.any(Number));
    expect(h.frame(0.016).highlight).toBe(0);
    h.c.onPointerLeave();
    expect(h.frame(0.016).highlight).toBe(-1);
    h.c.dispose();
  });

  it("labels: IST is projected for the HUD", async () => {
    const h = setup();
    await flush();
    h.frame(0.3);
    const labels = h.store.get().labels;
    expect(labels.some((l) => l.iata === "IST" && l.visible)).toBe(true);
    h.c.dispose();
  });

  it("dispose detaches from the engine", async () => {
    const h = setup();
    await flush();
    h.c.dispose();
    expect(() => h.frame(0.016)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd globe && npx vitest run test/globe-rig.test.ts test/keys.test.ts test/hud-model.test.ts test/controller.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: `globe-rig.ts`**

`globe/src/camera/globe-rig.ts`:
```ts
const DEG = Math.PI / 180;

export const RIG_DISTANCE = 3.2;
export const PITCH_LIMIT = 1.2;
export const IDLE_YAW_RATE = 0.6 * DEG; // rad/s
export const DAMPING_PER_SEC = Math.pow(0.95, 60); // 0.95 per frame at 60 fps
export const INITIAL_PITCH = 0.35;

export interface RigState {
  yaw: number;
  pitch: number;
  yawVel: number;
  pitchVel: number;
  dragging: boolean;
}

const clampPitch = (p: number) => Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, p));

/** Camera yaw (inertial frame) that faces longitude `lonDeg` when the Earth's sidereal angle is `gmstRad`. */
export const initialYaw = (gmstRad: number, lonDeg: number) => gmstRad + lonDeg * DEG;

export const initRig = (yaw: number): RigState => ({ yaw, pitch: INITIAL_PITCH, yawVel: 0, pitchVel: 0, dragging: false });

export function dragRig(s: RigState, dYaw: number, dPitch: number, dt: number): RigState {
  const pitch = clampPitch(s.pitch + dPitch);
  return {
    yaw: s.yaw + dYaw,
    pitch,
    yawVel: dt > 0 ? dYaw / dt : 0,
    pitchVel: dt > 0 ? (pitch - s.pitch) / dt : 0,
    dragging: true,
  };
}

export const releaseRig = (s: RigState): RigState => ({ ...s, dragging: false });

export function stepRig(s: RigState, dt: number, idleRate: number): RigState {
  if (s.dragging) return s;
  const decay = Math.pow(DAMPING_PER_SEC, dt);
  const pitch = s.pitch + s.pitchVel * dt;
  const clamped = clampPitch(pitch);
  return {
    yaw: s.yaw + (s.yawVel + idleRate) * dt,
    pitch: clamped,
    yawVel: s.yawVel * decay,
    pitchVel: clamped !== pitch ? 0 : s.pitchVel * decay,
    dragging: false,
  };
}

export function rigPosition(s: RigState, dist = RIG_DISTANCE): [number, number, number] {
  return [dist * Math.cos(s.pitch) * Math.sin(s.yaw), dist * Math.sin(s.pitch), dist * Math.cos(s.pitch) * Math.cos(s.yaw)];
}
```

- [ ] **Step 4: `keys.ts` and `hud-model.ts`**

`globe/src/app/keys.ts`:
```ts
export type GlobeCommand = "togglePause" | "scrubBack" | "scrubForward" | "toggleReplay" | "toggleHud" | "fullscreen";

export const SCRUB_SEC = 3600;

export function keyToCommand(key: string): GlobeCommand | null {
  switch (key) {
    case " ":
    case "Spacebar":
      return "togglePause";
    case "ArrowLeft":
      return "scrubBack";
    case "ArrowRight":
      return "scrubForward";
    case "r":
    case "R":
      return "toggleReplay";
    case "h":
    case "H":
      return "toggleHud";
    case "f":
    case "F":
      return "fullscreen";
    default:
      return null;
  }
}
```

`globe/src/app/hud-model.ts`:
```ts
import { EMPTY_SNAPSHOT, type HudSnapshot } from "@web/hud/snapshot";
import type { EventKind, FlightEvent } from "../model/events";
import type { GlobeModel } from "../model/globe-model";

export const CREDIT = "EARTH IMAGERY: NASA EARTH OBSERVATORY (BLUE MARBLE · BLACK MARBLE)";
export const MAX_EVENTS = 6;
export const LABEL_COUNT = 12;
export const LIVE_OVERRUN_SEC = 360;

export interface EventLine {
  id: string;
  kind: EventKind;
  text: string;
  at: number;
}

export interface AirportLabel {
  iata: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface GlobeHudSnapshot extends HudSnapshot {
  mode: "LIVE" | "REPLAY";
  events: EventLine[];
  labels: AirportLabel[];
  extrapolated: number;
  textureProgress: number;
  textureNote: string;
  credit: string;
}

export const EMPTY_GLOBE_SNAPSHOT: GlobeHudSnapshot = {
  ...EMPTY_SNAPSHOT,
  mode: "LIVE",
  events: [],
  labels: [],
  extrapolated: 0,
  textureProgress: 0,
  textureNote: "",
  credit: CREDIT,
};

export function eventText(e: FlightEvent): string {
  switch (e.kind) {
    case "DEPARTED":
      return `${e.tk} DEPARTED ${e.from ?? "???"} → ${e.to ?? "???"}`;
    case "LANDED":
      return `${e.tk} LANDED ${e.to ?? "???"}`;
    case "LAST_CONTACT":
      return `${e.tk} LAST CONTACT`;
  }
}

export function addEvents(prev: EventLine[], evs: FlightEvent[]): EventLine[] {
  const seen = new Set(prev.map((l) => l.id));
  const next = [...prev];
  for (const e of evs) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    next.push({ id: e.id, kind: e.kind, text: eventText(e), at: e.at });
  }
  return next.slice(-MAX_EVENTS);
}

/** IST first, then the busiest airports (by flights in the window), at most `n`. */
export function pickLabelAirports(m: GlobeModel, n: number): string[] {
  const others = [...m.traffic.entries()]
    .filter(([code]) => code !== "IST")
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code]) => code);
  return ["IST", ...others].slice(0, n);
}

/** LIVE displayed time (seconds relative to window.from): the wall clock, capped shortly after the data. */
export function liveCur(m: GlobeModel, nowSec: number): number {
  return Math.min(m.span + LIVE_OVERRUN_SEC, Math.max(0, nowSec - m.from));
}
```

- [ ] **Step 5: `engine.ts`**

`globe/src/scene/engine.ts`:
```ts
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { Group, LinearSRGBColorSpace, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { TUNNEL_PERIOD, advance } from "@web/render/clocks";
import type { ScreenPoint } from "@web/render/picking";
import { LEVELS, initQuality, updateQuality } from "@web/render/quality";
import { earthRotationRad, sunDirection } from "../astro";
import { IDLE_YAW_RATE, dragRig, initRig, initialYaw, releaseRig, rigPosition, stepRig, type RigState } from "../camera/globe-rig";
import { altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { HeadSmoother } from "../model/head-smoother";
import { createAirports, type Airports } from "./airports";
import { ARC_BASE_LIFT, createArcs, type Arcs } from "./arcs";
import { createAtmosphere } from "./atmosphere";
import { createEarth } from "./earth";
import { createHeads, headLatLons } from "./heads";
import { buildPickIndex, pickFlight, type PickIndex } from "./picking3d";
import { createSpace } from "./space";
import { chooseTier, detectTierInputs, loadEarthTextures } from "./textures";

export interface GlobeFrameInput {
  /** displayed UTC instant (unix seconds): drives Earth rotation and the sun */
  absTime: number;
  /** displayed time relative to window.from (seconds): drives arc/head clipping */
  cur: number;
  highlight: number;
  /** wall clock (unix seconds): drives pulses and smoothing */
  nowSec: number;
}

export interface GlobeEngineOptions {
  reducedMotion: boolean;
  onPerf?: (fps: number, level: number) => void;
  onError?: (msg: string) => void;
}

export interface GlobeEngine {
  setModel(m: GlobeModel | null, cur: number, nowSec: number): void;
  loadTextures(onProgress: (p: number) => void): Promise<"8k" | "4k" | null>;
  setFrameSource(fn: ((dt: number) => GlobeFrameInput) | null): void;
  pick(x: number, y: number, cur: number): number;
  screenOf(lat: number, lon: number, alt100?: number): ScreenPoint;
  dragBy(dxPx: number, dyPx: number, dtSec: number): void;
  endDrag(): void;
  pulseAirport(iata: string, nowSec: number): void;
  headsInfo(): { count: number; extrapolated: number };
  dispose(): void;
}

const DRAG_RAD_PER_PX = 0.0045;

export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function createGlobeEngine(canvas: HTMLCanvasElement, opts: GlobeEngineOptions): GlobeEngine {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = LinearSRGBColorSpace; // colours are authored in display space
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    console.error("[shader]", gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
    opts.onError?.("SHADER COMPILE ERROR — SEE CONSOLE");
  };
  const onContextLost = (e: Event) => {
    e.preventDefault();
    opts.onError?.("WEBGL CONTEXT LOST — RELOADING");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.05, 50);
  const space = createSpace();
  scene.add(space.nebula.display);
  scene.add(space.stars);
  const earthGroup = new Group();
  scene.add(earthGroup);
  const earth = createEarth();
  earthGroup.add(earth.mesh);
  const atmosphere = createAtmosphere();
  scene.add(atmosphere.mesh);
  const heads = createHeads();
  earthGroup.add(heads.points);

  let arcs: Arcs | null = null;
  let airports: Airports | null = null;
  let model: GlobeModel | null = null;
  let pickIndex: PickIndex | null = null;
  let headInfo = { count: 0, extrapolated: 0 };
  const smoother = new HeadSmoother();
  let rig: RigState = initRig(initialYaw(earthRotationRad(Date.now() / 1000), 30));
  const idleRate = IDLE_YAW_RATE * (opts.reducedMotion ? 0.4 : 1);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ luminanceThreshold: 0.8, luminanceSmoothing: 0.2, intensity: 0.9, mipmapBlur: true });
  composer.addPass(new EffectPass(camera, bloom));

  let quality = initQuality();
  let level = LEVELS[0];
  const size = { w: 1, h: 1 };
  let sized = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 1 || h < 1) {
      sized = false; // not laid out yet / hidden: keep buffers, skip rendering
      return;
    }
    sized = true;
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    bloom.resolution.scale = level.bloomScale; // fires a size reset: must precede the explicit sizing below
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    space.nebula.setSize(w * pr, h * pr, 0.35 * level.tunnelScale);
    // mipmapBlur ignores resolution.scale: size its chain explicitly (mip0 is already ½ of its input)
    const k = level.bloomScale * 2;
    const bw = Math.max(1, Math.round(w * pr * k));
    const bh = Math.max(1, Math.round(h * pr * k));
    bloom.luminancePass.setSize(bw, bh);
    bloom.mipmapBlurPass.setSize(bw, bh);
    arcs?.setResolution(w * pr, h * pr, pr);
    heads.setPixelRatio(pr);
    airports?.setPixelRatio(pr);
  }

  let source: ((dt: number) => GlobeFrameInput) | null = null;
  let raf = 0;
  let last = performance.now();
  let nebulaTime = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  const flowScale = opts.reducedMotion ? 0.4 : 1;

  function frame(now: number) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const wall = Date.now() / 1000;
    const f: GlobeFrameInput = source ? source(dt) : { absTime: wall, cur: 0, highlight: -1, nowSec: wall };

    rig = stepRig(rig, dt, idleRate);
    const p = rigPosition(rig);
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    earthGroup.rotation.y = earthRotationRad(f.absTime);
    const sun = sunDirection(f.absTime);
    earth.setSun(sun);
    atmosphere.setSun(sun);
    earth.setCloudDrift(f.absTime * 1.5e-6);

    if (arcs) {
      arcs.uniforms.uCur.value = f.cur;
      arcs.uniforms.uHighlight.value = f.highlight;
    }
    if (model) headInfo = heads.update(model, f.cur, f.nowSec, f.highlight, smoother);
    airports?.setNow(f.nowSec);

    space.update(camera);
    nebulaTime = advance(nebulaTime, dt * 0.35 * flowScale, TUNNEL_PERIOD);
    space.nebula.uniforms.u_time.value = nebulaTime;

    if (sized) {
      space.nebula.render(renderer);
      composer.render(dt);
    }

    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      const fps = fpsFrames / fpsAcc;
      const prev = quality.level;
      quality = updateQuality(quality, fps, fpsAcc);
      if (quality.level !== prev) {
        level = LEVELS[quality.level];
        resize();
      }
      opts.onPerf?.(Math.round(fps), quality.level);
      fpsAcc = 0;
      fpsFrames = 0;
    }
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  const world = new Vector3();
  const cam = new Vector3();

  return {
    setModel(m, cur, nowSec) {
      const prev = model;
      const prevHeads = prev && m ? headLatLons(prev, m.from + cur - prev.from) : null;
      if (arcs) {
        earthGroup.remove(arcs.mesh);
        arcs.dispose();
        arcs = null;
      }
      if (airports) {
        earthGroup.remove(airports.points);
        airports.dispose();
        airports = null;
      }
      model = m;
      if (m) {
        arcs = createArcs(m);
        earthGroup.add(arcs.mesh);
        airports = createAirports(m);
        earthGroup.add(airports.points);
        pickIndex = buildPickIndex(m, 3);
        if (prevHeads) smoother.onSwap(prevHeads, headLatLons(m, cur), nowSec);
        if (sized) {
          const pr = renderer.getPixelRatio();
          arcs.setResolution(size.w * pr, size.h * pr, pr);
          airports.setPixelRatio(pr);
        }
      } else {
        pickIndex = null;
        heads.points.geometry.setDrawRange(0, 0);
        headInfo = { count: 0, extrapolated: 0 };
      }
    },
    async loadTextures(onProgress) {
      const t = await loadEarthTextures(renderer, chooseTier(detectTierInputs(renderer)), onProgress);
      earth.setTextures(t);
      return t ? t.tier : null;
    },
    setFrameSource(fn) {
      source = fn;
    },
    pick(x, y, cur) {
      if (!pickIndex) return -1;
      earthGroup.updateMatrixWorld();
      return pickFlight(pickIndex, heads.data, cur, earthGroup.matrixWorld, camera, size.w, size.h, x, y);
    },
    screenOf(lat, lon, alt100 = 0) {
      earthGroup.updateMatrixWorld();
      const p = latLonToVec3(lat, lon, altitudeRadius(alt100) + ARC_BASE_LIFT);
      world.set(p[0], p[1], p[2]).applyMatrix4(earthGroup.matrixWorld);
      cam.copy(camera.position);
      const front = world.dot(cam) > 1.0;
      world.project(camera);
      return {
        x: ((world.x + 1) / 2) * size.w,
        y: ((1 - world.y) / 2) * size.h,
        visible: front && world.z >= -1 && world.z <= 1 && Math.abs(world.x) <= 1 && Math.abs(world.y) <= 1,
      };
    },
    dragBy(dx, dy, dt) {
      rig = dragRig(rig, -dx * DRAG_RAD_PER_PX, dy * DRAG_RAD_PER_PX, dt);
    },
    endDrag() {
      rig = releaseRig(rig);
    },
    pulseAirport(iata, nowSec) {
      airports?.pulse(iata, nowSec);
    },
    headsInfo() {
      return headInfo;
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      arcs?.dispose();
      airports?.dispose();
      heads.dispose();
      earth.dispose();
      atmosphere.dispose();
      space.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
```
If `bloom.luminancePass` / `bloom.mipmapBlurPass` do not typecheck, they did in Plan 2 (`@web/render/engine.ts`) with the same `postprocessing` version; copy the exact working lines from `web/src/render/engine.ts` and note it in the report.

- [ ] **Step 6: `controller.ts`**

`globe/src/app/controller.ts`:
```ts
import type { DayFile } from "@collector/day-schema";
import { applyAction, initCycle, stepCycle, type Bounds, type CycleConfig, type CycleState } from "@web/cycle/machine";
import { createPoller } from "@web/data/source";
import { buildTimeline, type Timeline } from "@web/data/timeline";
import { buildSnapshot } from "@web/hud/snapshot";
import type { Store } from "@web/hud/store";
import { diffEvents } from "../model/events";
import { buildGlobeModel, type GlobeModel } from "../model/globe-model";
import type { GlobeEngine, GlobeFrameInput } from "../scene/engine";
import {
  CREDIT, LABEL_COUNT, addEvents, liveCur, pickLabelAirports,
  type AirportLabel, type EventLine, type GlobeHudSnapshot,
} from "./hud-model";
import { SCRUB_SEC, keyToCommand } from "./keys";

export const GLOBE_CYCLE: CycleConfig = { replaySec: 180, liveSec: Number.POSITIVE_INFINITY, holdSec: 20 };
export const HUD_TICK_SEC = 0.25;
export const PICK_INTERVAL_MS = 100;
export const FIXTURE_LIVE_LOOP_SEC = 240;

export interface GlobeControllerDeps {
  engine: GlobeEngine;
  store: Store<GlobeHudSnapshot>;
  url: string;
  fixture: boolean;
  debug: boolean;
  reducedMotion: boolean;
  nowMs: () => number;
  fetch?: typeof fetch;
  visible?: () => boolean;
}

export interface GlobeController {
  onKey(key: string): void;
  onPointerMove(x: number, y: number): void;
  onPointerLeave(): void;
  onInteract(): void;
  refresh(): void;
  setPerf(fps: number, level: number): void;
  setTextureState(progress: number, note: string): void;
  dispose(): void;
}

export function createController(d: GlobeControllerDeps): GlobeController {
  let model: GlobeModel | null = null;
  let tl: Timeline | null = null;
  let mode: "LIVE" | "REPLAY" = "LIVE";
  let cycle: CycleState = { ...initCycle({ start: 0, end: 0 }), phase: "LIVE" };
  let liveFrozen: number | null = null;
  let events: EventLine[] = [];
  let hoverIdx = -1;
  let pointer = { x: 0, y: 0 };
  let pending: { x: number; y: number } | null = null;
  let lastPick = -Infinity;
  let hidden = false;
  let hudTimer = 0;
  let perf = { fps: 0, level: 0 };
  let tex = { progress: 0, note: "" };
  let firstDataSec = 0;

  const bounds = (): Bounds => (model ? { start: model.replayStart, end: model.span } : { start: 0, end: 0 });
  const act = (a: Parameters<typeof applyAction>[1]) => {
    cycle = applyAction(cycle, a, bounds(), GLOBE_CYCLE);
  };

  function currentCur(nowSec: number): number {
    if (!model) return 0;
    if (mode === "REPLAY") return cycle.tRel;
    if (d.fixture) return model.span + ((nowSec - firstDataSec) % FIXTURE_LIVE_LOOP_SEC);
    return liveFrozen ?? liveCur(model, nowSec);
  }

  function pushHud() {
    const nowSec = d.nowMs() / 1000;
    const cur = currentCur(nowSec);
    let hoverScreen: { x: number; y: number; visible: boolean } | null = null;
    if (model && hoverIdx >= 0) hoverScreen = { x: pointer.x, y: pointer.y, visible: true };
    const base = buildSnapshot({
      model,
      tl,
      cycle: { phase: mode, elapsed: cycle.elapsed, tRel: cur, paused: cycle.paused, manual: cycle.manual, idle: cycle.idle },
      nowSec,
      fixture: d.fixture,
      spotlightIdx: -1,
      spotlightScreen: null,
      hoverIdx,
      hoverScreen,
      hidden,
      reducedMotion: d.reducedMotion,
      debug: d.debug ? { ...perf, flights: model?.flights.length ?? 0 } : undefined,
    });
    const labels: AirportLabel[] = [];
    if (model) {
      for (const iata of pickLabelAirports(model, LABEL_COUNT)) {
        const a = model.airports[iata];
        if (!a) continue;
        const p = d.engine.screenOf(a.lat, a.lon, 0);
        labels.push({ iata, x: p.x, y: p.y, visible: p.visible });
      }
    }
    d.store.set({
      ...base,
      mode,
      events,
      labels,
      extrapolated: d.engine.headsInfo().extrapolated,
      textureProgress: tex.progress,
      textureNote: tex.note,
      credit: CREDIT,
    });
  }

  const frame = (dt: number): GlobeFrameInput => {
    const nowSec = d.nowMs() / 1000;
    cycle = stepCycle(cycle, dt, bounds(), GLOBE_CYCLE);
    if (mode === "REPLAY" && cycle.phase === "LIVE") {
      mode = "LIVE"; // replay finished: back to the present
      liveFrozen = null;
    }
    if (mode === "LIVE") {
      if (!cycle.paused) liveFrozen = null;
      else if (liveFrozen === null && model) liveFrozen = liveCur(model, nowSec);
    }
    if (pending && d.nowMs() - lastPick >= PICK_INTERVAL_MS) {
      lastPick = d.nowMs();
      hoverIdx = d.engine.pick(pending.x, pending.y, currentCur(nowSec));
      pending = null;
    }
    hudTimer += dt;
    if (hudTimer >= HUD_TICK_SEC) {
      hudTimer = 0;
      pushHud();
    }
    const cur = currentCur(nowSec);
    return { absTime: (model?.from ?? nowSec) + cur, cur, highlight: hoverIdx, nowSec };
  };
  d.engine.setFrameSource(frame);

  const onData = (day: DayFile) => {
    const prev = model;
    const next = buildGlobeModel(day);
    const nowSec = d.nowMs() / 1000;
    const first = !prev;
    model = next;
    tl = buildTimeline(next);
    if (first) {
      firstDataSec = nowSec;
      mode = "LIVE";
      cycle = { ...initCycle(bounds()), phase: "LIVE" };
      liveFrozen = null;
    } else if (cycle.paused && mode === "REPLAY") {
      // keep the displayed instant stable while paused (window.from moved forward)
      cycle = { ...cycle, tRel: Math.max(0, cycle.tRel - (next.from - prev!.from)) };
    }
    const evs = diffEvents(prev, next);
    events = addEvents(events, evs);
    d.engine.setModel(next, currentCur(nowSec), nowSec);
    for (const e of evs) if (e.airport) d.engine.pulseAirport(e.airport, nowSec);
    hoverIdx = -1;
    pending = null;
    pushHud();
  };

  const poller = createPoller({
    url: d.url,
    fetch: d.fetch ?? fetch.bind(globalThis),
    onData,
    onError: (e) => {
      console.warn("[data]", e);
      pushHud();
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    visible: d.visible ?? (() => typeof document === "undefined" || !document.hidden),
  });
  poller.start();
  const onVisible = () => {
    if (typeof document !== "undefined" && !document.hidden) poller.refresh();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  pushHud();

  return {
    onKey(key) {
      const cmd = keyToCommand(key);
      if (!cmd) return;
      const nowSec = d.nowMs() / 1000;
      if (cmd === "togglePause") act({ type: "togglePause" });
      else if (cmd === "scrubBack" || cmd === "scrubForward") {
        if (mode === "LIVE" && model) {
          mode = "REPLAY";
          liveFrozen = null;
          cycle = { ...initCycle(bounds()), tRel: Math.min(model.span, liveCur(model, nowSec)), phase: "REPLAY" };
        }
        act({ type: "scrub", delta: cmd === "scrubBack" ? -SCRUB_SEC : SCRUB_SEC });
      } else if (cmd === "toggleReplay") {
        if (mode === "LIVE") {
          mode = "REPLAY";
          liveFrozen = null;
          cycle = { ...initCycle(bounds()), phase: "REPLAY" };
        } else {
          mode = "LIVE";
          cycle = { ...cycle, phase: "LIVE", paused: false };
        }
        act({ type: "interact" });
      } else {
        act({ type: "interact" });
        if (cmd === "toggleHud") hidden = !hidden;
        if (cmd === "fullscreen" && typeof document !== "undefined") {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
        }
      }
      pushHud();
    },
    onPointerMove(x, y) {
      pointer = { x, y };
      act({ type: "interact" });
      const now = d.nowMs();
      if (now - lastPick >= PICK_INTERVAL_MS) {
        lastPick = now;
        pending = null;
        hoverIdx = d.engine.pick(x, y, currentCur(now / 1000));
      } else pending = { x, y };
    },
    onPointerLeave() {
      hoverIdx = -1;
      pending = null;
    },
    onInteract() {
      act({ type: "interact" });
    },
    refresh() {
      poller.refresh();
    },
    setPerf(fps, level) {
      perf = { fps, level };
    },
    setTextureState(progress, note) {
      tex = { progress, note };
      pushHud();
    },
    dispose() {
      poller.stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      d.engine.setFrameSource(null);
    },
  };
}
```
The tooltip is anchored at the cursor position (not at a head), so flights that already ended simply show no card (`flightCard` returns null outside the flight's time range).

- [ ] **Step 7: `App.tsx`**

Replace `globe/src/App.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { dataUrl, isFixture } from "@web/data/source";
import { ErrorScreen } from "@web/hud/Hud";
import { createStore, useStore, type Store } from "@web/hud/store";
import { createController, type GlobeController } from "./app/controller";
import { EMPTY_GLOBE_SNAPSHOT, type GlobeHudSnapshot } from "./app/hud-model";
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "./scene/engine";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => createStore<GlobeHudSnapshot>(EMPTY_GLOBE_SNAPSHOT), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasWebGL2()) {
      setError("WEBGL2 IS NOT AVAILABLE ON THIS DEVICE");
      return;
    }
    const canvas = canvasRef.current!;
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let controller: GlobeController | null = null;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, {
        reducedMotion,
        onPerf: (fps, level) => controller?.setPerf(fps, level),
        onError: (msg) => {
          setError(msg);
          if (msg.includes("RELOADING")) setTimeout(() => window.location.reload(), 1500);
        },
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    controller = createController({
      engine,
      store,
      url: dataUrl(search),
      fixture: isFixture(search),
      debug: params.get("debug") === "1",
      reducedMotion,
      nowMs: () => Date.now(),
    });
    controller.setTextureState(0, "");
    void engine
      .loadTextures((p) => controller?.setTextureState(p, ""))
      .then((tier) => controller?.setTextureState(1, tier ? "" : "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)"));

    let drag: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      controller?.onInteract();
    };
    const move = (e: PointerEvent) => {
      controller?.onPointerMove(e.clientX, e.clientY);
      if (drag) {
        const now = performance.now();
        engine.dragBy(e.clientX - drag.x, e.clientY - drag.y, (now - drag.t) / 1000);
        drag = { x: e.clientX, y: e.clientY, t: now };
      }
    };
    const up = (e: PointerEvent) => {
      drag = null;
      engine.endDrag();
      canvas.releasePointerCapture?.(e.pointerId);
    };
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      controller?.onKey(e.key);
    };
    const leave = () => controller?.onPointerLeave();
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      controller?.dispose();
      engine.dispose();
    };
  }, [store]);

  return (
    <>
      <canvas ref={canvasRef} className="stage" />
      {error ? <ErrorScreen message={error} /> : <DebugReadout store={store} />}
    </>
  );
}

// Replaced by <GlobeHud> in Task 12.
function DebugReadout({ store }: { store: Store<GlobeHudSnapshot> }) {
  const s = useStore(store);
  return (
    <pre className="debug">
      {`${s.mode} ${s.timeLabel} · ${s.counters.airborne} AIRBORNE · ${s.extrapolated} EXTRAPOLATED · ${Math.round(s.textureProgress * 100)}% TEX`}
    </pre>
  );
}
```

- [ ] **Step 8: Run tests, typecheck, build**

Run: `cd globe && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS. If a controller test fails, reason about the timing model first (LIVE `cur = nowSec − from` capped at `span + 360`; fixture loops mod 240; replay 180 s) before touching an expectation, and report DONE_WITH_CONCERNS with the analysis rather than bending the test.

- [ ] **Step 9: Visual check (controller session, real browser) — do this before committing the tuning**

The engine, shaders and textures can only be judged on screen. Add a dev-server entry to the (untracked) `.claude/launch.json` named `globe-dev` (`npm --prefix globe run dev`, port 5174) and open `http://localhost:5174/?data=fixture&debug=1` and `http://localhost:5174/?debug=1`. Check and record:
- The Earth shows day/night with city lights on the dark side, clouds, a blue limb glow; stars and the soft nebula behind it; no console errors (also confirm `gl.getError()` is 0 after 3 s).
- Arcs: bright observed tracks and faint dashed planned routes fanning out of Istanbul; arcs are hidden when behind the globe; heads glow, extrapolated heads are rings.
- Dragging rotates smoothly with inertia; the globe drifts slowly when idle; hovering an arc shows a tooltip card; `R` plays the REPLAY (the Earth spins one full turn and the terminator sweeps), then returns to LIVE; `Space` pauses.
- FPS in the debug readout ≥ 55 (quality level may step down).
Allowed tuning (record every change in the report): `uExposure`/`uGamma` (Earth), night-light gain `1.7`, atmosphere `uIntensity`/`uPower`/`uRimScale`, nebula `u_energy`, bloom `luminanceThreshold`/`intensity`, `ARC_WIDTH_PX`, `HEAD_SIZE_PX`, planned-arc alpha `0.16`. Take screenshots of: the whole globe, a close view near Istanbul, REPLAY mid-run.

- [ ] **Step 10: Commit**

```bash
git add globe/src globe/test
git commit -m "feat(globe): camera rig, render engine, LIVE/REPLAY controller and live canvas"
```

---

### Task 12: HUD (events, airport labels, status, credit)

**Files:**
- Create: `globe/src/hud/GlobeHud.tsx`
- Modify: `globe/src/App.tsx` (swap `DebugReadout` for `GlobeHud`), `globe/src/styles.css`
- Test: `globe/test/hud.test.tsx`

**Interfaces:**
- Consumes: `GlobeHudSnapshot`, `EventLine`, `AirportLabel`, `EMPTY_GLOBE_SNAPSHOT` (Task 11); `TitleBlock`, `Counters`, `DepartureStrip`, `RegionBars`, `SourceLine`, `FlightCardView` from `@web/hud/Hud`; `Store`, `useStore` from `@web/hud/store`.
- Produces: components `EventFeed({ events })`, `AirportLabels({ labels })`, `ModeLine({ s })`, `Credit({ s })`, `LoadingOverlay({ s })`, `GlobeHud({ store })`.

HUD rules (spec §7, Plan 2 §HUD): every direct child of `.hud` fades out on `H` except elements with class `source` (dimmed to 45 %); therefore the imagery credit also carries the `source` class so attribution stays visible. English only; TK fonts via the shared CSS.

- [ ] **Step 1: Write the failing test**

`globe/test/hud.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createStore } from "@web/hud/store";
import { EMPTY_GLOBE_SNAPSHOT, type GlobeHudSnapshot } from "../src/app/hud-model";
import { AirportLabels, Credit, EventFeed, GlobeHud, LoadingOverlay, ModeLine } from "../src/hud/GlobeHud";

const snap = (o: Partial<GlobeHudSnapshot> = {}): GlobeHudSnapshot => ({ ...EMPTY_GLOBE_SNAPSHOT, ready: true, ...o });
const text = (el: HTMLElement) => el.textContent!.replace(/\s+/g, " ").trim();

describe("EventFeed", () => {
  it("lists events oldest first with a kind class", () => {
    const { container } = render(
      <EventFeed
        events={[
          { id: "1", kind: "DEPARTED", text: "TK1 DEPARTED IST → JFK", at: 1 },
          { id: "2", kind: "LAST_CONTACT", text: "TK2 LAST CONTACT", at: 2 },
        ]}
      />,
    );
    const rows = Array.from(container.querySelectorAll(".event"));
    expect(rows.map((r) => r.textContent)).toEqual(["TK1 DEPARTED IST → JFK", "TK2 LAST CONTACT"]);
    expect(rows[0].classList.contains("departed")).toBe(true);
    expect(rows[1].classList.contains("last_contact")).toBe(true);
  });
  it("renders nothing without events", () => {
    expect(render(<EventFeed events={[]} />).container.innerHTML).toBe("");
  });
});

describe("AirportLabels", () => {
  it("renders only visible labels at their screen position; the hub is marked", () => {
    const { container } = render(
      <AirportLabels
        labels={[
          { iata: "IST", x: 100, y: 200, visible: true },
          { iata: "JFK", x: 300, y: 400, visible: true },
          { iata: "SYD", x: 5, y: 5, visible: false },
        ]}
      />,
    );
    const els = Array.from(container.querySelectorAll<HTMLElement>(".airport-label"));
    expect(els.map((e) => e.textContent)).toEqual(["IST", "JFK"]);
    expect(els[0].style.left).toBe("100px");
    expect(els[0].style.top).toBe("200px");
    expect(els[0].classList.contains("hub")).toBe(true);
    expect(els[1].classList.contains("hub")).toBe(false);
  });
});

describe("ModeLine", () => {
  it("LIVE shows extrapolated heads, REPLAY shows the compression", () => {
    expect(text(render(<ModeLine s={snap({ mode: "LIVE", extrapolated: 87 })} />).container)).toBe("LIVE · 87 HEADS EXTRAPOLATED");
    expect(text(render(<ModeLine s={snap({ mode: "LIVE", extrapolated: 0 })} />).container)).toBe("LIVE");
    expect(text(render(<ModeLine s={snap({ mode: "REPLAY" })} />).container)).toBe("REPLAY · 24H IN 3 MIN");
  });
});

describe("Credit", () => {
  it("is part of the always-visible source group and appends a texture note", () => {
    const a = render(<Credit s={snap()} />).container;
    expect(a.firstElementChild!.classList.contains("source")).toBe(true);
    expect(text(a)).toBe("EARTH IMAGERY: NASA EARTH OBSERVATORY (BLUE MARBLE · BLACK MARBLE)");
    const b = render(<Credit s={snap({ textureNote: "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)" })} />).container;
    expect(text(b)).toContain("· FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)");
  });
});

describe("LoadingOverlay", () => {
  it("shows progress only while the imagery loads", () => {
    expect(text(render(<LoadingOverlay s={snap({ textureProgress: 0.34 })} />).container)).toBe("LOADING EARTH IMAGERY 34%");
    expect(render(<LoadingOverlay s={snap({ textureProgress: 1 })} />).container.innerHTML).toBe("");
    expect(render(<LoadingOverlay s={snap({ textureProgress: 0.5, textureNote: "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)" })} />).container.innerHTML).toBe("");
  });
});

describe("GlobeHud", () => {
  it("keeps every block a direct child of .hud and the hidden class follows the snapshot", () => {
    const store = createStore(
      snap({
        hidden: true,
        sourceName: "adsb.fi",
        sourceUrl: "https://adsb.fi",
        dataState: "ok",
        updatedAgo: "14 S AGO",
        totalFlights: 2031,
        timeLabel: "08:42 UTC",
        events: [{ id: "1", kind: "LANDED", text: "TK1 LANDED JFK", at: 1 }],
        labels: [{ iata: "IST", x: 1, y: 2, visible: true }],
        textureProgress: 1,
      }),
    );
    const { container } = render(<GlobeHud store={store} />);
    const hud = container.querySelector(".hud")!;
    expect(hud.classList.contains("hidden")).toBe(true);
    for (const sel of [".events", ".airport-label", ".source"]) {
      const el = hud.querySelector(sel)!;
      expect(el, sel).not.toBeNull();
      expect(Array.from(hud.children).some((c) => c === el || c.contains(el))).toBe(true);
    }
    // the source line and the credit are the only direct children with class `source`
    const sources = Array.from(hud.children).filter((c) => c.classList.contains("source"));
    expect(sources.length).toBe(2);
    expect(hud.textContent).toContain("SOURCE: ADSB.FI");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd globe && npx vitest run test/hud.test.tsx`
Expected: FAIL — `../src/hud/GlobeHud` not found.

- [ ] **Step 3: Implement `GlobeHud.tsx`**

`globe/src/hud/GlobeHud.tsx`:
```tsx
import { Counters, DepartureStrip, FlightCardView, RegionBars, SourceLine, TitleBlock } from "@web/hud/Hud";
import { useStore, type Store } from "@web/hud/store";
import type { AirportLabel, EventLine, GlobeHudSnapshot } from "../app/hud-model";

export function EventFeed({ events }: { events: EventLine[] }) {
  if (events.length === 0) return null;
  return (
    <div className="events">
      {events.map((e) => (
        <div key={e.id} className={`event ${e.kind.toLowerCase()}`}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

export function AirportLabels({ labels }: { labels: AirportLabel[] }) {
  return (
    <>
      {labels
        .filter((l) => l.visible)
        .map((l) => (
          <div key={l.iata} className={`airport-label${l.iata === "IST" ? " hub" : ""}`} style={{ left: `${l.x}px`, top: `${l.y}px` }}>
            {l.iata}
          </div>
        ))}
    </>
  );
}

export function ModeLine({ s }: { s: GlobeHudSnapshot }) {
  const text =
    s.mode === "REPLAY"
      ? "REPLAY · 24H IN 3 MIN"
      : s.extrapolated > 0
        ? `LIVE · ${s.extrapolated} HEADS EXTRAPOLATED`
        : "LIVE";
  return <div className="modeline label">{text}</div>;
}

export function Credit({ s }: { s: GlobeHudSnapshot }) {
  return <div className="source credit label">{s.textureNote ? `${s.credit} · ${s.textureNote}` : s.credit}</div>;
}

export function LoadingOverlay({ s }: { s: GlobeHudSnapshot }) {
  if (s.textureProgress >= 1 || s.textureNote) return null;
  return <div className="loading label">{`LOADING EARTH IMAGERY ${Math.round(s.textureProgress * 100)}%`}</div>;
}

export function GlobeHud({ store }: { store: Store<GlobeHudSnapshot> }) {
  const s = useStore(store);
  const animate = !s.reducedMotion;
  return (
    <div className={`hud${s.hidden ? " hidden" : ""}`}>
      <TitleBlock s={s} />
      <ModeLine s={s} />
      {s.ready && (
        <>
          <Counters c={s.counters} animate={animate} />
          <DepartureStrip bins={s.depHist} playhead={s.playhead} />
          <RegionBars counts={s.regionAirborne} />
          <EventFeed events={s.events} />
          <AirportLabels labels={s.labels} />
        </>
      )}
      <SourceLine s={s} />
      <Credit s={s} />
      <FlightCardView key={"tip-" + (s.tooltip?.tk ?? "")} card={s.tooltip} kind="tooltip" />
      <LoadingOverlay s={s} />
      {s.debug && <pre className="debug">{`${s.debug.fps} FPS · Q${s.debug.level} · ${s.debug.flights} FLIGHTS`}</pre>}
    </div>
  );
}
```
Note: `AirportLabels` returns a fragment, so each label is a direct child of `.hud` (needed for the `.hud.hidden > :not(.source)` rule); `EventFeed` and `Counters` etc. render one wrapper each, also direct children.

- [ ] **Step 4: Wire into `App.tsx` and add CSS**

In `globe/src/App.tsx`: add `import { GlobeHud } from "./hud/GlobeHud";`, replace `<DebugReadout store={store} />` with `<GlobeHud store={store} />`, delete the `DebugReadout` function and the now-unused `useStore`/`type Store` imports (keep `createStore`).

Append to `globe/src/styles.css`:
```css
.modeline { position: absolute; left: 3vmin; top: 10.4vmin; letter-spacing: 0.16em; font-size: calc(1.1 * var(--u)); color: var(--ink-dim); }

.events { position: absolute; left: 3vmin; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 0.9vmin; max-width: 32vmin; }
.event { font-family: var(--label); font-size: calc(1.05 * var(--u)); letter-spacing: 0.12em; color: var(--ink-dim); border-left: 0.3vmin solid var(--line-strong); padding-left: 1vmin; }
.event.departed { border-left-color: var(--thy); color: var(--ink); }
.event.landed { border-left-color: #7bd389; }
.event.last_contact { border-left-color: var(--amber); }

.airport-label { position: absolute; transform: translate(0.9vmin, -125%); font-family: var(--label); font-size: calc(0.95 * var(--u)); letter-spacing: 0.14em; color: var(--ink); text-shadow: 0 0 0.6vmin #000, 0 0 1.4vmin #000; pointer-events: none; }
.airport-label.hub { color: #fff; font-size: calc(1.2 * var(--u)); }

.credit { bottom: 4.6vmin; }

.loading { position: fixed; inset: 0; display: grid; place-items: center; letter-spacing: 0.2em; color: var(--ink-dim); pointer-events: none; z-index: 6; }

@media (max-aspect-ratio: 1/1) {
  .modeline { top: 7.4vmin; }
  .events { top: 62%; }
}
```

- [ ] **Step 5: Run tests, typecheck, build**

Run: `cd globe && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS.

- [ ] **Step 6: Visual check (controller session)**

Reload `http://localhost:5174/?data=fixture&debug=1` and the live URL. Confirm: title + `LIVE` line, counters, departures strip with the playhead, region bars, **event feed** filling as live data arrives (live mode only; the fixture produces none), **airport labels** on the visible hemisphere (IST large) that follow the rotation and vanish behind the globe, the imagery credit and the source line at the bottom, the tooltip on hover, the loading text while textures load. `H` hides everything except the two bottom lines (dimmed). Take screenshots (full HUD, `H` hidden, a mobile-width portrait viewport).

- [ ] **Step 7: Commit**

```bash
git add globe/src globe/test
git commit -m "feat(globe): HUD with event feed, airport labels, status and imagery credit"
```

---

### Task 13: New Hosting site, deploy and verification

**Files:**
- Modify: `firebase.json`, `.firebaserc`, `README.md`

This publishes a public site. The user approved a new site named `dataroute-tk` and serving the TK fonts. Everything else about the old site stays as is.

- [ ] **Step 1 (controller): snapshot the old site so we can prove it did not change**

```bash
curl -s https://omerkilavuz-9ad41.web.app/ | grep -o 'assets/index-[^"]*' | sort -u
```
Record the asset file names.

- [ ] **Step 2: Hosting config as an array with named targets**

Replace the `hosting` value in `firebase.json` with:
```json
"hosting": [
  {
    "target": "tunnel",
    "public": "web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "predeploy": ["npm --prefix web run build"],
    "headers": [
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/fonts/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800" }] },
      { "source": "/fixture/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=300" }] }
    ]
  },
  {
    "target": "globe",
    "public": "globe/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "predeploy": ["npm --prefix globe run build"],
    "headers": [
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/fonts/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800" }] },
      { "source": "/textures/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800" }] },
      { "source": "/fixture/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=300" }] }
    ]
  }
]
```
(The `tunnel` entry reproduces the existing site's config exactly; keep `functions`, `firestore`, `storage` untouched.)

- [ ] **Step 3: Create the site and map the targets**

```bash
firebase hosting:sites:create dataroute-tk --project omerkilavuz-9ad41
firebase target:apply hosting globe dataroute-tk --project omerkilavuz-9ad41
firebase target:apply hosting tunnel omerkilavuz-9ad41 --project omerkilavuz-9ad41
```
If `dataroute-tk` is taken, use `dataroute-tk-globe` in both commands and in every URL below, and say so in the report. `target:apply` writes `.firebaserc`; keep that change.

- [ ] **Step 4: Deploy only the globe**

```bash
firebase deploy --only hosting:globe --project omerkilavuz-9ad41 --non-interactive
```
Expected: `Hosting URL: https://dataroute-tk.web.app`. (The predeploy runs `npm --prefix globe run build`, which copies the fonts from `../font`; 8K textures upload as normal files.)

- [ ] **Step 5: Verify**

```bash
for p in / /fixture/day.json /textures/day-8k.jpg /textures/night-8k.jpg /textures/clouds-2k.jpg /fonts/TKText-Regular.woff2; do curl -s -o /dev/null -w "$p %{http_code} %{size_download}B\n" "https://dataroute-tk.web.app$p"; done
curl -sI https://dataroute-tk.web.app/textures/day-8k.jpg | grep -i -E "^cache-control|content-type"
curl -s https://omerkilavuz-9ad41.web.app/ | grep -o 'assets/index-[^"]*' | sort -u   # must equal the Step 1 output
```
Expected: six `200` lines with sensible sizes (`day-8k.jpg` several MB), `cache-control: public, max-age=604800`, and the **old site's asset names unchanged**.

Controller visual check in a real browser: `https://dataroute-tk.web.app/?debug=1` — live data, textures load (8K on this machine), arcs/heads/labels/events as in Tasks 11–12, no console errors, FPS ≥ 55. Also `?data=fixture`.

- [ ] **Step 6: README**

Append to `README.md`:
```markdown
## Globe (`globe/`)

Live: https://dataroute-tk.web.app — real-time rotating Earth with every THY flight as a curved arc
(faint planned route + bright observed track; gaps in ADS-B coverage stay faint). `?data=fixture` for the
synthetic dataset, `?debug=1` for FPS / quality.

    cd globe && npm install && npm run dev     # http://localhost:5174/?data=fixture
    cd globe && npm test
    firebase deploy --only hosting:globe       # builds globe/ and deploys

Keys: Space pause · R replay ⇄ live · ← / → one hour · H hide HUD · F fullscreen. Drag to rotate, hover an arc for details.

`globe/` reuses `web/src` (data, cycle, HUD) through the `@web/*` alias; the tunnel build in `web/` is unchanged
(`firebase deploy --only hosting:tunnel`). Earth imagery: NASA Earth Observatory (see `NOTICE`).
```

- [ ] **Step 7: Commit**

```bash
git add firebase.json .firebaserc README.md
git commit -m "feat(globe): host the globe on its own Firebase Hosting site"
```

---

## Outcome notes (filled in during execution)

- Task 3: record `airports` count, `ends` distribution and `withGaps` from the live `day.json`.
- Task 11/12: record the tuning constants changed during the visual checks and the measured FPS.
- Task 13: record the final hosting URL and the old-site asset names (unchanged).

## Hand-off to Plan 4 (FOLLOW camera, telemetry panel, automatic tour)

- `GlobeEngine.pick` + `GlobeFlight`/`headState` already identify the clicked flight; add click-vs-drag detection (≥ 5 px or ≥ 250 ms = drag) in `App.tsx`.
- `buildArcBuffers` exposes `info[kind]`; FOLLOW needs per-flight 3D tangents: build them from `resampleRun` points with a Catmull-Rom on `Vec3` and a time parameter.
- `GLOBE_CYCLE`, `liveCur` and the `mode` field are the integration points for the tour (`T` key) and catch-up playback.
- Keep the Plan 3 honesty rules: planned/gap parts are labelled `PROJECTED` / `NO DATA`, extrapolated heads `EXTRAPOLATED`, speeds/headings are 2-minute averages.
