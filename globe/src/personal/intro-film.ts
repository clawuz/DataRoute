import { ISTANBUL } from "./destinations";
import { buildRoutes, type PersonalRoute } from "./routes";
import type { PersonalNote, PersonalPiece } from "./compose";
import type { Instrument } from "../audio/theory";

/** the opening film: "Every Destination Has a Sound." — a 15 s camera and score, defined as pure functions of time */
export const FILM_SECONDS = 15;
export const FILM_BPM = 96;
const BEAT = 60 / FILM_BPM;
/** where the film flies from the hub: one voice for each of these routes */
export const FILM_DESTINATIONS = ["LHR", "CAI", "JFK", "NRT", "JNB", "GRU", "DXB", "AYT"];
const VOICES: Instrument[] = ["VIOLIN", "KANUN", "HORN", "HARP", "MARIMBA", "TPT", "SAZ", "FLUTE"];

const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
const ease = (x: number): number => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 before `a`, 1 after `b`, smooth in between */
const ramp = (t: number, a: number, b: number): number => ease((t - a) / (b - a));

export interface Shot {
  /** camera distance from the globe's centre (the live screen stands at 3.2) */
  dist: number;
  /** the point at the middle of the picture (degrees) */
  lat: number;
  lon: number;
  /** how many of the routes are open (fractional: the next one is drawing) */
  open: number;
  /** 0..1 along the flights' time: how far the heads have flown */
  fly: number;
  /** the strength of the glow round the globe */
  glow: number;
  /** the whole picture fades in from black at the start */
  fade: number;
  /** the texts: opacity 0..1 */
  text: { every: number; sound: number };
  /** the live screen's furniture: 0 hidden … 1 shown */
  hud: number;
}

/** the camera, the routes and the words at second `t` of the film */
export function shotAt(t0: number): Shot {
  const t = clamp(t0, 0, FILM_SECONDS);
  // 0.6–3.0 the world turns and comes in; 3.0–3.5 holds over Istanbul; 3.5–5 the routes open and it eases out;
  // 5–7 it drifts with them; 7–10 it pulls back to the live screen's distance; then it settles
  const dist =
    t < 3 ? mix(9, 1.8, ramp(t, 0.2, 3)) :
    t < 3.5 ? mix(1.8, 1.7, ramp(t, 3, 3.5)) :
    t < 5 ? mix(1.7, 2.0, ramp(t, 3.5, 5)) :
    t < 7 ? mix(2.0, 2.4, ramp(t, 5, 7)) :
    mix(2.4, 3.2, ramp(t, 7, 10));
  // the globe turns from the Atlantic to Eurasia, then Istanbul stays in the middle, drifting a little with the routes
  const lon = t < 3 ? mix(-50, ISTANBUL.lon, ramp(t, 0.4, 3)) : ISTANBUL.lon + mix(0, 22, ramp(t, 5, 10)) - mix(0, 14, ramp(t, 10, 13));
  const lat = t < 3 ? mix(8, ISTANBUL.lat - 6, ramp(t, 0.4, 3)) : mix(ISTANBUL.lat - 6, 24, ramp(t, 7, 10));
  return {
    dist,
    lat,
    lon,
    open: clamp((t - 3.5) / 0.18, 0, FILM_DESTINATIONS.length),
    fly: ramp(t, 3.6, 10.5),
    glow: mix(1.2, 1.9, ramp(t, 0.6, 3)) + 0.5 * ramp(t, 7, 9) - 0.5 * ramp(t, 10, 12.5),
    fade: ramp(t, 0, 0.9),
    text: {
      every: ramp(t, 0.6, 1.4) * (1 - ramp(t, 5, 5.6)),
      sound: ramp(t, 3.8, 4.5) * (1 - ramp(t, 5, 5.6)),
    },
    hud: ramp(t, 12.5, 15),
  };
}

const D = (n: number): number => 73.42 * 2 ** (n / 12); // semitones above D2
const note = (t: number, d: number, instrument: Instrument, freq: number, key: string, route: number, vel = 0.8, show = true): PersonalNote => ({ t, d, instrument, freq, vel, key, route, via: route, show, alt: 30000 });

