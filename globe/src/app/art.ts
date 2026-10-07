export interface ArtState {
  /** master switch: false when the URL has ?art=0 */
  enabled: boolean;
  corridors: boolean;
  aurora: boolean;
  sound: boolean;
}
export type ArtAction = "corridors" | "aurora" | "sound";
export const ART_STORAGE_KEY = "dataroute.art";

const DEFAULTS = { corridors: true, aurora: false, sound: false };

function defaultRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function defaultWrite(key: string, value: string): void {
  localStorage.setItem(key, value);
}

export function initArt(search: string, read: (key: string) => string | null = defaultRead): ArtState {
  if (new URLSearchParams(search).get("art") === "0") return { enabled: false, corridors: false, aurora: false, sound: false };
  const s: ArtState = { enabled: true, ...DEFAULTS };
  try {
    const raw = read(ART_STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      for (const k of ["corridors", "aurora", "sound"] as const) if (typeof o[k] === "boolean") s[k] = o[k] as boolean;
    }
  } catch {
    /* blocked storage or garbage: keep defaults */
  }
  return s;
}

export function toggleArt(s: ArtState, a: ArtAction): ArtState {
  return s.enabled ? { ...s, [a]: !s[a] } : s;
}

export function persistArt(s: ArtState, write: (key: string, value: string) => void = defaultWrite): void {
  try {
    write(ART_STORAGE_KEY, JSON.stringify({ corridors: s.corridors, aurora: s.aurora, sound: s.sound }));
  } catch {
    /* storage unavailable */
  }
}

export interface Effects {
  twilight: boolean;
  cloudShadow: boolean;
  glare: boolean;
  aurora: boolean;
  corridors: boolean;
  sound: boolean;
  starMap: boolean;
}

/** Which effects run for an art state at a quality level (0 = best). Aurora drops first, then cloud shadows. */
export function effectsFor(s: ArtState, qualityLevel: number): Effects {
  if (!s.enabled) return { twilight: false, cloudShadow: false, glare: false, aurora: false, corridors: false, sound: false, starMap: false };
  return {
    twilight: true,
    cloudShadow: qualityLevel < 2,
    glare: true,
    aurora: s.aurora && qualityLevel < 1,
    corridors: s.corridors,
    sound: s.sound,
    starMap: true,
  };
}
