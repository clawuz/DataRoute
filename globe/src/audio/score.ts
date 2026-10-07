import { REGIONS } from "@web/data/palette";
import type { GlobeModel } from "../model/globe-model";
import { isIstanbul } from "@collector/regions";
import type { Section } from "./form";
import { neyCell, pianoNext, windParts, type NeyState, type PianoState } from "./melody";
import {
  INSTRUMENT_MUSIC, chordAtBeat, hasMusic, isWestNorth, nextActiveSlot, octaveFor, pickNote, routeKey, slotIndex, slotTime, type Instrument,
} from "./theory";

export const MAX_RANGE_SEC = 600;
export const LOOKAHEAD_SEC = 0.06;

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
  /** ney: a short grace note one ladder degree above, just before the note */
  grace?: boolean;
  /** ney cadence / held wind note: longer decay */
  long?: boolean;
  /** piano roll: offset (already included in `when`) of this note inside the roll */
  offsetSec?: number;
}

export interface PlanContext {
  /** audio time of the section start; grids and chord counting are relative to it */
  epoch: number;
  section: Section;
  ney: NeyState;
  piano: PianoState;
}

export const velocityFor = (n: number): number => Math.min(1, 0.5 + 0.15 * n);

export function instrumentFor(e: ScoreEvent): Instrument | null {
  const region = REGIONS[e.regionIdx];
  if (!region || !hasMusic(region)) return null;
  if (region === "EUR" && Number.isFinite(e.farLat) && Number.isFinite(e.farLon) && isWestNorth(e.farLat!, e.farLon!)) return "PNO";
  return region;
}

const byKindThenKey = (a: ScoreEvent, b: ScoreEvent) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "dep" ? -1 : 1);

/**
 * Maps events to notes of the current section: each instrument's next active euclidean step on its grid
 * (relative to the section epoch), at most `section.maxNotes` per instrument and step (extra events raise
 * the velocity), the Istanbul ney as data-born cells with its wind ensemble, the piano as a flowing arpeggio.
 * Pure: returns the advanced ney and piano states.
 */
export function planNotes(events: ScoreEvent[], nowSec: number, ctx: PlanContext): { notes: PlannedNote[]; ney: NeyState; piano: PianoState } {
  const { epoch, section: sec } = ctx;
  const { bpm, progression, beatsPerChord } = sec;
  const beatSec = 60 / bpm;
  const start = nowSec + LOOKAHEAD_SEC - epoch;
  const slotOf = (inst: Instrument) => nextActiveSlot(inst, slotIndex(start, inst, bpm));
  const beatOf = (inst: Instrument, slot: number) => Math.floor(slotTime(inst, slot, bpm) / beatSec + 1e-9);
  const chordOf = (beat: number) => chordAtBeat(beat, progression, beatsPerChord);
  const groups = new Map<Instrument, ScoreEvent[]>();
  const neyEvs: ScoreEvent[] = [];
  for (const e of events) {
    const instrument = instrumentFor(e);
    if (instrument && sec.instruments.has(instrument)) {
      const g = groups.get(instrument);
      if (g) g.push(e);
      else groups.set(instrument, [e]);
    }
    if (e.istanbul && sec.instruments.has("NEY")) neyEvs.push(e);
  }
  const out: PlannedNote[] = [];
  let piano = ctx.piano;
  for (const [instrument, evs] of groups) {
    evs.sort(byKindThenKey);
    const slot = slotOf(instrument);
    const when = epoch + slotTime(instrument, slot, bpm);
    const beat = beatOf(instrument, slot);
    const chord = chordOf(beat);
    const vel = velocityFor(evs.length);
    for (const e of evs.slice(0, sec.maxNotes)) {
      const v = e.kind === "arr" ? vel * 0.6 : vel;
      const base = { instrument, vel: v, kind: e.kind, key: e.key };
      if (instrument === "PNO") {
        const progIdx = Math.floor(Math.max(0, beat) / beatsPerChord) % progression.length;
        const oct = octaveFor(e.distKm) - (e.kind === "arr" ? 1 : 0);
        const r = pianoNext(piano, chord, `${chord.name}${progIdx}`, oct);
        piano = r.state;
        for (const n of r.notes) out.push({ ...base, when: when + n.offsetSec, freq: n.freq, ...(n.offsetSec ? { offsetSec: n.offsetSec } : {}) });
        continue;
      }
      const freq = pickNote(instrument, e.key, e.distKm, chord, beat, e.kind);
      if (freq !== null) out.push({ ...base, when, freq });
    }
  }
  let ney = ctx.ney;
  if (neyEvs.length) {
    neyEvs.sort(byKindThenKey);
    const e = neyEvs[0];
    const slot = slotOf("NEY");
    const beat = slot / (INSTRUMENT_MUSIC.NEY?.perBeat ?? 1); // exact: the ney grid has no swing
    const chord = chordOf(Math.floor(beat));
    const r = neyCell(e, ney, chord, beat, sec);
    ney = r.state;
    const vel = velocityFor(neyEvs.length) * (e.kind === "arr" ? 0.6 : 1);
    for (const n of r.notes) {
      out.push({
        when: epoch + slotTime("NEY", slot + n.slotOffset, bpm), instrument: "NEY", freq: n.freq, vel: n.vel * vel,
        kind: e.kind, key: e.key, ...(n.grace ? { grace: true } : {}), ...(n.long ? { long: true } : {}),
      });
    }
    for (const w of windParts(r.notes, chord, sec)) {
      out.push({
        when: epoch + slotTime(w.instrument, slot + w.slotOffset, bpm), instrument: w.instrument, freq: w.freq, vel: w.vel * vel,
        kind: e.kind, key: e.key, ...(w.long ? { long: true } : {}),
      });
    }
  }
  return { notes: out.sort((a, b) => a.when - b.when || a.instrument.localeCompare(b.instrument)), ney, piano };
}
