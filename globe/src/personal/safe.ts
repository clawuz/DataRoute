/**
 * Instagram Stories and Reels (1080×1920) cover the top and the bottom of the picture with the app's own UI:
 * the profile bar at the top, the reply / caption bar at the bottom. Keep logos and text inside this band.
 */
export const STORY_W = 1080;
export const STORY_H = 1920;
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 250;
/** the lowest baseline a line of text may sit on */
export const SAFE_LAST_Y = STORY_H - SAFE_BOTTOM;
