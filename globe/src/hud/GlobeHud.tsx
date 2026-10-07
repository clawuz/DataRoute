import { Counters, DepartureStrip, FlightCardView, RegionBars, SourceLine, TitleBlock } from "@web/hud/Hud";
import { useEffect, useMemo, useRef } from "react";
import { useStore, type Store } from "@web/hud/store";
import type { FollowHud } from "../app/follow-hud";
import { createNoteBus, type NoteBus } from "../audio/notes-bus"; // art:sound
import { MusicScope } from "./MusicScope"; // art:sound
import type { AirportLabel, EventLine, GlobeHudSnapshot, LabelBus } from "../app/hud-model";

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
    return bus.subscribe((ls) => {
      for (const l of ls) {
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
  const lines = [art.corridors && "ROUTE DENSITY · 24H", art.aurora && "AURORA · ILLUSTRATIVE", art.sound && "SOUND ON"].filter(Boolean) as string[];
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
      <TitleBlock s={s} />
      <ModeLine s={s} />
      <ArtNotes art={s.art} />
      {s.ready && (
        <>
          <Counters c={s.counters} animate={animate} />
          <DepartureStrip bins={s.depHist} playhead={s.playhead} />
          {!s.follow && <RegionBars counts={s.regionAirborne} />}
          <MusicScope bus={noteBus ?? ownBus} music={s.music} compact={!!s.follow} footer={<QuickControls s={s} />} /> {/* art:sound */}
          {s.follow && <FlightPanel f={s.follow} />}
          <EventFeed events={s.events} />
          <AirportLabels labels={s.labels} bus={labelBus} />
        </>
      )}
      <SourceLine s={s} />
      <Credit s={s} />
      <KeysHelp />
      {s.notice && <div className="notice label">{s.notice}</div>}
      <FlightCardView key={"tip-" + (s.tooltip?.tk ?? "")} card={s.tooltip} kind="tooltip" />
      <LoadingOverlay s={s} />
      {s.debug && <pre className="debug">{`${s.debug.fps} FPS · Q${s.debug.level} · ${s.debug.flights} FLIGHTS`}</pre>}
    </div>
  );
}
