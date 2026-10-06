import { describe, expect, it } from "vitest";
import { easeAbsTime, type TimeEase } from "../src/camera/time-ease";

describe("easeAbsTime", () => {
  it("initialises to the target on first call", () => {
    expect(easeAbsTime(null, 1000, 0.016)).toEqual({ shown: 1000, vel: 0 });
  });
  it("snaps for small jumps", () => {
    const r = easeAbsTime({ shown: 1000, vel: 5 }, 1500, 0.016);
    expect(r).toEqual({ shown: 1500, vel: 0 });
  });
  it("converges for a 6 h jump without overshoot", () => {
    const target = 1000 + 6 * 3600;
    let s: TimeEase = { shown: 1000, vel: 0 };
    let prev = s.shown;
    let steps = 0;
    while (s.shown !== target && steps < 2000) {
      s = easeAbsTime(s, target, 1 / 60);
      expect(s.shown).toBeLessThanOrEqual(target);
      expect(s.shown).toBeGreaterThanOrEqual(prev);
      prev = s.shown;
      steps++;
    }
    expect(s.shown).toBe(target);
    expect(steps).toBeGreaterThan(30);
  });
});
