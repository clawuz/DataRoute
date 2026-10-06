export type Phase = "REPLAY" | "LIVE";

export interface CycleConfig {
  replaySec: number;
  liveSec: number;
  holdSec: number;
}

export const CYCLE: CycleConfig = { replaySec: 90, liveSec: 30, holdSec: 20 };

export interface Bounds {
  start: number;
  end: number;
}

export interface CycleState {
  phase: Phase;
  elapsed: number; // seconds into the current phase
  tRel: number; // displayed time, seconds relative to window.from
  paused: boolean;
  manual: boolean;
  idle: number; // seconds since the last input while manual
}

export type CycleAction = { type: "togglePause" } | { type: "scrub"; delta: number } | { type: "interact" };

export function initCycle(b: Bounds): CycleState {
  return { phase: "REPLAY", elapsed: 0, tRel: b.start, paused: false, manual: false, idle: 0 };
}

export function stepCycle(s: CycleState, dt: number, b: Bounds, cfg: CycleConfig = CYCLE): CycleState {
  let { phase, elapsed, tRel, paused, manual, idle } = s;
  if (manual) {
    idle += dt;
    if (idle >= cfg.holdSec) {
      manual = false;
      paused = false;
      idle = 0;
    }
  }
  if (!paused) {
    elapsed += dt;
    if (phase === "REPLAY") {
      if (elapsed >= cfg.replaySec) {
        phase = "LIVE";
        elapsed = 0;
        tRel = b.end;
      } else {
        tRel = b.start + (b.end - b.start) * (elapsed / cfg.replaySec);
      }
    } else {
      tRel = b.end;
      if (elapsed >= cfg.liveSec) {
        phase = "REPLAY";
        elapsed = 0;
        tRel = b.start;
      }
    }
  }
  return { phase, elapsed, tRel, paused, manual, idle };
}

export function applyAction(s: CycleState, a: CycleAction, b: Bounds, cfg: CycleConfig = CYCLE): CycleState {
  const base: CycleState = { ...s, manual: true, idle: 0 };
  switch (a.type) {
    case "interact":
      return base;
    case "togglePause":
      return { ...base, paused: !s.paused };
    case "scrub": {
      const span = Math.max(1, b.end - b.start);
      const tRel = Math.min(b.end, Math.max(b.start, s.tRel + a.delta));
      return { ...base, phase: "REPLAY", tRel, elapsed: ((tRel - b.start) / span) * cfg.replaySec };
    }
  }
}
