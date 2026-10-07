import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { freqOf } from "../src/audio/theory";
import { SECTIONS, chordAtStep, stepDur, type Section } from "../src/audio/form";
import { CHORDS, ladderFreq } from "../src/audio/harmony";
import { keysVoicing } from "../src/audio/groove";
import { lineGain, lineInstrument, lineNote, linePattern, type SkyFlight } from "../src/audio/lines";
import { graceAbove, initNey, neyCell, type NeyState } from "../src/audio/melody";
import {
  DRUM_PITCH, MAX_RANGE_SEC, NEY_LEAD_SEC, eventsBetween, planNotes as plan, planStep, stepTime, velocityFor, type PlanContext, type PlannedNote,
  type ScoreEvent, type StepArrangement,
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

describe("velocityFor", () => {
  it("grows with the number of merged events and is capped at 1", () => {
    expect(velocityFor(1)).toBeCloseTo(0.65, 12);
    expect(velocityFor(2)).toBeGreaterThan(velocityFor(1));
    expect(velocityFor(10)).toBe(1);
  });
});

const { NIGHT, MORNING, DAY, EVENING } = SECTIONS;
const D = 60 / 116 / 4; // DAY 16th step ≈ 0.12931 s
const ctxFor = (section: Section, o: Partial<PlanContext> = {}): PlanContext => ({ epoch: 0, section, ney: initNey(section), ...o });
const notesOf = (events: ScoreEvent[], now: number, section: Section = DAY, o: Partial<PlanContext> = {}) => plan(events, now, ctxFor(section, o)).notes;
/** a wall-clock time whose ney slot (first even step at or after now + lead) is step k of the DAY clock (epoch 0) */
const nowFor = (k: number, d = D) => k * d - NEY_LEAD_SEC - 0.001;
const stepOf = (n: PlannedNote, d = D, epoch = 0) => Math.round((n.when - epoch) / d);
const pc = (s: number) => ((s % 12) + 12) % 12;
const semisOf = (f: number) => Math.round(12 * Math.log2(f / 110));
const JFK = { farLat: 40.6398, farLon: -73.7789 };
const ney = (notes: PlannedNote[]) => notes.filter((n) => n.instrument === "NEY");

describe("stepTime: the 16th-step clock", () => {
  it("epoch + k · stepDur + swing on odd steps", () => {
    expect(stepTime(0, 10, DAY)).toBe(10);
    expect(stepTime(2, 10, DAY)).toBeCloseTo(10 + 2 * D, 12);
    expect(stepTime(1, 10, DAY)).toBeCloseTo(10 + 1.1 * D, 12); // DAY swing 0.10
    expect(stepTime(3, 0, NIGHT)).toBeCloseTo(3.15 * (60 / 84 / 4), 12); // NIGHT swing 0.15
  });
});

describe("planNotes: Istanbul events → ney cells and winds on the step clock", () => {
  it("only Istanbul-end events play (no continent instruments any more); empty in, empty out", () => {
    expect(notesOf([ev({}), ev({ ...LONDON }), ev({ regionIdx: 5 })], 0)).toEqual([]);
    const empty = plan([], 0, ctxFor(DAY));
    expect(empty).toEqual({ notes: [], ney: initNey(DAY) });
  });
  it("a cell plays on three consecutive eighth notes (even steps) from the first even step after now + lead", () => {
    // now 0: 0.06 / (2 · 0.12931) → ceil 0.23 = 1 → step 2
    const r = plan([ev({ ...LONDON, istanbul: true })], 0, ctxFor(DAY));
    const n = ney(r.notes);
    expect(n.map((x) => stepOf(x))).toEqual([2, 4, 6]);
    expect(n[0].when).toBeCloseTo(2 * D, 12);
    // the same cell as the pure function: beat 0.5 (step 2 / 4), chord Dm9
    const cell = neyCell({ kind: "dep", distKm: 2000, ...LONDON }, initNey(DAY), CHORDS.Dm9, 0.5, DAY);
    expect(n.map((x) => x.freq)).toEqual(cell.notes.map((x) => x.freq));
    expect(n.map((x) => x.vel)).toEqual(cell.notes.map((x) => x.vel * velocityFor(1)));
    expect(r.ney).toEqual(cell.state);
    expect(n.every((x) => x.kind === "dep" && x.key === "IST-FRA")).toBe(true);
  });
  it("is relative to the section epoch", () => {
    // epoch 10, now 13.1: (3.16 / 0.25862) = 12.22 → 13 → step 26 = 10 + 26 · 0.12931 ≈ 13.362
    const [n] = ney(notesOf([ev({ istanbul: true })], 13.1, DAY, { epoch: 10 }));
    expect(n.when).toBeCloseTo(10 + 26 * D, 12);
    expect(n.when).toBeGreaterThanOrEqual(13.1 + NEY_LEAD_SEC);
  });
  it("a cell on a bar start (strong beat) carries a grace note one chord-scale degree above", () => {
    const n = ney(notesOf([ev({ istanbul: true, ...JFK })], nowFor(16)));
    expect(stepOf(n[0])).toBe(16);
    const chord = chordAtStep(16, DAY); // Bbmaj7
    expect(chord.id).toBe("Bbmaj7");
    expect(n[0].graceFreq).toBeCloseTo(ladderFreq(graceAbove(semisOf(n[0].freq), chord)), 9);
    expect(n.slice(1).some((x) => x.graceFreq !== undefined)).toBe(false);
    expect(ney(notesOf([ev({ istanbul: true, ...JFK })], nowFor(18))).some((x) => x.graceFreq !== undefined)).toBe(false);
  });
  it("every note sits in the scale of the chord current at its own step (a cell crossing the bar line is re-snapped)", () => {
    // arrival from rung 6 (34) at step 14 on Dm9, 2000 km (step 2): rungs 0 → 2 → 1 = 24 27 26 at steps 14 16 18;
    // 27 (C) is in Bb lydian, 26 (B) at step 18 is not → 25 (Bb and C tie → lower)
    const r = notesOf([ev({ istanbul: true, kind: "arr", ...JFK })], nowFor(14), DAY, { ney: { last: 34, cell: 0, restUntilBeat: 0 } });
    expect(ney(r).map((x) => stepOf(x))).toEqual([14, 16, 18]);
    expect(ney(r).map((x) => semisOf(x.freq))).toEqual([24, 27, 25]);
    for (const sec of [MORNING, DAY, EVENING])
      for (const k of [2, 12, 14, 16, 30, 46, 62, 78, 110, 126])
        for (const far of [JFK, LONDON, ATHENS])
          for (const kind of ["dep", "arr"] as const) {
            const d = 60 / sec.bpm / 4;
            for (const n of notesOf([ev({ istanbul: true, kind, ...far })], nowFor(k, d), sec, { ney: { last: 30, cell: 0, restUntilBeat: 0 } }))
              expect([sec.id, k, n.instrument, chordAtStep(stepOf(n, d), sec).scale.includes(pc(semisOf(n.freq)))]).toEqual([sec.id, k, n.instrument, true]);
          }
  });
  it("one cell per call; extra events raise its velocity, departures first", () => {
    const many = Array.from({ length: 4 }, (_, i) => ev({ key: `K${i}-IST`, istanbul: true, regionIdx: 6, kind: i === 0 ? "arr" : "dep" }));
    const n = ney(notesOf(many, 0, NIGHT));
    expect(n).toHaveLength(3);
    expect(n.every((x) => x.kind === "dep")).toBe(true);
    expect(n[0].vel).toBeCloseTo(0.8 * velocityFor(4), 12);
  });
  it("threads NeyState: the ney rests while a cell plays and after a cadence", () => {
    const e = ev({ istanbul: true, regionIdx: 6, ...JFK });
    let st: NeyState = initNey(DAY);
    const counts: number[] = [];
    // cells at steps 2 (beat 0.5, busy until 2.5 = step 10), 6 busy, 10, 18, 26 cadence (rest until beat 8.5 = step 34), 30 rest, 34 new phrase
    for (const k of [2, 6, 10, 18, 26, 30, 34]) {
      const r = plan([e], nowFor(k), ctxFor(DAY, { ney: st }));
      counts.push(ney(r.notes).length);
      st = r.ney;
    }
    expect(counts).toEqual([3, 0, 3, 3, 1, 0, 3]);
  });
  it("arrivals at Istanbul play the ney softer and lower", () => {
    const st = { last: 41, cell: 0, restUntilBeat: 0 };
    const hi = ney(notesOf([ev({ istanbul: true, ...JFK })], 0, DAY, { ney: st }));
    const lo = ney(notesOf([ev({ istanbul: true, ...JFK, kind: "arr" })], 0, DAY, { ney: st }));
    expect(lo[0].freq).toBeLessThan(hi[0].freq);
    expect(lo[0].vel).toBeCloseTo(hi[0].vel * 0.6, 12);
  });
  it("the wind ensemble follows the cell by section, on the ney's steps", () => {
    const e = ev({ istanbul: true, regionIdx: 6, ...JFK });
    const winds = (sec: Section, st?: NeyState) => notesOf([e], 0, sec, st ? { ney: st } : {}).filter((n) => n.instrument !== "NEY").map((n) => n.instrument);
    expect(winds(NIGHT)).toEqual([]);
    expect(winds(MORNING)).toEqual(["CLA", "CLA", "CLA"]);
    expect(winds(DAY)).toEqual(["CLA", "CLA", "CLA"]);
    expect(winds(EVENING).sort()).toEqual(["CLA", "CLA", "CLA", "SAX"]);
    const cadence = { last: 29, cell: 3, restUntilBeat: 0 };
    expect(winds(DAY, cadence)).toEqual(["TPT"]);
    expect(winds(MORNING, cadence)).toEqual([]);
    expect(winds(EVENING, cadence)).toEqual(["SAX"]);
    const all = notesOf([e], 0, EVENING);
    const neyWhen = ney(all).map((n) => n.when);
    expect(all.filter((n) => n.instrument === "CLA").map((n) => n.when)).toEqual(neyWhen);
    const sax = all.find((n) => n.instrument === "SAX")!;
    expect([sax.when, sax.long]).toEqual([neyWhen[0], true]);
  });
  it("is deterministic", () => {
    const e = [ev({}), ev({ regionIdx: 2, key: "IST-DXB", distKm: 3000, istanbul: true }), ev({ ...LONDON, istanbul: true })];
    expect(plan(e, 1.234, ctxFor(EVENING))).toEqual(plan(e, 1.234, ctxFor(EVENING)));
  });
});

describe("planStep (v4): the arranged groove and the flight lines of one 16th step", () => {
  const sky = (id: string, o: Partial<SkyFlight> = {}): SkyFlight => ({ id, key: `IST-${id}`, regionIdx: 1, alt100: 350, vsFpm: 0, ...o });
  const arr = (o: Partial<StepArrangement> = {}): StepArrangement => ({ level: 2, layers: new Set(), phase: "none", amount: 0, buildBar: 0, ...o });
  const ins = (hits: PlannedNote[]) => hits.map((h) => h.instrument).sort();
  it("level 2, DAY step 0 at the epoch: kick, hat and bass; voices are the instruments, without a route key", () => {
    const hits = planStep(0, { epoch: 5, section: DAY }, arr(), [], null);
    expect(ins(hits)).toEqual(["BASS", "HAT", "KICK"]);
    for (const h of hits) expect([h.when, h.kind, h.key]).toEqual([5, "groove", ""]);
    expect(hits.find((h) => h.instrument === "BASS")!.freq).toBe(freqOf(1, 5)); // D1 under Dm9
    expect(hits.find((h) => h.instrument === "KICK")!.freq).toBe(DRUM_PITCH.KICK);
  });
  it("odd steps swing late; the step's chord and the next chord drive keys and the bass approach", () => {
    const [hat] = planStep(1, { epoch: 0, section: DAY }, arr(), [], null);
    expect(hat.instrument).toBe("HAT");
    expect(hat.vel).toBeCloseTo(0.3 * 0.9, 12); // off-16th hat × level-2 scale
    expect(hat.when).toBeCloseTo(1.1 * D, 12);
    const keys = planStep(18, { epoch: 0, section: DAY }, arr(), [], null).find((h) => h.instrument === "KEYS")!; // bar 1: Bbmaj7
    expect(keys.freqs).toEqual(keysVoicing(CHORDS.Bbmaj7).map(ladderFreq));
    expect(keys.freq).toBe(keys.freqs![0]);
    // bar 7 (A7b9) step 11 approaches the next chord (Dm9, wrapping): C# = pc 4 in octave 1
    expect(planStep(16 * 7 + 11, { epoch: 0, section: DAY }, arr(), [], null).find((h) => h.instrument === "BASS")!.freq).toBe(freqOf(1, 4));
  });
  it("the level picks the pattern: level 0 by night, level 4 adds kick 3 and brass", () => {
    const voicesAt = (k: number, level: StepArrangement["level"]) => ins(planStep(k, { epoch: 0, section: DAY }, arr({ level }), [], null));
    expect(voicesAt(3, 0)).toEqual([]);
    expect(voicesAt(3, 2)).toEqual(["BASS", "HAT"]);
    expect(voicesAt(3, 4)).toEqual(["BASS", "BRASS", "HAT", "HAT", "KICK", "SHAKER"]);
  });
  it("level 4 hat 32nds: the second hat sits half-way to the next (swung) step", () => {
    // even step 0 → step 1 is 1.1·D later: +0.55·D; odd step 1 → step 2 is 0.9·D later: 1.1·D + 0.45·D
    const hats = (k: number) => planStep(k, { epoch: 0, section: DAY }, arr({ level: 4 }), [], null).filter((h) => h.instrument === "HAT").map((h) => h.when);
    expect(hats(0)).toHaveLength(2);
    expect(hats(0)[0]).toBe(0);
    expect(hats(0)[1]).toBeCloseTo(0.55 * D, 12);
    expect(hats(1)[1]).toBeCloseTo(1.1 * D + 0.45 * D, 12);
  });
  it("region layers add their percussion (unpitched groove voices with a nominal pitch); the EUR shaker yields to the level-3 shaker", () => {
    const steps = (inst: string, o: Partial<StepArrangement>) =>
      Array.from({ length: 16 }, (_, k) => k).filter((k) => planStep(k, { epoch: 0, section: DAY }, arr(o), [], null).some((h) => h.instrument === inst));
    expect(steps("DARBUKA", { layers: new Set(["MEA"]) })).toEqual([0, 4, 6, 10, 12]);
    expect(steps("DARBUKA", {})).toEqual([]);
    expect(steps("TIMP", { layers: new Set(["AME"]) })).toEqual([0, 8]);
    const darbuka = planStep(0, { epoch: 0, section: DAY }, arr({ layers: new Set(["MEA"]) }), [], null).find((h) => h.instrument === "DARBUKA")!;
    expect([darbuka.kind, darbuka.key, darbuka.freq]).toEqual(["groove", "", DRUM_PITCH.DARBUKA]);
    const shakers = (level: StepArrangement["level"]) =>
      planStep(0, { epoch: 0, section: DAY }, arr({ level, layers: new Set(["EUR"]) }), [], null).filter((h) => h.instrument === "SHAKER").length;
    expect([shakers(2), shakers(3), shakers(4)]).toEqual([1, 1, 1]);
  });
  it("build: the riser on step 0 of the first build bar, a snare roll, drums and the bass pulse only (keys, brass, layers, lines muted)", () => {
    const f = sky("TK1");
    const b = (k: number, buildBar: number) =>
      planStep(k, { epoch: 0, section: DAY }, arr({ level: 2, layers: new Set(["MEA", "EUR"]), phase: "build", amount: 0.5, buildBar }), [f], null);
    expect(ins(b(0, 0))).toEqual(["BASS", "HAT", "KICK", "RISER", "SNARE"]); // level-2 kick kept; its hat and bass give way to the roll and the pulse
    expect(ins(b(0, 1))).not.toContain("RISER");
    for (let k = 0; k < 16; k++) {
      const hits = b(k, 0);
      expect(hits.filter((h) => h.instrument === "SNARE").map((h) => h.vel)).toEqual([0.3 + 0.7 * 0.5]); // one roll hit, no second snare
      expect(hits.filter((h) => h.instrument === "HAT")).toHaveLength(1);
      for (const h of hits) expect(["KEYS", "BRASS", "DARBUKA", "SHAKER", "TIMP", "CONGA", "TAIKO"]).not.toContain(h.instrument);
      expect(hits.some((h) => h.kind === "line")).toBe(false);
    }
  });
  it("hit: crash, one full-velocity kick and the tutti brass on step 0, over the full groove", () => {
    const f = sky("TK1");
    const hits = planStep(0, { epoch: 0, section: DAY }, arr({ phase: "hit", amount: 1, layers: new Set(["MEA"]) }), [f], null);
    expect(hits.filter((h) => h.instrument === "KICK").map((h) => h.vel)).toEqual([1]);
    expect(hits.filter((h) => h.instrument === "CRASH")).toHaveLength(1);
    expect(hits.find((h) => h.instrument === "BRASS")!.freqs).toHaveLength(4);
    expect(ins(hits)).toEqual(expect.arrayContaining(["BASS", "HAT", "DARBUKA"]));
    expect(hits.filter((h) => h.kind === "line")).toHaveLength(linePattern("TK1")[0] ? 1 : 0);
    expect(planStep(1, { epoch: 0, section: DAY }, arr({ phase: "hit", amount: 1 }), [], null).some((h) => h.instrument === "CRASH")).toBe(false);
  });
  it("a flight line plays on its euclidean steps only, at its altitude on the chord ladder", () => {
    const f = sky("TK1", { alt100: 330, vsFpm: 1200, farLat: 51.5, farLon: -0.5 });
    const pat = linePattern("TK1");
    for (let k = 0; k < 32; k++) {
      const lines = planStep(k, { epoch: 0, section: DAY }, arr(), [f], null).filter((h) => h.kind === "line");
      expect(lines.length).toBe(pat[k % 16] ? 1 : 0);
      for (const l of lines) {
        expect(l).toMatchObject({ instrument: lineInstrument(f), key: "IST-TK1", lineId: "TK1" });
        expect(l.instrument).toBe("PNO");
        expect(l.freq).toBeCloseTo(ladderFreq(lineNote(f, chordAtStep(k, DAY), k)), 9);
        expect(l.vel).toBeCloseTo(0.55 * lineGain(1), 12);
        expect(l.when).toBeCloseTo(stepTime(k, 0, DAY), 12);
      }
    }
  });
  it("line velocity: 0.55 · lineGain(N), the followed flight × 1.4", () => {
    const fs = [sky("A"), sky("B"), sky("C")];
    const vels = new Map<string, number>();
    for (let k = 0; k < 16; k++) for (const h of planStep(k, { epoch: 0, section: DAY }, arr(), fs, "B")) if (h.lineId) vels.set(h.lineId, h.vel);
    expect(vels.get("A")).toBeCloseTo(0.55 * lineGain(3), 12);
    expect(vels.get("B")).toBeCloseTo(1.4 * 0.55 * lineGain(3), 12);
  });
});
