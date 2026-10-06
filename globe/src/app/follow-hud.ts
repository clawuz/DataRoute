import { fmtElapsed, fmtFL, fmtInt, fmtUtc } from "@web/lib/format";
import type { Telemetry } from "../geo3d/telemetry";
import { atLiveHead, effectiveSpeed, type FollowClock } from "../model/follow-clock";
import type { GlobeFlight } from "../model/globe-model";

export type FollowStateLabel = "OBSERVED" | "NO DATA" | "EXTRAPOLATED" | "LAST CONTACT" | "LANDED";

export interface FollowHud {
  tk: string;
  route: string;
  state: FollowStateLabel;
  alt: string;
  gs: string;
  hdg: string;
  vs: string;
  phase: string;
  dist: string;
  elapsed: string;
  remaining: string;
  utc: string;
  local: string;
  speed: string;
  progress: number;
  profile: number[];
  cursor: number;
  notes: string[];
}

const PROFILE_POINTS = 48;
const pad2 = (n: number) => String(n).padStart(2, "0");

export function followState(f: GlobeFlight, tel: Telemetry, u: number): FollowStateLabel {
  if (f.status === "LANDED" && u >= f.end) return "LANDED";
  if (tel.source === "NO DATA") return "NO DATA";
  if (tel.source === "EXTRAPOLATED") return tel.holding ? "LAST CONTACT" : "EXTRAPOLATED";
  if (f.status === "LAST_CONTACT" && u >= f.lastT) return "LAST CONTACT";
  return "OBSERVED";
}

export function speedLabel(f: GlobeFlight, c: FollowClock): string {
  if (c.paused) return "PAUSED";
  if (atLiveHead(c, f)) return "×1 · LIVE HEAD";
  return `×${Math.round(effectiveSpeed(c, f))}`;
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtInt(Math.abs(v))}`;

export function formatFollow(f: GlobeFlight, tel: Telemetry, clock: FollowClock): FollowHud {
  const est = tel.distEstimated ? " EST" : "";
  const stride = Math.max(1, Math.ceil(f.alt.length / PROFILE_POINTS));
  const profile: number[] = [];
  for (let i = 0; i < f.alt.length; i += stride) profile.push(f.alt[i]);
  if ((f.alt.length - 1) % stride !== 0) profile.push(f.alt[f.alt.length - 1]);
  const span = f.lastT - f.t[0];
  const local = tel.localSolarHours;
  const state = followState(f, tel, clock.u);

  const notes = ["GS / HDG / VS ARE 2-MIN AVERAGES"];
  if (state === "NO DATA") notes.push("NO DATA · OUTSIDE ADS-B COVERAGE");
  if (state === "EXTRAPOLATED") notes.push("EXTRAPOLATED FROM LAST REPORT");
  if (tel.distEstimated) notes.push("EST = ESTIMATED (GAP / PLANNED / EXTRAPOLATED)");

  return {
    tk: f.tk,
    route: f.from || f.to ? `${f.from ?? "???"} → ${f.to ?? "???"}` : "ROUTE UNKNOWN",
    state,
    alt: tel.source === "NO DATA" ? "—" : `${fmtFL(tel.alt100)} · ${fmtInt(tel.altFt)} FT`, // interpolated across a gap, not observed
    gs: tel.gsKt === null ? "—" : `${Math.round(tel.gsKt)} KT`,
    hdg: tel.hdgDeg === null ? "—" : `${String(Math.round(tel.hdgDeg) % 360).padStart(3, "0")}°`,
    vs: tel.vsFpm === null ? "—" : `${signed(Math.round(tel.vsFpm))} FT/MIN`,
    phase: tel.phase,
    dist: tel.totalKm === null ? `${fmtInt(tel.distKm)} KM${est}` : `${fmtInt(tel.distKm)} / ${fmtInt(tel.totalKm)} KM${est}`,
    elapsed: fmtElapsed(tel.elapsedSec),
    remaining: tel.remainingSec === null ? "—" : `${fmtElapsed(tel.remainingSec)}${tel.etaEstimated ? " EST" : ""}`,
    utc: fmtUtc(tel.utcSec),
    local: `${pad2(Math.floor(local))}:${pad2(Math.floor((local % 1) * 60))} LOCAL SOLAR`,
    speed: speedLabel(f, clock),
    progress: tel.totalKm && tel.totalKm > 0 ? Math.min(1, Math.max(0, tel.distKm / tel.totalKm)) : 0,
    profile,
    cursor: span > 0 ? Math.min(1, Math.max(0, (Math.min(clock.u, f.lastT) - f.t[0]) / span)) : 0,
    notes,
  };
}
