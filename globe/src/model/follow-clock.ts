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
