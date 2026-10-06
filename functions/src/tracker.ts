import type { AircraftState, FlightEnd, TrackedFlight, TrackerState } from "./day-schema.js";
import { haversineKm } from "./geo.js";

export const GAP = 45 * 60;
export const WINDOW = 86400;
export const RESUME_WINDOW = 14 * 3600;
export const LANDED_KM = 150;
export const LANDED_ALT100 = 150; // 15,000 ft
export const NO_ROUTE_LANDED_ALT100 = 30; // 3,000 ft
export const MAX_SPEED_KMH = 950;
export const JUMP_MARGIN_KM = 100;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function emptyState(now: number): TrackerState {
  return { v: 1, collectingSince: now, lastSuccessAt: 0, flights: [] };
}

/** True when the flight's last observed point is consistent with having landed. */
export function isLanded(f: TrackedFlight): boolean {
  const last = f.samples[f.samples.length - 1];
  if (!last) return false;
  const dest = f.route?.destination;
  if (dest) return last[1] < LANDED_ALT100 && haversineKm(last[2], last[3], dest.lat, dest.lon) <= LANDED_KM;
  return last[1] < NO_ROUTE_LANDED_ALT100;
}

/** Explicit `end`, else derived (legacy rows that only carry `arr`). */
export function endOf(f: TrackedFlight): FlightEnd {
  if (f.end) return f.end;
  if (f.arr === null) return "AIRBORNE";
  return isLanded(f) ? "LANDED" : "LAST_CONTACT";
}

export function step(prev: TrackerState, aircraft: AircraftState[], now: number): TrackerState {
  const flights: TrackedFlight[] = prev.flights.map((f) => {
    const copy: TrackedFlight = { ...f, samples: [...f.samples] };
    if (f.gaps) copy.gaps = f.gaps.map((g) => [g[0], g[1]] as [number, number]);
    return copy;
  });
  const open = new Map<string, TrackedFlight>(); // still being tracked
  const pending = new Map<string, TrackedFlight>(); // LAST_CONTACT, may still resume
  for (const f of flights) {
    if (f.arr === null) open.set(f.icao24, f);
    else if (f.end === "LAST_CONTACT" && now - f.lastContact <= RESUME_WINDOW) {
      const cur = pending.get(f.icao24);
      if (!cur || f.lastContact > cur.lastContact) pending.set(f.icao24, f);
    }
  }

  const settle = (f: TrackedFlight, end: FlightEnd, at: number) => {
    f.end = end;
    f.arr = at;
    delete f.now;
    open.delete(f.icao24);
    if (end === "LAST_CONTACT") pending.set(f.icao24, f);
  };
  const finalize = (f: TrackedFlight) => {
    if (isLanded(f)) settle(f, "LANDED", f.lastContact);
    else settle(f, "LAST_CONTACT", f.lastContact);
  };
  const tryResume = (a: AircraftState): TrackedFlight | undefined => {
    const p = pending.get(a.icao24);
    if (!p || p.cs !== a.cs) return undefined;
    const dt = a.t - p.lastContact;
    if (dt < 0 || dt > RESUME_WINDOW) return undefined;
    const last = p.samples[p.samples.length - 1];
    if (!last) return undefined;
    const reach = (MAX_SPEED_KMH * dt) / 3600 + JUMP_MARGIN_KM;
    if (haversineKm(last[2], last[3], a.lat, a.lon) > reach) return undefined;
    pending.delete(a.icao24);
    p.end = "AIRBORNE";
    p.arr = null;
    (p.gaps ??= []).push([p.lastContact, a.t]);
    open.set(a.icao24, p);
    return p;
  };

  for (const a of aircraft) {
    let f = open.get(a.icao24);
    if (f && f.cs !== a.cs) {
      finalize(f); // new callsign = new flight
      f = undefined;
    }
    if (f && a.t - f.lastContact > GAP) {
      finalize(f);
      f = undefined;
    }
    if (!f) f = tryResume(a);
    if (a.onGround) {
      if (f) settle(f, "LANDED", a.t);
      continue;
    }
    if (!f) {
      f = {
        id: `${a.icao24}-${a.t}`,
        icao24: a.icao24,
        cs: a.cs,
        dep: a.t,
        arr: null,
        end: "AIRBORNE",
        lastContact: a.t,
        samples: [],
      };
      flights.push(f);
      open.set(a.icao24, f);
    }
    const last = f.samples[f.samples.length - 1];
    if (!last || a.t > last[0]) {
      f.samples.push([a.t, a.alt100 ?? last?.[1] ?? 0, round4(a.lat), round4(a.lon)]);
    }
    f.lastContact = Math.max(f.lastContact, a.t);
    f.now = { gs: a.gs ?? 0, trk: a.trk ?? 0 };
  }

  for (const f of [...open.values()]) {
    if (now - f.lastContact > GAP) finalize(f);
  }

  const cutoff = now - WINDOW;
  const kept = flights.filter((f) => f.arr === null || f.arr >= cutoff);
  for (const f of kept) {
    const i = f.samples.findIndex((s) => s[0] >= cutoff);
    if (i > 0) f.samples.splice(0, i);
    else if (i === -1 && f.samples.length > 1) f.samples.splice(0, f.samples.length - 1);
    if (f.gaps) {
      f.gaps = f.gaps.filter((g) => g[1] >= cutoff);
      if (f.gaps.length === 0) delete f.gaps;
    }
  }

  return { v: 1, collectingSince: prev.collectingSince, lastSuccessAt: now, flights: kept };
}
