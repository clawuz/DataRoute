import { cruiseFt } from "./flight";

/**
 * The altitude of the flight sets three small things on a note: how loud it is, how bright it is and how much room it has
 * (docs/superpowers/specs/2026-10-27-altitude-feel-design.md). All constants live here so that they can be tuned by ear.
 */
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** loudness: `vel × (LOUD_BASE + LOUD_SPAN × h)`: −12% on the ground, +12% at cruise */
export const LOUD_BASE = 0.88;
export const LOUD_SPAN = 0.24;
/** brightness: a low-pass at `CUT_LOW + CUT_SPAN × h^CUT_CURVE` Hz, Q `CUT_Q` */
export const CUT_LOW = 1400;
export const CUT_SPAN = 7600;
export const CUT_CURVE = 1.2;
export const CUT_Q = 0.6;
/** room: the reverb `wet` moves by `WET_SPAN × (h − 0.5)` */
export const WET_SPAN = 0.1;

/** how high the flight is: 0 on the ground … 1 at the cruise of a route of `distKm` */
export const heightOf = (altFt: number, distKm: number): number => clamp(altFt / cruiseFt(distKm), 0, 1);

/** the factor on the velocity of a note at height `h` */
export const velScale = (h: number): number => LOUD_BASE + LOUD_SPAN * clamp(h, 0, 1);

/** the low-pass cutoff (Hz) of a note at height `h` */
export const cutoffOf = (h: number): number => CUT_LOW + CUT_SPAN * clamp(h, 0, 1) ** CUT_CURVE;

/** how much the reverb of a note moves at height `h` (−0.05 … +0.05) */
export const wetShift = (h: number): number => WET_SPAN * (clamp(h, 0, 1) - 0.5);

/**
 * The flight run (nağme): four scale degrees that climb (`direction` 1) or fall (−1) from the last degree of a bar's hook line,
 * by 1, 2, 3, 4 degrees: a take-off and a landing the ear can follow.
 */
export const flightRun = (direction: 1 | -1, lastTotal: number): number[] => [1, 2, 3, 4].map((k) => lastTotal + direction * k);

/** the run climbs while the phrase of the route begins its climb (phase at the start of the bar below this) */
export const RUN_CLIMB_BELOW = 0.18;
/** the run falls while the phrase ends its descent (phase at the end of the bar above this) */
export const RUN_FALL_ABOVE = 0.82;
/** the velocity of a run note against the hook's */
export const RUN_VEL = 0.8;
