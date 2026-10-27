import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { droneVoice } from "../src/personal/world-voices";
import { CARDS, CLUSTER_OF, NO_PIANO_CARDS, cardsOfAirport, planCards } from "../src/personal/genres";
import { IDIOMS } from "../src/personal/idiom";
import { buildRoutes } from "../src/personal/routes";
import { DESTINATIONS, destinationOf } from "../src/personal/destinations";
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
    for (const id of ["flamenco", "spguitar", "tango", "samba", "cumbia", "salsa", "mariachi", "andean", "afrobeat", "fado", "russian", "slavic", "bollywood", "greek", "italian", "caucasus", "chanson"]) expect(NO_PIANO_CARDS.has(id), id).toBe(true);
    for (const id of ["romantic", "classical", "jazz", "bossa", "funk", "pop", "rnb", "cinematic", "epic", "dance", "calm", "nordic", "baroque", "celtic", "country"]) expect(NO_PIANO_CARDS.has(id), id).toBe(false);
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

describe("no piano in the world cards of the voices pass", () => {
  const NEW = ["flamenco", "spguitar", "tango", "samba", "cumbia", "salsa", "mariachi", "andean", "afrobeat", "fado", "russian", "slavic", "bollywood", "greek", "italian", "caucasus", "chanson"];
  const pool = DESTINATIONS.filter((d) => cardsOfAirport(d.iata, d.region).every((c) => NO_PIANO_CARDS.has(c.id)) && cardsOfAirport(d.iata, d.region).some((c) => NEW.includes(c.id))).map((d) => d.iata);
  it("has airports to draw from", () => expect(pool.length).toBeGreaterThan(20));
  it("lists no PNO in any voice list of the listed cards", () => {
    for (const c of CARDS.filter((x) => NEW.includes(x.id))) for (const v of [...c.held, ...c.melody, ...c.pluck, ...(c.bass ?? [])]) expect(v, c.id).not.toBe("PNO");
  });
  it("plays no piano in 100 seeded selections drawn from those airports", () => {
    const r = lcg(61027);
    let checked = 0;
    for (let k = 0; checked < 100 && k < 3000; k++) {
      const n = 1 + Math.floor(r() * 7);
      const places = new Set<string>();
      while (places.size < n) places.add(pick(r, pool));
      const routes = buildRoutes([...places], "IST");
      if (!routes.length) continue;
      const plan = planCards("visited", routes);
      if (!plan.perRoute.every((c) => NO_PIANO_CARDS.has(c.id))) continue;
      checked++;
      const piece = composePiece("visited", routes);
      expect(piece.notes.filter((x) => x.instrument === "PNO").length, [...places].join(",")).toBe(0);
    }
    expect(checked).toBe(100);
  });
});

describe("the voices pass", () => {
  const card = (id: string) => CARDS.find((c) => c.id === id)!;
  it("leads jazz with the tenor sax and the clarinet, the piano comping and the upright bass walking", () => {
    expect(card("jazz").melody.slice(0, 2)).toEqual(["TENORSAX", "CLA"]);
    expect(card("jazz").melody).not.toContain("PNO");
    expect(card("jazz").pluck).toContain("PNO");
    expect(card("jazz").bass).toEqual(["UPRIGHTBASS"]);
  });
  it("gives akdeniz the oud and the kanun", () => {
    expect(card("akdeniz").melody).toEqual(["KANUN", "OUD", "KEMENCE_REAL"]);
    expect(card("akdeniz").pluck).toEqual(["OUD", "SAZ"]);
  });
  it("gives the Italian card its strings", () => {
    expect(card("italian").held).toEqual(["CELLO", "VIOLA", "VIOLIN", "HORN"]);
    expect(card("italian").melody).toEqual(["VIOLIN", "FLUTE", "OBOE", "CLA"]);
    expect(card("italian").pluck).toEqual(["HARP", "VIOLA_PIZZ", "PSALTERY"]);
  });
  it("keeps Turkish and Arabic instruments out of the Hindustani card", () => {
    const c = card("hindustani");
    for (const v of [...c.held, ...c.melody, ...c.pluck]) expect(["NEY_MAKAM", "NEY", "KANUN", "TANPURA"], v).not.toContain(v);
    expect(c.perc).toBe("TABLA");
    expect(droneVoice("hindustani")).toBe("TANPURA");
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
    expect(cardsOfAirport("KYA", "EUR").map((x) => x.id)).toEqual(["mevlevi"]);
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
