import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sam = vi.hoisted(() => ({ loaded: new Set<string>(), resolvers: [] as Array<() => void> }));
vi.mock("../src/audio/sampler", () => ({
  createSampler: () => ({
    use: async () => {},
    has: (n: string) => sam.loaded.has(n),
    ensure: () => new Promise<void>((r) => sam.resolvers.push(r)),
    dispose: () => {},
  }),
  setActiveSampler: () => {},
}));
vi.mock("../src/audio/instruments", () => ({ playNote: () => {} }));

import { createPersonalPlayer } from "../src/personal/player";

const node = () => ({ gain: { value: 0, setTargetAtTime() {} }, connect() {}, threshold: {}, ratio: {} });
const fakeCtx = () =>
  ({
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createGain: node,
    createDynamicsCompressor: node,
    createConvolver: () => ({ connect() {} }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(30000) }),
    resume: async () => {},
    close: async () => {},
  }) as unknown as AudioContext;

const piece = (inst: string) => ({ notes: [{ t: 0, d: 1, freq: 440, vel: 1, instrument: inst }], duration: 4 }) as never;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("player loading", () => {
  beforeEach(() => {
    sam.loaded.clear();
    sam.resolvers.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it("starts at once without onLoading when everything is loaded", () => {
    sam.loaded.add("a");
    const calls: boolean[] = [];
    const si = vi.spyOn(globalThis, "setInterval");
    createPersonalPlayer(fakeCtx(), (l) => calls.push(l)).play(piece("a"), () => {});
    expect(calls).toEqual([]);
    expect(si).toHaveBeenCalled();
  });

  it("waits, then starts and reports false once", async () => {
    const calls: boolean[] = [];
    const si = vi.spyOn(globalThis, "setInterval");
    const pl = createPersonalPlayer(fakeCtx(), (l) => calls.push(l));
    pl.play(piece("a"), () => {});
    expect(calls).toEqual([true]);
    expect(si).not.toHaveBeenCalled();
    sam.resolvers[0]();
    await flush();
    expect(calls).toEqual([true, false]);
    expect(si).toHaveBeenCalledTimes(1);
    pl.stop();
  });

  it("reports position 0 while a new piece waits for its samples (not the old piece's offset)", async () => {
    sam.loaded.add("a");
    const ctx = fakeCtx() as unknown as { currentTime: number };
    const pl = createPersonalPlayer(ctx as unknown as AudioContext, () => {});
    pl.play(piece("a"), () => {});
    ctx.currentTime = 10;
    expect(pl.position()).toBeGreaterThan(9);
    pl.play(piece("b"), () => {});
    expect(pl.position()).toBe(0);
    sam.resolvers[0]();
    await flush();
    expect(pl.position()).toBe(0); // the new piece starts 0.15 s ahead of the clock
    pl.stop();
  });
  it("stop() cancels a waiting start and clears loading", async () => {
    const calls: boolean[] = [];
    const si = vi.spyOn(globalThis, "setInterval");
    const pl = createPersonalPlayer(fakeCtx(), (l) => calls.push(l));
    pl.play(piece("a"), () => {});
    pl.stop();
    sam.resolvers[0]();
    await flush();
    expect(calls).toEqual([true, false]);
    expect(si).not.toHaveBeenCalled();
  });

  it("a second play() cancels the first and loading never stays true", async () => {
    const calls: boolean[] = [];
    const si = vi.spyOn(globalThis, "setInterval");
    const pl = createPersonalPlayer(fakeCtx(), (l) => calls.push(l));
    pl.play(piece("a"), () => {});
    sam.loaded.add("b");
    pl.play(piece("b"), () => {}); // immediate
    expect(si).toHaveBeenCalledTimes(1);
    sam.resolvers[0]();
    await flush();
    expect(calls).toEqual([true, false]);
    expect(si).toHaveBeenCalledTimes(1);
    pl.stop();
  });

  it("dispose() cancels a waiting start", async () => {
    const calls: boolean[] = [];
    const si = vi.spyOn(globalThis, "setInterval");
    const pl = createPersonalPlayer(fakeCtx(), (l) => calls.push(l));
    pl.play(piece("a"), () => {});
    pl.dispose();
    sam.resolvers[0]();
    await flush();
    expect(si).not.toHaveBeenCalled();
    expect(calls[calls.length - 1]).toBe(false);
  });
});
