import type { AircraftState, TrackedFlight, TrackerState } from "./day-schema.js";

export const GAP = 45 * 60;
export const WINDOW = 86400;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function emptyState(now: number): TrackerState {
  return { v: 1, collectingSince: now, lastSuccessAt: 0, flights: [] };
}

export function step(prev: TrackerState, aircraft: AircraftState[], now: number): TrackerState {
  const flights: TrackedFlight[] = prev.flights.map((f) => ({ ...f, samples: [...f.samples] }));
  const open = new Map<string, TrackedFlight>();
  for (const f of flights) if (f.arr === null) open.set(f.icao24, f);

  const close = (f: TrackedFlight, at: number) => {
    f.arr = at;
    delete f.now;
    open.delete(f.icao24);
  };

  for (const a of aircraft) {
    let f = open.get(a.icao24);
    if (f && (f.cs !== a.cs || a.t - f.lastContact > GAP)) {
      close(f, f.lastContact);
      f = undefined;
    }
    if (a.onGround) {
      if (f) close(f, a.t);
      continue;
    }
    if (!f) {
      f = { id: `${a.icao24}-${a.t}`, icao24: a.icao24, cs: a.cs, dep: a.t, arr: null, lastContact: a.t, samples: [] };
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
    if (now - f.lastContact > GAP) close(f, f.lastContact);
  }

  const cutoff = now - WINDOW;
  const kept = flights.filter((f) => f.arr === null || f.arr >= cutoff);
  for (const f of kept) {
    const i = f.samples.findIndex((s) => s[0] >= cutoff);
    if (i > 0) f.samples.splice(0, i);
    else if (i === -1 && f.samples.length > 1) f.samples.splice(0, f.samples.length - 1);
  }

  return { v: 1, collectingSince: prev.collectingSince, lastSuccessAt: now, flights: kept };
}
