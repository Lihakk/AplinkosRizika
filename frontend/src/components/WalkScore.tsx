import { useEffect, useMemo, useState } from "react";
import { LatLng } from "leaflet";
import { fetchWalkScore } from "../utils/walkscore";

function scoreLabel(score: number): string {
  if (score >= 90) return "Puikiai";
  if (score >= 70) return "Labai gerai";
  if (score >= 50) return "Gerai";
  if (score >= 25) return "Vidutiniškai";
  return "Silpnai";
}

interface WalkScoreProps {
  latlng: LatLng | null;
  onScore?: (score: number | null) => void;
}

interface WalkScoreState {
  key: string;
  score: number | null;
  error: string | null;
}

export default function WalkScore({ latlng, onScore }: WalkScoreProps) {
  const pointKey = useMemo(() => (latlng ? `${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)}` : ""), [latlng]);
  const [result, setResult] = useState<WalkScoreState>({ key: "", score: null, error: null });

  useEffect(() => {
    if (!latlng) {
      onScore?.(null);
      return;
    }

    let cancelled = false;

    fetchWalkScore(latlng.lat, latlng.lng)
      .then((data) => {
        if (!cancelled) {
          setResult({ key: pointKey, score: data.score, error: null });
          onScore?.(data.score);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ key: pointKey, score: null, error: "Vaikščiojamumo balo apskaičiuoti nepavyko." });
          onScore?.(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [latlng, onScore, pointKey]);

  if (!latlng || result.key !== pointKey) return null;
  if (result.error) return <p>{result.error}</p>;
  if (result.score === null) return null;

  return <p>Vaikščiojamumo balas: {result.score}/100 - {scoreLabel(result.score)}</p>;
}
