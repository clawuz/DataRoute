export const CLICK_MAX_PX = 5;
export const CLICK_MAX_MS = 250;

/** A press that moved less than 5 px and lasted less than 250 ms is a click, anything else a drag. */
export const isClick = (dx: number, dy: number, ms: number): boolean =>
  Math.hypot(dx, dy) < CLICK_MAX_PX && ms < CLICK_MAX_MS;
