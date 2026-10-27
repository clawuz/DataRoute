import { describe, expect, it } from "vitest";
import type { PersonalNote } from "../src/personal/compose";
import { applyGestures, GESTURES, gesturesOf, type GestureContext } from "../src/personal/gestures";

const hz = (s: number): number => 110 * 2 ** (s / 12);
const st = (a: number, b: number): number => 12 * Math.log2(a / b);
const mk = (instrument: string, t: number, o: Partial<PersonalNote> = {}): PersonalNote => ({
  t, d: 0.3, instrument: instrument as PersonalNote["instrument"], freq: hz(12), vel: 0.6, key: "R0", route: 0, via: 0, alt: 1000, pan: 0.2, wet: 0.3, ...o,
});
const mkctx = (role = "hook", card = "x"): GestureContext & { role: string; card: string } => ({
  role, card, bar: 2, beat: 0.5, cardOf() { return this.card; }, roleOf() { return this.role; }, chordAt: () => ({ root: 0, third: 3 }), keyRoot: 2, hz,
});
const run = (notes: PersonalNote[], role = "hook", card = "x"): PersonalNote[] => {
  const c = mkctx(role, card);
  return applyGestures(notes, { ...c, cardOf: () => card, roleOf: () => role });
};
const hidden = (a: PersonalNote[]): PersonalNote[] => a.filter((n) => n.show === false);

describe("KEMENCE_MAKAM", () => {
  it("double stop: a hidden fourth below, same t, half velocity", () => {
    const out = run([mk("KEMENCE_MAKAM", 0.25, { d: 0.3 })]);
    const ds = out.find((n) => n.t === 0.25 && n.show === false && Math.abs(st(n.freq, hz(12)) + 5) < 1e-6)!;
    expect(ds).toBeDefined();
    expect(ds.vel).toBeCloseTo(0.3, 9);
    expect(ds.d).toBe(0.3);
  });
  it("short notes are left alone", () => {
    const n = mk("KEMENCE_MAKAM", 0.25, { d: 0.1 });
    expect(run([n])).toEqual([n]);
  });
  it("grace in: on a beat a hidden grace 55 ms before at +2 st; off the beat none", () => {
    const on = run([mk("KEMENCE_MAKAM", 1)]);
    const g = on.find((n) => Math.abs(n.t - 0.945) < 1e-9)!;
    expect(g.show).toBe(false);
    expect(st(g.freq, hz(12))).toBeCloseTo(2, 6);
    expect(g.d).toBeCloseTo(0.05, 9);
    expect(g.vel).toBeCloseTo(0.27, 9);
    const off = run([mk("KEMENCE_MAKAM", 1.2)]);
    expect(off.some((n) => Math.abs(n.t - 1.145) < 1e-9)).toBe(false);
  });
  it("drone: the first note of a bar gets one held hidden note to the bar end", () => {
    const out = run([mk("KEMENCE_MAKAM", 2.25), mk("KEMENCE_MAKAM", 3)]);
    const dr = out.filter((n) => n.show === false && Math.abs(n.freq - hz(2 - 12)) < 1e-9);
    expect(dr).toHaveLength(1);
    expect(dr[0].t).toBe(2.25);
    expect(dr[0].t + dr[0].d).toBeCloseTo(4, 9);
    expect(dr[0].vel).toBeCloseTo(0.18, 9);
  });
});

describe("SAZ", () => {
  it("strum on strong beats only", () => {
    const out = run([mk("SAZ", 1, { vel: 0.6 })]);
    const h = hidden(out);
    expect(h.map((n) => n.t).sort()).toEqual([1.012, 1.024]);
    expect(h.map((n) => Math.round(st(n.freq, hz(12))))).toEqual([-7, -12]);
    expect(h[0].d).toBe(0.14);
    expect(h[0].vel).toBeCloseTo(0.24, 9);
    expect(hidden(run([mk("SAZ", 1, { vel: 0.4 })]))).toHaveLength(0);
    expect(hidden(run([mk("SAZ", 1.2, { vel: 0.6 })]))).toHaveLength(0);
  });
  it("glide on a third of the hook notes", () => {
    const notes = Array.from({ length: 300 }, (_, k) => mk("SAZ", 0.1 + k * 0.37 + 0.013, { key: `K${k}`, d: 0.4, vel: 0.3 }));
    const g = run(notes).filter((n) => n.glide === 1).length;
    expect(g / 300).toBeGreaterThan(0.2);
    expect(g / 300).toBeLessThan(0.45);
  });
});

