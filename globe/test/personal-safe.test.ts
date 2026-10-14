import { describe, expect, it } from "vitest";
import { SCOPE_BOX, drawReelOverlay, drawScopeFrame } from "../src/personal/reel";
import { SAFE_LAST_Y, SAFE_TOP, STORY_H } from "../src/personal/safe";
import { pieceStats } from "../src/personal/stats";
import { buildRoutes } from "../src/personal/routes";

/** a 2D context that records where text and pictures are put */
function recorder() {
  const texts: { text: string; y: number; size: number }[] = [];
  const pics: { y: number; h: number }[] = [];
  let font = "";
  const grad = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(_t, k) {
        if (k === "fillText") return (text: string, _x: number, y: number) => texts.push({ text, y, size: +(/(\d+)px/.exec(font)?.[1] ?? 0) });
        if (k === "measureText") return (t: string) => ({ width: t.length * 13 });
        if (k === "drawImage") return (...a: number[]) => pics.push(a.length === 5 ? { y: a[2], h: a[4] } : { y: a[6], h: a[8] });
        if (k === "createRadialGradient" || k === "createLinearGradient") return () => grad;
        return () => {};
      },
      set(_t, k, v) {
        if (k === "font") font = String(v);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, pics };
}

const img = (w: number, h: number) => ({ width: w, height: h, naturalWidth: w, naturalHeight: h }) as unknown as HTMLImageElement;
const routes = buildRoutes("LHR", ["DPS", "JFK", "NRT", "GRU", "CAI"]);
const stats = pieceStats("visited", "LHR", ["DPS", "JFK", "NRT", "GRU", "CAI"], routes);
const dests = ["DPS", "JFK", "NRT", "GRU", "CAI"];

describe("Instagram Story safe area", () => {
  it("is 9:16 with a 250 px band top and bottom", () => {
    expect(STORY_H).toBe(1920);
    expect(SAFE_TOP).toBe(250);
    expect(SAFE_LAST_Y).toBe(1670);
  });
  it("fits the routes sounding now inside the music box", () => {
    const r = recorder();
    drawScopeFrame(r.ctx, { canvas: { width: 340, height: 170 } as HTMLCanvasElement, label: "ROUTES → MUSIC · CHORUS · 84 BPM", items: [1, 2, 3, 4, 5, 6].map((i) => ({ text: `IST → DPS ${i}`, color: "#fff" })) });
    expect(r.texts.length).toBeGreaterThan(2);
    for (const t of r.texts) {
      expect(t.y, t.text).toBeLessThanOrEqual(SCOPE_BOX.y + SCOPE_BOX.h);
      expect(t.y - t.size, t.text).toBeGreaterThanOrEqual(SCOPE_BOX.y);
    }
  });
  it("puts the card's numbers inside the band too (no music box)", () => {
    const r = recorder();
    drawReelOverlay(r.ctx, { stats, dests, url: "https://worldofmusic-tk.web.app", logo: img(1000, 333) }, false);
    for (const t of r.texts) {
      expect(t.y - t.size, t.text).toBeGreaterThanOrEqual(SAFE_TOP - 4);
      expect(t.y, t.text).toBeLessThanOrEqual(SAFE_LAST_Y);
    }
  });
  it("keeps the story overlay (card and video) text and music box inside the band", () => {
    const r = recorder();
    drawReelOverlay(r.ctx, { stats, dests, url: "https://worldofmusic-tk.web.app", logo: img(1000, 333) });
    drawScopeFrame(r.ctx, { canvas: { width: 340, height: 170 } as HTMLCanvasElement, label: "ROUTES → MUSIC · CHORUS · 84 BPM", items: [1, 2, 3, 4, 5, 6].map((i) => ({ text: `IST → DPS ${i}`, color: "#fff" })) });
    for (const t of r.texts) {
      expect(t.y - t.size, t.text).toBeGreaterThanOrEqual(SAFE_TOP - 4);
      expect(t.y, t.text).toBeLessThanOrEqual(SAFE_LAST_Y);
    }
    expect(SCOPE_BOX.y + SCOPE_BOX.h).toBeLessThanOrEqual(SAFE_LAST_Y);
    expect(SCOPE_BOX.y).toBeGreaterThanOrEqual(SAFE_TOP);
  });
});
