import { NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, flagOf } from "./destinations";
import { drawLogo } from "./brand";
import { flagsOf, wrap } from "./card";
import type { PieceStats } from "./stats";
import { SAFE_LAST_Y, SAFE_TOP, STORY_H, STORY_W } from "./safe";

/**
 * The reel is the globe scene itself, rendered at 9:16, with the lockup, numbers and the music box laid over it.
 * Instagram Stories / Reels: the top and bottom 250 px are covered by the app's own UI, so text stays inside the band.
 */
export const REEL_W = STORY_W;
export const REEL_H = STORY_H;
export const REEL_SECONDS = 15;

export interface ReelInput {
  stats: PieceStats;
  dests: string[];
  url: string;
  logo: HTMLImageElement | null;
}

/** the music box (note ribbon, label, routes sounding) over the lower part of the globe — no panel behind it */
export const SCOPE_BOX = { x: 60, y: 1330, w: 960, h: 240 };

const RED = "#FF3B47";
const INK = "#F2F5FA";
const DIM = "rgba(242,245,250,0.78)";

/** text lies straight on the moving scene: a soft dark halo keeps it readable */
function halo(ctx: CanvasRenderingContext2D, blur = 14): void {
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
}

/** The static lockup and numbers on a transparent canvas, drawn once and laid over every frame of the globe. */
export function drawReelOverlay(ctx: CanvasRenderingContext2D, c: ReelInput): void {
  const W = REEL_W;
  ctx.clearRect(0, 0, W, REEL_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  halo(ctx);

  const logoH = drawLogo(ctx, c.logo, W / 2, SAFE_TOP, 130, 110);
  const top = logoH > 0 ? SAFE_TOP + logoH + 16 : SAFE_TOP;
  ctx.fillStyle = INK;
  ctx.font = '700 30px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("TURKISH AIRLINES", W / 2, top + 26);
  ctx.fillStyle = RED;
  ctx.font = '600 34px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("A WORLD OF MUSIC", W / 2, top + 84);
  ctx.fillStyle = INK;
  ctx.font = '700 84px "TK Display Condensed", "Arial Narrow", system-ui, sans-serif';
  wrap(ctx, c.stats.title.toUpperCase(), W - 140)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, W / 2, top + 178 + i * 88));

  // numbers, just above the music box
  const y0 = SCOPE_BOX.y - 100;
  ctx.font = '46px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(flagsOf(c.dests, 12).map(flagOf).join(" "), W / 2, y0);
  ctx.font = '500 34px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText(`${c.stats.destinations} DESTINATIONS · ${c.stats.countries} COUNTRIES · ${c.stats.km.toLocaleString("en")} KM`, W / 2, y0 + 56);
  ctx.font = '400 26px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(`SIGNATURE VOICE · ${c.stats.signature.toUpperCase()}`, W / 2, y0 + 98);

  // the airline and its claim, ending on the last safe baseline
  ctx.font = '400 22px "TK Text Wide", system-ui, sans-serif';
  const foot = [NETWORK_CLAIM.toUpperCase(), `${NETWORK_DESTINATIONS} DESTINATIONS · ${NETWORK_COUNTRIES} COUNTRIES`];
  const lines = foot.flatMap((t) => wrap(ctx, t, W - 160));
  const first = SAFE_LAST_Y - (lines.length - 1) * 30;
  ctx.font = '700 24px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText("TURKISH AIRLINES", W / 2, first - 38);
  ctx.font = '400 22px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, first + i * 30));
  ctx.shadowBlur = 0;
}

export interface ScopeFrame {
  /** the music box's own canvas (note ribbon + day curve) */
  canvas: HTMLCanvasElement | null;
  /** "ROUTES → MUSIC · VERSE · 84 BPM" */
  label: string;
  /** routes sounding now: text and the colour of their marker */
  items: { text: string; color: string }[];
}

/** one frame of the music box over the globe (called every frame, after the globe and the overlay) */
export function drawScopeFrame(ctx: CanvasRenderingContext2D, f: ScopeFrame): void {
  const b = SCOPE_BOX;
  const ch = b.h;
  let cw = 0;
  if (f.canvas && f.canvas.width > 0 && f.canvas.height > 0) {
    // the ribbon keeps its own proportions; the label and the routes sounding stand to its right
    cw = Math.min(560, Math.round(ch * (f.canvas.width / f.canvas.height)));
    ctx.drawImage(f.canvas, b.x, b.y, cw, ch);
  }
  const x0 = b.x + cw + 28;
  ctx.save();
  halo(ctx, 10);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = '400 22px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  const head = wrap(ctx, f.label, b.x + b.w - x0);
  head.slice(0, 2).forEach((l, i) => ctx.fillText(l, x0, b.y + 24 + i * 28));
  const y0 = b.y + 24 + Math.min(2, head.length) * 28 + 12;
  f.items.slice(0, 3).forEach((it, i) => {
    const y = y0 + 24 + i * 36;
    ctx.fillStyle = it.color;
    ctx.fillRect(x0, y - 22, 6, 28);
    ctx.fillStyle = INK;
    ctx.font = '400 25px "TK Text Wide", system-ui, sans-serif';
    ctx.fillText(it.text, x0 + 16, y);
  });
  ctx.restore();
  ctx.textAlign = "center";
}
