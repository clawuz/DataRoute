import { describe, expect, it } from "vitest";
import type { PersonalNote } from "../src/personal/compose";
import { applyGestures, type GestureContext } from "../src/personal/gestures";

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
  it("down on beats 0 and 2, up on 1 and 3", () => {
    const down = one(0, "pop").slice(1).map((n) => n.t - 0);
    expect(down[0]).toBeLessThan(down[1]);
    const up = one(0.5, "pop").slice(1).map((n) => n.t - 0.5);
    expect(up[0]).toBeGreaterThan(up[1]);
    const down2 = one(1, "pop").slice(1);
    expect(down2[0].t).toBeLessThan(down2[1].t);
    const up3 = one(1.5, "pop").slice(1);
    expect(up3[0].t).toBeGreaterThan(up3[1].t);
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

describe("SAZ widened", () => {
  it("strums every pluck-role note on a beat whatever its velocity", () => {
    expect(hidden(run([mk("SAZ", 1, { vel: 0.3 })], "pluck"))).toHaveLength(2);
    expect(hidden(run([mk("BAGLAMA_MAKAM", 1.5, { vel: 0.3 })], "pluck"))).toHaveLength(2);
    expect(hidden(run([mk("BAGLAMA_EXTRA", 1.2, { vel: 0.3 })], "pluck"))).toHaveLength(0);
  });
  it("a hook note still needs vel >= 0.5", () => {
    expect(hidden(run([mk("SAZ", 1, { vel: 0.4 })], "hook"))).toHaveLength(0);
    expect(hidden(run([mk("SAZ", 1, { vel: 0.5 })], "hook"))).toHaveLength(2);
  });
});

describe("KANUN / SANTUR widened", () => {
  it("pluck role: a roll of two hidden notes (+12 st at 35 ms, +19 st at 70 ms, vel x0.4) on a beat", () => {
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
    for (const name of ["PNO", "STEINWAY", "KAWAI", "KNIGHTPNO", "UPRIGHTPNO", "EKEYS", "RHODES", "KEYS_AC", "NS_EKEYS_098"]) {
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
  it("strum in the pluck role like the nylon guitar, for the exact names and the numbered families", () => {
    for (const name of ["GUITAR_AC", "GUITAR_EL", "NS_GUITAR_AC_015", "NS_GUITAR_EL_028"]) {
      const out = run([mk(name, 0, { freq: hz(14) })], "pluck", "pop");
      expect(out, name).toHaveLength(3);
      expect(out[1].t).toBeCloseTo(0.025, 9);
    }
  });
  it("country: boom-chick: bass (root - 12, vel x0.5) on beats 0 and 2 without a strum, the strum on beats 1 and 3", () => {
    const at = (t: number) => run([mk("GUITAR_AC", t, { freq: hz(14) })], "pluck", "country");
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
    expect(out[0]).toBe(src);
  });
});
