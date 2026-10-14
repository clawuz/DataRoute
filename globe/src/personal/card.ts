import { NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, destinationOf, flagOf } from "./destinations";
import type { PieceStats } from "./stats";
import type { PersonalMode } from "./codec";
import { drawLogo, loadLogo } from "./brand";

export const CARD_W = 1080;
export const CARD_H = 1350;

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

/** Draws the share card (1080×1350, the feed/story crop) onto `ctx`. */
export function drawCard(ctx: CanvasRenderingContext2D, c: CardInput): void {
  const W = CARD_W;
  const H = CARD_H;
  const bg = ctx.createRadialGradient(W / 2, 560, 80, W / 2, 560, 900);
  bg.addColorStop(0, "#0b1330");
  bg.addColorStop(1, "#02030a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const logoH = drawLogo(ctx, c.logo ?? null, W / 2, 36, 100, 100);
  const top = logoH > 0 ? 36 + logoH + 18 : 60;
  ctx.fillStyle = INK;
  ctx.font = '700 26px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("TURKISH AIRLINES", W / 2, top + 22);

  ctx.fillStyle = RED;
  ctx.font = '600 30px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("A WORLD OF MUSIC", W / 2, top + 76);

  ctx.fillStyle = INK;
  ctx.font = '700 70px "TK Display Condensed", "Arial Narrow", system-ui, sans-serif';
  const titleLines = wrap(ctx, c.stats.title.toUpperCase(), W - 160);
  titleLines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, top + 150 + i * 76));

  // the globe, a centred square crop of the render
  const gy = top + 150 + 76 * Math.min(2, titleLines.length) + 20;
  const size = Math.max(420, Math.min(680, H - gy - 320));
  const s = Math.min(c.globe.width, c.globe.height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect((W - size) / 2, gy, size, size, 36);
  ctx.clip();
  ctx.drawImage(c.globe, (c.globe.width - s) / 2, (c.globe.height - s) / 2, s, s, (W - size) / 2, gy, size, size);
  ctx.restore();

  const flags = flagsOf(c.dests, 12);
  ctx.font = '44px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(flags.map(flagOf).join(" "), W / 2, gy + size + 78);

  ctx.font = '500 34px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = INK;
  const line = `${c.stats.destinations} DESTINATIONS · ${c.stats.countries} COUNTRIES · ${c.stats.km.toLocaleString("en")} KM`;
  ctx.fillText(line, W / 2, gy + size + 140);
  ctx.font = '400 28px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(`SIGNATURE VOICE · ${c.stats.signature.toUpperCase()}`, W / 2, gy + size + 184);

  ctx.font = '700 22px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText("TURKISH AIRLINES", W / 2, H - 98);
  ctx.font = '400 20px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  const foot = [NETWORK_CLAIM.toUpperCase(), `${NETWORK_DESTINATIONS} DESTINATIONS · ${NETWORK_COUNTRIES} COUNTRIES · ${hostOf(c.url)}`];
  const lines = foot.flatMap((t) => wrap(ctx, t, W - 140));
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H - 28 - (lines.length - 1 - i) * 30));
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
