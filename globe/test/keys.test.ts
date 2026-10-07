import { describe, expect, it } from "vitest";
import { SCRUB_SEC, keyToCommand } from "../src/app/keys";

describe("keyToCommand", () => {
  it("maps the installation keys", () => {
    expect(SCRUB_SEC).toBe(3600);
    expect(keyToCommand(" ")).toBe("togglePause");
    expect(keyToCommand("ArrowLeft")).toBe("scrubBack");
    expect(keyToCommand("ArrowRight")).toBe("scrubForward");
    expect(keyToCommand("r")).toBe("toggleReplay");
    expect(keyToCommand("R")).toBe("toggleReplay");
    expect(keyToCommand("h")).toBe("toggleHud");
    expect(keyToCommand("F")).toBe("fullscreen");
    expect(keyToCommand("Escape")).toBe("exitFollow");
    expect(keyToCommand("g")).toBe("exitFollow");
    expect(keyToCommand("G")).toBe("exitFollow");
    expect(keyToCommand("t")).toBe("toggleTour");
    expect(keyToCommand("c")).toBe("toggleCorridors");
    expect(keyToCommand("C")).toBe("toggleCorridors");
    expect(keyToCommand("a")).toBe("toggleAurora");
    expect(keyToCommand("m")).toBe("toggleSound");
    expect(keyToCommand("M")).toBe("toggleSound");
    expect(keyToCommand("T")).toBe("toggleTour");
    expect(keyToCommand("[")).toBe("slower");
    expect(keyToCommand("-")).toBe("slower"); // reachable on every layout
    expect(keyToCommand("+")).toBe("faster");
    expect(keyToCommand("=")).toBe("faster");
    expect(keyToCommand("]")).toBe("faster");
    expect(keyToCommand("x")).toBeNull();
  });
});
