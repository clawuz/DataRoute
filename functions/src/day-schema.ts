// Shared types for the collector and (via `import type`) the web client.

export type Region = "DOM" | "EUR" | "MEA" | "AFR" | "ASI" | "AME" | "UNK";

/** [t (unix s, absolute in tracker / relative to dep in day.json), alt/100 ft, lat, lon] */
export type Sample = [number, number, number, number];
export type FlightEnd = "AIRBORNE" | "LANDED" | "LAST_CONTACT";

export interface Airport {
  iata: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lon: number;
  name?: string;
}

export interface RouteInfo {
  origin: Airport;
  destination: Airport;
}

/** One THY aircraft from one ADS-B poll. */
export interface AircraftState {
  icao24: string;
  cs: string; // trimmed callsign, e.g. "THY1"
  t: number; // unix s (response.now − seen_pos)
  lat: number;
  lon: number;
  alt100: number | null; // altitude / 100 ft, rounded
  onGround: boolean;
  gs: number | null; // ground speed, knots
  trk: number | null; // true track, degrees
  reg?: string; // registration, e.g. "TC-JJK"
  type?: string; // ICAO type code, e.g. "B77W"
  desc?: string; // e.g. "BOEING 777-300ER"
}

export interface TrackedFlight {
  id: string; // `${icao24}-${dep}`
  icao24: string;
  cs: string;
  dep: number;
  arr: number | null;
  lastContact: number;
  end?: FlightEnd;
  /** coverage gaps inside the flight, absolute unix s [from, to] */
  gaps?: [number, number][];
  samples: Sample[]; // absolute t
  now?: { gs: number; trk: number };
  /** undefined = not looked up yet, null = looked up, unknown */
  route?: RouteInfo | null;
  reg?: string;
  type?: string;
  desc?: string;
}

export interface TrackerState {
  v: 1;
  collectingSince: number;
  lastSuccessAt: number;
  flights: TrackedFlight[];
  /** icao24 -> unix s of the newest report (airborne or ground); pruned after 24 h */
  seen?: Record<string, number>;
  /** unix s of the last successful whole-fleet poll */
  lastFullSweepAt?: number;
}

export interface Flight {
  id: string;
  cs: string;
  tk: string;
  from?: string;
  to?: string;
  region: Region;
  bearing: number;
  dep: number;
  arr: number | null;
  end?: FlightEnd;
  /** coverage gaps, seconds relative to `dep` */
  gaps?: [number, number][];
  s: Sample[]; // t relative to dep
  now?: { gs: number; trk: number };
  reg?: string;
  type?: string;
  desc?: string;
}

export interface DayStatus {
  state: "ok" | "delayed";
  lastSuccessAt: number;
  error?: string;
}

export interface DayAirport {
  lat: number;
  lon: number;
  country: string; // ISO 3166-1 alpha-2
  name?: string;
}

export interface DayFile {
  v: 1;
  generatedAt: number;
  collectingSince: number;
  status: DayStatus;
  source: { name: string; url: string };
  window: { from: number; to: number };
  stats: {
    airborne: number;
    flights24h: number;
    destinations: number;
    countries: number;
    km24h: number;
  };
  flights: Flight[];
  /** IATA → position, for every airport used by a routed flight (+ IST, SAW) */
  airports?: Record<string, DayAirport>;
}
export type DaySource = DayFile["source"];
