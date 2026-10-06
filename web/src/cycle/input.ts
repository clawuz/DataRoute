export type KeyCommand = "togglePause" | "scrubBack" | "scrubForward" | "toggleHud" | "fullscreen" | "globe";

export const SCRUB_SEC = 3600;

export function keyToCommand(key: string): KeyCommand | null {
  switch (key) {
    case " ":
    case "Spacebar":
      return "togglePause";
    case "ArrowLeft":
      return "scrubBack";
    case "ArrowRight":
      return "scrubForward";
    case "h":
    case "H":
      return "toggleHud";
    case "f":
    case "F":
      return "fullscreen";
    case "g":
    case "G":
      return "globe";
    default:
      return null;
  }
}
