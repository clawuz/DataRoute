import { haversineKm, initialBearing } from "@collector/geo";
import { sampleAt } from "@web/data/mapping";
import { EXTRAPOLATE_MAX_SEC, headState } from "../model/dead-reckon";
import type { GlobeFlight } from "../model/globe-model";
import { BREAK_SEC } from "../scene/arcs";

const KT = 1.852; // km/h per knot

export type DataSource = "OBSERVED" | "NO DATA" | "EXTRAPOLATED";
export type FlightPhase = "CLIMB" | "CRUISE" | "DESCENT" | "—";

export interface Telemetry {
  lat: number;
  lon: number;
  alt100: number;
  altFt: number;
  gsKt: number | null;
  hdgDeg: number | null;
  vsFpm: number | null;
  phase: FlightPhase;
  source: DataSource;
  /** extrapolation limit reached: the head no longer moves (LAST CONTACT) */
  holding: boolean;
  distKm: number;
  totalKm: number | null;
  distEstimated: boolean;
  elapsedSec: number;
  remainingSec: number | null;
  etaEstimated: boolean;
  utcSec: number;
  localSolarHours: number;
}

interface Seg {
  t0: number;
  t1: number;
  mid: number;
  km: number;
  gsKt: number | null;
  hdg: number | null;
  vsFpm: number | null;
  noData: boolean;
}

export interface FlightProfile {
  segs: Seg[];
  cumKm: number[];
  cumEst: boolean[];
  maxAlt100: number;
}

export function buildProfile(f: GlobeFlight): FlightProfile {
  const n = f.t.length;
  const segs: Seg[] = [];
  const cumKm = [0];
  const cumEst = [false];
  for (let i = 0; i < n - 1; i++) {
    const t0 = f.t[i];
    const t1 = f.t[i + 1];
    const dt = t1 - t0;
    const km = haversineKm(f.lat[i], f.lon[i], f.lat[i + 1], f.lon[i + 1]);
    const noData = dt > BREAK_SEC || f.gaps.some(([gs, ge]) => gs < t1 && ge > t0);
    const ok = !noData && dt > 0;
    segs.push({
      t0,
      t1,
      mid: (t0 + t1) / 2,
      km,
      gsKt: ok ? km / (dt / 3600) / KT : null,
      hdg: ok && km > 0 ? initialBearing(f.lat[i], f.lon[i], f.lat[i + 1], f.lon[i + 1]) : null,
      vsFpm: ok ? ((f.alt[i + 1] - f.alt[i]) * 100) / (dt / 60) : null,
      noData,
    });
    cumKm.push(cumKm[i] + km);
    cumEst.push(cumEst[i] || noData);
  }
  let maxAlt100 = 0;
  for (const a of f.alt) maxAlt100 = Math.max(maxAlt100, a);
  return { segs, cumKm, cumEst, maxAlt100 };
}

