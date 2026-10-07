import { AdditiveBlending, BackSide, Matrix3, PerspectiveCamera, Texture } from "three";
import { describe, expect, it } from "vitest";
import { createAtmosphere } from "../src/scene/atmosphere";
import { createSunGlare } from "../src/scene/sun-glare";
import { EARTH_FRAG, createEarth } from "../src/scene/earth";
import { createSpace } from "../src/scene/space";
import type { EarthTextures } from "../src/scene/textures";

describe("earth", () => {
  it("is a unit sphere with the planet look wired to uniforms", () => {
    const e = createEarth();
    const g = e.mesh.geometry as unknown as { parameters: { radius: number } };
    expect(g.parameters.radius).toBe(1);
    for (const needle of ["sphereUV", "uSunDir", "uNight", "uClouds", "uHasTex", "reinhard"]) {
      expect(EARTH_FRAG).toContain(needle);
    }
    expect(e.uniforms.uHasTex.value).toBe(0);
    e.dispose();
  });

  it("setSun normalises, setTextures toggles uHasTex, setCloudDrift wraps", () => {
    const e = createEarth();
    e.setSun([0, 3, 4]);
    expect(e.uniforms.uSunDir.value.length()).toBeCloseTo(1, 9);
    expect(e.uniforms.uSunDir.value.y).toBeCloseTo(0.6, 9);
    const tex: EarthTextures = { tier: "4k", day: new Texture(), night: new Texture(), clouds: new Texture() };
    e.setTextures(tex);
    expect(e.uniforms.uHasTex.value).toBe(1);
    expect(e.uniforms.uDay.value).toBe(tex.day);
    e.setTextures(null);
    expect(e.uniforms.uHasTex.value).toBe(0);
    e.setCloudDrift(2.25);
    expect(e.uniforms.uCloudDrift.value).toBeCloseTo(0.25, 9);
    e.dispose();
  });
});

describe("atmosphere", () => {
  it("is an additive back-face shell slightly larger than the Earth", () => {
    const a = createAtmosphere();
    const m = a.mesh.material as import("three").ShaderMaterial;
    expect(m.side).toBe(BackSide);
    expect(m.blending).toBe(AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    expect((a.mesh.geometry as unknown as { parameters: { radius: number } }).parameters.radius).toBeGreaterThan(1.02);
    a.setSun([1, 0, 0]);
    expect(m.uniforms.uSunDir.value.x).toBeCloseTo(1, 9);
    a.dispose();
  });
});

describe("space", () => {
  it("has a depth-tested star quad and a nebula tunnel with low energy", () => {
    const s = createSpace();
    const mat = s.stars.material as import("three").ShaderMaterial;
    expect(mat.depthTest).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.uniforms.uInvRot.value).toBeInstanceOf(Matrix3);
    expect(s.nebula.uniforms.u_energy.value).toBeLessThan(0.5);
    s.dispose();
  });

  it("update copies the camera orientation and projection into the star uniforms", () => {
    const s = createSpace();
    const cam = new PerspectiveCamera(40, 2, 0.05, 50);
    cam.position.set(0, 0, 3.2);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    s.update(cam);
    const u = (s.stars.material as import("three").ShaderMaterial).uniforms;
    expect(u.uAspect.value).toBe(2);
    expect(u.uTanHalf.value).toBeCloseTo(Math.tan((40 * Math.PI) / 360), 9);
    s.dispose();
  });
});

describe("earth uniforms", () => {
  it("every uniform declared in EARTH_FRAG is provided by the material", () => {
    const declared = [...EARTH_FRAG.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(5);
    const e = createEarth();
    try {
      for (const name of declared) expect(Object.keys(e.uniforms)).toContain(name);
    } finally {
      e.dispose();
    }
  });
});

describe("art:light", () => {
  it("earth exposes a cloud-shadow uniform driven by setLight", () => {
    const e = createEarth();
    expect(e.uniforms.uCloudShadow.value).toBe(0);
    e.setLight({ cloudShadow: true });
    expect(e.uniforms.uCloudShadow.value).toBe(1);
    e.setLight({ cloudShadow: false });
    expect(e.uniforms.uCloudShadow.value).toBe(0);
    e.dispose();
  });
  it("sun glare is hidden by default, toggles, and sits 30 units along the sun direction", () => {
    const g = createSunGlare();
    expect(g.mesh.visible).toBe(false);
    g.setVisible(true);
    expect(g.mesh.visible).toBe(true);
    g.setSun([0, 2, 0]);
    expect(g.mesh.position.y).toBeCloseTo(30, 9);
    expect(g.mesh.position.x).toBeCloseTo(0, 9);
    expect(() => g.dispose()).not.toThrow();
  });
});
