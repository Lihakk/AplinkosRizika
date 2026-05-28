import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, Popup } from "react-leaflet";
import { Icon, LatLng, LatLngBounds, divIcon } from "leaflet";
import { Search, ArrowLeft, ShieldAlert, Map as MapIcon, X, School, Crosshair, ExternalLink } from "lucide-react";
import type {
  Feature as GeoJsonFeature,
  GeoJsonObject,
  MultiPolygon,
  Point,
  Polygon,
  Position as GeoJsonPosition,
} from "geojson";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "./MapPage.css";
import L from "leaflet";

import LocationMarker from "../components/LocationMarker";
import RoutingControl from "../components/RoutingControl";
import WalkScore from "../components/WalkScore";
import { parseAruodasInput, type AruodasParseResult } from "../utils/aruodas";
import { geocode } from "../utils/geocoding";

// --- Types ---
type CrimeKey = "hp" | "th";

const SCHOOL_TYPES = ["pradine", "progimnazija", "gimnazija"] as const;

type SchoolType = (typeof SCHOOL_TYPES)[number];
type JsonRecord = Record<string, unknown>;
type EntityId = string | number;

const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  pradine: "Pradinė",
  progimnazija: "Progimnazija",
  gimnazija: "Gimnazija",
};

const normalizeSchoolType = (value: unknown): SchoolType | null => {
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

interface StopArrival {
  shapeId?: string;
  route?: string;
  time?: string;
  destination?: string;
}

interface StopRoute {
  route?: string;
  destination?: string;
}

interface StopFrequencyPoint {
  hour: string;
  count: number;
}

interface MapFeature {
  id?: EntityId;
  name?: string;
  type?: string;
  geometry: GeoJsonObject | null;
  distance?: number;
}

interface SchoolFeature {
  school_Id: EntityId;
  name: string;
  rating: number;
  type: SchoolType | null;
  location: Point | null;
  cityId?: number;
}

interface PoliceStation {
  id?: EntityId;
  name: string;
  geo: Point | null;
}

type PoliceStationWithDistance = PoliceStation & { distance: number };

interface EldershipFeature {
  eldership_Name: string;
  geometry: GeoJsonObject | null;
}

interface CrimeByEldership {
  eldership_Id?: EntityId;
  eldership_Name: string;
  City_id?: EntityId;
  Health_total: number;
  Theft_total: number;
  All_total: number;
  geometry: GeoJsonObject | null;
  Geometry: GeoJsonObject | null;
}

type ProcessedCrimeData = CrimeByEldership & { combined: number };

interface LocationResolveResult {
  latlng: LatLng;
  label: string;
  parsed: AruodasParseResult | null;
}

// --- Config & Constants ---
const safeJsonParse = <T = unknown,>(data: unknown): T | null => {
  if (!data) return null;
  if (typeof data === "string") {
    try { return JSON.parse(data) as T; }
    catch { return null; }
  }
  return data as T;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const readNumber = (value: unknown, fallback = 0) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const readId = (...values: unknown[]): EntityId | undefined => {
  const value = values.find((candidate) => typeof candidate === "string" || typeof candidate === "number");
  return value as EntityId | undefined;
};

const getPointCoordinates = (geometry: GeoJsonObject | null): [number, number] | null => {
  if (!geometry || geometry.type !== "Point") return null;
  const coordinates = (geometry as Point).coordinates;
  if (coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  return typeof lng === "number" && typeof lat === "number" ? [lng, lat] : null;
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

const cityIdByName: Record<string, number> = {
  Kaunas: 1,
  Vilnius: 2,
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

function pointInRing(lng: number, lat: number, ring: GeoJsonPosition[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContains(geom: GeoJsonObject | null, lng: number, lat: number): boolean {
  if (!geom) return false;
  if (geom.type === "Feature") return geometryContains((geom as GeoJsonFeature).geometry, lng, lat);
  if (geom.type === "Polygon") {
    const coordinates = (geom as Polygon).coordinates;
    if (!pointInRing(lng, lat, coordinates[0])) return false;
    for (let k = 1; k < coordinates.length; k++) {
      if (pointInRing(lng, lat, coordinates[k])) return false;
    }
    return true;
  }
  if (geom.type === "MultiPolygon") {
    return (geom as MultiPolygon).coordinates.some((poly) => {
      if (!pointInRing(lng, lat, poly[0])) return false;
      for (let k = 1; k < poly.length; k++) {
        if (pointInRing(lng, lat, poly[k])) return false;
      }
      return true;
    });
  }
  return false;
}

const getRingCenter = (coordinates: GeoJsonPosition[]): [number, number] | null => {
  if (coordinates.length === 0) return null;
  let latSum = 0;
  let lonSum = 0;
  coordinates.forEach((coordinate) => {
    lonSum += coordinate[0];
    latSum += coordinate[1];
  });
  return [latSum / coordinates.length, lonSum / coordinates.length];
};

const getFeatureCenter = (geometry: GeoJsonObject | null): [number, number] | null => {
  if (!geometry) return null;

  if (geometry.type === "Feature") {
    return getFeatureCenter((geometry as GeoJsonFeature).geometry);
  }

  if (geometry.type === "Point") {
    const coordinates = getPointCoordinates(geometry);
    return coordinates ? [coordinates[1], coordinates[0]] : null;
  }

  if (geometry.type === "Polygon") {
    return getRingCenter((geometry as Polygon).coordinates[0]);
  }

  if (geometry.type === "MultiPolygon") {
    return getRingCenter((geometry as MultiPolygon).coordinates[0][0]);
  }

  return null;
};

// --- Map Subcomponents ---
function MapController({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { animate: true, duration: 1.5 });
    }
  }, [target, map]);
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

function findClosestPolice(userPos: L.LatLng, policeList: PoliceStation[]) {
  let closest: PoliceStationWithDistance | null = null;
  let minDist = Infinity;

  for (const p of policeList) {
    const coordinates = getPointCoordinates(p.geo);
    if (!coordinates) continue;
    const [lng, lat] = coordinates;
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
  const cityId = cityIds[city] ?? 1;
  const cityCenter = cityCoordinates[city];
  const cityBounds = cityBoundsMap[city] || cityBoundsMap["Kaunas"];

  const mapRef = useRef<L.Map | null>(null);

  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null);
  const [searchResultLabel, setSearchResultLabel] = useState<string | undefined>();
  const [aruodasParse, setAruodasParse] = useState<AruodasParseResult | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState({ elderships: false, crimes: false, search: false });
  const [accessibilityData, setAccessibilityData] = useState<AccessibilityData | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [routeStart, setRouteStart] = useState<LatLng | null>(null);
  const [routeEnd, setRouteEnd] = useState<LatLng | null>(null);
  const [routeToPolice, setRouteToPolice] = useState(false);
  const [destQuery, setDestQuery] = useState("");
  const [pickingDest, setPickingDest] = useState(false);
  const [routeProfile, setRouteProfile] = useState<'car' | 'bike' | 'foot'>('car');

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  const [isComparing, setIsComparing] = useState(false);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const routingLoadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showRoutingLoading = () => {
    if (routingLoadingTimer.current) clearTimeout(routingLoadingTimer.current);
    setIsRoutingLoading(true);
    routingLoadingTimer.current = setTimeout(() => setIsRoutingLoading(false), 500);
  };

  const [place1Analysis, setPlace1Analysis] = useState<AccessibilityData | null>(null);
  const [place2Analysis, setPlace2Analysis] = useState<AccessibilityData | null>(null);
  const [place1WalkScore, setPlace1WalkScore] = useState<number | null>(null);
  const [place2WalkScore, setPlace2WalkScore] = useState<number | null>(null);
  const [place1CrimeScore, setPlace1CrimeScore] = useState<number | null>(null);
  const [place2CrimeScore, setPlace2CrimeScore] = useState<number | null>(null);
  const [compQuery1, setCompQuery1] = useState("");
  const [compQuery2, setCompQuery2] = useState("");
  const [compPlace1, setCompPlace1] = useState<SelectedPlace | null>(null);
  const [compPlace2, setCompPlace2] = useState<SelectedPlace | null>(null);

  const [schools, setSchools] = useState<SchoolFeature[]>([]);
  const [police, setPolice] = useState<PoliceStation[]>([]);
  const [closestPolice, setClosestPolice] = useState<{ latlng: LatLng; name: string; distance: number } | null>(null);
  const [showingPolice, setShowingPolice] = useState(false);
  const [elderships, setElderships] = useState<EldershipFeature[]>([]);
  const [crimeByEldership, setCrimeByEldership] = useState<CrimeByEldership[]>([]);
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [stopArrivals, setStopArrivals] = useState<StopArrival[]>([]);
  const [stopRoutes, setStopRoutes] = useState<StopRoute[]>([]);
  const [selectedPath, setSelectedPath] = useState<GeoJsonObject | null>(null);
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
  const [stopFrequency, setStopFrequency] = useState<StopFrequencyPoint[]>([]);
  const [walkScoreValue, setWalkScoreValue] = useState<number | null>(null);

  const [featureLayers, setFeatureLayers] = useState<Record<string, MapFeature[]>>({});
  const [activeFeatures, setActiveFeatures] = useState<Record<string, boolean>>({});
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);

  const [selectedCrimeEldership, setSelectedCrimeEldership] = useState<CrimeByEldership | null>(null);
  const crimeLayerRef = useRef<L.Layer | null>(null);

  const hidePolice = () => {
    setClosestPolice(null);
    setShowingPolice(false);
    if (routeToPolice) {
      setRouteStart(null);
      setRouteEnd(null);
      setRouteToPolice(false);
    }
  };

  const resolveLocationInput = async (input: string, rememberAruodas = false): Promise<LocationResolveResult | null> => {
    const parsed = parseAruodasInput(input);
    if (rememberAruodas) setAruodasParse(parsed);

    if (parsed?.coordinates) {
      return { latlng: parsed.coordinates, label: parsed.display, parsed };
    }

    const query = parsed?.query || input;
    const latlng = await geocode(query, parsed?.city || city);
    if (!latlng) return null;

    return { latlng, label: parsed?.display || input, parsed };
  };

  const showClosestPolice = useCallback(async (userPos: L.LatLng) => {
    if (!mapRef.current) return;
    let policeData = police;
    if (policeData.length === 0) {
      try {
        const res = await fetch(`${API_URL}/api/Police`);
        const raw: unknown = await res.json();
        policeData = Array.isArray(raw) ? raw.map((value): PoliceStation => {
          const item = isRecord(value) ? value : {};
          return {
            id: readId(item.id),
            name: readString(item.name, "Policijos nuovada"),
            geo: safeJsonParse<Point>(item.point),
          };
        }) : [];
        setPolice(policeData);
      } catch (err) {
        console.error("Failed to load police", err);
        policeData = [];
      }
    }

    if (!policeData || policeData.length === 0) return;

    const closest = findClosestPolice(userPos, policeData);
    if (!closest) return;

    const coordinates = getPointCoordinates(closest.geo);
    if (!coordinates) return;
    const [lng, lat] = coordinates;
    const name = closest.name || "Policijos nuovada";
    const policeLatLng = L.latLng(lat, lng);

    setClosestPolice({ latlng: policeLatLng, name, distance: closest.distance });
    setShowingPolice(true);
    setRouteStart(userPos);
    setRouteEnd(policeLatLng);
    setRouteToPolice(true);
    mapRef.current.flyTo(policeLatLng, 16, { animate: true, duration: 1.2 });
  }, [police]);

  useEffect(() => {
    if (!showingPolice) return;
    const target = selectedPlace?.latlng ?? searchTarget;
    if (target) showClosestPolice(target);
  }, [selectedPlace, searchTarget, showingPolice, showClosestPolice]);

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
      const data: unknown = await res.json();

      const parsedData: MapFeature[] = Array.isArray(data) ? data.map((value) => {
        const item = isRecord(value) ? value : {};
        return {
          id: readId(item.id),
          name: readString(item.name),
          type: readString(item.type),
          distance: readNumber(item.distance),
          geometry: safeJsonParse<GeoJsonObject>(item.geometry),
        };
      }) : [];

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
      const data: unknown = await res.json();
      const stops = Array.isArray(data) ? data.flatMap((value): BusStop[] => {
        const stop = isRecord(value) ? value : {};
        const geo = safeJsonParse<GeoJsonObject>(stop.geometry);
        const coordinates = getPointCoordinates(geo);
        if (!coordinates) return [];
        const [lon, lat] = coordinates;
        return [{
          id: readNumber(stop.id),
          lat,
          lon,
          name: readString(stop.name, "Stotelė"),
        }];
      }) : [];
      setBusStops(stops);
    } catch (e) { console.error(e); }
  };

  const handleStopClick = async (lat: number, lon: number) => {
    setLoadingArrivals(true);
    setStopArrivals([]);
    setStopRoutes([]);
    try {
      const arrRes = await fetch(`${API_URL}/api/Transport/stop-arrivals?lat=${lat}&lon=${lon}`);
      const arrData: unknown = await arrRes.json();
      setStopArrivals(Array.isArray(arrData) ? arrData.map((value): StopArrival => {
        const item = isRecord(value) ? value : {};
        return {
          shapeId: readString(item.shapeId),
          route: readString(item.route),
          time: readString(item.time),
          destination: readString(item.destination),
        };
      }) : []);

      const routeRes = await fetch(`${API_URL}/api/Transport/stop-routes?lat=${lat}&lon=${lon}`);
      const routeData: unknown = await routeRes.json();
      setStopRoutes(Array.isArray(routeData) ? routeData.map((value): StopRoute => {
        const item = isRecord(value) ? value : {};
        return {
          route: readString(item.route),
          destination: readString(item.destination),
        };
      }) : []);

      const freqRes = await fetch(`${API_URL}/api/Transport/stop-frequency?lat=${lat}&lon=${lon}`);
      const freqData: unknown = await freqRes.json();
      setStopFrequency(Array.isArray(freqData) ? freqData.map((value): StopFrequencyPoint => {
        const item = isRecord(value) ? value : {};
        return {
          hour: readString(item.hour ?? item.Hour),
          count: readNumber(item.count ?? item.Count),
        };
      }) : []);
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
      const data: unknown = await res.json();
      if (isRecord(data) && data.geometry) setSelectedPath(safeJsonParse<GeoJsonObject>(data.geometry));
    } catch (e) { console.error(e); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(p => ({ ...p, search: true }));
    try {
      const result = await resolveLocationInput(searchQuery, true);
      if (result) {
        setSearchResultLabel(result.label);
        setSelectedPlace({ latlng: result.latlng, name: result.label });
        setSearchTarget(result.latlng);
        setPanelOpen(true);
        fetchNearbyBusStops(result.latlng.lat, result.latlng.lng);
      }
    } catch (error) { console.error(error); }
    finally { setIsLoading(p => ({ ...p, search: false })); }
  };

  const handleRouteSearch = async () => {
    if (!searchQuery.trim() || !destQuery.trim()) return;
    showRoutingLoading();
    setIsLoading(p => ({ ...p, search: true }));
    try {
      const start = await resolveLocationInput(searchQuery, true);
      const end = await resolveLocationInput(destQuery);
      if (start && end) {
        setSearchResultLabel(start.label);
        setSelectedPlace({ latlng: start.latlng, name: start.label });
        setSearchTarget(start.latlng);
        setRouteStart(start.latlng);
        setRouteEnd(end.latlng);
        setRouteToPolice(false);
      }
    } catch (error) { console.error(error); }
    finally { setIsLoading(p => ({ ...p, search: false })); }
  };

  const clearRoute = () => {
    setRouteStart(null);
    setRouteEnd(null);
    setRouteToPolice(false);
    setDestQuery("");
    setPickingDest(false);
  };

  const handleDestPicked = (latlng: LatLng, address: string) => {
    showRoutingLoading();
    setRouteEnd(latlng);
    setDestQuery(address);
    setPickingDest(false);
    if (selectedPlace) setRouteStart(selectedPlace.latlng);
  };

  const handleDoubleClickResult = (latlng: LatLng, address: string) => {
    setAruodasParse(null);
    setSearchResultLabel(address);
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
    setSearchResultLabel(undefined);
    setAruodasParse(null);
    setPanelOpen(false);
    setBusStops([]);
  };

  const startComparison = async () => {
    if (!compQuery1.trim() || !compQuery2.trim()) {
      alert("Pasirinkite abu taškus palyginimui");
      return;
    }

    setIsComparisonLoading(true);
    try {
      const [latlng1, latlng2] = await Promise.all([
        resolveLocationInput(compQuery1),
        resolveLocationInput(compQuery2)
      ]);

      if (!latlng1 || !latlng2) {
        alert("Nepavyko rasti vieno ar abiejų vietų. Įsitikinkite, kad įvedėte teisingus adresus.");
        return;
      }

      setCompPlace1({ latlng: latlng1.latlng, name: latlng1.label });
      setCompPlace2({ latlng: latlng2.latlng, name: latlng2.label });

      setIsComparing(true);

      setRouteStart(new L.LatLng(54.90731, 23.94094));                                                                       
      setRouteEnd(new L.LatLng(54.90591, 23.94158));

      const [res1, res2] = await Promise.all([
        fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${latlng1.latlng.lat}&lon=${latlng1.latlng.lng}`),
        fetch(`${API_URL}/api/MapFeatures/evaluation?lat=${latlng2.latlng.lat}&lon=${latlng2.latlng.lng}`)
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

      setPlace1CrimeScore(calculateCrime(latlng1.latlng.lat, latlng1.latlng.lng));
      setPlace2CrimeScore(calculateCrime(latlng2.latlng.lat, latlng2.latlng.lng));

    } catch (e) {
      console.error("Comparison fetch failed", e);
      alert("Įvyko klaida lyginant vietas.");
    } finally {
      setIsComparisonLoading(false);
    }

    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const toggleElderships = async () => {
    if (elderships.length > 0) return setElderships([]);
    setIsLoading(p => ({ ...p, elderships: true }));
    try {
      const res = await fetch(`${API_URL}/api/Eldership?cityId=${cityId}`);
      const data: unknown = await res.json();
      const parsed = Array.isArray(data) ? data.map((value): EldershipFeature => {
        const item = isRecord(value) ? value : {};
        return {
          eldership_Name: readString(item.eldership_Name ?? item.Eldership_Name ?? item.name),
          geometry: safeJsonParse<GeoJsonObject>(item.geometry ?? item.Geometry),
        };
      }) : [];
      setElderships(parsed);
    } catch (e) { console.error(e); }
    setIsLoading(p => ({ ...p, elderships: false }));
  };

  const toggleCrimes = async () => {
    if (crimeByEldership.length > 0) return setCrimeByEldership([]);
    setIsLoading(p => ({ ...p, crimes: true }));
    try {
      const res = await fetch(`${API_URL}/api/Crimegrid/by-eldership?cityId=${cityId}`);
      const data: unknown = await res.json();
      const normalized = Array.isArray(data) ? data.map((value): CrimeByEldership => {
        const item = isRecord(value) ? value : {};
        const geometry = safeJsonParse<GeoJsonObject>(item.Geometry ?? item.geometry);
        return {
          eldership_Id: readId(item.Eldership_Id, item.eldership_Id, item.eldership_id),
          eldership_Name: readString(item.Eldership_Name ?? item.eldership_Name ?? item.eldership_name ?? item.name),
          City_id: readId(item.City_id, item.city_Id, item.cityId, item.city_id),
          Health_total: readNumber(item.Health ?? item.health_Total ?? item.Health_Total ?? item.Health_total ?? item.health_total),
          Theft_total: readNumber(item.Theft ?? item.theft_Total ?? item.Theft_Total ?? item.Theft_total ?? item.theft_total),
          All_total: readNumber(item.Total ?? item.all_Total ?? item.All_Total ?? item.All_total ?? item.all_total),
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
      const raw: unknown = await res.json();
      const parsed = Array.isArray(raw) ? raw.map((value): SchoolFeature => {
        const s = isRecord(value) ? value : {};
        return {
          school_Id: readId(s.school_id, s.School_Id, s.school_Id, s.id) ?? readString(s.Name ?? s.name, "school"),
          name: readString(s.Name ?? s.name, "Mokykla"),
          rating: readNumber(s.Rating ?? s.rating),
          type: normalizeSchoolType(s.Type ?? s.type ?? s.Tipas ?? s.tipas),
          cityId: readNumber(s.City_Id ?? s.city_Id ?? s.cityId ?? s.city_id, 0) || undefined,
          location: safeJsonParse<Point>(s.Location ?? s.location),
        };
      }) : [];
      setSchools(parsed);
    } catch (err) { console.error(err); }
  };

  const processedCrimeData = useMemo<ProcessedCrimeData[]>(() => {
    return crimeByEldership.map((e) => ({
      ...e,
      combined: (selectedCrimes.hp ? e.Health_total : 0) + (selectedCrimes.th ? e.Theft_total : 0)
    }));
  }, [crimeByEldership, selectedCrimes]);

  const maxValue = useMemo(() => Math.max(...processedCrimeData.map((e) => e.combined), 1), [processedCrimeData]);
  const getCrimeColor = (norm: number) => norm > 0.8 ? "#800026" : norm > 0.6 ? "#BD0026" : norm > 0.4 ? "#E31A1C" : norm > 0.2 ? "#FC4E2A" : "#FFEDA0";

  const filteredSchools = useMemo(() => {
    const cityId = cityIdByName[city];
    return schools.filter((s): s is SchoolFeature & { location: Point } => {
      const type = s.type as SchoolType | null;
      const rating = Number(s.rating ?? 0);
      const matchesCity = cityId ? s.cityId === cityId : true;
      return matchesCity && type !== null && selectedSchoolTypes[type] && rating >= minSchoolRating && s.location !== null;
    });
  }, [city, schools, selectedSchoolTypes, minSchoolRating]);

  const calculateCrimeTotal = useCallback((eldership: CrimeByEldership | ProcessedCrimeData) => {
    return (selectedCrimes.hp ? eldership.Health_total : 0) + (selectedCrimes.th ? eldership.Theft_total : 0);
  }, [selectedCrimes]);

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
  }, [selectedCrimeEldership, calculateCrimeTotal]);

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
  // --- MEMOIZED MAP LAYERS TO FIX RE-RENDER SLOWNESS ---
  const eldershipLayers = useMemo(() => {
    return elderships.map((e, i) => e.geometry ? (
      <GeoJSON key={`eldership-${i}`} data={e.geometry} style={{ color: "#3b82f6", weight: 2, fillOpacity: 0.03, dashArray: '5, 5' }}
        onEachFeature={(_, layer) => layer.bindPopup(`<strong style="font-family:'Inter',sans-serif;font-size:15px;">${e.eldership_Name}</strong>`)} />
    ) : null);
  }, [elderships]);

  const crimeGridLayers = useMemo(() => {
    return processedCrimeData.map((e, i) => {
      const geometry = e.geometry ?? e.Geometry;
      if (!geometry) return null;
      return (
        <GeoJSON
          key={`crime-${i}`}
          data={geometry}
          style={{ fillColor: getCrimeColor(e.combined / maxValue), color: "white", weight: 1.5, opacity: 0.9, fillOpacity: 0.6 }}
          onEachFeature={(_, layer) => {
            layer.on('click', () => { crimeLayerRef.current = layer; setSelectedCrimeEldership(e); });
          }}
        />
      );
    });
  }, [processedCrimeData, maxValue]);

  const featureMarkerLayers = useMemo(() => {
    return MAP_FEATURES.map(config => {
      if (!activeFeatures[config.id] || !featureLayers[config.id]) return null;
      return featureLayers[config.id].map((feature, i) => {
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
    });
  }, [activeFeatures, featureLayers]);

  const schoolLayers = useMemo(() => {
    return filteredSchools.map((s) => (
      <Marker key={s.school_Id} position={[s.location.coordinates[1], s.location.coordinates[0]]} icon={schoolIcon}>
        <Popup>
          <div style={{ fontFamily: "'Inter', sans-serif" }}>
            <div style={{ fontWeight: '800', fontSize: '14px', marginBottom: 8, color: '#0f172a' }}>{s.name || "Mokykla"}</div>
            <div style={{ fontSize: '13px', color: '#475569', marginBottom: 4 }}>Tipas: <strong style={{ color: '#0f172a' }}>{s.type ? SCHOOL_TYPE_LABELS[s.type as SchoolType] : 'Nežinomas'}</strong></div>
            <div style={{ fontSize: '13px', color: '#475569' }}>Reitingas: <strong style={{ color: '#3b82f6' }}>{Number(s.rating).toFixed(1)}</strong></div>
          </div>
        </Popup>
      </Marker>
    ));
  }, [filteredSchools]);

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
            <input type="text" placeholder={`${city} adresas arba Aruodas nuoroda...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
            <button onClick={handleSearch} disabled={isLoading.search}>{isLoading.search ? "..." : <Search size={18} />}</button>
          </div>
          {aruodasParse && (
            <div className="glass-panel aruodas-parse-pill">
              <span>🏠</span>
              <strong>{aruodasParse.display}</strong>
              <em>{aruodasParse.confidence === "high" ? "tikslu" : "tikrinama"}</em>
            </div>
          )}
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
          <RoutingControl start={routeStart} end={routeEnd} profile={routeProfile} hideEndMarker={routeToPolice} />

          <LocationMarker
            customIcon={customIcon}
            externalPosition={searchTarget}
            externalLabel={searchResultLabel}
            onPlaceSelected={(place) => setSelectedPlace(place)}
            onDoubleClickResult={handleDoubleClickResult}
            onClickClear={handleClickClear}
            pickingDest={pickingDest}
            onDestPicked={handleDestPicked}
          />

          {selectedPath && <GeoJSON data={selectedPath} style={{ color: "#3b82f6", weight: 6, opacity: 0.8 }} />}

          {eldershipLayers}
          {crimeGridLayers}
          {featureMarkerLayers}
          {schoolLayers}

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
                          <li key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); if (a.shapeId) handleShowPath(a.shapeId); }}>
                            <span className="bg-blue-600 text-white font-bold text-xs py-1 px-2 rounded">{a.route}</span>
                            <div className="flex flex-col">
                              <strong className="text-slate-900 text-sm leading-tight">{a.time?.substring(0, 5) || "--:--"}</strong>
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

          <MapController target={searchTarget} />
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

            {selectedPlace && <div className="hidden"><WalkScore latlng={selectedPlace.latlng} onScore={setWalkScoreValue} /></div>}

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
                      {accessibilityData.features.map((feature, idx) => (
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

        {isRoutingLoading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 99999, backgroundColor: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '32px' }}>
            <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <svg style={{ animation: 'spin 1s linear infinite', height: '40px', width: '40px', color: '#2563eb' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>Ieškomas maršrutas...</span>
            </div>
          </div>
        )}

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

          <button onClick={startComparison} disabled={!compQuery1.trim() || !compQuery2.trim() || isComparisonLoading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:shadow-none flex items-center gap-2">
            {isComparisonLoading ? (
              <>
                <svg style={{ animation: 'spin 1s linear infinite', height: '20px', width: '20px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Kraunama...
              </>
            ) : (
              <>📊 Palyginti</>
            )}
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
                  {place1Analysis.features.map((f, i) => (
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
                  {place2Analysis.features.map((f, i) => (
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
