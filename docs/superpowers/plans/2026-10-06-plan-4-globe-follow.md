# Plan 4 — Globe Phase B (FOLLOW camera, telemetry, auto-tour) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a flight makes the camera fly along its arc in real time with correct altitude / speed / heading / vertical-speed / distance values in a telemetry panel; LIVE mode runs an automatic tour of airborne flights; the deferred Plan 3 polish items are closed.

**Architecture:** Pure modules first (telemetry, camera math, follow clock, tour logic, HUD formatting) so every number is unit-tested; then the engine gains a camera state machine (`GLOBE → TO_FOLLOW → FOLLOW → TO_GLOBE`) driven by a per-frame `follow` input; the controller owns the follow clock, tour and click handling and publishes a `follow` block in the HUD snapshot; React renders `FlightPanel`. All follow-related time is "flight time" `u` (seconds relative to `window.from`), which is also the displayed time `cur`, so Earth rotation, terminator, arcs and HUD clock stay in sync (spec §6.3).

**Tech Stack:** TypeScript, Three.js ~0.186, React, Vitest (+ jsdom for HUD tests), Vite; reuses `@web/*` (cycle machine, snapshot, formatters) and `@collector/*` (geo helpers).

Spec: `docs/superpowers/specs/2026-10-06-thy-globe-design.md` §6.1–6.3, §7, §8 (this plan is "Aşama B"). Prior plan: `docs/superpowers/plans/2026-10-06-plan-3-globe-phase-a.md` (merged). All work is in `globe/` unless stated.

## Global Constraints

- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Time contract (unchanged): `cur`/`u` are seconds relative to `window.from`; engine public API takes epoch seconds only for `nowSec`; float32 GPU values use seconds-since-engine-start (never epoch).
- Earth-fixed unit sphere: `latLonToVec3(lat, lon, radius)`; scene altitude radius `altitudeRadius(alt100)` (ALT_EXAG 30) + `ARC_BASE_LIFT` (0.002). `earthGroup.rotation.y = earthRotationRad(absTime)`; camera and sun live in the inertial frame.
- FOLLOW camera: position `P(u) − tangent·0.35 + up·0.12`, `up` = local surface normal, target = point ahead on the tangent (`P + tangent·0.25`); position/target smooth-damped (0.6 s) in Earth-fixed space; transitions 2.5 s ease-in-out (×2 = 5 s with `prefers-reduced-motion`); camera radius never below 1.05.
- FOLLOW playback: default ×240, duration `clamp(span/240, 25 s, 240 s)` so speed = `span / duration`; `[` `]` step the ladder 60·120·240·480·960; `←` `→` ±5 min of flight time; `Space` pauses; `Esc`/`G`/blank click exit; `T` toggles the tour. Airborne flights reaching their last sample continue at ×1 up to `EXTRAPOLATE_MAX_SEC` (300 s) beyond it ("LIVE HEAD · EXTRAPOLATED"). Landed / last-contact flights stop at their end.
- Click vs drag: pointer moved `< 5 px` AND `< 250 ms` between down and up = click, otherwise drag.
- Tour (LIVE only): GLOBE 25 s → pick an airborne flight (≥ 4 samples, last sample within 300 s of `cur`, prefers long routes, never one of the last 3) → FOLLOW catch-up → stay ≈ 20 s at the live head (or 6 s after an ended flight) → GLOBE. Any input pauses the tour; it resumes after the cycle's 20 s `holdSec`. Tour is on by default.
- Honesty rules (spec §7): GS/HDG/VS are 2-minute averages (stated in the panel note); values inside coverage gaps are `NO DATA` (shown as `—`); extrapolated head is `EXTRAPOLATED`; distance/ETA that include planned or extrapolated parts carry `EST`; `LAST_CONTACT` flights show no ETA. Nothing is invented. HUD text is English upper-case with the TK fonts; attribution/credit lines stay visible when the HUD is hidden.
- Tracks with fewer than 2 samples cannot be followed: show the notice `TRACK TOO SHORT`.
- Never commit fonts, credentials or `.claude/`. Do not touch `web/` (the tunnel site).
- Test hygiene: pure modules get Vitest tests with hand-checkable numbers; no test may assert nothing; silence `console.warn` expected by a test with a spy.

## File Structure

| File | Responsibility |
|---|---|
| `globe/src/geo3d/telemetry.ts` (new) | `profileOf`, `telemetryAt`: pure per-flight telemetry at flight time `u` |
| `globe/src/camera/follow-rig.ts` (new) | vector helpers, `smoothDamp`, camera state machine, `blendPose` |
| `globe/src/camera/follow-pose.ts` (new) | `chaseFor`: chase pose from a position function |
| `globe/src/model/follow-clock.ts` (new) | follow playback clock (speed derivation, ladder, live head, scrub) |
| `globe/src/model/tour.ts` (new) | tour flight selection and tour state machine |
| `globe/src/app/follow-hud.ts` (new) | `FollowHud` view model + formatting |
| `globe/src/app/click.ts` (new) | `isClick` |
| `globe/src/app/keys.ts` (mod) | + `exitFollow`, `toggleTour`, `slower`, `faster` |
| `globe/src/scene/engine.ts` (mod) | camera integration, `camMode()`, `setAfterRender()`, drag-release fix |
| `globe/src/app/controller.ts` (mod) | follow + tour state, `onClick`, notices, HUD fields |
| `globe/src/app/hud-model.ts` (mod) | snapshot fields, `hoverNote` |
| `globe/src/hud/GlobeHud.tsx`, `globe/src/styles.css` (mod) | `FlightPanel`, mode line, CSS |
| `globe/src/App.tsx` (mod) | click-vs-drag, monotonic texture progress |
| `README.md` (mod) | keys |

Tests: `globe/test/{telemetry,follow-rig,follow-pose,follow-clock,tour,follow-hud,click}.test.ts` (new), `globe/test/{keys,controller,hud,scene-materials,picking3d,arcs}.test.ts(x)` (extended).

Existing helpers you will use: `globe/test/helpers.ts` (`FROM`, `AIRPORTS`, `flight`, `makeDay`), `buildGlobeModel` (`globe/src/model/globe-model.ts`; `GlobeFlight` has `status`, `gaps` (relative seconds), `lastT`, `trk?`, `gs?`, `planned?`, `t/alt/lat/lon` arrays relative to `window.from`, `dep`, `end`), `headState` (`model/dead-reckon.ts`), `sampleAt` (`@web/data/mapping`), `haversineKm`/`initialBearing` (`@collector/geo`), `fmtFL`/`fmtInt`/`fmtElapsed`/`fmtUtc` (`@web/lib/format`).

---

### Task 1: Telemetry (pure)

**Files:**
- Create: `globe/src/geo3d/telemetry.ts`
- Test: `globe/test/telemetry.test.ts`

**Interfaces:**
- Consumes: `GlobeFlight`, `headState`, `EXTRAPOLATE_MAX_SEC`, `sampleAt`, `haversineKm`, `initialBearing`, `BREAK_SEC` (from `../scene/arcs`).
- Produces:
  - `type DataSource = "OBSERVED" | "NO DATA" | "EXTRAPOLATED"`, `type FlightPhase = "CLIMB" | "CRUISE" | "DESCENT" | "—"`.
  - `interface Telemetry { lat: number; lon: number; alt100: number; altFt: number; gsKt: number | null; hdgDeg: number | null; vsFpm: number | null; phase: FlightPhase; source: DataSource; holding: boolean; distKm: number; totalKm: number | null; distEstimated: boolean; elapsedSec: number; remainingSec: number | null; etaEstimated: boolean; utcSec: number; localSolarHours: number }`.
  - `buildProfile(f: GlobeFlight): FlightProfile`, `profileOf(f: GlobeFlight): FlightProfile` (WeakMap cached), `telemetryAt(f: GlobeFlight, u: number, fromAbs: number): Telemetry | null` (null when the flight has fewer than 2 samples). `fromAbs` = `model.from` (unix s); `u` is relative to it.

- [ ] **Step 1: Write the failing tests** — `globe/test/telemetry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { haversineKm } from "@collector/geo";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import { profileOf, telemetryAt } from "../src/geo3d/telemetry";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];

// 10-minute samples along the equator, 1° (111.195 km) apart; altitude 10 000 → 20 000 → 30 000 → 30 000 ft.
const landed = () =>
  one({
    dep: FROM, arr: FROM + 1800, end: "LANDED",
    s: [[0, 100, 0, 0], [600, 200, 0, 1], [1200, 300, 0, 2], [1800, 300, 0, 3]],
  });
const km1 = haversineKm(0, 0, 0, 1);
const KT = 1.852;

describe("telemetryAt", () => {
  it("is null for a single-sample track", () => {
    expect(telemetryAt(one({ s: [[0, 300, 0, 0]] }), 0, FROM)).toBeNull();
  });

  it("reports mid-segment values exactly (segment-average speed, bearing, vertical speed)", () => {
    const t = telemetryAt(landed(), 300, FROM)!;
    expect(t.source).toBe("OBSERVED");
    expect(t.gsKt).toBeCloseTo(km1 / (600 / 3600) / KT, 6);
    expect(t.hdgDeg).toBeCloseTo(90, 6);
    expect(t.vsFpm).toBeCloseTo(1000, 6); // +10 000 ft in 10 min
    expect(t.phase).toBe("CLIMB");
    expect(t.alt100).toBeCloseTo(150, 6);
    expect(t.altFt).toBeCloseTo(15000, 4);
    expect(t.lon).toBeCloseTo(0.5, 6);
  });

  it("classifies CRUISE and DESCENT", () => {
    expect(telemetryAt(landed(), 1500, FROM)!.phase).toBe("CRUISE"); // level segment
    const d = one({
      dep: FROM, arr: FROM + 1800, end: "LANDED",
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 200, 0, 2], [1800, 100, 0, 3]],
    });
    expect(telemetryAt(d, 1500, FROM)!.phase).toBe("DESCENT");
  });

  it("blends neighbouring segment values between segment midpoints", () => {
    // midpoints 300 (vs +1000) and 900 (vs +1000), then 1500 (vs 0): halfway between 900 and 1500 → +500
    expect(telemetryAt(landed(), 1200, FROM)!.vsFpm).toBeCloseTo(500, 6);
  });

  it("counts distance along the track; LANDED total is the observed track", () => {
    const t = telemetryAt(landed(), 600, FROM)!;
    expect(t.distKm).toBeCloseTo(km1, 6);
    expect(t.totalKm).toBeCloseTo(3 * km1, 6);
    expect(t.distEstimated).toBe(false);
  });

  it("elapsed, remaining (LANDED: end − u) and local solar time", () => {
    const f = landed();
    const t = telemetryAt(f, 900, FROM)!;
    expect(t.elapsedSec).toBe(900);
    expect(t.remainingSec).toBe(f.end - 900);
    expect(t.etaEstimated).toBe(false);
    expect(t.utcSec).toBe(FROM + 900);
    // FROM is 08:00 UTC; +15 min = 08.25 h; longitude 1.5° east adds 0.1 h
    expect(t.localSolarHours).toBeCloseTo(8.35, 3);
  });

  it("marks coverage gaps as NO DATA with no speed, heading or vertical speed", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE", gaps: [[600, 1200]],
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2], [1320, 300, 0, 2.2]],
      now: { gs: 480, trk: 90 },
    });
    const g = telemetryAt(f, 900, FROM)!;
    expect(g.source).toBe("NO DATA");
    expect(g.gsKt).toBeNull();
    expect(g.hdgDeg).toBeNull();
    expect(g.vsFpm).toBeNull();
    expect(g.phase).toBe("—");
    expect(g.distEstimated).toBe(true);
    expect(telemetryAt(f, 300, FROM)!.source).toBe("OBSERVED");
  });

  it("an airborne flight past its last sample is EXTRAPOLATED with the live speed and track, then holds", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE",
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]],
      now: { gs: 480, trk: 90 },
    });
    const t = telemetryAt(f, 1260, FROM)!;
    expect(t.source).toBe("EXTRAPOLATED");
    expect(t.holding).toBe(false);
    expect(t.gsKt).toBe(480);
    expect(t.hdgDeg).toBe(90);
    expect(t.vsFpm).toBeNull();
    expect(t.phase).toBe("—");
    expect(t.lon).toBeGreaterThan(2);
    expect(t.distKm).toBeGreaterThan(2 * km1);
    expect(t.distEstimated).toBe(true);
    expect(t.remainingSec).toBeNull(); // no planned route → no ETA
    expect(t.totalKm).toBeNull();
    const h = telemetryAt(f, 1200 + 400, FROM)!;
    expect(h.holding).toBe(true);
    expect(h.lon).toBeCloseTo(telemetryAt(f, 1200 + 300, FROM)!.lon, 9); // head stops at the extrapolation limit
  });

  it("LAST_CONTACT shows no ETA; airborne with a planned route shows an estimated ETA", () => {
    const lc = one({ dep: FROM, arr: FROM + 1200, end: "LAST_CONTACT", s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]] });
    expect(telemetryAt(lc, 600, FROM)!.remainingSec).toBeNull();
    const air = one({
      dep: FROM, arr: null, end: "AIRBORNE", from: "IST", to: "JFK",
      s: [[0, 300, 41, 29], [600, 370, 45, 20], [1200, 370, 50, 10]],
    });
    const t = telemetryAt(air, 1200, FROM)!;
    expect(t.etaEstimated).toBe(true);
    expect(t.remainingSec!).toBeGreaterThan(0);
    expect(t.totalKm!).toBeGreaterThan(t.distKm);
  });

  it("caches the profile per flight", () => {
    const f = landed();
    expect(profileOf(f)).toBe(profileOf(f));
    expect(profileOf(f).segs).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd globe && npx vitest run test/telemetry.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `globe/src/geo3d/telemetry.ts`:

```ts
import { haversineKm, initialBearing } from "@collector/geo";
import { sampleAt } from "@web/data/mapping";
import { EXTRAPOLATE_MAX_SEC, headState } from "../model/dead-reckon";
import type { GlobeFlight } from "../model/globe-model";
import { BREAK_SEC } from "../scene/arcs";

