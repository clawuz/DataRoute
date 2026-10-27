import { describe, expect, it } from "vitest";
import { CARDS, planCards, type CardPlan, type GenreCard } from "../src/personal/genres";
import { EPISODE_CAP, VERSE_SHORT_BLOCK, episodeAt, episodeCards } from "../src/personal/episodes";
import { buildRoutes } from "../src/personal/routes";
import { composePiece, type PersonalNote } from "../src/personal/compose";
import { heightOf, velScale } from "../src/personal/altitude-feel";
import { routeHash } from "../src/audio/theory";
import destinations from "../src/personal/destinations.json";

// the altitude of the flight scales the loudness of a note (altitude-feel.ts): the spotlight tests compare the velocity without it
const plain = (n: PersonalNote, distKm: number): number => n.vel / velScale(heightOf(n.alt, distKm));

const card = (id: string): GenreCard => CARDS.find((c) => c.id === id)!;
const plan = (main: string, per: string[]): CardPlan => ({ main: card(main), home: card(main), perRoute: per.map(card) });

describe("episodeCards", () => {
  it("is empty when no route is coloured", () => {
    expect(episodeCards(plan("anatolian", ["anatolian", "anatolian"]))).toEqual([]);
  });
  it("orders the colours by their number of routes, most first, and counts only coloured routes", () => {
    const got = episodeCards(plan("anatolian", ["eastasia", "westafrica", "eastasia", "anatolian", "eastasia", "westafrica"]));
    expect(got.map((c) => c.id)).toEqual(["eastasia", "westafrica"]);
  });
  it("keeps at most six colours and breaks ties by the hash of the card id the same way every time", () => {
    // (the input has eight different coloured cards: the cap is what the property is about)
    const per = ["eastasia", "westafrica", "persian", "tango", "salsa", "greek", "nordic", "celtic"];
    const a = episodeCards(plan("anatolian", per)).map((c) => c.id);
    expect(a.length).toBe(EPISODE_CAP);
    expect(EPISODE_CAP).toBe(6);
    expect(episodeCards(plan("anatolian", [...per].reverse())).map((c) => c.id)).toEqual(a);
  });
});

describe("episodeAt with 4-6 cards: two-bar blocks", () => {
  const E6 = ["eastasia", "westafrica", "persian", "tango", "salsa", "greek"].map(card);
  const pattern = (n: number): (string | null)[] => {
    const cards = E6.slice(0, n);
    return [0, 1, 2, 3, 4, 5, 6, 7].map((blk) => episodeAt(8 + blk * VERSE_SHORT_BLOCK, 8, cards).card?.id ?? null);
  };
  it("plays eight blocks: [home, c0..cN-1] filled by cycling and ending with home when it fits", () => {
    expect(VERSE_SHORT_BLOCK).toBe(2);
    expect(pattern(4)).toEqual([null, "eastasia", "westafrica", "persian", "tango", "eastasia", "westafrica", null]);
    expect(pattern(5)).toEqual([null, "eastasia", "westafrica", "persian", "tango", "salsa", "eastasia", null]);
    expect(pattern(6)).toEqual([null, "eastasia", "westafrica", "persian", "tango", "salsa", "greek", null]);
  });
  it("holds a card for both bars of its block, numbers the blocks 0-7 and marks the last bar of every block", () => {
    for (const n of [4, 5, 6]) {
      const cards = E6.slice(0, n);
      for (let rel = 0; rel < 16; rel++) {
        const e = episodeAt(8 + rel, 8, cards);
        expect(e.block, `${n} cards, bar ${rel}`).toBe(Math.floor(rel / 2));
        expect(e.blockEnd).toBe(rel % 2 === 1);
        expect(e.card?.id ?? null).toBe(pattern(n)[Math.floor(rel / 2)]);
      }
    }
  });
  it("is home with no block outside the verse", () => {
    for (const n of [4, 6]) for (const b of [0, 7, 24, 40, 63]) expect(episodeAt(b, 8, E6.slice(0, n))).toEqual({ card: null, blockEnd: false, block: -1 });
  });
});

