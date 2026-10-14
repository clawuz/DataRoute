import { useEffect, useMemo, useRef, useState } from "react";
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "../scene/engine";
import { routeKey } from "../audio/theory";
import { composePiece } from "./compose";
import { buildPersonalModel } from "./model";
import { createPersonalPlayer, type PersonalPlayer } from "./player";
import { buildRoutes } from "./routes";
import { pieceStats } from "./stats";
import { searchFromSelection, type PersonalSelection } from "./codec";
import { destinationOf, flagOf } from "./destinations";
import { renderCard } from "./card";
import { extOf, pickMime, recordClip } from "./clip";

interface Props {
  selection: PersonalSelection;
  onBack(): void;
}

const SPAN = 86400;

export function Experience({ selection, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PersonalPlayer | null>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<string[]>([]);

  const routes = useMemo(() => buildRoutes(selection.origin, selection.dests), [selection]);
  const piece = useMemo(() => composePiece(selection.mode, routes), [selection.mode, routes]);
  const stats = useMemo(() => pieceStats(selection.mode, selection.origin, selection.dests, routes), [selection.mode, routes]);

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
    engineRef.current = engine;
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
          const far = destinationOf(r.to === "IST" || r.to === "SAW" ? r.from : r.to);
          if (n.instrument !== "CELLO" && far) setNow((p) => [...p.slice(-3), `${flagOf(far.iso)} ${r.from} → ${r.to} · ${far.city}`]);
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
      engineRef.current = null;
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

  const say = (t: string, ms = 2600) => {
    setToast(t);
    setTimeout(() => setToast(""), ms);
  };
  const deliver = async (blob: Blob, name: string, title: string) => {
    const file = new File([blob], name, { type: blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${stats.title} — ${url()}` });
        return;
      }
    } catch {
      return; // the share sheet was dismissed
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say("SAVED");
  };
  const saveCard = async () => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || busy) return;
    setBusy("CARD");
    try {
      // the drawing buffer is only readable inside the frame it was drawn in
      const globe = await new Promise<HTMLImageElement>((res, rej) => {
        const timer = setTimeout(() => {
          engine.setAfterRender(null);
          rej(new Error("no frame (tab in the background?)"));
        }, 2500);
        engine.setAfterRender(() => {
          clearTimeout(timer);
          engine.setAfterRender(null);
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = () => rej(new Error("capture failed"));
          img.src = canvas.toDataURL("image/jpeg", 0.92);
        });
      });
      const blob = await renderCard({ mode: selection.mode, stats, dests: selection.dests, globe, url: url() });
      await deliver(blob, "a-world-of-music.png", "A World of Music");
    } catch {
      say("COULD NOT MAKE THE CARD");
    } finally {
      setBusy(null);
    }
  };
  const saveClip = async () => {
    const canvas = canvasRef.current;
    const audio = playerRef.current?.audioStream();
    const mime = pickMime();
    if (!canvas || !mime || busy) {
      if (!mime) say("VIDEO IS NOT SUPPORTED HERE — SAVE THE CARD");
      return;
    }
    setBusy("VIDEO");
    try {
      const stream = canvas.captureStream(30);
      audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
      const blob = await recordClip(stream, 12000, mime);
      await deliver(blob, `a-world-of-music.${extOf(mime)}`, "A World of Music");
    } catch {
      say("COULD NOT RECORD THE VIDEO");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="loading">{error}</div>;
  return (
    <>
      <canvas ref={canvasRef} className="stage" role="img" aria-label="A 3D globe with your routes drawn on it, played as music" />
      <div className="personal-hud">
        <button type="button" className="landing-back" onClick={onBack}>← NEW PIECE</button>
        <h1 className="personal-title">{stats.title}</h1>
        <p className="personal-sub">
          {stats.destinations} DESTINATIONS · {stats.countries} COUNTRIES · {stats.km.toLocaleString("en")} KM{stats.laps >= 0.1 ? ` · ${stats.laps}× AROUND THE EARTH` : ""}
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
        <button type="button" className="ghost-btn" disabled={!!busy} onClick={saveCard}>{busy === "CARD" ? "MAKING…" : "CARD"}</button>
        <button type="button" className="ghost-btn" disabled={!!busy} onClick={saveClip}>{busy === "VIDEO" ? "RECORDING 12 S…" : "VIDEO"}</button>
        <button type="button" className="ghost-btn" onClick={() => { const m = !muted; setMuted(m); playerRef.current?.setMuted(m); }}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
      </div>
      {toast && <div className="notice">{toast}</div>}
    </>
  );
}
