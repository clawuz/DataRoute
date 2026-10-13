import { describe, expect, it } from "vitest";
import { COUNTRIES, countryOf, flagOf } from "../src/personal/countries";
import { decodeSet, encodeSet, pieceHash, searchFromSelection, selectionFromSearch } from "../src/personal/codec";
import { buildRoutes, journeyOrder } from "../src/personal/routes";
import { composePiece } from "../src/personal/compose";
import { buildPersonalModel } from "../src/personal/model";
import { buildArcBuffers } from "../src/scene/arcs";

describe("countries", () => {
  it("has unique ISO codes and valid coordinates", () => {
    const isos = COUNTRIES.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
    for (const c of COUNTRIES) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
    }
    expect(countryOf("TR")?.region).toBe("DOM");
    expect(countryOf("JP")?.region).toBe("ASI");
  });
  it("makes a flag emoji", () => expect(flagOf("TR")).toBe("🇹🇷"));
});

describe("codec", () => {
  it("round-trips a set regardless of order", () => {
    const s = encodeSet(["JP", "US", "TR", "FR"]);
    expect(decodeSet(s).sort()).toEqual(["FR", "JP", "TR", "US"]);
    expect(encodeSet(["US", "FR", "TR", "JP"])).toBe(s);
  });
  it("parses and writes the URL", () => {
    const sel = { mode: "wish" as const, isos: ["JP", "BR", "NZ"] };
    const back = selectionFromSearch(searchFromSelection(sel));
    expect(back?.mode).toBe("wish");
    expect(back?.isos.sort()).toEqual(["BR", "JP", "NZ"]);
    expect(pieceHash(sel)).toMatch(/^w-/);
  });
  it("rejects garbage and too-small selections", () => {
    expect(selectionFromSearch("?v=!!")).toBeNull();
    expect(selectionFromSearch(`?v=${encodeSet(["JP"])}`)).toBeNull();
    expect(selectionFromSearch("")).toBeNull();
  });
});

describe("routes", () => {
  it("visited is a journey starting at home", () => {
    const r = buildRoutes("visited", ["JP", "GB", "FR"]);
    expect(r).toHaveLength(3);
    expect(r[0].from).toBe("TR");
    expect(r[1].from).toBe(r[0].to);
  });
  it("wish is a star from home", () => {
    const r = buildRoutes("wish", ["JP", "GB", "FR"]);
    expect(r.every((x) => x.from === "TR")).toBe(true);
  });
  it("skips home and unknown codes, and is deterministic", () => {
    expect(journeyOrder("TR", ["TR", "ZZ", "FR"])).toEqual(["FR"]);
    expect(buildRoutes("visited", ["JP", "FR", "US"])).toEqual(buildRoutes("visited", ["US", "FR", "JP"]));
  });
});

describe("compose", () => {
  it("is deterministic and has notes inside the duration", () => {
    const routes = buildRoutes("visited", ["JP", "FR", "US", "BR", "EG"]);
    const a = composePiece("visited", routes);
    const b = composePiece("visited", routes);
    expect(a).toEqual(b);
    expect(a.notes.length).toBeGreaterThanOrEqual(routes.length);
    for (const n of a.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect(n.t + n.d).toBeLessThanOrEqual(a.duration);
      expect(n.freq).toBeGreaterThan(20);
    }
  });
  it("moods differ", () => {
    const routes = buildRoutes("wish", ["JP", "FR", "US"]);
    expect(composePiece("wish", routes)).not.toEqual(composePiece("visited", routes));
  });
  it("is empty without routes", () => expect(composePiece("wish", [])).toEqual({ notes: [], duration: 0 }));
});

describe("personal model", () => {
  it("builds planned arcs without a flown track", () => {
    const routes = buildRoutes("wish", ["JP", "FR", "US"]);
    const m = buildPersonalModel(routes);
    expect(m.flights).toHaveLength(3);
    expect(m.airports.JP).toBeDefined();
    expect(buildArcBuffers(m, { planned: true })).toBeTruthy();
  });
});
