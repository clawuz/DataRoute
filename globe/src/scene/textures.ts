import { TextureLoader, type Texture, type WebGLRenderer } from "three";

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
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
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
        done++;
        onProgress(done / 3);
        return t;
      });
    try {
      const [day, night, clouds] = await Promise.all([track(urls.day), track(urls.night), track(urls.clouds)]);
      return { tier, day, night, clouds };
    } catch (e) {
      console.warn(`[textures] ${tier} failed`, e);
    }
  }
  return null;
}
