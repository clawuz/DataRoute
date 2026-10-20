import { DESTINATIONS, ISTANBUL } from "./destinations";
import { buildRoutes, type PersonalRoute } from "./routes";

/** the opening film: "Every Destination Has a Sound." — a 15 s camera and score, defined as pure functions of time */
export const FILM_SECONDS = 15;
/** where the film flies from the hub: one voice for each of these routes */
export const FILM_DESTINATIONS = ["LHR", "CAI", "JFK", "NRT", "JNB", "GRU", "DXB", "AYT"];

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
    t < 3 ? mix(9, 1.57, ramp(t, 0.2, 3)) :
    t < 3.5 ? mix(1.57, 1.48, ramp(t, 3, 3.5)) :
    t < 5 ? mix(1.48, 2.0, ramp(t, 3.5, 5)) :
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
    fly: ramp(t, 3.5, 7.5),
    glow: mix(1.2, 1.9, ramp(t, 0.6, 3)) + 0.5 * ramp(t, 7, 9) - 0.5 * ramp(t, 10, 12.5),
    fade: ramp(t, 0, 0.9),
    text: {
      every: ramp(t, 0.6, 1.4) * (1 - ramp(t, 5, 5.6)),
      sound: ramp(t, 3.8, 4.5) * (1 - ramp(t, 5, 5.6)),
    },
    hud: ramp(t, 12.5, 15),
  };
}

/** how many routes the film opens: the live screen's hundreds, as one burst from the hub */
const FILM_ROUTES = 210;
/** the routes of the film: the hub to the network (the eight voiced cities first, then the rest of the scheduled network) */
export const filmRoutes = (): PersonalRoute[] => {
  const rest = DESTINATIONS.filter((d) => d.status === "active" && d.iata !== "IST" && !FILM_DESTINATIONS.includes(d.iata)).map((d) => d.iata);
  return buildRoutes([...FILM_DESTINATIONS, ...rest.slice(0, FILM_ROUTES - FILM_DESTINATIONS.length)], "IST");
};
