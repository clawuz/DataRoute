import { describe, expect, it } from "vitest";
import type { DayFile } from "@collector/day-schema";
import { hubFlightsOnly } from "../src/personal/hub";

const day = (pairs: [string | undefined, string | undefined][]): DayFile =>
  ({ v: 1, generatedAt: 1, flights: pairs.map(([from, to], i) => ({ id: String(i), cs: "THY1", from, to })) }) as unknown as DayFile;

describe("hubFlightsOnly", () => {
  it("keeps flights that start or end at an Istanbul airport and drops the rest, unknown routes included", () => {
    const out = hubFlightsOnly(day([["IST", "LHR"], ["JFK", "IST"], ["SAW", "ESB"], ["AYT", "LED"], ["ADA", "ESB"], [undefined, undefined], ["IST", undefined]]));
    expect(out.flights.map((f) => `${f.from}-${f.to}`)).toEqual(["IST-LHR", "JFK-IST", "SAW-ESB", "IST-undefined"]);
  });
  it("leaves the rest of the payload as it is and does not change the input", () => {
    const d = day([["AYT", "LED"], ["IST", "FRA"]]);
    const out = hubFlightsOnly(d);
    expect(out.generatedAt).toBe(d.generatedAt);
    expect(d.flights.length).toBe(2);
    expect(out.flights.length).toBe(1);
  });
});
