import { Counters, DepartureStrip, FlightCardView, RegionBars, SourceLine, TitleBlock } from "@web/hud/Hud";
import { useEffect, useRef } from "react";
import { useStore, type Store } from "@web/hud/store";
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

export function ModeLine({ s }: { s: GlobeHudSnapshot }) {
  const text =
    s.mode === "REPLAY"
      ? "REPLAY · 24H IN 3 MIN"
      : s.extrapolated > 0
        ? `LIVE · ${s.extrapolated} HEADS EXTRAPOLATED`
        : "LIVE";
  return <div className="modeline label">{text}</div>;
}

export function Credit({ s }: { s: GlobeHudSnapshot }) {
  return <div className="source credit label">{s.textureNote ? `${s.credit} · ${s.textureNote}` : s.credit}</div>;
}

export function LoadingOverlay({ s }: { s: GlobeHudSnapshot }) {
  if (s.textureProgress >= 1 || s.textureNote) return null;
  return <div className="loading label">{`LOADING EARTH IMAGERY ${Math.round(Math.max(0, Math.min(1, s.textureProgress)) * 100)}%`}</div>;
}

export function GlobeHud({ store, labelBus }: { store: Store<GlobeHudSnapshot>; labelBus?: LabelBus }) {
  const s = useStore(store);
  const animate = !s.reducedMotion;
  return (
    <div className={`hud${s.hidden ? " hidden" : ""}`}>
      <TitleBlock s={s} />
      <ModeLine s={s} />
      {s.ready && (
        <>
          <Counters c={s.counters} animate={animate} />
          <DepartureStrip bins={s.depHist} playhead={s.playhead} />
          <RegionBars counts={s.regionAirborne} />
          <EventFeed events={s.events} />
          <AirportLabels labels={s.labels} bus={labelBus} />
        </>
      )}
      <SourceLine s={s} />
      <Credit s={s} />
      <FlightCardView key={"tip-" + (s.tooltip?.tk ?? "")} card={s.tooltip} kind="tooltip" />
      <LoadingOverlay s={s} />
      {s.debug && <pre className="debug">{`${s.debug.fps} FPS · Q${s.debug.level} · ${s.debug.flights} FLIGHTS`}</pre>}
    </div>
  );
}
