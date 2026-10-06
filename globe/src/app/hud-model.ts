import { EMPTY_SNAPSHOT, type HudSnapshot } from "@web/hud/snapshot";
import type { EventKind, FlightEvent } from "../model/events";
import type { CamMode } from "../camera/follow-rig";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";
import { BREAK_SEC } from "../scene/arcs";
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
