import { EMPTY_SNAPSHOT, type HudSnapshot } from "@web/hud/snapshot";
import type { EventKind, FlightEvent } from "../model/events";
import type { CamMode } from "../camera/follow-rig";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";
import { BREAK_SEC } from "../scene/arcs";
import type { ArtState } from "./art";
import type { SectionId } from "../audio/form"; // art:sound
import type { Instrument } from "../audio/theory"; // art:sound
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
  /** ux: unix seconds of the first departures-per-hour bin (labels the hour axis) */
  depFrom: number;
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
  art: ArtState; // art:core
  music: MusicHud; // art:sound
}

/** The route music as shown by the scope panel (`on` = sound enabled). */ // art:sound
export interface MusicHud {
  on: boolean;
  section: SectionId;
  chord: string;
  bpm: number;
  instruments: Instrument[];
  /** v4 rhythm level 0 … 4 */
  level: number;
  /** active region layers */
  layers: string[];
  /** art:track — while the recorded track drives the music: the day's traffic curve and where we are on it */
  day?: DayCurveHud;
}

/** The day's airborne curve (48 samples, 0 = the quietest hour, 1 = the busiest), the position on it and the music windows. */ // art:track
export interface DayCurveHud {
  curve: number[];
  /** 0..1 along the day (the replay position; the live head in LIVE) */
  pos: number;
  /** traffic right now, 0..1 on the same scale as the curve */
  level: number;
  /** Istanbul hour 0..24 and the airborne count at the position */
  hour: number;
  airborne: number;
  /** number of music windows the day is divided into */
  windows: number;
}

export const EMPTY_GLOBE_SNAPSHOT: GlobeHudSnapshot = {
  ...EMPTY_SNAPSHOT,
  mode: "LIVE",
  depFrom: 0,
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
  art: { enabled: true, corridors: true, aurora: false, sound: false },
  music: { on: false, section: "DAY", chord: "Dm9", bpm: 116, instruments: [], level: 2, layers: [] }, // art:sound
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

/** ux: the screen box of an airport label (it sits up-right of its point); IST is bigger */
export function labelBox(l: { iata: string; x: number; y: number }): { x0: number; y0: number; x1: number; y1: number } {
  const w = l.iata === "IST" ? 46 : 34;
  const h = l.iata === "IST" ? 20 : 16;
  return { x0: l.x + 6, y0: l.y - h - 4, x1: l.x + 6 + w, y1: l.y - 4 };
}

/** ux: labels in priority order (IST first, then the busiest) — one that would overlap a label already placed is hidden. */
export function resolveLabelOverlaps<T extends { iata: string; x: number; y: number; visible: boolean }>(labels: T[], pad = 3): T[] {
  const placed: ReturnType<typeof labelBox>[] = [];
  return labels.map((l) => {
    if (!l.visible) return l;
    const b = labelBox(l);
    const hit = placed.some((p) => b.x0 < p.x1 + pad && b.x1 + pad > p.x0 && b.y0 < p.y1 + pad && b.y1 + pad > p.y0);
    if (hit) return { ...l, visible: false };
    placed.push(b);
    return l;
  });
}
