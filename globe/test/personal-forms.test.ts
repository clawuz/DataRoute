import { describe, expect, it } from "vitest";
import { CARDS, cellOf, cellSeedOf, planCards, type GenreCard } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import { composePiece, formAt, type PersonalNote } from "../src/personal/compose";
import destinations from "../src/personal/destinations.json";

const card = (id: string): GenreCard => CARDS.find((c) => c.id === id)!;
const SECTIONS = ["intro", "verse", "build", "chorus", "break", "outro"] as const;

type Role = "pad" | "bass" | "hook" | "pluck" | "kick" | "backbeat" | "hat";
const BASE: Role[] = ["pad", "bass", "hook", "pluck", "kick", "backbeat", "hat"];
const SMALL: Record<number, Role[]> = { 2: ["bass", "hook"], 3: ["bass", "hook", "pluck"], 4: ["pad", "bass", "hook", "pluck"], 5: ["pad", "bass", "hook", "pluck", "kick"], 6: ["pad", "bass", "hook", "pluck", "kick", "backbeat"] };
const rolesOf = (routes: ReturnType<typeof buildRoutes>): Role[] => {
  const n = routes.length;
  const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i);
  const role: Role[] = new Array(n);
  order.forEach((x, k) => (role[x.i] = n <= 6 ? SMALL[n][k] : BASE[Math.floor((k * 7) / n)]));
  return role;
};
const DRUMS = new Set(["FRAMEDRUM", "BENDIR", "DARBUKA", "TIMP", "TRI", "TAMB", "CONGA", "GONG", "TABLA"]);
const isDrum = (n: PersonalNote): boolean => DRUMS.has(String(n.instrument).replace(/_.*$/, "")) || String(n.instrument).startsWith("DARBUKA") || String(n.instrument).startsWith("FRAMEDRUM");
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

const pieceOf = (places: string[], home = "IST") => {
  const rs = buildRoutes(places, home);
  const pl = planCards("visited", rs);
  const p = composePiece("visited", rs);
  const role = rolesOf(rs);
  const bar = 240 / p.bpm;
  const beat = bar / 4;
  const drawn = p.notes.filter((n) => n.show !== false);
  const inBar = (n: PersonalNote, b: number): boolean => n.t >= b * bar - 0.05 && n.t < (b + 1) * bar - 0.05;
  const perBar = (f: (n: PersonalNote) => boolean, a: number, b: number): number => mean(Array.from({ length: b - a }, (_, k) => drawn.filter((n) => f(n) && inBar(n, a + k)).length));
  return { rs, pl, p, role, bar, beat, drawn, inBar, perBar };
};

describe("formAt", () => {
  it("is the common form (normal speed, normal mode) for every card without a form, in every section", () => {
    for (const c of CARDS.filter((x) => !x.form)) for (const s of SECTIONS) expect(formAt(c, s), `${c.id} ${s}`).toMatchObject({ speed: "normal", mode: "normal" });
  });
  it("gives the horon to the Black Sea, the halay to the East and the long air to Central Anatolia and Konya", () => {
    expect(card("karadeniz").form).toBe("horon");
    expect(card("dogu").form).toBe("halay");
    expect(card("icanadolu").form).toBe("uzunhava");
    expect(card("mevlevi").form).toBe("uzunhava");
    expect(CARDS.filter((c) => c.form).map((c) => c.id).sort()).toEqual(["dogu", "icanadolu", "karadeniz", "mevlevi"]);
  });
  it("the horon and the halay: slow and sparse at the start, the figure in the verse, double speed in the build and the chorus", () => {
    for (const id of ["karadeniz", "dogu"]) {
      const c = card(id);
      expect(formAt(c, "intro")).toMatchObject({ speed: "slow", mode: "sparse" });
      expect(formAt(c, "verse")).toMatchObject({ speed: "normal", mode: "normal" });
      expect(formAt(c, "build").speed).toBe("double");
      expect(formAt(c, "chorus").speed).toBe("double");
      expect(formAt(c, "break")).toMatchObject({ mode: "sparse" });
    }
    expect(formAt(card("karadeniz"), "intro").drum).toBe("kudum");
    expect(formAt(card("karadeniz"), "break").drum).toBeUndefined();
    expect(formAt(card("dogu"), "intro").drum).toBe("davul");
  });
  it("the long air: free time in the intro and the outro, the metre between", () => {
    for (const id of ["icanadolu", "mevlevi"]) {
      expect(formAt(card(id), "intro").mode).toBe("free");
      expect(formAt(card(id), "outro").mode).toBe("free");
      for (const s of ["verse", "build", "chorus", "break"] as const) expect(formAt(card(id), s)).toMatchObject({ speed: "normal", mode: "normal" });
    }
  });
});