describe("episodeAt", () => {
  const E = [card("eastasia"), card("westafrica"), card("persian")];
  const ids = (n: number): (string | null)[] => {
    const cards = E.slice(0, n);
    return [8, 12, 16, 20].map((b) => episodeAt(b, 8, cards).card?.id ?? null);
  };
  it("plays the verse as A A A A, A B A B, A B A C or A B C D", () => {
    expect(ids(0)).toEqual([null, null, null, null]);
    expect(ids(1)).toEqual([null, "eastasia", null, "eastasia"]);
    expect(ids(2)).toEqual([null, "eastasia", null, "westafrica"]);
    expect(ids(3)).toEqual([null, "eastasia", "westafrica", "persian"]);
  });
  it("holds a card for the four bars of its block and marks the last bar", () => {
    const at = (b: number) => episodeAt(b, 8, E);
    expect([12, 13, 14, 15].map((b) => at(b).card?.id)).toEqual(["eastasia", "eastasia", "eastasia", "eastasia"]);
    expect([8, 9, 10, 11, 12, 15, 19, 20, 23].map((b) => at(b).blockEnd)).toEqual([false, false, false, true, false, true, true, false, true]);
    expect([8, 11, 12, 23].map((b) => at(b).block)).toEqual([0, 0, 1, 3]);
  });
  it("is home with no block outside the verse", () => {
    for (const b of [0, 7, 24, 40, 63]) expect(episodeAt(b, 8, E)).toEqual({ card: null, blockEnd: false, block: -1 });
  });
  it("works on a real plan", () => {
    const p = planCards("visited", buildRoutes(["NRT", "LOS", "GRU", "LHR"], "IST"));
    for (const c of episodeCards(p)) expect(c).not.toBe(p.main);
  });
});

// GOLDEN: regression guard for the episodes and the fills.
// re-captured at mevlevi card, ney in icanadolu, no piano in folk cards; earlier at the flight runs; earlier at the altitude sets loudness, brightness and room; earlier at gestures: review fixes (no unisons, tremolo capped, lighter density); earlier at gestures: wider coverage; earlier at gestures: the instruments are played with their own gestures; earlier at all airports: a card list for every big country and city; earlier at the main card follows the destinations; earlier at airport cards (the Mediterranean golden uses ADA); earlier at destination styles: airport-level cards; earlier at the journey (the sound of Istanbul and of the destination); earlier at the quiet intro (no hat, a late soft pluck); earlier at the call-and-response step (the chorus answer), earlier at the length-by-rank step (pad, bass and hook last as long as the rank of their route says: 0.7-1.3x, 0.8-1.2x), earlier at music B0 (the hook is an original melody now, with a cadence plan, a motif return and an approach to the cadence from 4 hits); the invariant "only hook routes' notes changed" was checked against the code before
const GOLDEN_NO_COLOUR: [string, "visited" | "wish", number][] = [
  // [places joined by ",", mode, hash of JSON.stringify(notes)]; none of these has a coloured route (episodeCards = [])
  ["~ESB,ASR,KYA", "visited", 2460335051],
  ["~TZX,RZV,OGU", "wish", 921627897],
  ["~VAN,ERZ,ERC", "wish", 3300151599],
  ["~AYT,GZP,ADA", "visited", 3242087402],
  ["ESB", "visited", 2163962449],
  ["LHR", "wish", 469582247],
  ["~ADB,BJV,DNZ", "wish", 775709030],
];
// pieces without colours that are big enough for drums (5-8 routes: kick and backbeat exist), so a fill that is not gated on the
// episodes shows up; hashes re-captured at music B0 (see above). [places, home ("" = a journey without home), mode, hash]
const GOLDEN_NO_COLOUR_DRUMS: [string, string, "visited" | "wish", number][] = [
  ["IKA,MHD,OMH,SYZ", "TBZ", "visited", 3922379011], // 5 routes
  ["MHD,OMH,SYZ,TBZ", "IKA", "visited", 1269031955], // 5 routes
  ["IKA,OMH,SYZ,TBZ", "MHD", "wish", 1214456567], // 5 routes
  ["ALA,CIT,GUW,HSA", "", "visited", 1194487810], // 6 routes
  ["IKA,MHD,OMH,SYZ", "", "wish", 398410343], // 6 routes
  ["ALA,CIT,GUW,HSA,KGF,NQZ", "SCO", "visited", 1918553114], // 7 routes
  ["IKA,MHD,OMH,SYZ,TBZ", "", "wish", 4161158795], // 8 routes
  ["ALA,CIT,GUW,HSA,KGF", "", "visited", 665079681], // 8 routes
];
const GOLDEN_OUTSIDE_VERSE: [string, "visited" | "wish", number][] = [
  // [places joined by ",", mode, hash of JSON.stringify(notes outside bars 8-23)]; each has episode cards (the first two have five, which now tell the verse in two-bar blocks: the bars outside the verse are the same)
  ["NRT,LOS,GRU,LHR,DEL,CAI", "visited", 975746057],
  ["NRT,LOS,GRU,LHR,DEL,CAI", "wish", 1357018070],
  ["IKA,NRT,JFK,LOS,SYD,GRU", "visited", 3314495757],
];
// a leading "~" in places: a journey without home (the first place is where the trip starts)
const routesOf = (places: string, home = "IST"): ReturnType<typeof buildRoutes> =>
  places.startsWith("~") ? buildRoutes(places.slice(1).split(","), undefined) : buildRoutes(places.split(","), home || undefined);
