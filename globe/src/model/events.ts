import { haversineKm } from "@collector/geo";
import type { GlobeFlight, GlobeModel } from "./globe-model";

export type EventKind = "DEPARTED" | "LANDED" | "LAST_CONTACT";

export interface FlightEvent {
  id: string;
  kind: EventKind;
  tk: string;
  from?: string;
  to?: string;
  airport?: string;
  /** unix seconds */
  at: number;
}

const RECENT_DEPARTURE_SEC = 900;
const MAX_EVENT_AGE_SEC = 900;
const TAKEOFF_ALT100 = 100;
const TAKEOFF_RADIUS_KM = 150;

function event(kind: EventKind, f: GlobeFlight, at: number, airport?: string): FlightEvent {
  return { id: `${f.id}:${kind}:${at}`, kind, tk: f.tk, from: f.from, to: f.to, airport, at };
}

/** A fresh flight only counts as departing if its first sample is low or near the origin (not a mid-air re-creation). */
function plausibleTakeoff(f: GlobeFlight, next: GlobeModel): boolean {
  if (f.alt[0] < TAKEOFF_ALT100) return true;
  const o = f.from ? next.airports[f.from] : undefined;
  return !!o && haversineKm(f.lat[0], f.lon[0], o.lat, o.lon) <= TAKEOFF_RADIUS_KM;
}

/** Events that happened between two consecutive models. None on the first load. */
export function diffEvents(prev: GlobeModel | null, next: GlobeModel): FlightEvent[] {
  if (!prev) return [];
  const before = new Map(prev.flights.map((f) => [f.id, f]));
  const out: FlightEvent[] = [];
  for (const f of next.flights) {
    const p = before.get(f.id);
    if (!p) {
      const dep = next.from + f.dep;
      if (dep >= next.generatedAt - RECENT_DEPARTURE_SEC && plausibleTakeoff(f, next)) {
        out.push(event("DEPARTED", f, dep, f.from));
      }
      continue;
    }
    if (p.status !== "AIRBORNE") continue;
    const at = next.from + f.end;
    if (at < next.generatedAt - MAX_EVENT_AGE_SEC) continue;
    if (f.status === "LANDED") out.push(event("LANDED", f, at, f.to));
    else if (f.status === "LAST_CONTACT") out.push(event("LAST_CONTACT", f, at));
  }
  return out.sort((a, b) => a.at - b.at);
}
