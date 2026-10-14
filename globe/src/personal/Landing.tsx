import { useMemo, useState } from "react";
import { REGION_HEX } from "@web/data/palette";
import type { Region } from "@collector/day-schema";
import { DEFAULT_ORIGIN, MAX_DESTINATIONS, MIN_DESTINATIONS, type PersonalMode, type PersonalSelection } from "./codec";
import { DESTINATIONS, NETWORK_CLAIM, NETWORK_COUNTRIES, NETWORK_DESTINATIONS, countryName, destinationOf, flagOf, isHub, labelOf, AREAS, areaOf, type AreaId, type Destination } from "./destinations";
import { buildRoutes } from "./routes";

interface Props {
  onCompose(sel: PersonalSelection): void;
  onLive(): void;
}

type Step = "mode" | "origin" | "dests";

const COPY: Record<PersonalMode, { head: string; sub: string; cta: string }> = {
  visited: { head: "Where have you been?", sub: "Pick the places you have flown to. Your journey becomes a piece of music.", cta: "COMPOSE MY JOURNEY" },
  wish: { head: "Where do you want to go?", sub: "Pick your dream destinations. We will play the sound of the trip you have not taken yet.", cta: "COMPOSE MY WISHLIST" },
};

const norm = (s: string): string => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Row extends Destination {
  country: string;
  label: string;
  hay: string;
}

const ROWS: Row[] = DESTINATIONS.map((d) => {
  const country = countryName(d.iso);
  return { ...d, country, label: labelOf(d), hay: norm(`${d.city} ${d.iata} ${d.name} ${country}`) };
});

