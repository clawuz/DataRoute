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
        expect(p.duration, `${mode} ${n}`).toBeGreaterThan(120);
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
    // a lone route sings a tune of its own and the many routes hold long notes: the count is not the measure, the voices are
    expect(many.notes.length).toBeGreaterThan(300);
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
import { ROUTE_HEX } from "../src/scene/route-palette";
describe("route colours", () => {
  it("colours routes from the live palette, the same each time, and the globe and the list agree", () => {
    const routes = buildRoutes(["GZP", "DNZ", "DIY", "EDO", "EZS", "ISE", "ASR", "NAV", "OGU", "RZV", "KYA", "IST", "ERC", "BJV", "BAL", "KCM"], "WAW");
    const a = routePalette(routes);
    const b = routePalette(routes);
    expect(a.css.size).toBe(routes.length);
    expect([...a.css.values()].every((c) => ROUTE_HEX.includes(c as never))).toBe(true);
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
      expect(p.duration).toBeGreaterThan(120);
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
});

describe("two flights are never the same note", () => {
  it("voices that start together do not sit on one pitch class (the rule-built families)", () => {
    const sets = [
      ["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK"], ["LHR", "CDG", "FRA", "MAD", "FCO", "ATH", "VIE", "WAW"],
      ["DXB", "BEY", "AMM", "CAI", "JNB", "NBO", "ADD", "LOS"], ["MEX", "YYZ", "BOS", "GRU", "EZE", "SCL", "BOG", "LIM"],
    ];
    let multi = 0;
    let same = 0;
    for (const set of sets) {
      for (const mode of ["visited", "wish"] as const) {
        const p = composePiece(mode, buildRoutes(set, "IST"));
        const groups = new Map<string, Set<number>>();
        const routesIn = new Map<string, Set<number>>();
        for (const n of p.notes) {
          if (["DARBUKA", "CONGA", "TIMP", "TAMB", "TRI"].includes(n.instrument)) continue;
          const k = (Math.round(n.t * 3) / 3).toFixed(2); // notes within a third of a second count as sounding together
          const pc = ((Math.round(12 * Math.log2(n.freq / 440)) % 12) + 12) % 12;
          groups.set(k, (groups.get(k) ?? new Set()).add(pc));
          routesIn.set(k, (routesIn.get(k) ?? new Set()).add(n.route));
        }
        for (const [k, rs] of routesIn) {
          if (rs.size < 3) continue;
          multi++;
          if (groups.get(k)!.size === 1) same++;
        }
      }
    }
    expect(multi).toBeGreaterThan(20);
    expect(same / multi).toBeLessThan(0.25); // doubling a note in unison now and then is fine in an orchestra; a wall of one note is not
  });
});

describe("the music box: a route's notes never overlap in the drawing", () => {
  it("draws every note only until the next note of the same route", () => {
    const p = composePiece("visited", buildRoutes(["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK", "ESB", "ADB"], "IST"));
    const by = new Map<number, typeof p.notes>();
    for (const n of p.notes) if (n.show !== false) by.set(n.route, [...(by.get(n.route) ?? []), n]);
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

describe("the genre cards: the music of where the trip starts from", () => {
  const codes = ["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK", "CPT", "MEX", "DXB", "LHR", "FRA", "CDG", "MAD", "FCO", "ATH", "VIE", "WAW", "PRG", "BUD", "OTP", "SOF", "BEG", "ZAG", "ESB", "AYT", "ADB", "BEY", "AMM"];
  const sets = Array.from({ length: 60 }, (_, i) => Array.from({ length: 3 + (i % 5) }, (_, j) => codes[(i * 7 + j * 11) % codes.length]));
  const pieces = sets.map((s, i) => composePiece(i % 2 ? "wish" : "visited", buildRoutes(s.filter((x, k) => s.indexOf(x) === k), "IST")));
  it("mixes the families: no family takes more than two thirds, at least three are heard", () => {
    const count = (g: string) => pieces.filter((p) => p.style.genre === g).length;
    for (const g of ["symphonic", "chamber", "folk", "pulse"]) expect(count(g) / pieces.length, g).toBeLessThan(0.67);
    expect(new Set(pieces.map((p) => p.style.genre)).size).toBeGreaterThanOrEqual(3);
  });
  it("a piece whose cards are all orchestral is played by the orchestra", () => {
    const orchCards = new Set(["cinematic", "romantic", "baroque", "nordic", "epic", "calm"]);
    const orch = new Set(["PNO", "CELLO", "VIOLA", "BSN", "HORN", "VIOLIN", "OBOE", "CLA", "TPT", "FLUTE", "PICC", "NEY", "HARP", "VIOLIN_PIZZ", "VIOLA_PIZZ", "CELLO_PIZZ", "BASS_PIZZ", "GLOCK", "XYLO", "TIMP", "TRI", "TAMB", "GONG", "STEINWAY", "KAWAI", "HARPSICHORD", "RENORGAN"]);
    // destination cards now colour 60% of the routes, so mixed selections rarely stay orchestral: a second sample of
    // trips between airports whose cards are all orchestral (checked against cardsOfAirport) can still produce such pieces
    const calm = ["VIE", "FCO", "MXP", "ZRH", "BRU", "WAW", "PRG", "BUD", "OSL", "HEL", "CPH"];
    const orchestralPieces = Array.from({ length: 24 }, (_, i) => {
      const home = calm[(i * 5) % calm.length];
      const set = Array.from({ length: 3 + (i % 5) }, (_, j) => calm[(i * 7 + j * 11 + 1) % calm.length]).filter((x, k, a) => x !== home && a.indexOf(x) === k);
      return composePiece(i % 2 ? "wish" : "visited", buildRoutes(set, home));
    });
    const mine = [...pieces, ...orchestralPieces].filter((x) => (x.style.cards ?? []).every((c) => orchCards.has(c)));
    expect(mine.length).toBeGreaterThan(3);
    for (const p of mine) for (const n of p.notes) expect(orch.has(n.instrument), n.instrument).toBe(true);
  });
  it("starting from a different country gives a different music", () => {
    const from = (home: string) => composePiece("visited", buildRoutes(["NRT", "DXB", "FCO", "GRU"], home)).style.cards![0];
    const seen = new Set(["IST", "GRU", "NBO", "BKK", "DEL", "MAD", "DXB", "BUE", "LOS", "ATH"].map(from));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
  it("an Arabic start brings the Arabic card", () => {
    const p = composePiece("visited", buildRoutes(["DXB", "DOH", "AMM", "BEY", "CAI", "JED"], "DXB"));
    expect(p.style.cards).toContain("arabic");
  });
});

describe("one route: one voice with a tune", () => {
  const routes = buildRoutes(["GZP"], "IST");
  const p = composePiece("wish", routes);
  it("is a single instrument on a single route, one note at a time", () => {
    expect(routes.length).toBe(1);
    expect(new Set(p.notes.map((n) => n.instrument)).size).toBe(1);
    expect(new Set(p.notes.map((n) => n.route))).toEqual(new Set([0]));
    const s = [...p.notes].sort((a, b) => a.t - b.t);
    for (let k = 0; k + 1 < s.length; k++) expect(s[k].t + s[k].d).toBeLessThanOrEqual(s[k + 1].t + 0.2);
  });
  it("moves: it goes up and comes down over more than an octave", () => {
    const m = p.notes.map((n) => 69 + 12 * Math.log2(n.freq / 440));
    expect(Math.max(...m) - Math.min(...m)).toBeGreaterThanOrEqual(12);
    let ups = 0;
    let downs = 0;
    for (let k = 1; k < m.length; k++) {
      if (m[k] > m[k - 1] + 0.5) ups++;
      if (m[k] < m[k - 1] - 0.5) downs++;
    }
    expect(ups).toBeGreaterThan(30);
    expect(downs).toBeGreaterThan(30);
  });
  it("rises with the flight: the cruise sits above the climb", () => {
    const top = Math.max(...p.notes.map((n) => n.alt));
    const cruise = p.notes.filter((n) => n.alt >= 0.9 * top).map((n) => Math.log2(n.freq));
    const climb = p.notes.filter((n) => n.alt > 0 && n.alt < 0.8 * top).map((n) => Math.log2(n.freq));
    expect(cruise.length).toBeGreaterThan(20);
    expect(climb.length).toBeGreaterThan(5);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(cruise)).toBeGreaterThan(mean(climb));
  });
  it("comes home: the phrases end on a held note, the piece on its root", () => {
    const s = [...p.notes].sort((a, b) => a.t - b.t);
    const last = s[s.length - 1];
    const avg = s.reduce((x, n) => x + n.d, 0) / s.length;
    expect(last.d).toBeGreaterThan(avg * 2);
    // the root of the key: D (587 Hz class) moved by the piece's shift
    const pcOf = (f: number) => (((Math.round(12 * Math.log2(f / 440)) % 12) + 12) % 12);
    const root = (((9 - 2 + p.style.shift) % 12) + 12) % 12; // D is pitch class 2 relative to A=9? computed below from the key
    void root;
    const tonicPc = (((2 + p.style.shift) % 12) + 12) % 12; // D = 2 in a C-based pitch class count
    const lastPc = (((pcOf(last.freq) + 9) % 12) + 12) % 12; // A-based → C-based
    expect(lastPc).toBe(tonicPc);
  });
});
