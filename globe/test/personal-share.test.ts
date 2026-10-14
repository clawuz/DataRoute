import { describe, expect, it } from "vitest";
import { flagsOf, wrap } from "../src/personal/card";
import { extOf, pickMime } from "../src/personal/clip";

describe("share card helpers", () => {
  it("lists distinct country flags in picked order, capped", () => {
    expect(flagsOf(["LHR", "MAN", "JFK", "DPS"], 3)).toEqual(["GB", "US", "ID"]);
    expect(flagsOf(["ZZZ"], 5)).toEqual([]);
  });
  it("wraps words to a width", () => {
    const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) };
    expect(wrap(ctx, "WANDERING THROUGH THE AMERICAS", 150)).toEqual(["WANDERING", "THROUGH THE", "AMERICAS"]);
    expect(wrap(ctx, "SHORT", 500)).toEqual(["SHORT"]);
  });
});

describe("clip", () => {
  it("prefers mp4, falls back to webm, or null", () => {
    expect(pickMime((m) => m.startsWith("video/mp4"))).toMatch(/^video\/mp4/);
    expect(pickMime((m) => m === "video/webm")).toBe("video/webm");
    expect(pickMime(() => false)).toBeNull();
    expect(extOf("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extOf("video/webm")).toBe("webm");
  });
});
