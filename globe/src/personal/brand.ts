/**
 * The airline's emblem, drawn on the share card and the reel. The file is the airline's own artwork and is supplied by the
 * project owner (public/brand/tk-logo.svg or .png); without it the cards fall back to the wordmark alone.
 */
const CANDIDATES = ["/brand/tk-logo.svg", "/brand/tk-logo.png"];

let cached: Promise<HTMLImageElement | null> | null = null;

export function loadLogo(): Promise<HTMLImageElement | null> {
  cached ??= (async () => {
    for (const src of CANDIDATES) {
      const img = await new Promise<HTMLImageElement | null>((res) => {
        const i = new Image();
        i.onload = () => res(i.naturalWidth > 0 ? i : null);
        i.onerror = () => res(null);
        i.src = src;
      });
      if (img) return img;
    }
    return null;
  })();
  return cached;
}

/** draws the logo centred at `cx`, fitted into `maxW`×`maxH`; returns its drawn height (0 when there is no logo) */
export function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, cx: number, top: number, maxW: number, maxH: number): number {
  if (!logo) return 0;
  const k = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
  const w = logo.naturalWidth * k;
  const h = logo.naturalHeight * k;
  ctx.drawImage(logo, cx - w / 2, top, w, h);
  return h;
}
