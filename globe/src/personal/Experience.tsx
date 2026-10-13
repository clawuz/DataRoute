import { useEffect, useMemo, useRef, useState } from "react";
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "../scene/engine";
import { routeKey } from "../audio/theory";
import { composePiece } from "./compose";
import { buildPersonalModel } from "./model";
import { createPersonalPlayer, type PersonalPlayer } from "./player";
import { buildRoutes } from "./routes";
import { pieceStats } from "./stats";
import { searchFromSelection, type PersonalSelection } from "./codec";
import { countryName, flagOf } from "./countries";

interface Props {
  selection: PersonalSelection;
  onBack(): void;
}

const SPAN = 86400;

export function Experience({ selection, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PersonalPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<string[]>([]);

  const routes = useMemo(() => buildRoutes(selection.mode, selection.isos), [selection]);
  const piece = useMemo(() => composePiece(selection.mode, routes), [selection.mode, routes]);
  const stats = useMemo(() => pieceStats(selection.mode, routes), [selection.mode, routes]);

  useEffect(() => {
    if (!hasWebGL2()) {
      setError("WEBGL2 IS NOT AVAILABLE ON THIS DEVICE");
      return;
    }
    const canvas = canvasRef.current!;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, onError: setError, alwaysPlanned: true });
    } catch (e) {
      setError(String(e));
      return;
    }
    engine.setEffects({ cloudShadow: true, glare: true, aurora: true, corridors: true, sound: false, starMap: true });
    const nowSec = () => Date.now() / 1000;
    engine.setModel(buildPersonalModel(routes), SPAN, nowSec());
    engine.setFrameSource(() => ({ absTime: nowSec(), cur: SPAN, highlight: -1, nowSec: nowSec() }));
    void engine.loadTextures(() => {}).catch(() => {});

    let player: PersonalPlayer | null = null;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      player = createPersonalPlayer(ctx);
      playerRef.current = player;
      const start = () => {
        player?.play(piece, (n) => {
          const r = routes[n.route];
          if (!r) return;
          engine.pulseRoute(routeKey(r.from, r.to, ""));
          engine.pulseAirport(r.to, nowSec());
          engine.pulseAirport(r.from, nowSec());
          if (n.instrument !== "CELLO") setNow((p) => [...p.slice(-3), `${flagOf(r.to)} ${countryName(r.to)}`]);
        });
        setRunning(true);
      };
      start();
      const unlock = () => {
        if (ctx.state !== "running") void ctx.resume().then(() => setRunning(ctx.state === "running"));
      };
      window.addEventListener("pointerdown", unlock, { once: true });
      // autoplay policy: a shared link opened cold has no gesture yet — the overlay below asks for a tap
      setRunning(ctx.state === "running");
      ctx.addEventListener("statechange", () => setRunning(ctx.state === "running"));
    } catch {
      setRunning(false);
    }

    return () => {
      player?.dispose();
      playerRef.current = null;
      engine.dispose();
    };
  }, [routes, piece]);

  const url = () => `${window.location.origin}${window.location.pathname}${searchFromSelection(selection)}`;
  const share = async () => {
    const data = { title: "A World of Music", text: `${stats.title} — my piece of A World of Music`, url: url() };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(data.url);
      setToast("LINK COPIED");
    } catch {
      setToast(data.url);
    }
    setTimeout(() => setToast(""), 2600);
  };

  if (error) return <div className="loading">{error}</div>;
  return (
    <>
      <canvas ref={canvasRef} className="stage" role="img" aria-label="A 3D globe with your routes drawn on it, played as music" />
      <div className="personal-hud">
        <button type="button" className="landing-back" onClick={onBack}>← NEW PIECE</button>
        <h1 className="personal-title">{stats.title}</h1>
        <p className="personal-sub">
          {stats.countries} COUNTRIES · {stats.km.toLocaleString("en")} KM{stats.laps >= 0.1 ? ` · ${stats.laps}× AROUND THE EARTH` : ""}
        </p>
        <p className="personal-sub">SIGNATURE VOICE · {stats.signature.toUpperCase()}</p>
        <div className="personal-now" aria-live="off">
          {now.map((t, i) => (
            <span key={i} style={{ opacity: 0.35 + (i + 1) / now.length * 0.65 }}>{t}</span>
          ))}
        </div>
      </div>
      {!running && (
        <button type="button" className="tap-play" onClick={() => playerRef.current?.resume()}>TAP TO PLAY</button>
      )}
      <div className="personal-actions">
        <button type="button" className="compose-btn" onClick={share}>SHARE MY PIECE</button>
        <button type="button" className="ghost-btn" onClick={() => { const m = !muted; setMuted(m); playerRef.current?.setMuted(m); }}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
      </div>
      {toast && <div className="notice">{toast}</div>}
    </>
  );
}
