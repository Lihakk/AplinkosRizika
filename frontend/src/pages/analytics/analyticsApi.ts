import { geocode } from "../../utils/geocoding";
import type {
  DeepEvaluationPoint,
  EldershipMetric,
  NeighborhoodProfile,
  RealEstateListingAnalytics,
} from "./analyticsTypes";
import type { Feature as GeoJsonFeature, GeoJsonObject, MultiPolygon, Point, Polygon, Position } from "geojson";

const API_URL = import.meta.env.VITE_API_URL || "http://144.24.247.126:5178";
const KAUNAS_CENTER = { lat: 54.8985, lon: 23.9036 };
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const inflightRequests = new Map<string, Promise<unknown>>();

type JsonRecord = Record<string, unknown>;

interface RawEldership {
  id: number;
  name: string;
  geometry: GeoJsonObject | null;
}

interface RawCrime {
  id: number;
  name: string;
  cityId?: number;
  health: number;
  theft: number;
  total: number;
  geometry: GeoJsonObject | null;
}

interface RawSchool {
  name: string;
  location: Point | null;
  cityId?: number;
}

interface AccessibilityFeature {
  type?: string;
  name?: string;
  distance: number;
  icon?: string;
  score?: number;
  rangeLabel?: string;
}

interface AccessibilityResponse {
  totalScore: number;
  features: AccessibilityFeature[];
}

interface FrequencyPoint {
  hour?: string;
  Hour?: string;
  count?: number;
  Count?: number;
}

interface RealEstateResponse {
  id?: number;
  name?: string;
  price?: number;
  area?: number;
  rooms?: number;
  imageUrl?: string;
  url?: string;
  lat?: number;
  lon?: number;
  distance?: number;
}

export interface LiveAnalyticsState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

export interface LiveEldershipMetric extends EldershipMetric {
  lat: number;
  lon: number;
  shopCount: number;
  safetyScore: number;
  greeneryScore: number;
  transportScore: number;
  servicesScore: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function safeJsonParse<T = unknown>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(4));
}

function coordinatePath(path: string, lat: number, lon: number, rest = "") {
  return `${path}?lat=${roundCoordinate(lat)}&lon=${roundCoordinate(lon)}${rest}`;
}

async function fetchJson<T>(path: string, fallback: T, ttlMs = CACHE_TTL_MS): Promise<T> {
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const inflight = inflightRequests.get(path);
  if (inflight) return inflight as Promise<T>;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const request = (async () => {
    const response = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const value = (await response.json()) as T;
    responseCache.set(path, { expiresAt: Date.now() + ttlMs, value });
    return value;
  })();

  inflightRequests.set(path, request);

  try {
    return await request;
  } catch (error) {
    console.error(`Analytics API failed: ${path}`, error);
    return fallback;
  } finally {
    inflightRequests.delete(path);
    window.clearTimeout(timeout);
  }
}

function pointInRing(lng: number, lat: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContains(geometry: GeoJsonObject | null, lng: number, lat: number): boolean {
  if (!geometry) return false;
  if (geometry.type === "Feature") return geometryContains((geometry as GeoJsonFeature).geometry, lng, lat);
  if (geometry.type === "Polygon") {
    const coordinates = (geometry as Polygon).coordinates;
    if (!pointInRing(lng, lat, coordinates[0])) return false;
    return coordinates.slice(1).every((ring) => !pointInRing(lng, lat, ring));
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry as MultiPolygon).coordinates.some((polygon) => {
      if (!pointInRing(lng, lat, polygon[0])) return false;
      return polygon.slice(1).every((ring) => !pointInRing(lng, lat, ring));
    });
  }
  return false;
}

function getPointCoordinates(point: Point | null): [number, number] | null {
  if (!point || point.type !== "Point") return null;
  const [lng, lat] = point.coordinates;
  return typeof lng === "number" && typeof lat === "number" ? [lng, lat] : null;
}

function flattenPositions(geometry: GeoJsonObject | null): Position[] {
  if (!geometry) return [];
  if (geometry.type === "Feature") return flattenPositions((geometry as GeoJsonFeature).geometry);
  if (geometry.type === "Point") return [(geometry as Point).coordinates];
  if (geometry.type === "Polygon") return (geometry as Polygon).coordinates[0];
  if (geometry.type === "MultiPolygon") return (geometry as MultiPolygon).coordinates.flatMap((polygon) => polygon[0]);
  return [];
}

