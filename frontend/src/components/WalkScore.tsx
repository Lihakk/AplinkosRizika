import { useEffect, useState } from "react";
import { LatLng } from "leaflet";
import { fetchWalkScore } from "../utils/walkscore";

function scoreLabel(score: number): string {
  if (score >= 90) return "Puikiai vaikščiojama";
  if (score >= 70) return "Labai gerai vaikščiojama";
  if (score >= 50) return "Gerai vaikščiojama";
  if (score >= 25) return "Vidutiniškai vaikščiojama";
  return "Prastai vaikščiojama";
}

interface WalkScoreProps {
  latlng: LatLng | null;
}

export default function WalkScore({ latlng }: WalkScoreProps) {
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!latlng) {
      setScore(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setScore(null);
    setError(null);

    fetchWalkScore(latlng.lat, latlng.lng)
      .then((data) => {
        if (!cancelled) setScore(data.score);
      })
      .catch(() => {
        if (!cancelled) setError("Nepavyko gauti duomenų");
      });

    return () => { cancelled = true; };
  }, [latlng?.lat, latlng?.lng]);

  if (error) return <p>{error}</p>;
  if (score === null) return null;

  return (
    <p>Vaikščiojamumo balas: {score}/100 — {scoreLabel(score)}</p>
  );
}
