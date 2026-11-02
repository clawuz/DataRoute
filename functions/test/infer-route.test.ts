import { describe, expect, it } from "vitest";
import { airportAt, inferRoute } from "../src/infer-route";
import { buildDayFile } from "../src/publish";
import type { DayStatus, DaySource, Sample, TrackedFlight, TrackerState } from "../src/day-schema";

const IST: [number, number] = [41.2613, 28.742];
const JFK: [number, number] = [40.6398, -73.7789];
const s = (t: number, alt: number, p: [number, number]): Sample => [t, alt, p[0], p[1]];
const flight = (over: Partial<TrackedFlight>): TrackedFlight => ({
  id: "abc-1000", icao24: "abc", cs: "THY1", dep: 1000, arr: 40000, lastContact: 40000,
  samples: [s(1000, 5, [41.27, 28.75]), s(2000, 300, [45, 10]), s(20000, 410, [50, -30]), s(39000, 15, [40.64, -73.79])],
  ...over,
});

describe("airportAt", () => {
  it("finds the airport within 25 km, the nearest one, and none far from every airport", () => {
    expect(airportAt(41.27, 28.75)?.iata).toBe("IST");
    expect(airportAt(40.9, 29.3)?.iata).toBe("SAW");
    expect(airportAt(0, -30)).toBeNull();
  });
});
describe("inferRoute", () => {
  it("reads origin and destination from a track that took off and landed while it was watched", () => {
    const r = inferRoute(flight({}))!;
    expect(r.origin.iata).toBe("IST");
    expect(r.destination.iata).toBe("JFK");
    expect(r.destination.country).toBe("US");
  });
  it("gives nothing for a flight already in the air when the watching began, one that is still flying, or one lost before landing", () => {
    expect(inferRoute(flight({ samples: [s(1000, 380, [45, 10]), s(39000, 15, JFK)] }))).toBeNull(); // first sample high
    expect(inferRoute(flight({ arr: null }))).toBeNull(); // still airborne
    expect(inferRoute(flight({ samples: [s(1000, 5, IST), s(39000, 250, [60, -20])] }))).toBeNull(); // last sample high
  });
  it("gives nothing when both ends are the same airport, or an end lies far from every airport", () => {
    expect(inferRoute(flight({ samples: [s(1000, 5, IST), s(2000, 200, [45, 15]), s(9000, 10, [41.27, 28.75])] }))).toBeNull();
    expect(inferRoute(flight({ samples: [s(1000, 5, IST), s(39000, 10, [10, -150])] }))).toBeNull();
  });
});
describe("the day file uses the route the track shows", () => {
  const status: DayStatus = { state: "ok", lastSuccessAt: 41000 };
  const source: DaySource = { name: "t", url: "u" };
  const given = { origin: { iata: "ESB", country: "TR", lat: 40.1281, lon: 32.995 }, destination: { iata: "ADB", country: "TR", lat: 38.2924, lon: 27.157 } };
  it("publishes the track's route for a flight without a route and over the service's route when the track shows both ends (the service names the callsign's other leg); keeps the service's route when the track does not", () => {
    const state: TrackerState = {
      v: 1, collectingSince: 0, lastSuccessAt: 41000,
      flights: [flight({}), flight({ id: "b-2", icao24: "b", route: given }), flight({ id: "c-3", icao24: "c", route: given, arr: null }), flight({ id: "d-4", icao24: "d", arr: null })],
    };
    const day = buildDayFile(state, 41000, status, source);
    expect([day.flights[0].from, day.flights[0].to]).toEqual(["IST", "JFK"]);
    expect([day.flights[1].from, day.flights[1].to]).toEqual(["IST", "JFK"]); // the track wins over the service
    expect([day.flights[2].from, day.flights[2].to]).toEqual(["ESB", "ADB"]); // still flying: the service's route stays
    expect(day.flights[3].from).toBeUndefined();
    expect(day.airports.JFK).toBeDefined();
    expect(state.flights[0].route).toBeUndefined(); // the input state is not changed
  });
});
