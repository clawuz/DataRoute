import { describe, expect, it } from "vitest";
import { MAX_EVENTS, addEvents, aircraftBreakdown, aircraftLabel, eventText, liveCur, pickLabelAirports } from "../src/app/hud-model";
import type { FlightEvent } from "../src/model/events";
import { buildGlobeModel } from "../src/model/globe-model";
import { FROM, flight, makeDay } from "./helpers";

const ev = (kind: FlightEvent["kind"], o: Partial<FlightEvent> = {}): FlightEvent => ({
  id: `x:${kind}`, kind, tk: "TK1", from: "IST", to: "JFK", airport: "IST", at: 100, ...o,
});

describe("eventText", () => {
  it("formats the three kinds", () => {
    expect(eventText(ev("DEPARTED"))).toBe("TK1 DEPARTED IST → JFK");
    expect(eventText(ev("LANDED"))).toBe("TK1 LANDED JFK");
    expect(eventText(ev("LAST_CONTACT"))).toBe("TK1 LAST CONTACT");
    expect(eventText(ev("DEPARTED", { from: undefined, to: undefined }))).toBe("TK1 DEPARTED ??? → ???");
    expect(eventText(ev("LANDED", { to: undefined }))).toBe("TK1 LANDED ???");
  });
});

describe("addEvents", () => {
  it("appends, de-duplicates by id and keeps the newest MAX_EVENTS", () => {
    expect(MAX_EVENTS).toBe(6);
    let lines = addEvents([], [ev("DEPARTED", { id: "a", at: 1 })]);
    lines = addEvents(lines, [ev("DEPARTED", { id: "a", at: 1 }), ev("LANDED", { id: "b", at: 2 })]);
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
    for (let i = 0; i < 10; i++) lines = addEvents(lines, [ev("LANDED", { id: `n${i}`, at: 10 + i })]);
    expect(lines).toHaveLength(6);
    expect(lines[5].id).toBe("n9");
    expect(lines[0].id).toBe("n4");
    expect(lines[5].text).toBe("TK1 LANDED JFK");
  });
});

describe("pickLabelAirports", () => {
  const m = buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] }),
        flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] }),
        flight({ from: "IST", to: "LHR", s: [[0, 1, 1, 1]] }),
      ],
    }),
  );
  it("IST first, then busiest airports, limited to n", () => {
    expect(pickLabelAirports(m, 3)).toEqual(["IST", "JFK", "LHR"]);
    expect(pickLabelAirports(m, 2)).toEqual(["IST", "JFK"]);
    expect(pickLabelAirports(m, 1)).toEqual(["IST"]);
  });
  it("still returns IST for a model without traffic", () => {
    expect(pickLabelAirports(buildGlobeModel(makeDay({ flights: [] })), 5)).toEqual(["IST"]);
  });
});

describe("liveCur", () => {
  const m = buildGlobeModel(makeDay({ flights: [flight({ s: [[0, 1, 1, 1]] })] })); // from = FROM, span = 86400
  it("follows the wall clock and is capped at span + 360", () => {
    expect(liveCur(m, FROM + 86400 + 30)).toBe(86430);
    expect(liveCur(m, FROM + 86400 + 99999)).toBe(86400 + 360);
    expect(liveCur(m, FROM - 50)).toBe(0);
  });
});

describe("aircraftLabel", () => {
  it("prefers desc, then type, else unknown; reg or empty", () => {
    expect(aircraftLabel({ desc: "BOEING 737-900", type: "B739", reg: "TC-JXX" })).toEqual({ name: "BOEING 737-900", reg: "TC-JXX" });
    expect(aircraftLabel({ type: "A21N" })).toEqual({ name: "A21N", reg: "" });
    expect(aircraftLabel({ reg: "TC-LGA" })).toEqual({ name: "AIRCRAFT UNKNOWN", reg: "TC-LGA" });
    expect(aircraftLabel({})).toEqual({ name: "AIRCRAFT UNKNOWN", reg: "" });
  });
});

describe("aircraftBreakdown", () => {
  const mk = (type: string | undefined, dep = FROM) =>
    flight({ from: "IST", to: "JFK", dep, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 20], [3000, 370, 55, -20]], ...(type ? { type } : {}) });
  const model = (types: (string | undefined)[]) => buildGlobeModel(makeDay({ flights: types.map((t) => mk(t)) }));

  it("counts airborne heads per type with compact names, unknown codes verbatim", () => {
    const m = model(["B739", "B739", "A21N", "ZZZZ", undefined]);
    expect(aircraftBreakdown(m, 100)).toEqual([
      { label: "737-900", count: 2 },
      { label: "A321NEO", count: 1 },
      { label: "ZZZZ", count: 1 },
    ]);
  });
  it("breaks ties alphabetically and keeps the top six", () => {
    const m = model(["B789", "A359", "B77W", "A333", "B38M", "A21N", "E190", "B789"]);
    const r = aircraftBreakdown(m, 100);
    expect(r).toHaveLength(6);
    expect(r[0]).toEqual({ label: "787-9", count: 2 });
    expect(r.slice(1).map((x) => x.label)).toEqual(["737 MAX 8", "777-300ER", "A321NEO", "A330-300", "A350-900"]);
  });
  it("ignores flights with no head at that time", () => {
    const m = model(["B739"]);
    expect(aircraftBreakdown(m, -50)).toEqual([]);
    expect(aircraftBreakdown(m, 100000)).toEqual([]);
  });
});
