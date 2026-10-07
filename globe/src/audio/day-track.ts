import type { Instrument } from "./theory";
import type { NoteEvent } from "./notes-bus";

/** One note of the day's recorded track, owned by the route that "plays" it (art:track). */
export interface TrackNote {
  /** onset (s from the track start) */
  t: number;
  /** length (s) */
  d: number;
  /** MIDI pitch */
  p: number;
  /** loudness 0..1 */
  v: number;
  /** corridor key of the playing route */
  k: string;
  from: string;
  to: string;
  alt: number;
}
export interface TrackData {
  duration: number;
  notes: TrackNote[];
}

/** The notes whose onset lies in (a, b] — the notes that sounded while the playhead moved from `a` to `b`. */
export function notesBetween(notes: TrackNote[], a: number, b: number): TrackNote[] {
  if (b <= a) return [];
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t <= a) lo = mid + 1;
    else hi = mid;
  }
  const out: TrackNote[] = [];
  for (let i = lo; i < notes.length && notes[i].t <= b; i++) out.push(notes[i]);
  return out;
}

/** The scope colour/lane of a note follows its register (the score of the orchestra: basses low, violins/flutes high). */
export const instrumentOf = (p: number): Instrument => (p < 50 ? "CELLO" : p < 62 ? "STR" : p < 74 ? "VIOLIN" : "FLUTE");

export const hzOfMidi = (p: number): number => 440 * 2 ** ((p - 69) / 12);

/** The scope event of a track note sounding at wall-clock second `at` (`vel` follows the transcribed loudness). */
export function noteEventOf(n: TrackNote, at: number): NoteEvent {
  const instrument = instrumentOf(n.p);
  const freq = hzOfMidi(n.p);
  return { instrument, lane: instrument, freq, pitch: freq, vel: Math.min(1, 0.3 + n.v * 0.7), kind: "line", key: n.k, at, durSec: n.d, lineId: `${n.from}-${n.to}`, alt: n.alt };
}

/** Where the audio should be for replay fraction `frac` (0..1), and whether it has to be re-seeked (drift > `tol` s). */
export function targetTime(frac: number, duration: number, current: number, tol = 0.5): { t: number; seek: boolean } {
  const t = Math.min(duration, Math.max(0, frac * duration));
  return { t, seek: Math.abs(current - t) > tol };
}

export interface DayTrack {
  setEnabled(on: boolean): void;
  /** true once the audio and the notes are loaded and the track can take over from the generative music */
  ready(): boolean;
  /** `frac` = replay position 0..1; `playing` = the replay runs; `free` = do not chase `frac` (while a flight is followed the recording keeps its own clock) */
  update(frac: number, playing: boolean, free?: boolean): void;
  /** the recording has played to its end */
  finished(): boolean;
  /** the loaded notes (for the continuation after the track); null until loaded */
  data(): TrackData | null;
  /** loudness 0..1 of the recorded audio (follows the traffic of the hour) */
  setGain(g: number): void;
  dispose(): void;
}

export interface DayTrackDeps {
  base?: string;
  onNote: (e: NoteEvent) => void;
  clock: () => number;
}

/** The recorded track of the day (public/music/track.mp3 + notes.json); fails silently — the generative music stays. */
export function createDayTrack(d: DayTrackDeps): DayTrack {
  const base = d.base ?? "/music";
  let audio: HTMLAudioElement | null = null;
  let data: TrackData | null = null;
  let loading = false;
  let enabled = false;
  let disposed = false;
  let prevT: number | null = null;

  async function load() {
    if (loading || data || typeof Audio === "undefined") return;
    loading = true;
    try {
      const res = await fetch(`${base}/notes.json`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as TrackData;
      if (disposed) return;
      const a = new Audio(`${base}/track.mp3`);
      a.preload = "auto";
      a.loop = false;
      audio = a;
      data = j;
    } catch {
      loading = false; // generative music stays
    }
  }

  return {
    setEnabled(on) {
      enabled = on;
      if (on) void load();
      else {
        audio?.pause();
        prevT = null;
      }
    },
    ready: () => !!(audio && data && audio.readyState >= 2),
    data: () => data,
    setGain(g) {
      if (audio) audio.volume = Math.min(1, Math.max(0, g));
    },
    finished: () => !!(audio && data && (audio.ended || audio.currentTime >= data.duration - 0.05)),
    update(frac, playing, free = false) {
      const a = audio;
      if (!a || !data || !enabled) return;
      if (!playing) {
        if (!a.paused) a.pause();
        prevT = null;
        return;
      }
      a.loop = free; // following a flight: the recording keeps going round instead of ending
      const { t, seek } = targetTime(frac, data.duration, a.currentTime);
      if (seek && !free) {
        a.currentTime = t;
        prevT = t;
      }
      if (a.paused) void a.play().catch(() => undefined); // blocked until a user gesture: the next tick retries
      const now = a.currentTime;
      if (prevT !== null && now - prevT < 1.5) for (const n of notesBetween(data.notes, prevT, now)) d.onNote(noteEventOf(n, d.clock() + (n.t - now)));
      else if (prevT !== null && free && now < prevT && data.duration - prevT < 1.5) {
        // the loop wrapped: the tail of the recording, then its start
        for (const n of notesBetween(data.notes, prevT, data.duration)) d.onNote(noteEventOf(n, d.clock() + (n.t - prevT)));
        for (const n of notesBetween(data.notes, -1, now)) d.onNote(noteEventOf(n, d.clock() + (n.t - now)));
      }
      prevT = now;
    },
    dispose() {
      disposed = true;
      audio?.pause();
      audio = null;
    },
  };
}
