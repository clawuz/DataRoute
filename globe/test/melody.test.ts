import { describe, expect, it } from "vitest";
import { SECTIONS } from "../src/audio/form";
import { CHORDS, ladderFreq, type Chord } from "../src/audio/harmony";
import {
  WIND_LADDER_OCTS, bearingOf, contourFor, graceAbove, initNey, neyCell, neyLadder, stepFor, windParts, type NeyNote, type NeyState,
} from "../src/audio/melody";

const { NIGHT, MORNING, DAY, EVENING } = SECTIONS;
const { Dm9, A7b9, Bbmaj7, Em7b5 } = CHORDS;
const pc = (s: number) => ((s % 12) + 12) % 12;
const JFK = { farLat: 40.6398, farLon: -73.7789 }; // west-northwest → down
const ESB = { farLat: 40.128, farLon: 32.995 }; // east → up
const JNB = { farLat: -26.1392, farLon: 28.246 }; // due south → arch
// DAY ladder on Dm9 (D dorian, A4 … E6): [24 26 27 29 31 32 34 36 38 39 41 43]; chord tones: all but 26, 34, 38
const mid: NeyState = { last: 34, cell: 0, restUntilBeat: 0 }; // G5: rung 6, not a chord tone
const semis = (ns: NeyNote[]) => ns.map((n) => n.semis);

