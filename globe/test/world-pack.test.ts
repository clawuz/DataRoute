import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WORLD_FAMILIES, WORLD_INSTRUMENTS, WORLD_RANGE, WORLD_STAND_IN } from "../src/audio/world-pack";

const pub = (p: string): string => fileURLToPath(new URL(`../public/samples/${p}`, import.meta.url));
const world = JSON.parse(readFileSync(pub("world/manifest.json"), "utf8")) as {
  instruments: Record<string, { zones: { root: number; lo: number; hi: number; file: string; loop?: [number, number] }[]; unpitched?: boolean; sustained?: boolean }>;
};
const ledger = JSON.parse(readFileSync(fileURLToPath(new URL("../../docs/music-pack-world-ledger.json", import.meta.url)), "utf8")) as { instrument: string; file: string; licence: string; licence_url: string; nc?: boolean }[];
const lite = JSON.parse(readFileSync(pub("lite/manifest.json"), "utf8")) as { instruments: Record<string, unknown> };

describe("world pack", () => {
  it("lists exactly the instruments of its manifest", () => {
    expect([...WORLD_INSTRUMENTS].sort()).toEqual(Object.keys(world.instruments).sort());
    expect(WORLD_INSTRUMENTS.length).toBeGreaterThanOrEqual(60);
  });
  it("has every file of every zone", () => {
    for (const [name, inst] of Object.entries(world.instruments)) {
      expect(inst.zones.length, name).toBeGreaterThan(0);
      for (const z of inst.zones) expect(existsSync(pub(`world/${z.file}`)), `${name}: ${z.file}`).toBe(true);
    }
  });
  it("does not shadow the lite pack or the synthesised ORGAN", () => {
    for (const name of WORLD_INSTRUMENTS) expect(name in lite.instruments, name).toBe(false);
    expect((WORLD_INSTRUMENTS as readonly string[]).includes("ORGAN")).toBe(false);
    expect((WORLD_INSTRUMENTS as readonly string[]).includes("RENORGAN")).toBe(true);
  });
  it("gives every instrument a stand-in and every pitched one a range around its zones", () => {
    for (const name of WORLD_INSTRUMENTS) {
      expect(WORLD_STAND_IN[name], name).toBeTruthy();
      const inst = world.instruments[name];
      if (inst.unpitched) {
        expect(WORLD_RANGE[name], name).toBeUndefined();
        continue;
      }
      const [floor, cap] = WORLD_RANGE[name]!;
      expect(floor).toBeLessThan(cap);
      const lo = 440 * 2 ** ((Math.min(...inst.zones.map((z) => z.root)) - 69) / 12);
      const hi = 440 * 2 ** ((Math.max(...inst.zones.map((z) => z.root)) - 69) / 12);
      expect(floor).toBeLessThan(lo);
      expect(cap).toBeGreaterThan(hi);
    }
  });
  it("has the real recordings of bansuri, sarangi, zurna, ney and kemençe as held voices, each zone credited (the NC ones flagged)", () => {
    const real = ["BANSURI", "SARANGI", "ZURNA", "NEY_REAL", "KEMENCE_REAL"] as const;
    for (const name of real) {
      const inst = world.instruments[name];
      expect(inst, name).toBeTruthy();
      expect(inst.zones.length, name).toBeGreaterThanOrEqual(1);
      expect(inst.sustained, name).toBe(true);
      expect(WORLD_INSTRUMENTS, name).toContain(name);
      for (const z of inst.zones) {
        expect(z.lo, `${name} ${z.file}`).toBeLessThanOrEqual(z.hi);
        if (z.loop) expect(z.loop[1] - z.loop[0], `${name} ${z.file}`).toBeGreaterThanOrEqual(0.4);
        const rows = ledger.filter((r) => r.file === z.file);
        expect(rows.length, `${name} ${z.file}`).toBe(1);
        expect(rows[0].instrument).toBe(name);
        expect(Boolean(rows[0].nc), z.file).toBe(rows[0].licence_url.includes("/by-nc/"));
      }
    }
    // the ney and the kemençe recordings are non-commercial; the makam slices stay
    for (const name of ["NEY_REAL", "KEMENCE_REAL"]) expect(ledger.filter((r) => r.instrument === name).every((r) => r.nc === true), name).toBe(true);
    expect(world.instruments.NEY_MAKAM.zones.length).toBeGreaterThan(5);
    expect(world.instruments.KEMENCE_MAKAM.zones.length).toBeGreaterThan(5);
    // the sitar files are strums of the sympathetic strings and a sound effect: no zone, so no instrument
    expect((WORLD_INSTRUMENTS as readonly string[]).includes("SITAR")).toBe(false);
    expect(WORLD_STAND_IN.ZURNA).toBe("OBOE");
    expect(WORLD_STAND_IN.SARANGI).toBe("VIOLIN");
    expect(WORLD_STAND_IN.BANSURI).toBe("FLUTE");
  });
  it("flags every non-commercial file of the ledger with nc: true, and nothing else", () => {
    for (const r of ledger) expect(Boolean(r.nc), `${r.instrument} ${r.file}`).toBe(r.licence === "CC BY-NC" || r.licence_url.includes("/by-nc/"));
  });
  it("groups the NSynth variants into families of real instruments", () => {
    expect(Object.keys(WORLD_FAMILIES).sort()).toEqual(["BASS_EL", "EKEYS", "GUITAR_AC", "GUITAR_EL", "KEYS_AC", "ORGAN_EL"]);
    for (const [fam, list] of Object.entries(WORLD_FAMILIES)) {
      expect(list.length, fam).toBeGreaterThan(0);
      for (const n of list) expect(WORLD_INSTRUMENTS).toContain(n);
    }
  });
});

import { baseOf } from "../src/audio/theory";

describe("baseOf", () => {
  it("maps a world instrument to its synthesised stand-in and leaves the others alone", () => {
    expect(baseOf("SANTUR")).toBe("KANUN");
    expect(baseOf("STEINWAY")).toBe("PNO");
    expect(baseOf("RENORGAN")).toBe("ORGAN");
    expect(baseOf("OUD")).toBe("MEA"); // lite stand-ins keep working
    expect(baseOf("CELLO")).toBe("CELLO");
    expect(baseOf("ZURNA")).toBe("CLA"); // the zurna stands in for the oboe, whose own stand-in is the synthesised reed
    expect(baseOf("NEY_REAL")).toBe("FLUTE");
  });
});
