import { Counters, FlightCardView, SourceLine } from "@web/hud/Hud";
import { REGIONS, REGION_HEX, REGION_LABEL } from "@web/data/palette";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type Store } from "@web/hud/store";
import type { FollowHud } from "../app/follow-hud";
import { createNoteBus, type NoteBus } from "../audio/notes-bus"; // art:sound
import { MusicScope } from "./MusicScope"; // art:sound
import { resolveLabelOverlaps, type AirportLabel, type EventLine, type GlobeHudSnapshot, type LabelBus } from "../app/hud-model";

/** The globe's title block (option A): the name, the descriptor under it on the same left edge, a hairline, then one status chip. The tunnel site keeps its one-line title. */
export function GlobeTitle({ s }: { s: GlobeHudSnapshot }) {
  return (
    <div className="title gt">
      <h1 className="gt-h1" aria-label="Turkish Airlines · 24H Operations">
        <span className="gt-main">TURKISH AIRLINES</span>
        <span className="gt-sub">24H OPERATIONS</span>
      </h1>
      <div className="gt-rule" />
      <div className="phase gt-chip">
        <span className="dot" />
        {s.ready ? (
          <span className="num">
            {s.follow ? `FOLLOW ${s.follow.speed}` : s.phase} {s.timeLabel}
            {s.paused ? " · PAUSED" : ""}
          </span>
        ) : (
          <span>STANDBY</span>
        )}
      </div>
      <ModeLine s={s} />
      <ArtNotes art={s.art} />
    </div>
  );
}

/** ux: the project's name as a top-centre lockup (a light wide cut, the tagline in normal case) */
export function MusicLockup() {
  return (
    <div className="lockup">
      <div className="lockup-title">A WORLD OF MUSIC</div>
      <div className="lockup-tag">All our routes, composing the music of the world.</div>
    </div>
  );
}

/** ux: departures per hour with an hour axis (00 / 06 / 12 / 18 UTC), a NOW marker and the value on hover */
export function GlobeDepartures({ bins, playhead, from, live }: { bins: number[]; playhead: number; from: number; live: boolean }) {
  const max = Math.max(1, ...bins);
  const [hover, setHover] = useState<number | null>(null);
  const startHour = Math.floor((((from % 86400) + 86400) % 86400) / 3600);
  const hourOf = (i: number) => (startHour + i) % 24;
  const n = Math.max(1, bins.length);
  return (
    <div className="dep dep-globe">
      <div className="label">DEPARTURES / HOUR</div>
      <div className="dep-plot" onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))));
      }}>
        <svg viewBox="0 0 240 40" preserveAspectRatio="none" className="dep-svg" role="img" aria-label="Departures per hour over the last 24 hours">
          {bins.map((c, i) => (
            <rect key={i} x={i * 10 + 1} y={40 - (c / max) * 38} width={8} height={(c / max) * 38} className={`bar${hover === i ? " hot" : ""}`} />
          ))}
          <line x1={playhead * 240} x2={playhead * 240} y1={0} y2={40} className="playhead" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="dep-now label" style={{ left: `${playhead * 100}%` }}>{live ? "NOW" : "▼"}</span>
        {hover !== null && (
          <span className="dep-tip label" style={{ left: `${((hover + 0.5) / n) * 100}%` }}>
            {String(hourOf(hover)).padStart(2, "0")}:00 UTC · {bins[hover]} DEPARTURES
          </span>
        )}
      </div>
      <div className="dep-axis label" aria-hidden="true">
        {bins.map((_, i) => (hourOf(i) % 6 === 0 ? <span key={i} style={{ left: `${((i + 0.5) / n) * 100}%` }}>{String(hourOf(i)).padStart(2, "0")}</span> : null))}
      </div>
    </div>
  );
}

