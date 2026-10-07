import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { PATTERNS, nextActiveSlot, slotIndex, slotTime } from "../src/audio/theory";
import { SECTIONS, type Section } from "../src/audio/form";
import { initNey, initPiano, ladderIndexOf, neyCell, type NeyState } from "../src/audio/melody";
import {
  LOOKAHEAD_SEC, MAX_RANGE_SEC, eventsBetween, instrumentFor, planNotes as plan, velocityFor, type PlanContext, type ScoreEvent,
} from "../src/audio/score";
import { FROM, flight, makeDay } from "./helpers";

// regions: DOM 0, EUR 1, MEA 2, AFR 3, ASI 4, AME 5, UNK 6
const model = () =>
  buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", region: "AME", dep: FROM + 1000, arr: FROM + 5000, end: "LANDED", s: [[0, 300, 41, 29], [3000, 370, 45, -20]] }),
        flight({ from: "IST", to: "LHR", region: "EUR", dep: FROM + 2000, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 10]] }),
        flight({ from: "IST", to: "ESB", region: "DOM", dep: FROM + 3000, arr: FROM + 4000, end: "LAST_CONTACT", s: [[0, 300, 41, 29], [900, 100, 40, 33]] }),
      ],
    }),
  );
const ev = (o: Partial<ScoreEvent>): ScoreEvent => ({ kind: "dep", key: "IST-FRA", regionIdx: 1, distKm: 2000, at: 0, istanbul: false, ...o });
const LONDON = { farLat: 51.5, farLon: -0.5 };
const ATHENS = { farLat: 37.9, farLon: 23.7 };

describe("eventsBetween", () => {
  it("returns departures in (from, to] and arrivals only for landed flights", () => {
    const m = model();
    // windows must be <= MAX_RANGE_SEC (600 s), so each departure gets its own window
    expect(eventsBetween(m, 900, 1500).map((x) => [x.kind, x.key, x.at])).toEqual([["dep", "IST-JFK", 1000]]);
    expect(eventsBetween(m, 1900, 2400).map((x) => [x.kind, x.key, x.at])).toEqual([["dep", "IST-LHR", 2000]]);
    expect(eventsBetween(m, 500, 1100).length).toBe(1);
    const arr = eventsBetween(m, 4500, 5100);
    expect(arr.map((x) => [x.kind, x.key, x.at])).toEqual([["arr", "IST-JFK", 5000]]);
  });
  it("last-contact and airborne flights never produce arrivals", () => {
    expect(eventsBetween(model(), 3500, 4500).some((x) => x.kind === "arr")).toBe(false);
  });
  it("the interval is open at the start and closed at the end", () => {
    const m = model();
    expect(eventsBetween(m, 1000, 1500)).toEqual([]);
    expect(eventsBetween(m, 900, 1000).length).toBe(1);
  });
  it("carries region index and distance; jumps and rewinds produce nothing", () => {
    const m = model();
    expect(eventsBetween(m, 900, 1500)[0]).toMatchObject({ regionIdx: 5, key: "IST-JFK" });
    expect(eventsBetween(m, 900, 1500)[0].distKm).toBeGreaterThan(7000);
    expect(eventsBetween(m, 0, MAX_RANGE_SEC + 1)).toEqual([]);
    expect(eventsBetween(m, 2500, 500)).toEqual([]);
  });
});

describe("eventsBetween: Istanbul end and far end", () => {
  const m = buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "JFK", region: "AME", dep: FROM + 1000, arr: FROM + 5000, end: "LANDED", s: [[0, 300, 41, 29], [3000, 370, 45, -20]] }),
        flight({ from: "JFK", to: "IST", region: "AME", dep: FROM + 7000, arr: FROM + 9000, end: "LANDED", s: [[0, 300, 41, -73], [3000, 370, 45, -20]] }),
      ],
    }),
  );
  it("outbound: the departure is Istanbul, the landing abroad is not; far end is the destination", () => {
    const [d] = eventsBetween(m, 900, 1500);
    const [a] = eventsBetween(m, 4500, 5100);
    expect([d.istanbul, a.istanbul]).toEqual([true, false]);
    for (const e of [d, a]) expect([e.farLat, e.farLon]).toEqual([40.6398, -73.7789]);
  });
  it("inbound: the departure abroad is not Istanbul, the landing at IST is; far end is the origin", () => {
    const [d] = eventsBetween(m, 6900, 7500);
    const [a] = eventsBetween(m, 9500, 10100);
    expect([d.istanbul, a.istanbul]).toEqual([false, true]);
    for (const e of [d, a]) expect([e.farLat, e.farLon]).toEqual([40.6398, -73.7789]);
  });
  it("without a planned route there are no far coordinates", () => {
    const m2 = buildGlobeModel(makeDay({ flights: [flight({ dep: FROM + 100, s: [[0, 300, 41, 29], [100, 300, 42, 30]] })] }));
    const [e] = eventsBetween(m2, 0, 200);
    expect(e.farLat).toBeUndefined();
    expect(e.istanbul).toBe(false);
  });
});

