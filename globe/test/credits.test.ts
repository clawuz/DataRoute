import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const html = read("../../docs/credits.html");
const world = JSON.parse(read("../../docs/music-pack-world-ledger.json")) as { author: string; licence: string; source: string }[];

describe("credits page", () => {
  it("names every CC BY author of the world pack with a link to the work", () => {
    const by = world.filter((r) => r.licence === "CC BY");
    expect(by.length).toBeGreaterThan(20);
    for (const r of by) {
      expect(html, r.author).toContain(r.author.replace(/&/g, "&amp;"));
      expect(html, r.source).toContain(r.source.replace(/&/g, "&amp;"));
    }
  });
  it("credits the sources that need it", () => {
    for (const s of ["VSCO 2 Community Edition", "VCSL", "NSynth", "CC BY 4.0", "adsb.fi", "NASA", "Julien Sulpis", "Freesound"]) expect(html, s).toContain(s);
  });
  it("is a complete page", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta name="viewport"');
  });
  it("is not published: it is not in public/ and no source links to it", () => {
    expect(existsSync(fileURLToPath(new URL("../public/credits.html", import.meta.url)))).toBe(false);
    expect(read("../src/personal/Landing.tsx")).not.toContain("credits");
  });
});