const KT = 1.852; // km/h per knot

export type DataSource = "OBSERVED" | "NO DATA" | "EXTRAPOLATED";
export type FlightPhase = "CLIMB" | "CRUISE" | "DESCENT" | "—";

export interface Telemetry {
  lat: number;
  lon: number;
  alt100: number;
  altFt: number;
  gsKt: number | null;
  hdgDeg: number | null;
  vsFpm: number | null;
  phase: FlightPhase;
  source: DataSource;
  /** extrapolation limit reached: the head no longer moves (LAST CONTACT) */
  holding: boolean;
  distKm: number;
  totalKm: number | null;
  distEstimated: boolean;
  elapsedSec: number;
  remainingSec: number | null;
  etaEstimated: boolean;
  utcSec: number;
  localSolarHours: number;
}

interface Seg {
  t0: number;
  t1: number;
  mid: number;
  km: number;
  gsKt: number | null;
  hdg: number | null;
  vsFpm: number | null;
  noData: boolean;
}

export interface FlightProfile {
  segs: Seg[];
  cumKm: number[];
  cumEst: boolean[];
  maxAlt100: number;
}

export function buildProfile(f: GlobeFlight): FlightProfile {
  const n = f.t.length;
  const segs: Seg[] = [];
  const cumKm = [0];
  const cumEst = [false];
  for (let i = 0; i < n - 1; i++) {
    const t0 = f.t[i];
    const t1 = f.t[i + 1];
    const dt = t1 - t0;
    const km = haversineKm(f.lat[i], f.lon[i], f.lat[i + 1], f.lon[i + 1]);
    const noData = dt > BREAK_SEC || f.gaps.some(([gs, ge]) => gs < t1 && ge > t0);
    const ok = !noData && dt > 0;
    segs.push({
      t0,
      t1,
      mid: (t0 + t1) / 2,
      km,
      gsKt: ok ? km / (dt / 3600) / KT : null,
      hdg: ok && km > 0 ? initialBearing(f.lat[i], f.lon[i], f.lat[i + 1], f.lon[i + 1]) : null,
      vsFpm: ok ? ((f.alt[i + 1] - f.alt[i]) * 100) / (dt / 60) : null,
      noData,
    });
    cumKm.push(cumKm[i] + km);
    cumEst.push(cumEst[i] || noData);
  }
  let maxAlt100 = 0;
  for (const a of f.alt) maxAlt100 = Math.max(maxAlt100, a);
  return { segs, cumKm, cumEst, maxAlt100 };
}

const cache = new WeakMap<GlobeFlight, FlightProfile>();
export function profileOf(f: GlobeFlight): FlightProfile {
  let p = cache.get(f);
  if (!p) {
    p = buildProfile(f);
    cache.set(f, p);
  }
  return p;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => (a + (((b - a + 540) % 360) - 180) * k + 360) % 360;

/** Value of segment `i`, blended linearly toward the neighbouring segment's value between segment midpoints. */
function smoothed(
  segs: Seg[],
  i: number,
  u: number,
  pick: (s: Seg) => number | null,
  mix: (a: number, b: number, k: number) => number,
): number | null {
  const cur = pick(segs[i]);
  if (cur === null) return null;
  const o = segs[u < segs[i].mid ? i - 1 : i + 1];
  const ov = o ? pick(o) : null;
  if (!o || ov === null) return cur;
  const k = (u - o.mid) / (segs[i].mid - o.mid);
  return mix(ov, cur, Math.min(1, Math.max(0, k)));
}

const phaseOf = (vs: number | null, alt100: number, max100: number): FlightPhase => {
  if (vs === null) return "—";
  if (vs > 300 && alt100 < 0.9 * max100) return "CLIMB";
  if (vs < -300) return "DESCENT";
  return "CRUISE";
};

export function telemetryAt(f: GlobeFlight, u: number, fromAbs: number): Telemetry | null {
  const n = f.t.length;
  if (n < 2) return null;
  const p = profileOf(f);
  const airborne = f.status === "AIRBORNE";
  const extrap = airborne && u > f.lastT;
  const uu = Math.min(Math.max(u, f.t[0]), f.lastT);
  const s = sampleAt(f, uu)!;
  const i = Math.min(s.i, n - 2);
  const seg = p.segs[i];
  const k = seg.t1 > seg.t0 ? (uu - seg.t0) / (seg.t1 - seg.t0) : 0;

  let lat = s.lat;
  let lon = s.lon;
  let alt100 = s.alt;
  let gsKt = smoothed(p.segs, i, uu, (x) => x.gsKt, lerp);
  let hdgDeg = smoothed(p.segs, i, uu, (x) => x.hdg, lerpAngle);
  let vsFpm = smoothed(p.segs, i, uu, (x) => x.vsFpm, lerp);
  let source: DataSource = seg.noData ? "NO DATA" : "OBSERVED";
  let holding = false;
  let distKm = p.cumKm[i] + seg.km * k;
  let distEstimated = p.cumEst[i] || seg.noData;

  if (extrap) {
    const h = headState(f, Math.min(u, f.lastT + EXTRAPOLATE_MAX_SEC));
    holding = u > f.lastT + EXTRAPOLATE_MAX_SEC;
    const lastSeg = [...p.segs].reverse().find((x) => x.gsKt !== null);
    if (h) {
      lat = h.lat;
      lon = h.lon;
      alt100 = h.alt100;
      distKm = p.cumKm[n - 1] + haversineKm(f.lat[n - 1], f.lon[n - 1], h.lat, h.lon);
    }
    gsKt = f.gs !== undefined && f.gs > 0 ? f.gs : (lastSeg?.gsKt ?? null);
    hdgDeg = f.trk ?? lastSeg?.hdg ?? null;
    vsFpm = null;
    source = "EXTRAPOLATED";
    distEstimated = true;
  }

  // total distance
  let totalKm: number | null;
  let totalEst = false;
  if (f.status === "LANDED") {
    totalKm = p.cumKm[n - 1];
    totalEst = p.cumEst[n - 1];
  } else if (f.planned) {
    totalKm = p.cumKm[n - 1] + haversineKm(f.lat[n - 1], f.lon[n - 1], f.planned.toLat, f.planned.toLon);
    totalEst = true;
  } else {
    totalKm = null;
  }
  if (totalEst) distEstimated = distEstimated || false; // total carries EST on its own via the shared flag below
  if (totalEst) distEstimated = true;

  // remaining time
  let remainingSec: number | null = null;
  let etaEstimated = false;
  if (f.status === "LANDED") {
    remainingSec = Math.max(0, f.end - u);
  } else if (airborne && totalKm !== null) {
    const recent = p.segs.filter((x) => x.gsKt !== null).slice(-3);
    const avg = recent.length ? recent.reduce((a, x) => a + (x.gsKt as number), 0) / recent.length : 0;
    if (avg > 0) {
      remainingSec = (Math.max(0, totalKm - distKm) / (avg * KT)) * 3600;
      etaEstimated = true;
    }
  }

  const utcSec = fromAbs + u;
  return {
    lat,
    lon,
    alt100,
    altFt: alt100 * 100,
    gsKt,
    hdgDeg,
    vsFpm,
    phase: source === "OBSERVED" ? phaseOf(vsFpm, alt100, p.maxAlt100) : "—",
    source,
    holding,
    distKm,
    totalKm,
    distEstimated,
    elapsedSec: Math.max(0, u - f.dep),
    remainingSec,
    etaEstimated,
    utcSec,
    localSolarHours: ((((utcSec / 3600 + lon / 15) % 24) + 24) % 24),
  };
}
```

Then remove the two redundant `totalEst`/`distEstimated` lines exactly as follows (they are a leftover; keep only the single clean statement): replace

```ts
  if (totalEst) distEstimated = distEstimated || false; // total carries EST on its own via the shared flag below
  if (totalEst) distEstimated = true;
```
with
```ts
  if (totalEst) distEstimated = true; // DIST shows "x / total": any estimated part marks the whole readout EST
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/telemetry.test.ts` and `npx tsc --noEmit` → PASS. If the LANDED flight's `distEstimated` assertion in "counts distance" fails because `cumEst` is false, that is correct (no gaps); do not weaken it.

- [ ] **Step 5: Commit**

```bash
git add globe/src/geo3d/telemetry.ts globe/test/telemetry.test.ts
git commit -m "feat(globe): pure flight telemetry (ALT/GS/HDG/VS/phase/distance/ETA with NO DATA and EXTRAPOLATED)"
```

---

### Task 2: Camera math — damping, camera state machine, blend, chase pose

**Files:**
- Create: `globe/src/camera/follow-rig.ts`, `globe/src/camera/follow-pose.ts`
- Test: `globe/test/follow-rig.test.ts`, `globe/test/follow-pose.test.ts`

**Interfaces:**
- Consumes: `Vec3` (`../geo3d/vec`).
- Produces:
  - `follow-rig.ts`: `TRANSITION_SEC = 2.5`, `MIN_RADIUS = 1.05`, `CHASE_BACK = 0.35`, `CHASE_UP = 0.12`, `LOOK_AHEAD = 0.25`, `SMOOTH_SEC = 0.6`; `add, sub, scale, dot, cross, len, norm(v: Vec3): Vec3` helpers; `smoothDamp(cur, target, vel, smoothTime, dt): [number, number]`; `interface Damped { p: Vec3; v: Vec3 }`, `smoothDampVec(s: Damped, target: Vec3, smoothTime: number, dt: number): Damped`; `type CamMode = "GLOBE" | "TO_FOLLOW" | "FOLLOW" | "TO_GLOBE"`, `interface CamState { mode: CamMode; k: number }`, `initCam(): CamState`, `stepCam(s: CamState, dt: number, wantFollow: boolean, speedScale?: number): CamState`, `easeInOut(x: number): number`, `followWeight(s: CamState): number`; `interface Pose { pos: Vec3; target: Vec3; up: Vec3 }`, `blendPose(a: Pose, b: Pose, w: number): Pose`.
  - `follow-pose.ts`: `chaseFor(posAt: (u: number) => Vec3 | null, u: number): Pose | null`.

- [ ] **Step 1: Failing tests** — `globe/test/follow-rig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MIN_RADIUS, TRANSITION_SEC, blendPose, easeInOut, followWeight, initCam, len, norm, smoothDamp, smoothDampVec,
  stepCam, type Pose,
} from "../src/camera/follow-rig";

describe("smoothDamp", () => {
  it("converges to the target without overshoot from rest", () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 300; i++) {
      [x, v] = smoothDamp(x, 1, v, 0.5, 1 / 60);
      expect(x).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(x).toBeCloseTo(1, 4);
  });

  it("vector form tracks a target", () => {
    let s = { p: [0, 0, 0] as [number, number, number], v: [0, 0, 0] as [number, number, number] };
    for (let i = 0; i < 300; i++) s = smoothDampVec(s, [1, -2, 3], 0.5, 1 / 60);
    expect(s.p[0]).toBeCloseTo(1, 4);
    expect(s.p[1]).toBeCloseTo(-2, 4);
    expect(s.p[2]).toBeCloseTo(3, 4);
  });
});