describe("KANUN", () => {
  it("tremolo: hits every 0.075 s, at most 14, later hits hidden, octave hidden", () => {
    const n = mk("KANUN", 1, { d: 2 });
    const out = run([n]);
    expect(out[0]).toBe(n);
    const hits = out.filter((x) => x.show === false && x.freq === n.freq);
    expect(hits).toHaveLength(13);
    hits.forEach((h, k) => {
      expect(h.t).toBeCloseTo(1 + 0.075 * (k + 1), 9);
      expect(h.d).toBe(0.075);
      expect(h.vel).toBeCloseTo(0.33, 9);
    });
    const oct = out.filter((x) => x.freq === n.freq * 2);
    expect(oct).toHaveLength(1);
    expect(oct[0].show).toBe(false);
    expect(oct[0].t).toBe(1);
    expect(oct[0].vel).toBeCloseTo(0.24, 9);
  });
  it("hits stay inside the note", () => {
    const hits = run([mk("SANTUR", 0, { d: 0.5 })]).filter((x) => x.freq === hz(12) && x.show === false);
    expect(hits).toHaveLength(6);
  });
  it("short notes untouched", () => {
    const n = mk("KANUN", 1, { d: 0.25 });
    expect(run([n])).toEqual([n]);
  });
});

describe("NYLONGUITAR", () => {
  const one = (t: number, card: string): PersonalNote[] => run([mk("NYLONGUITAR", t, { freq: hz(14) })], "pluck", card);
  it("spread and count by card", () => {
    const fl = one(0, "flamenco");
    expect(fl).toHaveLength(5);
    expect(fl[1].t).toBeCloseTo(0.055, 9);
    expect(one(0, "bossa")[1].t).toBeCloseTo(0.018, 9);
    expect(one(0, "pop")[1].t).toBeCloseTo(0.025, 9);
    expect(one(0, "pop")).toHaveLength(3);
  });
  it("added notes are chord tones above the note, hidden, 0.6 velocity", () => {
    const out = one(0, "pop");
    const add = out.slice(1);
    add.forEach((n) => {
      expect(n.show).toBe(false);
      expect(n.vel).toBeCloseTo(0.36, 9);
      expect(n.freq).toBeGreaterThan(hz(14));
    });
    expect(out[0].show).toBeUndefined();
  });
  it("strums down on beats 0 and 2 only: beats 1 and 3 and off-beat notes are left alone", () => {
    const down = one(0, "pop").slice(1).map((n) => n.t - 0);
    expect(down[0]).toBeLessThan(down[1]);
    const down2 = one(1, "pop").slice(1);
    expect(down2[0].t).toBeLessThan(down2[1].t);
    expect(one(0.5, "pop")).toHaveLength(1);
    expect(one(1.5, "pop")).toHaveLength(1);
  });
  it("off-beat notes untouched", () => {
    expect(one(0.2, "pop")).toHaveLength(1);
  });
});

describe("UPRIGHTBASS", () => {
  const root = hz(0);
  const bass = (t: number): PersonalNote => mk("UPRIGHTBASS", t, { freq: root, d: 0.4 });
  it("walks in jazz: root, fifth, third, approach", () => {
    const out = run([bass(2), bass(3)], "bass", "jazz");
    expect(out).toHaveLength(4);
    expect(out.map((n) => n.t)).toEqual([2, 2.5, 3, 3.5]);
    expect(out.map((n) => n.show)).toEqual([undefined, false, false, false]);
    expect(out.map((n) => Math.round(st(n.freq, root)))).toEqual([0, 7, 3, -1]);
    expect(out[1].vel).toBeCloseTo(0.48, 9);
  });
  it("alternates the second bass note to the fifth below in country", () => {
    const out = run([bass(2), bass(3)], "bass", "country");
    expect(out).toHaveLength(2);
    expect(out[0].freq).toBe(root);
    expect(st(out[1].freq, root)).toBeCloseTo(-5, 6);
  });
  it("other cards untouched", () => {
    const n = [bass(2), bass(3)];
    const out = run(n, "bass", "rock");
    expect(out[0]).toBe(n[0]);
    expect(out[1]).toBe(n[1]);
  });
});

describe("TANPURA", () => {
  it("cycles Pa, Sa, Sa, Sa low every beat", () => {
    const d = mk("TANPURA", 0, { d: 2, show: false, vel: 0.5 });
    const out = run([d], "drone");
    expect(out).toHaveLength(4);
    expect(out.map((n) => n.t)).toEqual([0, 0.5, 1, 1.5]);
    expect(out.map((n) => Math.round(st(n.freq, hz(12))))).toEqual([7, 12, 12, 0]);
    out.forEach((n) => {
      expect(n.show).toBe(false);
      expect(n.d).toBeCloseTo(0.8, 9);
      expect(n.vel).toBeCloseTo(0.35, 9);
    });
  });
});

