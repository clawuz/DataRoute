import { useEffect, useMemo, useState } from "react";
import { REGION_HEX } from "@web/data/palette";
import type { Region } from "@collector/day-schema";
import { MAX_DESTINATIONS, minPlaces, type PersonalMode, type PersonalSelection } from "./codec";
import { DESTINATIONS, NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, countryName, destinationOf, flagOf, labelOf, AREAS, areaOf, type AreaId, type Destination } from "./destinations";
import { buildRoutes } from "./routes";
import { Backdrop } from "./Backdrop";
import { musicTileUrl } from "./music-tile";

interface Props {
  onCompose(sel: PersonalSelection): void;
  onLive(): void;
  /** open straight on the list of places of this mode (the live screen's "make your own music" button) */
  startAt?: PersonalMode;
}

type Step = "mode" | "pick";

const COPY: Record<PersonalMode, { head: string; sub: string; cta: string }> = {
  visited: { head: "Where have you been?", sub: "Choose where you fly from, then every place you have flown to. Your journey becomes a piece of music.", cta: "COMPOSE MY JOURNEY" },
  wish: { head: "Where do you want to go?", sub: "Every dream trip has a sound. Tell us where you want to go, and we will compose it.", cta: "COMPOSE MY WISHLIST" },
};

const norm = (s: string): string => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Row extends Destination {
  country: string;
  label: string;
  hay: string;
}

/** what travellers type for a country besides the name we show (Türkiye is "Turkey" to most of the world) */
const ALIAS: Record<string, string> = {
  TR: "turkey turkiye",
  US: "usa us america united states",
  GB: "uk england britain scotland wales great britain",
  AE: "uae emirates",
  NL: "holland",
  CZ: "czech republic czechia",
  KR: "korea south korea",
  KP: "north korea",
  RU: "russia russian federation",
  CD: "congo drc",
  CI: "ivory coast",
  MM: "burma",
  MK: "macedonia",
  VN: "vietnam viet nam",
  CN: "china prc",
  HK: "hong kong",
  SZ: "swaziland eswatini",
};

const ROWS: Row[] = DESTINATIONS.map((d) => {
  const country = countryName(d.iso);
  return { ...d, country, label: labelOf(d), hay: norm(`${d.city} ${d.iata} ${d.name} ${country} ${ALIAS[d.iso] ?? ""}`) };
});

/** best first: the code, a city that starts with the text, a word that starts with it, anywhere else */
function rank(r: Row, needle: string): number {
  if (norm(r.iata) === needle) return 0;
  // the whole country was asked for ("usa", "turkey", "uk")
  if ((ALIAS[r.iso] ?? "").split(" ").includes(needle) || norm(r.country) === needle) return 0.5;
  if (norm(r.city).startsWith(needle)) return 1;
  if (r.hay.split(/[\s,()-]+/).some((w) => w.startsWith(needle))) return 2;
  return 3;
}