describe("instrumentFor", () => {
  it("European routes with a west/north far end are piano, others stay vibraphone", () => {
    expect(instrumentFor(ev({ ...LONDON }))).toBe("PNO");
    expect(instrumentFor(ev({ ...ATHENS }))).toBe("EUR");
    expect(instrumentFor(ev({}))).toBe("EUR");
    expect(instrumentFor(ev({ regionIdx: 4, ...LONDON }))).toBe("ASI");
    expect(instrumentFor(ev({ regionIdx: 6 }))).toBeNull();
  });
});

describe("velocityFor", () => {
  it("grows with the number of merged events and is capped at 1", () => {
    expect(velocityFor(1)).toBeCloseTo(0.65, 12);
    expect(velocityFor(2)).toBeGreaterThan(velocityFor(1));
    expect(velocityFor(10)).toBe(1);
  });
});

const { NIGHT, MORNING, DAY, EVENING } = SECTIONS;
const ctxFor = (section: Section, o: Partial<PlanContext> = {}): PlanContext => ({ epoch: 0, section, ney: initNey(section), piano: initPiano(), ...o });
/** notes of a plan in DAY (or the given section) from a fresh state */
const notesOf = (events: ScoreEvent[], now: number, section: Section = DAY, o: Partial<PlanContext> = {}) => plan(events, now, ctxFor(section, o)).notes;
const JFK = { farLat: 40.6398, farLon: -73.7789 };