describe("NEY_MAKAM", () => {
  it("glides 2 st on phrase starts", () => {
    const notes = [mk("NEY_MAKAM", 0, { d: 0.4 }), mk("NEY_MAKAM", 0.5, { d: 0.4 }), mk("NEY_MAKAM", 3, { d: 0.4 })];
    const out = run(notes);
    expect(out[0].glide).toBe(2);
    expect(out[1].glide).not.toBe(2);
    expect(out[2].glide).toBe(2);
  });
  it("glideNote on about half of the others", () => {
    const notes = Array.from({ length: 300 }, (_, k) => mk("NEY_MAKAM", k * 0.45, { key: `K${k}`, d: 0.4 }));
    const g = run(notes).filter((n) => n.glide === 1).length;
    expect(g / 300).toBeGreaterThan(0.3);
    expect(g / 300).toBeLessThan(0.7);
  });
});

describe("the real recordings", () => {
  it("the real ney, the bansuri and the zurna glide 2 st on phrase starts like the makam ney", () => {
    for (const name of ["NEY_REAL", "BANSURI", "ZURNA"]) {
      const out = run([mk(name, 0, { d: 0.4 }), mk(name, 0.5, { d: 0.4 }), mk(name, 3, { d: 0.4 })]);
      expect(out[0].glide, name).toBe(2);
      expect(out[1].glide, name).not.toBe(2);
      expect(out[2].glide, name).toBe(2);
    }
  });
  it("the real kemençe and the sarangi play a hidden fourth below and a grace note on the beat, but no drone", () => {
    for (const name of ["KEMENCE_REAL", "SARANGI"]) {
      const out = run([mk(name, 1, { d: 0.3 })]);
      expect(out.some((n) => n.show === false && n.t === 1 && Math.abs(st(n.freq, hz(12)) + 5) < 1e-6), name).toBe(true);
      expect(out.some((n) => n.show === false && Math.abs(n.t - 0.945) < 1e-9 && Math.abs(st(n.freq, hz(12)) - 2) < 1e-6), name).toBe(true);
      expect(out.some((n) => n.show === false && n.d > 0.5), name).toBe(false);
    }
  });
});

describe("SAZ widened", () => {
  it("strums a pluck-role note on beats 0 and 2 of the bar whatever its velocity, not on beats 1 and 3", () => {
    expect(hidden(run([mk("SAZ", 1, { vel: 0.3 })], "pluck"))).toHaveLength(2);
    expect(hidden(run([mk("BAGLAMA_MAKAM", 0, { vel: 0.3 })], "pluck"))).toHaveLength(2);
    expect(hidden(run([mk("BAGLAMA_MAKAM", 1.5, { vel: 0.3 })], "pluck"))).toHaveLength(0);
    expect(hidden(run([mk("SAZ", 0.5, { vel: 0.3 })], "pluck"))).toHaveLength(0);
    expect(hidden(run([mk("BAGLAMA_EXTRA", 1.2, { vel: 0.3 })], "pluck"))).toHaveLength(0);
  });
  it("a hook note still needs vel >= 0.5", () => {
    expect(hidden(run([mk("SAZ", 1, { vel: 0.4 })], "hook"))).toHaveLength(0);
    expect(hidden(run([mk("SAZ", 1, { vel: 0.5 })], "hook"))).toHaveLength(2);
  });
});

describe("KANUN / SANTUR widened", () => {
  it("pluck role: a roll of two hidden notes (+12 st at 35 ms, +19 st at 70 ms, vel x0.4) on beats 0 and 2 only", () => {
    expect(hidden(run([mk("KANUN", 0.5, { d: 0.2 })], "pluck"))).toHaveLength(0);
    expect(hidden(run([mk("SANTUR", 1.5, { d: 0.2 })], "pluck"))).toHaveLength(0);
    expect(hidden(run([mk("SANTUR", 2, { d: 0.2 })], "pluck"))).toHaveLength(2);
    const out = hidden(run([mk("KANUN", 1, { d: 0.2 })], "pluck"));
    expect(out.map((n) => Math.round(st(n.freq, hz(12))))).toEqual([12, 19]);
    expect(out.map((n) => n.t)).toEqual([1.035, 1.07]);
    out.forEach((n) => expect(n.vel).toBeCloseTo(0.24, 9));
    expect(hidden(run([mk("SANTUR", 1.2, { d: 0.2 })], "pluck"))).toHaveLength(0);
  });
  it("hook role: tremolo from 0.3 s", () => {
    expect(hidden(run([mk("KANUN", 1, { d: 0.3 })]))).not.toHaveLength(0);
    expect(hidden(run([mk("SANTUR", 1, { d: 0.25 })]))).toHaveLength(0);
  });
});

