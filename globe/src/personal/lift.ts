import type { PersonalMode } from "./codec";

/** how many bars at the end of the chorus are lifted */
export const LIFT_BARS = 8;

/**
 * The key lift of a trip that really crosses regions: up a minor third (+3) for a visited trip, the same mood, higher;
 * up a whole step (+2) for a wish. A trip inside one region has none.
 */
export const liftFor = (mode: PersonalMode, regions: string[]): number => (new Set(regions).size < 2 ? 0 : mode === "visited" ? 3 : 2);

/** the lift (semitones) of a bar: only the last `LIFT_BARS` bars of the chorus are lifted */
export const liftAt = (bar: number, chorusFirst: number, chorusLen: number, lift: number): number =>
  bar >= chorusFirst + chorusLen - LIFT_BARS && bar < chorusFirst + chorusLen ? lift : 0;