describe("the horon and the halay thicken from slow to fast", () => {
  for (const [name, places, cardId] of [["Karadeniz", ["TZX", "RZV", "OGU"], "karadeniz"], ["Doğu", ["VAN", "ERZ", "ERC"], "dogu"]] as const) {
    describe(name, () => {
      const x = pieceOf([...places]);
      const hook = x.role.indexOf("hook");
      const bassLike = (n: PersonalNote): boolean => !isDrum(n) && (x.role[n.route] === "bass" || x.role[n.route] === "kick");
      it(`plays the ${cardId} card`, () => {
        expect(x.pl.main.id).toBe(cardId);
        expect(hook).toBeGreaterThanOrEqual(0);
      });
      it("the hook has fewer notes per bar in the intro than in the verse, and fewer in the verse than in the chorus", () => {
        const intro = x.perBar((n) => n.route === hook, 0, 8);
        const verse = x.perBar((n) => n.route === hook, 8, 24);
        const chorus = x.perBar((n) => n.route === hook, 32, 52);
        expect(intro).toBeGreaterThan(0);
        expect(intro).toBeLessThan(verse);
        expect(verse).toBeLessThan(chorus);
      });
      it("the hook of the intro is one long note at the start of each bar", () => {
        for (let b = 0; b < 8; b++) {
          const ns = x.drawn.filter((n) => n.route === hook && x.inBar(n, b));
          expect(ns.length, `bar ${b}`).toBe(1);
          expect(Math.abs(ns[0].t - b * x.bar)).toBeLessThan(0.05);
          expect(ns[0].d).toBeGreaterThan(2.5 * x.beat);
        }
      });
      it("no bass, pluck or hat in the intro: the drums there are only the kudüm / davul", () => {
        for (let b = 0; b < 8; b++) {
          const ns = x.drawn.filter((n) => x.inBar(n, b) && n.route !== hook);
          for (const n of ns) {
            if (x.role[n.route] === "pad") continue;
            expect(isDrum(n), `bar ${b}: ${n.instrument} on a ${x.role[n.route]} route`).toBe(true);
          }
        }
        const drums = x.drawn.filter((n) => n.t < 8 * x.bar - 0.05 && isDrum(n));
        expect(drums.length).toBeGreaterThan(0);
      });
      it("the chorus has at least 1.8 times the bass and kick hits per bar of the verse", () => {
        const verse = x.perBar((n) => bassLike(n) || (isDrum(n) && x.role[n.route] !== "hat"), 8, 24);
        const chorus = x.perBar((n) => bassLike(n) || (isDrum(n) && x.role[n.route] !== "hat"), 32, 52);
        expect(chorus).toBeGreaterThanOrEqual(1.8 * verse);
      });
    });
  }
  it("the horon's kudüm strikes beat one of every second bar of the intro, the halay's davul the strong places, heavy", () => {
    const k = pieceOf(["TZX", "RZV", "OGU"]);
    const kd = k.drawn.filter((n) => n.t < 8 * k.bar - 0.05 && isDrum(n));
    expect(kd.map((n) => Math.round(n.t / k.bar))).toEqual([0, 2, 4, 6]);
    const d = pieceOf(["VAN", "ERZ", "ERC"]);
    const ch = cellOf(d.pl.main, cellSeedOf(d.pl.main, d.rs));
    const total = ch.cell.reduce((a, u) => a + Math.abs(u), 0);
    let at = 0;
    const strong: number[] = [];
    let hitNo = 0;
    ch.cell.forEach((u, j) => {
      if (u > 0) {
        if (hitNo === 0 || (ch.accent?.[j] ?? 1) >= 1.1) strong.push((at / total) * 4);
        hitNo++;
      }
      at += Math.abs(u);
    });
    for (let b = 0; b < 8; b++) {
      const got = d.drawn.filter((n) => d.inBar(n, b) && isDrum(n)).map((n) => (n.t - b * d.bar) / d.beat).sort((p, q) => p - q);
      expect(got.length, `bar ${b}`).toBe(strong.slice(0, 4).length);
      got.forEach((g, j) => expect(Math.abs(g - strong[j])).toBeLessThan(0.05));
    }
  });
});

