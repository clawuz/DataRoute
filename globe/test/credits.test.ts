import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const html = read("../../docs/credits.html");
const world = JSON.parse(read("../../docs/music-pack-world-ledger.json")) as { author: string; licence: string; source: string; licence_url?: string }[];

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
  it("links every CC BY sound to the licence version it was published under (eight are CC BY 3.0)", () => {
    const sec = section(html);
    const v3 = ["FaireDesVagues/sounds/69732/", "FaireDesVagues/sounds/69745/", "RealRhodesSounds/sounds/4190/", "RealRhodesSounds/sounds/4191/", "RealRhodesSounds/sounds/4192/", "RealRhodesSounds/sounds/4194/", "Johnnydhol/sounds/170313/"];
    const by = world.filter((r) => r.licence === "CC BY");
    for (const r of by) {
      const want = v3.some((x) => r.source.endsWith(x)) ? "3.0" : "4.0";
      expect(r.licence_url, r.source).toBe(`https://creativecommons.org/licenses/by/${want}/`);
      if (r.author.startsWith("Google")) continue;
      const items = sec.split("<li>").filter((li) => li.includes(`href="${r.source.replace(/&/g, "&amp;")}"`));
      expect(items.length, r.source).toBeGreaterThan(0);
      for (const li of items) expect(li, r.source).toContain(`href="https://creativecommons.org/licenses/by/${want}/"`);
    }
    expect(by.filter((r) => r.licence_url?.includes("/by/3.0/")).length).toBe(8); // two sarangi notes cut from one CC BY 3.0 recording
  });
  it("lists the non-commercial (CC BY-NC) sounds in their own section, each marked, and flags them in the ledger", () => {
    const rows = world as { author: string; licence: string; source: string; licence_url?: string; nc?: boolean; title?: string; instrument: string }[];
    const nc = rows.filter((r) => r.nc && !(r as { restricted?: boolean }).restricted);
    expect(nc.length).toBeGreaterThan(0);
    for (const r of rows) {
      const restricted = r.licence.includes("NC") || (r.licence_url ?? "").includes("/by-nc/") || (r as { restricted?: boolean }).restricted === true;
      expect(Boolean(r.nc), `${r.instrument} ${r.source}`).toBe(restricted);
    }
    const start = html.search(/<h2>[^<]*non-commercial licence \(CC BY-NC\)/);
    expect(start).toBeGreaterThan(0);
    const next = html.indexOf("<h2>", start + 4);
    const sec = html.slice(start, next);
    for (const r of nc) {
      expect(r.licence, r.source).toBe("CC BY-NC");
      const items = sec.split("<li>").filter((li) => li.includes(`href="${r.source}"`));
      expect(items.length, r.source).toBeGreaterThan(0);
      for (const li of items) {
        expect(li, r.source).toContain("non-commercial licence");
        expect(li, r.source).toContain(`href="${r.licence_url}"`);
      }
      // never listed as a CC BY or a CC0 sound
      expect(section(html), r.source).not.toContain(r.source);
    }
  });
  it("lists the Turkish Music Portal recordings in their own section, each marked restricted, never as CC BY, CC0 or CC BY-NC", () => {
    const rows = (world as { author: string; licence: string; source: string; title?: string; restricted?: boolean; nc?: boolean }[]).filter((r) => r.restricted);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const start = html.search(/<h2>Recordings from the Turkish Music Portal — restricted terms/);
    expect(start).toBeGreaterThan(0);
    const next = html.indexOf("<h2>", start + 4);
    const sec = html.slice(start, next);
    expect(sec).toContain("Türk Kültür Vakfı");
    expect(sec).toContain("not published without that permission");
    for (const r of rows) {
      expect(r.nc, r.title).toBe(true);
      const items = sec.split("<li>").filter((li) => li.includes((r.title ?? "").replace(/&/g, "&amp;")));
      expect(items.length, r.title).toBeGreaterThan(0);
      for (const li of items) expect(li, r.title).toContain("restricted: Türk Kültür Vakfı terms");
    }
    const ncStart = html.search(/<h2>[^<]*non-commercial licence \(CC BY-NC\)/);
    const ncSec = html.slice(ncStart, html.indexOf("<h2>", ncStart + 4));
    for (const s of [section(html), ncSec]) expect(s).not.toContain("turkishmusicportal");
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
