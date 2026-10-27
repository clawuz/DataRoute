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
  it("gives up within its time even when the manifest never arrives", async () => {
    stub("manifest.json");
    const s = createSampler(ctx);
    void s.use(["/x/manifest.json"]);
    const t0 = Date.now();
    await expect(s.ensure(["A"], 40)).resolves.toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(s.has("A")).toBe(false);
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

describe("sampler: a per-note glide", () => {
  type Ev = [string, number, number?];
  const setup = async (glide?: { semitones: number; sec: number }, filter?: { type: string; freq: number; q?: number }) => {
    const filters: { type: string; frequency: { value: number }; Q: { value: number } }[] = [];
    const detunes: Ev[][] = [];
    const param = (log: Ev[]) => ({
      value: 0,
      setValueAtTime: (v: number, t: number) => void log.push(["set", v, t]),
      linearRampToValueAtTime: (v: number, t: number) => void log.push(["ramp", v, t]),
      exponentialRampToValueAtTime: (v: number, t: number) => void log.push(["exp", v, t]),
    });
    const gainLogs: Ev[][] = [];
    const gain = () => {
      const log: Ev[] = [];
      gainLogs.push(log);
      return { gain: param(log), connect() {}, disconnect() {} };
    };
    const ctx = {
      decodeAudioData: async () => ({ duration: 2 }) as unknown as AudioBuffer,
      createGain: gain,
      createBiquadFilter: () => {
        const f = { type: "", frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect() {}, disconnect() {} };
        filters.push(f);
        return f;
      },
      createBufferSource: () => {
        const log: Ev[] = [];
        detunes.push(log);
        return { buffer: null, playbackRate: param([]), detune: param(log), connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
      },
    } as unknown as AudioContext;
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ name: "t", instruments: { G: { zones: [{ root: 60, lo: 0, hi: 127, file: "g.mp3" }], layers: [{ detune: 7, gain: 1 }], glide, filter } } }) }
        : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json"]);
    await s.ensure(["G"]);
    return { s, detunes, gainLogs, filters };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("starts a glided note below its pitch and ramps up in 0.08 s", async () => {
    const { s, detunes } = await setup();
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1, undefined, 2);
    expect(detunes[0]).toEqual([["set", 7 - 200, 1], ["ramp", 7, 1.08]]);
  });
  it("leaves a note without glide exactly as before", async () => {
    const { s, detunes } = await setup();
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1);
    expect(detunes[0]).toEqual([["set", 7, 1]]);
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1, undefined, 0);
    expect(detunes[1]).toEqual([["set", 7, 1]]);
  });
  it("adds to the instrument's own glide and takes the longer ramp", async () => {
    const { s, detunes } = await setup({ semitones: 1, sec: 0.2 });
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1, undefined, 2);
    expect(detunes[0]).toEqual([["set", 7 - 300, 1], ["ramp", 7, 1.2]]);
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1);
    expect(detunes[1]).toEqual([["set", 7 - 100, 1], ["ramp", 7, 1.2]]);
  });
  it("a note with a cutoff gets a low-pass of that frequency; without it no filter is made", async () => {
    const { s, filters } = await setup();
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1);
    expect(filters.length).toBe(0);
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1, undefined, undefined, undefined, 3000);
    expect(filters.length).toBe(1);
    expect(filters[0].type).toBe("lowpass");
    expect(filters[0].frequency.value).toBe(3000);
    expect(filters[0].Q.value).toBeCloseTo(0.6, 9);
  });
  it("an instrument with its own low-pass takes the lower cutoff and gets no second filter", async () => {
    const { s, filters } = await setup(undefined, { type: "lowpass", freq: 2000 });
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1, undefined, undefined, undefined, 5000);
    expect(filters.length).toBe(1);
    expect(filters[0].frequency.value).toBe(2000);
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1, undefined, undefined, undefined, 1500);
    expect(filters[1].frequency.value).toBe(1500);
  });
  it("an instrument with another kind of filter keeps it and gets the low-pass besides", async () => {
    const { s, filters } = await setup(undefined, { type: "peaking", freq: 900 });
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 1, undefined, undefined, undefined, 4000);
    expect(filters.map((f) => f.type).sort()).toEqual(["lowpass", "peaking"]);
  });
  it("a short note never gets the filter", async () => {
    const { s, filters } = await setup();
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 0.1, undefined, undefined, true, 3000);
    expect(filters.length).toBe(0);
  });
  it("a short (hidden gesture) note releases in 0.25 s; others keep the recorded tail", async () => {
    const { s, gainLogs } = await setup();
    const expAt = (): number => gainLogs.flat().filter((e) => e[0] === "exp").map((e) => e[2]).pop()!;
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 0.1);
    expect(expAt()).toBeCloseTo(1.1 + 1.2, 9);
    s.play({} as AudioNode, "G", freqOf(60), 0.7, 1, 0.1, undefined, undefined, true);
    expect(expAt()).toBeCloseTo(1.1 + 0.25, 9);
  });
});

