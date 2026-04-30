import { useEffect, useState } from "react";
import { LatLng } from "leaflet";
import WalkScore from "./WalkScore";

const API_URL = import.meta.env.VITE_API_URL || "http://144.24.247.126:5178";

interface FrequencyEntry { hour: number; count: number; }

interface AnalysisPanelProps {
  latlng: LatLng;
  placeName: string;
  subtitle?: string;
  crimeSafetyScore: number | null;
  showTransitFreq?: boolean;
  stopFrequency?: FrequencyEntry[];
}

export default function AnalysisPanel({
  latlng,
  placeName,
  subtitle,
  crimeSafetyScore,
  showTransitFreq = false,
  stopFrequency = [],
}: AnalysisPanelProps) {
  const [walkScoreValue, setWalkScoreValue] = useState<number | null>(null);
  const [accessibilityData, setAccessibilityData] = useState<any>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [stopsCount, setStopsCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingEval(true);
    setAccessibilityData(null);
    fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${latlng.lat}&lon=${latlng.lng}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setAccessibilityData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingEval(false); });
    return () => { cancelled = true; };
  }, [latlng.lat, latlng.lng]);

  useEffect(() => {
    let cancelled = false;
    setStopsCount(null);
    fetch(`${API_URL}/api/Transport/nearby-stops?lat=${latlng.lat}&lon=${latlng.lng}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: any[]) => { if (!cancelled) setStopsCount(Array.isArray(d) ? d.length : 0); })
      .catch(() => { if (!cancelled) setStopsCount(0); });
    return () => { cancelled = true; };
  }, [latlng.lat, latlng.lng]);

  const qualityOfLifeScore = (() => {
    const parts = [walkScoreValue, accessibilityData?.totalScore, crimeSafetyScore]
      .filter((v): v is number => typeof v === "number");
    if (parts.length === 0) return null;
    return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  })();

  return (
    <div className="analysis-panel-section">
      <h2 className="analysis-panel-title">
        Vietos Analizė
        {subtitle && <span className="panel-subtitle"> ({subtitle})</span>}
      </h2>

      <div className="stat-card">
        <h3>Pasirinkta vieta</h3>
        <p className="place-address">{placeName}</p>
        <p className="place-coords">
          {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
        </p>
      </div>

      <WalkScore latlng={latlng} onScore={setWalkScoreValue} />

      {qualityOfLifeScore !== null && (
        <div className="stat-card" style={{ marginTop: "1rem" }}>
          <h3>Gyvenimo kokybės balas</h3>
          <p><strong>{qualityOfLifeScore}/100</strong></p>
        </div>
      )}

      <div className="stat-card">
        <h3>Viešasis transportas</h3>
        <p>
          Stotelės (750m): <strong>{stopsCount ?? "..."}</strong>
        </p>

        {showTransitFreq && (
          <div className="stat-card" style={{ marginTop: "1rem" }}>
            <h3>Susisiekimo Intensyvumas</h3>
            {stopFrequency.length > 0 ? (
              <>
                <div className="main-stat">
                  <span className="stat-number">
                    {(
                      stopFrequency.reduce((acc, curr) => acc + curr.count, 0) /
                      stopFrequency.length
                    ).toFixed(1)}
                  </span>
                  <span className="stat-label">
                    autobusai / valandą (vidurkis)
                  </span>
                </div>
                <div className="frequency-mini-chart">
                  {stopFrequency.map((f, i) => (
                    <div key={i} className="chart-bar-wrapper">
                      <div
                        className="chart-bar"
                        style={{ height: `${(f.count / 15) * 100}%` }}
                        title={`${f.hour}:00 val. - ${f.count} autob.`}
                      />
                      <span className="bar-label">{f.hour}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>Pasirinkite stotelę, kad pamatytumėte analizę.</p>
            )}
          </div>
        )}
      </div>

      <div className="stat-card" style={{ marginTop: "1rem" }}>
        <h3>Pasiekiamumo Įvertinimas</h3>
        {loadingEval ? (
          <p>Skaičiuojami atstumai...</p>
        ) : accessibilityData ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "15px",
                marginBottom: "15px",
                background: "#f8fafc",
                padding: "15px",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "32px",
                  fontWeight: "bold",
                  color:
                    accessibilityData.totalScore > 75
                      ? "#10b981"
                      : accessibilityData.totalScore > 40
                      ? "#f59e0b"
                      : "#ef4444",
                }}
              >
                {accessibilityData.totalScore}/100
              </div>
              <div style={{ fontSize: "14px", color: "#64748b" }}>
                Paskaičiuota pagal atstumus iki būtiniausių paslaugų.
              </div>
            </div>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {accessibilityData.features.map((feature: any, idx: number) => (
                <li
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "white",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "20px" }}>{feature.icon}</span>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                        {feature.type}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {feature.name}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: "bold", color: "#3b82f6", fontSize: "14px" }}>
                    {feature.distance < 1000
                      ? `${Math.round(feature.distance)} m`
                      : `${(feature.distance / 1000).toFixed(1)} km`}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Nepavyko gauti vertinimo duomenų.</p>
        )}
      </div>
    </div>
  );
}
