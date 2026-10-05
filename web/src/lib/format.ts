const pad2 = (n: number) => String(n).padStart(2, "0");

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

export function fmtKm(km: number): string {
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M`;
  if (km >= 1e4) return `${Math.round(km / 1e3)}K`;
  return fmtInt(km);
}

export const fmtFL = (alt100: number) => `FL${String(Math.max(0, Math.round(alt100))).padStart(3, "0")}`;

export function fmtUtc(absSec: number): string {
  const d = new Date(absSec * 1000);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

export function fmtAgo(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} S AGO`;
  if (s < 3600) return `${Math.floor(s / 60)} MIN AGO`;
  return `${Math.floor(s / 3600)}H AGO`;
}

export function fmtElapsed(sec: number): string {
  const m = Math.max(0, Math.floor(sec / 60));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}
