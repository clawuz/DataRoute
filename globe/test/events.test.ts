import { describe, expect, it } from "vitest";
import { diffEvents } from "../src/model/events";
import { buildGlobeModel } from "../src/model/globe-model";
import { FROM, flight, makeDay } from "./helpers";

const NOW1 = FROM + 86400;
const NOW2 = NOW1 + 120;
const mk = (generatedAt: number, flights: ReturnType<typeof flight>[]) =>
  buildGlobeModel(makeDay({ generatedAt, window: { from: generatedAt - 86400, to: generatedAt }, flights }));

const cruising = (id: string, o: Partial<Parameters<typeof flight>[0]> = {}) =>
  flight({ id, tk: `TK-${id}`, from: "IST", to: "JFK", dep: NOW1 - 3000, s: [[0, 300, 41, 29], [600, 370, 45, 20]], ...o });

describe("diffEvents", () => {
  it("emits nothing on the first load", () => {
    expect(diffEvents(null, mk(NOW1, [cruising("a")]))).toEqual([]);
  });

  it("DEPARTED for a fresh flight with a recent departure", () => {
    const prev = mk(NOW1, []);
    const next = mk(NOW2, [cruising("new", { dep: NOW2 - 200 })]);
    expect(diffEvents(prev, next)).toEqual([
      { id: "new:DEPARTED", kind: "DEPARTED", tk: "TK-new", from: "IST", to: "JFK", airport: "IST", at: NOW2 - 200 },
    ]);
  });

  it("no DEPARTED for a flight that departed long ago", () => {
    expect(diffEvents(mk(NOW1, []), mk(NOW2, [cruising("old", { dep: NOW2 - 5000 })]))).toEqual([]);
  });

  it("LANDED when an airborne flight ends as LANDED", () => {
    const prev = mk(NOW1, [cruising("a")]);
    const next = mk(NOW2, [cruising("a", { arr: NOW2 - 60, end: "LANDED" })]);
    expect(diffEvents(prev, next)).toEqual([
      { id: "a:LANDED", kind: "LANDED", tk: "TK-a", from: "IST", to: "JFK", airport: "JFK", at: NOW2 - 60 },
    ]);
  });

  it("LAST_CONTACT when an airborne flight goes silent", () => {
    const prev = mk(NOW1, [cruising("a")]);
    const next = mk(NOW2, [cruising("a", { arr: NOW2 - 2800, end: "LAST_CONTACT" })]);
    const ev = diffEvents(prev, next);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ id: "a:LAST_CONTACT", kind: "LAST_CONTACT", tk: "TK-a" });
  });

  it("resuming (LAST_CONTACT → AIRBORNE) and unchanged flights are silent", () => {
    const prev = mk(NOW1, [cruising("a", { arr: NOW1 - 100, end: "LAST_CONTACT" }), cruising("b")]);
    const next = mk(NOW2, [cruising("a"), cruising("b")]);
    expect(diffEvents(prev, next)).toEqual([]);
  });

  it("events are sorted by time", () => {
    const prev = mk(NOW1, [cruising("a"), cruising("b")]);
    const next = mk(NOW2, [
      cruising("a", { arr: NOW2 - 10, end: "LANDED" }),
      cruising("b", { arr: NOW2 - 90, end: "LANDED" }),
      cruising("c", { dep: NOW2 - 300 }),
    ]);
    expect(diffEvents(prev, next).map((e) => e.id)).toEqual(["c:DEPARTED", "b:LANDED", "a:LANDED"]);
  });
});