const outside = (p: ReturnType<typeof composePiece>): typeof p.notes => {
  const bar = 240 / p.bpm;
  return p.notes.filter((n) => n.t < 8 * bar || n.t >= 24 * bar);
};

describe("episodes in a piece: what must not change", () => {
  it("has golden hashes for both kinds of piece", () => {
    expect(GOLDEN_NO_COLOUR.length).toBeGreaterThanOrEqual(4);
    expect(GOLDEN_OUTSIDE_VERSE.length).toBeGreaterThanOrEqual(3);
  });
  it("regression guard: a piece without colours stays the piece it is", () => {
    for (const [places, mode, h] of GOLDEN_NO_COLOUR) {
      expect(episodeCards(planCards(mode, routesOf(places))), places).toEqual([]); // the premise of the golden: no coloured route
      expect(routeHash(JSON.stringify(composePiece(mode, routesOf(places)).notes)), places).toBe(h);
    }
  });
  it("regression guard: a piece without colours that has drums (5-8 routes) stays the piece it is: no bridge fills", () => {
    const sizes = new Set<number>();
    for (const [places, home, mode, h] of GOLDEN_NO_COLOUR_DRUMS) {
      const rs = routesOf(places, home);
      expect(episodeCards(planCards(mode, rs)), places).toEqual([]);
      expect(rs.length, places).toBeGreaterThanOrEqual(5);
      sizes.add(rs.length);
      expect(routeHash(JSON.stringify(composePiece(mode, rs).notes)), `${places} home ${home || "none"} ${mode}`).toBe(h);
    }
    for (const k of [5, 6, 8]) expect(sizes.has(k), `a piece of ${k} routes`).toBe(true);
  });
  it("regression guard: every note outside the verse stays the note it is", () => {
    for (const [places, mode, h] of GOLDEN_OUTSIDE_VERSE) expect(routeHash(JSON.stringify(outside(composePiece(mode, routesOf(places))))), places).toBe(h);
  });
});

describe("episodes in a piece: what changes in the verse", () => {
  const places = "BOM,CMN,GRU,LHR,DEL,CAI";
  const routes = routesOf(places);
  const p = composePiece("visited", routes);
  const bar = 240 / p.bpm;
  const inBars = (a: number, b: number) => p.notes.filter((n) => n.show !== false && n.t >= a * bar - 0.05 && n.t < b * bar - 0.05);
  it("records the episode cards in the style", () => {
    const eps = episodeCards(planCards("visited", routes)).map((c) => c.id);
    expect(eps.length).toBeGreaterThanOrEqual(1);
    expect(p.style.episodes).toEqual(eps);
  });
  it("records nothing in the style of a piece without episodes (its style is the style of before)", () => {
    for (const [places, home, mode] of GOLDEN_NO_COLOUR_DRUMS) expect("episodes" in composePiece(mode, routesOf(places, home)).style, places).toBe(false);
    expect("episodes" in composePiece("visited", routesOf("~ESB,ASR,KYA")).style).toBe(false);
  });
  it("ends every verse block with a drum fill: a kick on beat 3 and a backbeat on beat 3.5", () => {
    const beat = bar / 4;
    // the drum fill is played by the drums: a flight run of the hook (altitude-feel.ts) also has a short note at beat 3.5
    const hooks = rolesOf(routes);
    const fill = (b: number): number => inBars(b, b + 1).filter((n) => hooks[n.route] !== "hook" && Math.abs(((n.t - b * bar) / beat) - 3.5) < 0.05 && n.d < beat * 0.3).length;
    expect([11, 15, 19, 23].filter((b) => fill(b) > 0).length).toBeGreaterThanOrEqual(2);
    expect(fill(9) + fill(10)).toBe(0);
  });
  it("is deterministic and keeps the invariants (no negative times, no NaN, notes of a route in order)", () => {
    expect(JSON.stringify(composePiece("visited", routes).notes)).toBe(JSON.stringify(p.notes));
    for (const n of p.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite)).toBe(true);
    }
  });
});

