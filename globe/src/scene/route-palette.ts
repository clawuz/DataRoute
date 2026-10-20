// the live screen's route colours: red, white, blue and grey. A route keeps one colour everywhere (the globe's arcs and corridors, the
// route lines in the music box); both directions of a route share it, so IST-LHR and LHR-IST are the same colour.
export const ROUTE_HEX = ["#ff2438", "#ff2438", "#f4f8ff", "#f4f8ff", "#4f8dff", "#4f8dff", "#9aa4b8", "#9aa4b8"] as const;

/** is the personal live screen on (its body class is set by the app) */
export const neonRoutesOn = (): boolean => typeof document !== "undefined" && document.body.classList.contains("personal-build");

/** index into ROUTE_HEX for a route between two airport codes (order does not matter) */
export function routeIndex(a: string, b: string): number {
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % ROUTE_HEX.length;
}

export const routeHex = (a: string, b: string): string => ROUTE_HEX[routeIndex(a, b)];

const toRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const ROUTE_RGB: [number, number, number][] = ROUTE_HEX.map(toRgb);