describe("ney ladder on the chord scale", () => {
  it("the window starts at the section's home A (12·(neyOct − 2)) and spans 19 semitones of the chord scale", () => {
    expect(neyLadder(Dm9, DAY)).toEqual([24, 26, 27, 29, 31, 32, 34, 36, 38, 39, 41, 43]);
    expect(neyLadder(Dm9, NIGHT)).toEqual([12, 14, 15, 17, 19, 20, 22, 24, 26, 27, 29, 31]);
    // A phrygian dominant: Bb, C# and G#… the ladder follows the chord
    expect(neyLadder(A7b9, DAY)).toEqual([24, 25, 28, 29, 31, 32, 34, 36, 37, 40, 41, 43]);
    for (const c of Object.values(CHORDS)) for (const s of neyLadder(c, EVENING)) expect(c.scale.includes(pc(s))).toBe(true);
  });
  it("the state starts on the home A, as an absolute semitone", () => {
    expect(initNey(NIGHT)).toEqual({ last: 12, cell: 0, restUntilBeat: 0 });
    expect(initNey(EVENING)).toEqual({ last: 24, cell: 0, restUntilBeat: 0 });
  });
  it("graceAbove: the next chord-scale pitch above", () => {
    expect(graceAbove(32, Dm9)).toBe(34);
    expect(graceAbove(34, Dm9)).toBe(36);
    expect(graceAbove(25, A7b9)).toBe(28);
    expect(graceAbove(26, Bbmaj7)).toBe(27); // from outside the scale too
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

describe("neyCell on the chord-scale ladder", () => {
  const dep = (o: object, distKm = 1000) => ({ kind: "dep" as const, distKm, ...o });
  it("a west flight steps down, an east flight steps up; the first note is the nearest chord tone (ties → lower)", () => {
    // from rung 6 (34): chord tones at rungs 5 (32) and 7 (36) tie → 5
    const w = neyCell(dep(JFK), mid, Dm9, 1, DAY);
    expect(semis(w.notes)).toEqual([32, 31, 29]);
    const e = neyCell(dep(ESB), mid, Dm9, 1, DAY);
    expect(semis(e.notes)).toEqual([32, 34, 36]);
    for (const n of [...w.notes, ...e.notes]) expect(n.freq).toBeCloseTo(ladderFreq(n.semis), 9);
    expect(Dm9.tones.includes(pc(w.notes[0].semis))).toBe(true);
  });
  it("after a leap of two or more degrees the next move is one degree back", () => {
    expect(semis(neyCell(dep(JFK, 3000), mid, Dm9, 1, DAY).notes)).toEqual([32, 29, 31]); // rungs 5 → 3 → 4
    expect(semis(neyCell(dep(ESB, 5000), mid, Dm9, 1, DAY).notes)).toEqual([32, 38, 36]); // rungs 5 → 8 → 7
  });
  it("north/south routes arch: up by the step, then one degree below the start", () => {
    expect(semis(neyCell(dep(JNB, 5000), mid, Dm9, 1, DAY).notes)).toEqual([32, 38, 31]); // rungs 5, 8, 4
  });
  it("arrivals reverse the contour and sit an octave (seven rungs) lower, never below the window", () => {
    // target max(0, 6 − 7) = rung 0 (24, A: a chord tone); west reversed → up
    expect(semis(neyCell({ ...dep(JFK), kind: "arr" }, mid, Dm9, 1, DAY).notes)).toEqual([24, 26, 27]);
  });
  it("the last note is an absolute pitch snapped onto the current chord's ladder; no repeated note", () => {
    // C (27) is not in A phrygian dominant: it snaps to C# (28, rung 2) — a chord tone of A7(b9), so the cell starts there
    expect(semis(neyCell(dep(ESB), { last: 27, cell: 0, restUntilBeat: 0 }, A7b9, 1, DAY).notes)).toEqual([28, 29, 31]);
    // 32 (F, rung 5) is a Dm9 tone: the cell must not start on it again → the nearest other chord tone is rung 4 (31)
    expect(neyCell(dep(ESB), { last: 32, cell: 0, restUntilBeat: 0 }, Dm9, 1, DAY).notes[0].semis).toBe(31);
  });
  it("every pitch is in the chord scale and inside the window, for every chord, state and route", () => {
    for (const c of Object.values(CHORDS))
      for (const sec of [NIGHT, DAY])
        for (const last of [0, 12, 23, 27, 34, 44, 60])
          for (const far of [JFK, ESB, JNB])
            for (const kind of ["dep", "arr"] as const)
              for (const d of [500, 2000, 9000]) {
                const L = neyLadder(c, sec);
                const r = neyCell({ kind, distKm: d, ...far }, { last, cell: 0, restUntilBeat: 0 }, c, 1, sec);
                expect(c.tones.includes(pc(r.notes[0].semis))).toBe(true);
                for (const n of r.notes) {
                  expect(c.scale.includes(pc(n.semis))).toBe(true);
                  expect(n.semis >= L[0] && n.semis <= L[L.length - 1]).toBe(true);
                }
              }
  });
  it("slots, velocities, grace on strong beats only", () => {
    const strong = neyCell(dep(JFK), mid, Dm9, 4, DAY).notes;
    expect(strong.map((n) => [n.slotOffset, n.vel, n.grace, n.long])).toEqual([
      [0, 0.8, true, false], [1, 0.9, false, false], [2, 0.7, false, false],
    ]);
    expect(neyCell(dep(JFK), mid, Dm9, 5, DAY).notes[0].grace).toBe(false);
    expect(neyCell(dep(JFK), mid, Dm9, 4.5, DAY).notes[0].grace).toBe(false); // an off-beat slot
  });
  it("state: last note (absolute), cell count, and the ney stays busy for the cell (two beats)", () => {
    const r = neyCell(dep(JFK), mid, Dm9, 1, DAY);
    expect(r.state).toEqual({ last: 29, cell: 1, restUntilBeat: 3 });
    expect(neyCell(dep(ESB), r.state, Dm9, 2, DAY)).toEqual({ notes: [], state: r.state });
  });
  it("the fourth cell of a phrase is one long cadence note on the root or fifth, then a two-beat rest", () => {
    // Dm9 root D / fifth A rungs: 0 (24), 3 (29), 7 (36), 10 (41); nearest to rung 6 → 7
    const r = neyCell(dep(JFK), { last: 34, cell: 3, restUntilBeat: 0 }, Dm9, 8, DAY);
    expect(r.notes).toEqual([{ freq: ladderFreq(36), semis: 36, slotOffset: 0, durSlots: 8, vel: 1, grace: false, long: true }]);
    expect(r.state).toEqual({ last: 36, cell: 0, restUntilBeat: 10 });
    expect(neyCell(dep(ESB), r.state, Dm9, 9, DAY).notes).toEqual([]);
    expect(neyCell(dep(ESB), r.state, Dm9, 10, DAY).notes).toHaveLength(3);
  });
  it("a phrase from the start: three cells, a cadence, a breath, a new phrase", () => {
    let st = initNey(DAY);
    const sizes: number[] = [];
    for (const beat of [0, 2, 4, 6, 7, 8]) {
      const r = neyCell(dep(beat % 4 ? JFK : ESB), st, Em7b5, beat, DAY);
      sizes.push(r.notes.length);
      if (r.notes.length === 1) expect([7, 1].includes(pc(r.notes[0].semis))).toBe(true); // Em7b5 root E or (♭)fifth Bb
      st = r.state;
    }
    expect(sizes).toEqual([3, 3, 3, 1, 0, 3]);
    expect(st.cell).toBe(1);
  });
  it("the same inputs give the same output", () => {
    expect(neyCell(dep(JFK, 2500), mid, Dm9, 3, DAY)).toEqual(neyCell(dep(JFK, 2500), mid, Dm9, 3, DAY));
  });
  it("without far coordinates the cell rises (bearing treated as east)", () => {
    expect(semis(neyCell({ kind: "dep", distKm: 800 }, mid, Dm9, 1, DAY).notes)).toEqual([32, 34, 36]);
  });
});

describe("windParts: the ensemble follows the ney cell on the chord-scale ladder", () => {
  // wind ladder: Dm9 scale over octaves 2–5 (28 rungs): … 26 (15) 27 (16) 29 (17) 31 (18) 32 (19) 34 (20) 36 (21) …
  const cell = neyCell({ kind: "dep", distKm: 1000, ...JFK }, mid, Dm9, 1, DAY).notes; // 32 31 29
  const cadence = neyCell({ kind: "dep", distKm: 1000, ...JFK }, { last: 29, cell: 3, restUntilBeat: 0 }, Dm9, 8, DAY).notes; // 29
  const desc = (ps: ReturnType<typeof windParts>) => ps.map((p) => [p.instrument, p.semis, p.slotOffset, +p.vel.toFixed(6), p.long]);
  it("the wind ladder covers octaves 2–5", () => {
    expect(WIND_LADDER_OCTS).toEqual([2, 5]);
    expect(semis(cadence)).toEqual([29]);
  });
  it("night: the ney plays alone", () => {
    expect(windParts(cell, Dm9, NIGHT)).toEqual([]);
    expect(windParts(cadence, Dm9, NIGHT)).toEqual([]);
  });
  it("morning: the clarinet a diatonic third (two rungs) below every cell note at 0.7×, nothing on the cadence", () => {
    expect(desc(windParts(cell, Dm9, MORNING))).toEqual([
      ["CLA", 29, 0, 0.56, false], ["CLA", 27, 1, 0.63, false], ["CLA", 26, 2, 0.49, false],
    ]);
    expect(windParts(cadence, Dm9, MORNING)).toEqual([]);
  });
  it("day: clarinet on cells; the trumpet takes the cadence an octave (seven rungs) up", () => {
    expect(desc(windParts(cell, Dm9, DAY)).map((d) => d[0])).toEqual(["CLA", "CLA", "CLA"]);
    expect(desc(windParts(cadence, Dm9, DAY))).toEqual([["TPT", 41, 0, 0.9, true]]);
  });
  it("evening: clarinet plus a held saxophone a fifth (four rungs) below the first note; the sax also holds the cadence", () => {
    expect(desc(windParts(cell, Dm9, EVENING))).toEqual([
      ["CLA", 29, 0, 0.56, false], ["CLA", 27, 1, 0.63, false], ["CLA", 26, 2, 0.49, false], ["SAX", 26, 0, 0.48, true],
    ]);
    expect(desc(windParts(cadence, Dm9, EVENING))).toEqual([["SAX", 22, 0, 0.6, true]]);
  });
  it("winds stay in the chord scale; a rest gives no winds; rungs reflect at the ladder ends", () => {
    expect(windParts([], Dm9, DAY)).toEqual([]);
    const at = (s: number[], long = false): NeyNote[] => s.map((x, k) => ({ freq: ladderFreq(x), semis: x, slotOffset: k, durSlots: long ? 8 : 1, vel: 1, grace: false, long }));
    // rungs 0, 1, 2 (0, 2, 3): clarinet −2 reflects to 2, 1, 0; sax −4 reflects to 4 (7)
    expect(desc(windParts(at([0, 2, 3]), Dm9, EVENING)).map((d) => [d[0], d[1]])).toEqual([["CLA", 3], ["CLA", 2], ["CLA", 0], ["SAX", 7]]);
    // rung 25 (43) + 7 = 32 → reflected at 27 → 22 (38)
    expect(desc(windParts(at([43], true), Dm9, DAY))).toEqual([["TPT", 38, 0, 0.9, true]]);
    for (const c of [A7b9, Bbmaj7, Em7b5]) {
      const r = neyCell({ kind: "dep", distKm: 3000, ...ESB }, { last: 30, cell: 0, restUntilBeat: 0 }, c as Chord, 1, EVENING);
      for (const w of windParts(r.notes, c, EVENING)) expect(c.scale.includes(pc(w.semis))).toBe(true);
    }
  });
});

describe("v5 note durations (spec §4g)", () => {
  const JFKd = { kind: "dep" as const, distKm: 1000, ...JFK };
  const cell = neyCell(JFKd, mid, Dm9, 1, DAY).notes;
  const cadence = neyCell(JFKd, { last: 29, cell: 3, restUntilBeat: 0 }, Dm9, 8, DAY).notes;
  it("ney cell notes last [1, 1, 3] slots (the third is held); the cadence note 8", () => {
    expect(cell.map((n) => n.durSlots)).toEqual([1, 1, 3]);
    expect(cadence.map((n) => n.durSlots)).toEqual([8]);
  });
  it("winds: the clarinet copies its note, the saxophone holds twice its source, the trumpet the cadence's 8", () => {
    const d = (ps: ReturnType<typeof windParts>) => ps.map((p) => [p.instrument, p.durSlots]);
    expect(d(windParts(cell, Dm9, EVENING))).toEqual([["CLA", 1], ["CLA", 1], ["CLA", 3], ["SAX", 2]]);
    expect(d(windParts(cadence, Dm9, EVENING))).toEqual([["SAX", 16]]);
    expect(d(windParts(cadence, Dm9, DAY))).toEqual([["TPT", 8]]);
  });
});
