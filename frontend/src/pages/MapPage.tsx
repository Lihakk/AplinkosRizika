import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, Popup } from "react-leaflet";
import { Icon, LatLng, LatLngBounds, divIcon } from "leaflet";
import { Search, ArrowLeft, ShieldAlert, Map as MapIcon, X, School, Crosshair, ExternalLink } from "lucide-react";
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
  html: '<div style="font-size: 24px; text-shadow: 0 4px 10px rgba(0,0,0,0.2); filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.2));">🚏</div>',
  className: 'bus-stop-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -20]
});

const cityCoordinates: Record<string, [number, number]> = {
  "Kaunas": [54.8985, 23.9036],
  "Vilnius": [54.6872, 25.2797]
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
  html: '<div style="font-size: 22px; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.2));">🏫</div>',
  className: 'school-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const MAP_FEATURES = [
  { id: 'health-facilities', label: 'Ligoninės', icon: '🏥', color: '#ef4444' },
  { id: 'parks', label: 'Parkai', icon: '🌳', color: '#10b981' },
  { id: 'playgrounds', label: 'Aikštelės', icon: '🛝', color: '#f59e0b' },
  { id: 'shops', label: 'Parduotuvės', icon: '🛒', color: '#3b82f6' },
  { id: 'gas-stations', label: 'Degalinės', icon: '⛽', color: '#6366f1' },
  { id: 'sports-clubs', label: 'Sporto klubai', icon: '🏋️', color: '#8b5cf6' },
  { id: 'real-estate', label: '🏠 Skelbimai', icon: '🏠', color: '#10b981' }
];

