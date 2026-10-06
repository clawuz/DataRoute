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

function event(kind: EventKind, f: GlobeFlight, at: number, airport?: string): FlightEvent {
  return { id: `${f.id}:${kind}`, kind, tk: f.tk, from: f.from, to: f.to, airport, at };
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
      if (dep >= next.generatedAt - RECENT_DEPARTURE_SEC) out.push(event("DEPARTED", f, dep, f.from));
      continue;
    }
    if (p.status === "AIRBORNE" && f.status === "LANDED") out.push(event("LANDED", f, next.from + f.end, f.to));
    else if (p.status === "AIRBORNE" && f.status === "LAST_CONTACT") out.push(event("LAST_CONTACT", f, next.from + f.end));
  }
  return out.sort((a, b) => a.at - b.at);
}