/** the film's score: a drone, one voice for each route, then bass, pulse and melody lock to 96 BPM and swell into one piece */
export function filmPiece(routes: PersonalRoute[]): PersonalPiece {
  const keys = routes.map((r) => r.key);
  const k = (i: number): [string, number] => [keys[i % keys.length], i % keys.length];
  const notes: PersonalNote[] = [];
  const add = (t: number, d: number, ins: Instrument, f: number, i: number, vel = 0.8, show = true): void => { const [key, r] = k(i); notes.push(note(t, d, ins, f, key, r, vel, show)); };
  // 0.6–3.5 drone, a first breath of ney, the heartbeat over Istanbul
  add(0.6, 5.5, "STR", D(0), 0, 0.35);
  add(0.6, 5.5, "CELLO", D(-12 + 12), 0, 0.3);
  add(2.0, 1.4, "NEY", D(24), 0, 0.55);
  add(3.0, 1, "TIMP", D(0), 0, 0.9, false);
  add(3.0 + BEAT, 1, "TIMP", D(0), 0, 0.6, false);
  // 3.5–5 each route opens with its own voice (the first notes of a D-minor scale)
  const scale = [0, 3, 7, 10, 12, 14, 15, 19];
  FILM_DESTINATIONS.forEach((_, i) => add(3.5 + i * 0.18, 1.2, VOICES[i % VOICES.length], D(12 + scale[i % scale.length]), i, 0.7));
  // 5–7 bass, a plucked arpeggio and the hand drums come in
  const bass = [0, 0, -5, -2];
  for (let b = 0; b < 4; b++) add(5 + b * BEAT, BEAT * 0.9, "CELLO", D(bass[b % 4] + 12), b, 0.7, false);
  const arp = [12, 15, 19, 22];
  for (let i = 0; i < 8; i++) add(5.1 + i * BEAT * 0.5, 0.3, "HARP", D(arp[i % 4] + 12), i + 2, 0.55);
  for (let b = 0; b < 4; b++) { add(5.2 + b * BEAT, 0.3, "DARBUKA", D(12), b + 1, 0.65, false); add(5.2 + b * BEAT + BEAT / 2, 0.2, "DARBUKA", D(19), b + 3, 0.4, false); }
  // 7–10 the whole piece: pad chord, bass, melody, a swell of brass, a riser
  [0, 3, 7].forEach((s, i) => add(7, 3.2, "STR", D(12 + s), i, 0.5, false));
  for (let b = 0; b < 5; b++) add(7 + b * BEAT, BEAT * 0.9, "CELLO", D(bass[b % 4] + 12), b, 0.7, false);
  const tune = [24, 27, 26, 22, 24, 19, 22, 24];
  tune.forEach((s, i) => add(7.1 + i * BEAT * 0.5 * 1.5, 0.9, i % 2 ? "VIOLIN" : "FLUTE", D(s), i, 0.7));
  add(8.5, 1.6, "HORN", D(12), 2, 0.6);
  add(8.5, 1.6, "HORN", D(19), 3, 0.5, false);
  add(9, 1.2, "RISER", D(24), 0, 0.5, false);
  for (let i = 0; i < 6; i++) add(7.2 + i * BEAT, 0.3, "TAIKO", D(0), i, 0.7, false);
  // 10–12.5 it settles on one chord
  [0, 7, 15].forEach((s, i) => add(10, 4.5, "STR", D(12 + s), i, 0.45, false));
  add(10, 3, "HARP", D(24), 1, 0.6);
  add(10.6, 2.5, "HARP", D(19), 2, 0.5);
  add(11.2, 3, "FLUTE", D(27), 3, 0.5);
  notes.sort((a, b) => a.t - b.t);
  return {
    notes,
    duration: FILM_SECONDS,
    hook: 0,
    bpm: FILM_BPM,
    sections: [{ name: "film", start: 0, end: FILM_SECONDS }],
    style: { groove: 2, arp: 2, perc: 2, ensemble: 0, progression: 0, shift: 0, swing: 0, genre: "folk" },
    energy: Array.from({ length: 48 }, (_, i) => clamp((i / 48) * 1.6, 0.1, 1)),
  };
}

/** the routes of the film: the hub to eight cities on every continent */
export const filmRoutes = (): PersonalRoute[] => buildRoutes(FILM_DESTINATIONS, "IST");
