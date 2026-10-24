import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const html = read("../../docs/credits.html");
const world = JSON.parse(read("../../docs/music-pack-world-ledger.json")) as { author: string; licence: string; source: string }[];

const section = (page: string): string => {
  const start = page.search(/<h2>[^<]*Creative Commons Attribution \(CC BY\)/);
  if (start < 0) return "";
  const next = page.indexOf("<h2>", start + 4);
  return page.slice(start, next < 0 ? undefined : next);
};

describe("credits page", () => {
  it("finds the CC BY section, with the authors who also have CC0 sounds", () => {
    const sec = section(html);
    expect(sec.length).toBeGreaterThan(0);
    expect(sec).toContain("pjcohen");
    expect(sec).toContain("tarane468");
  });
  it("names every CC BY author of the world pack with a link to the work, inside the CC BY section", () => {
    const sec = section(html);
    const by = world.filter((r) => r.licence === "CC BY");
    expect(by.length).toBeGreaterThan(20);
    for (const r of by) {
      if (r.author.startsWith("Google")) {
        expect(html, r.author).toContain(r.author.replace(/&/g, "&amp;"));
        expect(html, r.source).toContain(r.source.replace(/&/g, "&amp;"));
        continue; // NSynth is credited under "Recorded instruments"
      }
      expect(sec, r.author).toContain(r.author.replace(/&/g, "&amp;"));
      expect(sec, r.source).toContain(r.source.replace(/&/g, "&amp;"));
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
