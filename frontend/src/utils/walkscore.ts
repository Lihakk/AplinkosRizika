import pois from "../data/pois.json";

const RADIUS = 1000; // meters

interface WalkScoreResult {
  score: number;
  counts: Record<string, number>;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function countNearby(lat: number, lng: number, points: number[][]): number {
  let count = 0;
  for (const [pLat, pLon] of points) {
    if (haversineMeters(lat, lng, pLat, pLon) <= RADIUS) count++;
  }
  return count;
}

function computeScore(counts: Record<string, number>): number {
  const thresholds: Record<string, number> = { schools: 3, stores: 10, entertainment: 8, parks: 4 };
  let total = 0;
  for (const key of Object.keys(thresholds)) {
    const raw = counts[key] || 0;
    total += 25 * (1 - Math.exp(-raw / thresholds[key]));
  }
  return Math.round(total);
}

export function fetchWalkScore(lat: number, lng: number): Promise<WalkScoreResult> {
  const counts: Record<string, number> = {
    schools: countNearby(lat, lng, pois.schools),
    stores: countNearby(lat, lng, pois.stores),
    entertainment: countNearby(lat, lng, pois.entertainment),
    parks: countNearby(lat, lng, pois.parks),
  };
  const score = computeScore(counts);
  return Promise.resolve({ score, counts });
}
