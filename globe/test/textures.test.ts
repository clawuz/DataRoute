import { Texture, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { chooseTier, loadEarthTextures, textureUrls } from "../src/scene/textures";

const renderer = { capabilities: { getMaxAnisotropy: () => 16 } } as unknown as WebGLRenderer;

describe("chooseTier", () => {
  it("8k only on capable, non-touch, well-provisioned devices", () => {
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 8, coarsePointer: false })).toBe("8k");
    expect(chooseTier({ maxTextureSize: 8192, coarsePointer: false })).toBe("8k"); // memory unknown → assume 8
    expect(chooseTier({ maxTextureSize: 4096, deviceMemory: 8, coarsePointer: false })).toBe("4k");
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 4, coarsePointer: false })).toBe("4k");
    expect(chooseTier({ maxTextureSize: 16384, deviceMemory: 8, coarsePointer: true })).toBe("4k");
  });
});

describe("textureUrls", () => {
  it("builds per-tier urls; clouds are always 2k", () => {
    expect(textureUrls("8k")).toEqual({ day: "/textures/day-8k.jpg", night: "/textures/night-8k.jpg", clouds: "/textures/clouds-2k.jpg" });
    expect(textureUrls("4k").day).toBe("/textures/day-4k.jpg");
  });
});

describe("loadEarthTextures", () => {
  const okLoad = async () => new Texture();

  it("loads the preferred tier, applies anisotropy and reports progress up to 1", async () => {
    const progress: number[] = [];
    const t = await loadEarthTextures(renderer, "8k", (p) => progress.push(p), okLoad);
    expect(t!.tier).toBe("8k");
    expect(t!.day.anisotropy).toBe(8);
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

  it("returns null when every tier fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = await loadEarthTextures(renderer, "8k", () => {}, async () => {
      throw new Error("boom");
    });
    expect(t).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2); // 8k and 4k
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
