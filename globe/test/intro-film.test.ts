import { describe, expect, it } from "vitest";
import { FILM_SECONDS, LIVE_VIEW, SETTLE_FROM, SETTLE_TO, shotAt } from "../src/personal/intro-film";

const words = (t: number) => Object.values(shotAt(t).text);

describe("the opening film", () => {
  it("starts black and far, with no words and the sound at full", () => {
    const a = shotAt(0);
    expect(a.black).toBe(1);
    expect(a.dist).toBeCloseTo(9, 0);
    expect(words(0).every((v) => v === 0)).toBe(true);
    expect(a.music).toBe(1);
  });
  it("closes in less than before (a fifth less) and keeps the glow soft while the globe is far", () => {
    expect(shotAt(3.2).dist).toBeCloseTo(1.96, 5);
    expect(1.57 / 1.96).toBeLessThan(0.81); // 20 % less magnification than 1.57
    expect(shotAt(0.8).glow).toBeLessThan(0.7);
    expect(shotAt(6).glow).toBeGreaterThan(1.8);
  });
  it("shows no words while the routes light, then the mark, then each line in turn, each held long enough to read", () => {
    for (const t of [1, 3, 5, 6.5]) expect(words(t).every((v) => v === 0)).toBe(true);
    const start = (k: "brand" | "l1" | "l2" | "world") => { for (let t = 0; t < SETTLE_FROM; t += 0.05) if (shotAt(t).text[k] > 0.5) return t; return Infinity; };
    expect(start("l1")).toBeGreaterThan(start("brand"));
    expect(start("l2")).toBeGreaterThan(start("l1"));
    expect(start("world")).toBeGreaterThan(start("l2")); // A WORLD OF MUSIC comes last, under the two lines
    let all = 0;
    for (let t = 0; t < SETTLE_FROM; t += 0.05) if (words(t).every((v) => v > 0.95)) all += 0.05;
    expect(all).toBeGreaterThan(3); // the mark, both lines and A WORLD OF MUSIC together
    expect(shotAt(SETTLE_FROM + 0.3).text.world).toBe(0);
  });
  it("moves back to exactly the live screen's view after the words, and the music is out before it arrives", () => {
    expect(shotAt(SETTLE_FROM - 1).dist).toBeLessThan(2.3);
    const z = shotAt(SETTLE_TO);
    expect([z.dist, z.lat, z.lon]).toEqual([LIVE_VIEW.dist, LIVE_VIEW.lat, LIVE_VIEW.lon]);
    expect(shotAt(SETTLE_TO - 0.3).music).toBe(0);
    expect(shotAt(FILM_SECONDS).black).toBe(0);
  });
});
