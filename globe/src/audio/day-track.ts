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
  /** 21 quantiles (km) of the route lengths of the day the track was composed for */
  lenQ?: number[];
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
  /** the audio element and the notes exist (a phone starts loading the audio only when it is played) */
  loaded(): boolean;
  /** call inside a tap: plays and pauses the audio once, which lets a phone play it later without another tap (and starts it loading) */
  unlock(): void;
  /** `frac` = replay position 0..1; `playing` = the replay runs; `free` = do not chase `frac` (while a flight is followed the recording keeps its own clock) */
  update(frac: number, playing: boolean, free?: boolean, remap?: (n: TrackNote) => TrackNote | null): void;
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
  /** optional: other sources than the bundled /music (the daily track); null = use the bundled one */
  resolve?: () => Promise<{ trackUrl: string; notesUrl: string } | null>;
  onNote: (e: NoteEvent) => void;
  clock: () => number;
}

/** Seconds ahead of the sound at which a note is published (the ribbon shows the notes about to be read). */
export const LOOKAHEAD_SEC = 7; // half of the ribbon (14 s): the right half is full of notes about to be read

/** The recorded track of the day (public/music/track.mp3 + notes.json); fails silently — the generative music stays. */
export function createDayTrack(d: DayTrackDeps): DayTrack {
  const base = d.base ?? "/music";
  let audio: HTMLAudioElement | null = null;
  let data: TrackData | null = null;
  let loading = false;
  let enabled = false;
  let enabledPlaying = false; // update() has taken over the element: the unlocking tap must not pause it
  let disposed = false;
  let unlocked = false; // a tap has played the element once: a phone lets it play from the code now, and it is loading
  let prevT: number | null = null; // media time up to which notes have been published
  let lastNow: number | null = null; // media time at the previous update (jump detection)

  async function load() {
    if (loading || data || typeof Audio === "undefined") return;
    loading = true;
    try {
      let src = (await d.resolve?.().catch(() => null)) ?? null; // the daily track, when it is switched on and readable
      const bundled = { notesUrl: `${base}/notes.json`, trackUrl: `${base}/track.mp3` };
      let res = await fetch((src ?? bundled).notesUrl).catch(() => null);
      if ((!res || !res.ok) && src) {
        src = null; // the daily files are unreadable: the bundled track
        res = await fetch(bundled.notesUrl);
      }
      if (!res || !res.ok) throw new Error(String(res?.status ?? "offline"));
      const j = (await res.json()) as TrackData;
      if (disposed) return;
      const a = new Audio((src ?? bundled).trackUrl);
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
        lastNow = null;
      }
    },
    // a phone does not load audio before it is played: after the unlocking tap the track counts as ready (it starts when it has data)
    ready: () => !!(audio && data && (audio.readyState >= 2 || (unlocked && !audio.error))),
    loaded: () => !!(audio && data),
    unlock() {
      const a = audio;
      if (!a || unlocked) return;
      unlocked = true;
      const p = a.play();
      if (p) void p.then(() => { if (!enabledPlaying) { a.pause(); a.currentTime = 0; } }).catch(() => { unlocked = false; });
    },
    data: () => data,
    setGain(g) {
      if (audio) audio.volume = Math.min(1, Math.max(0, g));
    },
    finished: () => !!(audio && data && (audio.ended || audio.currentTime >= data.duration - 0.05)),
    update(frac, playing, free = false, remap) {
      const a = audio;
      if (!a || !data || !enabled) return;
      if (!playing) {
        enabledPlaying = false;
        if (!a.paused) a.pause();
        prevT = null;
        lastNow = null;
        return;
      }
      const out = (n: TrackNote, at: number) => {
        const m = remap ? remap(n) : n;
        if (m) d.onNote(noteEventOf(m, at));
      };
      a.loop = free; // following a flight: the recording keeps going round instead of ending
      const { t, seek } = targetTime(frac, data.duration, a.currentTime);
      if (seek && !free) {
        a.currentTime = t;
        prevT = t;
      }
      enabledPlaying = true;
      if (a.paused) void a.play().catch(() => undefined); // blocked until a user gesture: the next tick retries
      const now = a.currentTime;
      // the notes are published LOOKAHEAD seconds before they sound: the scope draws them ahead of its reading line
      if (prevT === null || lastNow === null || now > lastNow + 1.5 || now < lastNow - 0.5) prevT = now; // start, stall, seek, loop wrap
      lastNow = now;
      const target = Math.min(data.duration, now + LOOKAHEAD_SEC);
      if (target > prevT) {
        for (const n of notesBetween(data.notes, prevT, target)) out(n, d.clock() + (n.t - now));
        prevT = target;
      }
    },
    dispose() {
      disposed = true;
      audio?.pause();
      audio = null;
    },
  };
}
