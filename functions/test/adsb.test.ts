import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/adsb-v2.json" with { type: "json" };
import { ADSB_TIMEOUT_MS, CHUNK, PROVIDERS, SPACING_MS, fetchAircraft, parseV2 } from "../src/adsb.js";

describe("parseV2", () => {
  const out = parseV2(fixture);

  it("keeps only THY aircraft with a position", () => {
    expect(out.map((a) => a.cs)).toEqual(["THY2JE", "THY7KC", "THY2020"]);
  });

  it("maps fields and units", () => {
    expect(out[0]).toEqual({
      icao24: "4baa53",
      cs: "THY2JE",
      t: 1791208214,
      lat: 53.054535,
      lon: 16.67099,
      alt100: 330,
      onGround: false,
      gs: 476,
      trk: 142.26,
    });
  });

  it("ground, geometric altitude fallback, seen_pos age, missing track", () => {
    expect(out[1]).toMatchObject({ onGround: true, alt100: 0, t: 1791208211, gs: 5, trk: 90 });
    expect(out[2]).toMatchObject({ onGround: false, alt100: 100, t: 1791208201, trk: null });
  });

  it("handles empty / null ac", () => {
    expect(parseV2({ now: 1, ac: null })).toEqual([]);
    expect(parseV2({ now: 1 })).toEqual([]);
  });

  it("throws when now is missing but aircraft are present", () => {
    expect(() => parseV2({ ac: fixture.ac })).toThrow("adsb response missing now");
  });
});

describe("fetchAircraft", () => {
  const hexes = Array.from({ length: 250 }, (_, i) => i.toString(16).padStart(6, "0"));

  it("queries in chunks with spacing and merges results", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(fixture)));
    const sleep = vi.fn(async () => {});
    const out = await fetchAircraft(f as unknown as typeof fetch, PROVIDERS.adsbfi, hexes, sleep);
    const urls = f.mock.calls.map((c) => String((c as unknown as [string])[0]));
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(`https://opendata.adsb.fi/api/v2/hex/${hexes.slice(0, CHUNK).join(",")}`);
    expect(urls[2]).toBe(`https://opendata.adsb.fi/api/v2/hex/${hexes.slice(200).join(",")}`);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(SPACING_MS);
    expect(out.map((a) => a.cs)).toEqual(["THY2JE", "THY7KC", "THY2020"]); // deduplicated by icao24
  });

  it("uses the airplanes.live base URL", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ now: 1, ac: [] })));
    await fetchAircraft(f as unknown as typeof fetch, PROVIDERS.airplaneslive, ["4baa53"], async () => {});
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toBe("https://api.airplanes.live/v2/hex/4baa53");
  });

  it("throws with the provider name on HTTP errors", async () => {
    const f = vi.fn(async () => new Response("", { status: 429 }));
    await expect(fetchAircraft(f as unknown as typeof fetch, PROVIDERS.adsbfi, ["4baa53"], async () => {})).rejects.toThrow("adsb.fi 429");
  });

  it("passes an abort signal and names the provider on network errors", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ now: 1, ac: [] })));
    await fetchAircraft(f as unknown as typeof fetch, PROVIDERS.adsbfi, ["4baa53"], async () => {});
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(ADSB_TIMEOUT_MS).toBe(10_000);
    const boom = vi.fn(async () => {
      throw new Error("The operation was aborted due to timeout");
    });
    await expect(fetchAircraft(boom as unknown as typeof fetch, PROVIDERS.adsbfi, ["4baa53"], async () => {})).rejects.toThrow(
      "adsb.fi Error: The operation was aborted due to timeout",
    );
  });

  it("does nothing for an empty fleet", async () => {
    const f = vi.fn();
    await expect(fetchAircraft(f as unknown as typeof fetch, PROVIDERS.adsbfi, [], async () => {})).resolves.toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
