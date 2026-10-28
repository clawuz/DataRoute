import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARDS } from "../src/personal/genres";
import { IDIOMS } from "../src/personal/idiom";
import { DRONE_BY_CARD } from "../src/personal/world-voices";
import { WORLD_FAMILIES, WORLD_INSTRUMENTS } from "../src/audio/world-pack";

const NEW_ELEVEN = ["karadeniz", "icanadolu", "akdeniz", "dogu", "zeybek", "greek", "italian", "classical", "rnb", "country", "spguitar"];
const NEW_THIRTEEN = ["samba", "afrobeat", "bollywood", "khaleeji", "maghrebi", "russian", "thai", "chinese", "cumbia", "andean", "caucasus", "fado", "chanson"];
const NEW = [...NEW_ELEVEN, ...NEW_THIRTEEN];

// the synthesised and orchestra voices of theory.ts's `Instrument` that a card may name
const BASE = new Set([
  "PNO", "NEY", "CLA", "SAX", "TPT", "SAZ", "KANUN", "MARIMBA", "CELLO", "VIOLIN", "FLUTE", "HARP", "GUITAR", "CONGA", "TIMP", "DARBUKA", "VIOLA", "OBOE", "BSN",
  "HORN", "GLOCK", "XYLO", "TRI", "TAMB", "GONG", "OUD", "VIOLIN_PIZZ", "VIOLA_PIZZ",
]);
const isVoice = (v: string): boolean => v in WORLD_FAMILIES || (WORLD_INSTRUMENTS as readonly string[]).includes(v) || BASE.has(v);
const docs = readFileSync(new URL("../../docs/music-genre-cards.md", import.meta.url), "utf8");

describe("the destination cards (11 + 13)", () => {
  it("brings the number of cards to 52 (27 + 11 + 13 + the Mevlevi card for Konya)", () => {
    expect(CARDS.length).toBe(52);
  });
  for (const id of NEW) {
    describe(id, () => {
      const c = CARDS.find((x) => x.id === id)!;
      it("exists with a valid scale and tempo", () => {
        expect(c).toBeTruthy();
        expect([5, 7]).toContain(c.scale.length);
        expect(c.scale[0]).toBe(0);
        expect(c.scale[c.scale.length - 1]).toBeLessThan(12);
        for (let i = 1; i < c.scale.length; i++) expect(c.scale[i]).toBeGreaterThan(c.scale[i - 1]);
        if (c.scaleWish) {
          expect([5, 7]).toContain(c.scaleWish.length);
          for (let i = 1; i < c.scaleWish.length; i++) expect(c.scaleWish[i]).toBeGreaterThan(c.scaleWish[i - 1]);
        }
        expect(c.bpm[0]).toBeGreaterThanOrEqual(76);
        expect(c.bpm[1]).toBeLessThanOrEqual(126);
        expect(c.bpm[0]).toBeLessThanOrEqual(c.bpm[1]);
      });
      it("has a figure that hits, matching accents and voices", () => {
        expect(c.cell.some((x) => x > 0)).toBe(true);
        expect(c.cell.reduce((a, x) => a + Math.abs(x), 0)).toBeGreaterThanOrEqual(2);
        if (c.accent) expect(c.accent.length).toBe(c.cell.length);
        expect(c.held.length).toBeGreaterThan(0);
        expect(c.melody.length).toBeGreaterThan(0);
        expect(c.pluck.length).toBeGreaterThan(0);
        for (const v of [...c.held, ...c.melody, ...c.pluck, ...(c.bass ?? []), c.perc]) expect(isVoice(v), `${id}: ${v}`).toBe(true);
      });
      it("has an idiom and is in the docs", () => {
        expect(IDIOMS[id]).toBeTruthy();
        expect(docs, `${id}: a table row "| ${id} |"`).toContain(`| ${id} |`);
      });
    });
  }
  it("gives the Black Sea card the bagpipe drone", () => {
    expect(DRONE_BY_CARD.karadeniz).toBe("BAGPIPE_DRONE");
  });
  it("gives the Black Sea card the Black Sea kemençe and the tulum (Turkish Music Portal recordings), the bagpipe behind them", () => {
    const c = CARDS.find((x) => x.id === "karadeniz")!;
    expect(c.melody).toEqual(["KEMENCE_KARADENIZ", "TULUM", "BAGPIPE"]);
    expect(c.held).toEqual(["TULUM", "BAGPIPE_DRONE"]);
    expect(c.pluck).toEqual(["BAGLAMA_EXTRA", "SAZ"]);
    // the pear-shaped classical kemençe stays out of the Black Sea card
    expect([...c.melody, ...c.held, ...c.pluck]).not.toContain("KEMENCE_MAKAM");
    expect([...c.melody, ...c.held, ...c.pluck]).not.toContain("KEMENCE_REAL");
  });
  it("gives the Caucasus card the bagpipe drone", () => {
    expect(DRONE_BY_CARD.caucasus).toBe("BAGPIPE_DRONE");
  });
});
