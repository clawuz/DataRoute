import { describe, expect, it } from "vitest";
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
