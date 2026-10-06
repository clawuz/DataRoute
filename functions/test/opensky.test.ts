import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS } from "../src/adsb.js";
import {
  OPENSKY_CHUNK, OPENSKY_PROVIDER, OPENSKY_SPACING_MS, STATES_URL, TOKEN_URL,
  createOpenSkyClient, parseThyStates,
} from "../src/opensky.js";
import { resetOpenSkyClient, selectProvider } from "../src/providers.js";

const row = (o: Partial<Record<number, unknown>>) => {
  const base: unknown[] = ["4BAA53", "THY2JE  ", "Turkey", 1000, 1001, 28.5, 41.2, 10058.4, false, 250, 142.3, 0, null, 10100, "1000", false, 0, 0];
  for (const [k, v] of Object.entries(o)) base[Number(k)] = v;
  return base;
};

describe("parseThyStates", () => {
  it("converts units and fields", () => {
    expect(parseThyStates({ time: 1, states: [row({})] })).toEqual([
      { icao24: "4baa53", cs: "THY2JE", t: 1000, lat: 41.2, lon: 28.5, alt100: 330, onGround: false, gs: 486, trk: 142.3 },
    ]);
  });
  it("filters non-THY, skips missing position, falls back t/alt", () => {
    const out = parseThyStates({
      states: [row({ 1: "PGT123" }), row({ 5: null }), row({ 6: null }), row({ 3: null, 7: null }), row({ 8: true, 7: 0 })],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ t: 1001, alt100: Math.round((10100 / 0.3048) / 100) });
    expect(out[1]).toMatchObject({ onGround: true, alt100: 0 });
  });
  it("treats states null/missing as empty", () => {
    expect(parseThyStates({ time: 1, states: null })).toEqual([]);
    expect(parseThyStates({})).toEqual([]);
  });
});

function fakeFetch(opts: { states?: () => Response; expiresIn?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let n = 0;
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url) === TOKEN_URL) return new Response(JSON.stringify({ access_token: `tok${++n}`, expires_in: opts.expiresIn ?? 1800 }));
    return opts.states ? opts.states() : new Response(JSON.stringify({ time: 1, states: [row({})] }));
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe("OpenSky client", () => {
  const creds = { clientId: "id", clientSecret: "sec" };

  it("requests a client-credentials token and caches it until 1 min before expiry", async () => {
    let t = 1000;
    const { f, calls } = fakeFetch({ expiresIn: 300 });
    const c = createOpenSkyClient(f, creds, () => t);
    expect(await c.getToken()).toBe("tok1");
    const tokenCall = calls[0]!;
    expect(String(tokenCall.init!.body)).toBe("grant_type=client_credentials&client_id=id&client_secret=sec");
    t += 239;
    expect(await c.getToken()).toBe("tok1");
    expect(calls).toHaveLength(1);
    t += 2; // 241 >= 300-60
    expect(await c.getToken()).toBe("tok2");
  });

  it("chunks icao24 queries with spacing, bearer auth, and dedupes", async () => {
    const { f, calls } = fakeFetch();
    const hexes = Array.from({ length: 250 }, (_, i) => i.toString(16).padStart(6, "0"));
    const sleep = vi.fn(async () => {});
    const out = await createOpenSkyClient(f, creds, () => 0).fetchAircraft(hexes, sleep);
    const state = calls.filter((c) => c.url.startsWith(STATES_URL));
    expect(state).toHaveLength(3);
    expect(state[0]!.url).toBe(`${STATES_URL}?${hexes.slice(0, OPENSKY_CHUNK).map((h) => `icao24=${h}`).join("&")}`);
    expect((state[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer tok1");
    expect(calls.filter((c) => c.url === TOKEN_URL)).toHaveLength(1);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(OPENSKY_SPACING_MS);
    expect(out).toHaveLength(1);
  });

  it("surfaces 429 and token failures with the provider name", async () => {
    const { f } = fakeFetch({ states: () => new Response("", { status: 429 }) });
    await expect(createOpenSkyClient(f, creds, () => 0).fetchAircraft(["4baa53"], async () => {})).rejects.toThrow("OpenSky Network 429");
    const bad = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(createOpenSkyClient(bad, creds, () => 0).fetchAircraft(["4baa53"], async () => {})).rejects.toThrow("OpenSky Network token 403");
  });

  it("wraps network errors and drops the token on 401", async () => {
    const boom = vi.fn(async (url: string) => {
      if (url === TOKEN_URL) return new Response(JSON.stringify({ access_token: "a", expires_in: 1800 }));
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    await expect(createOpenSkyClient(boom, creds, () => 0).fetchAircraft(["4baa53"], async () => {})).rejects.toThrow("OpenSky Network Error: timeout");
    const { f, calls } = fakeFetch({ states: () => new Response("", { status: 401 }) });
    const c = createOpenSkyClient(f, creds, () => 0);
    await expect(c.fetchAircraft(["4baa53"], async () => {})).rejects.toThrow("401");
    await expect(c.fetchAircraft(["4baa53"], async () => {})).rejects.toThrow("401");
    expect(calls.filter((x) => x.url === TOKEN_URL)).toHaveLength(2);
  });
});

describe("selectProvider", () => {
  beforeEach(resetOpenSkyClient);
  const secrets = { clientId: () => "id", clientSecret: () => "sec" };

  it("defaults to adsb path without a live override", () => {
    const s = selectProvider("adsbfi", fetch, () => 0, null);
    expect(s.provider).toBe(PROVIDERS.adsbfi);
    expect(s.live).toBeUndefined();
  });
  it("selects opensky with attribution and a live fetcher", () => {
    const s = selectProvider("opensky", fetch, () => 0, secrets);
    expect(s.provider).toMatchObject({ name: "OpenSky Network", url: "https://opensky-network.org" });
    expect(s.provider).toBe(OPENSKY_PROVIDER);
    expect(s.live).toBeTypeOf("function");
  });
  it("rejects opensky without secrets and unknown keys", () => {
    expect(() => selectProvider("opensky", fetch, () => 0, null)).toThrow("not bound");
    expect(() => selectProvider("nope", fetch, () => 0, null)).toThrow("unknown ADSB_PROVIDER");
  });
});
