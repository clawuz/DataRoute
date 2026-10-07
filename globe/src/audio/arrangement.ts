import { REGIONS } from "@web/data/palette";
import type { Section } from "./form";
import type { SkyFlight } from "./lines";
import type { RegionName } from "./theory";

/**
 * Music v4 arrangement (spec §4f): traffic intensity → rhythm level, continent shares → region layers,
 * and the REPLAY build-up into each section boundary. Pure.
 */
export type Level = 0 | 1 | 2 | 3 | 4;
export type BuildPhase = "none" | "build" | "hit";

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Airborne flights at which the intensity saturates. */
export const FULL_SKY = 150;
/** Time constant (s) of the intensity smoothing. */
export const INTENSITY_TAU = 2;

export const intensityOf = (airborne: number): number => clamp(airborne / FULL_SKY, 0, 1);

/** Exponential smoothing step: `prev + (target − prev) · (1 − e^(−dt/2))`. */
export const smoothIntensity = (prev: number, target: number, dt: number): number =>
  prev + (target - prev) * (1 - Math.exp(-dt / INTENSITY_TAU));

/** `clamp(round(intensity · 4), section range)`. */
export function levelFor(sec: Section, intensity: number): Level {
  const [lo, hi] = sec.levelRange;
  return clamp(Math.round(intensity * 4), lo, hi) as Level;
}

/** Bar-boundary hysteresis (called once per bar): rise to `wanted` at once, fall at most one level. */
export const nextLevel = (cur: Level, wanted: Level): Level => (wanted >= cur ? wanted : ((cur - 1) as Level));

/** Share of the airborne flights per region, in `REGIONS` order (all zeros for an empty sky). */
export function regionShares(flights: SkyFlight[]): number[] {
  const counts: number[] = REGIONS.map(() => 0);
  let n = 0;
  for (const f of flights) {
    if (f.regionIdx < 0 || f.regionIdx >= counts.length) continue;
    counts[f.regionIdx]++;
    n++;
  }
  return n === 0 ? counts : counts.map((c) => c / n);
}

export const LAYER_ENTER = 0.14;
export const LAYER_LEAVE = 0.08;
export const MAX_LAYERS = 4;

/**
 * Active region layers: a region enters at share ≥ 0.14, an active one stays while ≥ 0.08;
 * at most `max` (highest shares first, ties by `REGIONS` order).
 */
export function activeLayers(prev: ReadonlySet<RegionName>, shares: number[], max = MAX_LAYERS): Set<RegionName> {
  const cand = REGIONS.map((r, i) => ({ r, i, s: shares[i] ?? 0 })).filter(
    ({ r, s }) => s >= LAYER_ENTER || (prev.has(r) && s >= LAYER_LEAVE),
  );
  cand.sort((a, b) => b.s - a.s || a.i - b.i);
  return new Set(cand.slice(0, Math.max(0, max)).map((c) => c.r));
}

/** Build-up window before a boundary (h ≈ 4 s ≈ 2 bars of REPLAY) and the tutti window after it. */
export const BUILD_HOURS = 0.55;
export const HIT_HOURS = 0.1;

/**
 * REPLAY only: `build` (amount 0 → 1) in the last 0.55 h before a section boundary, `hit` (amount 1) in the first
 * 0.1 h after it, otherwise `none` (amount 0). LIVE (`replay === false`) is always `none`.
 */
export function buildup(hoursToBoundary: number, hoursSinceBoundary: number, replay: boolean): { phase: BuildPhase; amount: number } {
  if (!replay) return { phase: "none", amount: 0 };
  if (hoursToBoundary <= BUILD_HOURS) return { phase: "build", amount: clamp(1 - hoursToBoundary / BUILD_HOURS, 0, 1) };
  if (hoursSinceBoundary < HIT_HOURS) return { phase: "hit", amount: 1 };
  return { phase: "none", amount: 0 };
}
