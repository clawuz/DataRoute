import { DESTINATIONS } from "./destinations";
import { buildRoutes, type PersonalRoute } from "./routes";
import { buildPersonalModel } from "./model";
import type { PersonalNote, PersonalPiece } from "./compose";
import type { Instrument } from "../audio/theory";
import type { GlobeModel } from "../model/globe-model";

/**
 * The opening film. Routes are made one by one, each by one note of the film's own music (as many routes as notes, in the
 * network's colours); then the airline's mark and the two lines come in, one after another; then the globe moves back to where the
 * live screen has it, the sound fades out to nothing, and the live screen starts. Everything is a pure function of time.
 */
export const FILM_SECONDS = 22.2;
/** the globe stands where the live screen has it from this second, and the picture changes over to the live screen */
export const SETTLE_FROM = 18.4;
export const SETTLE_TO = 21.6;

/** the voiced cities (one for each continent) come first; the rest of the network follows */
export const FILM_DESTINATIONS = ["LHR", "CAI", "JFK", "NRT", "JNB", "GRU", "DXB", "AYT"];
export const FILM_ROUTES = 110;
/** the seconds a route takes to draw from the hub */
const GROW = 1.6;
/** flight seconds per film second: the model's clock runs on film time */
const RATE = 200;

const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
const ease = (x: number): number => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 before `a`, 1 after `b`, smooth in between */
const ramp = (t: number, a: number, b: number): number => ease((t - a) / (b - a));

/** the routes of the film: the hub to the network */
export const filmRoutes = (): PersonalRoute[] => {
  const rest = DESTINATIONS.filter((d) => d.status === "active" && d.iata !== "IST" && !FILM_DESTINATIONS.includes(d.iata)).map((d) => d.iata);
  return buildRoutes([...FILM_DESTINATIONS, ...rest.slice(0, FILM_ROUTES - FILM_DESTINATIONS.length)], "IST");
};

/** when each route opens (s): a slow first phrase (the voiced cities), then a quickening run, then a rush — one note each */
export function openTimes(n: number): number[] {
  const out: number[] = [];
  let t = 1.3;
  for (let i = 0; i < n; i++) {
    out.push(t);
    t += i < 8 ? 0.3 : i < 32 ? 0.11 : 0.03;
  }
  return out;
}
/** the second the last route opens */
export const ROUTES_DONE = openTimes(FILM_ROUTES)[FILM_ROUTES - 1];

/** the model of the film: every route is a track of its own length of time, starting at the second of its note */
export function filmModel(routes: PersonalRoute[], opens: number[]): GlobeModel {
  const model = buildPersonalModel(routes);
  model.flights.forEach((f, i) => {
    const dur = f.end - f.dep;
    const dep = opens[i] * RATE;
    const len = GROW * RATE;
    for (let k = 0; k < f.t.length; k++) f.t[k] = dep + ((f.t[k] - f.dep) / dur) * len;
    f.dep = dep;
    f.end = dep + len;
    f.lastT = f.end;
  });
  model.span = (FILM_SECONDS + 2) * RATE;
  return model;
}
/** the model's clock at second `t` of the film */
export const modelClock = (t: number): number => t * RATE;

export interface Shot {
  /** camera distance from the globe's centre (the live screen stands at 3.2) */
  dist: number;
  /** the point at the middle of the picture (degrees) */
  lat: number;
  lon: number;
  /** the strength of the glow round the globe */
  glow: number;
  /** how thick the route lines are drawn (the live screen's is 1) */
  lines: number;
  /** the whole picture fades in from black at the start */
  fade: number;
  /** a dark veil behind the words, so that they read */
  veil: number;
  /** the words: opacity 0..1 */
  text: { logo: number; presents: number; world: number; l1: number; l2: number };
  /** the film's picture over the live screen: 1 = all film, 0 = the live screen */
  film: number;
}

/** the camera and the words at second `t` of the film */
export function shotAt(t0: number): Shot {
  const t = clamp(t0, 0, FILM_SECONDS);
  // the world turns in and fills the picture; the routes open round Istanbul while it eases out a little; it holds under the words;
  // then it moves back to the live screen's distance and angle
  const dist =
    t < 3 ? mix(9, 1.57, ramp(t, 0.2, 3)) :
    t < ROUTES_DONE ? mix(1.57, 2.05, ramp(t, 3, ROUTES_DONE)) :
    t < SETTLE_FROM ? mix(2.05, 2.15, ramp(t, ROUTES_DONE, SETTLE_FROM)) :
    mix(2.15, 3.2, ramp(t, SETTLE_FROM, SETTLE_TO));
  const live = ramp(t, SETTLE_FROM, SETTLE_TO);
  const lonHub = t < 3 ? mix(-50, 28.7, ramp(t, 0.4, 3)) : 28.7 + mix(0, 9, ramp(t, 3, SETTLE_FROM));
  const latHub = t < 3 ? mix(8, 35, ramp(t, 0.4, 3)) : 35;
  const T = ROUTES_DONE + 0.5; // the words start when the last route is drawn
  const rise = (a: number, b = a + 0.9): number => ramp(t, a, b);
  const out = 1 - ramp(t, SETTLE_FROM - 0.8, SETTLE_FROM + 0.4);
  return {
    dist,
    lon: mix(lonHub, 30, live), // the live screen's first view: 20° north, 30° east
    lat: mix(latHub, 20, live),
    glow: mix(1.3, 1.9, ramp(t, 0.6, 3)),
    lines: mix(2.2, 1, ramp(t, SETTLE_FROM, SETTLE_TO)),
    fade: ramp(t, 0, 0.9),
    veil: 0.62 * ramp(t, T - 0.3, T + 1.2) * out,
    text: {
      logo: rise(T) * out,
      presents: rise(T + 0.7) * out,
      world: rise(T + 1.4) * out,
      l1: rise(T + 2.6, T + 3.5) * out,
      l2: rise(T + 4.4, T + 5.3) * out,
    },
    film: 1 - ramp(t, SETTLE_TO - 0.9, FILM_SECONDS),
  };
}

