import { describe, expect, it } from "vitest";
import { guessHome } from "../src/personal/locate";
import { isDestination } from "../src/personal/destinations";

describe("guessHome", () => {
  it("points a time zone at a Turkish Airlines airport", () => {
    expect(guessHome("America/New_York")).toBe("JFK");
    expect(guessHome("Europe/London")).toBe("LHR");
    expect(guessHome("Asia/Tokyo")).toBe("NRT");
    expect(guessHome("Europe/Istanbul")).toBe("IST");
  });
  it("returns nothing for an unknown or empty zone", () => {
    expect(guessHome("Pacific/Fiji")).toBeUndefined();
    expect(guessHome("")).toBeUndefined();
  });
  it("only ever suggests airports in the network", () => {
    for (const z of ["America/Chicago", "America/Phoenix", "America/Detroit", "America/Anchorage", "Asia/Dubai", "Africa/Lagos"]) {
      const c = guessHome(z);
      expect(c === undefined || isDestination(c), z).toBe(true);
    }
  });
});
