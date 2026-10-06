// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REGIONS } from "@web/data/palette";
import { createStore, useStore } from "@web/hud/store";
import { FROM, flight, makeDay } from "./helpers";

function Probe({ store }: { store: ReturnType<typeof createStore<string>> }) {
  const v = useStore(store);
  return <span>{v}</span>;
}

describe("globe scaffold", () => {
  it("resolves @web/* and shares one React instance with web modules", () => {
    expect(REGIONS).toHaveLength(7);
    const { container } = render(<Probe store={createStore("ok")} />);
    expect(container.textContent).toBe("ok");
  });

  it("test helpers build a valid day", () => {
    const day = makeDay({ flights: [flight({ s: [[0, 100, 41, 29]] })] });
    expect(day.window.from).toBe(FROM);
    expect(day.flights[0].end).toBe("AIRBORNE");
    expect(Object.keys(day.airports!)).toContain("IST");
  });
});