describe("camera state machine", () => {
  it("GLOBE → TO_FOLLOW → FOLLOW over TRANSITION_SEC", () => {
    expect(TRANSITION_SEC).toBe(2.5);
    let s = initCam();
    expect(s.mode).toBe("GLOBE");
    s = stepCam(s, 0.016, true);
    expect(s.mode).toBe("TO_FOLLOW");
    s = stepCam({ mode: "TO_FOLLOW", k: 0 }, 1.25, true);
    expect(s).toEqual({ mode: "TO_FOLLOW", k: 0.5 });
    s = stepCam(s, 1.25, true);
    expect(s).toEqual({ mode: "FOLLOW", k: 1 });
    expect(stepCam(s, 1, true)).toEqual(s);
  });

  it("leaving FOLLOW goes TO_GLOBE and ends in GLOBE", () => {
    let s = stepCam({ mode: "FOLLOW", k: 1 }, 0.016, false);
    expect(s.mode).toBe("TO_GLOBE");
    s = stepCam({ mode: "TO_GLOBE", k: 1 }, 2.5, false);
    expect(s).toEqual({ mode: "GLOBE", k: 0 });
  });

  it("can reverse a transition midway without a jump", () => {
    const mid = stepCam({ mode: "TO_FOLLOW", k: 0 }, 1.25, true); // k = 0.5
    const back = stepCam(mid, 0, false);
    expect(back).toEqual({ mode: "TO_GLOBE", k: 0.5 });
    expect(stepCam(back, 0, true)).toEqual({ mode: "TO_FOLLOW", k: 0.5 });
  });

  it("reduced motion halves the speed (×2 duration)", () => {
    expect(stepCam({ mode: "TO_FOLLOW", k: 0 }, 2.5, true, 0.5).k).toBeCloseTo(0.5, 9);
  });

  it("easing and weight", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(followWeight({ mode: "FOLLOW", k: 1 })).toBe(1);
    expect(followWeight({ mode: "GLOBE", k: 0 })).toBe(0);
  });
});

describe("blendPose", () => {
  const a: Pose = { pos: [0, 0, 3.2], target: [0, 0, 0], up: [0, 1, 0] };
  const b: Pose = { pos: [1.2, 0.3, 0.5], target: [1, 0, 0], up: [1, 0, 0] };

  it("returns the endpoints at w = 0 and w = 1", () => {
    const p0 = blendPose(a, b, 0);
    const p1 = blendPose(a, b, 1);
    p0.pos.forEach((x, i) => expect(x).toBeCloseTo(a.pos[i], 9));
    p1.pos.forEach((x, i) => expect(x).toBeCloseTo(b.pos[i], 9));
    p1.target.forEach((x, i) => expect(x).toBeCloseTo(b.target[i], 9));
    expect(len(p0.up)).toBeCloseTo(1, 9);
  });

  it("never lets the camera inside the Earth, even between antipodal poses", () => {
    const x: Pose = { pos: [0, 0, 1.0], target: [0, 0, 0], up: [0, 1, 0] };
    const y: Pose = { pos: [0, 0, -1.0], target: [0, 0, 0], up: [0, 1, 0] };
    for (const w of [0.25, 0.5, 0.75]) {
      const p = blendPose(x, y, w);
      expect(Number.isFinite(p.pos[0] + p.pos[1] + p.pos[2])).toBe(true);
      expect(len(p.pos)).toBeGreaterThanOrEqual(MIN_RADIUS - 1e-9);
    }
  });

  it("norm of a zero vector is finite", () => {
    expect(norm([0, 0, 0]).every(Number.isFinite)).toBe(true);
  });
});
```

`globe/test/follow-pose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chaseFor } from "../src/camera/follow-pose";
import { latLonToVec3, type Vec3 } from "../src/geo3d/vec";

// a flight along the equator at radius 1, moving east 1° per 100 s
const posAt = (u: number): Vec3 => latLonToVec3(0, u / 100, 1);

describe("chaseFor", () => {
  it("sits behind and above the head and looks ahead along the track", () => {
    const p = chaseFor(posAt, 0)!;
    expect(p.pos[0]).toBeCloseTo(-0.35, 6); // 0.35 behind (west)
    expect(p.pos[2]).toBeCloseTo(1.12, 6); // 0.12 above the surface
    expect(p.target[0]).toBeCloseTo(0.25, 6); // 0.25 ahead (east)
    expect(p.target[2]).toBeCloseTo(1, 6);
    expect(p.up).toEqual([0, 0, 1].map((x) => expect.closeTo(x, 6)) as unknown as [number, number, number]);
  });

  it("is null when the track is unavailable or has no direction", () => {
    expect(chaseFor(() => null, 0)).toBeNull();
    expect(chaseFor(() => [0, 0, 1], 0)).toBeNull();
  });
});
```

(`expect.closeTo` inside `toEqual` is valid in Vitest; if your version rejects the cast, assert the three components of `p.up` with `toBeCloseTo` instead.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/follow-rig.test.ts test/follow-pose.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `globe/src/camera/follow-rig.ts`:

```ts
import type { Vec3 } from "../geo3d/vec";

export const TRANSITION_SEC = 2.5;
export const MIN_RADIUS = 1.05;
export const CHASE_BACK = 0.35;
export const CHASE_UP = 0.12;
export const LOOK_AHEAD = 0.25;
export const SMOOTH_SEC = 0.6;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-12 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

/** Critically damped spring (Unity-style SmoothDamp). Returns [value, velocity]. */
export function smoothDamp(cur: number, target: number, vel: number, smoothTime: number, dt: number): [number, number] {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * e, (vel - omega * temp) * e];
}

export interface Damped {
  p: Vec3;
  v: Vec3;
}

export function smoothDampVec(s: Damped, target: Vec3, smoothTime: number, dt: number): Damped {
  const p: Vec3 = [0, 0, 0];
  const v: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) [p[i], v[i]] = smoothDamp(s.p[i], target[i], s.v[i], smoothTime, dt);
  return { p, v };
}

export type CamMode = "GLOBE" | "TO_FOLLOW" | "FOLLOW" | "TO_GLOBE";
/** `k` is the follow weight progress 0..1 (0 = globe camera, 1 = chase camera). */
export interface CamState {
  mode: CamMode;
  k: number;
}

export const initCam = (): CamState => ({ mode: "GLOBE", k: 0 });

export function stepCam(s: CamState, dt: number, wantFollow: boolean, speedScale = 1): CamState {
  const dk = dt / (TRANSITION_SEC / speedScale);
  switch (s.mode) {
    case "GLOBE":
      return wantFollow ? { mode: "TO_FOLLOW", k: 0 } : s;
    case "TO_FOLLOW": {
      if (!wantFollow) return { mode: "TO_GLOBE", k: s.k };
      const k = s.k + dk;
      return k >= 1 ? { mode: "FOLLOW", k: 1 } : { mode: "TO_FOLLOW", k };
    }
    case "FOLLOW":
      return wantFollow ? s : { mode: "TO_GLOBE", k: 1 };
    case "TO_GLOBE": {
      if (wantFollow) return { mode: "TO_FOLLOW", k: s.k };
      const k = s.k - dk;
      return k <= 0 ? { mode: "GLOBE", k: 0 } : { mode: "TO_GLOBE", k };
    }
  }
}

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const followWeight = (s: CamState) => easeInOut(Math.min(1, Math.max(0, s.k)));

export interface Pose {
  pos: Vec3;
  target: Vec3;
  up: Vec3;
}

function slerpDir(a: Vec3, b: Vec3, w: number): Vec3 {
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  const ang = Math.acos(d);
  const s = Math.sin(ang);
  if (s < 1e-6) {
    if (d > 0) return a;
    // antipodal: rotate about any axis perpendicular to `a`
    const axis = norm(Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]));
    const th = Math.PI * w;
    return add(scale(a, Math.cos(th)), scale(cross(axis, a), Math.sin(th)));
  }
  return add(scale(a, Math.sin((1 - w) * ang) / s), scale(b, Math.sin(w * ang) / s));
}

/** Camera pose between a (w = 0) and b (w = 1): great-circle position blend, radius never below MIN_RADIUS. */
export function blendPose(a: Pose, b: Pose, w: number): Pose {
  const dir = norm(slerpDir(norm(a.pos), norm(b.pos), w));
  const r = Math.max(MIN_RADIUS, len(a.pos) + (len(b.pos) - len(a.pos)) * w);
  return {
    pos: scale(dir, r),
    target: add(scale(a.target, 1 - w), scale(b.target, w)),
    up: norm(add(scale(a.up, 1 - w), scale(b.up, w))),
  };
}
```

`globe/src/camera/follow-pose.ts`:

```ts
import type { Vec3 } from "../geo3d/vec";
import { CHASE_BACK, CHASE_UP, LOOK_AHEAD, add, dot, len, norm, scale, sub, type Pose } from "./follow-rig";

const TANGENT_DT = 45; // flight seconds either side

/** Chase-camera pose (Earth-fixed) for a flight position function; null when no direction is available. */
export function chaseFor(posAt: (u: number) => Vec3 | null, u: number): Pose | null {
  const p = posAt(u);
  const a = posAt(u - TANGENT_DT);
  const b = posAt(u + TANGENT_DT);
  if (!p || !a || !b) return null;
  const up = norm(p);
  let tan = sub(b, a);
  tan = sub(tan, scale(up, dot(tan, up)));
  if (len(tan) < 1e-9) return null;
  tan = norm(tan);
  return {
    pos: add(sub(p, scale(tan, CHASE_BACK)), scale(up, CHASE_UP)),
    target: add(p, scale(tan, LOOK_AHEAD)),
    up,
  };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/follow-rig.test.ts test/follow-pose.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add globe/src/camera/follow-rig.ts globe/src/camera/follow-pose.ts globe/test/follow-rig.test.ts globe/test/follow-pose.test.ts
git commit -m "feat(globe): chase-camera math (smooth damp, camera state machine, pose blend)"
```

---

### Task 3: Follow clock and tour logic (pure)

**Files:**
- Create: `globe/src/model/follow-clock.ts`, `globe/src/model/tour.ts`
- Test: `globe/test/follow-clock.test.ts`, `globe/test/tour.test.ts`

**Interfaces:**
- Consumes: `GlobeFlight`, `GlobeModel`, `EXTRAPOLATE_MAX_SEC`, `headState`.
- Produces:
  - `follow-clock.ts`: `LADDER = [60, 120, 240, 480, 960]`, `MIN_PLAYBACK_SEC = 25`, `MAX_PLAYBACK_SEC = 240`, `SCRUB_FOLLOW_SEC = 300`; `interface FollowClock { u: number; speed: number | null; paused: boolean }`; `endOf(f): number` (LANDED → `f.end`, otherwise `f.lastT`); `spanOf(f): number`; `derivedSpeed(f): number`; `effectiveSpeed(c, f): number`; `startClock(f): FollowClock`; `stepFollow(c, f, dt): FollowClock`; `atEnd(c, f): boolean`; `scrubFollow(c, f, delta): FollowClock`; `cycleSpeed(c, f, dir: 1 | -1): FollowClock`; `atLiveHead(c, f): boolean`.
  - `tour.ts`: `TOUR_GLOBE_SEC = 25`, `TOUR_LIVE_HOLD_SEC = 20`, `TOUR_END_HOLD_SEC = 6`, `TOUR_RECENT = 3`, `TOUR_MIN_SAMPLES = 4`; `interface TourState { enabled: boolean; phase: "GLOBE" | "FOLLOW"; t: number; recent: string[] }`; `initTour(enabled?: boolean): TourState`; `pickTourFlight(m: GlobeModel, cur: number, recent: string[], rand: () => number): number`; `type TourAction = { type: "none" } | { type: "follow"; index: number } | { type: "exit" }`; `interface TourCtx { following: boolean; followDone: boolean; manual: boolean; model: GlobeModel | null; cur: number; rand: () => number }`; `stepTour(s: TourState, dt: number, ctx: TourCtx): { s: TourState; a: TourAction }`.

- [ ] **Step 1: Failing tests** — `globe/test/follow-clock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import {
  LADDER, atEnd, atLiveHead, cycleSpeed, derivedSpeed, endOf, scrubFollow, startClock, stepFollow,
} from "../src/model/follow-clock";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];

// span 28 800 s (8 h) → 28 800 / 240 = 120 s of playback → exactly ×240
const long = (o: Partial<Parameters<typeof flight>[0]> = {}) =>
  one({
    dep: FROM, arr: null, end: "AIRBORNE",
    s: [[0, 300, 0, 0], [7200, 370, 0, 20], [14400, 370, 0, 40], [28800, 370, 0, 80]],
    ...o,
  });

