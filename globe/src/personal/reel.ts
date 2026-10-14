import { NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, flagOf } from "./destinations";
import { drawLogo } from "./brand";
import { flagsOf, wrap } from "./card";
import type { PieceStats } from "./stats";
import { SAFE_LAST_Y, SAFE_TOP, STORY_H, STORY_W } from "./safe";

/** Instagram Reels / Stories: 9:16. Content stays inside the safe zone (top ~250 px and bottom ~340 px are covered by the app UI). */
export const REEL_W = STORY_W;
export const REEL_H = STORY_H;
export const REEL_SECONDS = 15;

export interface ReelInput {
  stats: PieceStats;
  dests: string[];
  url: string;
  logo: HTMLImageElement | null;
}

export const GLOBE_BOX = { x: 270, y: 640, size: 540 };
/** the music box (ribbon, label, routes sounding) under the numbers */
export const SCOPE_BOX = { x: 60, y: 1370, w: 960, h: 240 };

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

  const logoH = drawLogo(ctx, c.logo, W / 2, SAFE_TOP, 120, 100);
  const top = logoH > 0 ? SAFE_TOP + logoH + 16 : SAFE_TOP;
  ctx.fillStyle = INK;
  ctx.font = '700 28px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("TURKISH AIRLINES", W / 2, top + 24);
  ctx.fillStyle = RED;
  ctx.font = '600 32px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("A WORLD OF MUSIC", W / 2, top + 80);
  ctx.fillStyle = INK;
  ctx.font = '700 76px "TK Display Condensed", "Arial Narrow", system-ui, sans-serif';
  wrap(ctx, c.stats.title.toUpperCase(), W - 140)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, W / 2, top + 165 + i * 80));

  // globe window frame
  const g = GLOBE_BOX;
  ctx.strokeStyle = "rgba(233,237,245,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.size, g.size, 40);
  ctx.stroke();

  const y0 = g.y + g.size + 62;
  ctx.font = '44px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(flagsOf(c.dests, 12).map(flagOf).join(" "), W / 2, y0);
  ctx.font = '500 32px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText(`${c.stats.destinations} DESTINATIONS · ${c.stats.countries} COUNTRIES · ${c.stats.km.toLocaleString("en")} KM`, W / 2, y0 + 54);
  ctx.font = '400 26px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(`SIGNATURE VOICE · ${c.stats.signature.toUpperCase()}`, W / 2, y0 + 98);

  // the box the live frames are drawn into
  const sb = SCOPE_BOX;
  ctx.fillStyle = "rgba(2, 4, 12, 0.6)";
  ctx.strokeStyle = "rgba(233,237,245,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(sb.x, sb.y, sb.w, sb.h, 20);
  ctx.fill();
  ctx.stroke();

  ctx.font = '400 22px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  const foot = [NETWORK_CLAIM.toUpperCase(), `${NETWORK_DESTINATIONS} DESTINATIONS · ${NETWORK_COUNTRIES} COUNTRIES`];
  const lines = foot.flatMap((t) => wrap(ctx, t, W - 160));
  lines.forEach((l, i) => ctx.fillText(l, W / 2, SAFE_LAST_Y - (lines.length - 1 - i) * 30));
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

export interface ScopeFrame {
  /** the music box's own canvas (note ribbon + day curve) */
  canvas: HTMLCanvasElement | null;
  /** "ROUTES → MUSIC · VERSE · 84 BPM" */
  label: string;
  /** routes sounding now: text and the colour of their marker */
  items: { text: string; color: string }[];
}

/** one frame of the music box inside the reel (called every frame, after the globe) */
export function drawScopeFrame(ctx: CanvasRenderingContext2D, f: ScopeFrame): void {
  const b = SCOPE_BOX;
  const pad = 20;
  const ch = b.h - pad * 2;
  let cw = 0;
  if (f.canvas && f.canvas.width > 0 && f.canvas.height > 0) {
    // the ribbon keeps its own proportions; the label and the routes sounding stand to its right
    cw = Math.min(560, Math.round(ch * (f.canvas.width / f.canvas.height)));
    ctx.drawImage(f.canvas, b.x + pad, b.y + pad, cw, ch);
  }
  const x0 = b.x + pad + cw + 28;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = '400 21px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  const head = wrap(ctx, f.label, b.x + b.w - pad - x0);
  head.slice(0, 2).forEach((l, i) => ctx.fillText(l, x0, b.y + pad + 22 + i * 28));
  const y0 = b.y + pad + 22 + Math.min(2, head.length) * 28 + 14;
  f.items.slice(0, 3).forEach((it, i) => {
    const y = y0 + 22 + i * 34;
    ctx.fillStyle = it.color;
    ctx.fillRect(x0, y - 22, 6, 28);
    ctx.fillStyle = INK;
    ctx.font = '400 24px "TK Text Wide", system-ui, sans-serif';
    ctx.fillText(it.text, x0 + 16, y);
  });
  ctx.textAlign = "center";
}
