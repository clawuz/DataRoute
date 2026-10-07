import { describe, expect, it } from "vitest";
import { LEGACY_SECTIONS as SECTIONS } from "../src/audio/form"; // v2 data until Task 13
import {
  NEY_LADDER, bearingOf, contourFor, initNey, initPiano, ladderFreq, ladderIndexOf, neyCell, neyRange, pianoNext, stepFor, windParts,
  type NeyNote, type NeyState,
} from "../src/audio/melody";
import { freqOf, type LegacyChord as Chord } from "../src/audio/theory";

const { NIGHT, MORNING, DAY, EVENING } = SECTIONS;
const C = DAY.progression[0]; // C: root 3, third 7, fifth 10, seventh 2 → pitch classes C E G B
const AM: Chord = { name: "Am", root: 0, third: 3, fifth: 7 };
const pc = (i: number) => NEY_LADDER[i] % 12;
const JFK = { farLat: 40.6398, farLon: -73.7789 }; // west-northwest → down
const ESB = { farLat: 40.128, farLon: 32.995 }; // east → up
const JNB = { farLat: -26.1392, farLon: 28.246 }; // due south → arch
const mid: NeyState = { last: 19, cell: 0, restUntilBeat: 0 }; // DAY ladder 19 = F5
const idxs = (ns: NeyNote[]) => ns.map((n) => n.idx);
const moves = (ns: NeyNote[]) => ns.slice(1).map((n, k) => n.idx - ns[k].idx);

describe("ney ladder", () => {
  it("28 A-minor degrees above A2; ladder index = scale degree", () => {
    expect(NEY_LADDER).toHaveLength(28);
    expect(NEY_LADDER.slice(0, 8)).toEqual([0, 2, 3, 5, 7, 8, 10, 12]);
    expect(NEY_LADDER[27]).toBe(46); // degree 6 (G) of octave 3: 10 + 36
    expect(ladderFreq(0)).toBe(110);
    expect(ladderFreq(7)).toBeCloseTo(220, 9);
    expect(ladderFreq(14)).toBeCloseTo(freqOf(4, 0), 9);
    for (let i = 0; i < 28; i++) expect(ladderIndexOf(ladderFreq(i))).toBe(i);
  });
  it("ranges start at the section's home A: night A3, day A4; twelve degrees up", () => {
    expect(neyRange(NIGHT)).toEqual([7, 18]);
    expect(neyRange(DAY)).toEqual([14, 25]);
    expect(initNey(NIGHT)).toEqual({ last: 7, cell: 0, restUntilBeat: 0 });
    expect(initNey(EVENING)).toEqual({ last: 14, cell: 0, restUntilBeat: 0 });
  });
});

