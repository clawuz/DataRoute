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
      <div className="fp-speed label">{f.speed}</div>
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
          <MusicScope bus={noteBus ?? ownBus} music={s.music} compact={!!s.follow} /> {/* art:sound */}
          {s.follow && <FlightPanel f={s.follow} />}
          <EventFeed events={s.events} />
          <AirportLabels labels={s.labels} bus={labelBus} />
        </>
      )}
      <SourceLine s={s} />
      <Credit s={s} />
      {s.notice && <div className="notice label">{s.notice}</div>}
      <FlightCardView key={"tip-" + (s.tooltip?.tk ?? "")} card={s.tooltip} kind="tooltip" />
      <LoadingOverlay s={s} />
      {s.debug && <pre className="debug">{`${s.debug.fps} FPS · Q${s.debug.level} · ${s.debug.flights} FLIGHTS`}</pre>}
    </div>
  );
}