function groupByCountry(rows: Row[]): { iso: string; country: string; region: Region; items: Row[] }[] {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(r.iso, [...(m.get(r.iso) ?? []), r]);
  return [...m.entries()]
    .map(([iso, items]) => ({ iso, country: items[0].country, region: items[0].region, items: items.sort((a, b) => a.city.localeCompare(b.city)) }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

export function Landing({ onCompose, onLive, startAt }: Props) {
  const [step, setStep] = useState<Step>(startAt ? "pick" : "mode");
  const [mode, setMode] = useState<PersonalMode>(startAt ?? "visited");
  const [home, setHome] = useState<string | undefined>("IST");
  const [editFrom, setEditFrom] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setScrolled(false), [step]);
  const [area, setArea] = useState<AreaId | "ALL">("ALL");
  const tile = useMemo(() => musicTileUrl(), []);

  const needle = norm(q.trim());
  const filtered = useMemo(
    () => ROWS.filter((r) => (!needle || r.hay.includes(needle)) && (area === "ALL" || areaOf(r.iso) === area)),
    [needle, area],
  );
  const groups = useMemo(() => groupByCountry(filtered), [filtered]);

  const reset = () => {
    if (startAt) { onLive(); return; } // opened from the live screen: back goes straight to it, there is no home page
    setStep("mode");
    setPicked([]);
    setHome("IST");
    setEditFrom(false);
    setQ("");
    setArea("ALL");
  };

  const bar = (back?: () => void) => (
    <header className="topbar">
      <button type="button" className="logo-link" onClick={reset} aria-label="Turkish Airlines — back to the start">
        <img className="tk-lockup" src="/brand/tk-lockup-light.png" alt="Turkish Airlines" />
      </button>
      {back && (
        <button type="button" className="landing-back" onClick={back}>
          ← BACK
        </button>
      )}
    </header>
  );

  if (step === "mode") {
    return (
      <div className={`landing v2 intro${new URLSearchParams(window.location.search).has("og") ? " og" : ""}`} role="main">
        <Backdrop />
        <div className="presents">
          <img className="presents-logo" src="/brand/tk-lockup-vertical-light.png" alt="Turkish Airlines" />
          <span className="presents-word">PRESENTS</span>
        </div>
        <p className="landing-eyebrow">A WORLD OF MUSIC</p>
        <h1 className="landing-title">We fly to the most countries.<br /><span className="title-music" style={tile ? { backgroundImage: `url(${tile}), linear-gradient(#f2f5fa, #f2f5fa)` } : undefined}>Now we make them play.</span></h1>
        <p className="landing-sub">
          <span className="ph">Every Turkish Airlines flight becomes part of</span> <span className="ph">a unique, ever-changing composition,</span> <span className="ph">powered by real-time flight data.</span>
        </p>
        <p className="landing-sub landing-sub-lead">
          <span className="ph">Listen to the world.</span> <span className="ph">Or turn your destinations into music.</span>
        </p>
        <div className="mode-cards">
          <button type="button" className="mode-card" onClick={onLive}>
            <span className="mode-n">01</span>
            <span className="mode-name">The world, live</span>
            <span className="mode-desc">Listen as Turkish Airlines flights compose the world in real time.</span>
          </button>
          <button type="button" className="mode-card" onClick={() => { setMode("visited"); setStep("pick"); }}>
            <span className="mode-n">02</span>
            <span className="mode-name">Where I’ve been</span>
            <span className="mode-desc">Turn the destinations you’ve visited into your own unique music.</span>
          </button>
          <button type="button" className="mode-card" onClick={() => { setMode("wish"); setStep("pick"); }}>
            <span className="mode-n">03</span>
            <span className="mode-name">Where I want to go</span>
            <span className="mode-desc">Discover the sound of your dream destinations.</span>
          </button>
        </div>
        <p className="landing-hint">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2v-3zm16 0h-3a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2v-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          For the best experience, use headphones.
        </p>
        <p className="landing-fine">
          <span>{NETWORK_CLAIM}</span>
          <span>
            {NETWORK_DESTINATIONS} destinations · {NETWORK_COUNTRIES} countries
          </span>
        </p>
        <p className="landing-credit">A Platon.Ai project.</p>
      </div>
    );
  }

  /** the From field is being filled (nothing chosen yet, or "change" was pressed) */
  const fromOpen = editFrom || !home;
  const toggle = (code: string) => {
    if (fromOpen) {
      setHome(code);
      setPicked((p) => p.filter((x) => x !== code));
      setEditFrom(false);
      setQ("");
      return;
    }
    if (code === home) return;
    setPicked((p) => (p.includes(code) ? p.filter((x) => x !== code) : p.length >= MAX_DESTINATIONS ? p : [...p, code]));
  };
  const ready = !!home && picked.length >= minPlaces(home);
  const c = COPY[mode];
  const hits = needle
    ? ROWS.filter((r) => r.hay.includes(needle))
        .map((r) => ({ r, k: rank(r, needle) }))
        .sort((a, b) => a.k - b.k || a.r.city.localeCompare(b.r.city))
        .slice(0, 7)
        .map((x) => x.r)
    : [];
  const via = ready ? buildRoutes(picked, home).filter((r) => r.leg === 1).length : 0;
  const fromRow = home ? destinationOf(home) : undefined;
  const areaTabs: (AreaId | "ALL")[] = ["ALL", ...AREAS.map((a) => a.id).filter((id) => ROWS.some((x) => areaOf(x.iso) === id))];
  const areaLabel = (id: AreaId): string => AREAS.find((a) => a.id === id)!.label;
  const sections = AREAS.map((a) => ({ ...a, groups: groups.filter((g) => areaOf(g.iso) === a.id) })).filter((a) => a.groups.length > 0);

  return (
    <div className={`landing v2 picker${scrolled ? " scrolled" : ""}`} role="main" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 6)}>
      <Backdrop />
      {bar(reset)}
      <h1 className="picker-head">{c.head}</h1>
      <p className="landing-sub">{c.sub}</p>
      <div className="fields">
        {fromRow && !fromOpen ? (
          <button type="button" className="field from" onClick={() => { setEditFrom(true); setQ(""); }} aria-label="Change where you fly from">
            <span className="field-label">FROM</span>
            <span className="chip-flag">{flagOf(fromRow.iso)}</span>
            <span className="field-value">{fromRow.city}</span>
            <span className="chip-code">{fromRow.iata}</span>
            <span className="field-change">✎ CHANGE</span>
          </button>
        ) : (
          <label className="field from live">
            <span className="field-label">FROM</span>
            <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type your city or airport" aria-label="Search where you fly from" />
            <span className="field-edit" aria-hidden="true">⌕</span>
          </label>
        )}
        <label className={`field to${fromOpen ? " off" : " live"}`}>
          <span className="field-label">TO</span>
          <input
            type="search"
            value={fromOpen ? "" : q}
            disabled={fromOpen}
            onChange={(e) => setQ(e.target.value)}
            placeholder={fromOpen ? "Choose where you fly from first" : "Type a city, airport or country"}
            aria-label="Search a place you flew to"
          />
          <span className="field-edit" aria-hidden="true">⌕</span>
        </label>
      </div>
      {hits.length > 0 && (
        <ul className="search-hits">
          {hits.map((r) => (
            <li key={r.iata}>
              <button type="button" className="hit" disabled={!fromOpen && (picked.includes(r.iata) || r.iata === home)} onClick={() => { toggle(r.iata); setQ(""); }}>
                <span className="chip-flag">{flagOf(r.iso)}</span>
                <span className="chip-name">{r.city}</span>
                <span className="hit-sub">{r.country}</span>
                <span className="chip-code">{r.iata}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && !fromOpen && (
        <ul className="tray" aria-label="Where to">
          {picked.map((code) => {
            const d = destinationOf(code);
            return (
              <li key={code} className="tray-item">
                <span className="chip-flag">{d ? flagOf(d.iso) : ""}</span>
                <span className="chip-name">{d?.city ?? code}</span>
                <span className="chip-code">{buildRoutes([code], home).length > 1 ? "via IST" : "direct"}</span>
                <button type="button" className="tray-act" aria-label="Remove" onClick={() => toggle(code)}>×</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="region-tabs" role="tablist">
        {areaTabs.map((a) => (
          <button key={a} type="button" role="tab" aria-selected={area === a} className={`tab${area === a ? " on" : ""}`} onClick={() => setArea(a)}>
            {a === "ALL" ? "All" : areaLabel(a)}
            <span className="c">{a === "ALL" ? ROWS.length : ROWS.filter((r) => areaOf(r.iso) === a).length}</span>
          </button>
        ))}
      </div>
      <div className="picker-groups">
        {sections.map((a) => (
          <div key={a.id} className="area">
            <h2 className="area-head">{a.upper} DESTINATIONS</h2>
            {a.groups.map((g) => (
              <section key={g.iso} className="group">
                <h3 className="group-head" style={{ color: REGION_HEX[g.region] }}>{flagOf(g.iso)} {g.country.toLocaleUpperCase(g.iso === "TR" ? "tr" : "en")}</h3>
                <div className="picker-grid">
                  {g.items.map((r) => {
                    const on = !fromOpen && picked.includes(r.iata);
                    return (
                      <button key={r.iata} type="button" disabled={!fromOpen && r.iata === home} className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(r.iata)} style={on ? { borderColor: REGION_HEX[r.region] } : undefined} title={r.name}>
                        <span className="chip-name">{r.city}</span>
                        <span className="chip-code">{r.iata}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ))}
        {groups.length === 0 && <p className="landing-sub">No place matches “{q}”.</p>}
      </div>
      <div className="picker-bar">
        <span className="picker-count">
          {fromOpen ? "CHOOSE WHERE YOU FLY FROM" : `${picked.length} / ${MAX_DESTINATIONS}${ready ? (via > 0 ? ` · ${via} CHANGE${via === 1 ? "" : "S"} AT ISTANBUL` : " · DIRECT") : " · ADD A PLACE"}`}
        </span>
        <button type="button" className="compose-btn" disabled={!ready} onClick={() => onCompose({ mode, places: picked, home })}>
          {c.cta}
        </button>
      </div>
    </div>
  );
}
