import { useEffect, useRef, useState } from "react";

const MIN_MS = 2200; // the animation always gets to play, even when everything is cached
const MAX_MS = 14000; // a slow network never keeps the visitor out
const FADE_MS = 1000;

/**
 * The opening screen: the airline's lockup, a neon line that draws itself and a quiet equaliser. It covers the page until the
 * pictures, the data and the fonts are in, so nothing half-loaded is ever seen or heard, then lifts. `ready` is whatever the
 * screen waits for (null: not known yet); `onDone` fires when the cover has gone.
 */
export function Intro({ ready, onDone, label = "TUNING THE WORLD" }: { ready: Promise<unknown> | null; onDone: () => void; label?: string }) {
  const [phase, setPhase] = useState<"wait" | "leave" | "gone">("wait");
  const born = useRef(performance.now());
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const fonts = typeof document !== "undefined" && document.fonts?.ready ? document.fonts.ready : Promise.resolve();
    const cap = new Promise((r) => setTimeout(r, MAX_MS));
    void Promise.race([Promise.all([ready.catch(() => undefined), fonts.catch(() => undefined)]), cap]).then(() => {
      const wait = Math.max(0, MIN_MS - (performance.now() - born.current));
      setTimeout(() => {
        if (!alive) return;
        setPhase("leave");
        setTimeout(() => {
          if (!alive) return;
          setPhase("gone");
          done.current();
        }, FADE_MS);
      }, wait);
    });
    return () => {
      alive = false;
    };
  }, [ready]);

  if (phase === "gone") return null;
  return (
    <div className={`intro${phase === "leave" ? " leave" : ""}`} role="status" aria-label="Loading">
      <div className="intro-mark">
        <img className="intro-logo" src="/brand/tk-lockup-vertical-light.png" alt="Turkish Airlines" />
        <span className="intro-title">A WORLD OF MUSIC</span>
        <span className="intro-line" aria-hidden="true"><i /></span>
        <span className="intro-eq" aria-hidden="true">{Array.from({ length: 21 }, (_, i) => <i key={i} style={{ animationDelay: `${-((i * 37) % 17) / 10}s`, animationDuration: `${0.8 + ((i * 53) % 9) / 10}s` }} />)}</span>
        <span className="intro-label">{label}</span>
      </div>
    </div>
  );
}
