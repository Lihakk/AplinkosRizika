import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  CircleDot,
  Compass,
  Home,
  Leaf,
  Map,
  MapPin,
  Shield,
  SlidersHorizontal,
  TrainFront,
} from "lucide-react";
import { analyticsModules } from "./analyticsModules";
import {
  getDeepEvaluation,
  getLiveEldershipMetrics,
  getLiveRealEstateListings,
  getRecommendationProfiles,
  type LiveEldershipMetric,
} from "./analyticsApi";
import type {
  DeepEvaluationPoint,
  EldershipMetric,
  NeighborhoodPreference,
  NeighborhoodProfile,
  RealEstateListingAnalytics,
} from "./analyticsTypes";
import "./AnalyticsHub.css";

const metricDefinitions = [
  { key: "totalCrimeRate", label: "Nusikalstamumas", unit: "", lowerIsBetter: true },
  { key: "averageAccessibilityScore", label: "Pasiekiamumas", unit: "/100" },
  { key: "parks", label: "Parkai", unit: "" },
  { key: "publicTransportStops", label: "Stoteles", unit: "" },
  { key: "averageSchoolDistance", label: "Mokyklos atstumas", unit: " m", lowerIsBetter: true },
] satisfies Array<{
  key: keyof Omit<EldershipMetric, "id" | "name">;
  label: string;
  unit: string;
  lowerIsBetter?: boolean;
}>;

function formatCurrency(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "nenurodyta";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("lt-LT").format(value);
}

function averageScore(listing: RealEstateListingAnalytics) {
  const { walkability, safety, services } = listing.scores;
  return Math.round((walkability + safety + services) / 3);
}

function scoreTone(score: number) {
  if (score >= 82) return "good";
  if (score >= 65) return "warn";
  return "bad";
}

