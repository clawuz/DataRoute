import { describe, expect, it } from "vitest";
import { keyToCommand } from "../src/cycle/input";

describe("keyToCommand", () => {
  it("maps the installation keys", () => {
    expect(keyToCommand(" ")).toBe("togglePause");
    expect(keyToCommand("ArrowLeft")).toBe("scrubBack");
    expect(keyToCommand("ArrowRight")).toBe("scrubForward");
    expect(keyToCommand("h")).toBe("toggleHud");
    expect(keyToCommand("H")).toBe("toggleHud");
    expect(keyToCommand("F")).toBe("fullscreen");
    expect(keyToCommand("g")).toBe("globe");
    expect(keyToCommand("x")).toBeNull();
  });
});
