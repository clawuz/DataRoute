import type { DayFile, Region } from "@collector/day-schema";
import { isIstanbul } from "@collector/regions";
import { REGIONS } from "./palette";

/** One flight with times relative to `window.from` (seconds). */
export interface FlightRec {
  id: string;
  tk: string;
  from?: string;
  to?: string;
  other?: string;
  region: Region;
  regionIdx: number;
  bearing: number;
  dep: number;
  end: number;
  airborne: boolean;
  t: Float32Array;
  alt: Float32Array;
  lat: Float32Array;
  lon: Float32Array;
  gs?: number;
}

export interface Model {
  from: number;
  span: number;
  replayStart: number;
  generatedAt: number;
  collectingSince: number;
  status: DayFile["status"];
  source: DayFile["source"];
  stats: DayFile["stats"];
  flights: FlightRec[];
  segments: number;
}

function otherEnd(from?: string, to?: string): string | undefined {
  if (from && isIstanbul(from)) return to;
  if (to && isIstanbul(to)) return from;
  return to ?? from;
}

export function buildModel(day: DayFile): Model {
  const from = day.window.from;
  const span = day.generatedAt - from;
  const flights: FlightRec[] = [];
  let segments = 0;

  for (const f of day.flights) {
    const n = f.s.length;
    if (n === 0) continue;
    const t = new Float32Array(n);
    const alt = new Float32Array(n);
    const lat = new Float32Array(n);
    const lon = new Float32Array(n);
    const dep = f.dep - from;
    for (let i = 0; i < n; i++) {
      const [dt, a, la, lo] = f.s[i];
      t[i] = dep + dt;
      alt[i] = a;
      lat[i] = la;
      lon[i] = lo;
    }
    const last = t[n - 1];
    const airborne = f.arr === null;
    const end = airborne ? Math.max(span, last) : Math.max((f.arr as number) - from, last);
    const regionIdx = REGIONS.indexOf(f.region);
    flights.push({
      id: f.id,
      tk: f.tk,
      from: f.from,
      to: f.to,
      other: otherEnd(f.from, f.to),
      region: f.region,
      regionIdx: regionIdx < 0 ? REGIONS.length - 1 : regionIdx,
      bearing: f.bearing,
      dep,
      end,
      airborne,
      t,
      alt,
      lat,
      lon,
      gs: f.now?.gs,
    });
    segments += n - 1;
  }

  return {
    from,
    span,
    replayStart: Math.min(span, Math.max(0, day.collectingSince - from)),
    generatedAt: day.generatedAt,
    collectingSince: day.collectingSince,
    status: day.status,
    source: day.source,
    stats: day.stats,
    flights,
    segments,
  };
}
