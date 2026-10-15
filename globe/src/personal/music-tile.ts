/**
 * The bars of the music box (the scope's piano roll) as a tile for the entry title: note bars of different lengths
 * and colours on nine rows, drawn once to a canvas. The tile is 5.2 times as wide as it is high and has no seam.
 */
const GOLDEN = 137.508;
/** the music box colours its notes by walking the hue wheel by the golden angle: the same here, so no colour leads */
const colorAt = (i: number): string => `hsl(${Math.round((i * GOLDEN + 12) % 360)}, 74%, 62%)`;

/** a small deterministic generator, so the tile is the same every time */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Bar {
  x: number;
  row: number;
  len: number;
  color: string;
}

export function tileBars(width = 520, rows = 9, seed = 11): Bar[] {
  const r = rng(seed);
  // a few long notes and many short ones, as in the scope
  const LENGTHS = [10, 14, 18, 24, 30, 40, 54, 72, 96, 128, 168];
  const out: Bar[] = [];
  let n = 0;
  for (let row = 0; row < rows; row++) {
    let x = Math.floor(r() * 50);
    for (;;) {
      const len = LENGTHS[Math.floor(r() * r() * LENGTHS.length)] + Math.floor(r() * 8);
      if (x + len > width - 6) break;
      if (r() < 0.5) out.push({ x, row, len, color: colorAt(n++) });
      x += len + 6 + Math.floor(r() * 70);
    }
  }
  return out;
}

/** a PNG data URL of the tile, or null where there is no canvas */
export function musicTileUrl(): string | null {
  if (typeof document === "undefined") return null;
  const W = 520;
  const H = 100;
  const k = 2;
  const c = document.createElement("canvas");
  c.width = W * k;
  c.height = H * k;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.scale(k, k);
  for (const b of tileBars(W)) {
    const y = 8 + b.row * 10 - 4;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, y, b.len, 8);
  }
  try {
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}
