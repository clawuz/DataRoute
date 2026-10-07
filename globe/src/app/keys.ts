export type GlobeCommand =
  | "togglePause" | "scrubBack" | "scrubForward" | "toggleReplay" | "toggleHud" | "fullscreen"
  | "exitFollow" | "toggleTour" | "slower" | "faster"
  | "toggleCorridors" | "toggleAurora" | "toggleSound";

export const SCRUB_SEC = 3600;

export function keyToCommand(key: string): GlobeCommand | null {
  switch (key) {
    case " ":
    case "Spacebar":
      return "togglePause";
    case "ArrowLeft":
      return "scrubBack";
    case "ArrowRight":
      return "scrubForward";
    case "r":
    case "R":
      return "toggleReplay";
    case "h":
    case "H":
      return "toggleHud";
    case "f":
    case "F":
      return "fullscreen";
    case "Escape":
    case "g":
    case "G":
      return "exitFollow";
    case "t":
    case "T":
      return "toggleTour";
    case "[":
      return "slower";
    case "]":
      return "faster";
    case "c":
    case "C":
      return "toggleCorridors"; // art:corridors
    case "a":
    case "A":
      return "toggleAurora"; // art:core
    case "m":
    case "M":
      return "toggleSound"; // art:sound
    default:
      return null;
  }
}
