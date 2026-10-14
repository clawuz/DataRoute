import { describe, expect, it } from "vitest";
import { characterOf, requestAi } from "../src/personal/ai";
import { buildRoutes } from "../src/personal/routes";

describe("ai character", () => {
  it("reduces a piece to mood, top regions and size", () => {
    const routes = buildRoutes(["DPS", "NRT", "BKK", "JFK"], "LHR");
    const c = characterOf("visited", routes, 4);
    expect(c.mode).toBe("visited");
    expect(c.regions[0]).toBe("ASI");
    expect(c.regions.length).toBeLessThanOrEqual(3);
    expect(c.size).toBe("M");
    expect(characterOf("wish", buildRoutes(["JFK"], "IST"), 1).size).toBe("S");
    expect(characterOf("wish", buildRoutes(Array(12).fill("JFK"), "IST"), 12).size).toBe("L");
  });
  it("always has at least one region", () => {
    expect(characterOf("wish", [], 0).regions).toEqual(["EUR"]);
  });
});

describe("ai request", () => {
  const c = { mode: "wish" as const, regions: ["EUR" as const], size: "S" as const };
  const reply = (body: unknown) => (async () => ({ json: async () => body })) as unknown as typeof fetch;
  it("returns a track url", async () => {
    expect(await requestAi("https://x", c, reply({ status: "ready", url: "https://files/x.mp3" }))).toEqual({ status: "ready", url: "https://files/x.mp3" });
  });
  it("passes the cap, limit and off answers through", async () => {
    for (const s of ["cap", "limit", "off", "rate"] as const) expect(await requestAi("https://x", c, reply({ status: s }))).toEqual({ status: s });
  });
  it("never trusts a non-https url and never throws", async () => {
    expect((await requestAi("https://x", c, reply({ status: "ready", url: "javascript:alert(1)" }))).status).toBe("failed");
    expect((await requestAi("https://x", c, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).status).toBe("network");
  });
});
