import { describe, expect, it } from "vitest";
import { ALT_MAX100, altTone } from "../src/scene/alt-tone";
import { REGION_RGB } from "@web/data/palette";

const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

describe("altTone", () => {
  it("luminance rises monotonically with altitude for every region", () => {
    for (const rgb of REGION_RGB) {
      let prev = -1;
      for (let alt = 0; alt <= ALT_MAX100; alt += 10) {
        const l = lum(altTone(rgb, alt));
        expect(l).toBeGreaterThanOrEqual(prev);
        prev = l;
      }
    }
  });
  it("ground is darker and the ceiling lighter than the region colour", () => {
    for (const rgb of REGION_RGB) {
      expect(lum(altTone(rgb, 0))).toBeLessThan(lum(rgb));
      expect(lum(altTone(rgb, ALT_MAX100))).toBeGreaterThan(lum(rgb));
    }
  });
  it("clamps beyond the range and keeps components in 0..1", () => {
    const rgb = REGION_RGB[0];
    expect(altTone(rgb, -50)).toEqual(altTone(rgb, 0));
    expect(altTone(rgb, 9999)).toEqual(altTone(rgb, ALT_MAX100));
    expect(altTone(rgb, NaN)).toEqual(altTone(rgb, 0));
    for (const c of altTone([1, 1, 1], 200)) expect(c).toBeLessThanOrEqual(1);
  });
  it("preserves the channel ordering of the region colour at mid altitude", () => {
    for (const rgb of REGION_RGB) {
      const m = altTone(rgb, ALT_MAX100 / 2);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) if (rgb[i] > rgb[j] + 0.05) expect(m[i]).toBeGreaterThan(m[j]);
    }
  });
});
