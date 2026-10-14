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

describe("routes — every trip goes through Istanbul", () => {
  it("London → Bali is LHR → IST → DPS", () => {
    const r = buildRoutes("LHR", ["DPS"]);
    expect(r.map((x) => x.key)).toEqual(["LHR-IST", "IST-DPS"]);
    expect(r[0].leg).toBe(0);
    expect(r[1].leg).toBe(1);
  });
  it("from the hub the flight is direct", () => {
    expect(buildRoutes("IST", ["DPS", "JFK"]).map((x) => x.key)).toEqual(["IST-DPS", "IST-JFK"]);
  });
  it("a destination that is the hub needs no stopover", () => {
    expect(buildRoutes("LHR", ["IST"]).map((x) => x.key)).toEqual(["LHR-IST"]);
  });
  it("shares the first leg between trips and keeps the order", () => {
    const r = buildRoutes("LHR", ["DPS", "JFK", "NRT"]);
    expect(r.map((x) => x.key)).toEqual(["LHR-IST", "IST-DPS", "IST-JFK", "IST-NRT"]);
  });
  it("uses a real non-hub flight when TK flies one", () => {
    expect(buildRoutes("ESB", ["VIE"]).map((x) => x.key)).toEqual(["ESB-VIE"]);
    expect(buildRoutes("AYT", ["VKO"]).map((x) => x.key)).toEqual(["AYT-VKO"]);
    expect(buildRoutes("MEL", ["SIN"]).map((x) => x.key)).toEqual(["MEL-SIN"]);
    // the pair is undirected
    expect(buildRoutes("VIE", ["ESB"]).map((x) => x.key)).toEqual(["VIE-ESB"]);
  });
  it("changes at Istanbul when there is no direct flight", () => {
    expect(buildRoutes("ESB", ["LHR"]).map((x) => x.key)).toEqual(["ESB-IST", "IST-LHR"]);
    expect(buildRoutes("LHR", ["JFK"]).map((x) => x.key)).toEqual(["LHR-IST", "IST-JFK"]);
  });
  it("skips the origin and unknown codes", () => {
    expect(buildRoutes("LHR", ["LHR", "ZZZ"])).toEqual([]);
  });
  it("counts stopovers", () => {
    expect(stopovers("LHR", ["DPS", "IST", "JFK"])).toBe(2);
    expect(stopovers("ESB", ["VIE", "LHR"])).toBe(1);
    expect(stopovers("IST", ["DPS", "JFK"])).toBe(0);
  });
  it("great-circle distances are plausible", () => {
    const [a, b] = buildRoutes("LHR", ["DPS"]);
    expect(a.distKm).toBeGreaterThan(2400);
    expect(a.distKm).toBeLessThan(3000);
    expect(b.distKm).toBeGreaterThan(9500);
    expect(b.distKm).toBeLessThan(10500);
  });
  it("colours a leg by the far end from the hub", () => {
    const [a, b] = buildRoutes("LHR", ["DPS"]);
    expect(a.region).toBe("EUR");
    expect(b.region).toBe("ASI");
  });
});

describe("codec", () => {
  it("round-trips selections and defaults the origin to the hub", () => {
    const sel = { mode: "wish" as const, origin: "LHR", dests: ["DPS", "NRT"] };
    expect(selectionFromSearch(searchFromSelection(sel))).toEqual(sel);
    expect(searchFromSelection({ mode: "visited", origin: "IST", dests: ["JFK"] })).toBe("?v=JFK");
    expect(selectionFromSearch("?v=JFK")).toEqual({ mode: "visited", origin: "IST", dests: ["JFK"] });
    expect(pieceHash(sel)).toMatch(/^w-LHR-/);
  });
  it("rejects garbage, unknown codes and the origin itself", () => {
    expect(selectionFromSearch("?v=!!")).toBeNull();
    expect(selectionFromSearch("?v=ZZZ,QQQ")).toBeNull();
    expect(selectionFromSearch("?o=LHR&v=LHR")).toBeNull();
    expect(selectionFromSearch("")).toBeNull();
    expect(selectionFromSearch("?o=XXX&v=jfk,dps")?.origin).toBe("IST");
    expect(selectionFromSearch("?v=jfk,JFK,dps")?.dests).toEqual(["JFK", "DPS"]);
  });
});

describe("compose", () => {
  it("is a full-length piece: about two and a half to three minutes", () => {
    const all = ["DPS", "JFK", "NRT", "GRU", "CAI", "SYD", "LAX", "BKK", "CPT", "MEX", "DXB", "LHR", "FRA", "CDG", "MAD", "FCO", "ATH", "VIE", "WAW", "PRG", "BUD", "OTP", "SOF", "BEG", "ZAG"];
    for (const mode of ["visited", "wish"] as const) {
      for (const n of [1, 5, 25]) {
        const p = composePiece(mode, buildRoutes("IST", all.slice(0, n)));
        expect(p.duration, `${mode} ${n}`).toBeGreaterThan(140);
        expect(p.duration, `${mode} ${n}`).toBeLessThan(200);
        expect(p.hook).toBeGreaterThan(40);
        expect(p.hook).toBeLessThan(p.duration - 30);
      }
    }
  });
  it("plays every route at least once and marks the accompaniment", () => {
    const routes = buildRoutes("LHR", ["DPS", "JFK", "NRT", "GRU", "CAI"]);
    const p = composePiece("visited", routes);
    const heard = new Set(p.notes.filter((n) => n.route >= 0).map((n) => n.route));
    expect(heard.size).toBe(routes.length);
    expect(p.notes.some((n) => n.route === -1 && n.instrument === "STR")).toBe(true);
  });
  it("is deterministic and keeps every note inside the duration", () => {
    const routes = buildRoutes("LHR", ["DPS", "JFK", "NRT", "GRU", "CAI"]);
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
    const routes = buildRoutes("IST", ["DPS", "JFK"]);
    expect(composePiece("wish", routes)).not.toEqual(composePiece("visited", routes));
    expect(composePiece("wish", []).notes).toEqual([]);
    expect(composePiece("wish", []).duration).toBe(0);
  });
});

describe("personal model and stats", () => {
  it("builds planned arcs keyed by IATA", () => {
    const routes = buildRoutes("LHR", ["DPS", "JFK"]);
    const m = buildPersonalModel(routes);
    expect(m.flights).toHaveLength(3);
    expect(m.airports.IST).toBeDefined();
    expect(m.traffic.get("IST")).toBe(3);
    expect(buildArcBuffers(m, { planned: true })).toBeTruthy();
    // no flown track may be split by the coverage-gap rule, however long the route
    const longRoute = buildPersonalModel(buildRoutes("IST", ["GRU", "SYD", "LAX"]));
    for (const f of longRoute.flights) for (let i = 0; i + 1 < f.t.length; i++) expect(isBreak(f, i)).toBe(false);
  });
  it("summarises the piece", () => {
    const routes = buildRoutes("LHR", ["DPS", "JFK"]);
    const s = pieceStats("visited", "LHR", ["DPS", "JFK"], routes);
    expect(s.destinations).toBe(2);
    expect(s.countries).toBe(2);
    expect(s.km).toBeGreaterThan(20000);
  });
});