describe("HARP / FOLKHARP", () => {
  it("pluck role, first note of a bar: four ascending chord tones every 45 ms, vel x0.5; later notes of the bar nothing", () => {
    const out = run([mk("HARP", 2.5), mk("HARP", 3)], "pluck");
    const h = hidden(out);
    expect(h).toHaveLength(4);
    expect(h.map((n) => n.t.toFixed(3))).toEqual(["2.545", "2.590", "2.635", "2.680"]);
    const f = h.map((n) => n.freq);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    h.forEach((n) => expect(n.vel).toBeCloseTo(0.3, 9));
    expect(hidden(run([mk("FOLKHARP", 0)], "pluck"))).toHaveLength(4);
    expect(hidden(run([mk("HARP", 0)], "hook"))).toHaveLength(0);
  });
});

describe("piano family", () => {
  it("hook role: octave below on a beat, same t and d, vel x0.35", () => {
    for (const name of ["PNO", "STEINWAY", "KAWAI", "KNIGHTPNO", "UPRIGHTPNO", "RHODES", "NS_EKEYS_098", "NS_KEYS_AC_004"]) {
      const h = hidden(run([mk(name, 1, { d: 0.4 })]));
      expect(h, name).toHaveLength(1);
      expect(st(h[0].freq, hz(12))).toBeCloseTo(-12, 6);
      expect(h[0].t).toBe(1);
      expect(h[0].d).toBe(0.4);
      expect(h[0].vel).toBeCloseTo(0.21, 9);
    }
    expect(hidden(run([mk("PNO", 1.2)]))).toHaveLength(0);
  });
  it("pluck role: a left-hand bass (chord root - 12, 1.5 beats, vel x0.4) on the first note of each bar only", () => {
    const h = hidden(run([mk("PNO", 2.5), mk("PNO", 3), mk("PNO", 4)], "pluck"));
    expect(h).toHaveLength(2);
    expect(h[0].t).toBe(2.5);
    expect(h[0].d).toBeCloseTo(0.75, 9);
    expect(h[0].freq).toBeCloseTo(hz(2 - 12), 9);
    expect(h[0].vel).toBeCloseTo(0.24, 9);
  });
});

describe("ACCORDION", () => {
  it("oom-pah: bass on beats 0 and 2, a two-note stab on beats 1 and 3, once per bar position", () => {
    const notes = [0, 0.5, 1, 1.5, 2].flatMap((t) => [mk("ACCORDION", t), mk("ACCORDION", t, { key: "R9" })]);
    const h = hidden(run(notes, "pluck"));
    const at = (t: number) => h.filter((n) => n.t === t);
    expect(at(0)).toHaveLength(1);
    expect(at(0)[0].freq).toBeCloseTo(hz(2 - 12), 9);
    expect(at(0)[0].d).toBeCloseTo(0.2, 9);
    expect(at(0)[0].vel).toBeCloseTo(0.21, 9);
    expect(at(0.5)).toHaveLength(2);
    expect(at(0.5)[0].d).toBeCloseTo(0.15, 9);
    expect(at(0.5)[0].vel).toBeCloseTo(0.18, 9);
    expect(at(1)).toHaveLength(1);
    expect(at(1.5)).toHaveLength(2);
    expect(at(2)).toHaveLength(1);
    expect(hidden(run([mk("ACCORDION", 0.2)], "hook"))).toHaveLength(0);
    expect(hidden(run([mk("ACCORDION", 0)], "bass"))).toHaveLength(0);
  });
});

describe("VIOLIN", () => {
  it("hook role: glide 1 on the first note after a gap of 0.3 s, not inside a run", () => {
    const out = run([mk("VIOLIN", 0, { d: 0.2 }), mk("VIOLIN", 0.25, { d: 0.2 }), mk("VIOLIN", 1, { d: 0.2 })]);
    expect(out.map((n) => n.glide)).toEqual([1, undefined, 1]);
  });
  it("a hidden fifth below on notes of 0.5 s or more, vel x0.4", () => {
    const h = hidden(run([mk("VIOLIN", 0, { d: 0.5 }), mk("VIOLIN", 2, { d: 0.4 })]));
    expect(h).toHaveLength(1);
    expect(st(h[0].freq, hz(12))).toBeCloseTo(-7, 6);
    expect(h[0].vel).toBeCloseTo(0.24, 9);
    expect(h[0].t).toBe(0);
  });
});

describe("koto family", () => {
  it("pluck role: a hidden repeat 60 ms later, same pitch, vel x0.5; hook role: tremolo from 0.35 s", () => {
    for (const name of ["KOTO", "KAYAGEUM", "DANTRANH", "PSALTERY"]) {
      const h = hidden(run([mk(name, 1, { d: 0.3 })], "pluck"));
      expect(h, name).toHaveLength(1);
      expect(h[0].t).toBeCloseTo(1.06, 9);
      expect(h[0].freq).toBe(hz(12));
      expect(h[0].vel).toBeCloseTo(0.3, 9);
      expect(hidden(run([mk(name, 1, { d: 0.3 })]))).toHaveLength(0);
      expect(hidden(run([mk(name, 1, { d: 0.35 })])).length).toBeGreaterThan(0);
    }
  });
});

