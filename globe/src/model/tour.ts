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
