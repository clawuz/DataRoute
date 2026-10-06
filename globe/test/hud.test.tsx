// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createStore } from "@web/hud/store";
import { EMPTY_GLOBE_SNAPSHOT, type GlobeHudSnapshot } from "../src/app/hud-model";
import { AirportLabels, Credit, EventFeed, GlobeHud, LoadingOverlay, ModeLine } from "../src/hud/GlobeHud";

const snap = (o: Partial<GlobeHudSnapshot> = {}): GlobeHudSnapshot => ({ ...EMPTY_GLOBE_SNAPSHOT, ready: true, ...o });
const text = (el: HTMLElement) => el.textContent!.replace(/\s+/g, " ").trim();

describe("EventFeed", () => {
  it("lists events oldest first with a kind class", () => {
    const { container } = render(
      <EventFeed
        events={[
          { id: "1", kind: "DEPARTED", text: "TK1 DEPARTED IST → JFK", at: 1 },
          { id: "2", kind: "LAST_CONTACT", text: "TK2 LAST CONTACT", at: 2 },
        ]}
      />,
    );
    const rows = Array.from(container.querySelectorAll(".event"));
    expect(rows.map((r) => r.textContent)).toEqual(["TK1 DEPARTED IST → JFK", "TK2 LAST CONTACT"]);
    expect(rows[0].classList.contains("departed")).toBe(true);
    expect(rows[1].classList.contains("last_contact")).toBe(true);
  });
  it("renders nothing without events", () => {
    expect(render(<EventFeed events={[]} />).container.innerHTML).toBe("");
  });
});

describe("AirportLabels", () => {
  it("renders only visible labels at their screen position; the hub is marked", () => {
    const { container } = render(
      <AirportLabels
        labels={[
          { iata: "IST", x: 100, y: 200, visible: true },
          { iata: "JFK", x: 300, y: 400, visible: true },
          { iata: "SYD", x: 5, y: 5, visible: false },
        ]}
      />,
    );
    const els = Array.from(container.querySelectorAll<HTMLElement>(".airport-label"));
    expect(els.map((e) => e.textContent)).toEqual(["IST", "JFK"]);
    expect(els[0].style.left).toBe("100px");
    expect(els[0].style.top).toBe("200px");
    expect(els[0].classList.contains("hub")).toBe(true);
    expect(els[1].classList.contains("hub")).toBe(false);
  });
});

describe("ModeLine", () => {
  it("LIVE shows extrapolated heads, REPLAY shows the compression", () => {
    expect(text(render(<ModeLine s={snap({ mode: "LIVE", extrapolated: 87 })} />).container)).toBe("LIVE · 87 HEADS EXTRAPOLATED");
    expect(text(render(<ModeLine s={snap({ mode: "LIVE", extrapolated: 0 })} />).container)).toBe("LIVE");
    expect(text(render(<ModeLine s={snap({ mode: "REPLAY" })} />).container)).toBe("REPLAY · 24H IN 3 MIN");
  });
});

describe("Credit", () => {
  it("is part of the always-visible source group and appends a texture note", () => {
    const a = render(<Credit s={snap()} />).container;
    expect(a.firstElementChild!.classList.contains("source")).toBe(true);
    expect(text(a)).toBe("EARTH IMAGERY: NASA EARTH OBSERVATORY (BLUE MARBLE · BLACK MARBLE)");
    const b = render(<Credit s={snap({ textureNote: "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)" })} />).container;
    expect(text(b)).toContain("· FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)");
  });
});

describe("LoadingOverlay", () => {
  it("shows progress only while the imagery loads", () => {
    expect(text(render(<LoadingOverlay s={snap({ textureProgress: 0.34 })} />).container)).toBe("LOADING EARTH IMAGERY 34%");
    expect(render(<LoadingOverlay s={snap({ textureProgress: 1 })} />).container.innerHTML).toBe("");
    expect(render(<LoadingOverlay s={snap({ textureProgress: 0.5, textureNote: "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)" })} />).container.innerHTML).toBe("");
  });
});

describe("GlobeHud", () => {
  it("keeps every block a direct child of .hud and the hidden class follows the snapshot", () => {
    const store = createStore(
      snap({
        hidden: true,
        sourceName: "adsb.fi",
        sourceUrl: "https://adsb.fi",
        dataState: "ok",
        updatedAgo: "14 S AGO",
        totalFlights: 2031,
        timeLabel: "08:42 UTC",
        events: [{ id: "1", kind: "LANDED", text: "TK1 LANDED JFK", at: 1 }],
        labels: [{ iata: "IST", x: 1, y: 2, visible: true }],
        textureProgress: 1,
      }),
    );
    const { container } = render(<GlobeHud store={store} />);
    const hud = container.querySelector(".hud")!;
    expect(hud.classList.contains("hidden")).toBe(true);
    for (const sel of [".events", ".airport-label", ".source"]) {
      const el = hud.querySelector(sel)!;
      expect(el, sel).not.toBeNull();
      expect(Array.from(hud.children).some((c) => c === el || c.contains(el))).toBe(true);
    }
    const sources = Array.from(hud.children).filter((c) => c.classList.contains("source"));
    expect(sources.length).toBe(2);
    expect(hud.textContent).toContain("SOURCE: ADSB.FI");
  });
});
