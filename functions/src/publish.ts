import type { DayAirport, DayFile, DaySource, DayStatus, Flight, Sample, TrackedFlight, TrackerState } from "./day-schema.js";
import { typeName } from "./aircraft-names.js";
import type { FleetInfo } from "./fleet.js";
import { haversineKm, initialBearing } from "./geo.js";
import { resolveEndpoint } from "./regions.js";
import { WINDOW, endOf } from "./tracker.js";

const round1 = (v: number) => Math.round(v * 10) / 10;
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

// Always published so the globe can mark the hub even on an empty day.
const HUB_AIRPORTS: Record<string, DayAirport> = {
  IST: { lat: 41.2613, lon: 28.742, country: "TR", name: "Istanbul Airport" },
  SAW: { lat: 40.8986, lon: 29.3092, country: "TR" },
};

function fallbackBearing(f: TrackedFlight): number {
  if (f.now) return f.now.trk;
  const first = f.samples[0];
  const last = f.samples[f.samples.length - 1];
  if (first && last && first !== last) return initialBearing(first[2], first[3], last[2], last[3]);
  return 0;
}

export const FULL_RES = 6 * 3600;
export const THIN_STEP = 180;

/** Keep every sample of the last 6 h; thin older ones to >= 180 s apart (first and last always kept). */
function thin(samples: Sample[], now: number): Sample[] {
  if (samples.length <= 2) return samples;
  const out: Sample[] = [samples[0]];
  let lastKept = samples[0][0];
  for (let i = 1; i < samples.length - 1; i++) {
    const s = samples[i];
    if (s[0] >= now - FULL_RES || s[0] - lastKept >= THIN_STEP) {
      out.push(s);
      lastKept = s[0];
    }
  }
  out.push(samples[samples.length - 1]);
  return out;
}

function toFlight(f: TrackedFlight, now: number, info?: FleetInfo): Flight {
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
    end: endOf(f),
    s: thin(f.samples, now).map(([t, alt, lat, lon]) => [t - f.dep, alt, lat, lon]),
  };
  if (f.gaps && f.gaps.length > 0) out.gaps = f.gaps.map(([a, b]) => [a - f.dep, b - f.dep]);
  if (f.arr === null && f.now) out.now = f.now;
  // Live adsb values win; the fleet db only fills what is missing.
  const known = info?.[f.icao24.toLowerCase()];
  const reg = f.reg ?? known?.reg;
  const type = f.type ?? known?.type;
  const desc = f.desc ?? (type !== undefined ? typeName(type) : undefined);
  if (reg !== undefined) out.reg = reg;
  if (type !== undefined) out.type = type;
  if (desc !== undefined) out.desc = desc;
  return out;
}

export function buildDayFile(state: TrackerState, now: number, status: DayStatus, source: DaySource, info?: FleetInfo): DayFile {
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
  const airports: Record<string, DayAirport> = { ...HUB_AIRPORTS };
  for (const f of state.flights) {
    if (!f.route) continue;
    for (const a of [f.route.origin, f.route.destination]) {
      const name = a.name ?? airports[a.iata]?.name; // never lose a name already known
      airports[a.iata] = {
        lat: round4(a.lat),
        lon: round4(a.lon),
        country: a.country,
        ...(name ? { name } : {}),
      };
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
    flights: state.flights.map((f) => toFlight(f, now, info)),
    airports,
  };
}