describe("follow clock", () => {
  it("derives the playback speed from the flight length (25–240 s of playback)", () => {
    expect(derivedSpeed(long())).toBe(240);
    const short = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [3600, 300, 0, 10]] });
    expect(derivedSpeed(short)).toBe(3600 / 25); // 1 h flight is squeezed into 25 s
    const huge = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [80000, 300, 0, 100]] });
    expect(derivedSpeed(huge)).toBeCloseTo(80000 / 240, 9); // capped at 4 min of playback
  });

  it("starts at the first sample and advances at the derived speed", () => {
    const f = long();
    const c = startClock(f);
    expect(c).toEqual({ u: 0, speed: null, paused: false });
    expect(stepFollow(c, f, 1).u).toBe(240);
    expect(stepFollow({ ...c, paused: true }, f, 1).u).toBe(0);
  });

  it("an airborne flight stops at its last sample, then runs at ×1 up to the extrapolation limit", () => {
    const f = long();
    let c = stepFollow({ u: 28700, speed: null, paused: false }, f, 1);
    expect(c.u).toBe(28800); // clamped to lastT
    expect(atLiveHead(c, f)).toBe(true);
    c = stepFollow(c, f, 10);
    expect(c.u).toBe(28810); // ×1
    c = stepFollow(c, f, 1000);
    expect(c.u).toBe(28800 + 300);
    expect(atEnd(c, f)).toBe(true);
  });

  it("landed flights stop at the landing time; last-contact flights at the last sample", () => {
    const landed = long({ arr: FROM + 30000, end: "LANDED" });
    expect(endOf(landed)).toBe(30000);
    expect(stepFollow({ u: 29900, speed: 960, paused: false }, landed, 10).u).toBe(30000);
    const lc = long({ arr: FROM + 28800, end: "LAST_CONTACT" });
    expect(endOf(lc)).toBe(28800);
    expect(atEnd({ u: 28800, speed: null, paused: false }, lc)).toBe(true);
  });

  it("scrubs ±5 min within [first sample, end]", () => {
    const f = long();
    expect(scrubFollow({ u: 100, speed: null, paused: false }, f, -300).u).toBe(0);
    expect(scrubFollow({ u: 100, speed: null, paused: false }, f, 300).u).toBe(400);
    expect(scrubFollow({ u: 28700, speed: null, paused: false }, f, 9999).u).toBe(28800 + 300);
  });

  it("steps the speed ladder from the nearest rung and clamps at the ends", () => {
    expect(LADDER).toEqual([60, 120, 240, 480, 960]);
    const f = long();
    const c = startClock(f);
    expect(cycleSpeed(c, f, 1).speed).toBe(480);
    expect(cycleSpeed(c, f, -1).speed).toBe(120);
    expect(cycleSpeed({ ...c, speed: 960 }, f, 1).speed).toBe(960);
    expect(cycleSpeed({ ...c, speed: 60 }, f, -1).speed).toBe(60);
    const short = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [3600, 300, 0, 10]] }); // derived 144
    expect(cycleSpeed(startClock(short), short, 1).speed).toBe(240); // nearest rung 120 → next 240
  });
});
```

`globe/test/tour.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import {
  TOUR_GLOBE_SEC, TOUR_RECENT, initTour, pickTourFlight, stepTour, type TourCtx,
} from "../src/model/tour";
import { FROM, flight, makeDay } from "./helpers";

const track = (lon: number): [number, number, number, number][] => [
  [0, 300, 41, 29], [2000, 350, 42, lon], [4000, 370, 44, lon + 5], [6000, 370, 45, lon + 10],
];
const model = () =>
  buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "ESB", arr: null, end: "AIRBORNE", s: track(30) }), // ≈ 350 km
        flight({ from: "IST", to: "JFK", arr: null, end: "AIRBORNE", s: track(20) }), // ≈ 8 000 km
        flight({ from: "IST", to: "LHR", arr: null, end: "AIRBORNE", s: track(10) }), // ≈ 2 500 km
        flight({ from: "IST", to: "JFK", arr: FROM + 6000, end: "LANDED", s: track(5) }),
      ],
    }),
  );
const CUR = 6100; // 100 s after every last sample
const mid = () => 0.5;

describe("pickTourFlight", () => {
  it("prefers the longest airborne route", () => {
    const m = model();
    expect(pickTourFlight(m, CUR, [], mid)).toBe(1);
  });

  it("skips recent flights but falls back when nothing else qualifies", () => {
    const m = model();
    expect(pickTourFlight(m, CUR, [m.flights[1].id], mid)).toBe(2);
    expect(pickTourFlight(m, CUR, m.flights.map((f) => f.id), mid)).toBe(1);
  });

  it("ignores landed flights, short tracks and heads past the extrapolation limit", () => {
    const m = model();
    expect(pickTourFlight(m, 6000 + 1000, [], mid)).toBe(-1);
    const short = buildGlobeModel(makeDay({ flights: [flight({ arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [60, 300, 0, 1]] })] }));
    expect(pickTourFlight(short, 100, [], mid)).toBe(-1);
  });
});

describe("stepTour", () => {
  const ctx = (o: Partial<TourCtx> = {}): TourCtx => ({
    following: false, followDone: false, manual: false, model: model(), cur: CUR, rand: mid, ...o,
  });

  it("does nothing when disabled or while the user is interacting", () => {
    const s = initTour(false);
    expect(stepTour(s, 100, ctx())).toEqual({ s, a: { type: "none" } });
    const on = initTour(true);
    expect(stepTour(on, 100, ctx({ manual: true }))).toEqual({ s: on, a: { type: "none" } });
  });

  it("after the GLOBE phase it picks a flight and enters FOLLOW, remembering the last three", () => {
    let s = initTour(true);
    let r = stepTour(s, TOUR_GLOBE_SEC - 1, ctx());
    expect(r.a).toEqual({ type: "none" });
    r = stepTour(r.s, 2, ctx());
    expect(r.a).toEqual({ type: "follow", index: 1 });
    expect(r.s.phase).toBe("FOLLOW");
    expect(r.s.recent).toEqual([model().flights[1].id].map(() => expect.any(String)));
    s = r.s;
    for (let i = 0; i < 5; i++) s = { ...s, recent: [`x${i}`, ...s.recent].slice(0, TOUR_RECENT) };
    expect(s.recent).toHaveLength(TOUR_RECENT);
  });

  it("retries sooner when nothing qualifies", () => {
    const empty = buildGlobeModel(makeDay({ flights: [] }));
    const r = stepTour(initTour(true), TOUR_GLOBE_SEC + 1, ctx({ model: empty }));
    expect(r.a).toEqual({ type: "none" });
    expect(r.s.phase).toBe("GLOBE");
    expect(r.s.t).toBeLessThan(TOUR_GLOBE_SEC);
  });

  it("FOLLOW ends with an exit action when the follow is done, or silently when the user left", () => {
    const f = { ...initTour(true), phase: "FOLLOW" as const, t: 3 };
    expect(stepTour(f, 1, ctx({ following: true, followDone: true })).a).toEqual({ type: "exit" });
    const left = stepTour(f, 1, ctx({ following: false }));
    expect(left.a).toEqual({ type: "none" });
    expect(left.s.phase).toBe("GLOBE");
    expect(stepTour(f, 1, ctx({ following: true })).s.t).toBe(4);
  });

  it("adopts a follow the user started once input stops", () => {
    const r = stepTour(initTour(true), 1, ctx({ following: true }));
    expect(r.s.phase).toBe("FOLLOW");
    expect(r.a).toEqual({ type: "none" });
  });
});
```

(The `recent` assertion above uses `expect.any(String)` inside an array; if it fails to type-check, replace with `expect(r.s.recent).toEqual([m.flights[1].id])` using a local `const m = model()` — flight ids come from the helper's counter, so build the model once and reuse it for both the context and the assertion.)

- [ ] **Step 2: Run to verify failure** — FAIL (modules missing).

- [ ] **Step 3: Implement** — `globe/src/model/follow-clock.ts`:

```ts
import { EXTRAPOLATE_MAX_SEC } from "./dead-reckon";
import type { GlobeFlight } from "./globe-model";

export const LADDER = [60, 120, 240, 480, 960];
export const MIN_PLAYBACK_SEC = 25;
export const MAX_PLAYBACK_SEC = 240;
export const SCRUB_FOLLOW_SEC = 300;

export interface FollowClock {
  /** flight time, seconds relative to window.from */
  u: number;
  /** explicit speed multiplier, or null = derived from the flight length */
  speed: number | null;
  paused: boolean;
}

/** Landing time for landed flights, otherwise the last observed sample. */
export const endOf = (f: GlobeFlight): number => (f.status === "LANDED" ? f.end : f.lastT);
export const spanOf = (f: GlobeFlight): number => Math.max(1, endOf(f) - f.t[0]);

export function derivedSpeed(f: GlobeFlight): number {
  const span = spanOf(f);
  const playback = Math.min(MAX_PLAYBACK_SEC, Math.max(MIN_PLAYBACK_SEC, span / 240));
  return span / playback;
}

export const effectiveSpeed = (c: FollowClock, f: GlobeFlight): number => c.speed ?? derivedSpeed(f);
export const startClock = (f: GlobeFlight): FollowClock => ({ u: f.t[0], speed: null, paused: false });

const limitOf = (f: GlobeFlight) => (f.status === "AIRBORNE" ? f.lastT + EXTRAPOLATE_MAX_SEC : endOf(f));

export const atLiveHead = (c: FollowClock, f: GlobeFlight) => f.status === "AIRBORNE" && c.u >= f.lastT;
export const atEnd = (c: FollowClock, f: GlobeFlight) => c.u >= limitOf(f);

export function stepFollow(c: FollowClock, f: GlobeFlight, dt: number): FollowClock {
  if (c.paused) return c;
  if (atLiveHead(c, f)) return { ...c, u: Math.min(limitOf(f), c.u + dt) }; // real time at the live head
  let u = c.u + effectiveSpeed(c, f) * dt;
  u = f.status === "AIRBORNE" ? Math.min(u, f.lastT) : Math.min(u, endOf(f));
  return { ...c, u };
}

export function scrubFollow(c: FollowClock, f: GlobeFlight, delta: number): FollowClock {
  return { ...c, u: Math.min(limitOf(f), Math.max(f.t[0], c.u + delta)) };
}

export function cycleSpeed(c: FollowClock, f: GlobeFlight, dir: 1 | -1): FollowClock {
  const cur = effectiveSpeed(c, f);
  let idx = 0;
  for (let i = 1; i < LADDER.length; i++) if (Math.abs(LADDER[i] - cur) < Math.abs(LADDER[idx] - cur)) idx = i;
  const next = Math.min(LADDER.length - 1, Math.max(0, idx + dir));
  return { ...c, speed: LADDER[next] };
}
```

`globe/src/model/tour.ts`:

```ts
import { EXTRAPOLATE_MAX_SEC, headState } from "./dead-reckon";
import type { GlobeModel } from "./globe-model";

export const TOUR_GLOBE_SEC = 25;
export const TOUR_LIVE_HOLD_SEC = 20;
export const TOUR_END_HOLD_SEC = 6;
export const TOUR_RECENT = 3;
export const TOUR_MIN_SAMPLES = 4;

export interface TourState {
  enabled: boolean;
  phase: "GLOBE" | "FOLLOW";
  t: number;
  recent: string[];
}

export const initTour = (enabled = true): TourState => ({ enabled, phase: "GLOBE", t: 0, recent: [] });

