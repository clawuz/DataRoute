import { describe, expect, it } from "vitest";
import { earthRotationRad, gmstDeg, julianDay, sunDirection, sunPosition, subSolarPoint, wrap180 } from "../src/astro";

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0) / 1000; // 946728000
const at = (iso: string) => Date.parse(iso) / 1000;

describe("astro", () => {
  it("julian day of the unix epoch and J2000", () => {
    expect(julianDay(0)).toBe(2440587.5);
    expect(julianDay(J2000)).toBeCloseTo(2451545.0, 6);
  });

  it("GMST at J2000 is 280.4606°", () => {
    expect(gmstDeg(J2000)).toBeCloseTo(280.4606, 3);
  });

  it("GMST advances 360° per sidereal day", () => {
    const t = at("2026-10-06T00:00:00Z");
    const a = gmstDeg(t);
    const b = gmstDeg(t + 86164.0905);
    const d = Math.abs(((b - a + 540) % 360) - 180);
    expect(d).toBeLessThan(0.01);
  });

  it("sun position at J2000", () => {
    const p = sunPosition(J2000);
    expect(p.raDeg).toBeCloseTo(281.2858, 2);
    expect(p.decDeg).toBeCloseTo(-23.0334, 2);
  });

  it("declination at equinox and solstices", () => {
    expect(sunPosition(at("2026-03-20T12:00:00Z")).decDeg).toBeCloseTo(-0.0434, 2);
    expect(sunPosition(at("2026-06-21T12:00:00Z")).decDeg).toBeCloseTo(23.4351, 2);
    expect(sunPosition(at("2026-12-21T12:00:00Z")).decDeg).toBeCloseTo(-23.4345, 2);
  });

  it("sub-solar point on 2026-10-06 12:00 UTC", () => {
    const p = subSolarPoint(at("2026-10-06T12:00:00Z"));
    expect(p.latDeg).toBeCloseTo(-5.2293, 2);
    expect(p.lonDeg).toBeCloseTo(-2.9744, 2);
  });

  it("sub-solar longitude is within the equation of time of 0° at 12:00 UTC all year", () => {
    for (const m of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const p = subSolarPoint(Date.UTC(2026, m, 15, 12, 0, 0) / 1000);
      expect(Math.abs(p.lonDeg)).toBeLessThan(4.5);
    }
  });

  it("sun direction is a unit vector matching (cosδ sinα, sinδ, cosδ cosα)", () => {
    const t = at("2026-10-06T12:00:00Z");
    const [x, y, z] = sunDirection(t);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
    const p = sunPosition(t);
    const a = (p.raDeg * Math.PI) / 180;
    const d = (p.decDeg * Math.PI) / 180;
    expect(x).toBeCloseTo(Math.cos(d) * Math.sin(a), 9);
    expect(y).toBeCloseTo(Math.sin(d), 9);
    expect(z).toBeCloseTo(Math.cos(d) * Math.cos(a), 9);
  });

  it("earthRotationRad is GMST in radians", () => {
    expect(earthRotationRad(J2000)).toBeCloseTo((280.4606 * Math.PI) / 180, 4);
  });

  it("wrap180", () => {
    expect(wrap180(190)).toBeCloseTo(-170, 9);
    expect(wrap180(-190)).toBeCloseTo(170, 9);
    expect(wrap180(0)).toBe(0);
    expect(wrap180(360)).toBeCloseTo(0, 9);
  });
});