// the roles of the routes, recomputed the way composePiece deals them (longest route first), so the tests can tell a bass from a hat
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
/** the groove of a card as composePiece builds it: the hit places and the strong ones (first, or accent >= 1.1; at most four), in beats */
const grooveStarts = (c: GenreCard): { hits: number[]; strong: number[] } => {
  const total = c.cell.reduce((x, y) => x + Math.abs(y), 0);
  let at = 0;
  const hits: { start: number; accent: number }[] = [];
  c.cell.forEach((u, k) => {
    if (u > 0) hits.push({ start: (at / total) * 4, accent: c.accent?.[k] || 1 });
    at += Math.abs(u);
  });
  return { hits: hits.map((h) => h.start), strong: hits.filter((h, k) => k === 0 || h.accent >= 1.1).slice(0, 4).map((h) => h.start) };
};
const SPOT_ON = 1.15;
const SPOT_OFF = 0.85;
const meanOf = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const quarter = (x: number): number => Math.round(x * 4) / 4 + 0;

/** a composed piece and what the tests read of it: the bars, the onsets of a route in a bar (in beats), the card of a bar */
const pieceOf = (places: string, mode: "visited" | "wish") => {
  const rs = routesOf(places);
  const pl = planCards(mode, rs);
  const p = composePiece(mode, rs);
  const eps = episodeCards(pl);
  const bar = 240 / p.bpm;
  const beat = bar / 4;
  const barNotes = (route: number, b: number) => p.notes.filter((n) => n.route === route && n.show !== false && n.t >= b * bar - 0.05 && n.t < (b + 1) * bar - 0.05);
  const onsets = (route: number, b: number): number[] => barNotes(route, b).map((n) => (n.t - b * bar) / beat).sort((x, y) => x - y);
  return { rs, pl, p, eps, role: rolesOf(rs), barNotes, onsets, blockCard: (b: number): GenreCard | null => episodeAt(b, 8, eps).card };
};
/** the kick: beat 1 and the exact strong places of the card in an episode block (the bass plays them too), beats 1 and 3 at home, beat 4 in a fill bar */
const checkKick = (places: string, mode: "visited" | "wish"): void => {
  const { role, onsets, blockCard } = pieceOf(places, mode);
  const r = role.indexOf("kick");
  expect(r).toBeGreaterThanOrEqual(0);
  for (let blk = 0; blk < 4; blk++) for (const b of [0, 1, 2, 3].map((k) => 8 + blk * 4 + k)) {
    const c = blockCard(b);
    const want = c ? [...new Set([0, ...grooveStarts(c).strong])] : [0, 2];
    if (b % 4 === 3) { if (!want.includes(3)) want.push(3); }
    want.sort((x, y) => x - y);
    const got = onsets(r, b);
    expect(got.length, `bar ${b}`).toBe(want.length);
    // a kick is a tight voice: humanize moves it a few milliseconds at most (well under 0.03 beat)
    got.forEach((x, k) => expect(Math.abs(x - want[k]), `${places} bar ${b} kick ${k}`).toBeLessThan(0.03));
  }
};

