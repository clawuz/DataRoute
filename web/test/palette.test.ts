import { describe, expect, it } from "vitest";
import { REGIONS, REGION_HEX, REGION_RGB, hexToRgb } from "../src/data/palette";

describe("palette", () => {
  it("region order is fixed", () => {
    expect(REGIONS).toEqual(["DOM", "EUR", "MEA", "AFR", "ASI", "AME", "UNK"]);
  });
  it("hexToRgb", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
  });
  it("REGION_RGB follows REGIONS", () => {
    expect(REGION_RGB[1]).toEqual(hexToRgb(REGION_HEX.EUR));
    expect(REGION_RGB).toHaveLength(7);
  });
});
