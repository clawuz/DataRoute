import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { CARDS } from "../src/personal/genres";
import { LOW, idiomOf, phraseMotifs } from "../src/personal/idiom";
import { BANK, SHIP_BANK, bankOf, chooseBank, choosePhrase, decodePhrase, entryOf, pickPhrase, repeatShare, selectBank } from "../src/personal/melody-bank";
import { buildRoutes } from "../src/personal/routes";
import { destinationOf } from "../src/personal/destinations";

const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

describe("the bank file", () => {
  it("has the compact schema, every card and every number of hits", () => {
    expect(BANK.version).toBe(2);
    expect(Object.keys(BANK.cards).sort()).toEqual(CARDS.map((c) => c.id).sort());
    for (const c of CARDS) {
      expect(Object.keys(BANK.cards[c.id]).sort(), c.id).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
      for (const h of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const list = BANK.cards[c.id][String(h)];
        expect(list.length, `${c.id}/${h}`).toBeGreaterThan(0);
        expect(list.length).toBeLessThanOrEqual(64);
      }
    }
  });
  it("keeps every invariant of every phrase (the selected bank and the shippable one)", () => {
    const bad: string[] = [];
    for (const [bank, c] of [BANK, SHIP_BANK].flatMap((b) => CARDS.map((c) => [b, c] as const))) {
      const idiom = idiomOf(c);
      for (let h = 1; h <= 9; h++) {
        for (const str of bank.cards[c.id][String(h)]) {
          const tag = `${c.id}/${h} ${str}`;
          if (!/^[0-9ab.]+(\|[0-9ab.]+){3}$/.test(str)) bad.push(`format ${tag}`);
          const bars = str.split("|");
          bars.forEach((bar, k) => {
            if (bar.length !== h) bad.push(`length ${tag}`);
            const last = bar[bar.length - 1];
            if (last === "." || parseInt(last, 36) - 2 !== idiom.cadence[k]) bad.push(`cadence ${tag}`);
          });
          if (bars[0][0] === ".") bad.push(`slot0 ${tag}`);
          const p = decodePhrase(str);
          if (p.bars.flat().some((d) => d !== null && d < LOW)) bad.push(`low ${tag}`);
          if (p.span > idiom.span) bad.push(`span ${tag}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 60000);
  it("has phrases with rests", () => {
    expect(BANK.cards.funk["8"].some((s) => s.includes("."))).toBe(true);
  });
});

const LOCAL_PATH = new URL("../src/personal/melody-bank.local.json", import.meta.url);
const fakeLocal = { version: 2, cards: { pop: { "1": ["4|2|4|6"] } }, sources: { pop: ["symbtr", "grammar"] } };

describe("the shippable bank and the local bank", () => {
  it("ships nothing derived from SymbTr (no card with symbtr among its sources, no 'symbtr' in the file)", () => {
    const text = readFileSync(new URL("../src/personal/melody-bank.json", import.meta.url), "utf8");
    expect(text.toLowerCase()).not.toContain("symbtr");
    const bank = JSON.parse(text) as { sources: Record<string, string[]> };
    expect(Object.keys(bank.sources).sort()).toEqual(CARDS.map((c) => c.id).sort());
    for (const [id, src] of Object.entries(bank.sources)) expect(src, id).not.toContain("symbtr");
  });
  it("prefers the local file when its module is present, else the shippable one", () => {
    expect(chooseBank({ "./melody-bank.local.json": { default: fakeLocal } }, SHIP_BANK)).toBe(fakeLocal);
    expect(chooseBank({ "./melody-bank.local.json": fakeLocal }, SHIP_BANK)).toBe(fakeLocal);
    expect(chooseBank({}, SHIP_BANK)).toBe(SHIP_BANK);
  });
  it("bank uses that choice; bank-shippable never reads the local file", () => {
    const local = { "./melody-bank.local.json": { default: fakeLocal } };
    expect(selectBank("bank", local, SHIP_BANK)).toBe(fakeLocal);
    expect(selectBank("bank-shippable", local, SHIP_BANK)).toBe(SHIP_BANK);
    expect(selectBank("bank-shippable", {}, SHIP_BANK)).toBe(SHIP_BANK);
    expect(bankOf("bank-shippable")).toBe(SHIP_BANK);
    expect(bankOf("bank")).toBe(BANK);
  });
  it("BANK is the local file in a checkout that has one, else the shippable file", () => {
    if (existsSync(LOCAL_PATH)) {
      expect(BANK).not.toBe(SHIP_BANK);
      expect(BANK.sources?.mevlevi).toContain("symbtr");
    } else {
      expect(BANK).toBe(SHIP_BANK);
    }
  });
  it("entryOf and pickPhrase read the asked bank", () => {
    const ship = entryOf("mevlevi", 8, "bank-shippable")!;
    expect(ship.map((p) => p.bars)).toEqual(SHIP_BANK.cards.mevlevi["8"].map((s) => decodePhrase(s).bars));
    const sel = entryOf("mevlevi", 8, "bank")!;
    expect(sel.map((p) => p.bars)).toEqual(BANK.cards.mevlevi["8"].map((s) => decodePhrase(s).bars));
    const idiom = idiomOf({ id: "mevlevi" });
    const a = pickPhrase("mevlevi", 8, idiom, 1, lcg(4), idiom.start[0], "bank-shippable");
    expect(a).toEqual(pickPhrase("mevlevi", 8, idiom, 1, lcg(4), idiom.start[0], "bank-shippable"));
    expect(pickPhrase("mevlevi", 8, idiom, 1, lcg(4), idiom.start[0])).toEqual(pickPhrase("mevlevi", 8, idiom, 1, lcg(4), idiom.start[0], "bank"));
  });
});

describe("pickPhrase", () => {
  const sample = (id: string, hits: number, seed: number, dir: 1 | -1 = 1) => {
    const idiom = idiomOf({ id });
    const rnd = lcg(seed);
    const start = idiom.start[Math.floor(rnd() * idiom.start.length)];
    return { idiom, start, phrase: pickPhrase(id, hits, idiom, dir, rnd, start) };
  };
  it("is deterministic", () => {
    expect(sample("anatolian", 6, 5).phrase).toEqual(sample("anatolian", 6, 5).phrase);
  });
  it("returns null for an unknown card or hits", () => {
    const idiom = idiomOf({ id: "pop" });
    expect(pickPhrase("no-such", 6, idiom, 1, lcg(1), 0)).toBeNull();
    expect(pickPhrase("pop", 12, idiom, 1, lcg(1), 0)).toBeNull();
    expect(entryOf("pop", 0)).toBeNull();
  });
  it("respects span, cadence, bounds and the start", () => {
    for (const c of CARDS) {
      for (let h = 1; h <= 9; h++) {
        for (let seed = 1; seed <= 6; seed++) {
          const { idiom, phrase } = sample(c.id, h, seed * 31 + h, seed % 2 ? 1 : -1);
          expect(phrase, c.id).not.toBeNull();
          expect(phrase!.length).toBe(4);
          phrase!.forEach((bar, k) => {
            expect(bar.length).toBe(h);
            expect(bar[h - 1], `${c.id}/${h} bar ${k}`).toBe(idiom.cadence[k]);
            for (const d of bar) if (d !== null) {
              expect(d).toBeGreaterThanOrEqual(LOW);
              expect(d).toBeLessThanOrEqual(idiom.span);
            }
          });
        }
      }
    }
  }, 60000);
  it("starts on the asked degree when the bank has one", () => {
    let exact = 0;
    let total = 0;
    for (const c of CARDS) {
      const idiom = idiomOf(c);
      for (const start of idiom.start) {
        total++;
        const p = pickPhrase(c.id, 8, idiom, 1, lcg(9), start)!;
        if (p[0][0] === start) exact++;
      }
    }
    expect(exact / total).toBeGreaterThan(0.9);
  });
  it("gives a card with a direction the phrases of that direction", () => {
    for (const id of ["anatolian", "mevlevi", "persian"]) {
      const idiom = idiomOf({ id });
      for (let seed = 1; seed <= 20; seed++) {
        const rnd = lcg(seed);
        const p = pickPhrase(id, 8, idiom, 1, rnd, idiom.start[0])!;
        const mean = (b: (number | null)[]) => b.filter((d): d is number => d !== null).reduce((a, d) => a + d, 0) / b.filter((d) => d !== null).length;
        expect(mean(p[3]) - mean(p[0]), id).toBeLessThan(2.5);
      }
    }
  });
});

describe("the repeat cap of the selector", () => {
  it("repeatShare counts equal consecutive sounding degrees (rests skipped) over the moves", () => {
    expect(repeatShare([[1, 1, null, 1], [2]])).toBeCloseTo(2 / 3, 9);
    expect(repeatShare([[0, 1, 2, 1]])).toBe(0);
    expect(repeatShare([[3], [null]])).toBe(0);
  });
  it("picks a phrase with at most idiom.repeat + 0.15 repeated moves when the entry has one (else + 0.25, else any), deterministically", () => {
    let capped = 0;
    let total = 0;
    for (const c of CARDS) {
      const idiom = idiomOf(c);
      for (let h = 2; h <= 9; h++) {
        const all = entryOf(c.id, h)!;
        const inSpan = all.filter((p) => p.span <= idiom.span);
        const pool = inSpan.length ? inSpan : all;
        const cap1 = idiom.repeat + 0.15;
        const cap2 = idiom.repeat + 0.25;
        const has1 = pool.some((p) => repeatShare(p.bars) <= cap1 + 1e-9);
        const has2 = pool.some((p) => repeatShare(p.bars) <= cap2 + 1e-9);
        for (let seed = 1; seed <= 4; seed++) {
          const a = choosePhrase(c.id, h, idiom, seed % 2 ? 1 : -1, lcg(seed * 13 + h), idiom.start[seed % idiom.start.length])!;
          expect(a).toEqual(choosePhrase(c.id, h, idiom, seed % 2 ? 1 : -1, lcg(seed * 13 + h), idiom.start[seed % idiom.start.length]));
          const r = repeatShare(a.bars);
          total++;
          if (has1) {
            capped++;
            expect(r, `${c.id}/${h}`).toBeLessThanOrEqual(cap1 + 1e-9);
          } else if (has2) expect(r, `${c.id}/${h}`).toBeLessThanOrEqual(cap2 + 1e-9);
        }
      }
    }
    expect(capped / total).toBeGreaterThan(0.5);
  });
  it("the Black Sea idiom moves by step in a zigzag with few repeats", () => {
    expect(idiomOf({ id: "karadeniz" })).toMatchObject({ step: 0.85, repeat: 0.1, leaps: [2], bias: -1, span: 5, arc: 2, start: [3, 4, 2] });
  });
});

describe("phraseMotifs with the bank", () => {
  it("is the walk without the option and deterministic with it", () => {
    const idiom = idiomOf({ id: "classical" });
    const walk = (o?: { melody?: "walk" | "bank" | "bank-shippable"; card?: string }) => phraseMotifs(idiom, 6, 1, lcg(3), () => 2, o as never);
    expect(walk({ melody: "walk", card: "classical" })).toEqual(walk());
    expect(walk({ melody: "bank", card: "classical" })).toEqual(walk({ melody: "bank", card: "classical" }));
    expect(walk({ melody: "bank", card: "classical" })).not.toEqual(walk());
    expect(walk({ melody: "bank-shippable", card: "classical" })).toEqual(walk({ melody: "bank-shippable", card: "classical" }));
    expect(walk({ melody: "bank-shippable", card: "classical" })).not.toEqual(walk());
  });
  it("falls back to the walk for a card the bank does not know", () => {
    const idiom = idiomOf({ id: "no-such" });
    const a = phraseMotifs(idiom, 6, 1, lcg(3), () => 2, { melody: "bank", card: "no-such" });
    expect(a.flat().every((d) => d !== null)).toBe(true);
  });
  it("keeps the properties of the walk: bounds, cadence ends, determinism", () => {
    for (const c of CARDS) {
      const idiom = idiomOf(c);
      for (const hits of [2, 4, 6, 8]) {
        const mk = () => phraseMotifs(idiom, hits, -1, lcg(hits * 7), () => idiom.start[0], { melody: "bank", card: c.id });
        const m = mk();
        expect(m).toEqual(mk());
        expect(m.length).toBe(4);
        m.forEach((bar, k) => {
          expect(bar.length).toBe(hits);
          expect(bar[hits - 1]).toBe(idiom.cadence[k]);
          for (const d of bar) if (d !== null) {
            expect(d).toBeGreaterThanOrEqual(LOW);
            expect(d).toBeLessThanOrEqual(idiom.span);
          }
        });
      }
    }
  });
});

describe("composePiece with the bank", () => {
  const pool = ["IST", "ESB", "NAV", "DEL", "BOM", "DXB", "CAI", "LOS", "JFK", "MAD", "FCO", "NRT", "PEK", "GRU", "SIN", "ATH", "VIE", "LHR", "CDG", "MEX"].filter((a) => destinationOf(a));
  const selections = () => {
    const r = lcg(2710);
    const out: ReturnType<typeof buildRoutes>[] = [];
    while (out.length < 100) {
      const n = 3 + Math.floor(r() * 6);
      const set = new Set<string>();
      while (set.size < n) set.add(pool[Math.floor(r() * pool.length)]);
      const rs = buildRoutes([...set], ["IST", "ESB", "DEL"][Math.floor(r() * 3)]);
      if (rs.length) out.push(rs);
    }
    return out;
  };
  it("makes finite, valid notes in 100 selections, with hook notes, and rests make no note", () => {
    let differs = 0;
    let fewer = 0;
    for (const rs of selections()) {
      for (const mode of ["visited", "wish"] as const) {
        const bank = composePiece(mode, rs, { melody: "bank" });
        const walk = composePiece(mode, rs);
        expect(bank.notes.length).toBeGreaterThan(0);
        for (const n of bank.notes) {
          expect(Number.isFinite(n.t) && n.t >= 0).toBe(true);
          expect(Number.isFinite(n.d) && n.d > 0).toBe(true);
          expect(Number.isFinite(n.freq) && n.freq > 0).toBe(true);
          expect(Number.isFinite(n.vel) && n.vel >= 0).toBe(true);
          expect(n.route).toBeGreaterThanOrEqual(0);
          expect(n.route).toBeLessThan(rs.length);
        }
        if (JSON.stringify(bank.notes) !== JSON.stringify(walk.notes)) differs++;
        if (bank.notes.length < walk.notes.length) fewer++;
      }
    }
    expect(differs).toBeGreaterThan(50);
    expect(fewer).toBeGreaterThan(0); // the rests of the phrases take notes away
  }, 120000);
  it("bank-shippable composes deterministically", () => {
    for (const rs of selections().slice(0, 10)) {
      const a = composePiece("visited", rs, { melody: "bank-shippable" });
      expect(a.notes.length).toBeGreaterThan(0);
      expect(JSON.stringify(a)).toBe(JSON.stringify(composePiece("visited", rs, { melody: "bank-shippable" })));
    }
  });
  it("defaults to the walk (no option equals melody: walk)", () => {
    for (const rs of selections().slice(0, 15)) {
      expect(JSON.stringify(composePiece("visited", rs))).toBe(JSON.stringify(composePiece("visited", rs, { melody: "walk" })));
    }
  });
});
