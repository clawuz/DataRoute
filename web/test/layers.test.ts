import { DoubleSide, type ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { radiusFor } from "../src/data/mapping";
import { buildModel } from "../src/data/model";
import { REGION_RGB } from "../src/data/palette";
import { computeHeads, createHeads } from "../src/render/heads";
import { buildSegments, createRibbons } from "../src/render/ribbons";
import { TUNNEL_FRAG, createTunnel } from "../src/render/tunnel";
import { FROM, flight, makeDay } from "./helpers";

const m = buildModel(
  makeDay({
    flights: [
      flight({ region: "EUR", bearing: 90, dep: FROM + 100, arr: null, s: [[0, 0, 0, 0], [100, 100, 0, 1], [200, 300, 0, 2]] }),
      flight({ region: "AME", bearing: 0, dep: FROM + 100, arr: FROM + 150, s: [[0, 50, 0, 0], [50, 0, 0, 1]] }),
    ],
  }),
);

describe("tunnel", () => {
  it("keeps the reference ray-march and adds the data uniforms", () => {
    expect(TUNNEL_FRAG).toContain("p.x += t / 0.2;");
    expect(TUNNEL_FRAG).toContain("for ( ; i++ < 5e1;");
    expect(TUNNEL_FRAG).toContain("clamp(x, -15.0, 15.0)");
    for (const u of ["vec2 u_res;", "float u_time;", "float u_energy;", "vec3 u_tint;", "float u_fade;"]) {
      expect(TUNNEL_FRAG).toContain(`uniform ${u}`);
    }
  });

  it("render target follows the quality scale", () => {
    const t = createTunnel();
    t.setSize(1000, 500, 0.5);
    expect(t.uniforms.u_res.value.toArray()).toEqual([500, 250]);
    expect(t.uniforms.u_energy.value).toBeCloseTo(0.55, 6);
    expect(t.display.renderOrder).toBe(-1);
    t.dispose();
  });
});

describe("ribbons", () => {
  it("builds one instance per segment", () => {
    const s = buildSegments(m);
    expect(s.count).toBe(3);
    expect(Array.from(s.a.slice(0, 4))).toEqual([100, 0, 200, 100]);
    expect(Array.from(s.b.slice(0, 4))).toEqual([200, 100, 300, 300]);
    expect(Array.from(s.flight.slice(0, 4))).toEqual([90, 1, 86400, 0]);
    expect(Array.from(s.flight.slice(8, 12))).toEqual([0, 5, 150, 1]);
  });

  it("creates an instanced mesh with resolution-aware width", () => {
    const r = createRibbons(m);
    expect((r.mesh.geometry as unknown as { instanceCount: number }).instanceCount).toBe(3);
    r.setResolution(1920, 1080, 2);
    expect(r.uniforms.uRes.value.toArray()).toEqual([1920, 1080]);
    expect(r.uniforms.uWidth.value).toBeCloseTo(2.8, 6);
    r.dispose();
  });
});

describe("ribbon culling", () => {
  it("ribbon material is double-sided so winding cannot cull it", () => {
    const r = createRibbons(m);
    expect((r.mesh.material as ShaderMaterial).side).toBe(DoubleSide);
    r.dispose();
  });
});

describe("heads", () => {
  it("places airborne flights on the now-plane with region colour", () => {
    const pos = new Float32Array(30);
    const col = new Float32Array(30);
    const idx = new Float32Array(10);
    const n = computeHeads(m, 250, pos, col, idx);
    expect(n).toBe(1); // flight 1 landed at 150
    expect(pos[0]).toBeCloseTo(radiusFor(200), 5); // alt halfway 100→300, bearing 90 → +x
    expect(pos[1]).toBeCloseTo(0, 5);
    expect(pos[2]).toBeCloseTo(0, 6);
    expect(Array.from(col.slice(0, 3))).toEqual(REGION_RGB[1].map((c) => Math.fround(c)));
    expect(idx[0]).toBe(0);
  });

  it("respects the capacity", () => {
    const n = computeHeads(m, 120, new Float32Array(3), new Float32Array(3), new Float32Array(1), 1);
    expect(n).toBe(1);
  });

  it("update sets the draw range", () => {
    const h = createHeads();
    expect(h.update(m, 120, 0, -1)).toBe(2);
    expect(h.points.geometry.drawRange.count).toBe(2);
    h.dispose();
  });
});