/** Index of the airborne flight to follow next (long routes preferred, last three avoided), or -1. */
export function pickTourFlight(m: GlobeModel, cur: number, recent: string[], rand: () => number): number {
  const score = (i: number) => {
    const f = m.flights[i];
    const len = f.planned?.distKm ?? 0;
    return (len + 1) * (0.7 + 0.6 * rand());
  };
  const eligible: number[] = [];
  m.flights.forEach((f, i) => {
    if (f.status !== "AIRBORNE" || f.t.length < TOUR_MIN_SAMPLES) return;
    if (cur - f.lastT > EXTRAPOLATE_MAX_SEC || cur < f.t[0]) return;
    if (!headState(f, cur)) return;
    eligible.push(i);
  });
  const fresh = eligible.filter((i) => !recent.includes(m.flights[i].id));
  const pool = fresh.length ? fresh : eligible;
  let best = -1;
  let bestScore = -1;
  for (const i of pool) {
    const s = score(i);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

export type TourAction = { type: "none" } | { type: "follow"; index: number } | { type: "exit" };

export interface TourCtx {
  following: boolean;
  /** the current follow has run its course (live-head hold elapsed, or the flight ended and held) */
  followDone: boolean;
  /** the user is interacting (cycle.manual) */
  manual: boolean;
  model: GlobeModel | null;
  cur: number;
  rand: () => number;
}

const NONE: TourAction = { type: "none" };

export function stepTour(s: TourState, dt: number, ctx: TourCtx): { s: TourState; a: TourAction } {
  if (!s.enabled || ctx.manual) return { s, a: NONE };
  if (s.phase === "GLOBE") {
    if (ctx.following) return { s: { ...s, phase: "FOLLOW", t: 0 }, a: NONE };
    const t = s.t + dt;
    if (t < TOUR_GLOBE_SEC) return { s: { ...s, t }, a: NONE };
    const idx = ctx.model ? pickTourFlight(ctx.model, ctx.cur, s.recent, ctx.rand) : -1;
    if (idx < 0) return { s: { ...s, t: TOUR_GLOBE_SEC - 5 }, a: NONE };
    const recent = [ctx.model!.flights[idx].id, ...s.recent].slice(0, TOUR_RECENT);
    return { s: { ...s, phase: "FOLLOW", t: 0, recent }, a: { type: "follow", index: idx } };
  }
  if (!ctx.following) return { s: { ...s, phase: "GLOBE", t: 0 }, a: NONE };
  if (ctx.followDone) return { s: { ...s, phase: "GLOBE", t: 0 }, a: { type: "exit" } };
  return { s: { ...s, t: s.t + dt }, a: NONE };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/follow-clock.test.ts test/tour.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add globe/src/model/follow-clock.ts globe/src/model/tour.ts globe/test/follow-clock.test.ts globe/test/tour.test.ts
git commit -m "feat(globe): follow playback clock and auto-tour logic"
```

---

### Task 4: Engine — chase camera integration

**Files:**
- Modify: `globe/src/scene/engine.ts`

**Interfaces:**
- Consumes: Task 2 (`stepCam`, `initCam`, `followWeight`, `blendPose`, `smoothDampVec`, `SMOOTH_SEC`, `chaseFor`, `Pose`, `CamMode`, `CamState`), `headState`, `EXTRAPOLATE_MAX_SEC`.
- Produces: `GlobeFrameInput.follow?: { flight: number; u: number } | null`; `GlobeEngine.camMode(): CamMode`; `GlobeEngine.setAfterRender(fn: (() => void) | null): void`. Behaviour: while `follow` is set the camera transitions to the chase camera; clearing it transitions back; `dragBy` is ignored in `FOLLOW`/`TO_FOLLOW`; releasing a drag after > 60 ms without movement zeroes the inertia.

No unit tests are possible for GL code (the pure parts are tested in Tasks 2–3). Verification: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, and the controller's browser check after Task 6 (this task's code is exercised there).

- [ ] **Step 1: Imports and types** — in `globe/src/scene/engine.ts`:

Add imports:
```ts
import { SMOOTH_SEC, blendPose, followWeight, initCam, smoothDampVec, stepCam, type CamMode, type CamState, type Damped, type Pose } from "../camera/follow-rig";
import { chaseFor } from "../camera/follow-pose";
import { EXTRAPOLATE_MAX_SEC, headState } from "../model/dead-reckon";
import type { Vec3 } from "../geo3d/vec";
```
(`altitudeRadius`, `latLonToVec3`, `ARC_BASE_LIFT` are already imported; merge the `Vec3` type into the existing `../geo3d/vec` import.)

Extend `GlobeFrameInput`:
```ts
  /** FOLLOW target: flight index in the current model and its flight time (seconds relative to window.from) */
  follow?: { flight: number; u: number } | null;
```
Extend `GlobeEngine`:
```ts
  camMode(): CamMode;
  setAfterRender(fn: (() => void) | null): void;
```

- [ ] **Step 2: Engine state** — inside `createGlobeEngine`, after the `rig`/`idleRate` declarations add:

```ts
  let cam: CamState = initCam();
  let chasePos: Damped = { p: [0, 0, 0], v: [0, 0, 0] };
  let chaseTgt: Damped = { p: [0, 0, 0], v: [0, 0, 0] };
  let followKey = -2; // flight index the damped chase state was initialised for (-2 = none)
  let lastChase: { pos: Vec3; target: Vec3 } | null = null; // Earth-fixed
  let afterRender: (() => void) | null = null;
  let lastDragMove = 0;
  const camScale = opts.reducedMotion ? 0.5 : 1;
  const cA = new Vector3();
  const cB = new Vector3();

  /** Earth-fixed head position of flight `fi` at flight time `u` (clamped to where the flight can be drawn). */
  const posAt = (fi: number) => (u: number): Vec3 | null => {
    const f = model?.flights[fi];
    if (!f) return null;
    const hi = f.status === "AIRBORNE" ? f.lastT + EXTRAPOLATE_MAX_SEC : f.end;
    const h = headState(f, Math.min(Math.max(u, f.t[0]), hi));
    return h ? latLonToVec3(h.lat, h.lon, altitudeRadius(h.alt100) + ARC_BASE_LIFT) : null;
  };
```

- [ ] **Step 3: Camera step in the frame** — in `frameBody`, replace the block from `rig = stepRig(...)` through `camera.updateMatrixWorld();` and the `earthGroup.rotation.y = ...` line with this (the Earth rotation must be set first so its matrix is current):

```ts
    const fol = f.follow && model && model.flights[f.follow.flight] ? f.follow : null;
    cam = stepCam(cam, dt, !!fol, camScale);
    rig = stepRig(rig, dt, cam.mode === "GLOBE" ? idleRate : 0);

    earthGroup.rotation.y = earthRotationRad(f.absTime);
    earthGroup.updateMatrixWorld();

    if (fol) {
      const pose = chaseFor(posAt(fol.flight), fol.u);
      if (pose) {
        if (followKey !== fol.flight) {
          chasePos = { p: pose.pos, v: [0, 0, 0] };
          chaseTgt = { p: pose.target, v: [0, 0, 0] };
          followKey = fol.flight;
        } else {
          chasePos = smoothDampVec(chasePos, pose.pos, SMOOTH_SEC, dt);
          chaseTgt = smoothDampVec(chaseTgt, pose.target, SMOOTH_SEC, dt);
        }
        lastChase = { pos: chasePos.p, target: chaseTgt.p };
      }
    } else if (cam.mode === "GLOBE") {
      followKey = -2;
    }

    const rp = rigPosition(rig);
    if (cam.mode !== "GLOBE" && lastChase) {
      const m = earthGroup.matrixWorld;
      cA.set(lastChase.pos[0], lastChase.pos[1], lastChase.pos[2]).applyMatrix4(m);
      cB.set(lastChase.target[0], lastChase.target[1], lastChase.target[2]).applyMatrix4(m);
      const globe: Pose = { pos: rp, target: [0, 0, 0], up: [0, 1, 0] };
      const chase: Pose = {
        pos: [cA.x, cA.y, cA.z],
        target: [cB.x, cB.y, cB.z],
        up: [cA.x, cA.y, cA.z], // radial direction = local up; normalised inside blendPose
      };
      const pose = blendPose(globe, chase, followWeight(cam));
      camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
      camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(rp[0], rp[1], rp[2]);
      camera.lookAt(0, 0, 0);
    }
    camera.updateMatrixWorld();
```
and delete the old `earthGroup.rotation.y = earthRotationRad(f.absTime);` line, the old `const p = rigPosition(rig); camera.position.set(...)`, `camera.lookAt(0,0,0)` and `camera.updateMatrixWorld()` lines that this block replaces.

Call the after-render hook right after the render:
```ts
    if (sized) {
      space.nebula.render(renderer);
      composer.render(dt);
    }
    afterRender?.();
```

- [ ] **Step 4: API methods** — in the returned object:

```ts
    camMode() {
      return cam.mode;
    },
    setAfterRender(fn) {
      afterRender = fn;
    },
```
Replace `dragBy` and `endDrag`:
```ts
    dragBy(dx, dy, dt) {
      if (cam.mode === "FOLLOW" || cam.mode === "TO_FOLLOW") return;
      lastDragMove = performance.now();
      rig = dragRig(rig, -dx * DRAG_RAD_PER_PX, dy * DRAG_RAD_PER_PX, dt);
    },
    endDrag() {
      // a pause before release must not fling the globe with the last move's velocity
      const stale = performance.now() - lastDragMove > 60;
      rig = releaseRig(stale ? { ...rig, yawVel: 0, pitchVel: 0 } : rig);
    },
```
In `dispose()` add `afterRender = null;` before disposing.

- [ ] **Step 5: Verify** — `cd globe && npx tsc --noEmit && npx vitest run && npm run build` (the controller test harness's engine mock now lacks `camMode`/`setAfterRender`; tsc on tests is part of `tsc --noEmit` — add the two members to the mock in `globe/test/controller.test.ts` now: `camMode: () => "GLOBE" as const, setAfterRender: vi.fn(),` so the suite stays green; Task 6 extends that harness further).

- [ ] **Step 6: Commit**

```bash
git add globe/src/scene/engine.ts globe/test/controller.test.ts
git commit -m "feat(globe): chase camera with GLOBE/FOLLOW transitions, post-render hook, stale-drag fix"
```

---

### Task 5: Follow HUD model, keys and click helper

**Files:**
- Create: `globe/src/app/follow-hud.ts`, `globe/src/app/click.ts`
- Modify: `globe/src/app/keys.ts`, `globe/src/app/hud-model.ts`
- Test: `globe/test/follow-hud.test.ts`, `globe/test/click.test.ts`, `globe/test/keys.test.ts`

**Interfaces:**
- Consumes: Task 1 `Telemetry`, Task 3 `FollowClock`, `derivedSpeed`, `effectiveSpeed`, `atLiveHead`, `endOf`.
- Produces:
  - `follow-hud.ts`: `type FollowStateLabel = "OBSERVED" | "NO DATA" | "EXTRAPOLATED" | "LAST CONTACT" | "LANDED"`; `interface FollowHud { tk: string; route: string; state: FollowStateLabel; alt: string; gs: string; hdg: string; vs: string; phase: string; dist: string; elapsed: string; remaining: string; utc: string; local: string; speed: string; progress: number; profile: number[]; cursor: number; notes: string[] }`; `followState(f, tel, u): FollowStateLabel`; `speedLabel(f, clock): string`; `formatFollow(f: GlobeFlight, tel: Telemetry, clock: FollowClock): FollowHud`.
  - `click.ts`: `CLICK_MAX_PX = 5`, `CLICK_MAX_MS = 250`, `isClick(dx: number, dy: number, ms: number): boolean`.
  - `keys.ts`: `GlobeCommand` gains `"exitFollow" | "toggleTour" | "slower" | "faster"`; mapping `Escape`/`g`/`G` → `exitFollow`, `t`/`T` → `toggleTour`, `[` → `slower`, `]` → `faster`.
  - `hud-model.ts`: `GlobeHudSnapshot` gains `follow: FollowHud | null`, `camMode: CamMode`, `notice: string`, `tour: boolean`; `EMPTY_GLOBE_SNAPSHOT` gets `follow: null, camMode: "GLOBE", notice: "", tour: true`; new `hoverNote(f: GlobeFlight, cur: number): string`.

- [ ] **Step 1: Failing tests**

`globe/test/click.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CLICK_MAX_MS, CLICK_MAX_PX, isClick } from "../src/app/click";

describe("isClick", () => {
  it("is a click only for a short, nearly stationary press", () => {
    expect(CLICK_MAX_PX).toBe(5);
    expect(CLICK_MAX_MS).toBe(250);
    expect(isClick(0, 0, 100)).toBe(true);
    expect(isClick(3, 3, 249)).toBe(true);
    expect(isClick(5, 0, 100)).toBe(false); // ≥ 5 px is a drag
    expect(isClick(0, 0, 250)).toBe(false); // ≥ 250 ms is a drag
  });
});
```

Replace the last two lines of the existing `globe/test/keys.test.ts` `it` block (`expect(keyToCommand("g")).toBeNull()…`) with:
```ts
    expect(keyToCommand("Escape")).toBe("exitFollow");
    expect(keyToCommand("g")).toBe("exitFollow");
    expect(keyToCommand("G")).toBe("exitFollow");
    expect(keyToCommand("t")).toBe("toggleTour");
    expect(keyToCommand("T")).toBe("toggleTour");
    expect(keyToCommand("[")).toBe("slower");
    expect(keyToCommand("]")).toBe("faster");
    expect(keyToCommand("x")).toBeNull();
```

`globe/test/follow-hud.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import { telemetryAt } from "../src/geo3d/telemetry";
import { formatFollow, followState, speedLabel } from "../src/app/follow-hud";
import { hoverNote } from "../src/app/hud-model";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];
const landed = () =>
  one({
    from: "IST", to: "JFK", dep: FROM, arr: FROM + 1800, end: "LANDED",
    s: [[0, 100, 0, 0], [600, 200, 0, 1], [1200, 300, 0, 2], [1800, 300, 0, 3]],
  });

describe("formatFollow", () => {
  it("formats an observed climb with exact values", () => {
    const f = landed();
    const clock = { u: 300, speed: null, paused: false };
    const h = formatFollow(f, telemetryAt(f, 300, FROM)!, clock);
    expect(h.tk).toBe(f.tk);
    expect(h.route).toBe("IST → JFK");
    expect(h.alt).toBe("FL150 · 15,000 FT");
    expect(h.gs).toBe("360 KT");
    expect(h.hdg).toBe("090°");
    expect(h.vs).toBe("+1,000 FT/MIN");
    expect(h.phase).toBe("CLIMB");
    expect(h.dist).toBe("56 / 334 KM");
    expect(h.elapsed).toBe("00:05");
    expect(h.remaining).toBe("00:25");
    expect(h.state).toBe("OBSERVED");
    expect(h.speed).toBe("×72"); // span 1800 s → 25 s playback
    expect(h.progress).toBeCloseTo(1 / 6, 3);
    expect(h.cursor).toBeCloseTo(300 / 1800, 6);
    expect(h.notes.join(" ")).toContain("2-MIN AVERAGES");
  });

  it("shows em dashes and NO DATA inside a coverage gap", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE", gaps: [[600, 1200]],
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2], [1320, 300, 0, 2.2]],
    });
    const h = formatFollow(f, telemetryAt(f, 900, FROM)!, { u: 900, speed: null, paused: false });
    expect([h.gs, h.hdg, h.vs, h.phase]).toEqual(["—", "—", "—", "—"]);
    expect(h.state).toBe("NO DATA");
    expect(h.notes.join(" ")).toContain("NO DATA");
  });

  it("labels extrapolation, the live head, last contact, EST values and no ETA for last contact", () => {
    const air = one({
      dep: FROM, arr: null, end: "AIRBORNE", from: "IST", to: "JFK",
      s: [[0, 300, 41, 29], [600, 370, 45, 20], [1200, 370, 50, 10]],
      now: { gs: 480, trk: 300 },
    });
    const c = { u: 1260, speed: null, paused: false };
    const h = formatFollow(air, telemetryAt(air, 1260, FROM)!, c);
    expect(h.state).toBe("EXTRAPOLATED");
    expect(h.speed).toBe("×1 · LIVE HEAD");
    expect(h.dist.endsWith("EST")).toBe(true);
    expect(h.remaining.endsWith("EST")).toBe(true);
    expect(followState(air, telemetryAt(air, 1200 + 400, FROM)!, 1600)).toBe("LAST CONTACT");

    const lc = one({ dep: FROM, arr: FROM + 1200, end: "LAST_CONTACT", s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]] });
    const hl = formatFollow(lc, telemetryAt(lc, 1200, FROM)!, { u: 1200, speed: null, paused: false });
    expect(hl.state).toBe("LAST CONTACT");
    expect(hl.remaining).toBe("—");
  });

  it("describes pause and explicit speeds", () => {
    const f = landed();
    expect(speedLabel(f, { u: 10, speed: 480, paused: false })).toBe("×480");
    expect(speedLabel(f, { u: 10, speed: 480, paused: true })).toBe("PAUSED");
  });

  it("LANDED at the end", () => {
    const f = landed();
    expect(followState(f, telemetryAt(f, 1800, FROM)!, 1800)).toBe("LANDED");
  });
});

