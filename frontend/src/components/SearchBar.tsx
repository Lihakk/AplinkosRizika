import { useState, useEffect } from "react";
import { LatLng } from "leaflet";
import { Search, Navigation, X } from "lucide-react";
import { geocode } from "../utils/geocoding";

interface ExternalStart {
  pos: LatLng;
  address: string;
  _ts: number;
}

interface SearchBarProps {
  onStartResult: (pos: LatLng) => void;
  onRouteResult: (start: LatLng, end: LatLng) => void;
  onClear: () => void;
  externalStart: ExternalStart | null;
  cityName: string;
}

export default function SearchBar({ onStartResult, onRouteResult, onClear, externalStart, cityName }: SearchBarProps) {
  const [startQuery, setStartQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [startPos, setStartPos] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRoute, setShowRoute] = useState(false);

  useEffect(() => {
    if (externalStart) {
      setStartQuery(externalStart.address);
      setStartPos(externalStart.pos);
    } else {
      setStartQuery("");
      setDestQuery("");
      setStartPos(null);
      setError(null);
    }
  }, [externalStart]);

  const handleStartSearch = async () => {
    if (!startQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const pos = await geocode(startQuery);
      if (!pos) {
        setError("Adresas nerastas.");
      } else {
        setStartPos(pos);
        onStartResult(pos);
      }
    } catch {
      setError("Paieška nepavyko.");
    } finally {
      setLoading(false);
    }
  };

  const handleDestSearch = async () => {
    if (!startQuery.trim() || !destQuery.trim()) {
      setError("Įveskite abu adresus");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let start = startPos;
      if (!start) {
        start = await geocode(startQuery);
        if (!start) {
          setError("Pradžios adresas nerastas.");
          setLoading(false);
          return;
        }
        setStartPos(start);
        onStartResult(start);
      }
      const end = await geocode(destQuery);
      if (!end) {
        setError("Tikslo adresas nerastas.");
      } else {
        onRouteResult(start, end);
      }
    } catch {
      setError("Paieška nepavyko.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setStartQuery("");
    setDestQuery("");
    setStartPos(null);
    setError(null);
    setShowRoute(false);
    onClear();
  };

  return (
    <div className="searchbar-container">
      <div className="searchbar-row">
        <input
          type="text"
          placeholder={`${cityName} adresas...`}
          value={startQuery}
          onChange={(e) => setStartQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStartSearch()}
        />
        <button onClick={handleStartSearch} disabled={loading} title="Ieškoti">
          {loading ? "..." : <Search size={18} />}
        </button>
        <button
          className="route-toggle-btn"
          onClick={() => setShowRoute(!showRoute)}
          title="Maršrutas"
        >
          <Navigation size={18} />
        </button>
        {(startQuery || destQuery) && (
          <button className="clear-btn" onClick={handleClear} title="Valyti">
            <X size={16} />
          </button>
        )}
      </div>

      {showRoute && (
        <div className="searchbar-row dest-row">
          <input
            type="text"
            placeholder="Tikslo adresas..."
            value={destQuery}
            onChange={(e) => setDestQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDestSearch()}
          />
          <button onClick={handleDestSearch} disabled={loading}>
            {loading ? "..." : "Maršrutas"}
          </button>
        </div>
      )}

      {error && <p className="searchbar-error">{error}</p>}
    </div>
  );
}
