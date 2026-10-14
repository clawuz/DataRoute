import type { Region } from "@collector/day-schema";
import type { PersonalMode } from "./codec";
import type { PersonalRoute } from "./routes";

/** What the AI version is told about a piece: its mood, where it mostly goes and how big it is — not the places. */
export interface AiCharacter {
  mode: PersonalMode;
  regions: Exclude<Region, "UNK">[];
  size: "S" | "M" | "L";
}

const ORDER: Exclude<Region, "UNK">[] = ["DOM", "EUR", "MEA", "AFR", "ASI", "AME"];

export function characterOf(mode: PersonalMode, routes: PersonalRoute[], destinations: number): AiCharacter {
  const count = new Map<Exclude<Region, "UNK">, number>();
  for (const r of routes) if (r.region !== "UNK") count.set(r.region, (count.get(r.region) ?? 0) + 1);
  const regions = [...count.entries()]
    .sort((a, b) => b[1] - a[1] || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))
    .slice(0, 3)
    .map(([r]) => r);
  return { mode, regions: regions.length ? regions : ["EUR"], size: destinations <= 3 ? "S" : destinations <= 8 ? "M" : "L" };
}

export type AiOutcome =
  | { status: "ready"; url: string }
  | { status: "cap" | "limit" | "off" | "failed" | "network" | "rate" };

/** Asks the AI endpoint for the character's track. Never throws. */
export async function requestAi(endpoint: string, c: AiCharacter, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<AiOutcome> {
  try {
    const res = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c), signal });
    const j = (await res.json()) as { status?: string; url?: string };
    if (j.status === "ready" && typeof j.url === "string" && /^https:\/\//.test(j.url)) return { status: "ready", url: j.url };
    if (j.status === "cap" || j.status === "limit" || j.status === "off" || j.status === "rate") return { status: j.status };
    return { status: "failed" };
  } catch {
    return { status: "network" };
  }
}

export const AI_MESSAGE: Record<Exclude<AiOutcome["status"], "ready">, string> = {
  cap: "TODAY'S AI VERSIONS ARE ALL TAKEN — TRY AGAIN TOMORROW",
  limit: "YOU HAVE USED YOUR 2 AI VERSIONS FOR TODAY",
  rate: "TOO MANY ATTEMPTS — PLEASE TRY AGAIN IN A WHILE",
  off: "THE AI VERSION IS NOT AVAILABLE RIGHT NOW",
  failed: "THE AI VERSION COULD NOT BE MADE — YOUR MUSIC KEEPS PLAYING",
  network: "NO CONNECTION TO THE AI VERSION — YOUR MUSIC KEEPS PLAYING",
};
