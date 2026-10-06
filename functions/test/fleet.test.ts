import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { FLEET_DB_URL, FLEET_TIMEOUT_MS, FLEET_PATH, FLEET_TTL, fetchFleet, loadFleet, parseFleetCsv, parseFleetInfo, type Fleet } from "../src/fleet.js";
import type { JsonStore } from "../src/storage.js";

const CSV = [
  "4BAA53;TC-JRS;A321;00;;;;",
  "4BB141;TC-LJA;B77W;00;;;;",
  "4B801A;TC-J60;BTB2;10;;;;",
  "43A8F4;TC-JGT;B738;00;;;Miscode - TURKEY;",
  "3C6444;D-AIBA;A319;00;;;;",
  "4BAA53;TC-JRS;A321;00;;;;",
  "",
].join("\n");

function memStore(init?: Fleet) {
  const files = new Map<string, unknown>(init ? [[FLEET_PATH, init]] : []);
  const store: JsonStore = {
    async read<T>(path: string) {
      return files.has(path) ? { data: structuredClone(files.get(path)) as T, generation: 1 } : null;
    },
    async write(path, data) {
      files.set(path, structuredClone(data));
    },
  };
  return { store, files };
}

describe("parseFleetCsv", () => {
  it("keeps TC- airliners, lower-cased, unique, sorted", () => {
    expect(parseFleetCsv(CSV)).toEqual(["43a8f4", "4baa53", "4bb141"]);
  });
});

describe("parseFleetInfo", () => {
  it("maps hex to registration and type for the same filter", () => {
    expect(parseFleetInfo(CSV)).toEqual({
      "43a8f4": { reg: "TC-JGT", type: "B738" },
      "4baa53": { reg: "TC-JRS", type: "A321" },
      "4bb141": { reg: "TC-LJA", type: "B77W" },
    });
  });
});

describe("fetchFleet", () => {
  it("downloads and gunzips the CSV", async () => {
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    await expect(fetchFleet(f as unknown as typeof fetch)).resolves.toMatchObject({ hexes: ["43a8f4", "4baa53", "4bb141"] });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(FLEET_DB_URL);
  });

  it("passes an abort signal", async () => {
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    await fetchFleet(f as unknown as typeof fetch);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(FLEET_TIMEOUT_MS).toBe(30_000);
  });

  it("accepts an already-decompressed body", async () => {
    const f = vi.fn(async () => new Response(CSV));
    await expect(fetchFleet(f as unknown as typeof fetch).then((r) => r.hexes)).resolves.toHaveLength(3);
  });

  it("throws on HTTP errors", async () => {
    const f = vi.fn(async () => new Response("", { status: 503 }));
    await expect(fetchFleet(f as unknown as typeof fetch)).rejects.toThrow("fleet db 503");
  });
});

describe("loadFleet", () => {
  const NOW = 1_800_000_000;
  const log = () => {};

  it("returns a fresh cached list without downloading", async () => {
    const { store } = memStore({ fetchedAt: NOW - 3600, hexes: ["aaaaaa"], info: { aaaaaa: { reg: "TC-AAA", type: "A321" } } });
    const f = vi.fn();
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).resolves.toEqual({ hexes: ["aaaaaa"], info: { aaaaaa: { reg: "TC-AAA", type: "A321" } } });
    expect(f).not.toHaveBeenCalled();
  });

  it("refreshes an expired list and stores it", async () => {
    const { store, files } = memStore({ fetchedAt: NOW - FLEET_TTL - 1, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log).then((r) => r.hexes)).resolves.toHaveLength(3);
    expect(files.get(FLEET_PATH)).toEqual({
      fetchedAt: NOW,
      hexes: ["43a8f4", "4baa53", "4bb141"],
      info: {
        "43a8f4": { reg: "TC-JGT", type: "B738" },
        "4baa53": { reg: "TC-JRS", type: "A321" },
        "4bb141": { reg: "TC-LJA", type: "B77W" },
      },
    });
  });

  it("falls back to the stale list when the refresh fails", async () => {
    const { store } = memStore({ fetchedAt: NOW - FLEET_TTL - 1, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response("", { status: 503 }));
    const logged = vi.fn();
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, logged)).resolves.toEqual({ hexes: ["aaaaaa"], info: {} });
    expect(logged).toHaveBeenCalledWith("fleet refresh failed, using stale list", { error: "Error: fleet db 503" });
  });

  it("refetches once when a fresh cache has no info map", async () => {
    const { store, files } = memStore({ fetchedAt: NOW - 3600, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    const r = await loadFleet(store, f as unknown as typeof fetch, NOW, log);
    expect(f).toHaveBeenCalledOnce();
    expect(r.info["4baa53"]).toEqual({ reg: "TC-JRS", type: "A321" });
    expect((files.get(FLEET_PATH) as Fleet).info).toBeDefined();
  });

  it("keeps the old hexes if that info refetch fails", async () => {
    const { store } = memStore({ fetchedAt: NOW - 3600, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response("", { status: 503 }));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).resolves.toEqual({ hexes: ["aaaaaa"], info: {} });
  });

  it("throws when there is no list at all", async () => {
    const { store } = memStore();
    const f = vi.fn(async () => new Response("", { status: 503 }));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).rejects.toThrow("fleet db 503");
  });

  it("treats an empty download as a failure", async () => {
    const { store } = memStore();
    const f = vi.fn(async () => new Response(gzipSync("3C6444;D-AIBA;A319;00;;;;\n")));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).rejects.toThrow("fleet db empty");
  });
});
