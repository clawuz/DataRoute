/**
 * AI version of a personal piece (A World of Music, personal site).
 *
 * The site asks for it on request ("AI version"), never automatically. The request carries only the *character* of the
 * piece — mode, the top regions, a size bucket — not the places, so the cache is shared and the cost is bounded:
 * at most (2 modes × 63 region sets × 3 sizes) different tracks can ever exist.
 *
 * Guard rails: a hard cap of DAILY_CAP new tracks per UTC day, PER_VISITOR_CAP per visitor (IP hash) per day, and a kill
 * switch (PERSONAL_MUSIC_ENABLED=false). When any of them says no, the site keeps playing the music it composes itself.
 */
export const DAILY_CAP = 100;
export const PER_VISITOR_CAP = 2;

export const REGIONS = ["DOM", "EUR", "MEA", "AFR", "ASI", "AME"] as const;
export type Region = (typeof REGIONS)[number];
export type Mode = "visited" | "wish";
export type Size = "S" | "M" | "L";

export interface Character {
  mode: Mode;
  /** the one to three regions the piece is mostly about, most important first */
  regions: Region[];
  size: Size;
}

/** Validates the request body; anything unexpected gives null. */
export function parseCharacter(body: unknown): Character | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.mode !== "visited" && b.mode !== "wish") return null;
  if (b.size !== "S" && b.size !== "M" && b.size !== "L") return null;
  if (!Array.isArray(b.regions) || b.regions.length < 1 || b.regions.length > 3) return null;
  const regions: Region[] = [];
  for (const r of b.regions) {
    if (!(REGIONS as readonly unknown[]).includes(r) || regions.includes(r as Region)) return null;
    regions.push(r as Region);
  }
  return { mode: b.mode, regions, size: b.size };
}

/** Cache key: the same character always maps to the same track. Region order does not matter. */
export const characterKey = (c: Character): string => `${c.mode}-${[...c.regions].sort().join("")}-${c.size}`;

const MODE_STYLES: Record<Mode, { name: string; tags: string[]; bpm: number }> = {
  visited: { name: "journey", tags: ["warm nostalgic orchestral", "memories of travel", "lyrical strings", "gentle piano", "reflective and heartfelt"], bpm: 84 },
  wish: { name: "dream", tags: ["bright hopeful orchestral", "anticipation of a journey", "uplifting strings", "sparkling harp", "optimistic and open"], bpm: 100 },
};

const REGION_COLOUR: Record<Region, string> = {
  DOM: "Anatolian folk colours, saz-like plucked lines",
  EUR: "elegant piano and woodwind lines",
  MEA: "modal oud and kanun colours, makam inflections",
  AFR: "polyrhythmic marimba and percussion colours",
  ASI: "pentatonic harp and koto-like colours",
  AME: "warm string and flute colours, open horn calls",
};

const SECTIONS: { name: string; share: number; dyn: string[] }[] = [
  { name: "Intro", share: 0.1, dyn: ["very soft", "sparse", "intimate"] },
  { name: "Verse", share: 0.25, dyn: ["gentle", "flowing", "building"] },
  { name: "Build", share: 0.15, dyn: ["growing", "rising energy", "full arrangement"] },
  { name: "Chorus", share: 0.25, dyn: ["powerful", "full orchestra", "climactic"] },
  { name: "Break", share: 0.13, dyn: ["gentle", "spacious", "reflective"] },
  { name: "Outro", share: 0.12, dyn: ["fading", "resolving", "peaceful"] },
];

const SIZE_MS: Record<Size, number> = { S: 150_000, M: 165_000, L: 180_000 };

export interface PlanChunk {
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles: string[];
  context_adherence: "high";
}

/** The ElevenLabs composition plan for a character: one chunk per part of the form, about 2:30–3:00 in all. */
export function buildPlan(c: Character): { chunks: PlanChunk[] } {
  const total = SIZE_MS[c.size];
  const m = MODE_STYLES[c.mode];
  const colours = c.regions.map((r) => REGION_COLOUR[r]);
  const chunks = SECTIONS.map((s, i) => ({
    text: `[${s.name}]`,
    duration_ms: Math.max(3000, Math.round((total * s.share) / 500) * 500),
    positive_styles: [...(i === 0 ? m.tags : m.tags.slice(0, 3)), ...colours, `${m.bpm} BPM`, ...s.dyn, "instrumental"],
    negative_styles: ["vocals", "lyrics", "singing", "spoken words"],
    context_adherence: "high" as const,
  }));
  return { chunks };
}

/** UTC day id, e.g. 2026-10-14 */
export const dayId = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10);

export interface Store {
  /** the public URL of a finished track, or null */
  find(key: string): Promise<string | null>;
  /** counts one new track against the day and the visitor; "ok" only when both are under their cap (atomic) */
  claim(day: string, visitor: string, caps: { daily: number; visitor: number }): Promise<"ok" | "cap" | "limit">;
  /** gives a claim back (the composition failed) */
  release(day: string, visitor: string): Promise<void>;
  save(key: string, mp3: Uint8Array): Promise<string>;
}

export interface Deps {
  store: Store;
  /** composes the plan into an mp3; may throw */
  compose: (plan: { chunks: PlanChunk[] }) => Promise<Uint8Array>;
  now: () => number;
  enabled: boolean;
}

export type Outcome =
  | { status: "ready"; url: string; cached: boolean }
  | { status: "cap" | "limit" | "off" | "bad-request" | "failed" };

export async function handleRequest(body: unknown, visitor: string, d: Deps): Promise<Outcome> {
  const c = parseCharacter(body);
  if (!c) return { status: "bad-request" };
  const key = characterKey(c);
  const hit = await d.store.find(key); // a cached track costs nothing and is always allowed
  if (hit) return { status: "ready", url: hit, cached: true };
  if (!d.enabled) return { status: "off" };
  const day = dayId(d.now());
  const claim = await d.store.claim(day, visitor, { daily: DAILY_CAP, visitor: PER_VISITOR_CAP });
  if (claim !== "ok") return { status: claim };
  try {
    const mp3 = await d.compose(buildPlan(c));
    const url = await d.store.save(key, mp3);
    return { status: "ready", url, cached: false };
  } catch {
    await d.store.release(day, visitor);
    return { status: "failed" };
  }
}
