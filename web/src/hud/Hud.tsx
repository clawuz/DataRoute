import type { CSSProperties } from "react";
import { REGIONS, REGION_HEX, REGION_LABEL } from "../data/palette";
import { fmtInt, fmtKm } from "../lib/format";
import type { FlightCard, HudSnapshot } from "./snapshot";
import { useStore, type Store } from "./store";
import { useTickNumber } from "./useTickNumber";

export function TitleBlock({ s }: { s: HudSnapshot }) {
  return (
    <div className="title">
      <h1>TURKISH AIRLINES · 24H OPERATIONS</h1>
      <div className="phase">
        <span className="dot" />
        {s.ready ? (
          <span className="num">
            {s.phase} {s.timeLabel}
            {s.paused ? " · PAUSED" : ""}
          </span>
        ) : (
          <span>STANDBY</span>
        )}
      </div>
    </div>
  );
}

function Counter(props: { label: string; value: number; format: (n: number) => string; animate: boolean; primary?: boolean }) {
  const shown = useTickNumber(props.value, props.animate);
  return (
    <div className={`counter${props.primary ? " primary" : ""}`}>
      <div className="label">{props.label}</div>
      <div className="value num">{props.format(shown)}</div>
    </div>
  );
}

export function Counters({ c, animate }: { c: HudSnapshot["counters"]; animate: boolean }) {
  return (
    <div className="counters">
      <Counter label="AIRBORNE" value={c.airborne} format={fmtInt} animate={animate} primary />
      <Counter label="FLIGHTS · 24H" value={c.flights} format={fmtInt} animate={animate} />
      <Counter label="DESTINATIONS" value={c.destinations} format={fmtInt} animate={animate} />
      <Counter label="KM FLOWN" value={c.km} format={fmtKm} animate={animate} />
    </div>
  );
}

export function AltitudeGauge({ bins }: { bins: number[] }) {
  const max = Math.max(1, ...bins);
  const H = 42;
  const W = 12;
  const step = H / bins.length;
  return (
    <div className="alt">
      <div className="label">ALTITUDE</div>
      <div className="alt-body">
        <div className="alt-scale num">
          <span>FL420</span>
          <span>FL210</span>
          <span>FL000</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="alt-svg" role="img" aria-label="Altitude distribution, FL000 to FL420">
          {bins.map((n, i) => (
            <rect key={i} x={0} y={H - (i + 1) * step + 0.12} width={(n / max) * W} height={step - 0.24} className="bar" />
          ))}
        </svg>
      </div>
    </div>
  );
}

export function DepartureStrip({ bins, playhead }: { bins: number[]; playhead: number }) {
  const max = Math.max(1, ...bins);
  return (
    <div className="dep">
      <div className="label">DEPARTURES / HOUR</div>
      <svg viewBox="0 0 240 40" preserveAspectRatio="none" className="dep-svg" role="img" aria-label="Departures per hour over the last 24 hours">
        {bins.map((n, i) => (
          <rect key={i} x={i * 10 + 1} y={40 - (n / max) * 38} width={8} height={(n / max) * 38} className="bar" />
        ))}
        <line x1={playhead * 240} x2={playhead * 240} y1={0} y2={40} className="playhead" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function RegionBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="regions">
      <div className="label">AIRBORNE BY REGION</div>
      {REGIONS.map((r, i) => (
        <div key={r} className="region-row">
          <span className="region-name">{REGION_LABEL[r]}</span>
          <span className="region-bar">
            <span style={{ width: `${(counts[i] / max) * 100}%`, background: REGION_HEX[r] }} />
          </span>
          <span className="region-count num">{counts[i]}</span>
        </div>
      ))}
    </div>
  );
}

export function SourceLine({ s }: { s: HudSnapshot }) {
  if (s.dataState === "loading") return <div className="source label">LOADING DATA…</div>;
  const name = s.sourceName.toUpperCase();
  const src = /^https?:\/\//.test(s.sourceUrl) ? (
    <a href={s.sourceUrl} target="_blank" rel="noreferrer">
      {name}
    </a>
  ) : (
    <span>{name}</span>
  );
  return (
    <div className={`source label${s.dataState === "delayed" ? " delayed" : ""}`}>
      {s.dataState === "delayed" && <span>{`DATA DELAYED · LAST UPDATE ${s.updatedAgo} · `}</span>}
      {s.dataState === "collecting" && <span>{`COLLECTING · STARTED ${s.collectingSince} · `}</span>}
      <span>SOURCE: </span>
      {src}
      {s.dataState !== "delayed" && <span>{` · UPDATED ${s.updatedAgo}`}</span>}
      <span>{" · "}</span>
      <span className="num">{fmtInt(s.totalFlights)}</span>
      <span> FLIGHTS</span>
    </div>
  );
}

function Profile({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 100;
  const H = 24;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - (Math.min(v, 410) / 410) * H}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const CARD_W_VMIN = 26; // card width + connector gap
const CARD_HALF_H_VMIN = 8; // half card height + margin

export function FlightCardView({ card, kind }: { card: FlightCard | null; kind: "spotlight" | "tooltip" }) {
  if (!card || !card.visible) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vmin = Math.min(vw, vh) / 100;
  const west = card.x < vw / 2; // outward = away from the screen centre
  const x = west ? Math.max(card.x, CARD_W_VMIN * vmin) : Math.min(card.x, vw - CARD_W_VMIN * vmin);
  const y = Math.min(Math.max(card.y, CARD_HALF_H_VMIN * vmin), vh - CARD_HALF_H_VMIN * vmin);
  return (
    <div
      className={`card ${kind} ${west ? "west" : "east"}`}
      style={{ left: `${x}px`, top: `${y}px`, "--accent": REGION_HEX[card.region] } as CSSProperties}
    >
      <div className="tk">{card.tk}</div>
      <div className="route">{card.route}</div>
      <div className="meta num">
        <span>{card.fl}</span>
        <span>{card.gs}</span>
        <span>{card.elapsed}</span>
      </div>
      {kind === "spotlight" && <Profile values={card.profile} />}
    </div>
  );
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="error">
      <div>
        <div className="label">TURKISH AIRLINES · 24H OPERATIONS</div>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function Hud({ store }: { store: Store<HudSnapshot> }) {
  const s = useStore(store);
  const animate = !s.reducedMotion;
  return (
    <div className={`hud${s.hidden ? " hidden" : ""}`}>
      <TitleBlock s={s} />
      {s.ready && (
        <>
          <Counters c={s.counters} animate={animate} />
          <AltitudeGauge bins={s.altHist} />
          <DepartureStrip bins={s.depHist} playhead={s.playhead} />
          <RegionBars counts={s.regionAirborne} />
        </>
      )}
      <SourceLine s={s} />
      <FlightCardView key={"spot-" + (s.spotlight?.tk ?? "")} card={s.spotlight} kind="spotlight" />
      <FlightCardView key={"tip-" + (s.tooltip?.tk ?? "")} card={s.tooltip} kind="tooltip" />
      {s.debug && (
        <pre className="debug">{`${s.debug.fps} FPS · Q${s.debug.level} · ${s.debug.flights} FLIGHTS`}</pre>
      )}
    </div>
  );
}