const createFeatureIcon = (emoji: string, color: string) => {
  return divIcon({
    html: `<div style="background: ${color}; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2); border: 2.5px solid white; font-size: 18px; transition: transform 0.2s;">${emoji}</div>`,
    className: "custom-div-icon",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
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

function findClosestPolice(userPos: L.LatLng, policeList: any[]) {
  let closest = null;
  let minDist = Infinity;

  for (const p of policeList) {
    const [lng, lat] = p.geo.coordinates;
    const pos = L.latLng(lat, lng);
    const dist = userPos.distanceTo(pos);

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
  const cityCenter = cityCoordinates[city];
  const cityBounds = cityBoundsMap[city] || cityBoundsMap["Kaunas"];
  
  const mapRef = useRef<L.Map | null>(null);

  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState({ elderships: false, crimes: false, search: false });
  const [accessibilityData, setAccessibilityData] = useState<any>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [routeStart, setRouteStart] = useState<LatLng | null>(null);
  const [routeEnd, setRouteEnd] = useState<LatLng | null>(null);
  const [destQuery, setDestQuery] = useState("");
  const [pickingDest, setPickingDest] = useState(false);
  const [routeProfile, setRouteProfile] = useState<'car' | 'bike' | 'foot'>('car');

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

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

  const [featureLayers, setFeatureLayers] = useState<Record<string, any[]>>({});
  const [activeFeatures, setActiveFeatures] = useState<Record<string, boolean>>({});

  const [selectedCrimeEldership, setSelectedCrimeEldership] = useState<any>(null);
  const crimeLayerRef = useRef<any>(null);

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

    setClosestPolice({ latlng: L.latLng(lat, lng), name, distance: closest.distance });
    setShowingPolice(true);
    mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });
  }

  useEffect(() => {
    if (!showingPolice) return;
    const target = selectedPlace?.latlng ?? searchTarget;
    if (target) showClosestPolice(target);
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
        if (res.ok) setAccessibilityData(await res.json());
      } catch (e) {
        console.error("Evaluation failed", e);
      } finally {
        setLoadingEval(false);
      }
    };
    fetchEvaluation();
  }, [selectedPlace]);

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
      if (data.geometry) setSelectedPath(safeJsonParse(data.geometry)); 
    } catch (e) { console.error(e); }
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
    } catch (error) { console.error(error); } 
    finally { setIsLoading(p => ({ ...p, search: false })); }
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
    } catch (error) { console.error(error); } 
    finally { setIsLoading(p => ({ ...p, search: false })); }
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
    if (selectedPlace) setRouteStart(selectedPlace.latlng);
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

  const startComparison = async () => {
    if (!compQuery1.trim() || !compQuery2.trim()) {
      alert("Pasirinkite abu taškus palyginimui");
      return;
    } 

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
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
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
      const res = await fetch(`${API_URL}/api/School`);
      const raw = await res.json();
      const parsed = raw.map((s: any) => ({
        school_Id: s.school_id,
        name: s.name,
        rating: s.rating,
        type: normalizeSchoolType(s.Type ?? s.type ?? s.Tipas ?? s.tipas),
        location: safeJsonParse(s.location)
      }));
      setSchools(parsed);
    } catch (err) { console.error(err); }
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
  
  const calculateCrimeTotal = (eldership: any) => {
    return (selectedCrimes.hp ? eldership.Health_total : 0) + (selectedCrimes.th ? eldership.Theft_total : 0);
  };

  useEffect(() => {
    if (crimeLayerRef.current && selectedCrimeEldership) {
      const popupContent = `
        <div style="font-family: 'Inter', sans-serif;">
          <strong style="font-size:16px;">${selectedCrimeEldership.eldership_Name}</strong>
          <br />
          <span style="color:#64748b; font-size:13px;">Nusikaltimai:</span> <strong style="color:#ef4444;">${calculateCrimeTotal(selectedCrimeEldership)}</strong>
        </div>
      `;
      crimeLayerRef.current.bindPopup(popupContent).openPopup();
      
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
          <button className="glass-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> Atgal
          </button>
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
            <button className={`profile-btn ${routeProfile === 'car' ? 'active' : ''}`} onClick={() => setRouteProfile('car')} title="Automobilis">🚗 Automobilis</button>
            <button className={`profile-btn ${routeProfile === 'bike' ? 'active' : ''}`} onClick={() => setRouteProfile('bike')} title="Dviratis">🚲 Dviratis</button>
            <button className={`profile-btn ${routeProfile === 'foot' ? 'active' : ''}`} onClick={() => setRouteProfile('foot')} title="Pėsčiomis">🚶‍♂️ Pėsčiomis</button>
          </div>
        </div>
      
        {/* RIGHT UI: Layer Controls */}
        <div className="floating-ui top-right">
          <div className="glass-panel layer-controls">
            <h3>Sluoksniai</h3>
            <button className={`layer-btn ${elderships.length ? 'active' : ''}`} onClick={toggleElderships}><MapIcon size={18} /> Seniūnijos</button>
            <button className={`layer-btn ${crimeByEldership.length ? 'active' : ''}`} onClick={toggleCrimes}><ShieldAlert size={18} /> Nusikalstamumas</button>
            <button className={`layer-btn ${schools.length ? 'active' : ''}`} onClick={toggleSchools}><School size={18} /> Mokyklos</button>
            <button className={`layer-btn ${showingPolice ? 'active' : ''}`} onClick={() => {
                if (showingPolice) hidePolice();
                else if (selectedPlace) showClosestPolice(selectedPlace.latlng);
                else if (searchTarget) showClosestPolice(searchTarget);
                else alert("Pasirinkite vietą žemėlapyje");
              }}
            >
              👮 {showingPolice ? 'Slėpti policiją' : 'Artimiausia policija'}
            </button>

            <hr style={{ margin: '16px 0', borderColor: '#e2e8f0', borderTop: '1px solid' }} />
            
            {MAP_FEATURES.map(feature => (
              <button 
                key={feature.id}
                className={`layer-btn ${activeFeatures[feature.id] ? 'active' : ''}`} 
                onClick={() => toggleNewFeature(feature.id)}
              >
                <span className="text-lg">{feature.icon}</span> {feature.label}
              </button>
            ))}

            {crimeByEldership.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200 text-sm flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 hover:text-slate-900"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={selectedCrimes.hp} onChange={() => setSelectedCrimes(p => ({ ...p, hp: !p.hp }))} /> Sveikata</label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 hover:text-slate-900"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={selectedCrimes.th} onChange={() => setSelectedCrimes(p => ({ ...p, th: !p.th }))} /> Vagystės</label>
              </div>
            )}

            {schools.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200 text-sm">
                <div className="flex flex-col gap-2 mb-4">
                  <div className="font-semibold text-slate-900 mb-1">Mokyklos tipas</div>
                  {SCHOOL_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900">
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={selectedSchoolTypes[type]} onChange={() => setSelectedSchoolTypes(p => ({ ...p, [type]: !p[type] }))} />
                      {SCHOOL_TYPE_LABELS[type]}
                    </label>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between font-semibold text-slate-900">
                    <span>Min. reitingas</span>
                    <select className="bg-slate-50 border border-slate-200 text-slate-900 rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-1.5" value={minSchoolRating} onChange={(e) => setMinSchoolRating(Number(e.target.value))}>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
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
            <GeoJSON key={`eldership-${i}`} data={safeJsonParse(e.geometry)} style={{ color: "#3b82f6", weight: 2, fillOpacity: 0.03, dashArray: '5, 5' }}
            onEachFeature={(_, layer) => layer.bindPopup(`<strong style="font-family:'Inter',sans-serif;font-size:15px;">${e.eldership_Name}</strong>`)}  />
          ))}
          
          {processedCrimeData.map((e, i) => (
            <GeoJSON
              key={`crime-${i}`}
              data={safeJsonParse(e.geometry || e.Geometry)}
              style={{ fillColor: getCrimeColor(e.combined / maxValue), color: "white", weight: 1.5, opacity: 0.9, fillOpacity: 0.6 }}
              onEachFeature={(_, layer) => {
                layer.on('click', () => { crimeLayerRef.current = layer; setSelectedCrimeEldership(e); });
              }}
            />
          ))}

          {MAP_FEATURES.map(config => {
            if (!activeFeatures[config.id] || !featureLayers[config.id]) return null;
            return featureLayers[config.id].map((feature: any, i: number) => {
              const centerPoint = getFeatureCenter(feature.geometry);
              if (!centerPoint) return null;
              return (
                <Marker key={`${config.id}-${feature.id}-${i}`} position={centerPoint} icon={createFeatureIcon(config.icon, config.color)}>
                  <Popup>
                    <div style={{ textAlign: 'center', fontFamily: "'Inter', sans-serif", padding: '4px' }}>
                      <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}>{config.icon}</span>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#0f172a' }}>{feature.name || "Nežinomas objektas"}</h3>
                      <p style={{ margin: '0', color: '#64748b', fontSize: '12px', textTransform: 'capitalize', fontWeight: 500 }}>{feature.type || config.id}</p>
                    </div>
                  </Popup>
                </Marker>
              );
            });
          })}

          {filteredSchools.map((s) => (
            <Marker key={s.school_Id} position={[s.location.coordinates[1], s.location.coordinates[0]]} icon={schoolIcon}>
              <Popup>
                <div style={{ fontFamily: "'Inter', sans-serif" }}>
                  <div style={{ fontWeight: '800', fontSize: '14px', marginBottom: 8, color: '#0f172a' }}>{s.name || "Mokykla"}</div>
                  <div style={{ fontSize: '13px', color: '#475569', marginBottom: 4 }}>Tipas: <strong style={{ color: '#0f172a' }}>{s.type ? SCHOOL_TYPE_LABELS[s.type as SchoolType] : 'Nežinomas'}</strong></div>
                  <div style={{ fontSize: '13px', color: '#475569' }}>Reitingas: <strong style={{ color: '#3b82f6' }}>{Number(s.rating).toFixed(1)}</strong></div>
                </div>
              </Popup>
            </Marker>
          ))}

          {closestPolice && (
            <Marker position={closestPolice.latlng} icon={divIcon({ html: '<div style="font-size: 26px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2));">👮‍♂️</div>', className: 'police-icon', iconSize: [28, 28], iconAnchor: [14, 28] })}>
              <Popup><strong style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>{closestPolice.name}</strong></Popup>
            </Marker>
          )}

          {busStops.map((stop) => (
            <Marker key={stop.id} position={[stop.lat, stop.lon]} icon={busIcon} eventHandlers={{ click: () => handleStopClick(stop.lat, stop.lon) }}>
              <Popup>
                <div className="bus-popup" style={{ fontFamily: "'Inter', sans-serif" }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>{stop.name}</h3>
                  <div className="popup-section">
                    <p className="text-xs font-bold uppercase text-slate-500 mb-2">🕒 Artimiausi atvykimai</p>
                    {loadingArrivals ? <p className="text-sm text-slate-400 italic">Kraunama...</p> : stopArrivals.length > 0 ? (
                      <ul className="flex flex-col gap-1 p-0 m-0 list-none">
                        {stopArrivals.map((a, idx) => (
                          <li key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); handleShowPath(a.shapeId); }}>
                            <span className="bg-blue-600 text-white font-bold text-xs py-1 px-2 rounded">{a.route}</span>
                            <div className="flex flex-col">
                              <strong className="text-slate-900 text-sm leading-tight">{a.time.substring(0, 5)}</strong>
                              <span className="text-slate-500 text-xs leading-tight truncate max-w-[120px]">{a.destination}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-slate-400 italic">Atvykimų nerasta.</p>}
                  </div>
                  <hr className="my-3 border-slate-200" />
                  <div className="popup-section">
                    <p className="text-xs font-bold uppercase text-slate-500 mb-2">🚌 Visi maršrutai</p>
                    <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                      {stopRoutes.map((r, idx) => (
                        <div key={idx} className="bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold py-0.5 px-2 rounded" title={r.destination}>{r.route}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {searchTarget && <Marker position={searchTarget} icon={customIcon} />}
          <MapController target={searchTarget} clearTarget={() => setSearchTarget(null)} />
        </MapContainer>

        {/* SIDE PANEL */}
        <div className={`side-panel ${panelOpen ? "open" : ""}`}>
          <button className="panel-close-btn" onClick={() => setPanelOpen(false)}>✕</button>

          <div className="panel-content">
          <div className="flex items-center justify-between mb-6">
            <h2 className="m-0 text-xl font-black">Vietos Analizė</h2>
            {selectedPlace && (
              <button 
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2 text-xs font-bold"
                onClick={() => navigate(`/analysis?lat=${selectedPlace.latlng.lat}&lon=${selectedPlace.latlng.lng}&address=${encodeURIComponent(selectedPlace.name)}`)}
              >
                <ExternalLink size={14} /> Atidaryti pilną
              </button>
            )}
          </div>
            {selectedPlace && (
              <div className="stat-card">
                <h3>Pasirinkta vieta</h3>
                <p className="place-address">{selectedPlace.name}</p>
                <p className="place-coords">{selectedPlace.latlng.lat.toFixed(5)}, {selectedPlace.latlng.lng.toFixed(5)}</p>
              </div>
            )}

            {selectedPlace && <WalkScore latlng={selectedPlace.latlng} onScore={setWalkScoreValue} />}

            {selectedPlace && qualityOfLifeScore !== null && (
              <div className="stat-card bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                <h3 className="text-blue-800">Gyvenimo kokybės balas</h3>
                <p className="text-4xl font-black text-blue-600 m-0">{qualityOfLifeScore}<span className="text-xl text-blue-400 font-medium">/100</span></p>
              </div>
            )}

            <div className="stat-card">
              <h3>Viešasis transportas</h3>
              <p className="text-sm text-slate-600 mb-4">Stotelės (750m): <strong className="text-slate-900 text-base ml-1">{busStops.length}</strong></p>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <h3 className="mb-2">Susisiekimo Intensyvumas</h3>
                {stopFrequency.length > 0 ? (
                  <>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-3xl font-black text-indigo-600">
                        {(stopFrequency.reduce((acc, curr) => acc + curr.count, 0) / stopFrequency.length).toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">autob. / val.</span>
                    </div>
                    <div className="flex items-end h-16 gap-1 border-b border-slate-200 mt-2">
                      {stopFrequency.map((f, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center h-full group relative">
                          <div className="w-full bg-indigo-500 rounded-t-sm transition-all duration-300 group-hover:bg-indigo-400" style={{ height: `${Math.max(4, (f.count / 15) * 100)}%` }} />
                          <span className="text-[9px] text-slate-400 mt-1 font-medium">{f.hour}</span>
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none transition-opacity z-10 whitespace-nowrap">
                            {f.count} autob.
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-sm text-slate-500 italic m-0">Pasirinkite stotelę, kad pamatytumėte grafiką.</p>}
              </div>
            </div>

            {selectedPlace && (
              <div className="stat-card">
                <h3>Pasiekiamumo Įvertinimas</h3>
                {loadingEval ? (
                  <p className="text-sm text-slate-500 animate-pulse">Skaičiuojami atstumai...</p>
                ) : accessibilityData ? (
                  <>
                    <div className="flex items-center gap-4 mb-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className={`text-4xl font-black ${accessibilityData.totalScore > 75 ? 'text-emerald-500' : accessibilityData.totalScore > 40 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {accessibilityData.totalScore}
                      </div>
                      <div className="text-xs text-slate-500 font-medium leading-relaxed">Paskaičiuota pagal atstumus iki būtiniausių paslaugų (iki 1km).</div>
                    </div>
                    <ul className="flex flex-col gap-2.5 p-0 m-0 list-none">
                      {accessibilityData.features.map((feature: any, idx: number) => (
                        <li key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl bg-slate-50 p-1.5 rounded-lg">{feature.icon}</span>
                            <div>
                              <div className="font-bold text-sm text-slate-900 leading-tight">{feature.type}</div>
                              <div className="text-xs text-slate-500 truncate max-w-[140px] mt-0.5">{feature.name}</div>
                            </div>
                          </div>
                          <div className="font-black text-blue-600 text-sm bg-blue-50 py-1 px-2 rounded-lg">
                            {feature.distance < 1000 ? `${Math.round(feature.distance)} m` : `${(feature.distance / 1000).toFixed(1)} km`}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <p className="text-sm text-slate-500">Nepavyko gauti vertinimo duomenų.</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPath && (
        <button className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-900/90 backdrop-blur text-white px-5 py-2.5 rounded-full font-semibold shadow-xl flex items-center gap-2 hover:bg-slate-800 transition-all z-[1000]" onClick={() => setSelectedPath(null)}>
          <X size={18} /> Uždaryti maršrutą
        </button>
      )}

      {/* --- COMPARISON DASHBOARD --- */}
      <div className="comparison-dashboard">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">Veiklos Analizė</h2>
          <p className="text-lg text-slate-500 font-medium">Palyginkite dvi vietas pagal pasiekiamumą ir saugumą</p>
        </div>

        <div className="flex flex-col md:flex-row justify-center items-center gap-6 mb-16">
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-2 w-full md:w-[320px] flex items-center transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
            <input type="text" placeholder="Pirmo adreso paieška..." value={compQuery1} onChange={(e) => setCompQuery1(e.target.value)} onKeyDown={(e) => e.key === "Enter" && startComparison()} className="w-full bg-transparent border-none outline-none px-3 py-2 text-slate-900 font-medium placeholder-slate-400" />
          </div>

          <div className="text-sm font-black text-slate-300 bg-slate-100 rounded-full px-4 py-2 uppercase tracking-widest">VS</div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-2 w-full md:w-[320px] flex items-center transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
            <input type="text" placeholder="Antro adreso paieška..." value={compQuery2} onChange={(e) => setCompQuery2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && startComparison()} className="w-full bg-transparent border-none outline-none px-3 py-2 text-slate-900 font-medium placeholder-slate-400" />
          </div>

          <button onClick={startComparison} disabled={!compQuery1.trim() || !compQuery2.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:shadow-none flex items-center gap-2">
            📊 Palyginti
          </button>
        </div>

        {isComparing && compPlace1 && <div className="hidden"><WalkScore latlng={compPlace1.latlng} onScore={setPlace1WalkScore} /></div>}
        {isComparing && compPlace2 && <div className="hidden"><WalkScore latlng={compPlace2.latlng} onScore={setPlace2WalkScore} /></div>}

        {isComparing && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Column 1 */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500" />
              <h3 className="text-2xl font-bold text-slate-900 mb-8 truncate pr-8" title={compPlace1?.name}>{compPlace1?.name}</h3>
              
              <div className="flex gap-4 mb-8">
                <div className="bg-slate-50 p-4 rounded-2xl flex-1 text-center border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">Pasiekiamumas</div>
                  <div className="text-3xl font-black text-blue-600">{place1Analysis?.totalScore || 0}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl flex-1 text-center border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">Saugumas</div>
                  <div className={`text-3xl font-black ${place1CrimeScore && place1CrimeScore > 50 ? 'text-emerald-500' : 'text-rose-500'}`}>{place1CrimeScore !== null ? place1CrimeScore : 'N/A'}</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex-1 text-center">
                  <div className="text-[10px] text-blue-800 uppercase font-black tracking-wider mb-2">Gyvenimo Kokybė</div>
                  <div className="text-4xl font-black text-blue-700">{Math.round(((place1Analysis?.totalScore || 0) + (place1WalkScore || 0) + (place1CrimeScore || 0)) / 3) || 0}</div>
                </div>
              </div>

              {place1Analysis && (
                <ul className="flex flex-col gap-3 m-0 p-0 list-none">
                  {place1Analysis.features.map((f: any, i: number) => (
                    <li key={i} className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl bg-slate-50 p-2 rounded-lg">{f.icon}</span>
                        <span className="font-semibold text-slate-800">{f.type}</span>
                      </div>
                      <span className="font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg text-sm">
                        {f.distance < 1000 ? `${Math.round(f.distance)} m` : `${(f.distance / 1000).toFixed(1)} km`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Column 2 */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500" />
              <h3 className="text-2xl font-bold text-slate-900 mb-8 truncate pr-8" title={compPlace2?.name}>{compPlace2?.name}</h3>
              
              <div className="flex gap-4 mb-8">
                <div className="bg-slate-50 p-4 rounded-2xl flex-1 text-center border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">Pasiekiamumas</div>
                  <div className="text-3xl font-black text-rose-500">{place2Analysis?.totalScore || 0}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl flex-1 text-center border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">Saugumas</div>
                  <div className={`text-3xl font-black ${place2CrimeScore && place2CrimeScore > 50 ? 'text-emerald-500' : 'text-rose-500'}`}>{place2CrimeScore !== null ? place2CrimeScore : 'N/A'}</div>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex-1 text-center">
                  <div className="text-[10px] text-rose-800 uppercase font-black tracking-wider mb-2">Gyvenimo Kokybė</div>
                  <div className="text-4xl font-black text-rose-700">{Math.round(((place2Analysis?.totalScore || 0) + (place2WalkScore || 0) + (place2CrimeScore || 0)) / 3) || 0}</div>
                </div>
              </div>

              {place2Analysis && (
                <ul className="flex flex-col gap-3 m-0 p-0 list-none">
                  {place2Analysis.features.map((f: any, i: number) => (
                    <li key={i} className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl bg-slate-50 p-2 rounded-lg">{f.icon}</span>
                        <span className="font-semibold text-slate-800">{f.type}</span>
                      </div>
                      <span className="font-black text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg text-sm">
                        {f.distance < 1000 ? `${Math.round(f.distance)} m` : `${(f.distance / 1000).toFixed(1)} km`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}