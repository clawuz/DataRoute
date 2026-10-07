import type { GlobeFlight, GlobeModel } from "../model/globe-model";
import { isIstanbul } from "@collector/regions";
import { REGIONS } from "@web/data/palette";
import type { BuildPhase, Level } from "./arrangement";
import { chordAtStep, nextChordAtStep, stepDur, swingDelay, type Section } from "./form";
import { bassHits, compHits, drumHits, fillAndBuild, layerHits, type GrooveHit, type Voice } from "./groove";
import { ladderFreq, snapToScale } from "./harmony";
import { continentInstrument, lineGain, lineNote, linePattern, type SkyFlight } from "./lines";
import { graceAbove, neyCell, windParts, type NeyState } from "./melody";
import type { NoteKind } from "./notes-bus";
import { routeKey, type Instrument, type RegionName } from "./theory";

/**
 * Music planning, pure: the continuous 16th-step clock (`planStep`: the v4 arranged groove of spec §4f and the flight
 * lines) and the Istanbul ney cells with their winds (`planNotes`, spec §4e). The engine turns the planned notes into sound.
 */
export const MAX_RANGE_SEC = 600;
/** the ney's first note is at least this far after `now` (scheduling margin) */
export const NEY_LEAD_SEC = 0.06;

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

/** The far (non-Istanbul) end of a flight's planned route: the `to` end unless only `to` is Istanbul; {} without a plan. */
export function farOf(f: GlobeFlight): { farLat?: number; farLon?: number } {
  const p = f.planned;
  if (!p) return {};
  const farToEnd = (!!f.from && isIstanbul(f.from)) || !(!!f.to && isIstanbul(f.to));
  return farToEnd ? { farLat: p.toLat, farLon: p.toLon } : { farLat: p.fromLat, farLon: p.fromLon };
}

