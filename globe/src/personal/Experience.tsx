import { Intro } from "./Intro";
import { Eq } from "../hud/Eq";
import { useEffect, useMemo, useRef, useState } from "react";
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "../scene/engine";
import { routeKey } from "../audio/theory";
import { clipNotes, clipStart, composePiece, type PersonalNote, type PersonalPiece } from "./compose";
import { buildPersonalModel } from "./model";
import { createPersonalPlayer, type PersonalPlayer } from "./player";
import { buildRoutes } from "./routes";
import { countLabel, pieceStats } from "./stats";
import { searchFromSelection, type PersonalSelection } from "./codec";
import { destinationOf, flagOf } from "./destinations";
import { AI_MESSAGE, characterOf, requestAi } from "./ai";
import { AUTO_AT, LIBRARY, pickTrack } from "./library";
import { analyze } from "./analyze";
import { assignToRoutes, followAudio, type Follower } from "./follow";
import { MusicScope } from "../hud/MusicScope";
import { baseOf } from "../audio/theory";
import { PITCH_MAX, PITCH_MIN } from "../audio/scope";
import { createNoteBus } from "../audio/notes-bus";
import type { MusicHud } from "../app/hud-model";
import { loadLogo } from "./brand";
import { routePalette } from "./colors";
import { setExtraColors } from "../scene/palette-ext";
import { applyNewGlobeLook } from "../scene/look";
import { ISTANBUL } from "./destinations";
import { REEL_H, REEL_SECONDS, REEL_W, drawReelOverlay, drawScopeFrame } from "./reel";
import { chooseDelivery, extOf, pickMime, recordClip } from "./clip";

interface Props {
  selection: PersonalSelection;
  onBack(): void;
}


/**
 * Where a note sits on the music box's ribbon: each route has a band of its own (its line moves up and down inside it
 * by the note's pitch), so no two routes draw over each other. The sound is not changed.
 */
function ribbonPitch(route: number, freq: number, count: number): number {
  const bands = Math.min(Math.max(count, 1), 24);
  const band = route % bands;
  const h = 1 / bands;
  const local = Math.min(1, Math.max(0, (69 + 12 * Math.log2(freq / 440) - 36) / 60)); // C2 … C7 inside the band
  const y = band * h + h * 0.18 + local * h * 0.64;
  return PITCH_MIN * (PITCH_MAX / PITCH_MIN) ** y;
}

/** the studio (orchestra) version is parked: the piece is always the one the site composes from the route lines */
const STUDIO_ON = false;

