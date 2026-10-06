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
    expect(keyToCommand("g")).toBeNull(); // the globe toggle belongs to Plan 4
    expect(keyToCommand("x")).toBeNull();
  });
});
