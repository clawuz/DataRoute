import { NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, flagOf } from "./destinations";
import { drawLogo } from "./brand";
import { flagsOf, wrap } from "./card";
import { countLabel, type PieceStats } from "./stats";
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
export const SCOPE_BOX = { x: 60, y: 1170, w: 960, h: 200 };

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

/** a glass panel with the live screen's edge: red at the left fading to steel blue */
export function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 22, lw = 2): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = "rgba(3, 6, 16, 0.36)";
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y + h * 0.4);
  g.addColorStop(0, "rgba(255, 40, 58, 0.95)");
  g.addColorStop(0.09, "rgba(255, 40, 58, 0.55)");
  g.addColorStop(0.32, "rgba(140, 170, 225, 0.62)");
  g.addColorStop(0.72, "rgba(140, 170, 225, 0.5)");
  g.addColorStop(1, "rgba(150, 180, 235, 0.7)");
  ctx.strokeStyle = g;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

/** The static lockup and numbers on a transparent canvas, drawn once and laid over every frame of the globe. */
/** `withScope`: the video carries the music box; the card has none, so its numbers sit lower */
export function drawReelOverlay(ctx: CanvasRenderingContext2D, c: ReelInput, withScope = true): void {
  const W = REEL_W;
  ctx.clearRect(0, 0, W, REEL_H);
  // soft shade behind the lockup and behind the numbers, so the text reads over any part of the scene
  const top0 = ctx.createLinearGradient(0, 0, 0, 780);
  top0.addColorStop(0, "rgba(2, 3, 10, 0.62)");
  top0.addColorStop(1, "rgba(2, 3, 10, 0)");
  ctx.fillStyle = top0;
  ctx.fillRect(0, 0, W, 780);
  const bot0 = ctx.createLinearGradient(0, REEL_H - 820, 0, REEL_H);
  bot0.addColorStop(0, "rgba(2, 3, 10, 0)");
  bot0.addColorStop(1, "rgba(2, 3, 10, 0.7)");
  ctx.fillStyle = bot0;
  ctx.fillRect(0, REEL_H - 820, W, 820);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  halo(ctx);

  // the vertical lockup of the airline (circle over the name), centred, as the brand gives it
  const logoH = drawLogo(ctx, c.logo, W / 2, SAFE_TOP, 460, 160);
  const top = logoH > 0 ? SAFE_TOP + logoH + 14 : SAFE_TOP;
  ctx.fillStyle = RED;
  ctx.font = '600 32px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText("A WORLD OF MUSIC", W / 2, top + 44);
  ctx.fillStyle = INK;
  // the title keeps to two lines: the size steps down until it does
  let size = 84;
  let titleLines: string[] = [];
  for (; size >= 52; size -= 4) {
    ctx.font = `700 ${size}px "TK Display", "TK Display Condensed", system-ui, sans-serif`;
    titleLines = wrap(ctx, c.stats.title.toUpperCase(), W - 120);
    if (titleLines.length <= 2) break;
  }
  titleLines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, top + 138 + i * (size + 8)));

  // numbers
  // flags, counts and the signature voice sit under the music box (the card has none: they keep the same place)
  const y0 = SCOPE_BOX.y + SCOPE_BOX.h + 64;
  ctx.shadowBlur = 0;
  glassPanel(ctx, SCOPE_BOX.x, y0 - 70, SCOPE_BOX.w, 190);
  halo(ctx);
  ctx.font = '46px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(flagsOf(c.dests, 12).map(flagOf).join(" "), W / 2, y0);
  ctx.font = '500 34px "TK Text Wide", system-ui, sans-serif';
  ctx.fillText(`${countLabel(c.stats.destinations, "destination", "destinations")} · ${countLabel(c.stats.countries, "country", "countries")} · ${c.stats.km.toLocaleString("en")} KM`, W / 2, y0 + 56);
  ctx.font = '400 26px "TK Text Wide", system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(`SIGNATURE VOICE · ${c.stats.signature.toUpperCase()}`, W / 2, y0 + 98);

  // the airline and its claim, ending on the last safe baseline
  ctx.font = '400 20px "TK Text Wide", system-ui, sans-serif';
  const foot = [NETWORK_CLAIM.toUpperCase(), `${NETWORK_DESTINATIONS} DESTINATIONS · ${NETWORK_COUNTRIES} COUNTRIES`];
  const lines = foot.flatMap((t) => wrap(ctx, t, W - 70));
  const first = SAFE_LAST_Y - (lines.length - 1) * 30;
  ctx.font = '400 20px "TK Text Wide", system-ui, sans-serif';
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
  // the box as on the live screen: a glass panel with the red → steel edge, an ear with its name, the neon ribbon filling it
  glassPanel(ctx, b.x, b.y, b.w, b.h);
  ctx.save();
  ctx.font = '500 22px "TK Text Wide", system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const label = (f.label || "ROUTES → MUSIC").toUpperCase();
  const tw = Math.min(b.w - 80, Math.ceil(ctx.measureText(label).width) + 56);
  glassPanel(ctx, b.x, b.y - 54, tw, 66, 18);
  ctx.fillStyle = INK;
  ctx.fillText(label, b.x + 28, b.y - 20, tw - 56);
  ctx.restore();
  if (f.canvas && f.canvas.width > 0 && f.canvas.height > 0) {
    // the ribbon keeps its own proportions, centred in the box
    const k = Math.min(b.w / f.canvas.width, b.h / f.canvas.height);
    const w = f.canvas.width * k;
    const h = f.canvas.height * k;
    ctx.drawImage(f.canvas, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
}