function groupByCountry(rows: Row[]): { iso: string; country: string; region: Region; items: Row[] }[] {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(r.iso, [...(m.get(r.iso) ?? []), r]);
  return [...m.entries()]
    .map(([iso, items]) => ({ iso, country: items[0].country, region: items[0].region, items: items.sort((a, b) => a.city.localeCompare(b.city)) }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

export function Landing({ onCompose, onLive }: Props) {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<PersonalMode>("visited");
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [area, setArea] = useState<AreaId | "ALL">("ALL");

  const needle = norm(q.trim());
  const filtered = useMemo(
    () => ROWS.filter((r) => (!needle || r.hay.includes(needle)) && (step === "origin" || area === "ALL" || areaOf(r.iso) === area)),
    [needle, area, step],
  );
  const groups = useMemo(() => groupByCountry(filtered), [filtered]);

  const reset = () => {
    setStep("mode");
    setPicked([]);
    setQ("");
    setArea("ALL");
  };

  if (step === "mode") {
    return (
      <div className="landing" role="main">
        <h1 className="landing-title">A WORLD OF MUSIC</h1>
        <p className="landing-sub">Every journey has a sound. Choose yours.</p>
        <div className="mode-cards">
          <button type="button" className="mode-card" onClick={() => { setMode("visited"); setStep("origin"); }}>
            <span className="mode-n">01</span>
            <span className="mode-name">Where I have been</span>
            <span className="mode-desc">The places you flew to, composed into one piece.</span>
          </button>
          <button type="button" className="mode-card" onClick={() => { setMode("wish"); setStep("origin"); }}>
            <span className="mode-n">02</span>
            <span className="mode-name">Where I want to go</span>
            <span className="mode-desc">Your wishlist, as the music of a trip yet to come.</span>
          </button>
          <button type="button" className="mode-card" onClick={onLive}>
            <span className="mode-n">03</span>
            <span className="mode-name">The world, live</span>
            <span className="mode-desc">Every Turkish Airlines flight of the last 24 hours, played as music.</span>
          </button>
        </div>
        <p className="landing-fine">{NETWORK_CLAIM} · {NETWORK_DESTINATIONS} destinations · {NETWORK_COUNTRIES} countries</p>
      </div>
    );
  }

  if (step === "origin") {
    return (
      <div className="landing picker" role="main">
        <button type="button" className="landing-back" onClick={reset}>← BACK</button>
        <h1 className="picker-head">Where do you start from?</h1>
        <p className="landing-sub">The world's most-connected airline reaches {NETWORK_DESTINATIONS} destinations in {NETWORK_COUNTRIES} countries, all through Istanbul. Pick the airport you fly out of.</p>
        <input className="picker-search" type="search" placeholder="Search a city, airport or country" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your home airport" autoFocus />
        <button type="button" className="origin-quick" onClick={() => { setOrigin("IST"); setQ(""); setStep("dests"); }}>
          <span className="chip-flag">{flagOf("TR")}</span> Istanbul — the hub itself <span className="chip-code">IST</span>
        </button>
        <div className="picker-groups">
          {groups.map((g) => (
            <section key={g.iso} className="group">
              <h2 className="group-head" style={{ color: REGION_HEX[g.region] }}>{flagOf(g.iso)} {g.country}</h2>
              <div className="picker-grid">
                {g.items.map((r) => (
                  <button key={r.iata} type="button" className="chip" onClick={() => { setOrigin(r.iata); setQ(""); setStep("dests"); }}>
                    <span className="chip-name">{r.city}</span>
                    <span className="chip-code">{r.iata}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 && <p className="landing-sub">No airport matches “{q}”.</p>}
        </div>
      </div>
    );
  }

  const toggle = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((x) => x !== code) : p.length >= MAX_DESTINATIONS ? p : [...p, code]));
  const ready = picked.length >= MIN_DESTINATIONS;
  const c = COPY[mode];
  const o = destinationOf(origin);
  const last = picked[picked.length - 1];
  const lastTrip = last ? buildRoutes(origin, [last]).map((r) => r.from).concat(last).join(" → ") : "";
  const areaTabs: (AreaId | "ALL")[] = ["ALL", ...AREAS.map((a) => a.id).filter((id) => ROWS.some((x) => areaOf(x.iso) === id))];
  const areaLabel = (id: AreaId): string => AREAS.find((a) => a.id === id)!.label;
  const sections = AREAS.map((a) => ({ ...a, groups: groups.filter((g) => areaOf(g.iso) === a.id) })).filter((a) => a.groups.length > 0);

  return (
    <div className="landing picker" role="main">
      <button type="button" className="landing-back" onClick={() => { setStep("origin"); setQ(""); }}>← BACK</button>
      <h1 className="picker-head">{c.head}</h1>
      <p className="landing-sub">
        {c.sub} Starting from <strong>{o?.city ?? origin}</strong>{isHub(origin) ? " (the hub)" : " via Istanbul"}.
      </p>
      <input className="picker-search" type="search" placeholder="Search a city, airport or country" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a destination" />
      <div className="region-tabs" role="tablist">
        {areaTabs.map((a) => (
          <button key={a} type="button" role="tab" aria-selected={area === a} className={`tab${area === a ? " on" : ""}`} onClick={() => setArea(a)}>
            {a === "ALL" ? "ALL DESTINATIONS" : `${AREAS.find((x) => x.id === a)!.upper} DESTINATIONS`}
          </button>
        ))}
      </div>
      <div className="picker-groups">
        {sections.map((a) => (
          <div key={a.id} className="area">
            <h2 className="area-head">{a.label} destinations</h2>
            {a.groups.map((g) => (
              <section key={g.iso} className="group">
                <h3 className="group-head" style={{ color: REGION_HEX[g.region] }}>{flagOf(g.iso)} {g.country}</h3>
                <div className="picker-grid">
                  {g.items.map((r) => {
                    const on = picked.includes(r.iata);
                    const same = r.iata === origin;
                    return (
                      <button key={r.iata} type="button" disabled={same} className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(r.iata)} style={on ? { borderColor: REGION_HEX[r.region] } : undefined} title={r.name}>
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
        {groups.length === 0 && <p className="landing-sub">No destination matches “{q}”.</p>}
      </div>
      <div className="picker-bar">
        <span className="picker-count">
          {picked.length} / {MAX_DESTINATIONS}
          {lastTrip ? ` · LAST: ${lastTrip}` : ` · PICK AT LEAST ${MIN_DESTINATIONS}`}
        </span>
        <button type="button" className="compose-btn" disabled={!ready} onClick={() => onCompose({ mode, origin, dests: picked })}>
          {c.cta}
        </button>
      </div>
    </div>
  );
}
