import { easeInOut, smoothDamp } from "./follow-rig";

export const TIME_SNAP_SEC = 600;
export const TIME_SMOOTH_SEC = 1.2;
export const TIME_DONE_SEC = 1;

export interface TimeEase {
  shown: number;
  vel: number;
}

/** Eases the displayed absolute time toward `target`: small jumps snap, big ones (follow enter/leave) glide. */
export function easeAbsTime(s: TimeEase | null, target: number, dt: number): TimeEase {
  if (!s) return { shown: target, vel: 0 };
  const diff = target - s.shown;
  if (Math.abs(diff) <= TIME_SNAP_SEC) return { shown: target, vel: 0 };
  const [shown, vel] = smoothDamp(s.shown, target, s.vel, TIME_SMOOTH_SEC, dt);
  if (Math.abs(target - shown) <= TIME_DONE_SEC) return { shown: target, vel: 0 };
  return { shown, vel };
}

/** Seconds the displayed time takes to glide when a follow starts or ends. */
export const REWIND_SEC = 1;

/** Displayed time between `from` (t01 = 0) and `to` (t01 = 1), eased in and out. */
export function blendCur(from: number, to: number, t01: number): number {
  const k = easeInOut(Math.min(1, Math.max(0, t01)));
  return from + (to - from) * k;
}