describe("hoverNote", () => {
  it("flags extrapolated, no-data and last-contact flights", () => {
    const air = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [600, 300, 0, 1]] });
    expect(hoverNote(air, 300)).toBe("");
    expect(hoverNote(air, 700)).toBe("EXTRAPOLATED");
    const gap = one({ dep: FROM, arr: null, end: "AIRBORNE", gaps: [[600, 1200]], s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]] });
    expect(hoverNote(gap, 900)).toBe("NO DATA");
    const lc = one({ dep: FROM, arr: FROM + 600, end: "LAST_CONTACT", s: [[0, 300, 0, 0], [600, 300, 0, 1]] });
    expect(hoverNote(lc, 600)).toBe("LAST CONTACT");
    expect(hoverNote(lc, 300)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`globe/src/app/click.ts`:
```ts
export const CLICK_MAX_PX = 5;
export const CLICK_MAX_MS = 250;

/** A press that moved less than 5 px and lasted less than 250 ms is a click, anything else a drag. */
export const isClick = (dx: number, dy: number, ms: number): boolean =>
  Math.hypot(dx, dy) < CLICK_MAX_PX && ms < CLICK_MAX_MS;
```

`globe/src/app/keys.ts`: change the type and add cases:
```ts
export type GlobeCommand =
  | "togglePause" | "scrubBack" | "scrubForward" | "toggleReplay" | "toggleHud" | "fullscreen"
  | "exitFollow" | "toggleTour" | "slower" | "faster";
```
and before `default:` in the switch:
```ts
    case "Escape":
    case "g":
    case "G":
      return "exitFollow";
    case "t":
    case "T":
      return "toggleTour";
    case "[":
      return "slower";
    case "]":
      return "faster";
```

`globe/src/app/hud-model.ts` — add imports `import type { CamMode } from "../camera/follow-rig"; import type { FollowHud } from "./follow-hud"; import type { GlobeFlight } from "../model/globe-model";` (merge with the existing `GlobeModel` import), extend the snapshot:
```ts
  follow: FollowHud | null;
  camMode: CamMode;
  notice: string;
  tour: boolean;
```
add `follow: null, camMode: "GLOBE", notice: "", tour: true,` to `EMPTY_GLOBE_SNAPSHOT`, and append:
```ts
/** Per-flight honesty note shown on the hover card. */
export function hoverNote(f: GlobeFlight, cur: number): string {
  if (f.status === "AIRBORNE" && cur > f.lastT) return "EXTRAPOLATED";
  if (f.gaps.some(([s, e]) => cur >= s && cur <= e)) return "NO DATA";
  if (f.status === "LAST_CONTACT" && cur >= f.lastT) return "LAST CONTACT";
  return "";
}
```

`globe/src/app/follow-hud.ts`:
```ts
import { fmtElapsed, fmtFL, fmtInt, fmtUtc } from "@web/lib/format";
import type { Telemetry } from "../geo3d/telemetry";
import { atLiveHead, effectiveSpeed, type FollowClock } from "../model/follow-clock";
import type { GlobeFlight } from "../model/globe-model";

export type FollowStateLabel = "OBSERVED" | "NO DATA" | "EXTRAPOLATED" | "LAST CONTACT" | "LANDED";

export interface FollowHud {
  tk: string;
  route: string;
  state: FollowStateLabel;
  alt: string;
  gs: string;
  hdg: string;
  vs: string;
  phase: string;
  dist: string;
  elapsed: string;
  remaining: string;
  utc: string;
  local: string;
  speed: string;
  progress: number;
  profile: number[];
  cursor: number;
  notes: string[];
}

const PROFILE_POINTS = 48;
const pad2 = (n: number) => String(n).padStart(2, "0");

export function followState(f: GlobeFlight, tel: Telemetry, u: number): FollowStateLabel {
  if (tel.source === "NO DATA") return "NO DATA";
  if (tel.source === "EXTRAPOLATED") return tel.holding ? "LAST CONTACT" : "EXTRAPOLATED";
  if (f.status === "LANDED" && u >= f.end) return "LANDED";
  if (f.status === "LAST_CONTACT" && u >= f.lastT) return "LAST CONTACT";
  return "OBSERVED";
}

export function speedLabel(f: GlobeFlight, c: FollowClock): string {
  if (c.paused) return "PAUSED";
  if (atLiveHead(c, f)) return "×1 · LIVE HEAD";
  return `×${Math.round(effectiveSpeed(c, f))}`;
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtInt(Math.abs(v))}`;

export function formatFollow(f: GlobeFlight, tel: Telemetry, clock: FollowClock): FollowHud {
  const est = tel.distEstimated ? " EST" : "";
  const stride = Math.max(1, Math.ceil(f.alt.length / PROFILE_POINTS));
  const profile: number[] = [];
  for (let i = 0; i < f.alt.length; i += stride) profile.push(f.alt[i]);
  if ((f.alt.length - 1) % stride !== 0) profile.push(f.alt[f.alt.length - 1]);
  const span = f.lastT - f.t[0];
  const local = tel.localSolarHours;
  const state = followState(f, tel, clock.u);

  const notes = ["GS / HDG / VS ARE 2-MIN AVERAGES"];
  if (state === "NO DATA") notes.push("NO DATA · OUTSIDE ADS-B COVERAGE");
  if (state === "EXTRAPOLATED") notes.push("EXTRAPOLATED FROM LAST REPORT");
  if (tel.distEstimated) notes.push("EST = PARTLY PLANNED ROUTE");

  return {
    tk: f.tk,
    route: f.from || f.to ? `${f.from ?? "???"} → ${f.to ?? "???"}` : "ROUTE UNKNOWN",
    state,
    alt: `${fmtFL(tel.alt100)} · ${fmtInt(tel.altFt)} FT`,
    gs: tel.gsKt === null ? "—" : `${Math.round(tel.gsKt)} KT`,
    hdg: tel.hdgDeg === null ? "—" : `${String(Math.round(tel.hdgDeg) % 360).padStart(3, "0")}°`,
    vs: tel.vsFpm === null ? "—" : `${signed(Math.round(tel.vsFpm))} FT/MIN`,
    phase: tel.phase,
    dist: tel.totalKm === null ? `${fmtInt(tel.distKm)} KM${est}` : `${fmtInt(tel.distKm)} / ${fmtInt(tel.totalKm)} KM${est}`,
    elapsed: fmtElapsed(tel.elapsedSec),
    remaining: tel.remainingSec === null ? "—" : `${fmtElapsed(tel.remainingSec)}${tel.etaEstimated ? " EST" : ""}`,
    utc: fmtUtc(tel.utcSec),
    local: `${pad2(Math.floor(local))}:${pad2(Math.floor((local % 1) * 60))} LOCAL SOLAR`,
    speed: speedLabel(f, clock),
    progress: tel.totalKm && tel.totalKm > 0 ? Math.min(1, Math.max(0, tel.distKm / tel.totalKm)) : 0,
    profile,
    cursor: span > 0 ? Math.min(1, Math.max(0, (Math.min(clock.u, f.lastT) - f.t[0]) / span)) : 0,
    notes,
  };
}
```
Note: the test above asserts `h.cursor` ≈ `300/1800`: here `span = f.lastT - f.t[0] = 1800` and `(300 - 0)/1800` ✓. Check `h.dist` for the LANDED sample: `tel.distEstimated` is false there so no `EST` suffix; for the airborne-with-planned case the suffix is present because `telemetryAt` sets `distEstimated` ✓. In the `"labels extrapolation…"` test `remaining` ends with `EST` because `etaEstimated` is true (planned route known) ✓; for the `LAST_CONTACT` flight `remainingSec` is null → `"—"` ✓.

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/follow-hud.test.ts test/click.test.ts test/keys.test.ts && npx tsc --noEmit` (the controller does not yet fill the new snapshot fields; it spreads `base` plus explicit fields, so tsc will flag `follow/camMode/notice/tour` missing in `controller.ts` `store.set`: add `follow: null, camMode: d.engine.camMode(), notice: "", tour: true` there as a stop-gap so this task compiles; Task 6 replaces them with real values).

- [ ] **Step 5: Commit**

```bash
git add globe/src/app globe/test
git commit -m "feat(globe): follow HUD view model, new keys, click-vs-drag helper"
```

---

### Task 6: Controller — follow, tour, click, notices

**Files:**
- Modify: `globe/src/app/controller.ts`
- Test: `globe/test/controller.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 5 and the engine members from Task 4.
- Produces: `GlobeController.onClick(x: number, y: number): void`; frame input now carries `follow` and `highlight` = followed flight; snapshot fields `follow`, `camMode`, `notice`, `tour`; per-frame labels via `engine.setAfterRender`.

Behaviour spec (all verified by the tests below):
- `onClick(x, y)`: `act interact`; `pick` at current `cur`; a hit that is not the followed flight starts FOLLOW (tracks with < 2 samples → notice `TRACK TOO SHORT`, no follow); a miss while following exits.
- While following: `cur` = follow clock `u`; the REPLAY cycle's displayed time, phase and elapsed are frozen (manual/idle/paused keep updating).
- Keys while following: `Space` pauses the follow clock, `←`/`→` scrub ±5 min, `[`/`]` ladder, `Esc`/`G`/`R` exit (R also toggles replay as before). `T` toggles the tour and never counts as interaction.
- Data swap: followed flight is re-found by `id`; its `u` is shifted by `-(next.from - prev.from)`; if gone, follow ends with notice `FLIGHT NO LONGER IN DATA`.
- Tour: `stepTour` runs only in LIVE; context `manual = cycle.manual`; `followDone = liveHeadSec ≥ 20 || endedSec ≥ 6`.
- Notices last 3 s of wall time.

- [ ] **Step 1: Harness + failing tests** — in `globe/test/controller.test.ts`:

Extend the `setup` engine mock and return value:
```ts
  let afterRender: (() => void) | null = null;
  // inside the engine object:
    camMode: () => "GLOBE" as const,
    setAfterRender: (fn) => {
      afterRender = fn;
    },
  // in the returned object, add:
  //   afterRender: () => afterRender?.(),
  //   pickResult: (n: number) => (engine.pick as ReturnType<typeof vi.fn>).mockReturnValue(n),
```
(Declare `engine` before use as it already is; `pickResult` makes the pick mock configurable.) Any existing test that asserted `onLabels` being called from `frame` must instead call `h.afterRender()` — labels are now emitted from the after-render hook.

Add these tests inside `describe("globe controller", …)` (flight `a` has samples at relative `t = 83400 / 84000 / 86300`, `lastT = 86300`, derived speed `2900 / 25 = 116`):

```ts
  const long4 = flight({
    id: "L", tk: "TK-L", from: "IST", to: "JFK", region: "AME", dep: G1 - 3000, arr: null, end: "AIRBORNE",
    s: [[0, 300, 41, 29], [600, 370, 45, 20], [1800, 370, 50, 0], [2900, 370, 55, -20]],
    now: { gs: 480, trk: 300 },
  });

  it("a click on a flight starts FOLLOW at the first sample and advances at the derived speed", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    const f = h.frame(1);
    expect(f.follow).toEqual({ flight: 0, u: 83400 + 116 });
    expect(f.cur).toBe(83516);
    expect(f.highlight).toBe(0);
    expect(f.absTime).toBe(G1 - 86400 + 83516);
    h.c.dispose();
  });

  it("Escape and a blank click leave FOLLOW", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    h.frame(0.1);
    h.c.onKey("Escape");
    expect(h.frame(0.1).follow).toBeNull();
    h.c.onClick(10, 10);
    expect(h.frame(0.1).follow).not.toBeNull();
    h.pickResult(-1);
    h.c.onClick(500, 500);
    expect(h.frame(0.1).follow).toBeNull();
    h.c.dispose();
  });

  it("Space pauses the follow clock; ] picks the next ladder speed; arrows scrub five minutes", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    expect(h.frame(1).cur).toBe(83516);
    h.c.onKey(" ");
    expect(h.frame(1).cur).toBe(83516);
    h.c.onKey(" ");
    h.c.onKey("]"); // 116 → nearest rung 120 → 240
    expect(h.frame(1).cur).toBe(83516 + 240);
    h.c.onKey("ArrowLeft");
    expect(h.frame(0).cur).toBe(83516 + 240 - 300);
    h.c.dispose();
  });

  it("a single-sample track cannot be followed and says why", async () => {
    const one = flight({ id: "s", tk: "TK-s", dep: G1 - 100, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29]] });
    const h = setup({ days: [dayAt(G1, [one])] });
    await flush();
    h.c.onClick(10, 10);
    expect(h.frame(0.3).follow).toBeNull();
    expect(h.store.get().notice).toBe("TRACK TOO SHORT");
    h.clock.ms += 4000;
    h.frame(0.3);
    expect(h.store.get().notice).toBe("");
    h.c.dispose();
  });

  it("keeps following the same flight across a data swap and shifts its time with the window", async () => {
    const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null)]), dayAt(G2, [airborne("AIRBORNE", null)])] });
    await flush();
    h.c.onClick(10, 10);
    expect(h.frame(1).follow!.u).toBe(83516);
    h.c.refresh();
    await flush();
    const f = h.frame(0);
    expect(f.follow).toEqual({ flight: 0, u: 83516 - 120 });
    h.c.dispose();
  });

  it("ends FOLLOW with a notice when the flight disappears from the data", async () => {
    const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null)]), dayAt(G2, [])] });
    await flush();
    h.c.onClick(10, 10);
    h.frame(0.3);
    h.c.refresh();
    await flush();
    expect(h.frame(0.1).follow).toBeNull();
    expect(h.store.get().notice).toBe("FLIGHT NO LONGER IN DATA");
    h.c.dispose();
  });

  it("publishes the telemetry block while following", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    h.frame(1);
    h.frame(0.3);
    const fh = h.store.get().follow!;
    expect(fh.tk).toBe("TK-a");
    expect(fh.route).toBe("IST → JFK");
    expect(fh.state).toBe("OBSERVED");
    expect(h.store.get().mode).toBe("LIVE");
    h.c.dispose();
  });

  it("the auto-tour starts a follow after 25 s without input, and T turns it off", async () => {
    const mk = () => setup({ days: [dayAt(G1, [long4])] });
    let h = mk();
    await flush();
    let f = h.frame(1);
    for (let i = 0; i < 26; i++) f = h.frame(1);
    expect(f.follow).not.toBeNull();
    h.c.dispose();

    h = mk();
    await flush();
    h.c.onKey("t");
    for (let i = 0; i < 40; i++) f = h.frame(1);
    expect(f.follow).toBeNull();
    expect(h.store.get().tour).toBe(false);
    h.c.dispose();
  });

  it("fixture data is never reported as delayed, however old", async () => {
    const h = setup({ fixture: true, now: { ms: (G1 + 90_000) * 1000 } });
    await flush();
    h.frame(0.3);
    expect(h.store.get().dataState).not.toBe("delayed");
    h.c.dispose();
  });

  it("emits airport labels from the post-render hook", async () => {
    const seen: number[] = [];
    const h = setup();
    // re-create with a label sink
    h.c.dispose();
    let after: (() => void) | null = null;
    void after;
    expect(typeof h.afterRender).toBe("function");
    expect(seen).toEqual([]);
  });