describe("winds: glide on a third of the long hook notes", () => {
  it("fires for each instrument, only on hook notes of 0.3 s or more", () => {
    for (const name of ["TENORSAX", "CLA", "FLUTE", "OBOE", "DUDUK", "SHAKUHACHI", "ERHU"]) {
      const notes = Array.from({ length: 300 }, (_, k) => mk(name, k * 0.4, { key: `K${k}`, d: 0.35 }));
      const g = run(notes).filter((n) => n.glide === 1).length;
      expect(g / 300, name).toBeGreaterThan(0.2);
      expect(g / 300, name).toBeLessThan(0.45);
      expect(run(notes.map((n) => ({ ...n, d: 0.2 }))).some((n) => n.glide), name).toBe(false);
      expect(run(notes, "pluck").some((n) => n.glide), name).toBe(false);
    }
  });
});

describe("steel / electric guitars", () => {
  it("strum in the pluck role like the nylon guitar, for the numbered families", () => {
    for (const name of ["NS_GUITAR_AC_015", "NS_GUITAR_EL_028"]) {
      const out = run([mk(name, 0, { freq: hz(14) })], "pluck", "pop");
      expect(out, name).toHaveLength(3);
      expect(out[1].t).toBeCloseTo(0.025, 9);
    }
  });
  it("country: boom-chick: bass (root - 12, vel x0.5) on beats 0 and 2 without a strum, the strum on beats 1 and 3", () => {
    const at = (t: number) => run([mk("NS_GUITAR_AC_015", t, { freq: hz(14) })], "pluck", "country");
    for (const t of [0, 1]) {
      const h = hidden(at(t));
      expect(h).toHaveLength(1);
      expect(h[0].freq).toBeCloseTo(hz(2 - 12), 9);
      expect(h[0].vel).toBeCloseTo(0.3, 9);
    }
    for (const t of [0.5, 1.5]) expect(hidden(at(t))).toHaveLength(2);
  });
});

describe("BAGPIPE", () => {
  it("a grace note +2 st, 40 ms before, on a note that repeats the previous pitch of its route", () => {
    const out = run([mk("BAGPIPE", 0), mk("BAGPIPE", 0.5), mk("BAGPIPE", 1, { freq: hz(14) }), mk("BAGPIPE", 1.5, { route: 1, via: 1 })], "hook");
    const h = hidden(out);
    expect(h).toHaveLength(1);
    expect(h[0].t).toBeCloseTo(0.46, 9);
    expect(h[0].d).toBeCloseTo(0.04, 9);
    expect(st(h[0].freq, hz(12))).toBeCloseTo(2, 6);
    expect(h[0].vel).toBeCloseTo(0.24, 9);
  });
});

describe("general", () => {
  it("an untouched instrument returns the identical objects", () => {
    const n = [mk("CELLO", 0), mk("CELLO", 1)];
    const out = run(n);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(n[0]);
    expect(out[1]).toBe(n[1]);
  });
  it("is deterministic", () => {
    const n = [mk("SAZ", 1), mk("KANUN", 2, { d: 1 }), mk("KEMENCE_MAKAM", 0.5), mk("NEY_MAKAM", 4)];
    expect(run(n)).toEqual(run(n));
  });
  it("no note starts before 0; added notes are hidden and copy route data", () => {
    const src = mk("KEMENCE_MAKAM", 0, { route: 3, via: 3, key: "R3", pan: -0.4, wet: 0.1, alt: 777 });
    const out = run([src]);
    expect(out.length).toBeGreaterThan(1);
    for (const n of out) expect(n.t).toBeGreaterThanOrEqual(0);
    for (const n of hidden(out)) {
      expect(n.route).toBe(3);
      expect(n.via).toBe(3);
      expect(n.key).toBe("R3");
      expect(n.alt).toBe(777);
      expect(n.pan).toBe(-0.4);
      expect(n.wet).toBe(0.1);
    }
    // the drawn note is a copy with the scoop of a phrase start (the bowed portamento); the source is untouched
    expect(out[0]).toEqual({ ...src, glide: 1 });
    expect(src.glide).toBeUndefined();
  });
});


