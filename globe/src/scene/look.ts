// the new globe look (the illustrated night / day Earth, the blue Milky Way sky, the glow round the globe): always on in the live screen
// (its body class), and switched on by the entry screen and the result screen of a personal piece through `applyNewGlobeLook`
import type { GlobeEngine } from "./engine";

let forced = false;
export const setNewGlobeLook = (on: boolean): void => {
  forced = on;
};
export const newGlobeLook = (): boolean => forced || (typeof document !== "undefined" && document.body.classList.contains("personal-build"));

/** call right after the engine is created (before its textures load) */
export function applyNewGlobeLook(engine: GlobeEngine): void {
  setNewGlobeLook(true);
  engine.setSpaceDim(0.8, false); // a still sky: no drifting clouds
  engine.setSkyBlue(true);
  engine.setAtmosphereBoost(1.9);
}
