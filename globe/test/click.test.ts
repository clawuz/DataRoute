import { describe, expect, it } from "vitest";
import { CLICK_MAX_MS, CLICK_MAX_PX, isClick } from "../src/app/click";

describe("isClick", () => {
  it("is a click only for a short, nearly stationary press", () => {
    expect(CLICK_MAX_PX).toBe(5);
    expect(CLICK_MAX_MS).toBe(250);
    expect(isClick(0, 0, 100)).toBe(true);
    expect(isClick(3, 3, 249)).toBe(true);
    expect(isClick(5, 0, 100)).toBe(false); // ≥ 5 px is a drag
    expect(isClick(0, 0, 250)).toBe(false); // ≥ 250 ms is a drag
  });
});
