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
    expect(ids("IST")).toEqual(expect.arrayContaining(["anatolian", "jazz"]));
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
  it("every card is reachable from some airport", () => {
    const seen = new Set(DESTINATIONS.flatMap((d) => ids(d.iata)));
    // TASK 2 REMOVES THIS LIST: the 13 cards of all-airports Task 1 are not on any airport list until Task 2 maps them
    const NOT_YET = new Set(["samba", "afrobeat", "bollywood", "khaleeji", "maghrebi", "russian", "thai", "chinese", "cumbia", "andean", "caucasus", "fado", "chanson"]);
    for (const c of CARDS) if (!NOT_YET.has(c.id)) expect(seen.has(c.id), c.id).toBe(true);
  });
  it("is deterministic", () => {
    expect(ids("ATL")).toEqual(ids("ATL"));
  });
});