function PageFrame({
  eyebrow,
  title,
  titleAccent,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  titleAccent?: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="analytics-page">
      <header className="analytics-topbar">
        <Link className="analytics-back" to="/">
          <ArrowLeft size={18} />
          Pradžia
        </Link>
        <nav className="analytics-nav" aria-label="Analitikos centras">
          {analyticsModules.map(({ path, title: moduleTitle }) => (
            <NavLink key={path} to={path}>
              {moduleTitle}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="analytics-main">
        <section className="analytics-hero-panel">
          <span className="analytics-eyebrow">{eyebrow}</span>
          <h1>
            {title}
            {titleAccent && <span className="analytics-title-accent">{titleAccent}</span>}
          </h1>
          <p>{description}</p>
        </section>
        {children}
      </main>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="analytics-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-line">
      <div>
        <span>{label}</span>
        <strong>{value}/100</strong>
      </div>
      <div className="score-track">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function LoadingPanel({ label = "Ruošiame informaciją..." }: { label?: string }) {
  return <div className="glass-panel analytics-state">{label}</div>;
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="glass-panel analytics-state analytics-state--error">{message}</div>;
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="glass-panel analytics-state">{message}</div>;
}

function useLiveElderships() {
  const [metrics, setMetrics] = useState<LiveEldershipMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLiveEldershipMetrics()
      .then((data) => {
        if (cancelled) return;
        setMetrics(data);
        setError(data.length ? null : "Šiuo metu nepavyko rasti seniūnijų duomenų.");
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        console.error(fetchError);
        setError("Nepavyko įkelti seniūnijų palyginimo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { metrics, loading, error };
}

export function AnalyticsHomePage() {
  return (
    <PageFrame
      eyebrow="Analitikos centras"
      title="Miesto analizė"
      titleAccent="vienoje vietoje"
      description="Čia galite palyginti rajonus, įvertinti būsto aplinką ir greitai suprasti, kuri vieta geriausiai tinka gyvenimui."
    >
      <div className="analytics-module-grid">
        {analyticsModules.map(({ path, title, description, eyebrow, Icon }) => (
          <Link className="analytics-module-card" to={path} key={path}>
            <div className="module-icon">
              <Icon size={24} />
            </div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
            <p>{description}</p>
            <em>
              Atidaryti
              <ChevronRight size={16} />
            </em>
          </Link>
        ))}
      </div>
    </PageFrame>
  );
}

export function EldershipComparisonPage() {
  const { metrics, loading, error } = useLiveElderships();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const activeSelectedIds = selectedIds.length ? selectedIds : metrics.slice(0, 3).map((item) => item.id);
  const selectedElderships = metrics.filter((item) => activeSelectedIds.includes(item.id));

  const toggleEldership = (id: string) => {
    setSelectedIds((current) => {
      const base = current.length ? current : metrics.slice(0, 3).map((item) => item.id);
      if (base.includes(id)) {
        return base.length <= 2 ? base : base.filter((item) => item !== id);
      }
      return [...base, id];
    });
  };

  return (
    <PageFrame
      eyebrow="Seniūnijų palyginimas"
      title="Palyginkite miesto"
      titleAccent="teritorijas"
      description="Pasirinkite kelias seniūnijas ir greitai pamatykite, kur daugiau parkų, patogesnis transportas, geresnis pasiekiamumas ir saugesnė aplinka."
    >
      <section className="analytics-grid analytics-grid--sidebar">
        <aside className="glass-panel selector-panel">
          <div className="panel-heading">
            <SlidersHorizontal size={20} />
            <h2>Pasirinkimas</h2>
          </div>
          <div className="checkbox-list">
            {metrics.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={activeSelectedIds.includes(item.id)}
                  onChange={() => toggleEldership(item.id)}
                />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
          <p className="panel-note">Palikite bent 2 seniūnijas, kad būtų aišku, kuo jos skiriasi.</p>
        </aside>

        <section className="glass-panel comparison-panel">
          <div className="panel-heading panel-heading--spread">
            <div>
              <span className="analytics-eyebrow">Pagrindiniai rodikliai</span>
              <h2>Palyginimas</h2>
            </div>
            <StatChip label="Pasirinkta" value={`${selectedElderships.length}`} />
          </div>

          {loading && <LoadingPanel />}
          {error && !loading && <ErrorPanel message={error} />}
          {!loading && !error && selectedElderships.length === 0 && (
            <EmptyPanel message="Pasirinkite bent dvi seniūnijas palyginimui." />
          )}
          {!loading && !error && selectedElderships.length > 0 && (
            <div className="comparison-table">
              <div className="comparison-row comparison-row--header">
                <span>Seniūnija</span>
                {metricDefinitions.map((metric) => (
                  <span key={metric.key}>{metric.label}</span>
                ))}
              </div>
              {selectedElderships.map((eldership) => (
                <div className="comparison-row" key={eldership.id}>
                  <strong>{eldership.name}</strong>
                  {metricDefinitions.map((metric) => {
                    const value = eldership[metric.key];
                    const max = Math.max(...metrics.map((item) => Number(item[metric.key])), 1);
                    const width = Math.max(8, (Number(value) / max) * 100);
                    return (
                      <div className="bar-cell" key={metric.key}>
                        <span>{formatNumber(Number(value))}{metric.unit}</span>
                        <div className={metric.lowerIsBetter ? "bar-track is-risk" : "bar-track"}>
                          <em style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </PageFrame>
  );
}

export function RealEstateAnalyticsPage() {
  const [listings, setListings] = useState<RealEstateListingAnalytics[]>([]);
  const [activeListingId, setActiveListingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeListing = listings.find((listing) => listing.id === activeListingId);

  useEffect(() => {
    let cancelled = false;
    getLiveRealEstateListings()
      .then((data) => {
        if (cancelled) return;
        setListings(data);
        setActiveListingId(data[0]?.id ?? "");
        setError(data.length ? null : "Šiuo metu neturime skelbimų šiame spindulyje. Pabandykite vėliau arba pasirinkite kitą vietą.");
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        console.error(fetchError);
        setError("Nepavyko įkelti NT skelbimų.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mapBounds = useMemo(() => {
    const lats = listings.map((listing) => listing.lat);
    const lons = listings.map((listing) => listing.lon);
    return {
      minLat: Math.min(...lats, 54.88),
      maxLat: Math.max(...lats, 54.93),
      minLon: Math.min(...lons, 23.86),
      maxLon: Math.max(...lons, 23.98),
    };
  }, [listings]);

  const getPinPosition = (listing: RealEstateListingAnalytics) => {
    const lonRange = Math.max(mapBounds.maxLon - mapBounds.minLon, 0.01);
    const latRange = Math.max(mapBounds.maxLat - mapBounds.minLat, 0.01);
    return {
      left: `${12 + ((listing.lon - mapBounds.minLon) / lonRange) * 76}%`,
      top: `${82 - ((listing.lat - mapBounds.minLat) / latRange) * 64}%`,
    };
  };

  return (
    <PageFrame
      eyebrow="NT skelbimų analizė"
      title="Būstas su"
      titleAccent="kaimynystės balu"
      description="Matykite ne tik kainą ir plotą, bet ir tai, kokia aplinka yra aplink būstą: ar netoli paslaugos, transportas ir žalios erdvės."
    >
      <section className="real-estate-layout">
        <div className="glass-panel property-map" aria-label="NT skelbimų žemėlapis">
          <div className="map-toolbar">
            <Map size={20} />
            <strong>Skelbimų žemėlapis</strong>
            <span>{listings.length} objektai</span>
          </div>
          <div className="mock-map-grid">
            {activeListing && <div className="radius-circle" />}
            {listings.map((listing) => (
              <button
                className={`property-pin ${listing.id === activeListingId ? "active" : ""}`}
                key={listing.id}
                style={getPinPosition(listing)}
                onClick={() => setActiveListingId(listing.id)}
                title={listing.address}
              >
                <Home size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="property-list">
          {loading && <LoadingPanel />}
          {error && !loading && <ErrorPanel message={error} />}
          {!loading && !error && listings.length === 0 && <EmptyPanel message="NT skelbimų šiame spindulyje nerasta." />}
          {!loading && !error && listings.map((listing) => {
            const score = averageScore(listing);
            const areaLabel = listing.area > 0 ? `${listing.area} m²` : "nenurodyta";
            const squareMeterPrice = listing.area > 0 ? formatCurrency(Math.round(listing.price / listing.area)) : "nenurodyta";
            return (
              <article className="glass-panel property-card" key={listing.id}>
                <div className="property-card-header">
                  <div>
                    <span className="analytics-eyebrow">{listing.address}</span>
                    <h2>{listing.title}</h2>
                  </div>
                  <strong className={`score-badge score-badge--${scoreTone(score)}`}>{score}</strong>
                </div>
                <div className="property-stats">
                  <StatChip label="Kaina" value={formatCurrency(listing.price)} />
                  <StatChip label="Plotas" value={areaLabel} />
                  <StatChip label="€/m²" value={squareMeterPrice} />
                </div>
                <div className="score-stack">
                  <ScoreLine label="Vaikščiojamumas" value={listing.scores.walkability} />
                  <ScoreLine label="Saugumas" value={listing.scores.safety} />
                  <ScoreLine label="Paslaugos" value={listing.scores.services} />
                </div>
                <button className="primary-action" onClick={() => setActiveListingId(listing.id)}>
                  <CircleDot size={17} />
                  Rodyti 15 minučių miesto spindulį
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </PageFrame>
  );
}

export function RecommendationPage() {
  const { metrics, loading, error } = useLiveElderships();
  const profiles = useMemo<NeighborhoodProfile[]>(() => getRecommendationProfiles(metrics), [metrics]);
  const [step, setStep] = useState(1);
  const [preferences, setPreferences] = useState<NeighborhoodPreference>({
    safety: 8,
    transport: 7,
    greenery: 8,
    nightlife: 4,
  });

  const ranked = useMemo(() => {
    const totalWeight = Object.values(preferences).reduce((sum, value) => sum + value, 0) || 1;
    return profiles
      .map((profile) => {
        const score = (
          profile.scores.safety * preferences.safety +
          profile.scores.transport * preferences.transport +
          profile.scores.greenery * preferences.greenery +
          profile.scores.nightlife * preferences.nightlife
        ) / totalWeight;
        return { ...profile, matchScore: Math.round(score * 10) };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);
  }, [preferences, profiles]);

  const updatePreference = (key: keyof NeighborhoodPreference, value: number) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  return (
    <PageFrame
      eyebrow="Išmanioji rekomendacija"
      title="Rajonų atranka pagal"
      titleAccent="jūsų prioritetus"
      description="Pasirinkite, kas jums svarbiausia, o sistema parodys tris vietas, kurios geriausiai atitinka jūsų gyvenimo būdą."
    >
      <section className="wizard-layout">
        <div className="glass-panel wizard-controls">
          <div className="wizard-steps" aria-label="Rekomendacijos žingsniai">
            {[1, 2, 3].map((item) => (
              <button className={step === item ? "active" : ""} key={item} onClick={() => setStep(item)}>
                {step > item ? <Check size={16} /> : item}
              </button>
            ))}
          </div>

          <div className="panel-heading">
            <Compass size={20} />
            <h2>{step === 1 ? "Prioritetai" : step === 2 ? "Svorio balansas" : "Rezultatai"}</h2>
          </div>

          {step < 3 ? (
            <div className="slider-stack">
              {([
                ["safety", "Saugumas", Shield],
                ["transport", "Viešasis transportas", TrainFront],
                ["greenery", "Žaliosios erdvės", Leaf],
                ["nightlife", "Paslaugos ir parduotuvės", Building2],
              ] as const).map(([key, label, Icon]) => (
                <label className="priority-slider" key={key}>
                  <span>
                    <Icon size={18} />
                    {label}
                    <strong>{preferences[key]}/10</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={preferences[key]}
                    onChange={(event) => updatePreference(key, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="result-preview">
              <strong>{ranked[0]?.name ?? "Dar nėra rezultato"}</strong>
              <span>{ranked[0]?.matchScore ?? 0}% atitiktis</span>
            </div>
          )}

          <div className="wizard-actions">
            <button className="secondary-action" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>
              Atgal
            </button>
            <button className="primary-action" onClick={() => setStep((value) => Math.min(3, value + 1))}>
              {step === 3 ? "Perskaičiuoti" : "Toliau"}
            </button>
          </div>
        </div>

        <div className="recommendation-results">
          {loading && <LoadingPanel />}
          {error && !loading && <ErrorPanel message={error} />}
          {!loading && !error && ranked.length === 0 && <EmptyPanel message="Rekomendacijoms dar trūksta duomenų." />}
          {!loading && !error && ranked.map((item, index) => (
            <article className="glass-panel recommendation-card" key={item.id}>
              <div className="rank-number">{index + 1}</div>
              <div>
                <div className="property-card-header">
                  <div>
                    <span className="analytics-eyebrow">Nr. {index + 1}</span>
                    <h2>{item.name}</h2>
                  </div>
                  <strong className={`score-badge score-badge--${scoreTone(item.matchScore)}`}>{item.matchScore}%</strong>
                </div>
                <p>{item.summary}</p>
                <div className="property-stats">
                  <StatChip label="Tipinė kaina €/m²" value={item.medianPrice ? formatCurrency(item.medianPrice) : "nėra skelbimų"} />
                  <StatChip label="Saugumas" value={`${item.scores.safety}/10`} />
                  <StatChip label="Transportas" value={`${item.scores.transport}/10`} />
                </div>
                <ul className="signal-list">
                  {item.matchedSignals.map((signal) => (
                    <li key={signal}>
                      <Check size={15} />
                      {signal}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}

export function DeepEvaluationDashboardPage() {
  const [address, setAddress] = useState("Savanorių pr. 42, Kaunas");
  const [submittedAddress, setSubmittedAddress] = useState(address);
  const [evaluation, setEvaluation] = useState<DeepEvaluationPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDeepEvaluation(submittedAddress)
      .then((data) => {
        if (cancelled) return;
        setEvaluation(data);
        setError(null);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        console.error(fetchError);
        setError("Nepavyko paruošti šios vietos įvertinimo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submittedAddress]);

  const crimeGradient = (evaluation?.crimeBreakdown ?? [])
    .reduce(
      (parts, item, index, array) => {
        const previous = array.slice(0, index).reduce((sum, entry) => sum + entry.value, 0);
        const start = previous;
        const end = previous + item.value;
        return [...parts, `${item.color} ${start}% ${end}%`];
      },
      [] as string[],
    )
    .join(", ");

  return (
    <PageFrame
      eyebrow="Išsamus vietos įvertinimas"
      title="Vieno adreso"
      titleAccent="360° apžvalga"
      description="Įveskite adresą ir pamatykite aiškų saugumo, paslaugų, susisiekimo ir artimiausių objektų vaizdą."
    >
      <section className="deep-dashboard">
        <form
          className="glass-panel address-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            setSubmittedAddress(address);
          }}
        >
          <MapPin size={22} />
          <label>
            Analizuojamas adresas
            <input value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          <button className="primary-action" type="submit">Vertinti</button>
          <strong>{evaluation ? `${evaluation.totalScore}/100` : "--"}</strong>
        </form>

        {loading && <LoadingPanel />}
        {error && !loading && <ErrorPanel message={error} />}
        {!loading && !error && evaluation && (
          <div className="deep-grid">
            <article className="glass-panel deep-card">
              <div className="panel-heading panel-heading--spread">
                <div>
                  <span className="analytics-eyebrow">Saugumas</span>
                  <h2>Saugumo balas ir nusikaltimų struktūra</h2>
                </div>
                <Shield size={22} />
              </div>
              <div className="safety-layout">
                <div className="pie-chart" style={{ background: `conic-gradient(${crimeGradient})` }}>
                  <span>{evaluation.safetyRating}</span>
                </div>
                <div className="legend-list">
                  {evaluation.crimeBreakdown.map((item) => (
                    <div key={item.label}>
                      <span style={{ background: item.color }} />
                      <strong>{item.label}</strong>
                      <em>{item.value}%</em>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="glass-panel deep-card">
              <div className="panel-heading panel-heading--spread">
                <div>
                  <span className="analytics-eyebrow">Infrastruktūra</span>
                  <h2>Artimiausi objektai</h2>
                </div>
                <Map size={22} />
              </div>
              <div className="poi-list">
                {evaluation.nearestPois.map((poi) => (
                  <div key={poi.id}>
                    <span>{poi.type}</span>
                    <strong>{poi.name}</strong>
                    <em>{poi.distanceMeters} m</em>
                  </div>
                ))}
              </div>
            </article>

            <article className="glass-panel deep-card deep-card--wide">
              <div className="panel-heading panel-heading--spread">
                <div>
                  <span className="analytics-eyebrow">Susisiekimas</span>
                  <h2>Transportas ir vaikščiojamumas</h2>
                </div>
                <TrainFront size={22} />
              </div>
              <div className="transport-summary">
                <StatChip label="Vaikščiojamumas" value={`${evaluation.transport.walkScore}/100`} />
                <StatChip label="Reisai / val." value={`${evaluation.transport.averageTripsPerHour}`} />
                <StatChip label="Artimiausia stotele" value={evaluation.transport.nearestStop} />
                <StatChip label="Aktyviausias laikas" value={evaluation.transport.peakWindow} />
              </div>
              <div className="frequency-strip">
                {[8, 15, 19, 22, 18, 13, 9, 6].map((value, index) => (
                  <span key={`${value}-${index}`} style={{ height: `${value * 4}px` }} title={`${value} reisai`} />
                ))}
              </div>
            </article>
          </div>
        )}
      </section>
    </PageFrame>
  );
}
