import type { Instrument } from "./theory";

/** Istanbul departure/arrival (ney and winds), a flight line, or a groove voice (drums, bass, keys, brass, sax pad). */
export type NoteKind = "dep" | "arr" | "line" | "groove";

/** One planned note, published whether or not the sound is audible (`at` = wall-clock seconds when it sounds). */
export interface NoteEvent {
  instrument: Instrument;
  /** the scope lane of the note (its instrument; the open hat shares the hat lane) */
  lane: Instrument;
  freq: number;
  /** pitch in Hz (same as `freq`; a voicing's lowest tone, a nominal pitch for drums) */
  pitch: number;
  vel: number;
  kind: NoteKind;
  /** route key (same as the corridor key for routed flights); "" for groove voices */
  key: string;
  at: number;
  long?: boolean;
  /** the flight id of a flight-line note */
  lineId?: string;
}

/** Scope lane of an instrument. */
export const laneOf = (i: Instrument): Instrument => (i === "OHAT" ? "HAT" : i);

export interface NoteBus {
  subscribe(fn: (n: NoteEvent) => void): () => void;
  emit(n: NoteEvent): void;
}

export function createNoteBus(): NoteBus {
  const subs = new Set<(n: NoteEvent) => void>();
  return {
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    emit(n) {
      for (const fn of subs) fn(n);
    },
  };
}