/** Departures and landings (landed flights only) inside (from, to]; big jumps and rewinds yield nothing. */
export function eventsBetween(m: GlobeModel, from: number, to: number): ScoreEvent[] {
  if (!(to > from) || to - from > MAX_RANGE_SEC) return [];
  const out: ScoreEvent[] = [];
  for (const f of m.flights) {
    const key = routeKey(f.from, f.to, f.id);
    const distKm = f.planned?.distKm ?? 1500;
    const fromIst = !!f.from && isIstanbul(f.from);
    const toIst = !!f.to && isIstanbul(f.to);
    const far = farOf(f);
    if (f.dep > from && f.dep <= to) out.push({ kind: "dep", key, regionIdx: f.regionIdx, distKm, at: f.dep, ...far, istanbul: fromIst });
    if (f.status === "LANDED" && f.end > from && f.end <= to) out.push({ kind: "arr", key, regionIdx: f.regionIdx, distKm, at: f.end, ...far, istanbul: toIst });
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface PlannedNote {
  /** wall-clock seconds when it sounds */
  when: number;
  instrument: Instrument;
  /** pitch (Hz); a chord's lowest tone for voicings, a nominal pitch for drums */
  freq: number;
  /** chord voicing (keys comping, brass stab) */
  freqs?: number[];
  vel: number;
  /** Istanbul departure/arrival (ney, winds), flight line, or groove voice */
  kind: NoteKind;
  /** route key (the corridor of the note); "" for the groove */
  key: string;
  /** flight id of a line note */
  lineId?: string;
  /** ney: a short grace note at this pitch (one chord-scale degree above), just before the note */
  graceFreq?: number;
  /** ney cadence / held wind / sustained groove note: longer decay */
  long?: boolean;
}

/** Nominal pitch of the unpitched drum voices (the scope draws a burst at this "frequency"). */
export const DRUM_PITCH = {
  KICK: 60, SNARE: 180, HAT: 8000, OHAT: 8000, TOM: 160, CRASH: 6000, SHAKER: 9000, RISER: 400,
  DARBUKA: 190, CONGA: 330, TAIKO: 110, TIMP: 98,
} as const satisfies Partial<Record<Voice, number>>;

export interface PlanContext {
  /** wall-clock time of step 0 of the current section */
  epoch: number;
  section: Section;
  ney: NeyState;
}

/** Wall-clock time of 16th step `k`: epoch + k · stepDur + swing on odd steps. */
export const stepTime = (k: number, epoch: number, sec: Section): number => epoch + k * stepDur(sec) + swingDelay(k, sec);

export const velocityFor = (n: number): number => Math.min(1, 0.5 + 0.15 * n);

/** Base velocity of a flight line (scaled by `lineGain(N)`; the followed flight × `FOLLOW_BOOST`). */
export const LINE_VEL = 0.55;
export const FOLLOW_BOOST = 1.4;

const byKindThenKey = (a: ScoreEvent, b: ScoreEvent) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "dep" ? -1 : 1);

/**
 * Istanbul-end events → one ney cell (or cadence) on consecutive eighth notes (even 16th steps) from the first even step
 * at or after `now + NEY_LEAD_SEC`, with its wind ensemble. The cell is built on the chord of its first step; any note
 * whose own step falls on another chord is snapped into that chord's scale. Extra events raise the velocity. Pure:
 * returns the advanced ney state.
 */
export function planNotes(events: ScoreEvent[], nowSec: number, ctx: PlanContext): { notes: PlannedNote[]; ney: NeyState } {
  const { epoch, section: sec } = ctx;
  const neyEvs = sec.instruments.has("NEY") ? events.filter((e) => e.istanbul).sort(byKindThenKey) : [];
  if (neyEvs.length === 0) return { notes: [], ney: ctx.ney };
  const d = stepDur(sec);
  const k = 2 * Math.max(0, Math.ceil((nowSec + NEY_LEAD_SEC - epoch) / (2 * d) - 1e-9));
  const e = neyEvs[0];
  const r = neyCell(e, ctx.ney, chordAtStep(k, sec), k / 4, sec);
  const vel = velocityFor(neyEvs.length) * (e.kind === "arr" ? 0.6 : 1);
  const at = (slotOffset: number) => {
    const step = k + 2 * slotOffset;
    return { step, when: stepTime(step, epoch, sec), chord: chordAtStep(step, sec) };
  };
  const out: PlannedNote[] = [];
  for (const n of r.notes) {
    const { when, chord } = at(n.slotOffset);
    const s = snapToScale(n.semis, chord);
    out.push({
      when, instrument: "NEY", freq: ladderFreq(s), vel: n.vel * vel, kind: e.kind, key: e.key,
      ...(n.grace ? { graceFreq: ladderFreq(graceAbove(s, chord)) } : {}), ...(n.long ? { long: true } : {}),
    });
  }
  for (const w of windParts(r.notes, chordAtStep(k, sec), sec)) {
    const { when, chord } = at(w.slotOffset);
    out.push({
      when, instrument: w.instrument, freq: ladderFreq(snapToScale(w.semis, chord)), vel: w.vel * vel, kind: e.kind, key: e.key,
      ...(w.long ? { long: true } : {}),
    });
  }
  return { notes: out.sort((a, b) => a.when - b.when || a.instrument.localeCompare(b.instrument)), ney: r.state };
}

const drumPitch = (v: Voice): number => (v in DRUM_PITCH ? DRUM_PITCH[v as keyof typeof DRUM_PITCH] : 0);

/** The arrangement state of a step, kept by the engine (spec §4f). */
export interface StepArrangement {
  /** rhythm level (changes only at bar boundaries) */
  level: Level;
  /** active region layers */
  layers: ReadonlySet<RegionName>;
  /** REPLAY transition phase of the bar: `build` mutes keys, brass, layers and lines; `hit` adds the tutti on step 0 */
  phase: BuildPhase;
  /** build amount 0 → 1 */
  amount: number;
  /** bar index inside the build phase (0 = the first build bar, which starts the riser) */
  buildBar: number;
}

/** Drum voices of the level that the build-up's own snare roll and rising hats replace. */
const BUILD_REPLACES: ReadonlySet<Voice> = new Set<Voice>(["SNARE", "HAT"]);

/**
 * The groove hits of global 16th step `k` under an arrangement:
 * - `none` / `hit`: the level's drums, bass and comping and the percussion of every active layer (in `REGIONS` order;
 *   the EUR shaker is left out from level 3, where the drums already play a 16th shaker); at `hit` step 0 the tutti
 *   (crash, kick 1.0, brass full voicing) replaces the level's kick.
 * - `build`: the roll (`fillAndBuild`: snare and hat every step, the riser, the bass pulse) plus the level's other drums
 *   (kick, open hat, shaker, toms); keys, brass and layers are silent.
 */
function grooveHits(k: number, sec: Section, arr: StepArrangement): GrooveHit[] {
  const s = k % 16;
  const bar = Math.floor(k / 16);
  const chord = chordAtStep(k, sec);
  const drums = drumHits(arr.level, bar, s);
  if (arr.phase === "build")
    return [...fillAndBuild("build", arr.amount, s, arr.buildBar, chord), ...drums.filter((h) => !BUILD_REPLACES.has(h.voice))];
  const tutti = arr.phase === "hit" ? fillAndBuild("hit", 1, s, 0, chord) : [];
  const hits = [
    ...tutti,
    ...(tutti.length ? drums.filter((h) => h.voice !== "KICK") : drums),
    ...bassHits(arr.level, bar, s, chord, nextChordAtStep(k, sec)),
    ...compHits(arr.level, s, chord),
  ];
  for (const r of REGIONS) {
    if (!arr.layers.has(r) || (r === "EUR" && arr.level >= 3)) continue; // one shaker, not two
    hits.push(...layerHits(r, s, bar));
  }
  return hits;
}

/**
 * Every note of global 16th step `k`: the arranged groove (`grooveHits`; a hit's `offsetSteps` places it that fraction
 * of the way to the next, swung, step) and the given flight lines (each line's euclidean pattern; pitch = altitude on
 * the chord ladder) — silent during a build. Pure.
 */
export function planStep(
  k: number, ctx: { epoch: number; section: Section }, arr: StepArrangement, lines: SkyFlight[], followedId: string | null,
): PlannedNote[] {
  const { epoch, section: sec } = ctx;
  const when = stepTime(k, epoch, sec);
  const gap = stepTime(k + 1, epoch, sec) - when;
  const chord = chordAtStep(k, sec);
  const out: PlannedNote[] = grooveHits(k, sec, arr).map((h) => ({
    when: h.offsetSteps ? when + h.offsetSteps * gap : when, instrument: h.voice, freq: h.freq ?? h.freqs?.[0] ?? drumPitch(h.voice),
    vel: h.vel, kind: "groove" as const, key: "", ...(h.freqs ? { freqs: h.freqs } : {}), ...(h.long ? { long: true } : {}),
  }));
  if (arr.phase === "build") return out;
  const gain = LINE_VEL * lineGain(lines.length);
  for (const f of lines) {
    if (!linePattern(f.id)[k % 16]) continue;
    out.push({
      when, instrument: continentInstrument(f), freq: ladderFreq(lineNote(f, chord, k)), vel: gain * (f.id === followedId ? FOLLOW_BOOST : 1),
      kind: "line", key: f.key, lineId: f.id,
    });
  }
  return out;
}
