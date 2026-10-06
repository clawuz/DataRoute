// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useTickNumber } from "../src/hud/useTickNumber";

it("returns the new target on the first render when animation is off", () => {
  const { result, rerender } = renderHook(({ t }) => useTickNumber(t, false), { initialProps: { t: 10 } });
  expect(result.current).toBe(10);
  rerender({ t: 99 });
  expect(result.current).toBe(99);
});
