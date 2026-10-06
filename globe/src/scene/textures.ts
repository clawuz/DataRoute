import { NoColorSpace, RepeatWrapping, TextureLoader, type Texture, type WebGLRenderer } from "three";

export type TextureTier = "8k" | "4k";

export interface TierInputs {
  maxTextureSize: number;
  deviceMemory?: number;
  coarsePointer: boolean;
}

/** 8K day/night maps cost ≈ 350 MB of GPU memory; only use them where that is safe. */
export function chooseTier(i: TierInputs): TextureTier {
  return i.maxTextureSize >= 8192 && (i.deviceMemory ?? 8) > 4 && !i.coarsePointer ? "8k" : "4k";
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

export function detectTierInputs(renderer: WebGLRenderer): TierInputs {
  const gl = renderer.getContext();
  return {
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    deviceMemory: typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    coarsePointer: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
  };
}

const defaultLoad = (url: string) => new TextureLoader().loadAsync(url);

/**
 * Loads day/night/clouds for `preferred`; on failure retries once with the 4k tier. Returns null when nothing
 * could be loaded (the Earth then renders with flat colours). `onProgress` reports completed files / total.
 */
export async function loadEarthTextures(
  renderer: WebGLRenderer,
  preferred: TextureTier,
  onProgress: (p: number) => void,
  load: (url: string) => Promise<Texture> = defaultLoad,
): Promise<EarthTextures | null> {
  const tiers: TextureTier[] = preferred === "8k" ? ["8k", "4k"] : ["4k"];
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
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