describe("episodes in a piece: the voices and the groove follow the episode card", () => {
  const places = "ADD,AMM,BEY,ALP,AQJ,CAI,HEL,KUL";
  const rs = routesOf(places);
  const pl = planCards("visited", rs);
  const p = composePiece("visited", rs);
  const role = rolesOf(rs);
  const eps = episodeCards(pl);
  const bar = 240 / p.bpm;
  const beat = bar / 4;
  const blockCard = (b: number): GenreCard | null => episodeAt(b, 8, eps).card;
  const barNotes = (route: number, b: number) => p.notes.filter((n) => n.route === route && n.show !== false && n.t >= b * bar - 0.05 && n.t < (b + 1) * bar - 0.05);
  const onsets = (route: number, b: number): number[] => barNotes(route, b).map((n) => (n.t - b * bar) / beat);
  const cardOf = (b: number): GenreCard => blockCard(b) ?? pl.main;
  const barsOfBlock = (blk: number): number[] => [0, 1, 2].map((k) => 8 + blk * 4 + k); // the three bars before the fill bar
  const first = (r: Role): number => role.indexOf(r);

  it("deals one route to each role, and the episodes are not the main card (the checks below are not vacuous)", () => {
    expect(new Set(role).size).toBe(7);
    expect(eps.length).toBeGreaterThanOrEqual(2);
    expect(eps.every((c) => c !== pl.main)).toBe(true);
    // at least one episode card has other strong places and other hit count than the main card
    const m = grooveStarts(pl.main);
    expect(eps.some((c) => grooveStarts(c).strong.join() !== m.strong.join())).toBe(true);
    expect(eps.some((c) => grooveStarts(c).hits.length !== 8)).toBe(true);
  });
  it("the bass plays the strong places of the episode card in an episode block and those of the main card in the home block", () => {
    const r = first("bass");
    for (let blk = 0; blk < 4; blk++) for (const b of barsOfBlock(blk)) {
      const want = grooveStarts(cardOf(b)).strong;
      const got = onsets(r, b);
      expect(got.length, `bar ${b}`).toBe(want.length);
      got.forEach((x, k) => expect(Math.abs(x - want[k]), `bar ${b} note ${k}`).toBeLessThan(0.15));
    }
  });
  it("the kick plays beat 1 and the exact strong places in an episode block, beats 1 and 3 at home; the fill adds beat 4", () => {
    checkKick(places, "visited");
  });
  it("the hat plays the hit places of the episode figure in an episode block and eight eighths at home", () => {
    const r = first("hat");
    for (let blk = 0; blk < 4; blk++) for (const b of barsOfBlock(blk)) {
      const c = blockCard(b);
      expect(barNotes(r, b).length, `bar ${b}`).toBe(c ? grooveStarts(c).hits.length : 8);
    }
  });
  it("the voices of the episode card come forward (x1.15) and the others step back (x0.85) against the home block of the verse", () => {
    let checked = 0;
    for (const role2 of ["pad", "pluck"] as Role[]) {
      const r = first(role2);
      const home = meanOf([0, 1, 2, 3].flatMap((k) => barNotes(r, 8 + k)).map((n) => plain(n, rs[r].distKm)));
      for (let blk = 1; blk < 4; blk++) {
        const c = blockCard(8 + blk * 4);
        if (!c) continue;
        const mean = meanOf([0, 1, 2, 3].flatMap((k) => barNotes(r, 8 + blk * 4 + k)).map((n) => plain(n, rs[r].distKm)));
        const want = pl.perRoute[r] === c ? SPOT_ON : SPOT_OFF;
        expect(mean / home, `${role2} in block ${blk}`).toBeGreaterThan(want - 0.06);
        expect(mean / home, `${role2} in block ${blk}`).toBeLessThan(want + 0.06);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});

describe("episodes in a piece: a tune that runs on from a home block into an episode block", () => {
  const rs = routesOf("BOM,CMN,GRU,LHR,DEL,CAI");
  const pl = planCards("visited", rs);
  const p = composePiece("visited", rs, { tunes: true });
  const role = rolesOf(rs);
  const bar = 240 / p.bpm;
  const r = role.indexOf("hook");
  const mean = (a: number, b: number): number => meanOf(p.notes.filter((n) => n.route === r && n.show !== false && n.t >= a * bar - 0.05 && n.t < b * bar - 0.05).map((n) => plain(n, rs[r].distKm)));
  it("has a tune and an episode in the second block of the verse", () => {
    expect(p.style.tune).toBeTruthy();
    expect(episodeAt(12, 8, episodeCards(pl)).card).toBeTruthy();
  });
  it("spotlights the notes by the bar they sound in: x0.85 (or x1.15) in bars 12-15 against bars 8-11", () => {
    const c = episodeAt(12, 8, episodeCards(pl)).card!;
    const want = pl.perRoute[r] === c ? SPOT_ON : SPOT_OFF;
    expect(mean(12, 16) / mean(8, 12)).toBeGreaterThan(want - 0.06);
    expect(mean(12, 16) / mean(8, 12)).toBeLessThan(want + 0.06);
  });
});

describe("episodes in a piece: the kick plays with the bass on a card whose strong places are off the sixteenth grid", () => {
  const places = "ABV,SVQ,ATH,SKG,TZX,RZV,LOS";
  it("has the West African bell and the flamenco compás among the episodes (their strong beats sit at 1.667 and 3.333)", () => {
    const { eps } = pieceOf(places, "wish");
    expect(eps.map((c) => c.id)).toEqual(expect.arrayContaining(["westafrica", "flamenco"]));
    expect(eps.some((c) => grooveStarts(c).strong.some((x) => Math.abs(quarter(x) - x) > 0.05))).toBe(true);
  });
  it("the kick hits the exact strong places, not the nearest sixteenth", () => {
    checkKick(places, "wish");
  });
});

/** the slots of a card's figure stretched to four beats, each hit at its start plus the swing of the odd slots (the hook's rule) */
const swungHits = (c: GenreCard, swing: number): number[] => {
  const total = c.cell.reduce((x, y) => x + Math.abs(y), 0);
  let at = 0;
  const out: number[] = [];
  c.cell.forEach((u, k) => {
    const len = (Math.abs(u) / total) * 4;
    if (u > 0) out.push(at + (k % 2 ? swing * 0.33 * len : 0));
    at += len;
  });
  return out;
};

describe("episodes in a piece: a card with rests in its figure, with swing, and a hook without a tune", () => {
  // the gamelan cycle (1, rest, 1, 1) is the second episode card here: block 2 of the verse, bars 16-19; the hook plays bars 16 and 17
  const places = "KUL,CGK,ICN,CDG,FCO,SYD,ATH";
  const { p, eps, role, onsets, blockCard } = pieceOf(places, "wish");
  const gam = eps.find((c) => c.id === "gamelan")!;
  const swing = gam?.swing ?? p.style.swing;
  const want = gam ? swungHits(gam, swing) : [];
  it("has no tune, swings, and has the gamelan cycle as an episode in bars 16-19 (the checks below are not vacuous)", () => {
    expect(p.style.tune).toBeUndefined();
    expect(gam).toBeTruthy();
    expect(swing).toBeGreaterThan(0);
    expect(gam.cell.some((u) => u < 0)).toBe(true);
    expect([16, 17, 18, 19].every((b) => blockCard(b) === gam)).toBe(true);
    expect(new Set(role).size).toBe(7);
  });
  it("the hat swings the same places as the hook: the odd slots of the figure, not the odd hits", () => {
    const r = role.indexOf("hat");
    for (const b of [16, 17, 18]) {
      const got = onsets(r, b);
      expect(got.length, `bar ${b}`).toBe(want.length);
      // the hat is a tight voice (a few milliseconds of humanize, under 0.025 beat); the odd-hit swing would be 0.066 beat off here
      got.forEach((x, k) => expect(Math.abs(x - want[k]), `bar ${b} hat ${k}`).toBeLessThan(0.025));
    }
  });
  it("the hook without a tune plays the hit places of the episode figure, swung like the hat", () => {
    const r = role.indexOf("hook");
    for (const b of [16, 17]) {
      const got = onsets(r, b);
      expect(got.length, `bar ${b}`).toBe(want.length);
      got.forEach((x, k) => expect(Math.abs(x - want[k]), `bar ${b} hook ${k}`).toBeLessThan(0.045));
    }
  });
});

describe("episodes in a piece: every note of many pieces is a number", () => {
  // a deterministic sweep: 2-8 places from the destination list, both modes, home Istanbul, another place or none
  const codes = (destinations as { i: string }[]).map((d) => d.i);
  const pick = (k: number): string => codes[routeHash("sweep" + k) % codes.length];
  it("has finite time, length, pitch and loudness in about fifty pieces with and without episodes, with and without a tune", () => {
    let withEp = 0, noTuneEp = 0;
    for (let s = 0; s < 50; s++) {
      const k = 2 + (s % 7);
      const pl = [...new Set(Array.from({ length: k }, (_, j) => pick(s * 13 + j)))];
      const home = s % 3 === 0 ? undefined : s % 3 === 1 ? "IST" : pick(s * 13 + 99);
      for (const mode of ["visited", "wish"] as const) {
        const rs = buildRoutes(pl.filter((x) => x !== home), home);
        const p = composePiece(mode, rs);
        if (episodeCards(planCards(mode, rs)).length && rs.length > 1) { withEp++; if (!p.style.tune) noTuneEp++; }
        for (const n of p.notes) expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite), `${pl.join(",")} home ${home ?? "none"} ${mode}`).toBe(true);
      }
    }
    expect(withEp).toBeGreaterThanOrEqual(20);
    expect(noTuneEp).toBeGreaterThanOrEqual(5);
  });
});
