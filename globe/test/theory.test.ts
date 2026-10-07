import { describe, expect, it } from "vitest";
import { euclid, freqOf, isWestNorth, routeHash, routeKey } from "../src/audio/theory";

const T = true;
const F = false;

describe("pitch and route helpers", () => {
  it("freqOf anchors A2 = 110 Hz", () => {
    expect(freqOf(2, 0)).toBe(110);
    expect(freqOf(3, 0)).toBe(220);
    expect(freqOf(2, 12)).toBeCloseTo(220, 9);
    expect(freqOf(1, 5)).toBeCloseTo(55 * 2 ** (5 / 12), 9); // D1, the Dm9 bass root
  });
  it("keys are order-independent; hashes are stable FNV-1a", () => {
    expect(routeKey("JFK", "IST", "x")).toBe("IST-JFK");
    expect(routeKey("IST", undefined, "f7")).toBe("f7");
    expect(routeHash("IST-JFK")).toBe(routeHash("IST-JFK"));
    expect(routeHash("")).toBe(0x811c9dc5);
    expect(routeHash("a")).toBe(0xe40c292c);
  });
});

describe("euclidean rhythms (Bjorklund)", () => {
  it("canonical patterns", () => {
    expect(euclid(5, 8)).toEqual([T, F, T, T, F, T, T, F]);
    expect(euclid(3, 8)).toEqual([T, F, F, T, F, F, T, F]);
    expect(euclid(2, 4)).toEqual([T, F, T, F]);
    expect(euclid(6, 8)).toEqual([T, F, T, T, T, F, T, T]);
  });
  it("always n long with exactly k onsets; k ≥ n all on, k ≤ 0 all off", () => {
    const count = (p: boolean[]) => p.filter(Boolean).length;
    expect([euclid(5, 12).length, count(euclid(5, 12))]).toEqual([12, 5]);
    expect([euclid(5, 16).length, count(euclid(5, 16))]).toEqual([16, 5]);
    expect(euclid(5, 12)).toEqual([T, F, F, T, F, T, F, F, T, F, T, F]);
    expect(euclid(5, 16)).toEqual([T, F, F, T, F, F, T, F, F, T, F, F, T, F, F, F]);
    expect(euclid(4, 4)).toEqual([T, T, T, T]);
    expect(euclid(9, 4)).toEqual([T, T, T, T]);
    expect(euclid(0, 3)).toEqual([F, F, F]);
    expect(euclid(-2, 3)).toEqual([F, F, F]);
    for (let n = 1; n <= 16; n++) for (let k = 0; k <= n; k++) expect([euclid(k, n).length, count(euclid(k, n))]).toEqual([n, k]);
  });
});

describe("isWestNorth", () => {
  it("west of 20E or north of 52N", () => {
    expect(isWestNorth(51.5, -0.5)).toBe(true); // London
    expect(isWestNorth(40.4, -3.7)).toBe(true); // Madrid
    expect(isWestNorth(59.6, 18.0)).toBe(true); // Stockholm
    expect(isWestNorth(37.9, 23.7)).toBe(false); // Athens
    expect(isWestNorth(44.4, 26.1)).toBe(false); // Bucharest
    expect(isWestNorth(55.9, 37.4)).toBe(true); // Moscow: lat > 52 (documents the rule)
    expect(isWestNorth(44.8, 20.3)).toBe(false); // Belgrade
  });
});
