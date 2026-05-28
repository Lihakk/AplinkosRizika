import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LatLng } from "leaflet";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Bus,
  ExternalLink,
  Home,
  Layers,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import WalkScore from "../components/WalkScore";
import "./AnalysisPage.css";

const API_URL = import.meta.env.VITE_API_URL || "http://144.24.247.126:5178";

type TabId = "overview" | "osm" | "transport" | "homes";

interface AccessibilityFeature {
  type?: string;
  name?: string;
  distance: number;
  icon?: string;
  score?: number;
  rangeLabel?: string;
}

interface AccessibilityData {
  totalScore: number;
  features: AccessibilityFeature[];
}

interface FrequencyPoint {
  hour?: string;
  Hour?: string;
  count?: number;
  Count?: number;
}

interface RealEstateListing {
  name?: string;
  price?: number;
  url?: string;
  imageUrl?: string;
  lat?: number;
  lon?: number;
  distance?: number;
}

function formatDistance(distance?: number) {
  if (distance == null || Number.isNaN(distance)) return "nėra";
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1)} km`;
}

function scoreTone(score: number | null | undefined) {
  if (score == null) return "neutral";
  if (score >= 75) return "good";
  if (score >= 45) return "warn";
  return "bad";
}

function readFrequencyCount(point: FrequencyPoint) {
  return point.count ?? point.Count ?? 0;
}

function readFrequencyHour(point: FrequencyPoint) {
  return point.hour ?? point.Hour ?? "";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default function AnalysisPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const lat = Number(params.get("lat") || "0");
  const lon = Number(params.get("lon") || "0");
  const address = params.get("address") || "Pasirinkta vieta";
  const point = useMemo(() => (lat && lon ? new LatLng(lat, lon) : null), [lat, lon]);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [accessibilityData, setAccessibilityData] = useState<AccessibilityData | null>(null);
  const [stopFrequency, setStopFrequency] = useState<FrequencyPoint[]>([]);
  const [listings, setListings] = useState<RealEstateListing[]>([]);
  const [walkScoreValue, setWalkScoreValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      if (!lat || !lon) return;

      setLoading(true);
      try {
        const [accRes, freqRes, homesRes] = await Promise.all([
          fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${lat}&lon=${lon}`),
          fetch(`${API_URL}/api/Transport/stop-frequency?lat=${lat}&lon=${lon}`),
          fetch(`${API_URL}/api/RealEstate/nearby?lat=${lat}&lon=${lon}&radius=2500`),
        ]);

        if (accRes.ok) setAccessibilityData((await accRes.json()) as AccessibilityData);
        if (freqRes.ok) setStopFrequency((await freqRes.json()) as FrequencyPoint[]);
        if (homesRes.ok) setListings((await homesRes.json()) as RealEstateListing[]);
      } catch (error) {
        console.error("Klaida kraunant analizę:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [lat, lon]);

  const transitAverage = useMemo(
    () => average(stopFrequency.map(readFrequencyCount)),
    [stopFrequency],
  );

  const transitScore = useMemo(() => {
    if (stopFrequency.length === 0) return null;
    return Math.min(100, Math.round(transitAverage * 7));
  }, [stopFrequency.length, transitAverage]);

  const qualityOfLifeScore = useMemo(() => {
    const parts = [walkScoreValue, accessibilityData?.totalScore, transitScore].filter(
      (value): value is number => typeof value === "number",
    );
    if (parts.length === 0) return null;
    return Math.round(average(parts));
  }, [walkScoreValue, accessibilityData, transitScore]);

  const nearestFeature = accessibilityData?.features?.[0];
  const weakestFeature = accessibilityData?.features
    ? [...accessibilityData.features].sort((a, b) => b.distance - a.distance)[0]
    : undefined;

  const tabs = [
    { id: "overview" as const, label: "Apžvalga", Icon: BarChart3 },
    { id: "osm" as const, label: "OSM paslaugos", Icon: Layers },
    { id: "transport" as const, label: "Transportas", Icon: Bus },
    { id: "homes" as const, label: "Būstas", Icon: Building2 },
  ];

  return (
    <div className="analysis-page">
      <header className="analysis-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={19} />
          Grįžti
        </button>
        <div className="analysis-title">
          <span>Vietos analizė</span>
          <h1>{address}</h1>
        </div>
        <div className={`status-badge ${loading ? "is-loading" : ""}`}>
          {loading ? "Kraunama" : "Gyvi duomenys"}
        </div>
      </header>

      <main className="analysis-shell">
        <section className="analysis-hero">
          <div>
            <span className="eyebrow">Bendras vertinimas</span>
            <h2>{qualityOfLifeScore == null ? "Skaičiuojama" : `${qualityOfLifeScore}/100`}</h2>
            <p>
              Balas jungia vaikščiojamumą, OSM paslaugų pasiekiamumą ir viešojo transporto intensyvumą.
            </p>
          </div>
          <div className={`score-meter score-meter--${scoreTone(qualityOfLifeScore)}`}>
            <strong>{qualityOfLifeScore ?? "—"}</strong>
            <span>balas</span>
          </div>
        </section>

        <nav className="analysis-tabs" aria-label="Analizės puslapiai">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.Icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="analysis-content">
          {activeTab === "overview" && (
            <div className="overview-grid">
              {point && <WalkScore latlng={point} onScore={setWalkScoreValue} />}
              {/* <article className="metric-card">
                <Navigation size={22} />
                <span>Vaikščiojamumas</span>
                <strong>{walkScoreValue == null ? "—" : `${walkScoreValue}/100`}</strong>
              </article> */}
              <article className="metric-card">
                <Layers size={22} />
                <span>OSM paslaugos</span>
                <strong>{accessibilityData ? `${accessibilityData.totalScore}/100` : "—"}</strong>
                <small>{nearestFeature ? `${nearestFeature.type}: ${formatDistance(nearestFeature.distance)}` : "Vertinama pagal atstumus"}</small>
              </article>
              <article className="metric-card">
                <Bus size={22} />
                <span>Transportas</span>
                <strong>{transitScore == null ? "—" : `${transitScore}/100`}</strong>
                <small>{transitAverage ? `${transitAverage.toFixed(1)} reis./val.` : "Stotelės grafikas nerastas"}</small>
              </article>
              <article className="metric-card">
                <Home size={22} />
                <span>Skelbimai</span>
                <strong>{listings.length || "—"}</strong>
                <small>2.5 km spinduliu</small>
              </article>
            </div>
          )}

          {activeTab === "osm" && (
            <div className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">OpenStreetMap</span>
                  <h3>Kas yra arti</h3>
                </div>
                <ShieldCheck size={24} />
              </div>
              <div className="service-list">
                {accessibilityData?.features.map((feature) => (
                  <div key={`${feature.type}-${feature.name}`} className="service-row">
                    <span className="feature-icon">{feature.icon || "•"}</span>
                    <div>
                      <strong>{feature.type}</strong>
                      <small>{feature.name}</small>
                    </div>
                    <em>{formatDistance(feature.distance)}</em>
                    <b>{feature.rangeLabel || "atstumas"}</b>
                  </div>
                ))}
                {!accessibilityData?.features.length && <p className="empty-copy">OSM paslaugų dar nepavyko įkelti.</p>}
              </div>
              {weakestFeature && (
                <p className="insight-copy">
                  Silpniausia kategorija pagal atstumą: <strong>{weakestFeature.type}</strong> ({formatDistance(weakestFeature.distance)}).
                </p>
              )}
            </div>
          )}

          {activeTab === "transport" && (
            <div className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Viešasis transportas</span>
                  <h3>Reisai pagal valandą</h3>
                </div>
                <strong>{transitAverage ? `${transitAverage.toFixed(1)}/val.` : "—"}</strong>
              </div>
              {stopFrequency.length > 0 ? (
                <div className="transport-chart">
                  {stopFrequency.map((point, index) => {
                    const count = readFrequencyCount(point);
                    return (
                      <div key={`${readFrequencyHour(point)}-${index}`} className="transport-bar">
                        <div style={{ height: `${Math.max(6, Math.min(100, count * 6))}%` }} title={`${count} reisai`} />
                        <span>{readFrequencyHour(point)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-copy">Šiai vietai transporto intensyvumo duomenų nėra.</p>
              )}
            </div>
          )}

          {activeTab === "homes" && (
            <div className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Aruodas</span>
                  <h3>Netoliese esantys skelbimai</h3>
                </div>
                <MapPin size={24} />
              </div>
              <div className="listing-grid">
                {listings.map((listing) => (
                  <a key={listing.url || listing.name} className="listing-card" href={listing.url} target="_blank" rel="noreferrer">
                    {listing.imageUrl && <img src={listing.imageUrl} alt="" />}
                    <div>
                      <strong>{listing.name || "Aruodas skelbimas"}</strong>
                      <span>{listing.price ? `${listing.price.toLocaleString("lt-LT")} €` : "Kaina nenurodyta"}</span>
                      <small>{formatDistance(listing.distance)}</small>
                    </div>
                    <ExternalLink size={16} />
                  </a>
                ))}
                {listings.length === 0 && <p className="empty-copy">Netoliese skelbimų nerasta arba duomenų rinkiklis dar neužpildė bazės.</p>}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
