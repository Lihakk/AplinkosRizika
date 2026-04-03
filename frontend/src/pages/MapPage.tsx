import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, Popup } from "react-leaflet";
import { Icon, LatLng, LatLngBounds, divIcon } from "leaflet";
import { Search, ArrowLeft, ShieldAlert, Map as MapIcon, X, School, Crosshair } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "./MapPage.css";

import LocationMarker from "../components/LocationMarker";
import RoutingControl from "../components/RoutingControl";
import WalkScore from "../components/WalkScore";
import { geocode } from "../utils/geocoding";

// --- Types ---
type CrimeKey = "asm" | "trv" | "nar";

interface BusStop {
  id: number;
  lat: number;
  lon: number;
  name: string;
}

interface SelectedPlace {
  latlng: LatLng;
  name: string;
}

// --- Config & Constants ---
const API_URL = import.meta.env.VITE_API_URL || "http://144.24.247.126:5000";
const customIcon = new Icon({ iconUrl: "./icons/placeholder.png", iconSize: [38, 38], iconAnchor: [19, 38] });

const busIcon = divIcon({
  html: '<div style="font-size: 24px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🚏</div>',
  className: 'bus-stop-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -20]
});

const cityCoordinates: Record<string, [number, number]> = {
  "Kaunas": [54.8985, 23.9036],
  "Vilnius": [54.6872, 25.2797],
  "Klaipėda": [55.7033, 21.1443],
  "Šiauliai": [55.9349, 23.3137],
  "Panevėžys": [55.7348, 24.3575]
};

const cityBounds = new LatLngBounds(
  [54.80450402603192, 23.741060247315946],  // south-west
  [55.00378796631874, 24.102934157560853],  // north-east
);

const schoolIcon = divIcon({
  html: '<div style="font-size: 22px;">🏫</div>',
  className: 'school-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

// --- Map Subcomponents ---
function MapController({ target, clearTarget }: { target: LatLng | null, clearTarget: () => void }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { animate: true, duration: 1.5 });
      clearTarget();
    }
  }, [target, map, clearTarget]);
  return null;
}

function CityViewController({ center }: { center: [number, number] }) {
  const map = useMap();
  const prevCenter = useRef(center);
  useEffect(() => {
    if (prevCenter.current[0] === center[0] && prevCenter.current[1] === center[1]) return;
    prevCenter.current = center;
    map.flyTo(center, 12, { animate: true, duration: 1.5 });
  }, [center, map]);
  return null;
}

