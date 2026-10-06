import { describe, expect, it } from "vitest";
import { LEVELS, initQuality, updateQuality } from "../src/render/quality";

const feed = (s = initQuality(), fps: number, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.5) s = updateQuality(s, fps, 0.5);
  return s;
};

describe("quality", () => {
  it("levels", () => {
    expect(LEVELS).toEqual([
      { tunnelScale: 1, bloomScale: 0.5 },
      { tunnelScale: 0.5, bloomScale: 0.5 },
      { tunnelScale: 0.5, bloomScale: 0.25 },
    ]);
  });
  it("steps down after 5 s below 45 fps", () => {
    expect(feed(undefined, 40, 4.5).level).toBe(0);
    expect(feed(undefined, 40, 5).level).toBe(1);
    expect(feed(undefined, 40, 10).level).toBe(2);
    expect(feed(undefined, 40, 30).level).toBe(2);
  });
  it("steps up after 10 s above 58 fps", () => {
    const low = feed(undefined, 40, 10);
    expect(feed(low, 60, 9.5).level).toBe(2);
    expect(feed(low, 60, 10).level).toBe(1);
  });
  it("mid-range fps resets both timers", () => {
    let s = feed(undefined, 40, 4.5);
    s = updateQuality(s, 50, 0.5);
    s = feed(s, 40, 4.5);
    expect(s.level).toBe(0);
  });
});
