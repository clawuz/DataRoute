import { describe, expect, it } from "vitest";
import { COUNTRY_COUNT, DESTINATIONS, NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, destinationOf, flagOf, AREAS, areaOf, countryName, hasPassengerService, isHub, labelOf } from "../src/personal/destinations";
import { pieceHash, searchFromSelection, selectionFromSearch } from "../src/personal/codec";
import { buildRoutes, stopovers } from "../src/personal/routes";
import { composePiece } from "../src/personal/compose";
import { buildPersonalModel } from "../src/personal/model";
import { pieceStats } from "../src/personal/stats";
import { buildArcBuffers, isBreak } from "../src/scene/arcs";

describe("destinations", () => {
  it("has unique IATA codes and valid coordinates", () => {
    const codes = DESTINATIONS.map((d) => d.iata);
    expect(new Set(codes).size).toBe(codes.length);
    for (const d of DESTINATIONS) {
      expect(d.iata).toMatch(/^[A-Z]{3}$/);
      expect(d.iso).toMatch(/^[A-Z]{2}$/);
      expect(Math.abs(d.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(d.lon)).toBeLessThanOrEqual(180);
    }
  });
  it("covers the Turkish Airlines network", () => {
    expect(DESTINATIONS.length).toBeGreaterThanOrEqual(340);
    expect(COUNTRY_COUNT).toBeGreaterThanOrEqual(133);
    for (const c of ["IST", "LHR", "JFK", "DPS", "CGK", "NRT", "GRU", "JNB", "SYD"]) expect(destinationOf(c), c).toBeDefined();
    expect(destinationOf("DPS")?.iso).toBe("ID");
    expect(destinationOf("LHR")?.iso).toBe("GB");
  });
  it("states the official network size", () => {
    expect(NETWORK_DESTINATIONS).toBe(355);
    expect(NETWORK_COUNTRIES).toBe(133);
    expect(COUNTRY_COUNT).toBe(NETWORK_COUNTRIES);
    expect(NETWORK_CLAIM).toMatch(/more countries than any other/);
  });
  it("marks what has no passenger service today", () => {
    const by = (c: string) => destinationOf(c)!;
    expect(hasPassengerService(by("LHR"))).toBe(true);
    expect(by("IKA").status).toBe("suspended");
    expect(hasPassengerService(by("IKA"))).toBe(false);
    expect(by("MFM").status).toBe("cargo");
  });
  it("groups countries into the six areas", () => {
    expect(areaOf("TR")).toBe("TR");
    expect(areaOf("DE")).toBe("EU");
    expect(areaOf("RU")).toBe("EU");
    expect(areaOf("US")).toBe("AM");
    expect(areaOf("EG")).toBe("AF");
    expect(areaOf("JP")).toBe("AS");
    expect(areaOf("AE")).toBe("AS");
    expect(areaOf("AU")).toBe("OC");
    expect(new Set(DESTINATIONS.map((d) => areaOf(d.iso))).size).toBe(6);
  });
  it("always writes Türkiye, never Turkey", () => {
    expect(countryName("TR")).toBe("Türkiye");
    expect(AREAS[0].label).toBe("Türkiye");
    expect(AREAS[0].upper).toBe("TÜRKİYE");
  });
  it("knows the hub and labels twin airports", () => {
    expect(isHub("IST")).toBe(true);
    expect(isHub("LHR")).toBe(false);
    expect(labelOf(destinationOf("LHR")!)).toBe("London · LHR");
    expect(flagOf("TR")).toBe("🇹🇷");
  });
});

describe("routes — a journey of places, Istanbul only where TK needs it", () => {
  const keys = (places: string[], home?: string) => buildRoutes(places, home).map((x) => x.key);
  it("a journey chains neighbouring places and changes at Istanbul when there is no direct flight", () => {
    expect(keys(["JFK", "NRT"])).toEqual(["JFK-IST", "IST-NRT"]);
    expect(keys(["LHR", "DPS"])).toEqual(["LHR-IST", "IST-DPS"]);
  });
  it("a place that is the hub needs no stopover", () => {
    expect(keys(["JFK", "IST"])).toEqual(["JFK-IST"]);
    expect(keys(["IST", "DPS", "JFK"])).toEqual(["IST-DPS", "DPS-IST", "IST-JFK"]);
  });
  it("uses a real non-hub flight when TK flies one", () => {
    expect(keys(["ESB", "VIE"])).toEqual(["ESB-VIE"]);
    expect(keys(["VIE", "ESB"])).toEqual(["VIE-ESB"]);
    expect(keys(["MEL", "SIN"])).toEqual(["MEL-SIN"]);
  });
  it("a home makes every place a separate trip from it and shares the first leg", () => {
    expect(keys(["DPS", "JFK", "NRT"], "LHR")).toEqual(["LHR-IST", "IST-DPS", "IST-JFK", "IST-NRT"]);
    expect(keys(["DPS", "JFK"], "IST")).toEqual(["IST-DPS", "IST-JFK"]);
  });
  it("skips repeated places and unknown codes", () => {
    expect(keys(["LHR", "LHR"])).toEqual([]);
    expect(keys(["LHR", "ZZZ"])).toEqual([]);
  });
  it("counts stopovers", () => {
    expect(stopovers(["LHR", "DPS"])).toBe(1);
    expect(stopovers(["JFK", "IST"])).toBe(0);
    expect(stopovers(["DPS", "JFK", "NRT"], "LHR")).toBe(3);
  });
  it("great-circle distances are plausible", () => {
    const [a, b] = buildRoutes(["LHR", "DPS"]);
    expect(a.distKm).toBeGreaterThan(2400);
    expect(a.distKm).toBeLessThan(3000);
    expect(b.distKm).toBeGreaterThan(9500);
    expect(b.distKm).toBeLessThan(10500);
  });
  it("colours a leg by the far end from the hub", () => {
    const [a, b] = buildRoutes(["LHR", "DPS"]);
    expect(a.region).toBe("EUR");
    expect(b.region).toBe("ASI");
  });
});

describe("codec", () => {
  it("round-trips a journey and a home fan", () => {
    const j = { mode: "visited" as const, places: ["JFK", "NRT", "DPS"] };
    expect(searchFromSelection(j)).toBe("?v=JFK,NRT,DPS");
    expect(selectionFromSearch("?v=JFK,NRT,DPS")).toEqual(j);
    const h = { mode: "wish" as const, places: ["DPS", "NRT"], home: "LHR" };
    expect(searchFromSelection(h)).toBe("?w=DPS,NRT&h=LHR");
    expect(selectionFromSearch("?w=DPS,NRT&h=LHR")).toEqual(h);
    expect(pieceHash(h)).toMatch(/^w-LHR-/);
  });
  it("keeps old links meaning what they meant (a fan from the origin, IST by default)", () => {
    expect(selectionFromSearch("?v=JFK")).toEqual({ mode: "visited", places: ["JFK"], home: "IST" });
    expect(selectionFromSearch("?o=LHR&v=DPS,JFK")).toEqual({ mode: "visited", places: ["DPS", "JFK"], home: "LHR" });
  });
  it("rejects garbage and unknown codes", () => {
    expect(selectionFromSearch("?v=!!")).toBeNull();
    expect(selectionFromSearch("?v=ZZZ,QQQ")).toBeNull();
    expect(selectionFromSearch("?v=JFK,JFK")?.home).toBe("IST"); // one place = an old-style link
    expect(selectionFromSearch("")).toBeNull();
    expect(selectionFromSearch("?v=jfk,JFK,nrt")?.places).toEqual(["JFK", "NRT"]);
  });
});

describe("compose", () => {
  it("is a full-length piece: about two and a half to three minutes", () => {
    const all = ["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK", "CPT", "MEX", "DXB", "LHR", "FRA", "CDG", "MAD", "FCO", "ATH", "VIE", "WAW", "PRG", "BUD", "OTP", "SOF", "BEG", "ZAG"];
    for (const mode of ["visited", "wish"] as const) {
      for (const n of [1, 5, 25]) {
        const p = composePiece(mode, buildRoutes(all.slice(0, n), "IST"));
        expect(p.duration, `${mode} ${n}`).toBeGreaterThan(140);
        expect(p.duration, `${mode} ${n}`).toBeLessThan(200);
        expect(p.hook).toBeGreaterThan(40);
        expect(p.hook).toBeLessThan(p.duration - 30);
      }
    }
  });
  it("is made only of the routes: every route is heard, every note belongs to one", () => {
    const routes = buildRoutes(["DPS", "JFK", "NRT", "GRU", "CAI"], "LHR");
    const p = composePiece("visited", routes);
    const heard = new Set(p.notes.map((n) => n.route));
    expect(heard.size).toBe(routes.length);
    for (const n of p.notes) {
      expect(n.route).toBeGreaterThanOrEqual(0);
      expect(n.route).toBeLessThan(routes.length);
      expect(n.key).toBe(routes[n.route].key);
    }
  });
  it("grows with the number of routes: one voice per route, nothing added", () => {
    const few = composePiece("visited", buildRoutes(["DPS"], "IST"));
    const many = composePiece("visited", buildRoutes(["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX"], "IST"));
    expect(new Set(few.notes.map((n) => n.route)).size).toBe(1);
    expect(new Set(many.notes.map((n) => n.route)).size).toBe(7);
    expect(many.notes.length).toBeGreaterThan(few.notes.length * 3);
  });
  it("is deterministic and keeps every note inside the duration", () => {
    const routes = buildRoutes(["LHR", "DPS", "JFK", "NRT", "GRU", "CAI"]);
    const a = composePiece("visited", routes);
    expect(a).toEqual(composePiece("visited", routes));
    expect(a.notes.length).toBeGreaterThanOrEqual(routes.length);
    for (const n of a.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect(n.t + n.d).toBeLessThanOrEqual(a.duration);
      expect(n.freq).toBeGreaterThan(20);
    }
  });
  it("moods differ and an empty piece is empty", () => {
    const routes = buildRoutes(["DPS", "JFK"], "IST");
    expect(composePiece("wish", routes)).not.toEqual(composePiece("visited", routes));
    expect(composePiece("wish", []).notes).toEqual([]);
    expect(composePiece("wish", []).duration).toBe(0);
  });
});

describe("personal model and stats", () => {
  it("builds planned arcs keyed by IATA", () => {
    const routes = buildRoutes(["LHR", "DPS", "JFK"]);
    const m = buildPersonalModel(routes);
    expect(m.flights).toHaveLength(4);
    expect(m.airports.IST).toBeDefined();
    expect(m.traffic.get("IST")).toBeGreaterThanOrEqual(2);
    expect(buildArcBuffers(m, { planned: true })).toBeTruthy();
    // no flown track may be split by the coverage-gap rule, however long the route
    const longRoute = buildPersonalModel(buildRoutes(["GRU", "SYD", "LAX"], "IST"));
    for (const f of longRoute.flights) for (let i = 0; i + 1 < f.t.length; i++) expect(isBreak(f, i)).toBe(false);
  });
  it("summarises the piece", () => {
    const routes = buildRoutes(["LHR", "DPS", "JFK"]);
    const s = pieceStats("visited", ["DPS", "JFK"], "LHR", routes);
    expect(s.destinations).toBe(2);
    expect(s.countries).toBe(2);
    expect(s.km).toBeGreaterThan(20000);
  });
});

import { routePalette, hslToRgb } from "../src/personal/colors";
describe("route colours", () => {
  it("gives every route its own colour, the same each time, and the globe and the list agree", () => {
    const routes = buildRoutes(["GZP", "DNZ", "DIY", "EDO", "EZS", "ISE", "ASR", "NAV", "OGU", "RZV", "KYA", "IST", "ERC", "BJV", "BAL", "KCM"], "WAW");
    const a = routePalette(routes);
    const b = routePalette(routes);
    expect(a.css.size).toBe(routes.length);
    expect(new Set(a.css.values()).size).toBe(routes.length);
    expect(a).toEqual(b);
    expect(a.rgb).toHaveLength(routes.length);
    const m = buildPersonalModel(routes);
    m.flights.forEach((f, i) => expect(f.colorIdx).toBe(7 + i));
  });
  it("converts hsl to rgb", () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5);
    expect([Math.round(r), Math.round(g), Math.round(b)]).toEqual([1, 0, 0]);
  });
});

