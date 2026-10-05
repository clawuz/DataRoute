import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/opensky-states.json" with { type: "json" };
import { STATES_URL, TOKEN_URL, fetchStates, fetchToken, parseThyStates } from "../src/opensky.js";

describe("parseThyStates", () => {
  const out = parseThyStates(fixture);

  it("keeps only THY aircraft with a position", () => {
    expect(out.map((a) => a.cs)).toEqual(["THY1", "THY7KC", "THY2020"]);
  });

  it("converts units", () => {
    const thy1 = out[0];
    expect(thy1).toEqual({
      icao24: "4baa01",
      cs: "THY1",
      t: 1791204398,
      lat: 44.2,
      lon: 25.1,
      alt100: 370, // 11277.6 m = 37000 ft
      onGround: false,
      gs: 486, // 250 m/s
      trk: 308.5,
    });
  });

  it("falls back to last_contact and geo_altitude; nulls stay null", () => {
    expect(out[1].t).toBe(1791204390);
    expect(out[1].alt100).toBeNull();
    expect(out[1].onGround).toBe(true);
    expect(out[2].alt100).toBe(100); // geo 3048 m
    expect(out[2].trk).toBeNull();
  });

  it("handles null states", () => {
    expect(parseThyStates({ time: 1, states: null })).toEqual([]);
  });
});

describe("http", () => {
  it("fetchToken posts client credentials", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
    await expect(fetchToken(f as unknown as typeof fetch, "id", "sec")).resolves.toBe("tok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    expect(String(init.body)).toBe("grant_type=client_credentials&client_id=id&client_secret=sec");
  });

  it("fetchStates sends bearer token and throws on HTTP errors", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    await fetchStates(ok as unknown as typeof fetch, "tok");
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(STATES_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    const bad = vi.fn(async () => new Response("", { status: 429 }));
    await expect(fetchStates(bad as unknown as typeof fetch, "tok")).rejects.toThrow("opensky states 429");
  });
});