describe("route geometry → contour and step", () => {
  it("bearings from Istanbul (computed with initialBearing)", () => {
    const b = (p: { farLat: number; farLon: number }) => bearingOf(p.farLat, p.farLon);
    expect(b(JFK)).toBeGreaterThan(300); // 308.9°
    expect(b(JFK)).toBeLessThan(315);
    expect(b({ farLat: 25.2528, farLon: 55.3644 })).toBeCloseTo(117.7, 0); // Dubai
    expect(b({ farLat: 55.9726, farLon: 37.4146 })).toBeCloseTo(18.1, 0); // Moscow SVO is nearly due north
    expect(b(JNB)).toBeCloseTo(180.5, 0);
    expect(contourFor(b(JFK))).toBe("down");
    expect(contourFor(b({ farLat: 25.2528, farLon: 55.3644 }))).toBe("up");
    expect(contourFor(b({ farLat: 55.9726, farLon: 37.4146 }))).toBe("arch"); // 18° < 30°: north arch
    expect(contourFor(b({ farLat: 35.772, farLon: 140.3929 }))).toBe("up"); // Tokyo, 49.8°
    expect(contourFor(b(JNB))).toBe("arch");
  });
  it("contour sectors: ±30° around north and south are arches (circular), east up, west down", () => {
    expect([0, 29.9, 30, 150, 150.1, 209.9, 210, 330, 331, 359].map(contourFor)).toEqual([
      "arch", "arch", "up", "up", "arch", "arch", "down", "down", "arch", "arch",
    ]);
  });
  it("step grows with distance", () => {
    expect([0, 1499, 1500, 3999, 4000, 12000].map(stepFor)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("neyCell", () => {
  const dep = (o: object, distKm = 1000) => ({ kind: "dep" as const, distKm, ...o });
  it("a west flight steps down, an east flight steps up; the first note is the nearest other chord tone", () => {
    // chord tones of C in [14, 25]: 15 16 18 20 22 23 25; nearest to 19 → 18 and 20 tie → lower: 18
    const w = neyCell(dep(JFK), mid, C, 1, DAY);
    expect(idxs(w.notes)).toEqual([18, 17, 16]);
    expect(moves(w.notes)).toEqual([-1, -1]);
    const e = neyCell(dep(ESB), mid, C, 1, DAY);
    expect(idxs(e.notes)).toEqual([18, 19, 20]);
    expect(moves(e.notes)).toEqual([1, 1]);
    for (const n of [...w.notes, ...e.notes]) expect(n.freq).toBeCloseTo(ladderFreq(n.idx), 9);
    expect([C.root, C.third, C.fifth, C.seventh].includes(pc(w.notes[0].idx))).toBe(true);
    expect(w.notes[0].idx).not.toBe(mid.last);
  });
  it("after a leap of two or more degrees the next move is one degree back", () => {
    expect(moves(neyCell(dep(JFK, 3000), mid, C, 1, DAY).notes)).toEqual([-2, 1]);
    expect(moves(neyCell(dep(ESB, 5000), mid, C, 1, DAY).notes)).toEqual([3, -1]);
  });
  it("north/south routes arch: up by the step, then one degree below the start", () => {
    expect(idxs(neyCell(dep(JNB, 5000), mid, C, 1, DAY).notes)).toEqual([18, 21, 17]);
  });
  it("arrivals reverse the contour and sit an octave lower (never below the range)", () => {
    // target max(14, 19 − 7) = 14 → nearest chord tone other than 19: 15 (B); west reversed → up
    const a = neyCell({ ...dep(JFK), kind: "arr" }, mid, C, 1, DAY);
    expect(idxs(a.notes)).toEqual([15, 16, 17]);
  });
  it("notes stay inside [lo, hi] at the edges (reflection)", () => {
    const [lo, hi] = neyRange(DAY);
    for (const last of [14, 15, 24, 25])
      for (const far of [JFK, ESB, JNB])
        for (const kind of ["dep", "arr"] as const)
          for (const d of [500, 2000, 9000]) {
            const r = neyCell({ kind, distKm: d, ...far }, { last, cell: 0, restUntilBeat: 0 }, C, 1, DAY);
            for (const n of r.notes) expect(n.idx >= lo && n.idx <= hi).toBe(true);
          }
  });
  it("slots, velocities, grace on strong beats only", () => {
    const strong = neyCell(dep(JFK), mid, C, 4, DAY).notes;
    expect(strong.map((n) => [n.slotOffset, n.vel, n.grace, n.long])).toEqual([
      [0, 0.8, true, false], [1, 0.9, false, false], [2, 0.7, false, false],
    ]);
    expect(neyCell(dep(JFK), mid, C, 5, DAY).notes[0].grace).toBe(false);
    expect(neyCell(dep(JFK), mid, C, 4.5, DAY).notes[0].grace).toBe(false); // an off-beat slot
  });
  it("state: last note, cell count, and the ney stays busy for the cell (two beats)", () => {
    const r = neyCell(dep(JFK), mid, C, 1, DAY);
    expect(r.state).toEqual({ last: 16, cell: 1, restUntilBeat: 3 });
    expect(neyCell(dep(ESB), r.state, C, 2, DAY)).toEqual({ notes: [], state: r.state });
  });
  it("the fourth cell of a phrase is one long cadence note on the root or fifth, then a two-beat rest", () => {
    // C root (pc 3) at 16, 23; fifth (pc 10) at 20 → nearest to 19 is 20
    const r = neyCell(dep(JFK), { last: 19, cell: 3, restUntilBeat: 0 }, C, 8, DAY);
    expect(r.notes).toEqual([{ freq: ladderFreq(20), idx: 20, slotOffset: 0, vel: 1, grace: false, long: true }]);
    expect(r.state).toEqual({ last: 20, cell: 0, restUntilBeat: 10 });
    expect(neyCell(dep(ESB), r.state, C, 9, DAY).notes).toEqual([]);
    expect(neyCell(dep(ESB), r.state, C, 10, DAY).notes).toHaveLength(3);
  });
  it("a phrase from the start: three cells, a cadence, a breath, a new phrase", () => {
    let st = initNey(DAY);
    const sizes: number[] = [];
    for (const beat of [0, 2, 4, 6, 7, 8]) {
      const r = neyCell(dep(beat % 4 ? JFK : ESB), st, AM, beat, DAY);
      sizes.push(r.notes.length);
      if (r.notes.length === 1) expect([0, 7].includes(pc(r.notes[0].idx))).toBe(true); // Am root A or fifth E
      st = r.state;
    }
    expect(sizes).toEqual([3, 3, 3, 1, 0, 3]);
    expect(st.cell).toBe(1);
  });
  it("the same inputs give the same output", () => {
    expect(neyCell(dep(JFK, 2500), mid, C, 3, DAY)).toEqual(neyCell(dep(JFK, 2500), mid, C, 3, DAY));
  });
  it("without far coordinates the cell rises (bearing treated as east)", () => {
    expect(moves(neyCell({ kind: "dep", distKm: 800 }, mid, C, 1, DAY).notes)).toEqual([1, 1]);
  });
});

describe("windParts: the ensemble follows the ney cell", () => {
  const cell = neyCell({ kind: "dep", distKm: 1000, ...JFK }, mid, C, 1, DAY).notes; // 18 17 16
  const cadence = neyCell({ kind: "dep", distKm: 1000, ...JFK }, { last: 19, cell: 3, restUntilBeat: 0 }, C, 8, DAY).notes; // 20
  const desc = (ps: ReturnType<typeof windParts>) => ps.map((p) => [p.instrument, ladderIndexOf(p.freq), p.slotOffset, +p.vel.toFixed(6), p.long]);
  it("night: the ney plays alone", () => {
    expect(windParts(cell, C, NIGHT)).toEqual([]);
    expect(windParts(cadence, C, NIGHT)).toEqual([]);
  });
  it("morning: the clarinet a diatonic third below every cell note at 0.7×, nothing on the cadence", () => {
    expect(desc(windParts(cell, C, MORNING))).toEqual([
      ["CLA", 16, 0, 0.56, false], ["CLA", 15, 1, 0.63, false], ["CLA", 14, 2, 0.49, false],
    ]);
    expect(windParts(cadence, C, MORNING)).toEqual([]);
  });
  it("day: clarinet on cells; the trumpet takes the cadence an octave up (no clarinet doubling)", () => {
    expect(desc(windParts(cell, C, DAY)).map((d) => d[0])).toEqual(["CLA", "CLA", "CLA"]);
    expect(desc(windParts(cadence, C, DAY))).toEqual([["TPT", 27, 0, 0.9, true]]);
  });
  it("evening: clarinet plus a held saxophone a fifth below the first note; the sax also holds the cadence", () => {
    expect(desc(windParts(cell, C, EVENING))).toEqual([
      ["CLA", 16, 0, 0.56, false], ["CLA", 15, 1, 0.63, false], ["CLA", 14, 2, 0.49, false], ["SAX", 14, 0, 0.48, true],
    ]);
    expect(desc(windParts(cadence, C, EVENING))).toEqual([["SAX", 16, 0, 0.6, true]]);
  });
  it("a rest gives no winds; indices reflect into the ladder at the extremes", () => {
    expect(windParts([], C, DAY)).toEqual([]);
    const low: NeyNote[] = [0, 1, 2].map((idx, k) => ({ freq: ladderFreq(idx), idx, slotOffset: k, vel: 1, grace: false, long: false }));
    expect(desc(windParts(low, C, EVENING)).map((d) => [d[0], d[1]])).toEqual([["CLA", 2], ["CLA", 1], ["CLA", 0], ["SAX", 4]]);
    const top: NeyNote[] = [{ freq: ladderFreq(25), idx: 25, slotOffset: 0, vel: 1, grace: false, long: true }];
    expect(desc(windParts(top, C, DAY))).toEqual([["TPT", 22, 0, 0.9, true]]); // 25 + 7 = 32 → reflected at 27 → 22
  });
});

describe("pianoNext: flowing arpeggio", () => {
  it("root – fifth – third+12 – fifth – root … on one chord", () => {
    let st = { i: 0, chordKey: "Am0" };
    const out: number[] = [];
    for (let k = 0; k < 5; k++) {
      const r = pianoNext(st, AM, "Am0", 4);
      expect(r.notes).toHaveLength(1);
      out.push(r.notes[0].freq);
      st = r.state;
    }
    expect(out).toEqual([0, 7, 15, 7, 0].map((t) => freqOf(4, t)));
  });
  it("a new chord opens with a three-note roll 30 ms apart, then continues on the fifth", () => {
    const r = pianoNext(initPiano(), AM, "Am0", 4);
    expect(r.notes).toEqual([
      { freq: freqOf(4, 0), offsetSec: 0 }, { freq: freqOf(4, 7), offsetSec: 0.03 }, { freq: freqOf(4, 15), offsetSec: 0.06 },
    ]);
    expect(r.state).toEqual({ i: 3, chordKey: "Am0" });
    expect(pianoNext(r.state, AM, "Am0", 4).notes).toEqual([{ freq: freqOf(4, 7), offsetSec: 0 }]);
    expect(pianoNext(r.state, C, "C1", 4).notes).toHaveLength(3);
  });
  it("the octave is clamped to 3..5", () => {
    expect(pianoNext({ i: 0, chordKey: "k" }, AM, "k", 2).notes[0].freq).toBe(freqOf(3, 0));
    expect(pianoNext({ i: 0, chordKey: "k" }, AM, "k", 7).notes[0].freq).toBe(freqOf(5, 0));
  });
});
