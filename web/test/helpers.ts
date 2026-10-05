import type { DayFile, Flight } from "@collector/day-schema";

export const FROM = 1_800_000_000;

let seq = 0;
export function flight(o: Partial<Flight> & { s: Flight["s"] }): Flight {
  seq++;
  return {
    id: `f${seq}`,
    cs: `THY${seq}`,
    tk: `TK${seq}`,
    region: "EUR",
    bearing: 300,
    dep: FROM,
    arr: null,
    ...o,
  };
}

export function makeDay(partial: Partial<DayFile> = {}): DayFile {
  return {
    v: 1,
    generatedAt: FROM + 86400,
    collectingSince: FROM,
    status: { state: "ok", lastSuccessAt: FROM + 86400 },
    source: { name: "adsb.fi", url: "https://adsb.fi" },
    window: { from: FROM, to: FROM + 86400 },
    stats: { airborne: 0, flights24h: 0, destinations: 0, countries: 0, km24h: 0 },
    flights: [],
    ...partial,
  };
}
