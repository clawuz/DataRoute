import type { DayFile, DaySource, DayStatus, Flight, TrackedFlight, TrackerState } from "./day-schema.js";
import { haversineKm, initialBearing } from "./geo.js";
import { resolveEndpoint } from "./regions.js";
import { WINDOW } from "./tracker.js";

const round1 = (v: number) => Math.round(v * 10) / 10;

function fallbackBearing(f: TrackedFlight): number {
  if (f.now) return f.now.trk;
  const first = f.samples[0];
  const last = f.samples[f.samples.length - 1];
  if (first && last && first !== last) return initialBearing(first[2], first[3], last[2], last[3]);
  return 0;
}

function toFlight(f: TrackedFlight): Flight {
  const ep = f.route ? resolveEndpoint(f.route) : null;
  const out: Flight = {
    id: f.id,
    cs: f.cs,
    tk: f.cs.replace(/^THY/, "TK"),
    from: f.route?.origin.iata,
    to: f.route?.destination.iata,
    region: ep?.region ?? "UNK",
    bearing: round1(ep ? ep.bearing : fallbackBearing(f)),
    dep: f.dep,
    arr: f.arr,
    s: f.samples.map(([t, alt, lat, lon]) => [t - f.dep, alt, lat, lon]),
  };
  if (f.arr === null && f.now) out.now = f.now;
  return out;
}

export function buildDayFile(state: TrackerState, now: number, status: DayStatus, source: DaySource): DayFile {
  const destinations = new Set<string>();
  const countries = new Set<string>();
  let km = 0;
  for (const f of state.flights) {
    if (f.route) {
      const { other } = resolveEndpoint(f.route);
      destinations.add(other.iata);
      countries.add(other.country);
    }
    for (let i = 1; i < f.samples.length; i++) {
      const [, , la1, lo1] = f.samples[i - 1];
      const [, , la2, lo2] = f.samples[i];
      km += haversineKm(la1, lo1, la2, lo2);
    }
  }
  return {
    v: 1,
    generatedAt: now,
    collectingSince: state.collectingSince,
    status,
    source,
    window: { from: now - WINDOW, to: now },
    stats: {
      airborne: state.flights.filter((f) => f.arr === null).length,
      flights24h: state.flights.length,
      destinations: destinations.size,
      countries: countries.size,
      km24h: Math.round(km),
    },
    flights: state.flights.map(toFlight),
  };
}