export default function MapPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const city = params.get("city") ?? "Kaunas";
  const cityCenter = cityCoordinates[city] || cityCoordinates["Kaunas"];

  // --- State ---
  // UI State
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState({ elderships: false, crimes: false, search: false });

  // Routing State
  const [routeStart, setRouteStart] = useState<LatLng | null>(null);
  const [routeEnd, setRouteEnd] = useState<LatLng | null>(null);
  const [destQuery, setDestQuery] = useState("");
  const [pickingDest, setPickingDest] = useState(false);

  // Place info 
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  // Data State
  const [schools, setSchools] = useState<any[]>([]);
  const [elderships, setElderships] = useState<any[]>([]);
  const [crimeByEldership, setCrimeByEldership] = useState<any[]>([]);
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [stopArrivals, setStopArrivals] = useState<any[]>([]);
  const [stopRoutes, setStopRoutes] = useState<any[]>([]);
  const [selectedPath, setSelectedPath] = useState<any>(null);
  const [loadingArrivals, setLoadingArrivals] = useState(false);
  const [selectedCrimes, setSelectedCrimes] = useState<Record<CrimeKey, boolean>>({
    asm: true, trv: true, nar: true,
  });
  const [stopFrequency, setStopFrequency] = useState<any[]>([]);

  // --- Handlers ---
  const fetchNearbyBusStops = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`${API_URL}/api/Transport/nearby-stops?lat=${lat}&lon=${lng}`);
      const data = await res.json();
      setBusStops(data.map((stop: any) => {
        const geo = JSON.parse(stop.geometry);
        return { id: stop.id, lat: geo.coordinates[1], lon: geo.coordinates[0], name: stop.name || "Stotelė" };
      }));
    } catch (e) { console.error(e); }
  };

  const handleStopClick = async (lat: number, lon: number) => {
    setLoadingArrivals(true);
    setStopArrivals([]); 
    setStopRoutes([]);
    try {
      const arrRes = await fetch(`${API_URL}/api/Transport/stop-arrivals?lat=${lat}&lon=${lon}`);
      setStopArrivals(await arrRes.json());
      
      const routeRes = await fetch(`${API_URL}/api/Transport/stop-routes?lat=${lat}&lon=${lon}`);
      setStopRoutes(await routeRes.json());
      
      const freqRes = await fetch(`${API_URL}/api/Transport/stop-frequency?lat=${lat}&lon=${lon}`);
      setStopFrequency(await freqRes.json());
    } catch (e) { 
      console.error(e); 
    } finally { 
      setLoadingArrivals(false); 
    }
  };

  const handleShowPath = async (shapeId: string) => {
    if (!shapeId) return;
    setSelectedPath(null); 
    try {
      const res = await fetch(`${API_URL}/api/Transport/route-path/${shapeId}`);
      const data = await res.json();
      if (data.geometry) {
        setSelectedPath(JSON.parse(data.geometry)); 
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(p => ({ ...p, search: true }));
    try {
      const pos = await geocode(searchQuery);
      if (pos) {
        setSearchTarget(pos);
        setPanelOpen(true);
        fetchNearbyBusStops(pos.lat, pos.lng);
      }
    } catch (error) {
      console.error(error);
    } finally { 
      setIsLoading(p => ({ ...p, search: false })); 
    }
  };

  const handleRouteSearch = async () => {
    if (!searchQuery.trim() || !destQuery.trim()) return;
    setIsLoading(p => ({ ...p, search: true }));
    try {
      const start = await geocode(searchQuery);
      const end = await geocode(destQuery);
      if (start && end) {
        setSearchTarget(start);
        setRouteStart(start);
        setRouteEnd(end);
      }
    } catch (error) {
      console.error(error);
    } finally { 
      setIsLoading(p => ({ ...p, search: false })); 
    }
  };

  const clearRoute = () => {
    setRouteStart(null);
    setRouteEnd(null);
    setDestQuery("");
    setPickingDest(false);
  };

  const handleDestPicked = (latlng: LatLng, address: string) => {
    setRouteEnd(latlng);
    setDestQuery(address);
    setPickingDest(false);
    if (selectedPlace) {
      setRouteStart(selectedPlace.latlng);
    }
  };

  const handleDoubleClickResult = (latlng: LatLng, address: string) => {
    setSearchQuery(address);
    setSearchTarget(latlng);
    setRouteStart(null);
    setRouteEnd(null);
    setPanelOpen(true);
    fetchNearbyBusStops(latlng.lat, latlng.lng);
  };

  const handleClickClear = () => {
    setSearchQuery("");
    setDestQuery("");
    setSearchTarget(null);
    setRouteStart(null);
    setRouteEnd(null);
    setSelectedPlace(null);
    setPanelOpen(false);
    setBusStops([]);
  };

  const toggleElderships = async () => {
    if (elderships.length > 0) return setElderships([]);
    setIsLoading(p => ({ ...p, elderships: true }));
    try {
      const res = await fetch(`${API_URL}/api/Eldership`);
      setElderships(await res.json());
    } catch (e) { console.error(e); }
    setIsLoading(p => ({ ...p, elderships: false }));
  };

  const toggleCrimes = async () => {
    if (crimeByEldership.length > 0) return setCrimeByEldership([]);
    setIsLoading(p => ({ ...p, crimes: true }));
    try {
      const res = await fetch(`${API_URL}/api/Crimegrid/by-eldership`);
      setCrimeByEldership(await res.json());
    } catch (e) { console.error(e); }
    setIsLoading(p => ({ ...p, crimes: false }));
  };

const toggleSchools = async () => {
  if (schools.length > 0) return setSchools([]);
  try {
    const res = await fetch(`${API_URL}/api/School`);
    const raw = await res.json();
    const parsed = raw.map((s: any) => ({
      id: s.id,
      name: s.name,
      geo: JSON.parse(s.point) // GeoJSON point
    }));
    setSchools(parsed);
  } catch (err) {
    console.error(err);
  }
};

  // --- Computations ---
  const processedCrimeData = useMemo(() => {
    return crimeByEldership.map((e) => ({
      ...e,
      combined: (selectedCrimes.asm ? e.asm_Total : 0) + (selectedCrimes.trv ? e.trv_Total : 0) + (selectedCrimes.nar ? e.vtp_Total : 0)
    }));
  }, [crimeByEldership, selectedCrimes]);

  const maxValue = useMemo(() => Math.max(...processedCrimeData.map((e) => e.combined), 1), [processedCrimeData]);
  const getCrimeColor = (norm: number) => norm > 0.8 ? "#800026" : norm > 0.6 ? "#BD0026" : norm > 0.4 ? "#E31A1C" : norm > 0.2 ? "#FC4E2A" : "#FFEDA0";

  return (
    <div className={`map-page-container ${pickingDest ? "map-picking-dest" : ""}`}>

      {/* LEFT UI: Navigation & Search */}
      <div className="floating-ui top-left">
        <button className="glass-btn icon-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /> Atgal</button>
        <div className="glass-panel search-box">
          <input type="text" placeholder={`${city} adresas...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
          <button onClick={handleSearch} disabled={isLoading.search}>{isLoading.search ? "..." : <Search size={18} />}</button>
        </div>
        {selectedPlace && (
          <div className="glass-panel search-box">
            <input type="text" placeholder="Tikslo adresas..." value={destQuery} onChange={(e) => setDestQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRouteSearch()} />
            <button onClick={handleRouteSearch} disabled={isLoading.search}>{isLoading.search ? "..." : <Search size={18} />}</button>
            <button
              className={`pick-dest-btn ${pickingDest ? "active" : ""}`}
              onClick={() => setPickingDest(p => !p)}
              title="Pasirinkti tašką žemėlapyje"
            >
              <Crosshair size={18} />
            </button>
            {routeStart && <button className="clear-route-btn" onClick={clearRoute}><X size={14} /></button>}
          </div>
        )}
      </div>

      {/* RIGHT UI: Layer Controls */}
      <div className="floating-ui top-right">
        <div className="glass-panel layer-controls">
          <h3>Sluoksniai</h3>
          <button className={`layer-btn ${elderships.length ? 'active' : ''}`} onClick={toggleElderships}><MapIcon size={16} /> Seniūnijos</button>
          <button className={`layer-btn ${crimeByEldership.length ? 'active' : ''}`} onClick={toggleCrimes}><ShieldAlert size={16} /> Nusikalstamumas</button>
          <button className={`layer-btn ${schools.length ? 'active' : ''}`} onClick={toggleSchools}><School size={16} /> Mokyklos</button>

          {crimeByEldership.length > 0 && (
            <div className="crime-filters">
              <hr />
              <label><input type="checkbox" checked={selectedCrimes.asm} onChange={() => setSelectedCrimes(p => ({ ...p, asm: !p.asm }))} /> Asmens</label>
              <label><input type="checkbox" checked={selectedCrimes.trv} onChange={() => setSelectedCrimes(p => ({ ...p, trv: !p.trv }))} /> Turtas</label>
              <label><input type="checkbox" checked={selectedCrimes.nar} onChange={() => setSelectedCrimes(p => ({ ...p, nar: !p.nar }))} /> Narkotikai</label>
            </div>
          )}
        </div>
      </div>

      {/* MAP */}
      <div className="map-wrapper">
      <MapContainer center={cityCenter} zoom={12} zoomControl={false} doubleClickZoom={false} className="full-screen-map" maxBounds={cityBounds} maxBoundsViscosity={1.0} minZoom={12}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <CityViewController center={cityCenter} />

        {/* Routing overlay */}
        <RoutingControl start={routeStart} end={routeEnd} />

        {/* Location marker */}
        <LocationMarker
          customIcon={customIcon}
          externalPosition={searchTarget}
          onPlaceSelected={(place) => setSelectedPlace(place)}
          onDoubleClickResult={handleDoubleClickResult}
          onClickClear={handleClickClear}
          pickingDest={pickingDest}
          onDestPicked={handleDestPicked}
        />

        {/* 1. Selected Bus Path Line */}
        {selectedPath && <GeoJSON data={selectedPath} style={{ color: "#3b82f6", weight: 6, opacity: 0.8 }} />}

        {/* 2. Eldership Boundaries */}
        {elderships.map((e, i) => (
          <GeoJSON key={`eldership-${i}`} data={JSON.parse(e.geometry)} style={{ color: "#0077ff", weight: 2, fillOpacity: 0.05 }} />
        ))}

        {/* 3. Crime Heatmap */}
        {processedCrimeData.map((e, i) => (
          <GeoJSON 
            key={`crime-${i}`} 
            data={JSON.parse(e.geometry)} 
            style={{ fillColor: getCrimeColor(e.combined / maxValue), color: "white", weight: 1, fillOpacity: 0.6 }}
            onEachFeature={(_, layer) => layer.bindPopup(`<strong>${e.eldership_Name}</strong><br>Nusikaltimų: ${e.combined}`)}
          />
        ))}

        {/* 3. Schools */}
        {schools.map((s) => (
          <Marker
            key={s.id}
            position={[s.geo.coordinates[1], s.geo.coordinates[0]]}
            icon={schoolIcon}>
            <Popup>
              <strong>{s.name || "Mokykla"}</strong>
            </Popup>
          </Marker>
        ))}

        {/* 4. Bus Stops */}
        {busStops.map((stop) => (
          <Marker key={stop.id} position={[stop.lat, stop.lon]} icon={busIcon} eventHandlers={{ click: () => handleStopClick(stop.lat, stop.lon) }}>
            <Popup>
              <div className="bus-popup">
                <h3>{stop.name}</h3>
                <div className="popup-section">
                  <p className="section-title">🕒 Artimiausi atvykimai</p>
                  {loadingArrivals ? <p className="sub-text">Kraunama...</p> : stopArrivals.length > 0 ? (
                    <ul className="arrival-list">
                      {stopArrivals.map((a, idx) => (
                        <li key={idx} className="arrival-item" onClick={(e) => { e.stopPropagation(); handleShowPath(a.shapeId); }}>
                          <span className="route-badge">{a.route}</span> 
                          <div className="arrival-info">
                            <strong>{a.time.substring(0, 5)}</strong>
                            <span className="destination-text">{a.destination}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="sub-text">Atvykimų nerasta.</p>}
                </div>
                <hr className="popup-divider" />
                <div className="popup-section">
                  <p className="section-title">🚌 Visi maršrutai</p>
                  <div className="route-grid">
                    {stopRoutes.map((r, idx) => <div key={idx} className="route-tag" title={r.destination}>{r.route}</div>)}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapController target={searchTarget} clearTarget={() => setSearchTarget(null)} />
      </MapContainer>
      </div>

      {/* Path Clear Button */}
      {selectedPath && (
        <button className="clear-path-btn" onClick={() => setSelectedPath(null)}>
          <X size={16} /> Valyti maršrutą
        </button>
      )}

      {/* SIDE PANEL */}
      <div className={`side-panel ${panelOpen ? "open" : ""}`}>
        <button className="panel-close-btn" onClick={() => setPanelOpen(false)}>✕</button>
        <div className="panel-content">
          <h2>Vietos Analizė</h2>

          {/* Place info from marker */}
          {selectedPlace && (
            <div className="stat-card">
              <h3>Pasirinkta vieta</h3>
              <p className="place-address">{selectedPlace.name}</p>
              <p className="place-coords">
                {selectedPlace.latlng.lat.toFixed(5)}, {selectedPlace.latlng.lng.toFixed(5)}
              </p>
            </div>
          )}

          {/* WalkScore */}
          {selectedPlace && (
            <WalkScore latlng={selectedPlace.latlng} />
          )}

          {/* Transit stats */}
          <div className="stat-card">
            <h3>Viešasis transportas</h3>
            <p>Stotelės (750m): <strong>{busStops.length}</strong></p>
            
            <div className="stat-card" style={{ marginTop: "1rem" }}>
              <h3>Susisiekimo Intensyvumas</h3>  
              {stopFrequency.length > 0 ? (
                <>
                  <div className="main-stat">
                    <span className="stat-number">
                      {(stopFrequency.reduce((acc, curr) => acc + curr.count, 0) / stopFrequency.length).toFixed(1)}
                    </span>
                    <span className="stat-label">autobusai / valandą (vidurkis)</span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
