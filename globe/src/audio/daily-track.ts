// art:track — the daily track (DEACTIVATED). When switched on, the site reads a pointer file the daily-music pipeline
// publishes (public/music/latest.json in the project's Storage bucket) and plays that day's recording instead of the
// bundled one. Off by default: no request is made and nothing changes. Any failure falls back to the bundled track.

export const DAILY_BUCKET = "omerkilavuz-9ad41.firebasestorage.app";
const FLAG_KEY = "dataroute.dailyMusic";

export interface TrackSources {
  trackUrl: string;
  notesUrl: string;
  date?: string;
  genre?: string;
}

/** Pure: is the daily track switched on? (build flag, `?daily=1`, or the localStorage key the page can set.) */
export function dailyEnabled(opts: { env?: string; search?: string; stored?: string | null } = {}): boolean {
  if (opts.env === "1") return true;
  if (opts.search && new URLSearchParams(opts.search).get("daily") === "1") return true;
  return opts.stored === "1";
}

/** Pure: a Storage object path → its public download URL. */
export const storageUrl = (path: string, bucket = DAILY_BUCKET): string =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;

const PATH_RE = /^public\/music\/\d{4}-\d{2}-\d{2}\/[a-z0-9._-]+$/;

/** Pure: validates a pointer (never trust a remote file): only public/music/<date>/<name> paths are accepted. */
export function parsePointer(raw: unknown, bucket = DAILY_BUCKET): TrackSources | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.track !== "string" || typeof p.notes !== "string") return null;
  if (!PATH_RE.test(p.track) || !PATH_RE.test(p.notes)) return null;
  return {
    trackUrl: storageUrl(p.track, bucket),
    notesUrl: storageUrl(p.notes, bucket),
    date: typeof p.date === "string" ? p.date : undefined,
    genre: typeof p.genre === "string" ? p.genre : undefined,
  };
}

/** The sources of the daily track, or null (disabled, missing, unreadable): the caller then uses the bundled one. */
export async function resolveDailyTrack(
  enabled: boolean,
  fetchFn: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (u) => fetch(u),
  bucket = DAILY_BUCKET,
): Promise<TrackSources | null> {
  if (!enabled) return null;
  try {
    const res = await fetchFn(storageUrl("public/music/latest.json", bucket));
    if (!res.ok) return null;
    return parsePointer(await res.json(), bucket);
  } catch {
    return null;
  }
}

/** The page's switch (reads the build flag, the URL and localStorage; never throws). */
export function dailyFlag(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(FLAG_KEY);
  } catch {
    /* blocked storage */
  }
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_DAILY_MUSIC;
  return dailyEnabled({ env, search: typeof location !== "undefined" ? location.search : "", stored });
}
