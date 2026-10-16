import { describe, expect, it } from "vitest";
import { drawLength } from "../src/personal/flight";
import { composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";
import { selectionFromSearch } from "../src/personal/codec";

describe("drawLength", () => {
  it("a bar is never longer than the sound or than the gap to the route's next note", () => {
    expect(drawLength(0.3, 2)).toBeCloseTo(0.3);
    expect(drawLength(3, 2)).toBeLessThanOrEqual(2 * 0.92 + 1e-9);
    expect(drawLength(0.8, null)).toBe(0.8);
  });
});

describe("note length follows route length", () => {
  it("the longer routes of a piece draw and sound longer notes", () => {
    const sel = selectionFromSearch("?v=SZG,TLL,OTP,GOT,EDI,TJM,GRU,ORN,EVN,PEK,KTI,NQZ,KGF,DAM&h=FCO")!;
    const routes = buildRoutes(sel.places, sel.home);
    const p = composePiece(sel.mode, routes);
    const rows = routes
      .map((r, i) => {
        const ns = p.notes.filter((n) => n.route === i);
        return { km: r.distKm, avg: ns.reduce((a, n) => a + (n.drawDur ?? n.d), 0) / Math.max(1, ns.length) };
      })
      .sort((a, b) => a.km - b.km);
    const third = Math.floor(rows.length / 3);
    const mean = (xs: typeof rows) => xs.reduce((a, x) => a + x.avg, 0) / xs.length;
    expect(mean(rows.slice(-third))).toBeGreaterThan(mean(rows.slice(0, third)) * 1.8);
  });
});

describe("the piano with more than three routes", () => {
  const links = [
    "?v=SZG,TLL,OTP,GOT,EDI,TJM,GRU,ORN,EVN,PEK,KTI,NQZ,KGF,DAM&h=FCO",
    "?v=JFK,LAX,MIA,YYZ,GRU",
    "?w=DPS,NRT,SYD,BKK,SIN",
    "?v=ADB,ESB,AYT,TZX,DLM,BJV",
    "?v=CAI,DXB,DOH,AMM,JED",
    "?v=NBO,JNB,CPT,LOS,ACC",
  ];
  for (const l of links) {
    it(`has a piano: ${l}`, () => {
      const sel = selectionFromSearch(l)!;
      const p = composePiece(sel.mode, buildRoutes(sel.places, sel.home));
      expect(p.notes.some((n) => n.instrument === "PNO")).toBe(true);
    });
  }
});
