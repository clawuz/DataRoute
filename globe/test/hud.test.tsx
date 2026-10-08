// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "@web/hud/store";
import { EMPTY_GLOBE_SNAPSHOT, createLabelBus, type GlobeHudSnapshot } from "../src/app/hud-model";
import type { FollowHud } from "../src/app/follow-hud";
import { MusicScope } from "../src/hud/MusicScope";
import { createNoteBus } from "../src/audio/notes-bus";
import { INSTRUMENT_COLOR, LANE_ORDER, SECTION_COLOR } from "../src/audio/scope";
import { AirportLabels, Credit, EventFeed, FlightPanel, GlobeHud, LoadingOverlay, ModeLine } from "../src/hud/GlobeHud";

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

describe("per-frame labels, a11y, clamping, fixture honesty", () => {
  it("bus updates label positions imperatively and marks labels aria-hidden", () => {
    const bus = createLabelBus();
    const { container } = render(<AirportLabels labels={[{ iata: "IST", x: 1, y: 2, visible: true }]} bus={bus} />);
    const el = container.querySelector<HTMLElement>(".airport-label")!;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    act(() => bus.emit([{ iata: "IST", x: 50, y: 60, visible: false }]));
    expect(el.style.left).toBe("50px");
    expect(el.style.top).toBe("60px");
    expect(el.style.visibility).toBe("hidden");
  });
  it("event feed is an explicit non-live log", () => {
    const { container } = render(<EventFeed events={[{ id: "1", kind: "LANDED", text: "x", at: 1 }]} />);
    const feed = container.querySelector(".events")!;
    expect(feed.getAttribute("role")).toBe("log");
    expect(feed.getAttribute("aria-live")).toBe("off");
  });
  it("clamps loading progress", () => {
    expect(text(render(<LoadingOverlay s={snap({ textureProgress: -0.2 })} />).container)).toBe("LOADING EARTH IMAGERY 0%");
  });
  it("a fixture-mode snapshot never says DELAYED", () => {
    const store = createStore(snap({ dataState: "ok", sourceName: "fixture", sourceUrl: "", updatedAgo: "2 H AGO", textureProgress: 1 }));
    const { container } = render(<GlobeHud store={store} />);
    expect(container.textContent!.toUpperCase()).not.toContain("DELAYED");
  });
});

const fh = (o: Partial<FollowHud> = {}): FollowHud => ({
  tk: "TK1", route: "IST → JFK", state: "OBSERVED", alt: "FL370 · 37,000 FT", gs: "480 KT", hdg: "290°",
  vs: "+1,000 FT/MIN", phase: "CLIMB", dist: "56 / 334 KM", elapsed: "00:05", remaining: "00:25 EST",
  utc: "08:15 UTC", local: "08:21 LOCAL SOLAR", speed: "×240", progress: 0.25, profile: [100, 300, 370],
  cursor: 0.5, aircraft: "BOEING 737-900 · TC-JXX", notes: ["GS / HDG / VS ARE 2-MIN AVERAGES"], ...o,
});

describe("FlightPanel", () => {
  it("shows every telemetry value, the state badge and the averages note", () => {
    const { container } = render(<FlightPanel f={fh()} />);
    const t = text(container);
    for (const s of ["TK1", "IST → JFK", "OBSERVED", "FL370 · 37,000 FT", "480 KT", "290°", "+1,000 FT/MIN", "CLIMB", "56 / 334 KM", "00:05", "00:25 EST", "08:15 UTC", "×240", "2-MIN AVERAGES"])
      expect(t).toContain(s);
    expect(container.querySelector(".fp-state")!.className).toContain("observed");
  });

  it("shows the aircraft as a dim sub-line", () => {
    const { container } = render(<FlightPanel f={fh()} />);
    expect(container.querySelector(".fp-aircraft")!.textContent).toBe("BOEING 737-900 · TC-JXX");
  });

  it("marks NO DATA and EXTRAPOLATED states with their own class", () => {
    const a = render(<FlightPanel f={fh({ state: "NO DATA" })} />).container;
    expect(a.querySelector(".fp-state")!.className).toContain("no-data");
    const b = render(<FlightPanel f={fh({ state: "EXTRAPOLATED" })} />).container;
    expect(b.querySelector(".fp-state")!.className).toContain("extrapolated");
  });

  it("draws the altitude profile with a cursor and the route progress bar", () => {
    const { container } = render(<FlightPanel f={fh({ progress: 0.25, cursor: 0.5 })} />);
    expect(container.querySelector("svg polyline")).not.toBeNull();
    const bar = container.querySelector<HTMLElement>(".fp-bar > i")!;
    expect(bar.style.width).toBe("25%");
    const cur = container.querySelector("svg line.fp-cursor")!;
    expect(Number(cur.getAttribute("x1"))).toBeCloseTo(50, 3);
  });
});

