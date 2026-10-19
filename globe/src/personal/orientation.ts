/**
 * A phone turned on its side keeps the portrait picture: the page is turned back by the angle the phone was turned
 * (browsers cannot lock the orientation outside an installed app). Only on touch screens that are small. The globe is not
 * draggable then (its pointer maths knows only the upright picture); the buttons and cards work as usual.
 */
export function installPortraitHold(): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const update = (): void => {
    try {
      const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const on = coarse && w > h && Math.min(w, h) < 600;
      root.classList.toggle("force-portrait", on);
      if (!on) return;
      const angle = screen.orientation?.angle ?? (typeof window.orientation === "number" ? window.orientation : 90);
      // the phone turned a quarter one way: the page a quarter the other way
      root.dataset.rot = angle === 270 || angle === -90 ? "ccw" : "cw";
      root.style.setProperty("--fp-w", `${h}px`); // the page's width is the screen's height
      root.style.setProperty("--fp-h", `${w}px`);
    } catch {
      /* a decoration: never break the page */
    }
  };
  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", () => setTimeout(update, 60));
}
