import { describe, expect, it } from "vitest";
import { DAILY_CAP, PER_VISITOR_CAP, buildPlan, characterKey, dayId, handleRequest, parseCharacter, type Deps, type Store } from "../src/personal-music.js";

const good = { mode: "visited", regions: ["EUR", "ASI"], size: "M" };

function memoryStore(): Store & { tracks: Map<string, string>; daily: Map<string, number>; visits: Map<string, number> } {
  const tracks = new Map<string, string>();
  const daily = new Map<string, number>();
  const visits = new Map<string, number>();
  return {
    tracks,
    daily,
    visits,
    async find(k) {
      return tracks.get(k) ?? null;
    },
    async claim(day, visitor, caps) {
      if ((daily.get(day) ?? 0) >= caps.daily) return "cap";
      const vk = `${day}:${visitor}`;
      if ((visits.get(vk) ?? 0) >= caps.visitor) return "limit";
      daily.set(day, (daily.get(day) ?? 0) + 1);
      visits.set(vk, (visits.get(vk) ?? 0) + 1);
      return "ok";
    },
    async release(day, visitor) {
      daily.set(day, (daily.get(day) ?? 1) - 1);
      visits.set(`${day}:${visitor}`, (visits.get(`${day}:${visitor}`) ?? 1) - 1);
    },
    async save(k) {
      const url = `https://files.example/${k}.mp3`;
      tracks.set(k, url);
      return url;
    },
  };
}

const deps = (over: Partial<Deps> = {}): Deps & { store: ReturnType<typeof memoryStore>; composed: number } => {
  const store = memoryStore();
  const d = {
    store,
    composed: 0,
    compose: async () => {
      d.composed++;
      return new Uint8Array([1, 2, 3]);
    },
    now: () => Date.parse("2026-10-14T10:00:00Z"),
    enabled: true,
    ...over,
  };
  return d as Deps & { store: ReturnType<typeof memoryStore>; composed: number };
};

describe("character", () => {
  it("validates the request", () => {
    expect(parseCharacter(good)).toEqual(good);
    expect(parseCharacter({ ...good, mode: "x" })).toBeNull();
    expect(parseCharacter({ ...good, size: "XL" })).toBeNull();
    expect(parseCharacter({ ...good, regions: [] })).toBeNull();
    expect(parseCharacter({ ...good, regions: ["EUR", "EUR"] })).toBeNull();
    expect(parseCharacter({ ...good, regions: ["EUR", "ASI", "AME", "AFR"] })).toBeNull();
    expect(parseCharacter({ ...good, regions: ["MARS"] })).toBeNull();
    expect(parseCharacter(null)).toBeNull();
  });
  it("keys do not depend on region order", () => {
    expect(characterKey({ mode: "wish", regions: ["ASI", "EUR"], size: "S" })).toBe(characterKey({ mode: "wish", regions: ["EUR", "ASI"], size: "S" }));
  });
});

describe("plan", () => {
  it("is a full piece, instrumental, with the mode's mood", () => {
    const p = buildPlan(parseCharacter(good)!);
    const ms = p.chunks.reduce((s, c) => s + c.duration_ms, 0);
    expect(ms).toBeGreaterThan(140_000);
    expect(ms).toBeLessThan(190_000);
    expect(p.chunks.length).toBe(6);
    expect(p.chunks[0].positive_styles).toContain("instrumental");
    expect(p.chunks[0].negative_styles).toContain("vocals");
    expect(p.chunks[0].positive_styles.join(" ")).toMatch(/nostalgic/);
    expect(buildPlan({ ...parseCharacter(good)!, mode: "wish" }).chunks[0].positive_styles.join(" ")).toMatch(/hopeful/);
  });
});

describe("handleRequest", () => {
  it("composes once, then serves the cache for free", async () => {
    const d = deps();
    expect((await handleRequest(good, "a", d)).status).toBe("ready");
    const again = await handleRequest(good, "b", d);
    expect(again).toMatchObject({ status: "ready", cached: true });
    expect(d.composed).toBe(1);
    expect(d.store.daily.get("2026-10-14")).toBe(1);
  });
  it("stops a visitor after two new tracks", async () => {
    const d = deps();
    const mk = (i: number) => ({ ...good, regions: [["EUR"], ["ASI"], ["AFR"]][i] });
    expect((await handleRequest(mk(0), "v", d)).status).toBe("ready");
    expect((await handleRequest(mk(1), "v", d)).status).toBe("ready");
    expect((await handleRequest(mk(2), "v", d)).status).toBe("limit");
    expect(PER_VISITOR_CAP).toBe(2);
  });
  it("stops at 100 new tracks a day, but cached ones still play", async () => {
    const d = deps();
    d.store.daily.set("2026-10-14", DAILY_CAP);
    expect((await handleRequest(good, "z", d)).status).toBe("cap");
    d.store.tracks.set(characterKey(parseCharacter(good)!), "https://files.example/x.mp3");
    expect((await handleRequest(good, "z", d)).status).toBe("ready");
    expect(DAILY_CAP).toBe(100);
  });
  it("gives the claim back when the composition fails", async () => {
    const d = deps({
      compose: async () => {
        throw new Error("402");
      },
    });
    expect((await handleRequest(good, "q", d)).status).toBe("failed");
    expect(d.store.daily.get("2026-10-14")).toBe(0);
  });
  it("honours the kill switch for uncached tracks", async () => {
    expect((await handleRequest(good, "q", deps({ enabled: false }))).status).toBe("off");
  });
  it("rejects a malformed body", async () => {
    expect((await handleRequest({ mode: "wish" }, "q", deps())).status).toBe("bad-request");
  });
  it("days roll over at UTC midnight", () => {
    expect(dayId(Date.parse("2026-10-14T23:59:59Z"))).toBe("2026-10-14");
    expect(dayId(Date.parse("2026-10-15T00:00:01Z"))).toBe("2026-10-15");
  });
});
