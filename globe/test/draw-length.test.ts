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

describe("a popular-song arrangement made of the routes", () => {
  const sel = selectionFromSearch("?v=TLL,OTP,GOT,EDI,TJM,GRU,ORN,EVN,PEK,KTI,NQZ,KGF,DAM&h=SZG")!;
  const routes = buildRoutes(sel.places, sel.home);
  const p = composePiece(sel.mode, routes);
  it("the form is felt: the chorus is busier than the intro and the break", () => {
    const rate = (name: string) => {
      const s = p.sections.find((x) => x.name === name)!;
      return p.notes.filter((x) => x.t >= s.start && x.t < s.end).length / (s.end - s.start);
    };
    expect(rate("chorus")).toBeGreaterThan(rate("intro") * 1.5);
    expect(rate("chorus")).toBeGreaterThan(rate("break") * 2);
  });
  it("the chord changes every bar and the progression loops every four", () => {
    const bar = (p.sections[1].end - p.sections[1].start) / 16;
    const roots = (b: number) => p.notes.filter((n) => n.t >= b * bar && n.t < (b + 1) * bar - 1e-6 && (n.instrument === "CELLO" || n.instrument === "BSN" || n.instrument === "VIOLA")).length;
    expect(roots(8)).toBeGreaterThan(0);
  });
  it("the hook comes back: the same bar of the hook route is played again four bars later", () => {
    const hookRoute = new Map<number, number>();
    for (const n of p.notes) hookRoute.set(n.route, (hookRoute.get(n.route) ?? 0) + 1);
    const bar = (p.sections[1].end - p.sections[1].start) / 16;
    // in the chorus (after the build) every bar of a route that sings has the same number of notes as the bar four before it
    const chorusStart = p.hook;
    const counts = (b: number, r: number) => p.notes.filter((n) => n.route === r && n.t >= b * bar - 1e-6 && n.t < (b + 1) * bar - 1e-6).length;
    const b0 = Math.round(chorusStart / bar);
    let same = 0;
    for (let r = 0; r < routes.length; r++) if (counts(b0, r) > 0 && counts(b0, r) === counts(b0 + 4, r)) same++;
    expect(same).toBeGreaterThan(5);
  });
});

import { TUNES } from "../src/personal/melodies";

describe("well-known melodies in the hook", () => {
  const homes = ["VIE", "FRA", "JFK", "LHR", "CDG", "MEX", "NRT", "AMS", "DUB", "EDI", "ZRH", "BRU", "ATH", "SOF", "MAD", "LAX", "YYZ", "SYD", "HKG"];
  const pieces = homes.flatMap((h) => (["visited", "wish"] as const).map((m) => ({ h, m, p: composePiece(m, buildRoutes(["IST", "DXB", "LHR", "JFK", "CDG"].filter((x) => x !== h), h)) })));
  it("uses several tunes across different starting places", () => {
    const used = new Set(pieces.map((x) => x.p.style.tune).filter(Boolean));
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
  it("the hook route plays the tune's own intervals at the start of the tune", () => {
    const hit = pieces.filter((x) => x.p.style.tune);
    expect(hit.length).toBeGreaterThan(5);
    for (const { p } of hit.slice(0, 12)) {
      const tune = TUNES.find((t) => t.id === p.style.tune)!;
      const first = p.hook;
      // the notes of any route that begin at the first chorus bar, in order, with the tune's intervals
      const byRoute = new Map<number, typeof p.notes>();
      for (const n of p.notes) if (n.t >= first - 1e-6 && n.t < first + 30) byRoute.set(n.route, [...(byRoute.get(n.route) ?? []), n]);
      const want = tune.notes.slice(0, 6).map(([s]) => s - tune.notes[0][0]);
      const ok = [...byRoute.values()].some((ns) => {
        const s = [...ns].sort((a, b) => a.t - b.t);
        for (let st = 0; st + 6 <= s.length; st++) {
          const m = s.slice(st, st + 6).map((n) => 12 * Math.log2(n.freq / s[st].freq));
          if (m.every((x, k) => Math.abs(x - want[k]) < 0.5 || Math.abs(Math.abs(x - want[k]) - 12) < 0.5)) return true;
        }
        return false;
      });
      expect(ok, tune.id).toBe(true);
    }
  });
});
