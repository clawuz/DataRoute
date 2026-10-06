import { describe, expect, it } from "vitest";
import { applyAction, initCycle, stepCycle, type CycleState } from "../src/cycle/machine";

const B = { start: 3600, end: 86400 };
const run = (s: CycleState, seconds: number, dt = 0.5) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) s = stepCycle(s, dt, B);
  return s;
};

describe("cycle machine", () => {
  it("starts in REPLAY at the replay start", () => {
    expect(initCycle(B)).toEqual({ phase: "REPLAY", elapsed: 0, tRel: 3600, paused: false, manual: false, idle: 0 });
  });

  it("replays linearly over 90 s", () => {
    const s = run(initCycle(B), 45);
    expect(s.phase).toBe("REPLAY");
    expect(s.tRel).toBeCloseTo(3600 + (86400 - 3600) / 2, 3);
  });

  it("switches to LIVE at the end, then back to REPLAY after 30 s", () => {
    let s = run(initCycle(B), 90);
    expect(s.phase).toBe("LIVE");
    expect(s.tRel).toBe(86400);
    s = run(s, 30);
    expect(s.phase).toBe("REPLAY");
    expect(s.tRel).toBe(3600);
  });

  it("pause freezes progression", () => {
    let s = run(initCycle(B), 10);
    s = applyAction(s, { type: "togglePause" }, B);
    const frozen = s.tRel;
    s = run(s, 10);
    expect(s.tRel).toBe(frozen);
    expect(s.paused).toBe(true);
  });

  it("manual mode ends 20 s after the last input and un-pauses", () => {
    let s = applyAction(initCycle(B), { type: "togglePause" }, B);
    s = run(s, 19.5);
    expect(s.manual).toBe(true);
    expect(s.paused).toBe(true);
    s = run(s, 1);
    expect(s.manual).toBe(false);
    expect(s.paused).toBe(false);
  });

  it("interact keeps the cycle running", () => {
    let s = applyAction(initCycle(B), { type: "interact" }, B);
    s = run(s, 9);
    expect(s.manual).toBe(true);
    expect(s.tRel).toBeGreaterThan(3600);
  });

  it("scrub clamps, switches to REPLAY and keeps elapsed consistent", () => {
    let s = run(initCycle(B), 95); // LIVE
    s = applyAction(s, { type: "scrub", delta: -3600 }, B);
    expect(s.phase).toBe("REPLAY");
    expect(s.tRel).toBe(86400 - 3600);
    expect(s.elapsed).toBeCloseTo(((86400 - 3600 - 3600) / (86400 - 3600)) * 90, 6);
    s = applyAction(s, { type: "scrub", delta: -999999 }, B);
    expect(s.tRel).toBe(3600);
    const next = stepCycle(s, 1, B);
    expect(next.tRel).toBeCloseTo(3600 + (86400 - 3600) / 90, 3);
  });

  it("empty bounds stay put", () => {
    const empty = { start: 0, end: 0 };
    const s = stepCycle(initCycle(empty), 1, empty);
    expect(s.tRel).toBe(0);
  });
});
