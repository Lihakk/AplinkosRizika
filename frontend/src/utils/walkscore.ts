import type { Point } from "geojson";

const API_URL = import.meta.env.VITE_API_URL || "http://144.24.247.126:5178";
const RADIUS = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const inflightRequests = new Map<string, Promise<unknown>>();
const walkScoreCache = new Map<string, { expiresAt: number; value: WalkScoreResult }>();

interface WalkScoreResult {
  score: number;
  counts: Record<string, number>;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(4));
}

function coordinatePath(path: string, lat: number, lon: number, rest = "") {
  return `${path}?lat=${roundCoordinate(lat)}&lon=${roundCoordinate(lon)}${rest}`;
}

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const inflight = inflightRequests.get(path);
  if (inflight) return inflight as Promise<T>;

  const request = (async () => {
    const response = await fetch(`${API_URL}${path}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const value = (await response.json()) as T;
    responseCache.set(path, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  })();

  inflightRequests.set(path, request);

  try {
    return await request;
  } catch (error) {
    console.error(`Walk score API failed: ${path}`, error);
    return fallback;
  } finally {
    inflightRequests.delete(path);
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPointCoordinates(value: unknown): [number, number] | null {
  const point = safeJsonParse<Point>(value);
  if (!point || point.type !== "Point") return null;
  const [lon, lat] = point.coordinates;
  return typeof lat === "number" && typeof lon === "number" ? [lat, lon] : null;
}

async function countLayer(endpoint: string, lat: number, lng: number, radius = RADIUS) {
  const data = await fetchJson<unknown[]>(coordinatePath(`/api/MapFeatures/${endpoint}`, lat, lng, `&radius=${radius}`), []);
  return Array.isArray(data) ? data.length : 0;
}

async function countNearbyStops(lat: number, lng: number) {
  const stops = await fetchJson<unknown[]>(coordinatePath("/api/Transport/nearby-stops", lat, lng), []);
  return Array.isArray(stops)
    ? stops.filter((stop) => {
        if (!isRecord(stop)) return true;
        const coords = getPointCoordinates(stop.geometry ?? stop.Geometry);
        return !coords || haversineMeters(lat, lng, coords[0], coords[1]) <= RADIUS;
      }).length
    : 0;
}

async function countNearbySchools(lat: number, lng: number) {
  const schools = await fetchJson<unknown[]>("/api/School", []);
  if (!Array.isArray(schools)) return 0;

  return schools.filter((value) => {
    const item = isRecord(value) ? value : {};
    const coords = getPointCoordinates(item.location ?? item.Location);
    return coords ? haversineMeters(lat, lng, coords[0], coords[1]) <= RADIUS : false;
  }).length;
}

function computeScore(counts: Record<string, number>): number {
  const thresholds: Record<string, number> = {
    schools: 3,
    stores: 8,
    parks: 4,
    transport: 8,
    health: 3,
    sports: 3,
  };

  const weights: Record<string, number> = {
    schools: 16,
    stores: 24,
    parks: 18,
    transport: 24,
    health: 10,
    sports: 8,
  };

  return Math.round(
    Object.keys(weights).reduce((total, key) => {
      const raw = readNumber(counts[key]);
      return total + weights[key] * (1 - Math.exp(-raw / thresholds[key]));
    }, 0),
  );
}

export async function fetchWalkScore(lat: number, lng: number): Promise<WalkScoreResult> {
  const cacheKey = `${roundCoordinate(lat)}:${roundCoordinate(lng)}`;
  const cached = walkScoreCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [schools, stores, parks, transport, health, sports] = await Promise.all([
    countNearbySchools(lat, lng),
    countLayer("shops", lat, lng),
    countLayer("parks", lat, lng),
    countNearbyStops(lat, lng),
    countLayer("health-facilities", lat, lng),
    countLayer("sports-clubs", lat, lng),
  ]);

  const counts = { schools, stores, parks, transport, health, sports };
  const result = { score: computeScore(counts), counts };
  walkScoreCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  return result;
}