function centroid(geometry: GeoJsonObject | null) {
  const positions = flattenPositions(geometry);
  if (positions.length === 0) return KAUNAS_CENTER;
  const sums = positions.reduce(
    (acc, [lng, lat]) => ({ lon: acc.lon + lng, lat: acc.lat + lat }),
    { lat: 0, lon: 0 },
  );
  return { lat: sums.lat / positions.length, lon: sums.lon / positions.length };
}

function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const earthRadius = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalize(value: number, max: number, lowerIsBetter = false) {
  if (max <= 0) return 0;
  const score = Math.round((value / max) * 100);
  return lowerIsBetter ? Math.max(0, 100 - score) : Math.min(100, score);
}

function normalizeEldership(value: unknown): RawEldership {
  const item = isRecord(value) ? value : {};
  return {
    id: readNumber(item.Eldership_Id ?? item.eldership_Id ?? item.eldership_id),
    name: readString(item.Eldership_Name ?? item.eldership_Name ?? item.eldership_name ?? item.name, "Seniunija"),
    geometry: safeJsonParse<GeoJsonObject>(item.Geometry ?? item.geometry),
  };
}

function normalizeCrime(value: unknown): RawCrime {
  const item = isRecord(value) ? value : {};
  return {
    id: readNumber(item.Eldership_Id ?? item.eldership_Id ?? item.eldership_id),
    name: readString(item.Eldership_Name ?? item.eldership_Name ?? item.eldership_name ?? item.name, "Seniunija"),
    cityId: readNumber(item.City_id ?? item.City_Id ?? item.city_Id ?? item.cityId ?? item.city_id, 0) || undefined,
    health: readNumber(item.Health_Total ?? item.health_Total ?? item.health_total ?? item.Health),
    theft: readNumber(item.Theft_Total ?? item.theft_Total ?? item.theft_total ?? item.Theft),
    total: readNumber(item.All_Total ?? item.all_Total ?? item.all_total ?? item.Total),
    geometry: safeJsonParse<GeoJsonObject>(item.Geometry ?? item.geometry),
  };
}

function normalizeSchool(value: unknown): RawSchool {
  const item = isRecord(value) ? value : {};
  return {
    name: readString(item.Name ?? item.name, "Mokykla"),
    location: safeJsonParse<Point>(item.Location ?? item.location),
    cityId: readNumber(item.City_Id ?? item.city_Id ?? item.cityId ?? item.city_id, 0) || undefined,
  };
}

function readFrequencyCount(point: FrequencyPoint) {
  return point.count ?? point.Count ?? 0;
}

function getAverageSchoolDistance(center: { lat: number; lon: number }, geometry: GeoJsonObject | null, schools: RawSchool[], cityId?: number) {
  const citySchools = cityId ? schools.filter((school) => school.cityId === cityId) : schools;
  const schoolsInArea = citySchools
    .map((school) => {
      const coordinates = getPointCoordinates(school.location);
      if (!coordinates) return null;
      const [lon, lat] = coordinates;
      return { lat, lon };
    })
    .filter((point): point is { lat: number; lon: number } => Boolean(point))
    .filter((point) => geometryContains(geometry, point.lon, point.lat));

  const candidates = schoolsInArea.length > 0 ? schoolsInArea : citySchools
    .map((school) => {
      const coordinates = getPointCoordinates(school.location);
      return coordinates ? { lat: coordinates[1], lon: coordinates[0] } : null;
    })
    .filter((point): point is { lat: number; lon: number } => Boolean(point))
    .sort((a, b) => distanceMeters(center, a) - distanceMeters(center, b))
    .slice(0, 5);

  if (candidates.length === 0) return 0;
  return Math.round(candidates.reduce((sum, point) => sum + distanceMeters(center, point), 0) / candidates.length);
}

