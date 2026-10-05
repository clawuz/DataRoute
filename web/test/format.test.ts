import { describe, expect, it } from "vitest";
import { fmtAgo, fmtElapsed, fmtFL, fmtInt, fmtKm, fmtUtc } from "../src/lib/format";

describe("format", () => {
  it("fmtInt", () => {
    expect(fmtInt(2031)).toBe("2,031");
    expect(fmtInt(12.6)).toBe("13");
  });
  it("fmtKm", () => {
    expect(fmtKm(1940000)).toBe("1.94M");
    expect(fmtKm(28613)).toBe("29K");
    expect(fmtKm(950.4)).toBe("950");
  });
  it("fmtFL", () => {
    expect(fmtFL(370)).toBe("FL370");
    expect(fmtFL(5)).toBe("FL005");
    expect(fmtFL(-3)).toBe("FL000");
  });
  it("fmtUtc", () => {
    expect(fmtUtc(Date.UTC(2026, 9, 5, 8, 42) / 1000)).toBe("08:42 UTC");
  });
  it("fmtAgo", () => {
    expect(fmtAgo(14)).toBe("14 S AGO");
    expect(fmtAgo(720)).toBe("12 MIN AGO");
    expect(fmtAgo(7300)).toBe("2H AGO");
    expect(fmtAgo(-5)).toBe("0 S AGO");
  });
  it("fmtElapsed", () => {
    expect(fmtElapsed(22320)).toBe("06:12");
    expect(fmtElapsed(-100)).toBe("00:00");
  });
});