describe("arrangement: pieces differ in feel, not only in pitches", () => {
  const sets = [
    ["DPS", "JFK"], ["NRT", "GRU", "CAI"], ["LHR", "CDG", "FRA", "MAD"], ["SYD", "LAX"], ["DXB", "BKK", "SIN", "KUL"],
    ["JNB", "NBO"], ["MEX", "YYZ", "BOS"], ["ICN", "HKG"], ["ATH", "FCO", "VIE"], ["CPT", "ADD", "LOS"], ["SCL", "EZE"], ["DEL", "BOM", "CMB"],
  ];
  it("chooses its arrangement from the selection, the same way every time", () => {
    const r = buildRoutes(["DPS", "JFK", "NRT"], "LHR");
    expect(composePiece("visited", r).style).toEqual(composePiece("visited", r).style);
  });
  it("spreads people over rhythm families, tempos, keys and orchestrations", () => {
    const pieces = sets.flatMap((s) => (["visited", "wish"] as const).map((m) => composePiece(m, buildRoutes(s, "IST"))));
    const distinct = (f: (p: (typeof pieces)[number]) => number) => new Set(pieces.map(f)).size;
    expect(distinct((p) => p.style.groove)).toBeGreaterThanOrEqual(4);
    expect(distinct((p) => p.style.ensemble)).toBeGreaterThanOrEqual(3);
    expect(distinct((p) => p.style.perc)).toBeGreaterThanOrEqual(2);
    expect(distinct((p) => p.bpm)).toBeGreaterThanOrEqual(8);
    expect(distinct((p) => p.style.shift)).toBeGreaterThanOrEqual(3);
    for (const p of pieces) {
      expect(p.duration).toBeGreaterThan(140);
      expect(p.duration).toBeLessThan(200);
    }
  });
  it("two different selections do not share an onset pattern", () => {
    const sig = (s: string[]) => {
      const p = composePiece("visited", buildRoutes(s, "IST"));
      const bar = (60 / p.bpm) * 4;
      return p.notes.filter((n) => n.route >= 0 && n.t < 8 * bar * 4).map((n) => Math.round(((n.t % bar) / bar) * 48)).sort((a, b) => a - b).join(",");
    };
    const sigs = new Set(sets.map(sig));
    expect(sigs.size).toBeGreaterThanOrEqual(5);
  });
  it("only uses instruments the engine can play (a recording or a stand-in)", () => {
    const p = composePiece("wish", buildRoutes(["DPS", "JFK", "NRT", "GRU", "CAI"], "LHR"));
    for (const n of p.notes) expect(n.instrument.length).toBeGreaterThan(1);
  });

});

