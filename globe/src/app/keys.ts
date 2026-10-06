export type GlobeCommand = "togglePause" | "scrubBack" | "scrubForward" | "toggleReplay" | "toggleHud" | "fullscreen";

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
    default:
      return null;
  }
}
