import type { TrackerState } from "./day-schema.js";
import { RESUME_WINDOW } from "./tracker.js";

export const ACTIVE_WINDOW = 3 * 3600;
export const FULL_SWEEP_EVERY = 30 * 60;

/** Two-tier polling: whole fleet every FULL_SWEEP_EVERY, otherwise only aircraft likely to be flying. */
export function selectHexes(fleet: string[], state: TrackerState, now: number): { hexes: string[]; full: boolean } {
  const all = [...fleet].sort();
  const seen = state.seen;
  if (
    state.lastFullSweepAt === undefined ||
    now - state.lastFullSweepAt >= FULL_SWEEP_EVERY ||
    !seen ||
    Object.keys(seen).length === 0
  ) {
    return { hexes: all, full: true };
  }
  const wanted = new Set<string>();
  for (const [hex, t] of Object.entries(seen)) if (now - t <= ACTIVE_WINDOW) wanted.add(hex);
  for (const f of state.flights) {
    if (f.arr === null || (f.end === "LAST_CONTACT" && now - f.lastContact <= RESUME_WINDOW)) wanted.add(f.icao24);
  }
  return { hexes: all.filter((h) => wanted.has(h)), full: false };
}