/** ux: the region legend; the unknown bucket reads OTHER */
export function GlobeRegions({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="regions">
      <div className="label">AIRBORNE BY REGION</div>
      {REGIONS.map((r, i) => (
        <div key={r} className="region-row">
          <span className="region-name">{r === "UNK" ? "OTHER" : REGION_LABEL[r]}</span>
          <span className="region-bar">
            <span style={{ width: `${(counts[i] / max) * 100}%`, background: REGION_HEX[r] }} />
          </span>
          <span className="region-count num">{counts[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** ux: a one-time hint (fades after a few seconds, never again once seen or once a flight is followed) */
const HINT_KEY = "dataroute.hint";
export function FirstHint({ active }: { active: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_KEY) === "1";
    } catch {
      /* private mode: show it each visit */
    }
    if (seen) return;
    setShown(true);
    const t = setTimeout(() => {
      setShown(false);
      try {
        localStorage.setItem(HINT_KEY, "1");
      } catch {
        /* ignore */
      }
    }, 9000);
    return () => clearTimeout(t);
  }, [active]);
  if (!shown) return null;
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  return <div className="first-hint label" role="status">{touch ? "TAP" : "CLICK"} ANY FLIGHT TO FOLLOW</div>;
}

/** ux: shown only while the HUD is hidden — the way back */
export function HudRestore({ hidden }: { hidden: boolean }) {
  if (!hidden) return null;
  return <button type="button" className="hud-restore label" onClick={() => pressKey("h")}>SHOW HUD</button>;
}

export function EventFeed({ events }: { events: EventLine[] }) {
  if (events.length === 0) return null;
  return (
    <div className="events" role="log" aria-live="off">
      {events.map((e) => (
        <div key={e.id} className={`event ${e.kind.toLowerCase()}`}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

export function AirportLabels({ labels, bus }: { labels: AirportLabel[]; bus?: LabelBus }) {
  const els = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!bus) return;
    return bus.subscribe((all) => {
      for (const l of resolveLabelOverlaps(all)) {
        const el = els.current.get(l.iata);
        if (!el) continue;
        el.style.left = `${l.x}px`;
        el.style.top = `${l.y}px`;
        el.style.visibility = l.visible ? "visible" : "hidden";
      }
    });
  }, [bus]);
  return (
    <>
      {labels
        .filter((l) => l.visible)
        .map((l) => (
          <div
            key={l.iata}
            ref={(el) => {
              if (el) els.current.set(l.iata, el);
              else els.current.delete(l.iata);
            }}
            aria-hidden="true"
            className={`airport-label${l.iata === "IST" ? " hub" : ""}`}
            style={{ left: `${l.x}px`, top: `${l.y}px` }}
          >
            {l.iata}
          </div>
        ))}
    </>
  );
}

const rows: [string, keyof FollowHud][] = [
  ["ALT", "alt"], ["GS", "gs"], ["HDG", "hdg"], ["VS", "vs"], ["PHASE", "phase"],
  ["DIST", "dist"], ["ELAPSED", "elapsed"], ["REMAINING", "remaining"], ["UTC", "utc"], ["LOCAL", "local"],
];

function Profile({ profile, cursor }: { profile: number[]; cursor: number }) {
  const max = Math.max(1, ...profile);
  const pts = profile.map((a, i) => `${(profile.length > 1 ? (i / (profile.length - 1)) * 100 : 0).toFixed(2)},${(30 - (a / max) * 28).toFixed(2)}`).join(" ");
  const x = (cursor * 100).toFixed(2);
  return (
    <svg className="fp-profile" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="Altitude profile">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      <line className="fp-cursor" x1={x} x2={x} y1="0" y2="30" stroke="var(--thy)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Presses a key as the keyboard would (the buttons use the one command path of the keyboard). */
const pressKey = (key: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key }));

export function FlightPanel({ f }: { f: FollowHud }) {
  const [from, to] = f.route.split(" → ");
  return (
    <div className="flight-panel">
      <div className="fp-head">
        <span className="fp-tk">{f.tk}</span>
        <span className={`fp-state ${f.state.toLowerCase().replace(/ /g, "-")}`}>{f.state}</span>
      </div>
      <div className="fp-aircraft label">{f.aircraft}</div>
      <div className="fp-route label">
        <span>{from}</span>
        <span className="fp-bar"><i style={{ width: `${Math.round(f.progress * 100)}%` }} /></span>
        <span>{to ?? ""}</span>
      </div>
      <div className="fp-route-text label">{f.route}</div>
      <dl className="fp-grid">
        {rows.map(([label, key]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd>{String(f[key])}</dd>
          </div>
        ))}
      </dl>
      <Profile profile={f.profile} cursor={f.cursor} />
      <div className="fp-controls" role="group" aria-label="Follow controls"> {/* art:track — reachable buttons instead of [ ] */}
        <button type="button" className="fp-btn" aria-label="Slower" title="Slower (−)" onClick={() => pressKey("-")}>−</button>
        <span className="fp-speed label">{f.speed}</span>
        <button type="button" className="fp-btn" aria-label="Faster" title="Faster (+)" onClick={() => pressKey("+")}>+</button>
        <button type="button" className="fp-btn fp-leave label" aria-label="Leave follow" title="Leave follow (G / Esc)" onClick={() => pressKey("Escape")}>✕ LEAVE</button>
      </div>
      <div className="fp-notes label">{f.notes.map((n) => <div key={n}>{n}</div>)}</div>
    </div>
  );
}

export function ModeLine({ s }: { s: GlobeHudSnapshot }) {
  const text = s.follow
    ? `FOLLOW · ${s.follow.speed} · ${s.follow.state}`
    : s.mode === "REPLAY"
      ? "REPLAY · 24H IN 3 MIN"
      : s.paused
        ? "LIVE · PAUSED"
        : s.extrapolated > 0
          ? `LIVE · ${s.extrapolated} HEADS EXTRAPOLATED`
          : "LIVE";
  return <div className="modeline label">{text}</div>;
}

// art:core
export function ArtNotes({ art }: { art: GlobeHudSnapshot["art"] }) {
  if (!art.enabled) return null;
  const lines = [art.corridors && "ROUTE DENSITY · 24H", art.sound && "SOUND ON"].filter(Boolean) as string[];
  if (lines.length === 0) return null;
  return <div className="art-notes label">{lines.map((l) => <div key={l}>{l}</div>)}</div>;
}

/** art:track — a "?" button; hovering (or focusing) it lists the keyboard shortcuts */
export const KEYS: [string, string][] = [
  ["SPACE", "Pause / resume"],
  ["← →", "Scrub 1 h (flight time while following)"],
  ["R", "Replay 24 h ↔ live"],
  ["M", "Music on / off"],
  ["C", "Route density on / off"],
  ["A", "Aurora on / off"],
  ["T", "Auto tour"],
  ["− +", "Follow speed slower / faster"],
  ["G · ESC", "Leave follow"],
  ["H", "Hide / show the HUD"],
  ["F", "Fullscreen"],
  ["CLICK", "Follow a flight"],
  ["DRAG", "Rotate the globe"],
];
/** art:track — the keyboard's main actions as buttons (a phone has no keyboard): sound, replay / live, tour, pause */
export function QuickControls({ s }: { s: GlobeHudSnapshot }) {
  const items: { label: string; key: string; on: boolean; title: string }[] = [
    { label: s.music.on ? "SOUND ON" : "SOUND OFF", key: "m", on: s.music.on, title: "Music on / off (M)" },
    { label: s.mode === "REPLAY" ? "▶ LIVE" : "↺ REPLAY", key: "r", on: s.mode === "REPLAY", title: "Replay 24 h ↔ live (R)" },
    { label: "TOUR", key: "t", on: s.tour, title: "Auto tour (T)" },
    { label: s.paused ? "▶ PLAY" : "❚❚ PAUSE", key: " ", on: s.paused, title: "Pause / resume (Space)" },
  ];
  return (
    <div className="quick-controls" role="group" aria-label="Controls">
      {items.map((it) => (
        <button key={it.key} type="button" className={`qc-btn label${it.on ? " on" : ""}`} title={it.title} aria-pressed={it.on} onClick={() => pressKey(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function KeysHelp() {
  return (
    <div className="keys-help">
      <button type="button" className="keys-btn label" aria-label="Keyboard shortcuts" aria-describedby="keys-pop">⌨ KEYS</button>
      <div className="keys-pop" id="keys-pop" role="tooltip">
        <div className="keys-title label">KEYBOARD SHORTCUTS</div>
        <dl>
          {KEYS.map(([k, d]) => (
            <div key={k} className="keys-row">
              <dt><kbd>{k}</kbd></dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function Credit({ s }: { s: GlobeHudSnapshot }) {
  return <div className="source credit label">{s.textureNote ? `${s.credit} · ${s.textureNote}` : s.credit}</div>;
}

export function LoadingOverlay({ s }: { s: GlobeHudSnapshot }) {
  if (s.textureProgress >= 1 || s.textureNote) return null;
  return <div className="loading label">{`LOADING EARTH IMAGERY ${Math.round(Math.max(0, Math.min(1, s.textureProgress)) * 100)}%`}</div>;
}

export function GlobeHud({ store, labelBus, noteBus }: { store: Store<GlobeHudSnapshot>; labelBus?: LabelBus; noteBus?: NoteBus }) {
  const s = useStore(store);
  const ownBus = useMemo(createNoteBus, []); // art:sound — a quiet bus when none is wired
  const animate = !s.reducedMotion;
  return (
    <div className={`hud${s.hidden ? " hidden" : ""}`}>
      <GlobeTitle s={s} />
      <MusicLockup />
      {s.ready && (
        <>
          <Counters c={s.counters} animate={animate} />
          <GlobeDepartures bins={s.depHist} playhead={s.playhead} from={s.depFrom} live={s.mode === "LIVE"} />
          {!s.follow && <GlobeRegions counts={s.regionAirborne} />}
          <MusicScope bus={noteBus ?? ownBus} music={s.music} compact={!!s.follow} footer={<QuickControls s={s} />} /> {/* art:sound */}
          {s.follow && <FlightPanel f={s.follow} />}
          <EventFeed events={s.events} />
          <AirportLabels labels={s.labels} bus={labelBus} />
        </>
      )}
      <SourceLine s={s} />
      <Credit s={s} />
      <KeysHelp />
      <FirstHint active={s.ready && !s.follow} />
      <HudRestore hidden={s.hidden} />
      {s.notice && <div className="notice label">{s.notice}</div>}
      <FlightCardView key={"tip-" + (s.tooltip?.tk ?? "")} card={s.tooltip} kind="tooltip" />
      <LoadingOverlay s={s} />
      {s.debug && <pre className="debug">{`${s.debug.fps} FPS · Q${s.debug.level} · ${s.debug.flights} FLIGHTS`}</pre>}
    </div>
  );
}
