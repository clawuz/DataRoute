/**
 * The opening film is the live screen itself, seen from far: the world turns in and the routes light as the live music plays them (the
 * same tour the site starts with: the day's replay, then the music); then the airline's mark and the two lines come in, one after
 * another, at the left; then the globe moves back to where the live screen has it, the music fades out, and the live screen starts
 * from the beginning. Everything here is a pure function of time.
 */
export const FILM_SECONDS = 19.6;
/** the words are gone and the globe starts to move back */
export const SETTLE_FROM = 16.2;
/** the globe stands where the live screen has it */
export const SETTLE_TO = 19.2;

const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
const ease = (x: number): number => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 before `a`, 1 after `b`, smooth in between */
const ramp = (t: number, a: number, b: number): number => ease((t - a) / (b - a));

/** the live screen's first view: its camera distance, the point at the middle (20° north, 30° east) */
export const LIVE_VIEW = { dist: 3.2, lat: 20, lon: 30 };

export interface Shot {
  /** camera distance from the globe's centre */
  dist: number;
  /** the point at the middle of the picture (degrees) */
  lat: number;
  lon: number;
  /** the strength of the glow round the globe (soft while the globe is far, so that the halo does not flare) */
  glow: number;
  /** 1 = black: the picture comes up from black at the start */
  black: number;
  /** a dark veil at the left, behind the words, so that they read */
  veil: number;
  /** the words: opacity 0..1 */
  text: { brand: number; l1: number; l2: number };
  /** the music's level (it fades out while the globe moves back) */
  music: number;
  /** the routes' resting brightness: low while a note lights its own route, back to 1 as the globe settles */
  dim: number;
}

/** the camera and the words at second `t` of the film */
export function shotAt(t0: number): Shot {
  const t = clamp(t0, 0, FILM_SECONDS);
  // the world turns in (a fifth less close than before: 1.96, not 1.57) and eases back a little while the routes light; it holds under the
  // words; then it moves back to the live screen's distance and angle
  const dist =
    t < 3.2 ? mix(9, 1.96, ramp(t, 0.2, 3.2)) :
    t < SETTLE_FROM ? mix(1.96, 2.25, ramp(t, 3.2, SETTLE_FROM)) :
    mix(2.25, LIVE_VIEW.dist, ramp(t, SETTLE_FROM, SETTLE_TO));
  const settle = ramp(t, SETTLE_FROM, SETTLE_TO);
  const lonHub = t < 3.2 ? mix(-50, 28.7, ramp(t, 0.4, 3.2)) : 28.7 + mix(0, 9, ramp(t, 3.2, SETTLE_FROM));
  const latHub = t < 3.2 ? mix(8, 35, ramp(t, 0.4, 3.2)) : 35;
  const out = 1 - ramp(t, SETTLE_FROM - 0.8, SETTLE_FROM + 0.2);
  const rise = (a: number): number => ramp(t, a, a + 0.9) * out;
  return {
    dist,
    lon: mix(lonHub, LIVE_VIEW.lon, settle),
    lat: mix(latHub, LIVE_VIEW.lat, settle),
    glow: mix(0.3, 1.9, ramp(t, 0.5, 6)),
    black: 1 - ramp(t, 0, 1.2),
    veil: 0.7 * ramp(t, 6.3, 7.6) * out,
    text: { brand: rise(7), l1: rise(9), l2: rise(10.8) },
    music: 1 - ramp(t, SETTLE_FROM, SETTLE_TO - 0.3),
    dim: mix(0.3, 1, ramp(t, SETTLE_FROM, SETTLE_TO)),
  };
}
