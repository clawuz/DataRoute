import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { CARDS, CLUSTER_OF, NO_PIANO_CARDS, cardsOfAirport, planCards } from "../src/personal/genres";
import { IDIOMS } from "../src/personal/idiom";
import { buildRoutes } from "../src/personal/routes";
import { destinationOf } from "../src/personal/destinations";
import { WORLD_FAMILIES, WORLD_INSTRUMENTS } from "../src/audio/world-pack";

const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];
const docs = readFileSync(new URL("../../docs/music-genre-cards.md", import.meta.url), "utf8");

const TURKEY = ["ESB", "ASR", "KYA", "NAV", "AYT", "ADB", "VAN", "TZX", "ERZ", "DLM"];
const EAST = ["DEL", "BOM", "PEK", "PVG", "HKG", "DXB", "DOH", "RUH", "CAI", "CMN", "BKK", "SIN", "TLV", "LOS", "NBO"];
const known = (a: string[]) => a.filter((x) => destinationOf(x));

describe("no piano in folk and makam cards", () => {
  it("exports the set", () => {
    for (const id of ["anatolian", "mevlevi", "icanadolu", "persian", "hindustani", "eastafrica"]) expect(NO_PIANO_CARDS.has(id)).toBe(true);
    expect(NO_PIANO_CARDS.has("bollywood")).toBe(false);
    for (const id of NO_PIANO_CARDS) expect(CARDS.some((c) => c.id === id), id).toBe(true);
  });
  it("plays no piano in 100 seeded selections whose every route is of a listed card", () => {
    const r = lcg(271026);
    const pool = known([...TURKEY, ...EAST]);
    let checked = 0;
    for (let k = 0; checked < 100 && k < 2000; k++) {
      const n = 3 + Math.floor(r() * 6);
      const places = new Set<string>();
      while (places.size < n) places.add(pick(r, pool));
      const routes = buildRoutes([...places], pick(r, ["IST", "ESB", "DEL"]));
      if (!routes.length) continue;
      const plan = planCards("visited", routes);
      if (!plan.perRoute.every((c) => NO_PIANO_CARDS.has(c.id))) continue;
      checked++;
      const piece = composePiece("visited", routes);
      expect(piece.notes.filter((x) => x.instrument === "PNO").length, [...places].join(",")).toBe(0);
    }
    expect(checked).toBe(100);
  });
  it("lets the piano play only on routes of other cards in a mixed selection", () => {
    const r = lcg(5);
    let seen = false;
    for (let k = 0; k < 60; k++) {
      const places = ["JFK", "ESB", "KYA", "LHR", "AYT", "ADB", "DEL"].filter(() => r() < 0.85);
      const routes = buildRoutes(places, "IST");
      if (routes.length < 2) continue;
      const plan = planCards("visited", routes);
      const piece = composePiece("visited", routes);
      for (const n of piece.notes) {
        if (n.instrument === "PNO") {
          seen = true;
          expect(NO_PIANO_CARDS.has(plan.perRoute[n.route].id), `route ${n.route} ${plan.perRoute[n.route].id}`).toBe(false);
        }
      }
    }
    expect(seen).toBe(true);
  });
});

describe("the Mevlevi card", () => {
  const c = CARDS.find((x) => x.id === "mevlevi")!;
  it("is valid", () => {
    expect(c).toBeTruthy();
    expect([5, 7]).toContain(c.scale.length);
    expect(c.bpm[0]).toBeGreaterThanOrEqual(76);
    expect(c.bpm[0]).toBeLessThanOrEqual(c.bpm[1]);
    expect(c.cell.some((x) => x > 0)).toBe(true);
    expect(c.accent!.length).toBe(c.cell.length);
    const base = new Set(["NEY", "CELLO", "KANUN", "SANTUR", "FRAMEDRUM"]);
    for (const v of [...c.held, ...c.melody, ...c.pluck, c.perc]) expect(v in WORLD_FAMILIES || (WORLD_INSTRUMENTS as readonly string[]).includes(v) || base.has(v), v).toBe(true);
    expect(IDIOMS.mevlevi).toBeTruthy();
    expect(docs).toContain("| mevlevi |");
    expect(CLUSTER_OF.mevlevi).toBe("turkish");
  });
  it("is the first card of Konya, then icanadolu", () => {
    expect(cardsOfAirport("KYA", "EUR").map((x) => x.id)).toEqual(["mevlevi", "icanadolu"]);
  });
  it("gives icanadolu the ney after the saz voices", () => {
    expect(CARDS.find((x) => x.id === "icanadolu")!.melody).toEqual(["SAZ", "BAGLAMA_MAKAM", "NEY_MAKAM"]);
  });
  it("plays a Konya route with the Mevlevi card on the ney (and no piano) alone or with another route", () => {
    for (const places of [["KYA", "ESB"], ["KYA", "ASR", "ESB"]]) {
      const piece = composePiece("visited", buildRoutes(places, "IST"));
      const used = new Set(piece.notes.map((n) => n.instrument as string));
      expect([...used].some((i) => i.startsWith("NEY")), places.join(",")).toBe(true);
      expect(used.has("PNO")).toBe(false);
    }
  });
  it("brings a ney to a Central Anatolian piece, and no piano", () => {
    // (the Konya route takes "icanadolu" or "mevlevi" by its hash; this selection is one where the ney is heard: NEY_MAKAM from the icanadolu list)
    const routes = buildRoutes(["ESB", "KYA", "NAV"], "IST");
    const piece = composePiece("visited", routes);
    const used = new Set(piece.notes.map((n) => n.instrument as string));
    expect([...used].some((i) => i.startsWith("NEY")), [...used].join(",")).toBe(true);
    expect(used.has("PNO")).toBe(false);
  });
});
