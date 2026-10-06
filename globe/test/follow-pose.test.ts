import { describe, expect, it } from "vitest";
import { chaseFor } from "../src/camera/follow-pose";
import { latLonToVec3, type Vec3 } from "../src/geo3d/vec";

// a flight along the equator at radius 1, moving east 1° per 100 s
const posAt = (u: number): Vec3 => latLonToVec3(0, u / 100, 1);

describe("chaseFor", () => {
  it("sits behind and above the head and looks ahead along the track", () => {
    const p = chaseFor(posAt, 0)!;
    expect(p.pos[0]).toBeCloseTo(-0.4, 6); // 0.40 behind (west)
    expect(p.pos[2]).toBeCloseTo(1.2, 6); // 0.20 above the surface
    expect(p.target[0]).toBeCloseTo(0.25, 6); // 0.25 ahead (east)
    expect(p.target[2]).toBeCloseTo(0.96, 6); // tilted 0.04 toward the surface
    expect(p.up).toEqual([0, 0, 1].map((x) => expect.closeTo(x, 6)) as unknown as [number, number, number]);
  });

  it("is null when the track is unavailable or has no direction", () => {
    expect(chaseFor(() => null, 0)).toBeNull();
    expect(chaseFor(() => [0, 0, 1], 0)).toBeNull();
  });
});

describe("chaseFor one-sided differences", () => {
  it("works when only the forward neighbour exists", () => {
    const p = chaseFor((u) => (u < 0 ? null : posAt(u)), 0)!;
    expect(p).not.toBeNull();
    expect(p.target[0]).toBeGreaterThan(p.pos[0]);
  });
  it("works when only the backward neighbour exists", () => {
    const p = chaseFor((u) => (u > 0 ? null : posAt(u)), 0)!;
    expect(p).not.toBeNull();
    expect(p.target[0]).toBeGreaterThan(p.pos[0]);
  });
});