describe("ModeLine / notice with FOLLOW", () => {
  it("shows FOLLOW with speed and state; PAUSED live; and the notice", () => {
    expect(text(render(<ModeLine s={snap({ follow: fh() })} />).container)).toBe("FOLLOW · ×240 · OBSERVED");
    expect(text(render(<ModeLine s={snap({ paused: true })} />).container)).toBe("LIVE · PAUSED");
    const { container } = render(<GlobeHud store={createStore(snap({ notice: "TRACK TOO SHORT" }))} />);
    expect(text(container)).toContain("TRACK TOO SHORT");
  });

  it("the flight panel fades with H but is not the attribution", () => {
    const { container } = render(<GlobeHud store={createStore(snap({ follow: fh(), hidden: true }))} />);
    expect(container.querySelector(".hud.hidden .flight-panel")).not.toBeNull();
  });
});

describe("MusicScope", () => {
  const music = (o: Partial<GlobeHudSnapshot["music"]> = {}): GlobeHudSnapshot["music"] => ({
    on: true, section: "DAY", chord: "C", bpm: 96, instruments: ["NEY", "EUR", "DOM"], level: 2, layers: [], ...o,
  });
  it("labels the panel with the section, chord, tempo and rhythm level", () => {
    const { container } = render(<MusicScope bus={createNoteBus()} music={music({ on: true })} />);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(container.querySelector(".music-scope-label")!.textContent).toBe("ROUTES → MUSIC · DAY · C · 96 BPM · L2");
    expect(container.querySelector(".music-scope-title")).toBeNull(); // the name lives in the top-centre lockup now
  });
  it("shows the level bar (five segments, the current level filled in the section colour) and one dot per region layer", () => {
    const { container } = render(<MusicScope bus={createNoteBus()} music={music({ section: "NIGHT", level: 1, layers: ["DOM", "MEA", "AME"] })} />);
    const segs = Array.from(container.querySelectorAll<HTMLElement>(".music-scope-level .seg"));
    expect(segs).toHaveLength(5);
    expect(segs.map((s) => s.classList.contains("on"))).toEqual([true, true, false, false, false]);
    expect(segs.map((s) => s.classList.contains("cur"))).toEqual([false, true, false, false, false]);
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
    expect(segs[0].style.background).toBe(rgb(SECTION_COLOR.NIGHT));
    expect(segs[2].style.background).toBe("");
    const dots = Array.from(container.querySelectorAll<HTMLElement>(".music-scope-layers .dot"));
    expect(dots.map((d) => d.dataset.region)).toEqual(["DOM", "MEA", "AME"]);
    expect(dots.map((d) => d.style.background)).toEqual([INSTRUMENT_COLOR.EP, INSTRUMENT_COLOR.DARBUKA, INSTRUMENT_COLOR.TIMP].map(rgb));
    expect(text(container)).toContain("· L1");
    const none = render(<MusicScope bus={createNoteBus()} music={music({ layers: [] })} />).container;
    expect(none.querySelectorAll(".music-scope-layers .dot")).toHaveLength(0);
  });
  it("says SOUND OFF · PRESS M while muted (the scope keeps running)", () => {
    const { container } = render(<MusicScope bus={createNoteBus()} music={music({ on: false, section: "NIGHT", chord: "Am9", bpm: 72 })} />);
    expect(text(container)).toContain("SOUND OFF · PRESS M");
    expect(text(container)).not.toContain("ROUTES → MUSIC"); // the technical line shows only while the sound is on
  });
  it("does not throw without a 2D context (jsdom) and accepts notes", () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const bus = createNoteBus();
    const r = render(<MusicScope bus={bus} music={music({ level: 4, layers: ["EUR", "ASI"] })} />);
    expect(r.container.querySelectorAll(".music-scope-level .seg.on")).toHaveLength(5); // the DOM meter needs no canvas
    expect(r.container.querySelectorAll(".music-scope-layers .dot")).toHaveLength(2);
    expect(() => bus.emit({ instrument: "NEY", lane: "NEY", freq: 440, pitch: 440, vel: 1, kind: "dep", key: "IST-JFK", at: 0, durSec: 0.5 })).not.toThrow();
    r.unmount();
    spy.mockRestore();
  });
  it("draws the pitch ribbon (a trail per flight line in its instrument colour, its notes as bars as long as the notes) over the four rhythm lanes; stops on unmount", () => {
    const strokes: string[] = [];
    const fills: string[] = [];
    const bars: number[][] = [];
    const ys: number[] = [];
    const ctx = {
      setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn((_x: number, y: number) => ys.push(y)), lineTo: vi.fn(),
      stroke: vi.fn(function (this: { strokeStyle: string }) { strokes.push(this.strokeStyle); }),
      fillRect: vi.fn(function (this: { fillStyle: string }, x: number, y: number, w: number, hh: number) {
        fills.push(this.fillStyle);
        bars.push([x, y, w, hh]);
      }),
      strokeStyle: "", fillStyle: "", lineWidth: 1, globalAlpha: 1, globalCompositeOperation: "source-over",
    };
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    const ch = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const bus = createNoteBus();
    const r = render(<MusicScope bus={bus} music={music()} />);
    const now = performance.now() / 1000;
    act(() => bus.emit({ instrument: "EUR", lane: "EUR", freq: 440, pitch: 440, vel: 1, kind: "line", key: "IST-FRA", at: now - 0.5, durSec: 1.2, lineId: "f1" }));
    act(() => bus.emit({ instrument: "EUR", lane: "EUR", freq: 220, pitch: 220, vel: 1, kind: "line", key: "IST-FRA", at: now - 0.2, durSec: 0, lineId: "f1" }));
    act(() => bus.emit({ instrument: "KICK", lane: "KICK", freq: 60, pitch: 60, vel: 1, kind: "groove", key: "", at: now - 0.2, durSec: 0.13 }));
    act(() => frames.at(-1)!(performance.now()));
    expect(strokes).toEqual([INSTRUMENT_COLOR.EUR, ...LANE_ORDER.map((i) => INSTRUMENT_COLOR[i])]);
    expect(fills).toEqual([INSTRUMENT_COLOR.EUR, INSTRUMENT_COLOR.EUR]); // the two notes
    // bars: durSec · px/s long (200·dpr px over 6 s), the zero-length note at the 3 px minimum; 3 px high around the pitch
    const dpr = window.devicePixelRatio || 1;
    expect(bars[0][2]).toBeCloseTo(1.2 * (200 * dpr) / 6, 6);
    expect(bars[1][2]).toBe(3 * dpr);
    expect(bars.map((b) => b[3])).toEqual([3 * dpr, 3 * dpr]);
    expect(bars[0][1] + 1.5 * dpr).toBeCloseTo(0.7 * 100 * dpr * 0.5, 6); // centred on A4
    // the trail starts at A4 (pitchY 0.5) inside the top 70 % band: y = 0.7·h·(1 − 0.5)
    expect(ys[0]).toBeCloseTo(0.7 * 100 * (window.devicePixelRatio || 1) * 0.5, 6);
    expect(ctx.globalCompositeOperation).toBe("lighter");
    r.unmount();
    expect(caf).toHaveBeenCalled();
    spy.mockRestore();
    cw.mockRestore();
    ch.mockRestore();
    raf.mockRestore();
    caf.mockRestore();
  });
  it("replaces the aircraft bars in the HUD and stays while following", () => {
    const plain = render(<GlobeHud store={createStore(snap())} />).container;
    expect(plain.querySelector(".music-scope")).not.toBeNull();
    expect(text(plain)).not.toContain("AIRBORNE BY AIRCRAFT");
    expect(plain.querySelector(".aircraft-bars")).toBeNull();
    const following = render(<GlobeHud store={createStore(snap({ follow: fh() }))} />).container;
    expect(following.querySelector(".music-scope")).not.toBeNull();
    expect(following.querySelector(".regions")).toBeNull();
  });
});

