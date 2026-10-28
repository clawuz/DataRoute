import { describe, expect, it } from "vitest";
import { CARDS, cardsOfAirport } from "../src/personal/genres";
import { DESTINATIONS, destinationOf } from "../src/personal/destinations";

const ids = (iata: string): string[] => cardsOfAirport(iata, destinationOf(iata)?.region ?? "UNK").map((c) => c.id);

describe("destination cards by airport", () => {
  it("every airport has at least one card", () => {
    for (const d of DESTINATIONS) expect(ids(d.iata).length, d.iata).toBeGreaterThan(0);
  });
  it("Turkish regions", () => {
    expect(ids("TZX")[0]).toBe("karadeniz");
    expect(ids("ESB")[0]).toBe("icanadolu");
    expect(ids("AYT")[0]).toBe("akdeniz");
    expect(ids("ADB")[0]).toBe("zeybek");
    expect(ids("VAN")[0]).toBe("dogu");
    expect(ids("IST")).toEqual(expect.arrayContaining(["turkpop", "anatolian"]));
  });
  it("Greece, Italy, Spain, US, UK", () => {
    expect(ids("ATH")[0]).toBe("greek");
    expect(ids("FCO")[0]).toBe("italian");
    expect(ids("SVQ")[0]).toBe("flamenco");
    expect(ids("MAD")[0]).toBe("spguitar");
    expect(ids("DFW")[0]).toBe("country");
    expect(ids("ATL")[0]).toBe("rnb");
    expect(ids("JFK")).toEqual(expect.arrayContaining(["jazz", "classical"]));
    expect(ids("LHR")).toContain("celtic");
    expect(ids("EDI")).toEqual(["celtic"]);
  });
  it("the big countries and cities choose their own cards (first card, then membership)", () => {
    const first: Record<string, string> = {
      GRU: "samba", VCP: "samba", LOS: "afrobeat", PHC: "afrobeat", ABV: "westafrica", KAN: "westafrica", ACC: "westafrica",
      BOM: "bollywood", BLR: "bollywood", DEL: "hindustani", ISB: "hindustani", KHI: "hindustani",
      RUH: "khaleeji", DXB: "khaleeji", DOH: "khaleeji", KWI: "khaleeji", BAH: "khaleeji", MCT: "khaleeji",
      CMN: "maghrebi", ALG: "maghrebi", TUN: "maghrebi", CAI: "arabic", AMM: "arabic",
      SVO: "russian", LED: "russian", MSQ: "slavic", BKK: "thai", PEK: "chinese", PVG: "chinese", URC: "chinese", HKG: "chinese", TPE: "chinese", MFM: "chinese", SIN: "chinese",
      BOG: "cumbia", CCS: "salsa", PTY: "salsa", UIO: "andean", SCL: "andean", TBS: "caucasus", BUS: "caucasus", EVN: "caucasus", GYD: "caucasus",
      LIS: "fado", OPO: "fado", CDG: "chanson", LYS: "chanson", MRS: "jazz", NCE: "jazz",
    };
    for (const [a, c] of Object.entries(first)) if (DESTINATIONS.some((d) => d.iata === a)) expect(ids(a)[0], a).toBe(c);
    const more: Record<string, string[]> = {
      GRU: ["bossa", "funk"], LOS: ["westafrica"], ABV: ["afrobeat"], ACC: ["afrobeat"], BOM: ["hindustani"], DEL: ["bollywood"], ISB: ["bollywood"],
      RUH: ["arabic"], CMN: ["arabic", "flamenco"], SVO: ["slavic"], MSQ: ["russian"], BKK: ["gamelan"], PEK: ["eastasia"], URC: ["centralasia"], HKG: ["pop"],
      SIN: ["gamelan", "pop"], BOG: ["salsa"], CCS: ["cumbia"], UIO: ["cumbia"], SCL: ["tango"], TBS: ["slavic"], EVN: ["anatolian"], GYD: ["centralasia", "anatolian"],
      LIS: ["bossa"], CDG: ["romantic", "jazz"], MRS: ["chanson", "romantic"],
    };
    for (const [a, cs] of Object.entries(more)) expect(ids(a), a).toEqual(expect.arrayContaining(cs));
  });
  it("every card is reachable from some airport", () => {
    const seen = new Set(DESTINATIONS.flatMap((d) => ids(d.iata)));
    for (const c of CARDS) expect(seen.has(c.id), c.id).toBe(true);
  });
  it("is deterministic", () => {
    expect(ids("ATL")).toEqual(ids("ATL"));
  });
});