describe("the long air (uzun hava): free time, then the metre", () => {
  const x = pieceOf(["ESB", "ASR", "KYA", "NAV"]);
  const hook = x.role.indexOf("hook");
  it("plays the Central Anatolian card with a Konya colour", () => {
    expect(x.pl.main.id).toBe("icanadolu");
    expect(x.pl.perRoute.map((c) => c.id)).toContain("mevlevi");
  });
  it("in bars 0-7 there is no kick, backbeat, hat, pluck or bass note", () => {
    const bad = x.drawn.filter((n) => n.t < 8 * x.bar - 0.05 && ["kick", "backbeat", "hat", "pluck", "bass"].includes(x.role[n.route]));
    expect(bad.map((n) => `${x.role[n.route]} ${n.instrument} ${n.t.toFixed(2)}`)).toEqual([]);
    expect(x.drawn.filter((n) => n.t < 8 * x.bar - 0.05 && isDrum(n))).toEqual([]);
  });
  it("the hook of the free bars is off the grid and long", () => {
    const ns = x.drawn.filter((n) => n.route === hook && n.t < 7 * x.bar - 0.05);
    expect(ns.length).toBeGreaterThanOrEqual(8);
    const off = ns.filter((n) => {
      const g = Math.round(n.t / x.beat) * x.beat;
      return Math.abs(n.t - g) > 0.02;
    });
    expect(off.length).toBeGreaterThanOrEqual(ns.length / 2);
    expect(mean(ns.map((n) => n.d / x.beat))).toBeGreaterThan(1.5);
  });
  it("the pad holds one long note a bar in the free bars (no re-strike on the beats)", () => {
    const pad = x.role.indexOf("pad");
    for (let b = 0; b < 8; b++) expect(x.drawn.filter((n) => n.route === pad && x.inBar(n, b)).length, `bar ${b}`).toBe(1);
  });
  it("the outro is free again", () => {
    const bad = x.drawn.filter((n) => n.t >= 56 * x.bar - 0.05 && ["kick", "backbeat", "hat", "pluck", "bass"].includes(x.role[n.route]));
    expect(bad).toEqual([]);
  });
  it("from bar 8 the usual groove: the bass plays the strong places of the figure and the pluck plays", () => {
    const bass = x.role.indexOf("bass");
    const pluck = x.role.indexOf("pluck");
    for (let b = 8; b < 12; b++) {
      expect(x.drawn.filter((n) => n.route === bass && x.inBar(n, b)).length, `bar ${b}`).toBeGreaterThan(0);
      expect(x.drawn.filter((n) => n.route === pluck && x.inBar(n, b)).length, `bar ${b}`).toBeGreaterThan(0);
    }
  });
});

describe("forms keep the invariants over 300 selections", () => {
  const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const codes = (destinations as { i: string }[]).map((d) => d.i);
  const TURKISH = "TZX RZV OGU SZF NOP KFS ONQ MZH ESB ASR NAV VAS KYA VAN ERZ ERC KSY DIY MLX GZT ADB BJV DNZ".split(" ");
  it("no NaN, nothing negative, values in range, at most 6000 notes, drawDur within the note, deterministic", { timeout: 120000 }, () => {
    const rnd = lcg(20261028);
    let withForm = 0;
    for (let k = 0; k < 300; k++) {
      const n = 2 + Math.floor(rnd() * 7);
      const pool = k % 2 ? TURKISH : codes;
      const places = new Set<string>();
      while (places.size < n) places.add(pool[Math.floor(rnd() * pool.length)]);
      const home = k % 3 === 0 ? undefined : "IST";
      const rs = buildRoutes([...places].filter((p) => p !== home), home);
      if (!rs.length) continue;
      const mode = k % 4 === 0 ? "wish" : "visited";
      const p = composePiece(mode, rs, k % 5 === 0 ? { melody: "bank" } : {});
      if (planCards(mode, rs).main.form) withForm++;
      const tag = `${[...places].join(",")} home ${home ?? "none"} ${mode}`;
      expect(p.notes.length, tag).toBeLessThanOrEqual(6000);
      for (const x of p.notes) {
        expect([x.t, x.d, x.freq, x.vel].every(Number.isFinite), tag).toBe(true);
        expect(x.t, tag).toBeGreaterThanOrEqual(0);
        expect(x.d, tag).toBeGreaterThan(0);
        expect(x.freq, tag).toBeGreaterThan(0);
        expect(x.vel, tag).toBeGreaterThanOrEqual(0);
        expect(x.vel, tag).toBeLessThanOrEqual(1);
        if (x.pan !== undefined) expect(Math.abs(x.pan), tag).toBeLessThanOrEqual(1);
        if (x.wet !== undefined) expect(x.wet >= 0 && x.wet <= 0.5, tag).toBe(true);
        expect(x.drawDur, tag).toBeDefined();
        expect(x.drawDur!, tag).toBeGreaterThan(0);
        expect(x.drawDur!, tag).toBeLessThanOrEqual(x.d + 1e-9);
      }
      if (k % 10 === 0) expect(JSON.stringify(composePiece(mode, rs, k % 5 === 0 ? { melody: "bank" } : {}).notes), tag).toBe(JSON.stringify(p.notes));
    }
    expect(withForm).toBeGreaterThanOrEqual(60);
  });
});
