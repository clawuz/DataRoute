import type { Region } from "@collector/day-schema";
import { haversineKm } from "@collector/geo";
import type { CycleState, Phase } from "../cycle/machine";
import { sampleAt } from "../data/mapping";
import type { Model } from "../data/model";
import { dataState, type DataState } from "../data/status";
import { statsAt, type Timeline } from "../data/timeline";
import { fmtAgo, fmtElapsed, fmtFL, fmtUtc } from "../lib/format";
import type { ScreenPoint } from "../render/picking";

export const ALT_BINS = 21; // FL000–FL419 in 2,000 ft bins
export const PROFILE_POINTS = 48;

export interface FlightCard {
  tk: string;
  route: string;
  fl: string;
  gs: string;
  elapsed: string;
  region: Region;
  profile: number[];
  x: number;
  y: number;
  visible: boolean;
}

export interface HudSnapshot {
  ready: boolean;
  phase: Phase;
  paused: boolean;
  timeLabel: string;
  counters: { airborne: number; flights: number; destinations: number; km: number };
  altHist: number[];
  depHist: number[];
  playhead: number;
  regionAirborne: number[];
  dataState: DataState;
  sourceName: string;
  sourceUrl: string;
  updatedAgo: string;
  totalFlights: number;
  collectingSince: string;
  spotlight: FlightCard | null;
  tooltip: FlightCard | null;
  hidden: boolean;
  reducedMotion: boolean;
  debug?: { fps: number; level: number; flights: number };
}

export const EMPTY_SNAPSHOT: HudSnapshot = {
  ready: false,
  phase: "REPLAY",
  paused: false,
  timeLabel: "",
  counters: { airborne: 0, flights: 0, destinations: 0, km: 0 },
  altHist: new Array(ALT_BINS).fill(0),
  depHist: new Array(24).fill(0),
  playhead: 0,
  regionAirborne: new Array(7).fill(0),
  dataState: "loading",
  sourceName: "",
  sourceUrl: "",
  updatedAgo: "",
  totalFlights: 0,
  collectingSince: "",
  spotlight: null,
  tooltip: null,
  hidden: false,
  reducedMotion: false,
};

export function altHistogram(m: Model, cur: number): number[] {
  const bins = new Array<number>(ALT_BINS).fill(0);
  for (const f of m.flights) {
    const s = sampleAt(f, cur);
    if (s) bins[Math.min(ALT_BINS - 1, Math.max(0, Math.floor(s.alt / 20)))]++;
  }
  return bins;
}

export function flightCard(
  m: Model,
  idx: number,
  cur: number,
  phase: Phase,
): Omit<FlightCard, "x" | "y" | "visible"> | null {
  const f = m.flights[idx];
  if (!f) return null;
  const s = sampleAt(f, cur);
  if (!s) return null;

  const route = f.from || f.to ? `${f.from ?? "???"} → ${f.to ?? "???"}` : "ROUTE UNKNOWN";

  let gs: number | null = null;
  if (phase === "LIVE" && f.airborne && f.gs !== undefined) {
    gs = f.gs;
  } else {
    const i = Math.min(s.i, f.t.length - 2);
    if (i >= 0) {
      const dt = f.t[i + 1] - f.t[i];
      if (dt > 0) gs = haversineKm(f.lat[i], f.lon[i], f.lat[i + 1], f.lon[i + 1]) / (dt / 3600) / 1.852;
    }
  }

  const upto: number[] = [];
  for (let i = 0; i < f.t.length && f.t[i] <= cur; i++) upto.push(f.alt[i]);
  upto.push(s.alt);
  const stride = Math.max(1, Math.ceil(upto.length / PROFILE_POINTS));
  const profile = upto.filter((_, i) => i % stride === 0 || i === upto.length - 1);

  return {
    tk: f.tk,
    route,
    fl: fmtFL(s.alt),
    gs: gs === null ? "GS —" : `GS ${Math.round(gs)} KT`,
    elapsed: `ELAPSED ${fmtElapsed(cur - f.dep)}`,
    region: f.region,
    profile,
  };
}

export interface SnapshotInput {
  model: Model | null;
  tl: Timeline | null;
  cycle: CycleState;
  nowSec: number;
  fixture: boolean;
  spotlightIdx: number;
  spotlightScreen: ScreenPoint | null;
  hoverIdx: number;
  hoverScreen: ScreenPoint | null;
  hidden: boolean;
  reducedMotion: boolean;
  debug?: { fps: number; level: number; flights: number };
}

export function buildSnapshot(i: SnapshotInput): HudSnapshot {
  const m = i.model;
  const state = dataState(m, i.nowSec, i.fixture);
  if (!m || !i.tl) {
    return { ...EMPTY_SNAPSHOT, dataState: state, hidden: i.hidden, reducedMotion: i.reducedMotion, debug: i.debug };
  }
  const cur = i.cycle.tRel;
  const st = statsAt(i.tl, cur);
  const card = (idx: number, scr: ScreenPoint | null): FlightCard | null => {
    if (idx < 0 || !scr) return null;
    const c = flightCard(m, idx, cur, i.cycle.phase);
    return c ? { ...c, ...scr } : null;
  };
  return {
    ready: true,
    phase: i.cycle.phase,
    paused: i.cycle.paused,
    timeLabel: fmtUtc(m.from + cur),
    counters: { airborne: st.airborne, flights: st.flights, destinations: st.destinations, km: st.km },
    altHist: altHistogram(m, cur),
    depHist: i.tl.depHourly,
    playhead: Math.min(1, Math.max(0, cur / 86400)),
    regionAirborne: st.regionAirborne,
    dataState: state,
    sourceName: m.source.name,
    sourceUrl: m.source.url,
    updatedAgo: fmtAgo(i.nowSec - m.generatedAt),
    totalFlights: m.stats.flights24h,
    collectingSince: fmtAgo(i.nowSec - m.collectingSince),
    spotlight: card(i.spotlightIdx, i.spotlightScreen),
    tooltip: i.hoverIdx !== i.spotlightIdx ? card(i.hoverIdx, i.hoverScreen) : null,
    hidden: i.hidden,
    reducedMotion: i.reducedMotion,
    debug: i.debug,
  };
}