describe("planNotes", () => {
  it("places notes on the next active euclidean step of the instrument grid, relative to the epoch", () => {
    const epoch = 10;
    const now = 13.1;
    const [n] = notesOf([ev({ ...ATHENS })], now, DAY, { epoch });
    const slot = nextActiveSlot("EUR", slotIndex(now + LOOKAHEAD_SEC - epoch, "EUR", 96));
    expect(n.instrument).toBe("EUR");
    expect(n.when).toBeCloseTo(epoch + slotTime("EUR", slot, 96), 12);
    expect(n.when).toBeGreaterThanOrEqual(now + LOOKAHEAD_SEC);
    expect(PATTERNS.EUR![slot % 8]).toBe(true);
  });
  it("a skipped euclidean step moves the note to the next onset", () => {
    // DAY, epoch 0: start 0.06 → EUR slot 1 (x.xx.xx. has no onset there) → slot 2 = 0.625 s
    expect(notesOf([ev({ ...ATHENS })], 0, DAY)[0].when).toBeCloseTo(0.625, 12);
    // MEA x..x..x.: start 0.06 → slot 1 → 3 (swung odd step: 3 · 0.3125 + 0.25 · 0.3125)
    expect(notesOf([ev({ regionIdx: 2, key: "IST-DXB" })], 0, DAY)[0].when).toBeCloseTo(3.25 * 0.3125, 12);
    // NIGHT 72 BPM, DOM x.x. on quarter notes: start 0.06 → slot 1 → 2 = 2 · 0.8333 s
    expect(notesOf([ev({ regionIdx: 0, key: "IST-ESB" })], 0, NIGHT)[0].when).toBeCloseTo(2 * (60 / 72), 12);
  });
  it("drops instruments outside the section", () => {
    const evs = [0, 1, 2, 3, 4, 5].map((r) => ev({ regionIdx: r, key: `K${r}`, ...ATHENS }));
    const inst = (sec: Section) => [...new Set(notesOf(evs, 0, sec).map((n) => n.instrument))].sort();
    expect(inst(NIGHT)).toEqual(["AME", "DOM"]);
    expect(inst(MORNING)).toEqual(["AFR", "AME", "ASI", "DOM", "EUR"]);
    expect(inst(DAY)).toEqual(["AFR", "AME", "ASI", "DOM", "EUR", "MEA"]);
    expect(inst(EVENING)).toEqual(["AME", "DOM", "EUR", "MEA"]);
  });
  it("different regions land on their own grids (polyrhythm)", () => {
    const notes = notesOf([ev({ regionIdx: 1 }), ev({ regionIdx: 3, key: "IST-CAI" }), ev({ regionIdx: 4, key: "IST-NRT" })], 0.01);
    const by = Object.fromEntries(notes.map((n) => [n.instrument, n.when]));
    // start 0.07: ASI slot 1 → onset 3 (0.469 s); AFR slot 1 → onset 3 (0.625 s); EUR slot 1 → onset 2 (0.625 s)
    expect(by.ASI).toBeCloseTo(0.46875, 12);
    expect(by.AFR).toBeCloseTo(0.625, 12);
    expect(by.EUR).toBeCloseTo(0.625, 12);
  });
  it("at most section.maxNotes notes per instrument and step (1 at night, 2 by day); extras raise the velocity", () => {
    const many = Array.from({ length: 5 }, (_, i) => ev({ key: `A${i}-IST`, regionIdx: 5 }));
    const day = notesOf(many, 0, DAY);
    expect(day).toHaveLength(2);
    expect(day[0].vel).toBeCloseTo(velocityFor(5), 12);
    expect(notesOf(many, 0, NIGHT)).toHaveLength(1);
    const single = notesOf([ev({ regionIdx: 5 })], 0);
    expect(day[0].vel).toBeGreaterThan(single[0].vel);
  });
  it("arrivals are softer and an octave lower than departures", () => {
    const [d] = notesOf([ev({ kind: "dep" })], 0);
    const [a] = notesOf([ev({ kind: "arr" })], 0);
    expect(a.freq).toBeCloseTo(d.freq / 2, 9);
    expect(a.vel).toBeCloseTo(d.vel * 0.6, 12);
  });
  it("departures come before arrivals when a step overflows; UNK is silent; empty in, empty out", () => {
    const notes = notesOf([ev({ kind: "arr", key: "Z-IST" }), ev({ kind: "dep", key: "B-IST" }), ev({ kind: "dep", key: "A-IST" })], 0);
    expect(notes.map((n) => n.kind)).toEqual(["dep", "dep"]);
    expect(notesOf([ev({ regionIdx: 6 })], 0)).toEqual([]);
    const empty = plan([], 0, ctxFor(DAY));
    expect(empty.notes).toEqual([]);
    expect(empty.ney).toEqual(initNey(DAY));
  });
  it("routes west-European events to the piano and east-European ones to the vibraphone", () => {
    expect(notesOf([ev({ ...ATHENS })], 0).map((n) => n.instrument)).toEqual(["EUR"]);
    const pno = notesOf([ev({ ...LONDON })], 0);
    expect(new Set(pno.map((n) => n.instrument))).toEqual(new Set(["PNO"]));
  });
  it("the piano rolls a new chord open and then flows, threading PianoState", () => {
    const e = ev({ ...LONDON }); // 2000 km → octave 4
    const first = plan([e], 0, ctxFor(DAY)); // C (progression index 0)
    expect(first.notes).toHaveLength(3);
    expect(first.notes.map((n) => n.offsetSec ?? 0)).toEqual([0, 0.03, 0.06]);
    expect(first.notes[1].when - first.notes[0].when).toBeCloseTo(0.03, 12);
    expect(first.piano).toEqual({ i: 3, chordKey: "C0" });
    const second = plan([e], 1, { ...ctxFor(DAY), piano: first.piano });
    expect(second.notes).toHaveLength(1);
    expect(second.piano.i).toBe(4);
    // a later chord (beat ≥ 8 → G, index 1) rolls again
    const later = plan([e], 5.2, { ...ctxFor(DAY), piano: second.piano });
    expect(later.notes).toHaveLength(3);
    expect(later.piano.chordKey).toBe("G1");
  });
  it("an Istanbul-end event plays a three-note ney cell on consecutive eighth-note slots", () => {
    const r = plan([ev({ ...LONDON, istanbul: true })], 0.2, ctxFor(NIGHT));
    const ney = r.notes.filter((n) => n.instrument === "NEY");
    expect(ney).toHaveLength(3);
    const slot = slotIndex(0.2 + LOOKAHEAD_SEC, "NEY", 72); // ceil(0.26 / 0.4167) = 1
    expect(slot).toBe(1);
    expect(ney.map((n) => n.when)).toEqual([1, 2, 3].map((k) => slotTime("NEY", k, 72)));
    // same cell as the pure function: beat 0.5, chord Am(add9)
    const cell = neyCell({ kind: "dep", distKm: 2000, ...LONDON }, initNey(NIGHT), NIGHT.progression[0], 0.5, NIGHT);
    expect(ney.map((n) => n.freq)).toEqual(cell.notes.map((n) => n.freq));
    expect(ney.map((n) => n.vel)).toEqual(cell.notes.map((n) => n.vel * velocityFor(1)));
    expect(r.ney).toEqual(cell.state);
    expect(r.notes.some((n) => n.instrument === "PNO")).toBe(true);
  });
  it("NEY cells are not capped by maxNotes; one cell per step, extra events raise its velocity", () => {
    const many = Array.from({ length: 4 }, (_, i) => ev({ key: `K${i}-IST`, istanbul: true, regionIdx: 6, kind: i === 0 ? "arr" : "dep" }));
    const ney = notesOf(many, 0, NIGHT).filter((n) => n.instrument === "NEY");
    expect(ney).toHaveLength(3); // night maxNotes is 1, the cell keeps its three notes
    expect(ney.every((n) => n.kind === "dep")).toBe(true);
    expect(ney[0].vel).toBeCloseTo(0.8 * velocityFor(4), 12);
  });
  it("threads NeyState: the ney rests while a cell plays and after a cadence, and grace marks strong beats", () => {
    const e = ev({ istanbul: true, regionIdx: 6, ...JFK });
    let ney: NeyState = initNey(DAY);
    const counts: number[] = [];
    // DAY beat = 0.625 s, ney slot = 0.3125 s; slots land at beat 0.5 (now 0), 1.5 (0.7), 2.5 (1.3), 4.5 (2.6),
    // 6.5 (3.9: cadence, rest until 8.5), 7.5 (4.6), 8.5 (5.2: the rest is over exactly there)
    for (const now of [0, 0.7, 1.3, 2.6, 3.9, 4.6, 5.2]) {
      const r = plan([e], now, ctxFor(DAY, { ney }));
      counts.push(r.notes.filter((n) => n.instrument === "NEY").length);
      ney = r.ney;
    }
    expect(counts).toEqual([3, 0, 3, 3, 1, 0, 3]); // cell, busy, cell, cell, cadence, breath, new phrase
    const strong = plan([e], 2.5 - LOOKAHEAD_SEC - 0.001, ctxFor(DAY)).notes.filter((n) => n.instrument === "NEY"); // slot 8 = beat 4
    expect(strong[0].grace).toBe(true);
    expect(strong.slice(1).some((n) => n.grace)).toBe(false);
  });
  it("arrivals at Istanbul play the ney softer and lower", () => {
    const d = notesOf([ev({ istanbul: true, regionIdx: 6, ...JFK })], 0).filter((n) => n.instrument === "NEY");
    const st = { last: 21, cell: 0, restUntilBeat: 0 };
    const hi = notesOf([ev({ istanbul: true, regionIdx: 6, ...JFK })], 0, DAY, { ney: st }).filter((n) => n.instrument === "NEY");
    const lo = notesOf([ev({ istanbul: true, regionIdx: 6, ...JFK, kind: "arr" })], 0, DAY, { ney: st }).filter((n) => n.instrument === "NEY");
    expect(ladderIndexOf(lo[0].freq)).toBeLessThan(ladderIndexOf(hi[0].freq));
    expect(lo[0].vel).toBeCloseTo(d[0].vel * 0.6, 12);
  });
  it("the wind ensemble follows the cell by section, on the ney's slots", () => {
    const e = ev({ istanbul: true, regionIdx: 6, ...JFK });
    const winds = (sec: Section, ney?: NeyState) =>
      notesOf([e], 0, sec, ney ? { ney } : {}).filter((n) => n.instrument !== "NEY").map((n) => n.instrument);
    expect(winds(NIGHT)).toEqual([]);
    expect(winds(MORNING)).toEqual(["CLA", "CLA", "CLA"]);
    expect(winds(DAY)).toEqual(["CLA", "CLA", "CLA"]);
    expect(winds(EVENING).sort()).toEqual(["CLA", "CLA", "CLA", "SAX"]);
    const cadence = { last: 19, cell: 3, restUntilBeat: 0 };
    expect(winds(DAY, cadence)).toEqual(["TPT"]);
    expect(winds(MORNING, cadence)).toEqual([]);
    expect(winds(EVENING, cadence)).toEqual(["SAX"]);
    const all = notesOf([e], 0, EVENING);
    const neyWhen = all.filter((n) => n.instrument === "NEY").map((n) => n.when);
    expect(all.filter((n) => n.instrument === "CLA").map((n) => n.when)).toEqual(neyWhen);
    const sax = all.find((n) => n.instrument === "SAX")!;
    expect([sax.when, sax.long]).toEqual([neyWhen[0], true]);
  });
  it("events without istanbul produce no ney note", () => {
    expect(notesOf([ev({}), ev({ ...LONDON })], 0).some((n) => n.instrument === "NEY")).toBe(false);
  });
  it("is deterministic", () => {
    const e = [ev({}), ev({ regionIdx: 2, key: "IST-DXB", distKm: 3000 }), ev({ ...LONDON, istanbul: true })];
    expect(plan(e, 1.234, ctxFor(EVENING))).toEqual(plan(e, 1.234, ctxFor(EVENING)));
  });
});