export function Experience({ selection, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PersonalPlayer | null>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [introReady, setIntroReady] = useState<Promise<unknown> | null>(null); // the opening screen covers the piece until the globe is complete
  const [introOn, setIntroOn] = useState(true);
  /** the AI version: idle → composing → on (and back to "my version") */
  const [ai, setAi] = useState<"idle" | "composing" | "on">("idle");
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  /** the notes heard in the AI version, handed to the routes: they drive the music box and the lights while it plays */
  const aiNotesRef = useRef<PersonalNote[] | null>(null);
  const followerRef = useRef<Follower | null>(null);
  const [aiSyncing, setAiSyncing] = useState(false);
  const aiUrlRef = useRef<string | null>(null);
  /** while the video is made: a still of the current view with a progress screen over it */
  const [making, setMaking] = useState<{ still: string; startedAt: number; kind: "VIDEO" | "CARD" } | null>(null);
  const [makingSec, setMakingSec] = useState(0);
  const noteCbRef = useRef<((n: PersonalNote) => void) | null>(null);
  const pieceRef = useRef<PersonalPiece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState("");
  const noteBus = useMemo(createNoteBus, []);
  const planCbRef = useRef<((n: PersonalNote, wallAt: number) => void) | null>(null);
  const [scope, setScope] = useState<{ pos: number; section: string }>({ pos: 0, section: "" });

  const routes = useMemo(() => buildRoutes(selection.places, selection.home), [selection]);
  const piece = useMemo(() => composePiece(selection.mode, routes), [selection.mode, routes]);
  /** a studio piece that is like these picks (a finished file on the site: no request is made) */
  const studio = useMemo(() => (!STUDIO_ON || routes.length < 2 ? null : pickTrack(LIBRARY, selection.mode, characterOf(selection.mode, routes, selection.places.length).regions, selection.places.length)), [selection, routes]);
  const autoStudio = useRef(false);
  const palette = useMemo(() => routePalette(routes), [routes]);
  const stats = useMemo(() => pieceStats(selection.mode, selection.places, selection.home, routes), [selection.mode, routes]);

  useEffect(() => { // the live screen's look (the neon music box) while a piece is shown
    document.body.classList.add("personal-build");
    return () => document.body.classList.remove("personal-build");
  }, []);

  useEffect(() => {
    if (!hasWebGL2()) {
      setError("WEBGL2 IS NOT AVAILABLE ON THIS DEVICE");
      return;
    }
    const canvas = canvasRef.current!;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, onError: setError, noAirports: true });
    } catch (e) {
      setError(String(e));
      return;
    }
    engineRef.current = engine;
    engine.setNight(true); // always the night side: the lights and the routes read best on it
    applyNewGlobeLook(engine); // the live screen's globe: night / day Earth, the blue sky, the glow
    engine.setPortraitFit(true);
    engine.setPortraitShift(-20); // a phone: the globe sits higher, the music box lower
    engine.setEffects({ cloudShadow: true, glare: true, aurora: false, corridors: true, sound: false, starMap: true });
    const nowSec = () => Date.now() / 1000;
    setExtraColors(palette.rgb); // before the model: the arcs read the palette when they are built
    const model = buildPersonalModel(routes);
    engine.setModel(model, model.span, nowSec());
    engine.setFrameSource(() => ({ absTime: nowSec(), cur: model.span, highlight: -1, nowSec: nowSec() }));
    setIntroReady(engine.loadTextures(() => {}).catch(() => null).then(() => engine.whenAssetsReady()));

    // drag to turn the globe (the card and the video take whatever angle is on screen)
    let drag: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const t = performance.now();
      engine.dragBy(e.clientX - drag.x, e.clientY - drag.y, (t - drag.t) / 1000);
      drag = { x: e.clientX, y: e.clientY, t };
    };
    const up = (e: PointerEvent) => {
      if (!drag) return;
      drag = null;
      engine.endDrag();
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    let player: PersonalPlayer | null = null;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      player = createPersonalPlayer(ctx, (loading) => setToast(loading ? "LOADING INSTRUMENTS…" : ""));
      playerRef.current = player;
      pieceRef.current = piece;
      noteCbRef.current = (n) => {
        const r = n.route >= 0 ? routes[n.route] : undefined;
        if (!r || n.show === false) return; // the home drone hums under the trip: it does not flash a corridor
        engine.pulseRoute(routeKey(r.from, r.to, "")); // the live globe's flash: the corridor of the sounding route
      };
      // the music box: a note appears on the ribbon three seconds before it sounds
      planCbRef.current = (n, wallAt) => {
        // the lead's own route, or for the accompaniment the route that leads its bar: every hit is on the ribbon
        const r = routes[n.route >= 0 ? n.route : n.via];
        if (!r || n.show === false) return; // the home drone (show: false) sounds but is not drawn
        // the accompaniment is drawn softer than the line, so the line stays the picture
        noteBus.emit({ instrument: baseOf(n.instrument), lane: baseOf(n.instrument), freq: n.freq, pitch: ribbonPitch(n.route >= 0 ? n.route : n.via, n.freq, routes.length), vel: n.route >= 0 ? n.vel : n.vel * 0.55, kind: "line", key: r.key, at: wallAt, durSec: n.drawDur ?? n.d, lineId: r.key, alt: n.alt });
      };
      const start = () => {
        player?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
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
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      player?.dispose();
      playerRef.current = null;
      engineRef.current = null;
      noteCbRef.current = null;
      planCbRef.current = null;
      aiAudioRef.current?.pause();
      followerRef.current?.stop();
      engine.dispose();
    };
  }, [routes, piece, palette]);

  useEffect(() => {
    if (!making) {
      setMakingSec(0);
      return;
    }
    const id = setInterval(() => setMakingSec((performance.now() - making.startedAt) / 1000), 200);
    return () => clearInterval(id);
  }, [making]);

  // the playhead of the music box
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p || piece.duration <= 0) return;
      const el = aiAudioRef.current;
      // while the AI version plays the playhead is the audio element's, mapped onto the same form
      const t = ai === "on" && el && el.duration > 0 ? ((el.currentTime % el.duration) / el.duration) * piece.duration : Math.min(p.position(), piece.duration);
      const sec = piece.sections.find((x) => t >= x.start && t < x.end) ?? piece.sections[piece.sections.length - 1];
      setScope((prev) => {
        const pos = Math.round((t / piece.duration) * 200) / 200;
        return prev.pos === pos && prev.section === (sec?.name ?? "") ? prev : { pos, section: sec?.name ?? "" };
      });
    }, 250);
    return () => clearInterval(id);
  }, [piece, ai]);

  const musicHud: MusicHud = useMemo(
    () => ({
      on: true,
      section: "DAY",
      chord: "",
      bpm: piece.bpm,
      instruments: [],
      level: 0,
      layers: [],
      day: { curve: piece.energy, pos: scope.pos, level: piece.energy[Math.min(47, Math.floor(scope.pos * 48))] ?? 0, hour: 0, airborne: 0, windows: Math.max(1, piece.sections.length) },
    }),
    [piece, scope.pos],
  );

  const url = () => `${window.location.origin}${window.location.pathname}${searchFromSelection(selection)}`;
  const share = async () => {
    const data = { title: "A World of Music", text: `${stats.title} · I turned my journey into music. A World of Music, by Turkish Airlines`, url: url() };
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
    // phones and tablets: the share sheet (Instagram, Messages …); desktops: a plain browser download
    const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (chooseDelivery(touch, !!navigator.canShare?.({ files: [file] })) === "share") {
      try {
        await navigator.share({ files: [file], title, text: `${stats.title} · I turned my journey into music. A World of Music, by Turkish Airlines — ${url()}` });
        return;
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return; // the sheet was dismissed
        // NotAllowedError (the recording outlasted the tap) and others: fall through to a download
      }
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(href);
    }, 10000);
    say(touch ? "SAVED — CHECK YOUR FILES OR PHOTOS" : `DOWNLOADED ${name}`, 4000);
  };
  const AI_ENDPOINT = (import.meta.env.VITE_PERSONAL_AI_URL as string | undefined) || "";
  const stopAi = () => {
    aiAudioRef.current?.pause();
    followerRef.current?.stop();
    followerRef.current = null;
    playerRef.current?.setSynthMuted(false);
    // our own piece plays again, with its own lights
    playerRef.current?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
    setAi("idle");
  };
  const startAiAudio = (el: HTMLAudioElement) => {
    el.currentTime = 0;
    void el.play().catch(() => {});
    playerRef.current?.setSynthMuted(true);
    followerRef.current?.stop();
    followerRef.current = null;
    const heard = aiNotesRef.current;
    if (heard && heard.length > 0) {
      // the lights follow what is heard: the page's own scheduling stops and the notes found in the AI version drive them
      playerRef.current?.stop();
      followerRef.current = followAudio(el, heard, (n, at) => planCbRef.current?.(n, at), (n) => noteCbRef.current?.(n));
    } else {
      playerRef.current?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
    }
    setAi("on");
  };
  /** listens to the AI version once: where its notes are, handed to the routes */
  const listenTo = async (url: string): Promise<void> => {
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
      const mono = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
      }
      await new Promise((r) => setTimeout(r, 0));
      aiNotesRef.current = assignToRoutes(analyze(mono, buf.sampleRate), routes);
    } catch {
      aiNotesRef.current = null; // the lights then keep following the page's own piece
    }
  };
  const toggleAi = async () => {
    if (ai === "composing") return;
    if (ai === "on") {
      stopAi();
      return;
    }
    if (aiUrlRef.current && aiAudioRef.current) {
      startAiAudio(aiAudioRef.current);
      return;
    }
    setAi("composing");
    let url: string;
    if (studio) {
      // a finished studio piece that is like these picks: it is a file of the site
      url = `/library/${studio.track.file}`;
    } else {
      const r = await requestAi(AI_ENDPOINT, characterOf(selection.mode, routes, selection.places.length));
      if (r.status !== "ready") {
        setAi("idle");
        say(AI_MESSAGE[r.status], 5000);
        return;
      }
      url = r.url;
    }
    setAiSyncing(true);
    await listenTo(url);
    setAiSyncing(false);
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.loop = true;
    el.preload = "auto";
    el.src = url;
    aiAudioRef.current = el;
    aiUrlRef.current = url;
    playerRef.current?.attachElement(el);
    startAiAudio(el);
  };

  // a studio piece that is really like the picks (the mode and the main region agree) starts by itself, from two routes
  // on; a lone route keeps its own single instrument. Anything less alike is offered with the button.
  useEffect(() => {
    if (!studio || routes.length < 2 || studio.score < AUTO_AT || autoStudio.current) return;
    autoStudio.current = true;
    setTimeout(() => void toggleAi(), 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio]);

  /**
   * The Story scene shared by the card and the video: the globe scene itself laid out as 1080×1920 (the stage canvas is given
   * a 9:16 backbuffer and scaled down to fit the window, hidden under the progress screen), turned so Istanbul is in the
   * middle, with the lockup, the numbers and the music box composed over every frame. `work` gets the frame composer.
   */
  const withStory = async (kind: "VIDEO" | "CARD", work: (frame: () => void, comp: HTMLCanvasElement) => Promise<void>) => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const logo = await loadLogo();
    try {
      await document.fonts.load('700 84px "TK Display"');
      await document.fonts.load('500 34px "TK Text Wide"');
    } catch {
      /* system fonts */
    }
    // a still of what the person is looking at stays on screen under the progress card while the stage is re-laid out
    const still = await new Promise<string>((res) => {
      const timer = setTimeout(() => {
        engine.setAfterRender(null);
        res("");
      }, 1500);
      engine.setAfterRender(() => {
        clearTimeout(timer);
        engine.setAfterRender(null);
        res(canvas.toDataURL("image/jpeg", 0.7));
      });
    });
    setMaking({ still, startedAt: performance.now(), kind });
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = REEL_W / dpr;
      const cssH = REEL_H / dpr;
      const k = Math.min(1, (window.innerHeight - 24) / cssH);
      canvas.style.cssText = `position:fixed;inset:auto;left:50%;top:12px;width:${cssW}px;height:${cssH}px;transform-origin:top center;transform:translateX(-50%) scale(${k});z-index:15;cursor:default`;
      document.body.classList.add("recording-reel");
      // the engine re-sizes itself to the new canvas: wait until its backbuffer is the story's size (at most ~4 s)
      for (let i = 0; i < 40 && Math.abs(canvas.width - REEL_W) > 2; i++) await new Promise((r) => setTimeout(r, 100));
      engine.centerOn(ISTANBUL.lat, ISTANBUL.lon, 0); // Istanbul is in the exact middle of the picture
      engine.setIdleSpin(false); // the clip turns the globe by a few degrees itself (see `frame`), Istanbul stays in the middle
      engine.setPortraitFit(false); // the story picture keeps the framing it was drawn for
      engine.setPortraitShift(0); // no view offset: the middle of the globe is the middle of the picture
      engine.setLineScale(2.8 / dpr); // a 1080-wide picture needs lines a few pixels thick
      await new Promise((r) => setTimeout(r, 450));
      const comp = document.createElement("canvas");
      comp.width = REEL_W;
      comp.height = REEL_H;
      const cctx = comp.getContext("2d")!;
      const overlay = document.createElement("canvas");
      overlay.width = REEL_W;
      overlay.height = REEL_H;
      drawReelOverlay(overlay.getContext("2d")!, { stats, dests: selection.places, url: url(), logo, mode: selection.mode }, kind === "VIDEO");
      let turnStart = 0;
      const frame = () => {
        if (kind === "VIDEO") {
          // a slow turn of 8° over the clip, from 4° one side of Istanbul to 4° the other: the globe moves, Istanbul stays in the middle
          if (turnStart === 0) turnStart = performance.now();
          const k = Math.min(1, (performance.now() - turnStart) / (REEL_SECONDS * 1000));
          engine.centerOn(ISTANBUL.lat, ISTANBUL.lon - 4 + 8 * k, 0);
        }
        cctx.drawImage(canvas, 0, 0, REEL_W, REEL_H);
        cctx.drawImage(overlay, 0, 0);
        if (kind === "CARD") return; // the card has no music box: a still ribbon says nothing
        // the music box as it is on screen: its canvas, its label and the routes sounding now
        const box = document.querySelector<HTMLElement>(".music-scope");
        drawScopeFrame(cctx, {
          canvas: box?.querySelector<HTMLCanvasElement>("canvas") ?? null,
          label: box?.querySelector(".music-scope-label")?.textContent?.trim() ?? "",
          items: [...(box?.querySelectorAll<HTMLElement>(".music-scope-now li") ?? [])].map((li) => ({
            text: [...li.children].map((c) => c.textContent?.trim() ?? "").filter(Boolean).join("  "),
            color: li.style.borderLeftColor || "#fff",
          })),
        });
      };
      await work(frame, comp);
    } finally {
      engine.setAfterRender(null);
      engine.setIdleSpin(true, 1);
      engine.setLineScale(1);
      engine.setPortraitFit(true);
      engine.setPortraitShift(-20);
      canvas.style.cssText = "";
      document.body.classList.remove("recording-reel");
      setMaking(null);
    }
  };

  const saveCard = async () => {
    if (!engineRef.current || busy) return;
    setBusy("CARD");
    try {
      await withStory("CARD", async (frame, comp) => {
        const engine = engineRef.current!;
        // one frame of the same scene as the video, taken inside a render so the globe is in the buffer
        await new Promise<void>((res, rej) => {
          const timer = setTimeout(() => {
            engine.setAfterRender(null);
            rej(new Error("no frame (tab in the background?)"));
          }, 3000);
          engine.setAfterRender(() => {
            clearTimeout(timer);
            engine.setAfterRender(null);
            frame();
            res();
          });
        });
        const blob = await new Promise<Blob>((res, rej) => comp.toBlob((b) => (b ? res(b) : rej(new Error("card failed"))), "image/png"));
        await deliver(blob, "a-world-of-music.png", "A World of Music");
      });
    } catch {
      say("COULD NOT MAKE THE CARD");
    } finally {
      setBusy(null);
    }
  };

  const saveClip = async () => {
    const audio = playerRef.current?.audioStream();
    const mime = pickMime();
    if (!engineRef.current || busy) return;
    if (!mime) {
      say("VIDEO IS NOT SUPPORTED HERE — SAVE THE CARD");
      return;
    }
    setBusy("VIDEO");
    try {
      await withStory("VIDEO", async (frame, comp) => {
        const engine = engineRef.current!;
        engine.setAfterRender(frame);
        // the clip's sound is the best 15 s: the last bars of the build and the start of the chorus, from its first note;
        // afterwards the whole piece goes on
        const from = clipStart(piece);
        const hookPiece: PersonalPiece = {
          ...piece,
          notes: clipNotes(piece.notes, from),
          duration: piece.duration - from,
          hook: Math.max(0, piece.hook - from),
        };
        playerRef.current?.play(hookPiece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
        const aiEl = aiAudioRef.current;
        if (aiEl && ai === "on" && Number.isFinite(aiEl.duration)) aiEl.currentTime = aiEl.duration * 0.5; // the AI version's chorus (half way, like ours)
        const stream = comp.captureStream(30);
        audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
        const blob = await recordClip(stream, REEL_SECONDS * 1000, mime);
        await deliver(blob, `a-world-of-music.${extOf(mime)}`, "A World of Music");
        if (extOf(mime) !== "mp4") say("THIS BROWSER SAVES WEBM — INSTAGRAM NEEDS MP4 (CHROME OR SAFARI)", 5000);
      });
    } catch {
      say("COULD NOT RECORD THE VIDEO");
    } finally {
      if (aiAudioRef.current && ai === "on") aiAudioRef.current.currentTime = 0;
      playerRef.current?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
      setBusy(null);
    }
  };

  if (error) return <div className="loading">{error}</div>;
  return (
    <>
      <canvas ref={canvasRef} className="stage" role="img" aria-label="A 3D globe with your routes drawn on it, played as music" />
      {introOn && <Intro ready={introReady} label="COMPOSING YOUR PIECE" onDone={() => setIntroOn(false)} />}
      <header className="topbar">
        <button type="button" className="logo-link" onClick={onBack} aria-label="Turkish Airlines — back to the start">
          <img className="tk-lockup" src="/brand/tk-lockup-light.png" alt="Turkish Airlines" />
        </button>
        <button type="button" className="landing-back" onClick={onBack}><Eq /><span className="ms-make-txt">← NEW PIECE</span></button>
      </header>
      <div className="personal-hud">
        <h1 className="personal-title">{stats.title}</h1>
        <p className="personal-sub">
          {countLabel(stats.destinations, "destination", "destinations")} · {countLabel(stats.countries, "country", "countries")} · {stats.km.toLocaleString("en")} KM{stats.laps >= 0.1 ? ` · ${stats.laps}× AROUND THE EARTH` : ""}
        </p>
        <p className="personal-sub">SIGNATURE VOICE · {stats.signature.toUpperCase()}</p>
      </div>
      <MusicScope
        bus={noteBus}
        music={musicHud}
        routeColors={palette.css}
        label={`ROUTES → MUSIC · ${scope.section.toUpperCase()} · ${piece.bpm} BPM`}
        action={{ label: busy === "VIDEO" ? `RECORDING ${REEL_SECONDS} S…` : busy === "CARD" ? "MAKING THE CARD…" : "SHARE MY PIECE", onClick: () => setSheet(true), busy: !!busy }}
      />
      {!running && (
        <button type="button" className="tap-play" onClick={() => playerRef.current?.resume()}><Eq bars={30} /><span className="ms-make-txt">TAP TO PLAY</span></button>
      )}
      <div className="personal-actions">
        {STUDIO_ON && (AI_ENDPOINT || studio) && (
          <button type="button" className="ghost-btn" disabled={!!busy || ai === "composing"} onClick={() => void toggleAi()}>
            {ai === "composing" ? (aiSyncing ? "SYNCING THE ROUTE LINES TO THE MUSIC…" : studio ? "OPENING THE ORCHESTRA VERSION…" : "COMPOSING WITH AI · ABOUT A MINUTE…") : ai === "on" ? "ORCHESTRA VERSION · ON — BACK TO MINE" : "ORCHESTRA VERSION"}
          </button>
        )}
      </div>
      {sheet && (
        <div className="sheet-back" onClick={() => setSheet(false)} role="dialog" aria-label="Share my piece">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet-title">Share my piece</h2>
            <div className="sheet-tiles">
              <button type="button" className="sheet-opt tile" onClick={() => { setSheet(false); void saveClip(); }}>
                <span className="sheet-ico" aria-hidden="true">▶</span>
                <span className="sheet-opt-name">VIDEO</span>
                <span className="sheet-opt-desc">{REEL_SECONDS} seconds · 9:16 · made for Instagram Reels and Stories</span>
              </button>
              <button type="button" className="sheet-opt tile" onClick={() => { setSheet(false); void saveCard(); }}>
                <span className="sheet-ico" aria-hidden="true">▣</span>
                <span className="sheet-opt-name">CARD</span>
                <span className="sheet-opt-desc">An image of your globe and numbers · 9:16 · made for Instagram Stories</span>
              </button>
            </div>
            <button type="button" className="sheet-link" onClick={() => { setSheet(false); void share(); }}><Eq /><span className="ms-make-txt">COPY LINK</span></button>
            <button type="button" className="sheet-link" onClick={() => setSheet(false)}><Eq /><span className="ms-make-txt">CLOSE</span></button>
          </div>
        </div>
      )}
      {making && (
        <div className="making" role="status" aria-live="polite">
          {making.still && <div className="making-still" style={{ backgroundImage: `url(${making.still})` }} />}
          <div className="making-card">
            <div className="making-spin" aria-hidden="true" />
            <div className="making-title">PREPARING YOUR {making.kind}</div>
            <div className="making-sub">
              {making.kind === "VIDEO" ? `Recording ${REEL_SECONDS} seconds of your piece · keep this tab open` : "Framing your globe and numbers · just a moment"}
            </div>
            <div className="making-bar"><i style={{ width: `${Math.min(100, (makingSec / (making.kind === "VIDEO" ? REEL_SECONDS + 2 : 4)) * 100)}%` }} /></div>
          </div>
        </div>
      )}
      {toast && <div className="notice">{toast}</div>}
    </>
  );
}
