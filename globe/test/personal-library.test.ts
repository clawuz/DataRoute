import { describe, expect, it } from "vitest";
import { LIBRARY, pickTrack } from "../src/personal/library";

describe("the studio library", () => {
  it("lists real tracks", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(10);
    for (const t of LIBRARY) {
      expect(t.file).toMatch(/\.mp3$/);
      expect(["visited", "wish"]).toContain(t.mode);
      expect(t.regions.length).toBeGreaterThan(0);
    }
  });
  it("finds the track that is like the picks", () => {
    expect(pickTrack(LIBRARY, "visited", ["EUR"], 2)?.track.file).toBe("visited-EUR.mp3");
    expect(pickTrack(LIBRARY, "wish", ["ASI"], 1)?.track.file).toBe("wish-ASI.mp3");
    expect(pickTrack(LIBRARY, "visited", ["DOM"], 1)?.track.file).toBe("visited-DOM.mp3");
    expect(pickTrack(LIBRARY, "visited", ["AFR", "MEA"], 3)?.track.file).toBe("visited-AFRMEA.mp3");
  });
  it("prefers the longer piece for many places", () => {
    expect(pickTrack(LIBRARY, "visited", ["AME", "ASI", "EUR"], 12)?.track.file).toBe("visited-AMEASIEUR-L.mp3");
    expect(pickTrack(LIBRARY, "visited", ["AME", "ASI", "EUR"], 4)?.track.file).toBe("visited-AMEASIEUR.mp3");
  });
  it("says nothing when nothing is alike", () => {
    expect(pickTrack(LIBRARY, "wish", ["DOM", "MEA", "AFR"], 5)).toBeNull();
  });
});