describe("ArtNotes", () => {
  it("lists only the active art features; nothing when art is disabled", () => {
    const on = render(<GlobeHud store={createStore(snap({ art: { enabled: true, corridors: true, aurora: true, sound: true } }))} />).container;
    expect(text(on)).not.toContain("ROUTE DENSITY"); // no note for the density layer
    expect(text(on)).not.toContain("AURORA"); // the aurora layer carries no note
    expect(text(on)).toContain("SOUND ON");
    const off = render(<GlobeHud store={createStore(snap({ art: { enabled: false, corridors: false, aurora: false, sound: false } }))} />).container;
    expect(off.querySelector(".art-notes")).toBeNull();
  });
});

describe("KeysHelp", () => {
  it("is a button whose hover list names every shortcut the keyboard handles", async () => {
    const { KeysHelp, KEYS } = await import("../src/hud/GlobeHud");
    const { keyToCommand } = await import("../src/app/keys");
    const { container } = render(<KeysHelp />);
    expect(container.querySelector("button.keys-btn")).not.toBeNull();
    const listed = Array.from(container.querySelectorAll(".keys-row kbd")).map((k) => k.textContent);
    expect(listed.length).toBe(KEYS.length);
    // every listed single-letter key really is a command (the list cannot drift from keys.ts)
    for (const k of ["R", "M", "C", "A", "T", "H", "F"]) {
      expect(listed).toContain(k);
      expect(keyToCommand(k.toLowerCase())).not.toBeNull();
    }
    expect(listed).toContain("SPACE");
    expect(keyToCommand(" ")).toBe("togglePause");
  });
});

