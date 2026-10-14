import { destinationOf } from "./destinations";



/** the first `max` distinct countries, in the order picked */
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