async function getFeatureCount(endpoint: string, lat: number, lon: number, radius: number) {
  const data = await fetchJson<unknown[]>(coordinatePath(`/api/MapFeatures/${endpoint}`, lat, lon, `&radius=${radius}`), []);
  return Array.isArray(data) ? data.length : 0;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function getEvaluation(lat: number, lon: number) {
  return fetchJson<AccessibilityResponse>(coordinatePath("/api/MapFeatures/evaluation", lat, lon), {
    totalScore: 0,
    features: [],
  });
}

async function getNearbyStopCount(lat: number, lon: number) {
  const stops = await fetchJson<unknown[]>(coordinatePath("/api/Transport/nearby-stops", lat, lon), []);
  return Array.isArray(stops) ? stops.length : 0;
}

export async function getLiveEldershipMetrics(): Promise<LiveEldershipMetric[]> {
  const [eldershipRaw, crimeRaw, schoolRaw] = await Promise.all([
    fetchJson<unknown[]>("/api/Eldership", []),
    fetchJson<unknown[]>("/api/Crimegrid/by-eldership", []),
    fetchJson<unknown[]>("/api/School", []),
  ]);

  const elderships = eldershipRaw.map(normalizeEldership);
  const crimes = crimeRaw.map(normalizeCrime);
  const schools = schoolRaw.map(normalizeSchool);
  const maxCrime = Math.max(...crimes.map((crime) => crime.total), 1);

  return mapWithConcurrency(
    elderships,
    3,
    async (eldership) => {
      const center = centroid(eldership.geometry);
      const crime = crimes.find((item) => item.id === eldership.id || item.name === eldership.name);
      const cityId = crime?.cityId;
      const [evaluation, parks, stops, shops] = await Promise.all([
        getEvaluation(center.lat, center.lon),
        getFeatureCount("parks", center.lat, center.lon, 2200),
        getNearbyStopCount(center.lat, center.lon),
        getFeatureCount("shops", center.lat, center.lon, 1600),
      ]);
      const crimeTotal = crime?.total ?? 0;
      const averageSchoolDistance = getAverageSchoolDistance(center, eldership.geometry, schools, cityId);
      const safetyScore = normalize(crimeTotal, maxCrime, true);

      return {
        id: String(eldership.id || eldership.name),
        name: eldership.name,
        lat: center.lat,
        lon: center.lon,
        totalCrimeRate: crimeTotal,
        averageAccessibilityScore: evaluation.totalScore,
        parks,
        publicTransportStops: stops,
        averageSchoolDistance,
        shopCount: shops,
        safetyScore,
        greeneryScore: Math.min(100, parks * 10),
        transportScore: Math.min(100, stops * 4),
        servicesScore: evaluation.totalScore,
      };
    },
  );
}

export function getRecommendationProfiles(metrics: LiveEldershipMetric[]): NeighborhoodProfile[] {
  const maxParks = Math.max(...metrics.map((metric) => metric.parks), 1);
  const maxStops = Math.max(...metrics.map((metric) => metric.publicTransportStops), 1);
  const maxShops = Math.max(...metrics.map((metric) => metric.shopCount), 1);

  return metrics.map((metric) => ({
    id: metric.id,
    name: metric.name,
    summary: `${metric.name}: ${metric.publicTransportStops} stotelės, ${metric.parks} parkai, pasiekiamumo balas ${metric.averageAccessibilityScore}/100.`,
    scores: {
      safety: Math.round(metric.safetyScore / 10),
      transport: Math.round(normalize(metric.publicTransportStops, maxStops) / 10),
      greenery: Math.round(normalize(metric.parks, maxParks) / 10),
      nightlife: Math.round(normalize(metric.shopCount, maxShops) / 10),
    },
    medianPrice: 0,
    matchedSignals: [
      `${metric.safetyScore}/100 saugumo indeksas`,
      `${metric.publicTransportStops} stotelės netoliese`,
      `${metric.parks} parkai arba žaliosios zonos`,
    ],
  }));
}

function estimateArea(listing: RealEstateResponse) {
  if (listing.area && listing.area > 0) return listing.area;
  const match = listing.name?.match(/(\d+(?:[,.]\d+)?)\s*(?:m²|m2|kv\.?\s*m)/i);
  return match ? Number(match[1].replace(",", ".")) : 0;
}

function findCrimeAtPoint(crimes: RawCrime[], lat: number, lon: number) {
  return crimes.find((crime) => geometryContains(crime.geometry, lon, lat));
}

export async function getLiveRealEstateListings(lat = KAUNAS_CENTER.lat, lon = KAUNAS_CENTER.lon): Promise<RealEstateListingAnalytics[]> {
  const [listingsRaw, crimeRaw] = await Promise.all([
    fetchJson<RealEstateResponse[]>(coordinatePath("/api/RealEstate/nearby", lat, lon, "&radius=4500"), []),
    fetchJson<unknown[]>("/api/Crimegrid/by-eldership", []),
  ]);

  const crimes = crimeRaw.map(normalizeCrime);
  const maxCrime = Math.max(...crimes.map((crime) => crime.total), 1);

  return mapWithConcurrency(
    listingsRaw,
    4,
    async (listing, index) => {
      const listingLat = readNumber(listing.lat, lat);
      const listingLon = readNumber(listing.lon, lon);
      const [evaluation, frequency] = await Promise.all([
        getEvaluation(listingLat, listingLon),
        fetchJson<FrequencyPoint[]>(coordinatePath("/api/Transport/stop-frequency", listingLat, listingLon), []),
      ]);
      const averageTrips = frequency.length
        ? frequency.reduce((sum, point) => sum + readFrequencyCount(point), 0) / frequency.length
        : 0;
      const crime = findCrimeAtPoint(crimes, listingLat, listingLon);
      const safety = crime ? normalize(crime.total, maxCrime, true) : 65;

      return {
        id: String(listing.id ?? listing.url ?? `listing-${index}`),
        title: listing.name || "Aruodas skelbimas",
        address: listing.name || "Adresas nenurodytas",
        price: readNumber(listing.price),
        area: estimateArea(listing),
        lat: listingLat,
        lon: listingLon,
        imageUrl: listing.imageUrl,
        url: listing.url,
        distance: listing.distance,
        scores: {
          walkability: Math.min(100, Math.round(averageTrips * 7)),
          safety,
          services: evaluation.totalScore,
        },
      };
    },
  );
}

export async function getDeepEvaluation(address: string): Promise<DeepEvaluationPoint> {
  const coordinates = await geocode(address, "Kaunas");
  const point = coordinates ? { lat: coordinates.lat, lon: coordinates.lng } : KAUNAS_CENTER;
  const [evaluation, frequency, stops, crimeRaw] = await Promise.all([
    getEvaluation(point.lat, point.lon),
    fetchJson<FrequencyPoint[]>(coordinatePath("/api/Transport/stop-frequency", point.lat, point.lon), []),
    fetchJson<Array<{ name?: string; Name?: string }>>(coordinatePath("/api/Transport/nearby-stops", point.lat, point.lon), []),
    fetchJson<unknown[]>("/api/Crimegrid/by-eldership", []),
  ]);

  const crimes = crimeRaw.map(normalizeCrime);
  const maxCrime = Math.max(...crimes.map((crime) => crime.total), 1);
  const currentCrime = findCrimeAtPoint(crimes, point.lat, point.lon);
  const safetyRating = currentCrime ? normalize(currentCrime.total, maxCrime, true) : 70;
  const health = currentCrime?.health ?? 0;
  const theft = currentCrime?.theft ?? 0;
  const other = Math.max(0, (currentCrime?.total ?? 0) - health - theft);
  const crimeTotal = Math.max(health + theft + other, 1);
  const averageTrips = frequency.length
    ? frequency.reduce((sum, entry) => sum + readFrequencyCount(entry), 0) / frequency.length
    : 0;
  const transitScore = Math.min(100, Math.round(averageTrips * 7));

  return {
    address,
    totalScore: Math.round((evaluation.totalScore + safetyRating + transitScore) / 3),
    safetyRating,
    crimeBreakdown: [
      { label: "Sveikata", value: Math.round((health / crimeTotal) * 100), color: "#176043" },
      { label: "Vagystės", value: Math.round((theft / crimeTotal) * 100), color: "#ef4444" },
      { label: "Kita", value: Math.round((other / crimeTotal) * 100), color: "#64748b" },
    ],
    nearestPois: evaluation.features.map((feature, index) => ({
      id: `${feature.type}-${index}`,
      type: feature.type || "POI",
      name: feature.name || "Objektas",
      distanceMeters: Math.round(feature.distance),
    })),
    transport: {
      walkScore: evaluation.totalScore,
      averageTripsPerHour: Number(averageTrips.toFixed(1)),
      nearestStop: stops[0]?.name ?? stops[0]?.Name ?? "Stotelė nerasta",
      peakWindow: frequency.length ? `${frequency[0].hour ?? frequency[0].Hour}:00+` : "nėra duomenų",
    },
  };
}