const cache = new WeakMap<GlobeFlight, FlightProfile>();
export function profileOf(f: GlobeFlight): FlightProfile {
  let p = cache.get(f);
  if (!p) {
    p = buildProfile(f);
    cache.set(f, p);
  }
  return p;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => (a + (((b - a + 540) % 360) - 180) * k + 360) % 360;

/** Value of segment `i`, blended linearly toward the neighbouring segment's value between segment midpoints. */
function smoothed(
  segs: Seg[],
  i: number,
  u: number,
  pick: (s: Seg) => number | null,
  mix: (a: number, b: number, k: number) => number,
): number | null {
  const cur = pick(segs[i]);
  if (cur === null) return null;
  const o = segs[u < segs[i].mid ? i - 1 : i + 1];
  const ov = o ? pick(o) : null;
  if (!o || ov === null) return cur;
  const k = (u - o.mid) / (segs[i].mid - o.mid);
  return mix(ov, cur, Math.min(1, Math.max(0, k)));
}

const phaseOf = (vs: number | null, alt100: number, max100: number): FlightPhase => {
  if (vs === null) return "—";
  if (vs > 300 && alt100 < 0.9 * max100) return "CLIMB";
  if (vs < -300) return "DESCENT";
  return "CRUISE";
};

export function telemetryAt(f: GlobeFlight, u: number, fromAbs: number): Telemetry | null {
  const n = f.t.length;
  if (n < 2) return null;
  const p = profileOf(f);
  const airborne = f.status === "AIRBORNE";
  const extrap = airborne && u > f.lastT;
  const uu = Math.min(Math.max(u, f.t[0]), f.lastT);
  const s = sampleAt(f, uu)!;
  const i = Math.min(s.i, n - 2);
  const seg = p.segs[i];
  const k = seg.t1 > seg.t0 ? (uu - seg.t0) / (seg.t1 - seg.t0) : 0;

  let lat = s.lat;
  let lon = s.lon;
  let alt100 = s.alt;
  let gsKt = smoothed(p.segs, i, uu, (x) => x.gsKt, lerp);
  let hdgDeg = smoothed(p.segs, i, uu, (x) => x.hdg, lerpAngle);
  let vsFpm = smoothed(p.segs, i, uu, (x) => x.vsFpm, lerp);
  let source: DataSource = seg.noData ? "NO DATA" : "OBSERVED";
  let holding = false;
  let distKm = p.cumKm[i] + seg.km * k;
  let distEstimated = p.cumEst[i] || seg.noData;

  if (extrap) {
    const h = headState(f, Math.min(u, f.lastT + EXTRAPOLATE_MAX_SEC));
    holding = u > f.lastT + EXTRAPOLATE_MAX_SEC;
    const lastSeg = [...p.segs].reverse().find((x) => x.gsKt !== null);
    if (h) {
      lat = h.lat;
      lon = h.lon;
      alt100 = h.alt100;
      distKm = p.cumKm[n - 1] + haversineKm(f.lat[n - 1], f.lon[n - 1], h.lat, h.lon);
    }
    gsKt = f.gs !== undefined && f.gs > 0 ? f.gs : (lastSeg?.gsKt ?? null);
    hdgDeg = f.trk ?? lastSeg?.hdg ?? null;
    vsFpm = null;
    source = "EXTRAPOLATED";
    distEstimated = true;
  }

  // total distance
  let totalKm: number | null;
  let totalEst = false;
  if (f.status === "LANDED") {
    totalKm = p.cumKm[n - 1];
    totalEst = p.cumEst[n - 1];
  } else if (f.planned) {
    totalKm = p.cumKm[n - 1] + haversineKm(f.lat[n - 1], f.lon[n - 1], f.planned.toLat, f.planned.toLon);
    totalEst = true;
  } else {
    totalKm = null;
  }
  if (totalEst) distEstimated = true; // DIST shows "x / total": any estimated part marks the whole readout EST

  // remaining time
  let remainingSec: number | null = null;
  let etaEstimated = false;
  if (f.status === "LANDED") {
    remainingSec = Math.max(0, f.end - u);
  } else if (airborne && totalKm !== null) {
    const recent = p.segs.filter((x) => x.gsKt !== null).slice(-3);
    const avg = recent.length ? recent.reduce((a, x) => a + (x.gsKt as number), 0) / recent.length : 0;
    if (avg > 0) {
      remainingSec = (Math.max(0, totalKm - distKm) / (avg * KT)) * 3600;
      etaEstimated = true;
    }
  }

  const utcSec = fromAbs + u;
  return {
    lat,
    lon,
    alt100,
    altFt: alt100 * 100,
    gsKt,
    hdgDeg,
    vsFpm,
    phase: source === "OBSERVED" ? phaseOf(vsFpm, alt100, p.maxAlt100) : "—",
    source,
    holding,
    distKm,
    totalKm,
    distEstimated,
    elapsedSec: Math.max(0, u - f.dep),
    remainingSec,
    etaEstimated,
    utcSec,
    localSolarHours: ((((utcSec / 3600 + lon / 15) % 24) + 24) % 24),
  };
}
