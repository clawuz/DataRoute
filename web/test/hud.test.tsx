// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Counters, FlightCardView, SourceLine } from "../src/hud/Hud";
import { EMPTY_SNAPSHOT, type HudSnapshot } from "../src/hud/snapshot";

const text = (el: HTMLElement) => el.textContent!.replace(/\s+/g, " ").trim();
const snap = (o: Partial<HudSnapshot>): HudSnapshot => ({
  ...EMPTY_SNAPSHOT,
  ready: true,
  sourceName: "adsb.fi",
  sourceUrl: "https://adsb.fi",
  updatedAgo: "14 S AGO",
  totalFlights: 2031,
  collectingSince: "2H AGO",
  dataState: "ok",
  ...o,
});

describe("SourceLine", () => {
  it("ok: source with link, update age and flight count", () => {
    const { container } = render(<SourceLine s={snap({})} />);
    expect(text(container)).toBe("SOURCE: ADSB.FI · UPDATED 14 S AGO · 2,031 FLIGHTS");
    expect(container.querySelector("a")!.getAttribute("href")).toBe("https://adsb.fi");
  });
  it("delayed", () => {
    const { container } = render(<SourceLine s={snap({ dataState: "delayed", updatedAgo: "12 MIN AGO" })} />);
    expect(text(container)).toBe("DATA DELAYED · LAST UPDATE 12 MIN AGO · SOURCE: ADSB.FI · 2,031 FLIGHTS");
    expect(container.firstElementChild!.classList.contains("delayed")).toBe(true);
  });
  it("collecting", () => {
    const { container } = render(<SourceLine s={snap({ dataState: "collecting" })} />);
    expect(text(container)).toContain("COLLECTING · STARTED 2H AGO");
  });
  it("no link without a URL", () => {
    const { container } = render(<SourceLine s={snap({ sourceName: "synthetic fixture", sourceUrl: "" })} />);
    expect(container.querySelector("a")).toBeNull();
    expect(text(container)).toContain("SOURCE: SYNTHETIC FIXTURE");
  });
  it("loading", () => {
    const { container } = render(<SourceLine s={snap({ dataState: "loading" })} />);
    expect(text(container)).toBe("LOADING DATA…");
  });
  it("renders no link for a non-http(s) URL", () => {
    const { container } = render(<SourceLine s={snap({ sourceUrl: "javascript:alert(1)" })} />);
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("Counters", () => {
  it("shows formatted values immediately when animation is off", () => {
    const { container } = render(<Counters c={{ airborne: 412, flights: 2031, destinations: 287, km: 1940000 }} animate={false} />);
    const all = (sel: string) => Array.from(container.querySelectorAll(sel)).map((e) => e.textContent);
    expect(all(".label")).toEqual(["AIRBORNE", "FLIGHTS · 24H", "DESTINATIONS", "KM FLOWN"]);
    expect(all(".value")).toEqual(["412", "2,031", "287", "1.94M"]);
    expect(container.querySelectorAll(".num")).toHaveLength(4);
  });
});

describe("FlightCardView", () => {
  it("renders nothing without a visible card", () => {
    expect(render(<FlightCardView card={null} kind="spotlight" />).container.innerHTML).toBe("");
  });
  it("renders the spotlight card with its altitude profile", () => {
    const { container } = render(
      <FlightCardView
        kind="spotlight"
        card={{ tk: "TK1", route: "IST → JFK", fl: "FL370", gs: "GS 486 KT", elapsed: "ELAPSED 06:12", region: "AME", profile: [0, 200, 370], x: 600, y: 400, visible: true }}
      />,
    );
    expect(container.querySelector(".tk")!.textContent).toBe("TK1");
    expect(container.querySelector(".route")!.textContent).toBe("IST → JFK");
    expect(Array.from(container.querySelectorAll(".meta span")).map((e) => e.textContent)).toEqual(["FL370", "GS 486 KT", "ELAPSED 06:12"]);
    expect(container.querySelector("polyline")).not.toBeNull();
    expect((container.firstElementChild as HTMLElement).style.left).toBe("600px");
  });
  it("clamps an edge card inside the viewport and mirrors it west", () => {
    const { container } = render(
      <FlightCardView
        kind="spotlight"
        card={{ tk: "TK2", route: "A → B", fl: "FL100", gs: "GS 1 KT", elapsed: "ELAPSED 00:01", region: "EUR", profile: [], x: 50, y: 400, visible: true }}
      />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(parseFloat(el.style.left)).toBeCloseTo(26 * (768 / 100), 1);
    expect(el.classList.contains("west")).toBe(true);
  });
});
