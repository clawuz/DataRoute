import { REGIONS } from "@web/data/palette";
import type { GlobeModel } from "../model/globe-model";
import { BEAT_SEC, chordAtBeat, hasMusic, pickNote, routeKey, slotIndex, slotTime, type RegionName } from "./theory";

export const MAX_RANGE_SEC = 600;
export const LOOKAHEAD_SEC = 0.06;
export const MAX_NOTES_PER_STEP = 2;

export interface ScoreEvent {
  kind: "dep" | "arr";
  key: string;
  regionIdx: number;
  distKm: number;
  /** flight time, seconds relative to window.from */
  at: number;
}

/** Departures and landings (landed flights only) inside (from, to]; big jumps and rewinds yield nothing. */
export function eventsBetween(m: GlobeModel, from: number, to: number): ScoreEvent[] {
  if (!(to > from) || to - from > MAX_RANGE_SEC) return [];
  const out: ScoreEvent[] = [];
  for (const f of m.flights) {
    const key = routeKey(f.from, f.to, f.id);
    const distKm = f.planned?.distKm ?? 1500;
    if (f.dep > from && f.dep <= to) out.push({ kind: "dep", key, regionIdx: f.regionIdx, distKm, at: f.dep });
    if (f.status === "LANDED" && f.end > from && f.end <= to) out.push({ kind: "arr", key, regionIdx: f.regionIdx, distKm, at: f.end });
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface PlannedNote {
  when: number;
  region: RegionName;
  freq: number;
  vel: number;
  kind: "dep" | "arr";
  key: string;
}

export const velocityFor = (n: number): number => Math.min(1, 0.5 + 0.15 * n);

/** Maps events to notes on each region's grid; extra simultaneous events raise velocity instead of adding notes. */
export function planNotes(events: ScoreEvent[], nowSec: number): PlannedNote[] {
  const start = nowSec + LOOKAHEAD_SEC;
  const groups = new Map<string, { region: RegionName; idx: number; evs: ScoreEvent[] }>();
  for (const e of events) {
    const region = REGIONS[e.regionIdx];
    if (!region || !hasMusic(region)) continue;
    const idx = slotIndex(start, region);
    const gk = `${region}:${idx}`;
    const g = groups.get(gk);
    if (g) g.evs.push(e);
    else groups.set(gk, { region, idx, evs: [e] });
  }
  const out: PlannedNote[] = [];
  for (const { region, idx, evs } of groups.values()) {
    evs.sort((a, b) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "dep" ? -1 : 1));
    const when = slotTime(region, idx);
    const beat = Math.floor(when / BEAT_SEC);
    const chord = chordAtBeat(beat);
    const vel = velocityFor(evs.length);
    for (const e of evs.slice(0, MAX_NOTES_PER_STEP)) {
      const freq = pickNote(region, e.key, e.distKm, chord, beat, e.kind);
      if (freq === null) continue;
      out.push({ when, region, freq, vel: e.kind === "arr" ? vel * 0.6 : vel, kind: e.kind, key: e.key });
    }
  }
  return out.sort((a, b) => a.when - b.when || a.region.localeCompare(b.region));
}
