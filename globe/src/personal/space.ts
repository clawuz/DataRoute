/**
 * Space from the map. A route's place in the stereo field is where its middle lies east or west of home (like the
 * map: west left, east right); its reverb is how far it goes (far = more room). Bass and kick stay near the centre and
 * dry, the melody is wide. Pure functions of the route: nothing here is random.
 */
export type SpaceRole = "pad" | "bass" | "hook" | "pluck" | "backbeat" | "kick" | "hat";

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** a longitude difference brought into −180…180 */
const wrap180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

/** longitude of the middle of a route, going the short way round */
export const midLon = (r: { fromLon: number; toLon: number }): number => wrap180(r.fromLon + wrap180(r.toLon - r.fromLon) / 2);

const WIDTH: Record<SpaceRole, number> = { bass: 0.15, kick: 0.15, backbeat: 0.5, hat: 0.5, pad: 0.6, hook: 0.85, pluck: 1 };
const WET_OF_ROLE: Record<SpaceRole, number> = { bass: 0.4, kick: 0.4, backbeat: 1, hat: 1, pad: 1, hook: 1, pluck: 1 };

/** −1 (left) … 1 (right) */
export const panOf = (r: { fromLon: number; toLon: number }, homeLon: number, role: SpaceRole): number =>
  clamp(wrap180(midLon(r) - homeLon) / 100, -0.8, 0.8) * WIDTH[role];

/** 0 (dry) … 0.5 (wet) */
export const wetOf = (r: { distKm: number }, role: SpaceRole): number => (0.12 + 0.38 * clamp(r.distKm / 9000, 0, 1)) * WET_OF_ROLE[role];

/** the reverb send (0 dry-ish, 1 middle, 2 wet) a note with this wetness is played into */
export const sendOf = (wet: number): 0 | 1 | 2 => (wet < 0.25 ? 0 : wet < 0.4 ? 1 : 2);
