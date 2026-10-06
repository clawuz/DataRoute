import { describe, expect, it } from "vitest";
import { typeName } from "../src/aircraft-names.js";
import { AIRLINER_TYPES } from "../src/fleet.js";

describe("typeName", () => {
  it("names common types in adsb.fi style", () => {
    expect(typeName("B739")).toBe("BOEING 737-900");
    expect(typeName("B38M")).toBe("BOEING 737 MAX 8");
    expect(typeName("A20N")).toBe("AIRBUS A320NEO");
    expect(typeName("B77W")).toBe("BOEING 777-300ER");
    expect(typeName("A359")).toBe("AIRBUS A350-900");
  });
  it("returns undefined for unknown codes", () => {
    expect(typeName("ZZZZ")).toBeUndefined();
    expect(typeName("")).toBeUndefined();
  });
  it("covers every airliner type", () => {
    for (const t of AIRLINER_TYPES) expect(typeName(t), t).toBeTruthy();
  });
});
