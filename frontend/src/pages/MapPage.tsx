import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import "./MapPage.css";

import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";

import { Icon, LatLng, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

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

const customIcon = new Icon({
  iconUrl: "./icons/placeholder.png",
  iconSize: [38, 38],
});

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
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          query
        )}&format=json&limit=1`,
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

function MapController({ target }: { target: LatLng | null }) {
  const map = useMap();
  if (target) {
    map.flyTo(target, 16);
  }
  return null;
}

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

  // If search result arrives → override marker position
  if (externalPosition && (!position || !position.equals(externalPosition))) {
    setPosition(externalPosition);
    setSelectedPlace({
      latlng: externalPosition,
      name: "Paieškos rezultatas",
      description: "Adresas rastas pagal paiešką",
    });
    openPanel();
  }

  return position ? <Marker position={position} icon={customIcon} /> : null;
}

export default function MapPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const city = params.get("city") ?? "Nežinomas miestas";

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleSearchResult = (lat: number, lng: number) => {
    const pos = new LatLng(lat, lng);
    setSearchTarget(pos);
    setPanelOpen(true);
  };

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

        <LocationMarker
          setSelectedPlace={setSelectedPlace}
          customIcon={customIcon}
          externalPosition={searchTarget}
          openPanel={() => setPanelOpen(false)}
        />

        <MapController target={searchTarget} />
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
              <li>Nusikalstamumo lygis: vidutinis</li>
              <li>Užterštumas: žemas</li>
              <li>Triukšmo lygis: vidutinis</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