```

(Replace the last test with a real one using the harness: pass `onLabels: (l) => seen.push(l.length)` through a new optional `onLabels` argument to `setup` → `createController`, call `h.afterRender()` and assert `seen.length > 0`, and that `h.frame(0.1)` alone does not add to `seen`. The placeholder above only documents intent; do not commit it as written.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/controller.test.ts` → FAIL (`onClick` missing etc.).

- [ ] **Step 3: Implement** — edits to `globe/src/app/controller.ts`:

Imports:
```ts
import { telemetryAt } from "../geo3d/telemetry";
import { TOUR_END_HOLD_SEC, TOUR_LIVE_HOLD_SEC, initTour, stepTour } from "../model/tour";
import { SCRUB_FOLLOW_SEC, atEnd, atLiveHead, cycleSpeed, scrubFollow, startClock, stepFollow, type FollowClock } from "../model/follow-clock";
import { formatFollow } from "./follow-hud";
import { hoverNote } from "./hud-model";
```
(merge `hoverNote` into the existing `./hud-model` import list).

Interface: add `onClick(x: number, y: number): void;` to `GlobeController`.

State (next to the other `let`s):
```ts
  let follow: { id: string; idx: number; clock: FollowClock; liveHeadSec: number; endedSec: number } | null = null;
  let tour = initTour(true);
  let notice: { text: string; until: number } | null = null;
  const NOTICE_SEC = 3;
  const say = (text: string) => {
    notice = { text, until: d.nowMs() / 1000 + NOTICE_SEC };
  };
  function startFollow(idx: number) {
    const f = model?.flights[idx];
    if (!f) return;
    if (f.t.length < 2) {
      say("TRACK TOO SHORT");
      return;
    }
    follow = { id: f.id, idx, clock: startClock(f), liveHeadSec: 0, endedSec: 0 };
  }
```

`currentCur`: first line after `if (!model) return 0;` add `if (follow) return follow.clock.u;`.

`pushHud`: after `const base = buildSnapshot(...)`:
```ts
    let tooltip = base.tooltip;
    if (tooltip && model && hoverIdx >= 0) {
      const note = hoverNote(model.flights[hoverIdx], cur);
      if (note) tooltip = { ...tooltip, route: `${tooltip.route} · ${note}` };
    }
    let followHud = null;
    if (follow && model) {
      const f = model.flights[follow.idx];
      const tel = f ? telemetryAt(f, follow.clock.u, model.from) : null;
      if (f && tel) followHud = formatFollow(f, tel, follow.clock);
    }
```
and in `d.store.set({...})` use `tooltip,` after `...base,` (so it overrides), and replace the stop-gap fields with:
```ts
      follow: followHud,
      camMode: d.engine.camMode(),
      notice: notice && nowSec < notice.until ? notice.text : "",
      tour: tour.enabled,
```

`frame`:
- Replace `cycle = stepCycle(cycle, dt, bounds(), GLOBE_CYCLE);` by:
```ts
    const stepped = stepCycle(cycle, dt, bounds(), GLOBE_CYCLE);
    // while following in REPLAY the displayed instant belongs to the follow clock: freeze the replay position
    cycle = follow && mode === "REPLAY" ? { ...stepped, phase: cycle.phase, elapsed: cycle.elapsed, tRel: cycle.tRel } : stepped;
```
- After the LIVE-frozen block and before the pick block add:
```ts
    if (follow && model) {
      const f = model.flights[follow.idx];
      follow.clock = stepFollow(follow.clock, f, dt);
      if (atLiveHead(follow.clock, f) && !follow.clock.paused) follow.liveHeadSec += dt;
      if (atEnd(follow.clock, f)) follow.endedSec += dt;
    }
    if (mode === "LIVE") {
      const r = stepTour(tour, dt, {
        following: !!follow,
        followDone: !!follow && (follow.liveHeadSec >= TOUR_LIVE_HOLD_SEC || follow.endedSec >= TOUR_END_HOLD_SEC),
        manual: cycle.manual,
        model,
        cur: currentCur(nowSec),
        rand: Math.random,
      });
      tour = r.s;
      if (r.a.type === "follow") startFollow(r.a.index);
      else if (r.a.type === "exit") follow = null;
    }
```
- Remove `if (d.onLabels && model) d.onLabels(computeLabels());` from `frame` and register the hook once after `d.engine.setFrameSource(frame);`:
```ts
  d.engine.setAfterRender(() => {
    if (d.onLabels && model && !disposed) d.onLabels(computeLabels());
  });
```
- Return value:
```ts
    const cur = currentCur(nowSec);
    return {
      absTime: (model?.from ?? nowSec) + cur,
      cur,
      highlight: follow ? follow.idx : hoverIdx,
      nowSec,
      follow: follow ? { flight: follow.idx, u: follow.clock.u } : null,
    };
```

`onData` — after `model = next; tl = nextTl;` and before the `first` handling add nothing; after the `liveFrozen` compensation line add:
```ts
    if (!first && follow) {
      const idx = next.flights.findIndex((f) => f.id === follow!.id);
      if (idx < 0) {
        follow = null;
        say("FLIGHT NO LONGER IN DATA");
      } else {
        follow.idx = idx;
        follow.clock = { ...follow.clock, u: follow.clock.u - (next.from - prev!.from) };
      }
    }
```
Note: `follow.idx` of every swap must be refreshed before `d.engine.setModel(...)` runs; the block above is placed before that call.

`onKey` — at the top, after `if (!cmd) return;` add:
```ts
      const f = follow && model ? model.flights[follow.idx] : null;
      if (cmd === "toggleTour") {
        tour = { ...tour, enabled: !tour.enabled };
        pushHud();
        return;
      }
      if (cmd === "exitFollow") {
        act({ type: "interact" });
        follow = null;
        pushHud();
        return;
      }
      if (follow && f) {
        if (cmd === "togglePause") follow.clock = { ...follow.clock, paused: !follow.clock.paused };
        else if (cmd === "scrubBack" || cmd === "scrubForward")
          follow.clock = scrubFollow(follow.clock, f, cmd === "scrubBack" ? -SCRUB_FOLLOW_SEC : SCRUB_FOLLOW_SEC);
        else if (cmd === "slower" || cmd === "faster") follow.clock = cycleSpeed(follow.clock, f, cmd === "faster" ? 1 : -1);
        else if (cmd === "toggleReplay") follow = null; // falls through to the normal REPLAY toggle below
        if (follow) {
          act({ type: "interact" });
          pushHud();
          return;
        }
      }
      if (cmd === "slower" || cmd === "faster") return; // speed keys only matter while following
```
`onClick`:
```ts
    onClick(x, y) {
      act({ type: "interact" });
      if (!model) return;
      const idx = d.engine.pick(x, y, currentCur(d.nowMs() / 1000));
      if (idx >= 0) {
        if (!follow || follow.idx !== idx) startFollow(idx);
      } else if (follow) follow = null;
      pushHud();
    },
```
`dispose`: add `d.engine.setAfterRender(null);`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`. All previously passing controller tests must still pass.

- [ ] **Step 5: Commit**

```bash
git add globe/src/app/controller.ts globe/test/controller.test.ts
git commit -m "feat(globe): FOLLOW mode and auto-tour in the controller"
```

---

### Task 7: FlightPanel, mode line, App click handling, CSS

**Files:**
- Modify: `globe/src/hud/GlobeHud.tsx`, `globe/src/styles.css`, `globe/src/App.tsx`
- Test: `globe/test/hud.test.tsx`

**Interfaces:**
- Consumes: `FollowHud`, snapshot fields from Task 5, `isClick`, `controller.onClick`.
- Produces: `FlightPanel({ f: FollowHud })`, updated `ModeLine`, notice element, click-vs-drag in `App`.

- [ ] **Step 1: Failing tests** — append to `globe/test/hud.test.tsx` (import `FlightPanel` from `../src/hud/GlobeHud` and `FollowHud` type from `../src/app/follow-hud`):

```tsx
const fh = (o: Partial<FollowHud> = {}): FollowHud => ({
  tk: "TK1", route: "IST → JFK", state: "OBSERVED", alt: "FL370 · 37,000 FT", gs: "480 KT", hdg: "290°",
  vs: "+1,000 FT/MIN", phase: "CLIMB", dist: "56 / 334 KM", elapsed: "00:05", remaining: "00:25 EST",
  utc: "08:15 UTC", local: "08:21 LOCAL SOLAR", speed: "×240", progress: 0.25, profile: [100, 300, 370],
  cursor: 0.5, notes: ["GS / HDG / VS ARE 2-MIN AVERAGES"], ...o,
});

describe("FlightPanel", () => {
  it("shows every telemetry value, the state badge and the averages note", () => {
    const { container } = render(<FlightPanel f={fh()} />);
    const t = text(container);
    for (const s of ["TK1", "IST → JFK", "OBSERVED", "FL370 · 37,000 FT", "480 KT", "290°", "+1,000 FT/MIN", "CLIMB", "56 / 334 KM", "00:05", "00:25 EST", "08:15 UTC", "×240", "2-MIN AVERAGES"])
      expect(t).toContain(s);
    expect(container.querySelector(".fp-state")!.className).toContain("observed");
  });

  it("marks NO DATA and EXTRAPOLATED states with their own class", () => {
    const a = render(<FlightPanel f={fh({ state: "NO DATA" })} />).container;
    expect(a.querySelector(".fp-state")!.className).toContain("no-data");
    const b = render(<FlightPanel f={fh({ state: "EXTRAPOLATED" })} />).container;
    expect(b.querySelector(".fp-state")!.className).toContain("extrapolated");
  });

  it("draws the altitude profile with a cursor and the route progress bar", () => {
    const { container } = render(<FlightPanel f={fh({ progress: 0.25, cursor: 0.5 })} />);
    expect(container.querySelector("svg polyline")).not.toBeNull();
    const bar = container.querySelector<HTMLElement>(".fp-bar > i")!;
    expect(bar.style.width).toBe("25%");
    const cur = container.querySelector("svg line.fp-cursor")!;
    expect(Number(cur.getAttribute("x1"))).toBeCloseTo(50, 3); // viewBox 0..100
  });
});

