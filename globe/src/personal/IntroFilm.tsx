import { useEffect, useRef, useState } from "react";
import type { GlobeController } from "../app/controller";
import type { GlobeEngine } from "../scene/engine";
import { FILM_SECONDS, LIVE_VIEW, shotAt } from "./intro-film";

/** ?filmat=10.6 freezes the film at that second, silent (to look at a single frame) */
const frozenAt = (): number | null => { const v = new URLSearchParams(window.location.search).get("filmat"); return v === null || Number.isNaN(+v) ? null : +v; };
const WAIT_CAP_MS = 25000; // a slow network never keeps the visitor out

export interface LiveHandles {
  engine: GlobeEngine;
  controller: GlobeController;
}

/**
 * The opening film, on the live screen's own globe (its furniture is hidden while the film plays): the live tour runs under the camera
 * — the day's replay and the music — so the routes that light are the ones the music plays. It waits for a tap (that is what lets the
 * browser play sound). `ready` is what the live screen is still loading; `live` its globe and controller.
 */
export function IntroFilm({ ready, live, onDone }: { ready: Promise<unknown> | null; live: LiveHandles | null; onDone: (film: boolean) => void }) {
  const [phase, setPhase] = useState<"splash" | "film" | "leave">("splash");
  const [canEnter, setCanEnter] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const els = useRef<Record<string, HTMLElement | null>>({});
  const startRef = useRef(0);
  const lineRef = useRef(-1);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const liveRef = useRef(live);
  liveRef.current = live;

  // the tap is enabled when the live screen is complete: its globe, its data, its fonts
  useEffect(() => {
    if (!ready || !live) return;
    let alive = true;
    void Promise.race([ready.catch(() => undefined), new Promise((r) => setTimeout(r, WAIT_CAP_MS))]).then(() => { if (alive) setCanEnter(true); });
    return () => { alive = false; };
  }, [ready, live]);

  const begin = (withSound: boolean) => {
    const l = liveRef.current;
    if (l) {
      document.body.classList.add("film-on"); // the live furniture waits
      l.engine.setIdleSpin(false);
      l.engine.setRigDistance(9);
      l.engine.centerOn(8, -50, 0);
      l.controller.setMusicFade(1);
      l.controller.onKey("r"); // the tour the site starts with: the day's replay …
      if (withSound) setTimeout(() => l.controller.onKey("m"), 300); // … and its music
    }
    startRef.current = performance.now();
    setPhase("film");
  };
  useEffect(() => {
    if (canEnter && frozenAt() !== null && phase === "splash") begin(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEnter]);

  const finish = () => {
    const l = liveRef.current;
    if (l) {
      l.engine.setRigDistance(null);
      l.engine.centerOn(LIVE_VIEW.lat, LIVE_VIEW.lon, 0);
      l.engine.setAtmosphereBoost(1.9);
      l.engine.setIdleSpin(true, 1);
    }
    document.body.classList.remove("film-on"); // the live furniture comes in
    setPhase("leave");
    doneRef.current(true); // the live screen starts: the music off, the tour from its beginning (App)
  };

  useEffect(() => {
    if (phase !== "film") return;
    let raf = 0;
    const tick = () => {
      const t = frozenAt() ?? Math.min(FILM_SECONDS, (performance.now() - startRef.current) / 1000);
      const s = shotAt(t);
      const l = liveRef.current;
      if (l) {
        l.engine.setRigDistance(s.dist);
        l.engine.centerOn(s.lat, s.lon, 0);
        const g = Math.round(s.glow * 20) / 20;
        if (g !== lineRef.current) { lineRef.current = g; l.engine.setAtmosphereBoost(g); }
        l.controller.setMusicFade(s.music);
      }
      if (rootRef.current) rootRef.current.style.background = `rgba(2, 3, 10, ${s.black})`;
      for (const k of ["brand", "l1", "l2"] as const) { const el = els.current[k]; if (el) el.style.opacity = String(s.text[k]); }
      if (els.current.veil) els.current.veil.style.opacity = String(s.veil);
      if (t >= FILM_SECONDS && frozenAt() === null) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { document.body.classList.remove("film-on"); }, []);

  const skip = () => {
    liveRef.current?.controller.setMusicFade(0);
    finish();
  };
  const set = (k: string) => (e: HTMLElement | null) => { els.current[k] = e; };

  if (phase === "leave") return null;
  return (
    <div ref={rootRef} className={`intro intro-film${phase === "film" ? " playing" : ""}`} role="status" aria-label="Opening film">
      {phase === "splash" && (
        <div className="intro-mark">
          <img className="intro-logo" src="/brand/tk-lockup-vertical-light.png" alt="Turkish Airlines" />
          <span className="intro-title">A WORLD OF MUSIC</span>
          {canEnter ? (
            <>
              <button type="button" className="if-enter" onClick={() => begin(true)}>
                <span className="ms-eq" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${-((i * 37) % 17) / 10}s`, animationDuration: `${0.7 + ((i * 53) % 9) / 10}s` }} />)}</span>
                <span className="ms-make-txt">ENTER WITH SOUND</span>
              </button>
              <button type="button" className="if-quiet" onClick={() => begin(false)}>CONTINUE WITHOUT SOUND</button>
            </>
          ) : (
            <>
              <span className="intro-line" aria-hidden="true"><i /></span>
              <span className="intro-label">TUNING THE WORLD</span>
            </>
          )}
        </div>
      )}
      <div ref={set("veil")} className="if-veil" aria-hidden="true" />
      <div className="if-text">
        <div ref={set("brand")} className="if-brandblock">
          <img className="if-logo" src="/brand/tk-lockup-light.png" alt="Turkish Airlines" />
          <span className="if-world">A WORLD OF MUSIC</span>
        </div>
        <h2 className="if-title">
          <span ref={set("l1")}>We fly to the most countries.</span>
          <span ref={set("l2")}>Now we make them play.</span>
        </h2>
      </div>
      {phase === "film" && <button type="button" className="if-skip" onClick={skip}>SKIP</button>}
    </div>
  );
}
