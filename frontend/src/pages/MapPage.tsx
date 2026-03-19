import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import "./MapPage.css";
import { useEffect } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  GeoJSON,
  useMapEvents,
  useMap,
} from "react-leaflet";

import { Icon, LatLng, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

// -----------------------------
// Types
// -----------------------------

type CrimeKey = "asm" | "trv" | "nar";

interface SelectedPlace {
  latlng: LatLng;
  name: string;
  description: string;
}

interface LocationMarkerProps {
  setSelectedPlace: (place: SelectedPlace | null) => void;
  customIcon: Icon;
  externalPosition: LatLng | null;
  openPanel: () => void;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

// -----------------------------
// Custom Marker Icon
// -----------------------------
const customIcon = new Icon({
  iconUrl: "./icons/placeholder.png",
  iconSize: [38, 38],
});

// -----------------------------
// Search Bar Component
// -----------------------------
function SearchBar({ onResult }: { onResult: (lat: number, lng: number) => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );

      const data: SearchResult[] = await res.json();

      if (data.length === 0) {
        setError("Adresas nerastas.");
      } else {
        onResult(parseFloat(data[0].lat), parseFloat(data[0].lon));
      }
    } catch {
      setError("Paieška nepavyko.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Įvesk adresą..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
      />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? "..." : "Ieškoti"}
      </button>
      {error && <p className="search-error">{error}</p>}
    </div>
  );
}

// -----------------------------
// Map Fly-To Controller
// -----------------------------
function MapController({ target, clearTarget }: { target: LatLng | null, clearTarget: () => void }) {
  const map = useMap();

  if (target) {
    map.flyTo(target, 16);
    clearTarget(); // prevent repeated flyTo
  }

  return null;
}


// -----------------------------
// Marker Component
// -----------------------------
function LocationMarker({
  setSelectedPlace,
  customIcon,
  externalPosition,
  openPanel,
}: LocationMarkerProps) {
  const [position, setPosition] = useState<LatLng | null>(null);

  const map = useMapEvents({
    click() {
      setSelectedPlace(null);
    },
    dblclick(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getMaxZoom());

      setSelectedPlace({
        latlng: e.latlng,
        name: "Pasirinkta vieta",
        description: "Čia bus detalus aprašymas",
      });

      openPanel();
    },
  });

    useEffect(() => {
      if (externalPosition) {
        setPosition(externalPosition);
        setSelectedPlace({
          latlng: externalPosition,
          name: "Paieškos rezultatas",
          description: "Adresas rastas pagal paiešką",
        });
        openPanel();
    }
    }, [externalPosition]);

  return position ? <Marker position={position} icon={customIcon} /> : null;
}

