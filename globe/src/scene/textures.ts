import { NoColorSpace, RepeatWrapping, TextureLoader, type Texture, type WebGLRenderer } from "three";

export type TextureTier = "16k" | "8k" | "4k";

export interface TierInputs {
  maxTextureSize: number;
  deviceMemory?: number;
  coarsePointer: boolean;
  /** window.innerWidth × devicePixelRatio */
  viewportPx?: number;
  /** from the URL `?tex=` parameter */
  override?: TextureTier;
  /** highest tier allowed (set after a WebGL context loss) */
  cap?: TextureTier;
}

const ORDER: TextureTier[] = ["4k", "8k", "16k"];
const MIN_TEXTURE_SIZE: Record<TextureTier, number> = { "4k": 0, "8k": 8192, "16k": 16384 };
const CAP_KEY = "earthTierCap";

export const isTier = (v: unknown): v is TextureTier => v === "16k" || v === "8k" || v === "4k";

/** The next lower tier (null for 4k). */
export const lowerTier = (t: TextureTier): TextureTier | null => ORDER[ORDER.indexOf(t) - 1] ?? null;

/** 16K day maps cost ≈ 700 MB+ of GPU memory, 8K ≈ 350 MB; only use them where that is safe. */
export function chooseTier(i: TierInputs): TextureTier {
  let tier: TextureTier;
  if (i.override) {
    tier = i.override;
    while (i.maxTextureSize < MIN_TEXTURE_SIZE[tier]) tier = lowerTier(tier)!;
  } else if (i.maxTextureSize >= 16384 && (i.deviceMemory ?? 8) >= 8 && !i.coarsePointer && (i.viewportPx ?? 0) >= 2200) {
    tier = "16k";
  } else {
    tier = i.maxTextureSize >= 8192 && (i.deviceMemory ?? 8) > 4 && !i.coarsePointer ? "8k" : "4k";
  }
  if (i.cap && ORDER.indexOf(tier) > ORDER.indexOf(i.cap)) tier = i.cap;
  return tier;
}

export interface EarthTextureUrls {
  day: string;
  night: string;
  clouds: string;
}

export const textureUrls = (tier: TextureTier): EarthTextureUrls => ({
  day: `/textures/day-${tier}.jpg`,
  night: `/textures/night-${tier}.jpg`,
  clouds: "/textures/clouds-2k.jpg",
});

export interface EarthTextures {
  tier: TextureTier;
  day: Texture;
  night: Texture;
  clouds: Texture;
}

export function readTierCap(): TextureTier | undefined {
  try {
    const v = sessionStorage.getItem(CAP_KEY);
    return isTier(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function writeTierCap(tier: TextureTier): void {
  try {
    sessionStorage.setItem(CAP_KEY, tier);
  } catch {
    /* storage blocked */
  }
}

export function detectTierInputs(renderer: WebGLRenderer): TierInputs {
  const gl = renderer.getContext();
  let override: TextureTier | undefined;
  if (typeof location !== "undefined") {
    const v = new URLSearchParams(location.search).get("tex");
    if (isTier(v)) override = v;
  }
  return {
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    deviceMemory: typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    coarsePointer: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
    viewportPx: typeof window === "undefined" ? undefined : window.innerWidth * (window.devicePixelRatio || 1),
    override,
    cap: readTierCap(),
  };
}

const defaultLoad = (url: string) => new TextureLoader().loadAsync(url);

/**
 * Loads day/night/clouds for `preferred`; on failure steps down 16k → 8k → 4k. Returns null when nothing
 * could be loaded (the Earth then renders with flat colours). `onProgress` reports completed files / total.
 */
export async function loadEarthTextures(
  renderer: WebGLRenderer,
  preferred: TextureTier,
  onProgress: (p: number) => void,
  load: (url: string) => Promise<Texture> = defaultLoad,
): Promise<EarthTextures | null> {
  const tiers = ORDER.slice(0, ORDER.indexOf(preferred) + 1).reverse();
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  for (const tier of tiers) {
    const urls = textureUrls(tier);
    let done = 0;
    const track = (url: string) =>
      load(url).then((t) => {
        t.anisotropy = aniso;
        // Maps are sampled raw (display space) and the renderer outputs linear: no conversion. flipY stays true so
        // the first (north) image row lands at v = 1, matching v = (lat + π/2) / π in the Earth shader.
        t.colorSpace = NoColorSpace;
        t.flipY = true;
        t.wrapS = RepeatWrapping; // cloud drift and the antimeridian rely on horizontal wrap
        done++;
        onProgress(done / 3);
        return t;
      });
    const results = await Promise.allSettled([track(urls.day), track(urls.night), track(urls.clouds)]);
    if (results.every((r) => r.status === "fulfilled")) {
      const [day, night, clouds] = results.map((r) => (r as PromiseFulfilledResult<Texture>).value);
      return { tier, day, night, clouds };
    }
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    console.warn(`[textures] ${tier} failed`, failure?.reason);
    for (const r of results) if (r.status === "fulfilled") r.value.dispose();
  }
  return null;
}

/** NASA Deep Star Maps 2020 (celestial coordinates). Returns null on failure, never throws. */
export async function loadStarMap(load: (url: string) => Promise<Texture> = defaultLoad): Promise<Texture | null> {
  try {
    const t = await load("/textures/stars-4k.jpg");
    t.colorSpace = NoColorSpace;
    t.wrapS = RepeatWrapping;
    return t;
  } catch (e) {
    console.warn("[textures] star map unavailable", e);
    return null;
  }
}
