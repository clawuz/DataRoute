import { NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, destinationOf, flagOf } from "./destinations";
import type { PieceStats } from "./stats";
import type { PersonalMode } from "./codec";
import { drawLogo, loadLogo } from "./brand";

import { SAFE_LAST_Y, SAFE_TOP, STORY_H, STORY_W } from "./safe";

/** the card is a Story: 9:16, with the text kept inside the safe band */
export const CARD_W = STORY_W;
export const CARD_H = STORY_H;

export interface CardInput {
  mode: PersonalMode;
  stats: PieceStats;
  dests: string[];
  /** a frame of the globe (the engine canvas) */
  globe: CanvasImageSource & { width: number; height: number };
  url: string;
  logo?: HTMLImageElement | null;
}

/** flags of the first `max` distinct countries, in the order picked */
export function flagsOf(dests: string[], max: number): string[] {
  const out: string[] = [];
  for (const d of dests) {
    const iso = destinationOf(d)?.iso;
    if (iso && !out.includes(iso)) out.push(iso);
    if (out.length >= max) break;
  }
  return out;
}

/** word-wrap `text` to `maxW` with the context's current font */
export function wrap(ctx: { measureText(t: string): { width: number } }, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(t).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

const RED = "#E30A17";
const INK = "#E9EDF5";
const DIM = "rgba(233,237,245,0.62)";

/** Draws the share card (1080×1920, an Instagram Story) onto `ctx`; everything sits inside SAFE_TOP … SAFE_LAST_Y. */
export function drawCard(ctx: CanvasRenderingContext2D, c: CardInput): void {
  const W = CARD_W;
  const H = CARD_H;
  const bg = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, 1250);
  bg.addColorStop(0, "#0b1330");
  bg.addColorStop(1, "#02030a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const logoH = drawLogo(ctx, c.logo ?? null, W / 2, SAFE_TOP, 120, 104);
  const top = logoH > 0 ? SAFE_TOP + logoH + 18 : SAFE_TOP;
  ctx.fillStyle = INK;
  ctx.font = '700 26px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("TURKISH AIRLINES", W / 2, top + 26);
  ctx.fillStyle = RED;
  ctx.font = '600 30px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("A WORLD OF MUSIC", W / 2, top + 80);
  ctx.fillStyle = INK;
  ctx.font = '700 72px "TK Display Condensed", "Arial Narrow", system-ui, sans-serif';
  const titleLines = wrap(ctx, c.stats.title.toUpperCase(), W - 160).slice(0, 2);
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, top + 165 + i * 78));
  const titleBottom = top + 165 + (titleLines.length - 1) * 78;

  // footer: the airline line and the network, ending on the last safe baseline
  ctx.font = '400 21px "TK Text Wide", system-ui, sans-serif';
  const foot = [NETWORK_CLAIM.toUpperCase(), `${NETWORK_DESTINATIONS} DESTINATIONS · ${NETWORK_COUNTRIES} COUNTRIES · ${hostOf(c.url)}`];
  const lines = foot.flatMap((t) => wrap(ctx, t, W - 140));
  const footTop = SAFE_LAST_Y - (lines.length - 1) * 30;
  ctx.font = '700 22px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText("TURKISH AIRLINES", W / 2, footTop - 36);
  ctx.font = '400 21px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, footTop + i * 30));

  // the globe: a centred square crop of the render, in the room between the title and the numbers
  const numbersH = 200; // flags, counts, signature voice
  const gy = titleBottom + 40;
  const size = Math.max(420, Math.min(720, footTop - 36 - 30 - numbersH - gy));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect((W - size) / 2, gy, size, size, 36);
  ctx.clip();
  const s = Math.min(c.globe.width, c.globe.height);
  ctx.drawImage(c.globe, (c.globe.width - s) / 2, (c.globe.height - s) / 2, s, s, (W - size) / 2, gy, size, size);
  ctx.restore();

  const y0 = gy + size + 70;
  ctx.font = '44px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(flagsOf(c.dests, 12).map(flagOf).join(" "), W / 2, y0);
  ctx.font = '500 34px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText(`${c.stats.destinations} DESTINATIONS · ${c.stats.countries} COUNTRIES · ${c.stats.km.toLocaleString("en")} KM`, W / 2, y0 + 62);
  ctx.font = '400 28px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(`SIGNATURE VOICE · ${c.stats.signature.toUpperCase()}`, W / 2, y0 + 108);
}

const hostOf = (u: string): string => {
  try {
    return new URL(u).host.toUpperCase();
  } catch {
    return "";
  }
};

/** Renders the card to a PNG blob. */
export async function renderCard(c: CardInput): Promise<Blob> {
  const cv = document.createElement("canvas");
  cv.width = CARD_W;
  cv.height = CARD_H;
  const ctx = cv.getContext("2d")!;
  try {
    await document.fonts.load('700 84px "TK Display Condensed"');
    await document.fonts.load('500 34px "TK Text Wide"');
  } catch {
    /* fall back to system fonts */
  }
  drawCard(ctx, { ...c, logo: c.logo ?? (await loadLogo()) });
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("card render failed"))), "image/png"));
}
