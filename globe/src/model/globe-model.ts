import type { DayAirport, DayFile, Flight, FlightEnd } from "@collector/day-schema";
import { haversineKm } from "@collector/geo";
import { buildModel, type FlightRec, type Model } from "@web/data/model";

export interface PlannedRoute {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distKm: number;
}

/** All times are seconds relative to `window.from` (like FlightRec). */
export interface GlobeFlight extends FlightRec {
  status: FlightEnd;
  gaps: [number, number][];
  lastT: number;
  trk?: number;
  planned?: PlannedRoute;
  /** aircraft info from the collector (all optional) */
  reg?: string;
  type?: string;
  desc?: string;
}

export interface GlobeModel extends Model {
  flights: GlobeFlight[];
  airports: Record<string, DayAirport>;
  /** number of flights using each known airport */
  traffic: Map<string, number>;
}

/** Legacy rows without `end`: arr set means we lost contact — never claim LANDED. */
export function statusOf(f: Pick<Flight, "end" | "arr">): FlightEnd {
  return f.end ?? (f.arr === null ? "AIRBORNE" : "LAST_CONTACT");
}

export function buildGlobeModel(day: DayFile): GlobeModel {
  const base = buildModel(day);
  const raw = new Map(day.flights.map((f) => [f.id, f]));
  const airports = day.airports ?? {};
  const traffic = new Map<string, number>();

  const flights = base.flights.map((fr): GlobeFlight => {
    const f = raw.get(fr.id)!;
    const a = f.from ? airports[f.from] : undefined;
    const b = f.to ? airports[f.to] : undefined;
    for (const code of [f.from, f.to]) {
      if (code && airports[code]) traffic.set(code, (traffic.get(code) ?? 0) + 1);
    }
    const planned: PlannedRoute | undefined =
      a && b
        ? { fromLat: a.lat, fromLon: a.lon, toLat: b.lat, toLon: b.lon, distKm: haversineKm(a.lat, a.lon, b.lat, b.lon) }
        : undefined;
    return {
      ...fr,
      status: statusOf(f),
      gaps: (f.gaps ?? []).map(([s, e]) => [fr.dep + s, fr.dep + e] as [number, number]),
      lastT: fr.t[fr.t.length - 1],
      // collector writes trk 0 when unknown; a report with gs <= 0 is treated as no report
      ...(f.now && f.now.gs > 0 ? { trk: f.now.trk } : {}),
      ...(planned ? { planned } : {}),
      ...(f.reg ? { reg: f.reg } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.desc ? { desc: f.desc } : {}),
    };
  });

  return { ...base, flights, airports, traffic };
}