const D = (n: number): number => 73.42 * 2 ** (n / 12); // semitones above D2
const SCALE = [0, 3, 5, 7, 10]; // D minor pentatonic

/** the voice of a route: its region's instrument */
const voiceOf = (r: PersonalRoute, i: number): Instrument => {
  if (i < 8) return (["VIOLIN", "KANUN", "HORN", "HARP", "MARIMBA", "TPT", "SAZ", "FLUTE"] as Instrument[])[i];
  switch (r.region as string) {
    case "DOM": return "SAZ";
    case "EUR": return "VIOLIN";
    case "MEA": return "KANUN";
    case "AFR": return "MARIMBA";
    case "ASI": return "HARP";
    default: return i % 2 ? "FLUTE" : "HORN";
  }
};

/**
 * The film's music: each route is one note (so the sound and the picture are the same thing), rising from a slow phrase through a
 * quickening run to a rush; a pad, timpani and a riser under it; a full chord when the words come; a soft arpeggio under the words; a
 * last chord that rings out while the globe moves back.
 */
export function filmPiece(routes: PersonalRoute[]): PersonalPiece {
  const rs = routes.slice(0, FILM_ROUTES);
  const opens = openTimes(rs.length);
  const keys = rs.map((r) => r.key);
  const notes: PersonalNote[] = [];
  const add = (t: number, d: number, instrument: Instrument, freq: number, route: number, vel = 0.7, show = false): void => {
    notes.push({ t, d, instrument, freq, vel, key: keys[route % keys.length], route: route % keys.length, via: route % keys.length, show, alt: 30000 });
  };
  // the routes: one note each
  rs.forEach((r, i) => {
    const j = i < 8 ? i : i < 32 ? i : i * 2; // the rush sweeps the scale faster
    const n = 12 + SCALE[j % 5] + 12 * Math.floor((j % 15) / 5);
    add(opens[i], i < 8 ? 1.4 : i < 32 ? 0.6 : 0.3, voiceOf(r, i), D(n), i, i < 8 ? 0.8 : i < 32 ? 0.65 : 0.5, true);
  });
  // under them: a pad that changes chord, the heart (timpani) and the riser
  const chord = (t: number, d: number, semis: number[], ins: Instrument = "STR", vel = 0.4): void => semis.forEach((s) => add(t, d, ins, D(s), 0, vel));
  chord(1.0, 3.8, [12, 15, 19]); // Dm
  chord(4.6, 2.2, [10, 14, 17]); // Bb
  chord(6.6, 2.2, [7, 10, 14]); // Gm
  add(1.0, 3.6, "CELLO", D(0), 0, 0.45);
  add(4.6, 2, "CELLO", D(-2), 0, 0.45);
  add(6.6, 2, "CELLO", D(-5), 0, 0.45);
  for (const t of [3.7, 6.34]) add(t, 1, "TIMP", D(0), 0, 0.85);
  add(6.5, 2.2, "RISER", D(24), 0, 0.5);
  // the words: the full chord, a soft arpeggio, a bass that breathes
  const W = ROUTES_DONE + 0.1;
  chord(W, 8.2, [12, 15, 19, 22], "STR", 0.5);
  chord(W, 3.2, [24, 27], "HORN", 0.45);
  add(W, 1.4, "TIMP", D(0), 0, 0.9);
  add(W, 1.2, "CRASH", D(0), 0, 0.45);
  add(W, 3.5, "CELLO", D(0), 0, 0.55);
  add(W + 4.2, 3.5, "CELLO", D(-5), 0, 0.5);
  const arp = [24, 27, 31, 34, 31, 27];
  for (let i = 0; i < 9; i++) add(W + 0.9 + i * 0.8, 1.2, "HARP", D(arp[i % arp.length]), 1 + (i % 6), 0.4);
  // the end: one last chord rings while the globe moves back (the player fades it to nothing)
  chord(SETTLE_FROM - 0.4, 4, [12, 19, 22, 26], "STR", 0.45);
  add(SETTLE_FROM, 2.5, "HARP", D(36), 2, 0.5);
  notes.sort((a, b) => a.t - b.t);
  return {
    notes,
    duration: FILM_SECONDS,
    hook: 0,
    bpm: 96,
    sections: [{ name: "film", start: 0, end: FILM_SECONDS }],
    style: { groove: 2, arp: 2, perc: 2, ensemble: 0, progression: 0, shift: 0, swing: 0, genre: "folk" },
    energy: Array.from({ length: 48 }, (_, i) => clamp(i / 30, 0.1, 1)),
  };
}