describe("review fixes", () => {
  const ctxWith = (o: Partial<GestureContext> = {}, role = "hook", card = "x"): GestureContext => ({ ...mkctx(role, card), cardOf: () => card, roleOf: () => role, ...o });

  it("M2: a tremolo stops at the next note of its route and instrument; the octave note ends before it", () => {
    const a = mk("KANUN", 1, { d: 2 });
    const b = mk("KANUN", 1.6, { d: 0.2 });
    const other = mk("KANUN", 1.3, { d: 0.5, route: 1, via: 1 }); // another route: no limit
    const out = hidden(applyGestures([a, b, other], ctxWith()));
    const mine = out.filter((x) => x.route === 0 && x.t < 1.6 + 1e-9);
    expect(mine.length).toBeGreaterThan(3);
    for (const x of mine) expect(x.t + x.d).toBeLessThanOrEqual(1.6 - 0.01 + 1e-9);
    expect(out.filter((x) => x.route === 0 && x.t >= 1.6 - 0.01 && x.t < 2.5 && x.freq === a.freq)).toHaveLength(0);
    const oct = out.find((x) => x.freq === a.freq * 2 && x.t === 1)!;
    expect(oct.d).toBeCloseTo(0.59, 9);
    // the other route's note is free to ring
    const free = out.filter((x) => x.route === 1);
    expect(free.length).toBeGreaterThan(0);
  });

  it("M2: a tremolo with no later note keeps its full length", () => {
    const hits = hidden(run([mk("KANUN", 1, { d: 2 })])).filter((x) => x.freq === hz(12));
    expect(hits).toHaveLength(13);
  });

  it("M3: every added note of 0.2 s or less is marked short; longer ones and drawn notes are not", () => {
    const out = [
      ...run([mk("SAZ", 1, { vel: 0.6 })]),
      ...run([mk("NYLONGUITAR", 0, { freq: hz(14) })], "pluck", "pop"),
      ...run([mk("KEMENCE_MAKAM", 1)]),
      ...run([mk("KANUN", 1, { d: 1 })]),
    ];
    const add = hidden(out);
    expect(add.length).toBeGreaterThan(8);
    for (const x of add) expect(x.short === true, `${String(x.instrument)} d=${x.d}`).toBe(x.d <= 0.2);
    expect(add.some((x) => x.short)).toBe(true);
    expect(add.some((x) => !x.short)).toBe(true);
    for (const x of out.filter((y) => y.show !== false)) expect(x.short).toBeUndefined();
  });

  it("L1: the kemençe drone is not struck in a silent bar", () => {
    const ctx = ctxWith({ silentBar: (b: number) => b === 1 });
    const droneAt = (t: number, c: GestureContext) =>
      hidden(applyGestures([mk("KEMENCE_MAKAM", t)], c)).filter((x) => Math.abs(x.freq - hz(2 - 12)) < 1e-9);
    expect(droneAt(2.25, ctx)).toHaveLength(0); // bar 1
    expect(droneAt(4.25, ctx)).toHaveLength(1); // bar 2
    expect(droneAt(2.25, ctxWith())).toHaveLength(1); // no silentBar given: as before
  });

  it("L2: the tanpura cycle runs on the tonic drone note only; the fifth is dropped", () => {
    const tonic = mk("TANPURA", 0, { d: 2, show: false, vel: 0.5, freq: hz(2 - 12) });
    const fifth = mk("TANPURA", 0, { d: 2, show: false, vel: 0.5, freq: hz(2 - 12 + 7) });
    const out = run([tonic, fifth], "drone");
    expect(out).toHaveLength(4);
    expect(out.map((n) => Math.round(st(n.freq, tonic.freq)))).toEqual([7, 12, 12, 0]);
  });

  it("L4: origin(added, source) is reported for every added note, also when the source is dropped", () => {
    const seen: [PersonalNote, PersonalNote][] = [];
    const tonic = mk("TANPURA", 0, { d: 2, show: false, freq: hz(2 - 12) });
    const saz = mk("SAZ", 1, { vel: 0.6 });
    const out = applyGestures([tonic, saz], ctxWith({ origin: (a: PersonalNote, s: PersonalNote) => void seen.push([a, s]) }, "drone"));
    const added = out.filter((x) => x !== saz);
    expect(added).toHaveLength(4 + 2);
    for (const a of added) expect(seen.some(([x, s]) => x === a && (s === tonic || s === saz))).toBe(true);
    expect(seen.filter(([, s]) => s === tonic)).toHaveLength(4);
  });

  it("L5: no gesture entry is a family name that a note can never carry; every numbered family and key keys matches", () => {
    for (const fam of ["BASS_EL", "EKEYS", "GUITAR_AC", "GUITAR_EL", "KEYS_AC", "ORGAN_EL"]) expect(Object.keys(GESTURES), fam).not.toContain(fam);
    expect(gesturesOf("NS_KEYS_AC_004")).toBeDefined();
    expect(gesturesOf("NS_EKEYS_069")).toBeDefined();
    expect(gesturesOf("NS_GUITAR_AC_021")).toBeDefined();
    expect(gesturesOf("NS_GUITAR_EL_022")).toBeDefined();
    expect(gesturesOf("NS_ORGAN_EL_001")).toBeUndefined();
  });

  it("L6: a walking bass cuts the first note to one beat so that it does not overlap the walk", () => {
    const root = hz(0);
    const out = run([mk("UPRIGHTBASS", 2, { freq: root, d: 1.9 }), mk("UPRIGHTBASS", 3, { freq: root, d: 0.4 })], "bass", "jazz");
    expect(out[0].d).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(out[0].t + out[0].d).toBeLessThanOrEqual(out[1].t + 1e-9);
    // a short note stays as it is
    expect(run([mk("UPRIGHTBASS", 2, { freq: root, d: 0.3 })], "bass", "jazz")[0].d).toBe(0.3);
  });
});

