import { Texture, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { chooseTier, loadEarthTextures, textureUrls } from "../src/scene/textures";

const renderer = { capabilities: { getMaxAnisotropy: () => 16 } } as unknown as WebGLRenderer;

describe("chooseTier", () => {
  const big = { maxTextureSize: 16384, deviceMemory: 8, coarsePointer: false, viewportPx: 3000 };

  it("16k only on capable, non-touch, well-provisioned, large-screen devices", () => {
    expect(chooseTier(big)).toBe("16k");
    expect(chooseTier({ ...big, deviceMemory: undefined })).toBe("16k"); // memory unknown → assume 8
    expect(chooseTier({ ...big, viewportPx: 2200 })).toBe("16k");
    expect(chooseTier({ ...big, viewportPx: 2199 })).toBe("8k");
    expect(chooseTier({ ...big, viewportPx: undefined })).toBe("8k");
    expect(chooseTier({ ...big, coarsePointer: true })).toBe("4k");
    expect(chooseTier({ ...big, maxTextureSize: 8192 })).toBe("8k");
    expect(chooseTier({ ...big, deviceMemory: 4 })).toBe("4k");
    expect(chooseTier({ ...big, deviceMemory: 6 })).toBe("8k");
  });

  it("falls back to the 8k/4k rule", () => {
    expect(chooseTier({ maxTextureSize: 8192, coarsePointer: false })).toBe("8k");
    expect(chooseTier({ maxTextureSize: 4096, deviceMemory: 8, coarsePointer: false })).toBe("4k");
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 4, coarsePointer: false })).toBe("4k");
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 8, coarsePointer: true })).toBe("4k");
  });

  it("override wins when the GPU allows it, otherwise steps down", () => {
    const weak = { maxTextureSize: 16384, deviceMemory: 2, coarsePointer: true, viewportPx: 800 };
    expect(chooseTier({ ...weak, override: "16k" })).toBe("16k");
    expect(chooseTier({ ...weak, override: "8k" })).toBe("8k");
    expect(chooseTier({ ...big, override: "4k" })).toBe("4k");
    expect(chooseTier({ ...big, maxTextureSize: 8192, override: "16k" })).toBe("8k");
    expect(chooseTier({ ...big, maxTextureSize: 4096, override: "16k" })).toBe("4k");
    expect(chooseTier({ ...big, maxTextureSize: 4096, override: "8k" })).toBe("4k");
  });

  it("cap limits the result, even over an override", () => {
    expect(chooseTier({ ...big, cap: "8k" })).toBe("8k");
    expect(chooseTier({ ...big, cap: "4k" })).toBe("4k");
    expect(chooseTier({ ...big, cap: "16k" })).toBe("16k");
    expect(chooseTier({ ...big, override: "16k", cap: "8k" })).toBe("8k");
    expect(chooseTier({ maxTextureSize: 4096, coarsePointer: false, cap: "8k" })).toBe("4k");
  });
});

describe("textureUrls", () => {
  it("builds per-tier urls; clouds are always 2k", () => {
    expect(textureUrls("8k")).toEqual({ day: "/textures/day-8k.jpg", night: "/textures/night-8k.jpg", clouds: "/textures/clouds-2k.jpg" });
    expect(textureUrls("16k")).toEqual({ day: "/textures/day-16k.jpg", night: "/textures/night-16k.jpg", clouds: "/textures/clouds-2k.jpg" });
    expect(textureUrls("4k").day).toBe("/textures/day-4k.jpg");
  });
});

describe("loadEarthTextures", () => {
  const okLoad = async () => new Texture();

  it("loads the preferred tier, applies anisotropy and reports progress up to 1", async () => {
    const progress: number[] = [];
    const t = await loadEarthTextures(renderer, "8k", (p) => progress.push(p), okLoad);
    expect(t!.tier).toBe("8k");
    expect(t!.day.anisotropy).toBe(16);
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("falls back from 8k to 4k when the 8k files fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const urls: string[] = [];
    const load = async (url: string) => {
      urls.push(url);
      if (url.includes("8k")) throw new Error("404");
      return new Texture();
    };
    const t = await loadEarthTextures(renderer, "8k", () => {}, load);
    expect(t!.tier).toBe("4k");
    expect(urls.some((u) => u.includes("day-4k"))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1); // the failed 8k attempt is logged once
    warn.mockRestore();
  });

  it("disposes textures that loaded in a tier that failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loaded: Texture[] = [];
    const load = async (url: string) => {
      if (url.includes("night-8k")) throw new Error("404");
      const t = new Texture();
      if (url.includes("8k") || url.includes("clouds")) loaded.push(t);
      return t;
    };
    const disposed = new Set<Texture>();
    const orig = Texture.prototype.dispose;
    Texture.prototype.dispose = function (this: Texture) {
      disposed.add(this);
      return orig.call(this);
    };
    try {
      await loadEarthTextures(renderer, "8k", () => {}, load);
    } finally {
      Texture.prototype.dispose = orig;
      warn.mockRestore();
    }
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.slice(0, 2).every((t) => disposed.has(t))).toBe(true);
  });

  it("returns null when every tier fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = await loadEarthTextures(renderer, "8k", () => {}, async () => {
      throw new Error("boom");
    });
    expect(t).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2); // 8k and 4k
    warn.mockRestore();
  });

  it("falls back 16k → 8k → 4k → null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const urls: string[] = [];
    const t16 = await loadEarthTextures(renderer, "16k", () => {}, async (u) => {
      urls.push(u);
      if (u.includes("16k")) throw new Error("404");
      return new Texture();
    });
    expect(t16!.tier).toBe("8k");
    const t4 = await loadEarthTextures(renderer, "16k", () => {}, async (u) => {
      if (u.includes("day-16k") || u.includes("day-8k")) throw new Error("404");
      return new Texture();
    });
    expect(t4!.tier).toBe("4k");
    const none = await loadEarthTextures(renderer, "16k", () => {}, async () => {
      throw new Error("x");
    });
    expect(none).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1 + 2 + 3);
    warn.mockRestore();
  });

  it("a 4k request never tries 8k", async () => {
    const urls: string[] = [];
    await loadEarthTextures(renderer, "4k", () => {}, async (u) => {
      urls.push(u);
      return new Texture();
    });
    expect(urls.every((u) => !u.includes("8k"))).toBe(true);
  });
});
