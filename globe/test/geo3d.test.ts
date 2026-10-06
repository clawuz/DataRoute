import { describe, expect, it } from "vitest";
import { destinationPoint, plannedArc, plannedLiftPeak } from "../src/geo3d/great";
import { resampleRun } from "../src/geo3d/resample";
import { ALT_EXAG, R_EARTH_KM, altitudeRadius, latLonToVec3, vec3ToLatLon } from "../src/geo3d/vec";

describe("vec", () => {
  it("cardinal points", () => {
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    close(latLonToVec3(0, 0), [0, 0, 1]);
    close(latLonToVec3(0, 90), [1, 0, 0]);
    close(latLonToVec3(90, 0), [0, 1, 0]);
    close(latLonToVec3(0, -90), [-1, 0, 0]);
    close(latLonToVec3(0, 0, 2), [0, 0, 2]);
  });

  it("round trip", () => {
    for (const [lat, lon] of [[41.26, 28.74], [-33.9, 151.2], [0, 179.9], [60, -170], [-80, 10]]) {
      const r = vec3ToLatLon(latLonToVec3(lat, lon, 1.03));
      expect(r.lat).toBeCloseTo(lat, 9);
      expect(r.lon).toBeCloseTo(lon, 9);
    }
  });

  it("altitudeRadius", () => {
    expect(ALT_EXAG).toBe(30);
    expect(R_EARTH_KM).toBe(6371.0088);
    expect(altitudeRadius(0)).toBe(1);
    expect(altitudeRadius(-5)).toBe(1);
    expect(altitudeRadius(370)).toBeCloseTo(1.0531, 4);
  });
});

describe("great circle helpers", () => {
  it("destinationPoint", () => {
    const [la, lo] = destinationPoint(0, 0, 90, 111.1949);
    expect(la).toBeCloseTo(0, 3);
    expect(lo).toBeCloseTo(1, 3);
    const [la2, lo2] = destinationPoint(41.275, 28.752, 308.918, 8027);
    expect(la2).toBeCloseTo(40.64, 1);
    expect(lo2).toBeCloseTo(-73.78, 1);
    const [, lo3] = destinationPoint(0, 179, 90, 222.39);
    expect(lo3).toBeCloseTo(-179, 2);
  });

  it("plannedLiftPeak is distance based and capped", () => {
    expect(plannedLiftPeak(0)).toBeCloseTo(0.004, 9);
    expect(plannedLiftPeak(625)).toBeCloseTo(0.0285, 4);
    expect(plannedLiftPeak(2500)).toBeCloseTo(0.053, 9);
    expect(plannedLiftPeak(10000)).toBeCloseTo(0.053, 9);
  });

  it("plannedArc IST → JFK", () => {
    const { points, distKm } = plannedArc({ lat: 41.2613, lon: 28.742 }, { lat: 40.6398, lon: -73.7789 }, 48);
    expect(points).toHaveLength(48);
    expect(distKm).toBeCloseTo(8027.1, 0);
    expect(points[0].u).toBe(0);
    expect(points[47].u).toBe(1);
    expect(points[0].lat).toBeCloseTo(41.2613, 5);
    expect(points[0].lon).toBeCloseTo(28.742, 5);
    expect(points[47].lat).toBeCloseTo(40.6398, 5);
    expect(points[47].lon).toBeCloseTo(-73.7789, 5);
    expect(points[0].radius).toBeCloseTo(1, 9);
    expect(points[47].radius).toBeCloseTo(1, 9);
    const mid = points.reduce((m, p) => Math.max(m, p.radius), 0);
    expect(mid).toBeCloseTo(1 + plannedLiftPeak(distKm), 3);
  });

  it("plannedArc between identical points does not blow up", () => {
    const { points } = plannedArc({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }, 8);
    expect(points).toHaveLength(8);
    expect(points[3].lat).toBeCloseTo(10, 9);
  });
});

describe("resampleRun", () => {
  const t = [0, 100, 200, 300];
  const alt = [100, 100, 100, 100];
  const lat = [0, 0, 0, 0];
  const lon = [0, 10, 20, 30];

  it("returns the raw samples when the run is short enough", () => {
    const out = resampleRun(t, alt, lat, lon, 0, 3, 10);
    expect(out).toHaveLength(4);
    expect(out[2]).toEqual({ t: 200, alt100: 100, lat: 0, lon: 20 });
  });

  it("resamples evenly in time with great-circle interpolation", () => {
    const out = resampleRun(t, alt, lat, lon, 0, 3, 3);
    expect(out.map((p) => p.t)).toEqual([0, 150, 300]);
    expect(out[1].lon).toBeCloseTo(15, 6);
    expect(out[1].lat).toBeCloseTo(0, 6);
    expect(out[1].alt100).toBeCloseTo(100, 6);
    expect(out[0].lon).toBeCloseTo(0, 9);
    expect(out[2].lon).toBeCloseTo(30, 6);
  });

  it("works on a sub-range and handles one-point and empty ranges", () => {
    expect(resampleRun(t, alt, lat, lon, 1, 2, 5).map((p) => p.t)).toEqual([100, 200]);
    expect(resampleRun(t, alt, lat, lon, 2, 2, 5)).toEqual([{ t: 200, alt100: 100, lat: 0, lon: 20 }]);
    expect(resampleRun(t, alt, lat, lon, 3, 2, 5)).toEqual([]);
  });

  it("interpolates altitude smoothly and never below zero", () => {
    const out = resampleRun([0, 100, 200, 300], [0, 400, 400, 0], [0, 0, 0, 0], [0, 1, 2, 3], 0, 3, 7);
    expect(out).toHaveLength(4); // n = 4 < maxPts → raw
    const out2 = resampleRun([0, 100, 200, 300, 400, 500], [0, 400, 400, 400, 400, 0], [0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5], 0, 5, 11);
    expect(out2).toHaveLength(6);
    const many = resampleRun(
      Array.from({ length: 40 }, (_, i) => i * 60),
      Array.from({ length: 40 }, (_, i) => (i < 5 ? i * 80 : 400)),
      Array.from({ length: 40 }, () => 0),
      Array.from({ length: 40 }, (_, i) => i * 0.1),
      0, 39, 12,
    );
    expect(many).toHaveLength(12);
    for (const p of many) expect(p.alt100).toBeGreaterThanOrEqual(0);
    expect(many[0].alt100).toBeCloseTo(0, 6);
    expect(many[11].alt100).toBeCloseTo(400, 6);
  });

  it("handles the antimeridian", () => {
    const out = resampleRun([0, 100, 200], [100, 100, 100], [0, 0, 0], [179, -179, -177], 0, 2, 2);
    expect(out).toHaveLength(2);
    const out3 = resampleRun([0, 100, 200, 300], [100, 100, 100, 100], [0, 0, 0, 0], [178, 179, -179, -178], 0, 3, 3);
    expect(Math.abs(out3[1].lon)).toBeCloseTo(180, 4); // midpoint of 178 → -178 crosses ±180
  });
});
