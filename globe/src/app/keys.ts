export type GlobeCommand =
  | "togglePause" | "scrubBack" | "scrubForward" | "toggleReplay" | "toggleHud" | "fullscreen"
  | "exitFollow" | "toggleTour" | "slower" | "faster";

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
    default:
      return null;
  }
}
