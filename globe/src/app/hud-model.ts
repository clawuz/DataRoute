import { EMPTY_SNAPSHOT, type HudSnapshot } from "@web/hud/snapshot";
import type { EventKind, FlightEvent } from "../model/events";
import { headState } from "../model/dead-reckon";
import type { CamMode } from "../camera/follow-rig";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";
import { BREAK_SEC } from "../scene/arcs";
import type { ArtState } from "./art";
import type { FollowHud } from "./follow-hud";

export const CREDIT = "EARTH IMAGERY: NASA EARTH OBSERVATORY (BLUE MARBLE · BLACK MARBLE)";
export const MAX_EVENTS = 6;
export const LABEL_COUNT = 12;
export const LIVE_OVERRUN_SEC = 360;

export interface EventLine {
  id: string;
  kind: EventKind;
  text: string;
  at: number;
}

export interface AirportLabel {
  iata: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface GlobeHudSnapshot extends HudSnapshot {
  mode: "LIVE" | "REPLAY";
  events: EventLine[];
  labels: AirportLabel[];
  extrapolated: number;
  textureProgress: number;
  textureNote: string;
  credit: string;
  follow: FollowHud | null;
  camMode: CamMode;
  notice: string;
  tour: boolean;
  aircraftAirborne: AircraftCount[];
  art: ArtState;
}

export const EMPTY_GLOBE_SNAPSHOT: GlobeHudSnapshot = {
  ...EMPTY_SNAPSHOT,
  mode: "LIVE",
  events: [],
  labels: [],
  extrapolated: 0,
  textureProgress: 0,
  textureNote: "",
  credit: CREDIT,
  follow: null,
  camMode: "GLOBE",
  notice: "",
  tour: true,
  aircraftAirborne: [],
  art: { enabled: true, corridors: true, aurora: false, sound: false },
};

export function eventText(e: FlightEvent): string {
  switch (e.kind) {
    case "DEPARTED":
      return `${e.tk} DEPARTED ${e.from ?? "???"} → ${e.to ?? "???"}`;
    case "LANDED":
      return `${e.tk} LANDED ${e.to ?? "???"}`;
    case "LAST_CONTACT":
      return `${e.tk} LAST CONTACT`;
  }
}

export function addEvents(prev: EventLine[], evs: FlightEvent[]): EventLine[] {
  const seen = new Set(prev.map((l) => l.id));
  const next = [...prev];
  for (const e of evs) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    next.push({ id: e.id, kind: e.kind, text: eventText(e), at: e.at });
  }
  return next.slice(-MAX_EVENTS);
}

/** IST first, then the busiest airports (by flights in the window), at most `n`. */
export function pickLabelAirports(m: GlobeModel, n: number): string[] {
  const others = [...m.traffic.entries()]
    .filter(([code]) => code !== "IST")
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code]) => code);
  return ["IST", ...others].slice(0, n);
}

/** LIVE displayed time (seconds relative to window.from): the wall clock, capped shortly after the data. */
export function liveCur(m: GlobeModel, nowSec: number): number {
  return Math.min(m.span + LIVE_OVERRUN_SEC, Math.max(0, nowSec - m.from));
}

/** Per-frame channel for airport label positions (bypasses the 4 Hz store). */
export interface LabelBus {
  subscribe(fn: (labels: AirportLabel[]) => void): () => void;
  emit(labels: AirportLabel[]): void;
}

export function createLabelBus(): LabelBus {
  const subs = new Set<(labels: AirportLabel[]) => void>();
  return {
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit(labels) {
      for (const fn of subs) fn(labels);
    },
  };
}

/** Aircraft name (type description, else ICAO type, else unknown) and registration for the HUD. */
export function aircraftLabel(f: Pick<GlobeFlight, "desc" | "type" | "reg">): { name: string; reg: string } {
  return { name: f.desc || f.type || "AIRCRAFT UNKNOWN", reg: f.reg ?? "" };
}

/** Per-flight honesty note shown on the hover card. */
export function hoverNote(f: GlobeFlight, cur: number): string {
  if (f.status === "AIRBORNE" && cur > f.lastT) return "EXTRAPOLATED";
  if (f.gaps.some(([s, e]) => cur >= s && cur <= e)) return "NO DATA";
  for (let i = 0; i + 1 < f.t.length; i++) {
    if (cur >= f.t[i] && cur <= f.t[i + 1]) {
      if (f.t[i + 1] - f.t[i] > BREAK_SEC) return "NO DATA";
      break;
    }
  }
  if (f.status === "LAST_CONTACT" && cur >= f.lastT) return "LAST CONTACT";
  return "";
}

export interface AircraftCount {
  label: string;
  count: number;
}

export const AIRCRAFT_TOP = 6;

/** Compact names for the common ICAO type codes; anything else shows its code. */
export const TYPE_NAMES: Record<string, string> = {
  B737: "737", B738: "737-800", B739: "737-900", B38M: "737 MAX 8", B39M: "737 MAX 9",
  B772: "777-200", B77L: "777-200LR", B77W: "777-300ER", B788: "787-8", B789: "787-9", B78X: "787-10",
  B744: "747-400", B748: "747-8", B752: "757-200", B763: "767-300", B764: "767-400",
  A319: "A319", A320: "A320", A321: "A321", A20N: "A320NEO", A21N: "A321NEO", A19N: "A319NEO",
  A332: "A330-200", A333: "A330-300", A338: "A330-800", A339: "A330-900",
  A343: "A340-300", A346: "A340-600", A359: "A350-900", A35K: "A350-1000", A388: "A380-800",
  E190: "E190", E195: "E195", E75L: "E175", AT76: "ATR 72", DH8D: "DASH 8 Q400", CRJ9: "CRJ-900",
  A310: "A310", A306: "A300-600", B77F: "777F", B748F: "747-8F",
};

export const aircraftName = (type: string): string => TYPE_NAMES[type.toUpperCase()] ?? type.toUpperCase();

/**
 * Top aircraft types among the flights whose head is displayed (in the air) at `cur`.
 * Flights without a type are left out. Sorted by count, ties alphabetically by label.
 */
export function aircraftBreakdown(m: GlobeModel, cur: number): AircraftCount[] {
  const counts = new Map<string, number>();
  for (const f of m.flights) {
    if (!f.type) continue;
    if (!headState(f, cur)) continue;
    const label = aircraftName(f.type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, AIRCRAFT_TOP);
}