describe("arrangement: nothing is written too high", () => {
  const p = composePiece("wish", buildRoutes(["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX"], "LHR"));
  it("keeps pitched instruments under their ceiling", () => {
    const cap: Record<string, number> = { PICC: 1568, GLOCK: 1568, XYLO: 1319, FLUTE: 1400, HARP: 1568, VIOLIN: 1320 };
    for (const n of p.notes) if (cap[n.instrument]) expect(n.freq, n.instrument).toBeLessThanOrEqual(cap[n.instrument] + 0.01);
  });
});

describe("the pitch follows the flight: climb, cruise, descent", () => {
  const routes = buildRoutes(["DPS", "JFK", "NRT"], "IST");
  const p = composePiece("visited", routes);
  it("gives each note the altitude of its moment of the flight", () => {
    for (const n of p.notes) {
      expect(n.alt).toBeGreaterThanOrEqual(0);
      expect(n.alt).toBeLessThanOrEqual(39000);
    }
    const mine = p.notes.filter((n) => n.route === 0);
    expect(Math.max(...mine.map((n) => n.alt))).toBeGreaterThan(30000);
    expect(Math.min(...mine.map((n) => n.alt))).toBeLessThan(15000);
  });
  it("is high at cruise and low near the ground for a melody voice", () => {
    const voices = new Map<number, typeof p.notes>();
    for (const n of p.notes) voices.set(n.route, [...(voices.get(n.route) ?? []), n]);
    let checked = 0;
    for (const ns of voices.values()) {
      const hi = ns.filter((n) => n.alt >= 30000);
      const lo = ns.filter((n) => n.alt > 0 && n.alt < 10000);
      if (hi.length < 8 || lo.length < 4) continue;
      const mean = (a: typeof ns) => a.reduce((s, n) => s + Math.log2(n.freq), 0) / a.length;
      // a voice that sings (one instrument): its cruise notes sit above its climb notes
      if (new Set(ns.map((n) => n.instrument)).size === 1) {
        expect(mean(hi)).toBeGreaterThan(mean(lo));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("two flights are never the same note", () => {
  it("voices that start together do not sit on one pitch class", () => {
    const p = composePiece("visited", buildRoutes(["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK"], "IST"));
    const groups = new Map<string, Set<number>>();
    const routesIn = new Map<string, Set<number>>();
    for (const n of p.notes) {
      if (n.instrument === "DARBUKA" || n.instrument === "CONGA" || n.instrument === "TIMP" || n.instrument === "TAMB" || n.instrument === "TRI") continue;
      const k = (Math.round(n.t * 3) / 3).toFixed(2); // notes within a third of a second count as sounding together
      const pc = Math.round(12 * Math.log2(n.freq / 440)) % 12;
      groups.set(k, (groups.get(k) ?? new Set()).add(((pc % 12) + 12) % 12));
      routesIn.set(k, (routesIn.get(k) ?? new Set()).add(n.route));
    }
    let multi = 0;
    let same = 0;
    for (const [k, rs] of routesIn) {
      if (rs.size < 3) continue;
      multi++;
      if (groups.get(k)!.size === 1) same++;
    }
    expect(multi).toBeGreaterThan(10);
    expect(same / multi).toBeLessThan(0.05);
  });
});

describe("the music box: a route's notes never overlap in the drawing", () => {
  it("draws every note only until the next note of the same route", () => {
    const p = composePiece("visited", buildRoutes(["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK", "ESB", "ADB"], "IST"));
    const by = new Map<number, typeof p.notes>();
    for (const n of p.notes) by.set(n.route, [...(by.get(n.route) ?? []), n]);
    let checked = 0;
    for (const list of by.values()) {
      const s = [...list].sort((a, b) => a.t - b.t);
      for (let k = 0; k + 1 < s.length; k++) {
        if (s[k + 1].t - s[k].t < 1e-6) continue;
        expect(s[k].t + (s[k].drawDur ?? s[k].d)).toBeLessThanOrEqual(s[k + 1].t + 1e-6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("the sound family: mostly symphonic", () => {
  const codes = ["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK", "CPT", "MEX", "DXB", "LHR", "FRA", "CDG", "MAD", "FCO", "ATH", "VIE", "WAW", "PRG", "BUD", "OTP", "SOF", "BEG", "ZAG", "ESB", "AYT", "ADB", "BEY", "AMM"];
  const sets = Array.from({ length: 60 }, (_, i) => Array.from({ length: 3 + (i % 5) }, (_, j) => codes[(i * 7 + j * 11) % codes.length]));
  const pieces = sets.map((s, i) => composePiece(i % 2 ? "wish" : "visited", buildRoutes(s.filter((x, k) => s.indexOf(x) === k), "IST")));
  it("is symphonic most of the time and has other families now and then", () => {
    const count = (g: string) => pieces.filter((p) => p.style.genre === g).length;
    expect(count("symphonic") / pieces.length).toBeGreaterThan(0.45);
    expect(count("symphonic")).toBeGreaterThan(count("folk"));
    expect(new Set(pieces.map((p) => p.style.genre)).size).toBeGreaterThanOrEqual(3);
  });
  it("a symphonic piece is played by the orchestra", () => {
    const orch = new Set(["CELLO", "VIOLA", "BSN", "HORN", "VIOLIN", "OBOE", "CLA", "TPT", "FLUTE", "NEY", "HARP", "VIOLIN_PIZZ", "VIOLA_PIZZ", "GLOCK", "XYLO", "TIMP", "TRI", "TAMB"]);
    for (const p of pieces.filter((x) => x.style.genre === "symphonic")) for (const n of p.notes) expect(orch.has(n.instrument), n.instrument).toBe(true);
  });
});
