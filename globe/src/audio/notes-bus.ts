import type { Instrument } from "./theory";

/** One planned note, published whether or not the sound is audible (`at` = wall-clock seconds when it sounds). */
export interface NoteEvent {
  instrument: Instrument;
  freq: number;
  vel: number;
  kind: "dep" | "arr";
  /** route key (same as the corridor key for routed flights) */
  key: string;
  at: number;
  long?: boolean;
}

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
