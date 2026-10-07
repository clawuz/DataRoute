import { describe, expect, it } from "vitest";
import { ART_STORAGE_KEY, effectsFor, initArt, persistArt, toggleArt } from "../src/app/art";

const none = () => null;

describe("initArt", () => {
  it("defaults: corridors on, aurora and sound off", () => {
    expect(initArt("", none)).toEqual({ enabled: true, corridors: true, aurora: false, sound: false });
  });
  it("?art=0 disables everything", () => {
    expect(initArt("?art=0", none)).toEqual({ enabled: false, corridors: false, aurora: false, sound: false });
  });
  it("stored preferences override the defaults; garbage is ignored", () => {
    const read = (k: string) => (k === ART_STORAGE_KEY ? JSON.stringify({ corridors: false, aurora: true, sound: true }) : null);
    expect(initArt("", read)).toEqual({ enabled: true, corridors: false, aurora: true, sound: true });
    expect(initArt("", () => "{nope")).toEqual({ enabled: true, corridors: true, aurora: false, sound: false });
    expect(initArt("", () => JSON.stringify({ corridors: "yes" }))).toEqual({ enabled: true, corridors: true, aurora: false, sound: false });
  });
  it("survives a throwing storage", () => {
    expect(() => initArt("", () => { throw new Error("blocked"); })).not.toThrow();
  });
});

describe("toggleArt / persistArt", () => {
  it("toggles one flag; disabled art ignores toggles", () => {
    const s = initArt("", none);
    expect(toggleArt(s, "aurora").aurora).toBe(true);
    expect(toggleArt(s, "corridors").corridors).toBe(false);
    const off = initArt("?art=0", none);
    expect(toggleArt(off, "sound")).toEqual(off);
  });
  it("persists only the three user flags and swallows storage errors", () => {
    const seen: [string, string][] = [];
    persistArt(initArt("", none), (k, v) => seen.push([k, v]));
    expect(seen).toEqual([[ART_STORAGE_KEY, JSON.stringify({ corridors: true, aurora: false, sound: false })]]);
    expect(() => persistArt(initArt("", none), () => { throw new Error("quota"); })).not.toThrow();
  });
});

describe("effectsFor", () => {
  const on = { enabled: true, corridors: true, aurora: true, sound: true };
  it("everything at quality 0", () => {
    expect(effectsFor(on, 0)).toEqual({ cloudShadow: true, glare: true, aurora: true, corridors: true, sound: true, starMap: true });
  });
  it("aurora goes first (level 1), then cloud shadows (level 2); others never gate", () => {
    expect(effectsFor(on, 1)).toMatchObject({ aurora: false, cloudShadow: true, glare: true });
    expect(effectsFor(on, 2)).toMatchObject({ aurora: false, cloudShadow: false, glare: true, corridors: true });
  });
  it("aurora needs both the toggle and a good quality level", () => {
    expect(effectsFor({ ...on, aurora: false }, 0).aurora).toBe(false);
  });
  it("art disabled → every effect off", () => {
    expect(Object.values(effectsFor(initArt("?art=0", none), 0)).every((v) => v === false)).toBe(true);
  });
});
