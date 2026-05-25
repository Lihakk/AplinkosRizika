import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, Popup } from "react-leaflet";
import { Icon, LatLng, LatLngBounds, divIcon } from "leaflet";
import { Search, ArrowLeft, ShieldAlert, Map as MapIcon, X, School, Crosshair } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "./MapPage.css";
import L from "leaflet";

import LocationMarker from "../components/LocationMarker";
import RoutingControl from "../components/RoutingControl";
import WalkScore from "../components/WalkScore";
import { geocode } from "../utils/geocoding";

// --- Types ---
type CrimeKey = "hp" | "th";

const SCHOOL_TYPES = ["pradine", "progimnazija", "gimnazija"] as const;

type SchoolType = (typeof SCHOOL_TYPES)[number];

const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  pradine: "Pradinė",
  progimnazija: "Progimnazija",
  gimnazija: "Gimnazija",
};

const normalizeSchoolType = (value: any): SchoolType | null => {
  if (!value) return null;
  const lower = String(value).toLowerCase().trim();
  if (lower.includes("prad")) return "pradine";
  if (lower.includes("prog")) return "progimnazija";
  if (lower.includes("gim")) return "gimnazija";
  return null;
};

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
const safeJsonParse = (data: any) => {
  if (!data) return null;
  if (typeof data === "string") {
    try { return JSON.parse(data); }
    catch { return null; }
  }
  return data;
};
const API_URL = import.meta.env.VITE_API_URL || "http://144.24.247.126:5178";
const customIcon = new Icon({ 
  iconUrl: "./icons/placeholder.png", 
  iconSize: [38, 38], 
  iconAnchor: [19, 38] 
});

const busIcon = divIcon({
  html: '<div style="font-size: 24px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🚏</div>',
  className: 'bus-stop-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -20]
});

const cityCoordinates: Record<string, [number, number]> = {
  "Kaunas": [54.8985, 23.9036],
  "Vilnius": [54.6872, 25.2797]
  //"Klaipėda": [55.7033, 21.1443],
  //"Šiauliai": [55.9349, 23.3137],
  //"Panevėžys": [55.7348, 24.3575]
};

const cityIds: Record<string, number> = {
  Kaunas: 1,
  Vilnius: 2,
};

const expandBounds = (bounds: LatLngBounds, factor: number) => {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const centerLat = (sw.lat + ne.lat) / 2;
  const centerLng = (sw.lng + ne.lng) / 2;
  const latHalf = (ne.lat - sw.lat) * factor / 2;
  const lngHalf = (ne.lng - sw.lng) * factor / 2;
  return new LatLngBounds(
    [centerLat - latHalf, centerLng - lngHalf],
    [centerLat + latHalf, centerLng + lngHalf]
  );
};

const cityBoundsMap: Record<string, LatLngBounds> = {
  Kaunas: expandBounds(
    new LatLngBounds(
      [54.80450402603192, 23.741060247315946],
      [55.00378796631874, 24.102934157560853]
    ),
    1.5
  ),
  Vilnius: expandBounds(
    new LatLngBounds(
      [54.6000, 24.8500],
      [54.8200, 25.4500]
    ),
    1.5
  )
};

const schoolIcon = divIcon({
  html: '<div style="font-size: 22px;">🏫</div>',
  className: 'school-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const MAP_FEATURES = [
  { id: 'health-facilities', label: '🏥 Ligoninės', icon: '🏥', color: '#ef4444' },
  { id: 'parks', label: '🌳 Parkai', icon: '🌳', color: '#10b981' },
  { id: 'playgrounds', label: '🛝 Aikštelės', icon: '🛝', color: '#f59e0b' },
  { id: 'shops', label: '🛒 Parduotuvės', icon: '🛒', color: '#3b82f6' },
  { id: 'gas-stations', label: '⛽ Degalinės', icon: '⛽', color: '#6366f1' },
  { id: 'sports-clubs', label: '🏋️ Sporto klubai', icon: '🏋️', color: '#8b5cf6' }
];
// Creates a beautiful circular marker with an emoji inside
const createFeatureIcon = (emoji: string, color: string) => {
  return divIcon({
    html: `<div style="background: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4); border: 2px solid white; font-size: 16px;">${emoji}</div>`,
    className: "custom-div-icon",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });
};

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContains(geom: any, lng: number, lat: number): boolean {
  if (!geom) return false;
  if (geom.type === "Feature") return geometryContains(geom.geometry, lng, lat);
  if (geom.type === "Polygon") {
    if (!pointInRing(lng, lat, geom.coordinates[0])) return false;
    for (let k = 1; k < geom.coordinates.length; k++) {
      if (pointInRing(lng, lat, geom.coordinates[k])) return false;
    }
    return true;
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly: number[][][]) => {
      if (!pointInRing(lng, lat, poly[0])) return false;
      for (let k = 1; k < poly.length; k++) {
        if (pointInRing(lng, lat, poly[k])) return false;
      }
      return true;
    });
  }
  return false;
}

