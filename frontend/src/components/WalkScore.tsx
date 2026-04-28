import { useEffect, useState } from "react";
import { LatLng } from "leaflet";
import { fetchWalkScore } from "../utils/walkscore";

function scoreLabel(score: number): string {
  if (score >= 90) return "Puikiai";
  if (score >= 70) return "Labai gerai";
  if (score >= 50) return "Gerai";
  if (score >= 25) return "Normaliai";
  return "Prastai";
}

interface WalkScoreProps {
  latlng: LatLng | null;
  onScore?: (score: number | null) => void;
}

export default function WalkScore({ latlng, onScore }: WalkScoreProps) {
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!latlng) {
      setScore(null);
      setError(null);
      onScore?.(null);
      return;
    }

    let cancelled = false;
    setScore(null);
    setError(null);

    fetchWalkScore(latlng.lat, latlng.lng)
      .then((data) => {
        if (!cancelled) {
          setScore(data.score);
          onScore?.(data.score);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Nepavyko gauti duomenų");
          onScore?.(null);
        }
      });

    return () => { cancelled = true; };
  }, [latlng?.lat, latlng?.lng]);

  if (error) return <p>{error}</p>;
  if (score === null) return null;

  return (
    <p>Vaikščiojamumo balas: {score}/100 — {scoreLabel(score)}</p>
  );
}