describe("bowed portamento: the kemençe, the sarangi (and the violin in the Turkish cards) slide from the previous note", () => {
  // beat 0.5 s; d 0.2 s (0.4 beat) keeps the titreme away; notes start off the beat so that no mordent is added
  const pair = (name: string, a: number, b: number, gap = 0.1, card = "x", role = "hook"): PersonalNote[] =>
    run([mk(name, 0.13, { d: 0.2, freq: hz(a) }), mk(name, 0.13 + 0.2 + gap, { d: 0.2, freq: hz(b), key: "R0b" })], role, card).filter((n) => n.show !== false);
  it("a rising step starts below at the previous pitch (positive glide), a falling one above (negative glide)", () => {
    for (const name of ["KEMENCE_MAKAM", "KEMENCE_REAL", "SARANGI"]) {
      expect(pair(name, 12, 14)[1].glide, name).toBeCloseTo(2, 9);
      expect(pair(name, 14, 12)[1].glide, name).toBeCloseTo(-2, 9);
      expect(pair(name, 12, 13)[1].glide, name).toBeCloseTo(1, 9);
    }
  });
  it("the slide is at most 3 semitones either way", () => {
    expect(pair("KEMENCE_MAKAM", 12, 19)[1].glide).toBe(3);
    expect(pair("KEMENCE_MAKAM", 19, 12)[1].glide).toBe(-3);
  });
  it("the drawn note is a patched copy: the source is not changed", () => {
    const b = mk("KEMENCE_MAKAM", 0.43, { d: 0.2, freq: hz(14), key: "R0b" });
    const out = run([mk("KEMENCE_MAKAM", 0.13, { d: 0.2 }), b]);
    expect(out).not.toContain(b);
    expect(b.glide).toBeUndefined();
  });
  it("a gap of 0.35 s or less slides; after a longer rest (and on the first note) the old scoop of 1", () => {
    expect(pair("KEMENCE_MAKAM", 12, 15, 0.35)[1].glide).toBe(3);
    expect(pair("KEMENCE_MAKAM", 12, 15, 0.4)[1].glide).toBe(1);
    expect(pair("KEMENCE_MAKAM", 12, 15)[0].glide).toBe(1);
    expect(pair("SARANGI", 12, 15, 0.5)[1].glide).toBe(1);
  });
  it("a repeated pitch glides 1 on about a third of the notes", () => {
    const notes = Array.from({ length: 300 }, (_, k) => mk("KEMENCE_MAKAM", 0.13 + k * 0.3, { key: `K${k}`, d: 0.2 }));
    const out = run(notes).filter((n) => n.show !== false).slice(1);
    const g = out.filter((n) => n.glide === 1).length;
    expect(out.every((n) => n.glide === undefined || n.glide === 1)).toBe(true);
    expect(g / out.length).toBeGreaterThan(0.2);
    expect(g / out.length).toBeLessThan(0.45);
  });
  it("only the hook role and notes of 0.15 s or more", () => {
    expect(pair("KEMENCE_MAKAM", 12, 14, 0.1, "x", "pluck")[1].glide).toBeUndefined();
    const short = run([mk("KEMENCE_MAKAM", 0.13, { d: 0.1 }), mk("KEMENCE_MAKAM", 0.25, { d: 0.1, freq: hz(14) })]);
    expect(short.some((n) => n.glide !== undefined)).toBe(false);
  });
  it("the violin slides only in the Turkish cards; elsewhere it keeps its bow (a scoop after a gap)", () => {
    for (const card of ["karadeniz", "anatolian", "icanadolu", "dogu", "zeybek", "mevlevi"]) expect(pair("VIOLIN", 12, 14, 0.1, card)[1].glide, card).toBeCloseTo(2, 9);
    expect(pair("VIOLIN", 12, 14, 0.1, "pop")[1].glide).toBeUndefined();
    expect(pair("VIOLIN", 12, 14, 0.1, "romantic")[1].glide).toBeUndefined();
  });
  it("other instruments are untouched by the slide", () => {
    for (const name of ["SAZ", "NEY_MAKAM", "CELLO", "KANUN"]) {
      const g = pair(name, 12, 14)[1].glide;
      expect(g === undefined || g === 1, name).toBe(true);
    }
  });
});

