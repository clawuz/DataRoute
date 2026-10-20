import type { PersonalRoute } from "./routes";
import type { Rgb } from "../scene/palette-ext";
import { ROUTE_HEX, ROUTE_RGB, routeIndex } from "../scene/route-palette";

const GOLDEN = 137.508;

/** hsl (h in degrees, s and l in 0..1) → rgb in 0..1 */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

export interface RoutePalette {
  /** CSS colour per route key — what the note ribbon and the list use */
  css: Map<string, string>;
  /** the same colours as rgb, in route order — what the globe draws the tracks in (palette index 7 + i) */
  rgb: Rgb[];
}

/** Routes wear the live screen's red / white / blue / grey; both directions of a route share a colour, and the globe and the music box read the same table. */
export function routePalette(routes: PersonalRoute[]): RoutePalette {
  const css = new Map<string, string>();
  const rgb: Rgb[] = [];
  routes.forEach((r) => {
    const i = routeIndex(r.from, r.to);
    css.set(r.key, ROUTE_HEX[i]);
    rgb.push(ROUTE_RGB[i]);
  });
  return { css, rgb };
}
