import { describe, expect, it } from "vitest";
import { haversineKm, initialBearing, interpolateGreatCircle } from "../src/geo.js";

describe("geo", () => {
  it("haversine IST→JFK ≈ 8027 km", () => {
    expect(haversineKm(41.2613, 28.742, 40.6398, -73.7789)).toBeCloseTo(8027.1, 0);
  });

  it("bearings from Istanbul", () => {
    expect(initialBearing(41.275, 28.752, 40.6398, -73.7789)).toBeCloseTo(308.9, 1); // JFK
    expect(initialBearing(41.275, 28.752, 35.765, 140.386)).toBeCloseTo(49.8, 1); // NRT
    expect(initialBearing(41.275, 28.752, -26.139, 28.246)).toBeCloseTo(180.5, 1); // JNB
  });

  it("cardinal bearings", () => {
    expect(initialBearing(0, 0, 10, 0)).toBeCloseTo(0, 6);
    expect(initialBearing(0, 0, 0, 10)).toBeCloseTo(90, 6);
  });

  it("great-circle interpolation", () => {
    const [lat, lon] = interpolateGreatCircle(0, 0, 0, 90, 0.5);
    expect(lat).toBeCloseTo(0, 6);
    expect(lon).toBeCloseTo(45, 6);
    expect(interpolateGreatCircle(10, 20, 10, 20, 0.3)).toEqual([10, 20]);
  });
});
