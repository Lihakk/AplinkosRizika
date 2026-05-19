import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  TrendingUp, 
  Bus, 
  ShieldCheck, 
  Navigation, 
} from "lucide-react";
import WalkScore from "../components/WalkScore";
import "./AnalysisPage.css";

const API_URL = import.meta.env.VITE_API_URL || "http://144.24.247.126:5178";

export default function AnalysisPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  
  const lat = parseFloat(params.get("lat") || "0");
  const lon = parseFloat(params.get("lon") || "0");
  const address = params.get("address") || "Pasirinkta vieta";

  const [accessibilityData, setAccessibilityData] = useState<any>(null);
  const [stopFrequency, setStopFrequency] = useState<any[]>([]);
  const [walkScoreValue, setWalkScoreValue] = useState<number | null>(null);
  const [, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [accRes, freqRes] = await Promise.all([
          fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${lat}&lon=${lon}`),
          fetch(`${API_URL}/api/Transport/stop-frequency?lat=${lat}&lon=${lon}`)
        ]);

        if (accRes.ok) setAccessibilityData(await accRes.json());
        if (freqRes.ok) setStopFrequency(await freqRes.json());
      } catch (e) {
        console.error("Klaida kraunant analizę:", e);
      } finally {
        setLoading(false);
      }
    };

    if (lat && lon) fetchAllData();
  }, [lat, lon]);

  const qualityOfLifeScore = useMemo(() => {
    const parts = [walkScoreValue, accessibilityData?.totalScore].filter(v => v != null);
    if (parts.length === 0) return 0;
    return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  }, [walkScoreValue, accessibilityData]);

  return (
    <div className="analysis-page">
      {/* Viršutinė navigacija */}
      <header className="analysis-header">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} /> Grįžti į žemėlapį
          </button>
          <div className="header-title">
            <h1>Išsami Vietos Analizė</h1>
            <p>{address}</p>
          </div>
          <div className="header-badge">LIVE DATA</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Pagrindinės kortelės */}
        <div className="analysis-grid">
          
          {/* 1. Gyvenimo kokybės balas */}
          <div className="big-card score-card">
            <div className="card-header">
              <TrendingUp size={24} className="text-blue-600" />
              <h3>Gyvenimo kokybė</h3>
            </div>
            <div className="score-display">
              <div className="score-circle">
                <svg viewBox="0 0 36 36" className="circular-chart">
                  <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="circle" strokeDasharray={`${qualityOfLifeScore}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <text x="18" y="20.35" className="percentage">{qualityOfLifeScore}</text>
                </svg>
              </div>
              <div className="score-info">
                <h4>Bendras įvertinimas</h4>
                <p>Paskaičiuota remiantis pasiekiamumu, transportu ir saugumo rodikliais.</p>
              </div>
            </div>
          </div>

          {/* 2. WalkScore */}
          <div className="big-card walkscore-card">
            <div style={{ display: 'none' }}>
               <WalkScore latlng={{lat, lng: lon} as any} onScore={setWalkScoreValue} />
            </div>
            <div className="card-header">
              <Navigation size={24} className="text-emerald-600" />
              <h3>Vaikščiojimo indeksas</h3>
            </div>
            <div className="walk-display">
               <span className="huge-number">{walkScoreValue || "--"}</span>
               <div className="walk-label">
                  <strong>{walkScoreValue && walkScoreValue > 70 ? 'Labai patogu' : 'Vidutiniška'}</strong>
                  <span>dauguma paslaugų pasiekiamos pėsčiomis.</span>
               </div>
            </div>
          </div>

          {/* 3. Transporto grafikas */}
          <div className="big-card transit-card col-span-2">
            <div className="card-header">
              <Bus size={24} className="text-indigo-600" />
              <h3>Viešojo transporto intensyvumas</h3>
            </div>
            {stopFrequency.length > 0 ? (
              <div className="frequency-chart-full">
                <div className="chart-bars">
                  {stopFrequency.map((f, i) => (
                    <div key={i} className="chart-col">
                      <div className="bar-wrapper">
                        <div className="bar" style={{ height: `${(f.count / 20) * 100}%` }}>
                           <span className="tooltip">{f.count} autob.</span>
                        </div>
                      </div>
                      <span className="hour-label">{f.hour}h</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="no-data">Transporto duomenų šiai vietai nėra.</p>
            )}
          </div>

          {/* 4. Pasiekiamumo detalės */}
          <div className="big-card accessibility-card col-span-full">
            <div className="card-header">
              <ShieldCheck size={24} className="text-blue-600" />
              <h3>Artimiausios paslaugos (Spindulys 1km)</h3>
            </div>
            <div className="features-grid-full">
              {accessibilityData?.features.map((f: any, i: number) => (
                <div key={i} className="feature-item-full">
                  <span className="feature-icon-large">{f.icon}</span>
                  <div className="feature-info-full">
                    <h4>{f.type}</h4>
                    <p>{f.name}</p>
                  </div>
                  <div className="feature-dist-tag">
                    {f.distance < 1000 ? `${Math.round(f.distance)} m` : `${(f.distance / 1000).toFixed(1)} km`}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
