import { NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, flagOf } from "./destinations";
import { drawLogo } from "./brand";
import { flagsOf, wrap } from "./card";
import type { PieceStats } from "./stats";

/** Instagram Reels / Stories: 9:16. Content stays inside the safe zone (top ~250 px and bottom ~340 px are covered by the app UI). */
export const REEL_W = 1080;
export const REEL_H = 1920;
export const REEL_SECONDS = 15;

export interface ReelInput {
  stats: PieceStats;
  dests: string[];
  url: string;
  logo: HTMLImageElement | null;
}

export const GLOBE_BOX = { x: 40, y: 560, size: 1000 };

const RED = "#E30A17";
const INK = "#E9EDF5";
const DIM = "rgba(233,237,245,0.62)";

/** everything of the reel except the globe, drawn once and reused for every frame */
export function drawReelBackdrop(ctx: CanvasRenderingContext2D, c: ReelInput): void {
  const W = REEL_W;
  const H = REEL_H;
  const bg = ctx.createRadialGradient(W / 2, 1060, 120, W / 2, 1060, 1300);
  bg.addColorStop(0, "#0b1330");
  bg.addColorStop(1, "#02030a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const logoH = drawLogo(ctx, c.logo, W / 2, 240, 130, 130);
  const top = logoH > 0 ? 250 + logoH + 26 : 270;
  ctx.fillStyle = INK;
  ctx.font = '700 28px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("TURKISH AIRLINES", W / 2, top + 24);
  ctx.fillStyle = RED;
  ctx.font = '600 32px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("A WORLD OF MUSIC", W / 2, top + 80);
  ctx.fillStyle = INK;
  ctx.font = '700 84px "TK Display Condensed", "Arial Narrow", system-ui, sans-serif';
  wrap(ctx, c.stats.title.toUpperCase(), W - 140)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, W / 2, top + 170 + i * 92));

  // globe window frame
  const g = GLOBE_BOX;
  ctx.strokeStyle = "rgba(233,237,245,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.size, g.size, 40);
  ctx.stroke();

  const y0 = g.y + g.size + 80;
  ctx.font = '44px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(flagsOf(c.dests, 12).map(flagOf).join(" "), W / 2, y0);
  ctx.font = '500 34px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText(`${c.stats.destinations} DESTINATIONS · ${c.stats.countries} COUNTRIES · ${c.stats.km.toLocaleString("en")} KM`, W / 2, y0 + 62);
  ctx.font = '400 28px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(`SIGNATURE VOICE · ${c.stats.signature.toUpperCase()}`, W / 2, y0 + 108);

  ctx.font = '400 22px "TK Text Wide", system-ui, sans-serif';
  const foot = [NETWORK_CLAIM.toUpperCase(), `${NETWORK_DESTINATIONS} DESTINATIONS · ${NETWORK_COUNTRIES} COUNTRIES`];
  const lines = foot.flatMap((t) => wrap(ctx, t, W - 160));
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + 190 + i * 32));
}

/** copies the centred square of the live render into the globe window */
export function drawGlobeFrame(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement): void {
  const g = GLOBE_BOX;
  const s = Math.min(src.width, src.height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.size, g.size, 40);
  ctx.clip();
  ctx.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, g.x, g.y, g.size, g.size);
  ctx.restore();
}