const getFeatureCenter = (geometry: any): [number, number] | null => {
  if (!geometry || !geometry.coordinates) return null;
  
  if (geometry.type === "Point") {
    return [geometry.coordinates[1], geometry.coordinates[0]];
  }
  
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates[0];
    let latSum = 0, lonSum = 0;
    coords.forEach((c: any) => { lonSum += c[0]; latSum += c[1]; });
    return [latSum / coords.length, lonSum / coords.length];
  }

  if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates[0][0];
    let latSum = 0, lonSum = 0;
    coords.forEach((c: any) => { lonSum += c[0]; latSum += c[1]; });
    return [latSum / coords.length, lonSum / coords.length];
  }
  
  return null;
};

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

// --- PART 3: Find closest police ---
function findClosestPolice(userPos: L.LatLng, policeList: any[]) {
  let closest = null;
  let minDist = Infinity;

  for (const p of policeList) {
    const [lng, lat] = p.geo.coordinates;
    const pos = L.latLng(lat, lng);

    const dist = userPos.distanceTo(pos); // meters

    if (dist < minDist) {
      minDist = dist;
      closest = { ...p, distance: dist };
    }
  }

  return closest;
}

export default function MapPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawCity = params.get("city")?.trim() || "Kaunas";
  const city = cityCoordinates[rawCity] ? rawCity : "Kaunas";
  const cityId = cityIds[city] ?? 1;
  const cityCenter = cityCoordinates[city];
  const cityBounds = cityBoundsMap[city] || cityBoundsMap["Kaunas"];
  
  // --- Map reference ---
  const mapRef = useRef<L.Map | null>(null);

  // --- State ---
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState({ elderships: false, crimes: false, search: false });
  const [accessibilityData, setAccessibilityData] = useState<any>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  // Routing State
  const [routeStart, setRouteStart] = useState<LatLng | null>(null);
  const [routeEnd, setRouteEnd] = useState<LatLng | null>(null);
  const [destQuery, setDestQuery] = useState("");
  const [pickingDest, setPickingDest] = useState(false);
  const [routeProfile, setRouteProfile] = useState<'car' | 'bike' | 'foot'>('car');

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  // COMPARISON AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA lol
  const [isComparing, setIsComparing] = useState(false);
  const [place1Analysis, setPlace1Analysis] = useState<any>(null);
  const [place2Analysis, setPlace2Analysis] = useState<any>(null);
  const [place1WalkScore, setPlace1WalkScore] = useState<number | null>(null);
  const [place2WalkScore, setPlace2WalkScore] = useState<number | null>(null);
  const [place1CrimeScore, setPlace1CrimeScore] = useState<number | null>(null);
  const [place2CrimeScore, setPlace2CrimeScore] = useState<number | null>(null);
  const [compQuery1, setCompQuery1] = useState("");
  const [compQuery2, setCompQuery2] = useState("");
  const [compPlace1, setCompPlace1] = useState<SelectedPlace | null>(null);
  const [compPlace2, setCompPlace2] = useState<SelectedPlace | null>(null);

  const [schools, setSchools] = useState<any[]>([]);
  const [police, setPolice] = useState<any[]>([]);
  const [closestPolice, setClosestPolice] = useState<{ latlng: LatLng; name: string; distance: number } | null>(null);
  const [showingPolice, setShowingPolice] = useState(false);
  const [elderships, setElderships] = useState<any[]>([]);
  const [crimeByEldership, setCrimeByEldership] = useState<any[]>([]);
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [stopArrivals, setStopArrivals] = useState<any[]>([]);
  const [stopRoutes, setStopRoutes] = useState<any[]>([]);
  const [selectedPath, setSelectedPath] = useState<any>(null);
  const [loadingArrivals, setLoadingArrivals] = useState(false);
  const [selectedCrimes, setSelectedCrimes] = useState<Record<CrimeKey, boolean>>({
    hp: true, th: true,
  });
  const [selectedSchoolTypes, setSelectedSchoolTypes] = useState<Record<SchoolType, boolean>>({
    pradine: true,
    progimnazija: true,
    gimnazija: true,
  });
  const [minSchoolRating, setMinSchoolRating] = useState<number>(1);
  const [stopFrequency, setStopFrequency] = useState<any[]>([]);
  const [walkScoreValue, setWalkScoreValue] = useState<number | null>(null);

  // --- NEW STATE FOR ADDED FEATURES ---
  const [featureLayers, setFeatureLayers] = useState<Record<string, any[]>>({});
  const [activeFeatures, setActiveFeatures] = useState<Record<string, boolean>>({});
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);

  // --- CRIME ELDERSHIP POPUP STATE ---
  const [selectedCrimeEldership, setSelectedCrimeEldership] = useState<any>(null);
  const crimeLayerRef = useRef<any>(null);

  // --- PART 4: Show closest police ---
  const hidePolice = () => {
    setClosestPolice(null);
    setShowingPolice(false);
  };

  async function showClosestPolice(userPos: L.LatLng) {
    if (!mapRef.current) return;

    const policeData = police.length > 0 ? police : await loadPolice();
    if (!policeData || policeData.length === 0) return;

    const closest = findClosestPolice(userPos, policeData);
    if (!closest) return;

    const [lng, lat] = closest.geo.coordinates;
    const name = closest.name || "Policijos nuovada";

    setClosestPolice({
      latlng: L.latLng(lat, lng),
      name,
      distance: closest.distance,
    });
    setShowingPolice(true);

    mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });
  }

  useEffect(() => {
    if (!showingPolice) return;
    const target = selectedPlace?.latlng ?? searchTarget;
    if (target) {
      showClosestPolice(target);
    }
  }, [selectedPlace, searchTarget, showingPolice]);


  useEffect(() => {
    const fetchEvaluation = async () => {
      if (!selectedPlace) {
        setAccessibilityData(null);
        return;
      }
      setLoadingEval(true);
      try {
        const res = await fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${selectedPlace.latlng.lat}&lon=${selectedPlace.latlng.lng}`);
        if (res.ok) {
          setAccessibilityData(await res.json());
        }
      } catch (e) {
        console.error("Evaluation failed", e);
      } finally {
        setLoadingEval(false);
      }
    };

    fetchEvaluation();
  }, [selectedPlace]);

  // --- Handlers ---

  const toggleNewFeature = async (endpoint: string) => {
    if (activeFeatures[endpoint]) {
      setActiveFeatures(p => ({ ...p, [endpoint]: false }));
      return;
    }
    if (featureLayers[endpoint]?.length > 0) {
      setActiveFeatures(p => ({ ...p, [endpoint]: true }));
      return;
    }

    setIsLoading(p => ({ ...p, search: true }));
    try {
      const center = mapRef.current?.getCenter() || { lat: cityCenter[0], lng: cityCenter[1] };
      const res = await fetch(`${API_URL}/api/MapFeatures/${endpoint}?lat=${center.lat}&lon=${center.lng}`);
      const data = await res.json();
      
      const parsedData = data.map((item: any) => ({
        ...item,
        geometry: safeJsonParse(item.geometry)
      }));

      setFeatureLayers(p => ({ ...p, [endpoint]: parsedData }));
      setActiveFeatures(p => ({ ...p, [endpoint]: true }));
    } catch (e) {
      console.error(`Failed to load ${endpoint}`, e);
    } finally {
      setIsLoading(p => ({ ...p, search: false }));
    }
  };

  const fetchNearbyBusStops = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`${API_URL}/api/Transport/nearby-stops?lat=${lat}&lon=${lng}`);
      const data = await res.json();
      setBusStops(data.map((stop: any) => {
        const geo = safeJsonParse(stop.geometry);
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
      const arrData = await arrRes.json();
      setStopArrivals(Array.isArray(arrData) ? arrData : []);
      
      const routeRes = await fetch(`${API_URL}/api/Transport/stop-routes?lat=${lat}&lon=${lon}`);
      const routeData = await routeRes.json();
      setStopRoutes(Array.isArray(routeData) ? routeData : []);
      
      const freqRes = await fetch(`${API_URL}/api/Transport/stop-frequency?lat=${lat}&lon=${lon}`);
      const freqData = await freqRes.json();
      setStopFrequency(Array.isArray(freqData) ? freqData : []);
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
        setSelectedPath(safeJsonParse(data.geometry)); 
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
    hidePolice();
    setSearchQuery("");
    setDestQuery("");
    setSearchTarget(null);
    setRouteStart(null);
    setRouteEnd(null);
    setSelectedPlace(null);
    setPanelOpen(false);
    setBusStops([]);
  };

  //aaaaaaaaaaa comparison aaaaaaaaaaaaaa

  const startComparison = async () => {
    if (!compQuery1.trim() || !compQuery2.trim()) {
      alert("Pasirinkite abu taškus palyginimui");
      return;
    } 
    //setIsComparing(true);

    try {
      const [latlng1, latlng2] = await Promise.all([
        geocode(compQuery1),
        geocode(compQuery2)
      ]);

      if (!latlng1 || !latlng2) {
        alert("Nepavyko rasti vieno ar abiejų vietų. Įsitikinkite, kad įvedėte teisingus adresus.");
        return;
      }

      setCompPlace1({ latlng: latlng1, name: compQuery1 });
      setCompPlace2({ latlng: latlng2, name: compQuery2 });

      setIsComparing(true);

      const [res1, res2] = await Promise.all([
          fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${latlng1.lat}&lon=${latlng1.lng}`),
          fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${latlng2.lat}&lon=${latlng2.lng}`)
        ]);

      if (res1.ok) setPlace1Analysis(await res1.json());
      if (res2.ok) setPlace2Analysis(await res2.json());

      const calculateCrime = (lat: number, lng: number) => {
        if (processedCrimeData.length === 0) return null;
        const match = processedCrimeData.find((e) => {
          try { return geometryContains(safeJsonParse(e.geometry || e.Geometry), lng, lat); }
          catch { return false; }
        });
        if (!match) return null;
        return Math.round(100 - (match.combined / maxValue) * 100);
      };

      setPlace1CrimeScore(calculateCrime(latlng1.lat, latlng1.lng));
      setPlace2CrimeScore(calculateCrime(latlng2.lat, latlng2.lng));

    } catch (e) {
      console.error("Comparison fetch failed", e);
      alert("Įvyko klaida lyginant vietas.");
    }

    setTimeout(() =>{
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  };

  const toggleElderships = async () => {
    if (elderships.length > 0) return setElderships([]);
    setIsLoading(p => ({ ...p, elderships: true }));
    try {
      const res = await fetch(`${API_URL}/api/Eldership?cityId=${cityId}`);
      setElderships(await res.json());
    } catch (e) { console.error(e); }
    setIsLoading(p => ({ ...p, elderships: false }));
  };

  const toggleCrimes = async () => {
    if (crimeByEldership.length > 0) return setCrimeByEldership([]);
    setIsLoading(p => ({ ...p, crimes: true }));
    try {
      const res = await fetch(`${API_URL}/api/Crimegrid/by-eldership?cityId=${cityId}`);
      const data = await res.json();
      const normalized = Array.isArray(data) ? data.map((item: any) => {
        const geometry = safeJsonParse(item.Geometry ?? item.geometry);
        return {
          eldership_Id: item.Eldership_Id ?? item.eldership_Id ?? item.eldership_id,
          eldership_Name: item.Eldership_Name ?? item.eldership_Name ?? item.eldership_name ?? item.name ?? "",
          City_id: item.City_id ?? item.city_Id ?? item.cityId ?? item.city_id,
          Health_total: Number(item.Health ?? item.health_Total ?? item.Health_Total ?? item.Health_total ?? item.health_total ?? 0),
          Theft_total: Number(item.Theft ?? item.theft_Total ?? item.Theft_Total ?? item.Theft_total ?? item.theft_total ?? 0),
          All_total: Number(item.Total ?? item.all_Total ?? item.All_Total ?? item.All_total ?? item.all_total ?? 0),
          geometry,
          Geometry: geometry,
        };
      }) : [];
      setCrimeByEldership(normalized);
    } catch (e) { console.error(e); }
    setIsLoading(p => ({ ...p, crimes: false }));
  };


  const toggleSchools = async () => {
    if (schools.length > 0) return setSchools([]);
    try {
      const res = await fetch(`${API_URL}/api/School?cityId=${cityId}`);
      const raw = await res.json();
      const parsed = raw.map((s: any) => ({
        school_Id: s.school_id,
        name: s.name,
        rating: s.rating,
        type: normalizeSchoolType(s.Type ?? s.type ?? s.Tipas ?? s.tipas),
        location: safeJsonParse(s.location)
      }));
      setSchools(parsed);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPolice = async () => {
    if (police.length > 0) return police;
    try {
      const res = await fetch(`${API_URL}/api/Police`);
      const raw = await res.json();
      const parsed = raw.map((p: any) => ({
        id: p.id,
        name: p.name,
        geo: safeJsonParse(p.point)
      }));
      setPolice(parsed);
      return parsed;
    } catch (err) {
      console.error("Failed to load police", err);
      return [];
    }
  };

  // --- Computations ---
  const processedCrimeData = useMemo(() => {
    return crimeByEldership.map((e) => ({
      ...e,
      combined: (selectedCrimes.hp ? e.Health_total : 0) + (selectedCrimes.th ? e.Theft_total : 0)
    }));
  }, [crimeByEldership, selectedCrimes]);

  const maxValue = useMemo(() => Math.max(...processedCrimeData.map((e) => e.combined), 1), [processedCrimeData]);
  const getCrimeColor = (norm: number) => norm > 0.8 ? "#800026" : norm > 0.6 ? "#BD0026" : norm > 0.4 ? "#E31A1C" : norm > 0.2 ? "#FC4E2A" : "#FFEDA0";

  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const type = s.type as SchoolType | null;
      const rating = Number(s.rating ?? 0);
      return type !== null && selectedSchoolTypes[type] && rating >= minSchoolRating;
    });
  }, [schools, selectedSchoolTypes, minSchoolRating]);
  // Calculate crime total based on selected crime types
  const calculateCrimeTotal = (eldership: any) => {
    return (selectedCrimes.hp ? eldership.Health_total : 0) + (selectedCrimes.th ? eldership.Theft_total : 0);
  };

  // Open popup on the clicked layer with dynamic content based on selected crimes
  useEffect(() => {
    if (crimeLayerRef.current && selectedCrimeEldership) {
      const popupContent = `
        <div>
          <strong>${selectedCrimeEldership.eldership_Name}</strong>
          <br />
          Nusikaltimai: <strong>${calculateCrimeTotal(selectedCrimeEldership)}</strong>
        </div>
      `;
      crimeLayerRef.current.bindPopup(popupContent).openPopup();
      
      // Close popup when it's closed
      const closeHandler = () => setSelectedCrimeEldership(null);
      crimeLayerRef.current.on('popupclose', closeHandler);
      
      return () => {
        crimeLayerRef.current?.off('popupclose', closeHandler);
      };
    }
  }, [selectedCrimeEldership, selectedCrimes]);

  const crimeSafetyScore = useMemo<number | null>(() => {
    if (!selectedPlace || processedCrimeData.length === 0) return null;
    const { lat, lng } = selectedPlace.latlng;
    const match = processedCrimeData.find((e) => {
      try { return geometryContains(safeJsonParse(e.geometry || e.Geometry), lng, lat); }
      catch { return false; }
    });
    if (!match) return null;
    return Math.round(100 - (match.combined / maxValue) * 100);
  }, [selectedPlace, processedCrimeData, maxValue]);

  const qualityOfLifeScore = useMemo<number | null>(() => {
    const parts = [walkScoreValue, accessibilityData?.totalScore, crimeSafetyScore]
      .filter((v): v is number => typeof v === "number");
    if (parts.length === 0) return null;
    return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  }, [walkScoreValue, accessibilityData, crimeSafetyScore]);



  return (
    <div className={`map-page-container ${pickingDest ? "map-picking-dest" : ""}`}>

      {/* MAP */}
      <div className="map-wrapper">

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

        <div className="glass-panel profile-selector">
          <button 
            className={`profile-btn ${routeProfile === 'car' ? 'active' : ''}`} 
            onClick={() => setRouteProfile('car')}
            title="Automobilis"
          >Automobilis</button>
          <button 
            className={`profile-btn ${routeProfile === 'bike' ? 'active' : ''}`} 
            onClick={() => setRouteProfile('bike')}
            title="Dviratis"
          >Dviratis</button>
          <button 
            className={`profile-btn ${routeProfile === 'foot' ? 'active' : ''}`} 
            onClick={() => setRouteProfile('foot')}
            title="Pėsčiomis"
          >Pėsčiomis</button>
        </div>
      </div>
      

      {/* RIGHT UI: Layer Controls */}
      <div className={`floating-ui top-right ${layersPanelCollapsed ? 'collapsed' : ''}`}>
        <div className={`glass-panel layer-controls ${layersPanelCollapsed ? 'collapsed' : ''}`}>
          <div className="layer-controls-header">
            <h3>Sluoksniai</h3>
            <button
              className="collapse-panel-btn"
              onClick={() => setLayersPanelCollapsed((prev) => !prev)}
              title={layersPanelCollapsed ? 'Atidaryti sluoksnius' : 'Sumažinti sluoksnius'}
            >
              {layersPanelCollapsed ? '+' : '−'}
            </button>
          </div>

          {!layersPanelCollapsed && (
            <>
              <button className={`layer-btn ${elderships.length ? 'active' : ''}`} onClick={toggleElderships}><MapIcon size={16} /> Seniūnijos</button>
              <button className={`layer-btn ${crimeByEldership.length ? 'active' : ''}`} onClick={toggleCrimes}><ShieldAlert size={16} /> Nusikalstamumas</button>
              <button className={`layer-btn ${schools.length ? 'active' : ''}`} onClick={toggleSchools}><School size={16} /> Mokyklos</button>
              <button className={`layer-btn ${showingPolice ? 'active' : ''}`} onClick={() => {
                  if (showingPolice) {
                    hidePolice();
                    return;
                  }

                  if (selectedPlace) showClosestPolice(selectedPlace.latlng);
                  else if (searchTarget) showClosestPolice(searchTarget);
                  else alert("Pasirinkite vietą žemėlapyje");
                }}
              >
                {showingPolice ? '👮 Slėpti policiją' : '👮 Artimiausia policija'}
              </button>

              <hr style={{ margin: '10px 0', borderColor: 'rgba(0,0,0,0.1)' }} />
              
              {MAP_FEATURES.map(feature => (
                <button 
                  key={feature.id}
                  className={`layer-btn ${activeFeatures[feature.id] ? 'active' : ''}`} 
                  onClick={() => toggleNewFeature(feature.id)}
                >
                  {feature.label}
                </button>
              ))}

              {crimeByEldership.length > 0 && (
                <div className="crime-filters">
                  <hr />
                  <label><input type="checkbox" checked={selectedCrimes.hp} onChange={() => setSelectedCrimes(p => ({ ...p, hp: !p.hp }))} /> Sveikata</label>
                  <label><input type="checkbox" checked={selectedCrimes.th} onChange={() => setSelectedCrimes(p => ({ ...p, th: !p.th }))} /> Vagystės</label>
                </div>
              )}

              {schools.length > 0 && (
                <div className="school-filters">
                  <hr />
                  <div className="school-filter-group">
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Mokyklos tipas</div>
                    {SCHOOL_TYPES.map((type) => (
                      <label key={type}>
                        <input
                          type="checkbox"
                          checked={selectedSchoolTypes[type]}
                          onChange={() => setSelectedSchoolTypes(p => ({ ...p, [type]: !p[type] }))}
                        />
                        {SCHOOL_TYPE_LABELS[type]}
                      </label>
                    ))}
                  </div>
                  <div className="school-filter-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>Min. reitingas</span>
                      <select value={minSchoolRating} onChange={(e) => setMinSchoolRating(Number(e.target.value))}>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <MapContainer
          key={city}
          center={cityCenter}
          zoom={12}
          zoomControl={false}
          doubleClickZoom={false}
          className="full-screen-map"
          maxBounds={cityBounds}
          maxBoundsViscosity={1.0}
          minZoom={10}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          />
          <CityViewController center={cityCenter} />

          <RoutingControl start={routeStart} end={routeEnd} profile={routeProfile} />

          <LocationMarker
            customIcon={customIcon}
            externalPosition={searchTarget}
            onPlaceSelected={(place) => setSelectedPlace(place)}
            onDoubleClickResult={handleDoubleClickResult}
            onClickClear={handleClickClear}
            pickingDest={pickingDest}
            onDestPicked={handleDestPicked}
          />

          {selectedPath && <GeoJSON data={selectedPath} style={{ color: "#3b82f6", weight: 6, opacity: 0.8 }} />}

          {elderships.map((e, i) => (
            <GeoJSON key={`eldership-${i}`} data={safeJsonParse(e.geometry)} style={{ color: "#0077ff", weight: 2, fillOpacity: 0.05 }}
            onEachFeature={(_, layer) =>
                layer.bindPopup(
                  `<strong>${e.eldership_Name}</strong>`
                )}  />
          ))}
          
          {processedCrimeData.map((e, i) => (
            <GeoJSON
              key={`crime-${i}`}
              data={safeJsonParse(e.geometry || e.Geometry)}
              style={{
                fillColor: getCrimeColor(e.combined / maxValue),
                color: "#333",
                weight: 1.5,
                opacity: 0.8,
                fillOpacity: 0.55
              }}
              onEachFeature={(_, layer) => {
                const popupContent = `
                  <div>
                    <strong>${e.eldership_Name}</strong>
                    <br />
                    Nusikaltimai: <strong>${calculateCrimeTotal(e)}</strong>
                  </div>
                `;
                layer.bindPopup(popupContent);
                layer.on('click', () => {
                  crimeLayerRef.current = layer;
                  setSelectedCrimeEldership(e);
                });
              }}
            />
          ))}

          {MAP_FEATURES.map(config => {
            if (!activeFeatures[config.id] || !featureLayers[config.id]) return null;
            
            return featureLayers[config.id].map((feature: any, i: number) => {
              const centerPoint = getFeatureCenter(feature.geometry);
              if (!centerPoint) return null;

              return (
                <Marker 
                  key={`${config.id}-${feature.id}-${i}`} 
                  position={centerPoint}
                  icon={createFeatureIcon(config.icon, config.color)}
                >
                  <Popup>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '24px' }}>{config.icon}</span>
                      <h3 style={{ margin: '5px 0' }}>{feature.name || "Nežinomas objektas"}</h3>
                      <p style={{ margin: '0', color: '#666', fontSize: '12px', textTransform: 'capitalize' }}>
                        {feature.type || config.id}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              );
            });
          })}

          {/* 3. Schools */}
          {filteredSchools.map((s) => (
            <Marker
              key={s.school_Id}
              position={[s.location.coordinates[1], s.location.coordinates[0]]}
              icon={schoolIcon}
            >
              <Popup>
                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>{s.name || "Mokykla"}</div>
                <div style={{ fontSize: '13px', color: '#334155' }}>
                  Tipas: <strong>{s.type ? SCHOOL_TYPE_LABELS[s.type as SchoolType] : 'Nežinomas'}</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#334155' }}>
                  Reitingas: <strong>{Number(s.rating).toFixed(1)}</strong>
                </div>
              </Popup>
            </Marker>
          ))}

          {closestPolice && (
            <Marker
              position={closestPolice.latlng}
              icon={divIcon({
                html: '<div style="font-size: 22px;">👮‍♂️</div>',
                className: 'police-icon',
                iconSize: [24, 24],
                iconAnchor: [12, 24],
              })}
            >
              <Popup>
                <strong>{closestPolice.name}</strong><br />
              </Popup>
            </Marker>
          )}

          {/* 4. Bus Stops */}
          {busStops.map((stop) => (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lon]}
              icon={busIcon}
              eventHandlers={{ click: () => handleStopClick(stop.lat, stop.lon) }}
            >
              <Popup>
                <div className="bus-popup">
                  <h3>{stop.name}</h3>

                  <div className="popup-section">
                    <p className="section-title">🕒 Artimiausi atvykimai</p>
                    {loadingArrivals ? (
                      <p className="sub-text">Kraunama...</p>
                    ) : stopArrivals.length > 0 ? (
                      <ul className="arrival-list">
                        {stopArrivals.map((a, idx) => (
                          <li
                            key={idx}
                            className="arrival-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShowPath(a.shapeId);
                            }}
                          >
                            <span className="route-badge">{a.route}</span>
                            <div className="arrival-info">
                              <strong>{a.time.substring(0, 5)}</strong>
                              <span className="destination-text">
                                {a.destination}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="sub-text">Atvykimų nerasta.</p>
                    )}
                  </div>

                  <hr className="popup-divider" />

                  <div className="popup-section">
                    <p className="section-title">🚌 Visi maršrutai</p>
                    <div className="route-grid">
                      {stopRoutes.map((r, idx) => (
                        <div
                          key={idx}
                          className="route-tag"
                          title={r.destination}
                        >
                          {r.route}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Search marker */}
          {searchTarget && <Marker position={searchTarget} icon={customIcon} />}

          <MapController
            target={searchTarget}
            clearTarget={() => setSearchTarget(null)}
          />
        </MapContainer>

        {/* SIDE PANEL */}
      <div className={`side-panel ${panelOpen ? "open" : ""}`}>
        <button className="panel-close-btn" onClick={() => setPanelOpen(false)}>
          ✕
        </button>

        <div className="panel-content">
          <h2>Vietos Analizė</h2>

          {/* Place info */}
          {selectedPlace && (
            <div className="stat-card">
              <h3>Pasirinkta vieta</h3>
              <p className="place-address">{selectedPlace.name}</p>
              <p className="place-coords">
                {selectedPlace.latlng.lat.toFixed(5)},{" "}
                {selectedPlace.latlng.lng.toFixed(5)}
              </p>
            </div>
          )}

          {/* WalkScore */}
          {selectedPlace && <WalkScore latlng={selectedPlace.latlng} onScore={setWalkScoreValue} />}

          {/* Gyvenimo kokybės balas */}
          {selectedPlace && qualityOfLifeScore !== null && (
            <div className="stat-card" style={{ marginTop: '1rem' }}>
              <h3>Gyvenimo kokybės balas</h3>
              <p><strong>{qualityOfLifeScore}/100</strong></p>
            </div>
          )}

          {/* Transit stats */}
          <div className="stat-card">
            <h3>Viešasis transportas</h3>
            <p>
              Stotelės (750m): <strong>{busStops.length}</strong>
            </p>

            <div className="stat-card" style={{ marginTop: "1rem" }}>
              <h3>Susisiekimo Intensyvumas</h3>

              {stopFrequency.length > 0 ? (
                <>
                  <div className="main-stat">
                    <span className="stat-number">
                      {(
                        stopFrequency.reduce(
                          (acc, curr) => acc + curr.count,
                          0
                        ) / stopFrequency.length
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
          </div>
          {selectedPlace && (
            <div className="stat-card" style={{ marginTop: '1rem' }}>
              <h3>Pasiekiamumo Įvertinimas</h3>
              
              {loadingEval ? (
                <p>Skaičiuojami atstumai...</p>
              ) : accessibilityData ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <div style={{ 
                      fontSize: '32px', 
                      fontWeight: 'bold', 
                      color: accessibilityData.totalScore > 75 ? '#10b981' : accessibilityData.totalScore > 40 ? '#f59e0b' : '#ef4444' 
                    }}>
                      {accessibilityData.totalScore}/100
                    </div>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      Paskaičiuota pagal atstumus iki būtiniausių paslaugų.
                    </div>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {accessibilityData.features.map((feature: any, idx: number) => (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '20px' }}>{feature.icon}</span>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{feature.type}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{feature.name}</div>
                          </div>
                        </div>
                        <div style={{ fontWeight: 'bold', color: '#3b82f6', fontSize: '14px' }}>
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
          )}
        </div>
      </div>
      </div>

      {/* Path Clear Button */}
      {selectedPath && (
        <button className="clear-path-btn" onClick={() => setSelectedPath(null)}>
          <X size={16} /> Valyti maršrutą
        </button>
      )}

      

              {/* --- COMPARISON DASHBOARD --- */}
        <div className="comparison-dashboard" style={{ padding: '60px 40px', background: '#f1f5f9', borderTop: '2px solid#cbd5e1' }}>
           <div style={{ textAlign: 'center', marginBottom: '40px' }}>
             <h2 style={{ fontSize: '2rem', color: '#1e293b' }}>Veiklos Analizė</h2>
             <p style={{ color: '#64748b' }}>Palyginkite dvi vietas pagal pasiekiamumą ir saugumą</p>
           </div>
    
          {/* Search & Action Row */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '60px' }}>
            
            <div className="glass-panel search-box" style={{ width: '300px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
              <input 
                type="text" 
                placeholder="Pirmo adreso paieška..." 
                value={compQuery1} 
                onChange={(e) => setCompQuery1(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startComparison()}
                style={{ width: '100%', padding: '4px' }}
              />
            </div>
  
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#cbd5e1' }}>VS</div>
  
            <div className="glass-panel search-box" style={{ width: '300px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
              <input 
                type="text" 
                placeholder="Antro adreso paieška..." 
                value={compQuery2} 
                onChange={(e) => setCompQuery2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startComparison()}
                style={{ width: '100%', padding: '4px' }}
              />
            </div>
  
            <button 
              className="glass-btn" 
              onClick={startComparison}
              disabled={!compQuery1.trim() || !compQuery2.trim()}
              style={{ 
                background: (!compQuery1.trim() || !compQuery2.trim()) ? '#cbd5e1' : '#3b82f6', 
                color: 'white', 
                padding: '14px 28px',
                fontSize: '1rem',
                boxShadow: '0 10px 15px -3px rgb(59 130 246 / 0.3)'
              }}
            >
              📊 Palyginti
            </button>
          </div>
   
          {/* Hidden WalkScore fetchers */}
          {isComparing && compPlace1 && (
            <div style={{ display: 'none' }}>
              <WalkScore latlng={compPlace1.latlng} onScore={setPlace1WalkScore} />
            </div>
          )}
          {isComparing && compPlace2 && (
            <div style={{ display: 'none' }}>
              <WalkScore latlng={compPlace2.latlng} onScore={setPlace2WalkScore} />
            </div>
          )}

          {/* Result Columns */}
          {isComparing && (
            <div style={{ display: 'flex', gap: '30px', maxWidth: '1200px', margin: '0 auto' }}>
              {/* Column 1 */}
              <div className="glass-panel" style={{ flex: 1, borderTop: '4px solid #3b82f6' }}>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>{compPlace1?.name}</h3>
                
                {/* --- THE BIG SUMMARY SCORES --- */}
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                  <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Pasiekiamumas</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{place1Analysis?.totalScore || 0}</div>
                  </div>
                  
                  <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Saugumas</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: place1CrimeScore && place1CrimeScore > 50 ? '#10b981' : '#ef4444' }}>
                      {place1CrimeScore !== null ? place1CrimeScore : 'N/A'}
                    </div>
                  </div>
              
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#1e40af', textTransform: 'uppercase', fontWeight: 'bold' }}>Gyvenimo Kokybė</div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#1d4ed8' }}>
                      {Math.round(((place1Analysis?.totalScore || 0) + (place1WalkScore || 0) + (place1CrimeScore || 0)) / 3) || 0}
                    </div>
                  </div>
                </div>

                {place1Analysis && (
                  <div className="analysis-results">
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {place1Analysis.features.map((f: any, i: number) => (
                        <li key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>{f.icon}</span>
                            <span>{f.type}</span>
                          </span>
                          <span style={{ fontWeight: 'bold', color: '#64748b' }}>
                            {f.distance < 1000 ? `${Math.round(f.distance)} m` : `${(f.distance / 1000).toFixed(1)} km`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Column 2 */}
              <div className="glass-panel" style={{ flex: 1, borderTop: '4px solid #ef4444'  }}>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>{compPlace2?.name}</h3>
                
                {/* --- THE BIG SUMMARY SCORES --- */}
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                  <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Pasiekiamumas</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>{place2Analysis?.totalScore || 0}</div>
                  </div>
                  
                  <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Saugumas</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: place2CrimeScore && place2CrimeScore > 50 ? '#10b981' : '#ef4444' }}>
                      {place2CrimeScore !== null ? place2CrimeScore : 'N/A'}
                    </div>
                  </div>
              
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#b91c1c', textTransform: 'uppercase', fontWeight: 'bold' }}>Gyvenimo Kokybė</div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#b91c1c' }}>
                      {Math.round(((place2Analysis?.totalScore || 0) + (place2WalkScore || 0) + (place2CrimeScore || 0)) / 3) || 0}
                    </div>
                  </div>
                </div>

                {place2Analysis && (
                  <div className="analysis-results">
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {place2Analysis.features.map((f: any, i: number) => (
                        <li key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>{f.icon}</span>
                            <span>{f.type}</span>
                          </span>
                          <span style={{ fontWeight: 'bold', color: '#64748b' }}>
                            {f.distance < 1000 ? `${Math.round(f.distance)} m` : `${(f.distance / 1000).toFixed(1)} km`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
    </div>



    </div>
  );
}


