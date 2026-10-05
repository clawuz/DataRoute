import type { Model } from "./model";

export type DataState = "loading" | "ok" | "delayed" | "collecting";

export const STALE_SEC = 360;

export function dataState(m: Model | null, nowSec: number, fixture: boolean): DataState {
  if (!m) return "loading";
  if (!fixture && (m.status.state === "delayed" || nowSec - m.generatedAt > STALE_SEC)) return "delayed";
  if (m.collectingSince > m.from) return "collecting";
  return "ok";
}
