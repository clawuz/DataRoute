import { REGIONS } from "@web/data/palette";
import type { GlobeModel } from "../model/globe-model";
import { isIstanbul } from "@collector/regions";
import { BEAT_SEC, chordAtBeat, hasMusic, isWestNorth, neyNote, pickNote, routeKey, slotIndex, slotTime, type Instrument } from "./theory";

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
  /** coordinates of the end that is not the Istanbul end (from the planned route) */
  farLat?: number;
  farLon?: number;
  /** the Istanbul end of this event (departure from / landing at an Istanbul airport) */
  istanbul: boolean;
}

/** Departures and landings (landed flights only) inside (from, to]; big jumps and rewinds yield nothing. */
export function eventsBetween(m: GlobeModel, from: number, to: number): ScoreEvent[] {
  if (!(to > from) || to - from > MAX_RANGE_SEC) return [];
  const out: ScoreEvent[] = [];
  for (const f of m.flights) {
    const key = routeKey(f.from, f.to, f.id);
    const distKm = f.planned?.distKm ?? 1500;
    const p = f.planned;
    const fromIst = !!f.from && isIstanbul(f.from);
    const toIst = !!f.to && isIstanbul(f.to);
    const farToEnd = fromIst || !toIst; // far end is the `to` end unless only `to` is Istanbul
    const far = p ? (farToEnd ? { farLat: p.toLat, farLon: p.toLon } : { farLat: p.fromLat, farLon: p.fromLon }) : {};
    if (f.dep > from && f.dep <= to) out.push({ kind: "dep", key, regionIdx: f.regionIdx, distKm, at: f.dep, ...far, istanbul: fromIst });
    if (f.status === "LANDED" && f.end > from && f.end <= to) out.push({ kind: "arr", key, regionIdx: f.regionIdx, distKm, at: f.end, ...far, istanbul: toIst });
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface PlannedNote {
  when: number;
  instrument: Instrument;
  freq: number;
  vel: number;
  kind: "dep" | "arr";
  key: string;
}

export const velocityFor = (n: number): number => Math.min(1, 0.5 + 0.15 * n);

export function instrumentFor(e: ScoreEvent): Instrument | null {
  const region = REGIONS[e.regionIdx];
  if (!region || !hasMusic(region)) return null;
  if (region === "EUR" && Number.isFinite(e.farLat) && Number.isFinite(e.farLon) && isWestNorth(e.farLat!, e.farLon!)) return "PNO";
  return region;
}

const byKindThenKey = (a: ScoreEvent, b: ScoreEvent) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "dep" ? -1 : 1);

/** Maps events to notes on each instrument's grid; extra simultaneous events raise velocity instead of adding notes. */
export function planNotes(events: ScoreEvent[], nowSec: number): PlannedNote[] {
  const start = nowSec + LOOKAHEAD_SEC;
  const groups = new Map<string, { instrument: Instrument; idx: number; evs: ScoreEvent[] }>();
  const neyGroups = new Map<number, ScoreEvent[]>();
  for (const e of events) {
    const instrument = instrumentFor(e);
    if (instrument) {
      const idx = slotIndex(start, instrument);
      const gk = `${instrument}:${idx}`;
      const g = groups.get(gk);
      if (g) g.evs.push(e);
      else groups.set(gk, { instrument, idx, evs: [e] });
    }
    if (e.istanbul) {
      const idx = slotIndex(start, "NEY");
      const g = neyGroups.get(idx);
      if (g) g.push(e);
      else neyGroups.set(idx, [e]);
    }
  }
  const out: PlannedNote[] = [];
  for (const { instrument, idx, evs } of groups.values()) {
    evs.sort(byKindThenKey);
    const when = slotTime(instrument, idx);
    const beat = Math.floor(when / BEAT_SEC);
    const chord = chordAtBeat(beat);
    const vel = velocityFor(evs.length);
    for (const e of evs.slice(0, MAX_NOTES_PER_STEP)) {
      const freq = pickNote(instrument, e.key, e.distKm, chord, beat, e.kind);
      if (freq === null) continue;
      out.push({ when, instrument, freq, vel: e.kind === "arr" ? vel * 0.6 : vel, kind: e.kind, key: e.key });
    }
  }
  for (const [idx, evs] of neyGroups) {
    evs.sort(byKindThenKey);
    const e = evs[0];
    const when = slotTime("NEY", idx);
    const beat = Math.floor(when / BEAT_SEC);
    const vel = velocityFor(evs.length);
    out.push({
      when, instrument: "NEY", freq: neyNote(idx, beat, chordAtBeat(beat), e.kind),
      vel: e.kind === "arr" ? vel * 0.6 : vel, kind: e.kind, key: e.key,
    });
  }
  return out.sort((a, b) => a.when - b.when || a.instrument.localeCompare(b.instrument));
}