// -----------------------------
// Main Page Component
// -----------------------------
export default function MapPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const city = params.get("city") ?? "Nežinomas miestas";

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [elderships, setElderships] = useState<any[]>([]);
  const [crimeByEldership, setCrimeByEldership] = useState<any[]>([]);

  // User-selected crime categories
  const [selectedCrimes, setSelectedCrimes] = useState<Record<CrimeKey, boolean>>({
  asm: true,
  trv: true,
  nar: true,
});

  const loadElderships = async () => {
    if (elderships.length > 0) {
      setElderships([]);
      return;
    }
    const res = await fetch("http://localhost:5000/api/Eldership");
    const data = await res.json();
    setElderships(data);
  };

  const loadCrimeByEldership = async () => {
    if (crimeByEldership.length > 0) {
      setCrimeByEldership([]);
      return;
    }
    const res = await fetch("http://localhost:5000/api/Crimegrid/by-eldership");
    const data = await res.json();
    setCrimeByEldership(data);
  };

  const handleSearchResult = (lat: number, lng: number) => {
    const pos = new LatLng(lat, lng);
    setSearchTarget(pos);
    setPanelOpen(true);
  };

  // -----------------------------
  // Compute combined crime totals
  // -----------------------------
  const processedCrimeData = useMemo(() => {
    return crimeByEldership.map((e) => {
      const combined =
        (selectedCrimes.asm ? e.asm_Total : 0) +
        (selectedCrimes.trv ? e.trv_Total : 0) +
        (selectedCrimes.nar ? e.vtp_Total : 0);

      return { ...e, combined };
    });
  }, [crimeByEldership, selectedCrimes]);

  // Max value for normalization
  const maxValue = useMemo(() => {
    return Math.max(...processedCrimeData.map((e) => e.combined), 1);
  }, [processedCrimeData]);

  // Color scale
  function getCrimeColor(norm: number) {
    return norm > 0.8 ? "#800026" :
           norm > 0.6 ? "#BD0026" :
           norm > 0.4 ? "#E31A1C" :
           norm > 0.2 ? "#FC4E2A" :
           norm > 0.1 ? "#FD8D3C" :
                        "#FFEDA0";
  }

  // Kaunas bounding box
  const southWest = new LatLng(54.8077429, 23.7353223);
  const northEast = new LatLng(54.9594767, 24.0950162);
  const maxBoundArea = new LatLngBounds(southWest, northEast);

  return (
    <div className="map-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Atgal
      </button>

      <h2>{city}</h2>

      <SearchBar onResult={handleSearchResult} />

      {/* Crime selection UI */}
      <div className="crime-selector">
        <label>
          <input
            type="checkbox"
            checked={selectedCrimes.asm}
            onChange={() =>
              setSelectedCrimes({ ...selectedCrimes, asm: !selectedCrimes.asm })
            }
          />
          Asmens
        </label>

        <label>
          <input
            type="checkbox"
            checked={selectedCrimes.trv}
            onChange={() =>
              setSelectedCrimes({ ...selectedCrimes, trv: !selectedCrimes.trv })
            }
          />
          Turtas
        </label>

        <label>
          <input
            type="checkbox"
            checked={selectedCrimes.nar}
            onChange={() =>
              setSelectedCrimes({ ...selectedCrimes, nar: !selectedCrimes.nar })
            }
          />
          Narkotikai
        </label>
      </div>

      <button className="eldership-btn" onClick={loadElderships}>
        {elderships.length > 0 ? "Slėpti seniūnijas" : "Rodyti seniūnijas"}
      </button>
      <button className="eldership-btn" onClick={loadCrimeByEldership}>
        {crimeByEldership.length > 0 ? "Slėpti nusikalstamumą" : "Rodyti nusikalstamumą"}
      </button>

      <MapContainer
        center={[54.8951321, 23.9131496]}
        zoom={13}
        zoomControl={true}
        maxBounds={maxBoundArea}
        minZoom={12}
        maxZoom={18}
        scrollWheelZoom={true}
        className="map"
        doubleClickZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Eldership polygons */}
        {elderships.map((e, i) => (
          <GeoJSON
            key={i}
            data={JSON.parse(e.geometry)}
            style={{
              color: "#0077ff",
              weight: 3,
              fillOpacity: 0.2,
            }}
          />
        ))}

        {/* Crime intensity polygons */}
        {processedCrimeData.map((e, i) => (
          <GeoJSON
            key={"crime-" + i}
            data={JSON.parse(e.geometry)}
            style={{
              fillColor: getCrimeColor(e.combined / maxValue),
              color: "#333",
              weight: 2,
              fillOpacity: 0.6,
            }}
            onEachFeature={(_feature,layer) => {
              const selectedList = Object.keys(selectedCrimes)
                .filter((k) => selectedCrimes[k as CrimeKey])
                .join(", ");

            layer.bindPopup(`
              <strong>${e.eldership_Name}</strong><br>
              Pasirinkti nusikaltimai: ${selectedList}<br>
              Iš viso: ${e.combined}
              `);
            }}
          />
        ))}

        <LocationMarker
          setSelectedPlace={setSelectedPlace}
          customIcon={customIcon}
          externalPosition={searchTarget}
          openPanel={() => setPanelOpen(false)}
        />

        <MapController target={searchTarget} clearTarget={() => setSearchTarget(null)} />

      </MapContainer>

      {/* Slide-out panel */}
      {selectedPlace && (
        <div className={`side-panel ${panelOpen ? "open" : ""}`}>
          <button className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)}>
            {panelOpen ? "←" : "→"}
          </button>

          <div className="panel-content">
            <h2>Informacija apie vietą</h2>
            <p><strong>Adresas:</strong> {selectedPlace.name}</p>
            <p><strong>Koordinatės:</strong> {selectedPlace.latlng.lat}, {selectedPlace.latlng.lng}</p>

            <h3>Rizikos faktoriai</h3>
            <ul>
              <li>Nusikalstamumo lygis: dinamiškai apskaičiuojamas</li>
              <li>Užterštumas: žemas</li>
              <li>Triukšmo lygis: vidutinis</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
