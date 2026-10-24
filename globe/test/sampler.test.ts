import { afterEach, describe, expect, it, vi } from "vitest";
import { activeSampler, createSampler, freqOf, midiOf, pickZone, rateFor, setActiveSampler, type SampleZone } from "../src/audio/sampler";

const Z = (root: number, lo: number, hi: number, file = `n${root}.ogg`, vel?: [number, number]): SampleZone => ({ root, lo, hi, file, vel });

describe("sampler: notes and zones", () => {
  it("converts between frequency and MIDI", () => {
    expect(midiOf(440)).toBeCloseTo(69, 6);
    expect(freqOf(60)).toBeCloseTo(261.6256, 3);
    expect(midiOf(freqOf(48.5))).toBeCloseTo(48.5, 6);
  });
  it("picks the zone that covers the note, else the nearest", () => {
    const zones = [Z(48, 44, 52), Z(60, 53, 64), Z(72, 65, 80)];
    expect(pickZone(zones, 58)?.root).toBe(60);
    expect(pickZone(zones, 44)?.root).toBe(48);
    expect(pickZone(zones, 90)?.root).toBe(72); // above the range: the top zone
    expect(pickZone(zones, 30)?.root).toBe(48);
    expect(pickZone([], 60)).toBeNull();
  });
  it("chooses the velocity layer and falls back when none answers", () => {
    const zones = [Z(60, 0, 127, "soft.ogg", [0, 0.5]), Z(60, 0, 127, "loud.ogg", [0.5, 1])];
    expect(pickZone(zones, 60, 0.3)?.file).toBe("soft.ogg");
    expect(pickZone(zones, 60, 0.9)?.file).toBe("loud.ogg");
  });
  it("pitches a recording by the distance from its root, within a limit", () => {
    expect(rateFor(freqOf(60), 60)).toBeCloseTo(1, 9);
    expect(rateFor(freqOf(72), 72 - 12, 12)).toBeCloseTo(2, 9);
    expect(rateFor(freqOf(67), 60)).toBeCloseTo(2 ** (7 / 12), 9);
    expect(rateFor(freqOf(90), 60, 6)).toBeCloseTo(2 ** (6 / 12), 9); // a stated limit holds
  });
});

describe("sampler: without a pack the synth plays", () => {
  it("does not claim an instrument it has not loaded", () => {
    const s = createSampler({} as unknown as AudioContext);
    expect(s.has("VIOLIN")).toBe(false);
    expect(s.play({} as AudioNode, "VIOLIN", 440, 0.7, 0, 1)).toBe(false);
  });
  it("keeps an active sampler until it is cleared", () => {
    const s = createSampler({} as unknown as AudioContext);
    setActiveSampler(s);
    expect(activeSampler()).toBe(s);
    setActiveSampler(null);
    expect(activeSampler()).toBeNull();
  });
});

describe("sampler: use and ensure", () => {
  const MANIFEST = {
    name: "t",
    instruments: {
      A: { zones: [{ root: 60, lo: 0, hi: 127, file: "a/a1.mp3" }, { root: 72, lo: 0, hi: 127, file: "a/a2.mp3" }] },
      B: { zones: [{ root: 60, lo: 0, hi: 127, file: "b/b1.mp3" }] },
      C: { use: "A", zones: [] },
    },
  };
  const ctx = { decodeAudioData: async () => ({ duration: 1 }) as unknown as AudioBuffer } as unknown as AudioContext;
  const fetched: string[] = [];
  const stub = (never?: string): void => {
    fetched.length = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      if (never && url.endsWith(never)) return new Promise(() => {});
      return url.endsWith("manifest.json") ? { ok: true, json: async () => MANIFEST } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
  };
  afterEach(() => vi.unstubAllGlobals());

  it("downloads only the files of the instruments asked for", async () => {
    stub();
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json"]);
    expect(fetched).toEqual(["/x/manifest.json"]);
    await s.ensure(["A"]);
    expect(fetched.sort()).toEqual(["/x/a/a1.mp3", "/x/a/a2.mp3", "/x/manifest.json"].sort());
    expect(s.has("A")).toBe(true);
    expect(s.has("B")).toBe(false);
  });
  it("does not fetch twice and builds an instrument that uses another one", async () => {
    stub();
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json", "/x/manifest.json"]);
    await s.ensure(["A", "C"]);
    await s.ensure(["A"]);
    expect(fetched.filter((u) => u.endsWith("a1.mp3")).length).toBe(1);
    expect(fetched.filter((u) => u.endsWith("manifest.json")).length).toBe(1);
    expect(s.has("C")).toBe(true);
  });
  it("lets an unknown name through and gives up on a file that never arrives", async () => {
    stub("b1.mp3");
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json"]);
    const t0 = Date.now();
    await s.ensure(["NOPE", "B"], 40);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(s.has("NOPE")).toBe(false);
    expect(s.has("B")).toBe(false);
  });
  it("waits for the catalogue before looking names up", async () => {
    stub();
    const s = createSampler(ctx);
    const loading = s.use(["/x/manifest.json"]);
    await s.ensure(["B"]); // called before `use` has finished
    await loading;
    expect(s.has("B")).toBe(true);
  });
  it("survives instruments that use each other or themselves", async () => {
    fetched.length = 0;
    const LOOPS = { name: "t", instruments: { X: { use: "Y", zones: [] }, Y: { use: "X", zones: [] }, S: { use: "S", zones: [] } } };
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => LOOPS }));
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json"]);
    await expect(s.ensure(["X", "Y", "S"], 200)).resolves.toBeUndefined();
    expect(s.has("X")).toBe(false);
    expect(s.has("Y")).toBe(false);
    expect(s.has("S")).toBe(false);
  });
});
