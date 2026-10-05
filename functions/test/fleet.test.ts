import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { FLEET_DB_URL, FLEET_TIMEOUT_MS, FLEET_PATH, FLEET_TTL, fetchFleet, loadFleet, parseFleetCsv, type Fleet } from "../src/fleet.js";
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

describe("fetchFleet", () => {
  it("downloads and gunzips the CSV", async () => {
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    await expect(fetchFleet(f as unknown as typeof fetch)).resolves.toEqual(["43a8f4", "4baa53", "4bb141"]);
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
    await expect(fetchFleet(f as unknown as typeof fetch)).resolves.toHaveLength(3);
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
    const { store } = memStore({ fetchedAt: NOW - 3600, hexes: ["aaaaaa"] });
    const f = vi.fn();
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).resolves.toEqual(["aaaaaa"]);
    expect(f).not.toHaveBeenCalled();
  });

  it("refreshes an expired list and stores it", async () => {
    const { store, files } = memStore({ fetchedAt: NOW - FLEET_TTL - 1, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).resolves.toHaveLength(3);
    expect(files.get(FLEET_PATH)).toEqual({ fetchedAt: NOW, hexes: ["43a8f4", "4baa53", "4bb141"] });
  });

  it("falls back to the stale list when the refresh fails", async () => {
    const { store } = memStore({ fetchedAt: NOW - FLEET_TTL - 1, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response("", { status: 503 }));
    const logged = vi.fn();
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, logged)).resolves.toEqual(["aaaaaa"]);
    expect(logged).toHaveBeenCalledWith("fleet refresh failed, using stale list", { error: "Error: fleet db 503" });
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