describe("follow controls", () => {
  it("buttons press the same keys as the keyboard (− slower, + faster, leave = Escape)", async () => {
    const { FlightPanel } = await import("../src/hud/GlobeHud");
    const { fireEvent } = await import("@testing-library/react");
    const pressed: string[] = [];
    const on = (e: Event) => pressed.push((e as KeyboardEvent).key);
    window.addEventListener("keydown", on);
    const f = { tk: "TK1", state: "OBSERVED", aircraft: "A", route: "IST → GRU", progress: 0.5, speed: "×240", profile: [], cursor: 0, notes: [] } as unknown as Parameters<typeof FlightPanel>[0]["f"];
    const { container } = render(<FlightPanel f={f} />);
    const btn = (label: string) => container.querySelector(`button[aria-label="${label}"]`) as HTMLElement;
    fireEvent.click(btn("Slower"));
    fireEvent.click(btn("Faster"));
    fireEvent.click(btn("Leave follow"));
    window.removeEventListener("keydown", on);
    expect(pressed).toEqual(["-", "+", "Escape"]);
  });
});

describe("QuickControls", () => {
  it("shows the state and presses the keyboard's keys (M, R, T, Space)", async () => {
    const { QuickControls } = await import("../src/hud/GlobeHud");
    const { EMPTY_GLOBE_SNAPSHOT } = await import("../src/app/hud-model");
    const { fireEvent } = await import("@testing-library/react");
    const pressed: string[] = [];
    const on = (e: Event) => pressed.push((e as KeyboardEvent).key);
    window.addEventListener("keydown", on);
    const snap = { ...EMPTY_GLOBE_SNAPSHOT, mode: "REPLAY" as const, paused: false, tour: false, music: { ...EMPTY_GLOBE_SNAPSHOT.music, on: true } };
    const { container } = render(<QuickControls s={snap} />);
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(["SOUND ON", "▶ LIVE", "TOUR", "❚❚ PAUSE"]);
    container.querySelectorAll("button").forEach((b) => fireEvent.click(b));
    window.removeEventListener("keydown", on);
    expect(pressed).toEqual(["m", "r", "t", " "]);
  });
});

describe("ux pass", () => {
  it("the lockup carries the name and the tagline", async () => {
    const { MusicLockup } = await import("../src/hud/GlobeHud");
    const { container } = render(<MusicLockup />);
    expect(container.querySelector(".lockup-title")!.textContent).toBe("A WORLD OF MUSIC");
    expect(container.querySelector(".lockup-tag")!.textContent).toBe("All our routes, composing the music of the world.");
  });
  it("departures: an hour axis every 6 h (UTC), a NOW marker only live", async () => {
    const { GlobeDepartures } = await import("../src/hud/GlobeHud");
    const bins = Array.from({ length: 24 }, (_, i) => i);
    // the window starts at 03:00 UTC: axis labels fall on bins 3, 9, 15, 21 → 06, 12, 18, 00
    const from = 3 * 3600;
    const { container, rerender } = render(<GlobeDepartures bins={bins} playhead={0.5} from={from} live />);
    expect(Array.from(container.querySelectorAll(".dep-axis span")).map((x) => x.textContent)).toEqual(["06", "12", "18", "00"]);
    expect(container.querySelector(".dep-now")!.textContent).toBe("NOW");
    rerender(<GlobeDepartures bins={bins} playhead={0.5} from={from} live={false} />);
    expect(container.querySelector(".dep-now")!.textContent).toBe("▼");
  });
  it("the legend calls the unknown region OTHER", async () => {
    const { GlobeRegions } = await import("../src/hud/GlobeHud");
    const { container } = render(<GlobeRegions counts={[1, 2, 3, 4, 5, 6, 7]} />);
    const names = Array.from(container.querySelectorAll(".region-name")).map((x) => x.textContent);
    expect(names).toContain("OTHER");
    expect(names).not.toContain("UNKNOWN");
  });
});

describe("airport label overlaps", () => {
  it("hides the label that would sit on a higher-priority one (IST wins over SAW)", async () => {
    const { resolveLabelOverlaps } = await import("../src/app/hud-model");
    const out = resolveLabelOverlaps([
      { iata: "IST", x: 100, y: 100, visible: true },
      { iata: "SAW", x: 108, y: 104, visible: true }, // 8 px away: overlaps
      { iata: "AYT", x: 300, y: 300, visible: true }, // far: stays
      { iata: "ESB", x: 100, y: 100, visible: false }, // not visible: untouched
    ]);
    expect(out.map((l) => l.visible)).toEqual([true, false, true, false]);
  });
});
