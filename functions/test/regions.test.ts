import { describe, expect, it } from "vitest";
import { countryToRegion, isIstanbul, resolveEndpoint } from "../src/regions.js";
import type { Airport } from "../src/day-schema.js";

const IST: Airport = { iata: "IST", country: "TR", lat: 41.2613, lon: 28.742 };
const SAW: Airport = { iata: "SAW", country: "TR", lat: 40.8986, lon: 29.3092 };
const ESB: Airport = { iata: "ESB", country: "TR", lat: 40.128, lon: 32.995 };
const ADB: Airport = { iata: "ADB", country: "TR", lat: 38.292, lon: 27.157 };
const JFK: Airport = { iata: "JFK", country: "US", lat: 40.6398, lon: -73.7789 };
const FRA: Airport = { iata: "FRA", country: "DE", lat: 50.033, lon: 8.571 };

describe("regions", () => {
  it("isIstanbul", () => {
    expect(isIstanbul("IST")).toBe(true);
    expect(isIstanbul("SAW")).toBe(true);
    expect(isIstanbul("ESB")).toBe(false);
  });

  it("countryToRegion", () => {
    expect(countryToRegion("TR")).toBe("DOM");
    expect(countryToRegion("GB")).toBe("EUR");
    expect(countryToRegion("AZ")).toBe("EUR");
    expect(countryToRegion("AE")).toBe("MEA");
    expect(countryToRegion("EG")).toBe("AFR");
    expect(countryToRegion("JP")).toBe("ASI");
    expect(countryToRegion("AU")).toBe("ASI");
    expect(countryToRegion("BR")).toBe("AME");
    expect(countryToRegion("ZZ")).toBe("UNK");
  });

  it("outbound: other end is destination", () => {
    const r = resolveEndpoint({ origin: IST, destination: JFK });
    expect(r.other.iata).toBe("JFK");
    expect(r.region).toBe("AME");
    expect(r.bearing).toBeCloseTo(308.9, 1);
  });

  it("inbound: other end is origin", () => {
    const r = resolveEndpoint({ origin: JFK, destination: SAW });
    expect(r.other.iata).toBe("JFK");
    expect(r.region).toBe("AME");
  });

  it("domestic", () => {
    expect(resolveEndpoint({ origin: IST, destination: ESB }).region).toBe("DOM");
    expect(resolveEndpoint({ origin: IST, destination: ESB }).other.iata).toBe("ESB");
  });

  it("non-Istanbul international picks the foreign end", () => {
    const r = resolveEndpoint({ origin: FRA, destination: ADB });
    expect(r.other.iata).toBe("FRA");
    expect(r.region).toBe("EUR");
  });
});