describe("ModeLine / notice with FOLLOW", () => {
  it("shows FOLLOW with speed and state; PAUSED live; and the notice", () => {
    expect(text(render(<ModeLine s={snap({ follow: fh() })} />).container)).toBe("FOLLOW · ×240 · OBSERVED");
    expect(text(render(<ModeLine s={snap({ paused: true })} />).container)).toBe("LIVE · PAUSED");
    const { container } = render(<GlobeHud store={createStore(snap({ notice: "TRACK TOO SHORT" }))} />);
    expect(text(container)).toContain("TRACK TOO SHORT");
  });

  it("the flight panel fades with H but is not the attribution", () => {
    const { container } = render(<GlobeHud store={createStore(snap({ follow: fh(), hidden: true }))} />);
    expect(container.querySelector(".hud.hidden .flight-panel")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`GlobeHud.tsx`: add imports `import type { FollowHud } from "../app/follow-hud";`, then

```tsx
const rows: [string, keyof FollowHud][] = [
  ["ALT", "alt"], ["GS", "gs"], ["HDG", "hdg"], ["VS", "vs"], ["PHASE", "phase"],
  ["DIST", "dist"], ["ELAPSED", "elapsed"], ["REMAINING", "remaining"], ["UTC", "utc"], ["LOCAL", "local"],
];

function Profile({ profile, cursor }: { profile: number[]; cursor: number }) {
  const max = Math.max(1, ...profile);
  const pts = profile.map((a, i) => `${(profile.length > 1 ? (i / (profile.length - 1)) * 100 : 0).toFixed(2)},${(30 - (a / max) * 28).toFixed(2)}`).join(" ");
  const x = (cursor * 100).toFixed(2);
  return (
    <svg className="fp-profile" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="Altitude profile">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      <line className="fp-cursor" x1={x} x2={x} y1="0" y2="30" stroke="var(--thy)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FlightPanel({ f }: { f: FollowHud }) {
  const [from, to] = f.route.split(" → ");
  return (
    <div className="flight-panel">
      <div className="fp-head">
        <span className="fp-tk">{f.tk}</span>
        <span className={`fp-state ${f.state.toLowerCase().replace(/ /g, "-")}`}>{f.state}</span>
      </div>
      <div className="fp-route label">
        <span>{from}</span>
        <span className="fp-bar"><i style={{ width: `${Math.round(f.progress * 100)}%` }} /></span>
        <span>{to ?? ""}</span>
      </div>
      <div className="fp-route-text label">{f.route}</div>
      <dl className="fp-grid">
        {rows.map(([label, key]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd>{String(f[key])}</dd>
          </div>
        ))}
      </dl>
      <Profile profile={f.profile} cursor={f.cursor} />
      <div className="fp-speed label">{f.speed}</div>
      <div className="fp-notes label">{f.notes.map((n) => <div key={n}>{n}</div>)}</div>
    </div>
  );
}
```
Update `ModeLine`:
```tsx
export function ModeLine({ s }: { s: GlobeHudSnapshot }) {
  const text = s.follow
    ? `FOLLOW · ${s.follow.speed} · ${s.follow.state}`
    : s.mode === "REPLAY"
      ? "REPLAY · 24H IN 3 MIN"
      : s.paused
        ? "LIVE · PAUSED"
        : s.extrapolated > 0
          ? `LIVE · ${s.extrapolated} HEADS EXTRAPOLATED`
          : "LIVE";
  return <div className="modeline label">{text}</div>;
}
```
In `GlobeHud` inside the `s.ready` fragment: render `{s.follow && <FlightPanel f={s.follow} />}`, hide `RegionBars` while following (`{!s.follow && <RegionBars … />}`), and after `Credit` add `{s.notice && <div className="notice label">{s.notice}</div>}` (the notice must also render when not ready, so place it outside the `s.ready` fragment).

`styles.css` — append:
```css
.flight-panel { position: absolute; right: 3vmin; top: 50%; transform: translateY(-50%); width: 30vmin; display: flex; flex-direction: column; gap: 1vmin; padding: 1.4vmin 1.6vmin; background: rgba(2, 4, 12, 0.55); border: 1px solid var(--line); backdrop-filter: blur(6px); pointer-events: none; }
.fp-head { display: flex; justify-content: space-between; align-items: baseline; }
.fp-tk { font-size: calc(2.2 * var(--u)); letter-spacing: 0.08em; }
.fp-state { font-family: var(--label); font-size: calc(1 * var(--u)); letter-spacing: 0.14em; padding: 0.2vmin 0.8vmin; border: 1px solid var(--line-strong); }
.fp-state.observed { color: #7bd389; }
.fp-state.no-data { color: var(--amber); }
.fp-state.extrapolated { color: #ffd479; }
.fp-state.last-contact { color: var(--amber); }
.fp-state.landed { color: var(--ink); }
.fp-route { display: flex; align-items: center; gap: 1vmin; }
.fp-route-text { display: none; }
.fp-bar { flex: 1; height: 0.35vmin; background: var(--line); }
.fp-bar > i { display: block; height: 100%; background: var(--thy); }
.fp-grid { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.8vmin 1.4vmin; }
.fp-grid dt { font-size: calc(0.85 * var(--u)); color: var(--ink-dim); }
.fp-grid dd { margin: 0; font-size: calc(1.35 * var(--u)); letter-spacing: 0.04em; }
.fp-profile { width: 100%; height: 6vmin; color: var(--ink-dim); }
.fp-speed { text-align: right; color: var(--ink); }
.fp-notes { font-size: calc(0.8 * var(--u)); color: var(--ink-dim); line-height: 1.5; }
.notice { position: fixed; left: 50%; top: 18vmin; transform: translateX(-50%); letter-spacing: 0.2em; color: var(--amber); z-index: 6; pointer-events: none; }
@media (max-aspect-ratio: 1/1) {
  .flight-panel { top: auto; bottom: 22vmin; transform: none; right: 3vmin; width: 42vmin; }
}
```

`App.tsx`: add `import { isClick } from "./app/click";` and a second variable for click detection:
```ts
    let press: { x: number; y: number; t: number } | null = null;
    // in `down`:
    press = { x: e.clientX, y: e.clientY, t: performance.now() };
    // new handler registered for pointerup only:
    const upClick = (e: PointerEvent) => {
      const p = press;
      press = null;
      up(e);
      if (p && isClick(e.clientX - p.x, e.clientY - p.y, performance.now() - p.t)) controller?.onClick(e.clientX, e.clientY);
    };
    // pointercancel/lostpointercapture keep using `up` and must also clear `press`: add `press = null;` at the top of `up`.
```
Register `window.addEventListener("pointerup", upClick)` instead of `up` (keep `pointercancel` and `lostpointercapture` on `up`), and remove it in the cleanup. Also make texture progress monotonic: replace the `loadTextures((p) => …)` callback with a running maximum:
```ts
    let maxProgress = 0;
    engine.loadTextures((p) => { maxProgress = Math.max(maxProgress, p); controller?.setTextureState(maxProgress, ""); })
```
In `up`, `lostpointercapture` fires after `pointerup` released capture: `press` is already null so no double click.

- [ ] **Step 4: Run to verify pass** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 5: Controller browser check** (not delegated): start `globe-dev` (`preview_start`, restart it if the module graph is stale), open `http://localhost:5174/?data=fixture`, click an arc head. Verify: camera glides in over ≈ 2.5 s and chases the aircraft along its arc; the Earth keeps rotating; the panel values change smoothly; `]` speeds up, `Space` pauses, `Esc` returns. Open the real-data page and wait 25 s untouched: the tour should start on its own. Record any tuning constants changed.

- [ ] **Step 6: Commit**

```bash
git add globe/src globe/test
git commit -m "feat(globe): flight telemetry panel, FOLLOW mode line, click-vs-drag"
```

---

### Task 8: Deferred Plan 3 polish

**Files:**
- Modify: `globe/src/scene/earth.ts`, `globe/test/scene-materials.test.ts`, `globe/test/picking3d.test.ts`, `globe/test/arcs.test.ts`

Items (all from the Plan 3 ledger; others — tooltip honesty note, paused label, labels one frame behind, stale drag velocity, monotonic texture progress, fixture-DELAYED test — are already done in Tasks 4–7):

- [ ] **Step 1: Pole singularity** — in `earth.ts` `sphereUV`, replace `float lon = atan(d.x, d.z);` with:
```glsl
  float lon = (abs(d.x) + abs(d.z) < 1e-6) ? 0.0 : atan(d.x, d.z); // atan(0, 0) is undefined at the exact poles
```

- [ ] **Step 2: Uniform consistency test** — append to `globe/test/scene-materials.test.ts` (use the file's existing imports; add `createEarth` and `EARTH_FRAG` to them if missing):
```ts
it("every uniform declared in EARTH_FRAG is provided by the material", () => {
  const declared = [...EARTH_FRAG.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);
  expect(declared.length).toBeGreaterThan(5);
  const e = createEarth();
  try {
    for (const name of declared) expect(Object.keys(e.uniforms)).toContain(name);
  } finally {
    e.dispose();
  }
});
```

- [ ] **Step 3: Far-side pick honours the world matrix** — read `globe/test/picking3d.test.ts` first. Add one test that reuses its camera and index setup with `world = new Matrix4().makeRotationY(Math.PI)` and asserts the result flips between the "front" and "back" flight relative to the identity-matrix case (the existing far-side test never changes the matrix, so it cannot show that the horizon cull and the `world` rotation are applied).

- [ ] **Step 4: `isBreak` gap branch** — in `globe/test/arcs.test.ts` add a case with consecutive samples 300 s apart (below `BREAK_SEC`) and `gaps: [[sampleT0, sampleT1]]` on the flight, asserting `isBreak(f, 0)` is `true`, and a control without the gap asserting `false`. Read the existing `isBreak` tests to mirror the flight construction.

- [ ] **Step 5: Verify** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 6: Commit**

```bash
git add globe
git commit -m "chore(globe): pole guard and test coverage for deferred Plan 3 findings"
```

---

### Task 9: Docs, deploy, verification

**Files:**
- Modify: `README.md`

This publishes to the existing public site `https://dataroute-tk.web.app`. **Ask the user before deploying** (the earlier approval covered the first deploy only). Do not touch the tunnel site.

- [ ] **Step 1: README** — in the Globe section replace the `Keys:` line with:

```markdown
Keys: Space pause · R replay ⇄ live · ← / → one hour · H hide HUD · F fullscreen · T auto-tour on/off.
Click an arc (or let the tour pick one) to FOLLOW it: the camera flows along the flight in real time with its true altitude, speed, heading and vertical speed (2-minute averages; gaps are `NO DATA`, extrapolated heads `EXTRAPOLATED`).
While following: Space pause · ← / → ±5 min · [ / ] speed ×60…×960 · Esc / G back to the globe.
Drag to rotate, hover an arc for details.
```

- [ ] **Step 2: Full verification** — `cd globe && npx vitest run && npx tsc --noEmit && npm run build`; `cd ../functions && npx vitest run` (collector untouched; must still pass).

- [ ] **Step 3: Deploy (after user approval)** — `firebase deploy --only hosting:globe --project omerkilavuz-9ad41 --non-interactive`; verify with the six `curl` checks from Plan 3 Task 13 (all 200) and that `https://omerkilavuz-9ad41.web.app/` still serves `assets/index-DJXmoYSC.js` and `assets/index-pRR-c2nb.css`.

- [ ] **Step 4: Live check** — open `https://dataroute-tk.web.app/?debug=1`: no console errors, ≥ 55 FPS in GLOBE and in FOLLOW, tour starts after ≈ 25 s idle, telemetry values match the flight's position (altitude cursor on the profile, UTC and terminator consistent).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: FOLLOW mode and tour keys"
```

---

## Outcome notes (fill in during execution)

- Task 7 visual check: record tuning changes (damping time, chase offsets, panel sizes) and measured FPS in GLOBE vs FOLLOW.
- Task 9: record the deploy and the unchanged tunnel asset names.

## Not in this plan (carry forward)

- Collector robustness (separate plan): a callsign change finalises the old flight as `LAST_CONTACT` while the aircraft is still visible (spurious event); a resumed ground sighting adds no sample; landing decisions are irreversible (go-arounds).
- Rendering polish: heads re-upload static attributes every frame; atmosphere is not tone-mapped; airport pulses restart on every data refresh; pick radius ignores arc fade; the Space-unfreeze in LIVE jumps to the live clock.
- Old OpenSky secrets in Secret Manager; redeploy of the tunnel site (user's call).
