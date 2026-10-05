import { haversineKm } from "@collector/geo";
import type { Model } from "./model";
import { REGIONS, REGION_RGB } from "./palette";

export const BUCKET = 60;

export interface Timeline {
  buckets: number;
  airborne: Int32Array;
  flights: Int32Array;
  destinations: Int32Array;
  km: Float64Array;
  regionAirborne: Int32Array[];
  depHourly: number[];
  minAir: number;
  maxAir: number;
}

export interface StatsAt {
  airborne: number;
  flights: number;
  destinations: number;
  km: number;
  regionAirborne: number[];
}

export function buildTimeline(m: Model): Timeline {
  const B = Math.floor(m.span / BUCKET) + 1;
  const bucketOf = (t: number) => Math.min(B - 1, Math.max(0, Math.floor(t / BUCKET)));
  const airDelta = new Int32Array(B + 1);
  const regDelta = REGIONS.map(() => new Int32Array(B + 1));
  const depCount = new Int32Array(B);
  const kmAt = new Float64Array(B);
  const destFirst = new Map<string, number>();
  const depHourly = new Array<number>(24).fill(0);

  for (const f of m.flights) {
    if (f.end >= 0 && f.t[0] <= m.span) {
      const a = bucketOf(Math.max(f.t[0], 0));
      const e = bucketOf(Math.min(f.end, m.span));
      airDelta[a]++;
      airDelta[e + 1]--;
      regDelta[f.regionIdx][a]++;
      regDelta[f.regionIdx][e + 1]--;
    }
    const db = bucketOf(f.dep);
    depCount[db]++;
    if (f.other) {
      const prev = destFirst.get(f.other);
      if (prev === undefined || db < prev) destFirst.set(f.other, db);
    }
    if (f.dep >= 0 && f.dep < 86400) depHourly[Math.floor(f.dep / 3600)]++;
    for (let i = 1; i < f.t.length; i++) {
      kmAt[bucketOf(f.t[i])] += haversineKm(f.lat[i - 1], f.lon[i - 1], f.lat[i], f.lon[i]);
    }
  }

  const destAt = new Int32Array(B);
  for (const b of destFirst.values()) destAt[b]++;

  const airborne = new Int32Array(B);
  const flights = new Int32Array(B);
  const destinations = new Int32Array(B);
  const km = new Float64Array(B);
  const regionAirborne = REGIONS.map(() => new Int32Array(B));
  const regRun = new Array<number>(REGIONS.length).fill(0);
  let air = 0;
  let fl = 0;
  let dest = 0;
  let kmRun = 0;
  for (let b = 0; b < B; b++) {
    air += airDelta[b];
    airborne[b] = air;
    fl += depCount[b];
    flights[b] = fl;
    dest += destAt[b];
    destinations[b] = dest;
    kmRun += kmAt[b];
    km[b] = kmRun;
    for (let r = 0; r < REGIONS.length; r++) {
      regRun[r] += regDelta[r][b];
      regionAirborne[r][b] = regRun[r];
    }
  }

  let minAir = Infinity;
  let maxAir = 0;
  for (let b = bucketOf(m.replayStart); b < B; b++) {
    minAir = Math.min(minAir, airborne[b]);
    maxAir = Math.max(maxAir, airborne[b]);
  }
  if (minAir === Infinity) minAir = 0;

  return { buckets: B, airborne, flights, destinations, km, regionAirborne, depHourly, minAir, maxAir };
}

export function statsAt(tl: Timeline, tRel: number): StatsAt {
  const b = Math.min(tl.buckets - 1, Math.max(0, Math.floor(tRel / BUCKET)));
  return {
    airborne: tl.airborne[b],
    flights: tl.flights[b],
    destinations: tl.destinations[b],
    km: tl.km[b],
    regionAirborne: tl.regionAirborne.map((r) => r[b]),
  };
}

export function flowFor(tl: Timeline, tRel: number): number {
  if (tl.maxAir <= tl.minAir) return 1;
  const { airborne } = statsAt(tl, tRel);
  return 0.6 + (0.8 * (airborne - tl.minAir)) / (tl.maxAir - tl.minAir);
}

export function tintFor(regionAirborne: number[]): [number, number, number] {
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  regionAirborne.forEach((n, i) => {
    if (!n) return;
    const [cr, cg, cb] = REGION_RGB[i];
    r += cr * n;
    g += cg * n;
    b += cb * n;
    total += n;
  });
  return total ? [r / total, g / total, b / total] : [1, 1, 1];
}