describe("titreme: the kemençe trills on its long notes", () => {
  const trill = (out: PersonalNote[], src: PersonalNote): PersonalNote[] =>
    hidden(out).filter((n) => n.t >= src.t + src.d / 2 - 1e-9 && n.short === true && n.route === src.route);
  it("alternates a tone above and the note every 1/8 beat over the second half: hidden, short, vel x0.6, at most 6", () => {
    for (const name of ["KEMENCE_MAKAM", "KEMENCE_REAL"]) {
      const src = mk(name, 0, { d: 1 });
      const h = trill(run([src]), src);
      expect(h, name).toHaveLength(6);
      h.forEach((n, k) => {
        expect(n.t).toBeCloseTo(0.5 + k * 0.0625, 9);
        expect(n.d).toBeCloseTo(0.0625, 9);
        expect(st(n.freq, hz(12))).toBeCloseTo(k % 2 === 0 ? 2 : 0, 6);
        expect(n.vel).toBeCloseTo(0.36, 9);
        expect(n.show).toBe(false);
      });
    }
  });
  it("fits the second half of a shorter note (0.6 beat: 0.15 s, two hits)", () => {
    const src = mk("KEMENCE_MAKAM", 0.13, { d: 0.3 });
    expect(trill(run([src]), src)).toHaveLength(2);
  });
  it("never runs past the next note of the route (it stops 50 ms before it)", () => {
    const src = mk("KEMENCE_MAKAM", 0, { d: 1 });
    const next = mk("KEMENCE_MAKAM", 0.7, { d: 0.2, key: "R0n", freq: hz(14) });
    const h = trill(run([src, next]), src).filter((n) => n.t < 0.7);
    expect(h).toHaveLength(2);
    for (const n of h) expect(n.t + n.d).toBeLessThanOrEqual(0.65 + 1e-9);
  });
  it("no trill under 0.6 beat, nor on the sarangi, nor in the pluck role", () => {
    const a = mk("KEMENCE_MAKAM", 0.13, { d: 0.28 });
    expect(trill(run([a]), a)).toHaveLength(0);
    const b = mk("SARANGI", 0, { d: 1 });
    expect(trill(run([b]), b)).toHaveLength(0);
    const c = mk("KEMENCE_MAKAM", 0, { d: 1 });
    expect(trill(run([c], "pluck"), c)).toHaveLength(0);
  });
});

describe("mordent: one quick tone above and back on a third of the short kemençe notes that start on a beat", () => {
  const mordents = (out: PersonalNote[], src: PersonalNote): PersonalNote[] =>
    hidden(out).filter((n) => Math.abs(n.t - (src.t + 0.04)) < 1e-9 && Math.abs(st(n.freq, src.freq) - 2) < 1e-6);
  it("on a beat, 0.3 to 0.6 beat long: a hidden 40 ms note +2 st, 40 ms in, on about a third", () => {
    let hit = 0;
    for (let k = 0; k < 300; k++) {
      const src = mk("KEMENCE_MAKAM", k * 0.5, { key: `K${k}`, d: 0.18 });
      const m = mordents(run([src]), src);
      expect(m.length).toBeLessThanOrEqual(1);
      if (m.length) {
        hit++;
        expect(m[0].d).toBeCloseTo(0.04, 9);
        expect(m[0].short).toBe(true);
        expect(m[0].vel).toBeCloseTo(0.36, 9);
      }
    }
    expect(hit / 300).toBeGreaterThan(0.2);
    expect(hit / 300).toBeLessThan(0.45);
  });
  it("never off the beat, never on a longer or shorter note, never on the sarangi", () => {
    for (let k = 0; k < 120; k++) {
      const off = mk("KEMENCE_MAKAM", k * 0.5 + 0.13, { key: `K${k}`, d: 0.18 });
      expect(mordents(run([off]), off), `off ${k}`).toHaveLength(0);
      const short = mk("KEMENCE_MAKAM", k * 0.5, { key: `K${k}`, d: 0.12 });
      expect(mordents(run([short]), short)).toHaveLength(0);
      const sar = mk("SARANGI", k * 0.5, { key: `K${k}`, d: 0.18 });
      expect(mordents(run([sar]), sar)).toHaveLength(0);
    }
  });
});
