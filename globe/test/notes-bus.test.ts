import { describe, expect, it, vi } from "vitest";
import { createNoteBus, laneOf, type NoteEvent } from "../src/audio/notes-bus";

const note = (o: Partial<NoteEvent> = {}): NoteEvent => ({
  instrument: "EUR", lane: "EUR", freq: 440, pitch: 440, vel: 0.8, kind: "line", key: "IST-FRA", at: 1, durSec: 0.25, lineId: "f1", ...o,
});

describe("note bus", () => {
  it("delivers emitted notes to every subscriber until it unsubscribes", () => {
    const bus = createNoteBus();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.subscribe(a);
    bus.subscribe(b);
    const n = note();
    bus.emit(n);
    expect(a).toHaveBeenCalledWith(n);
    expect(b).toHaveBeenCalledWith(n);
    offA();
    bus.emit(note({ key: "IST-JFK" }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
  it("emitting without subscribers is a no-op", () => {
    expect(() => createNoteBus().emit(note())).not.toThrow();
  });
  it("lanes: every instrument is its own lane, the open hat shares the hat lane", () => {
    expect(laneOf("OHAT")).toBe("HAT");
    expect(laneOf("HAT")).toBe("HAT");
    expect(laneOf("KICK")).toBe("KICK");
    expect(laneOf("NEY")).toBe("NEY");
  });
});
