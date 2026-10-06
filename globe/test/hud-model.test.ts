import { describe, expect, it } from "vitest";
import { MAX_EVENTS, addEvents, eventText, liveCur, pickLabelAirports } from "../src/app/hud-model";
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
