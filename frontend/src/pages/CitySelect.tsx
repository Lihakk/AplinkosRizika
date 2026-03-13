import { Link } from "react-router-dom";
import { useRef } from "react";
import "./CitySelect.css";

const cities = [
  "Kaunas",
  "Vilnius",
  "Klaipėda",
  "Šiauliai",
  "Panevėžys",
  "Ariogala",
  "Vilkaviškis",
  "Raseiniai",
  "Jurbarkas",
  "Kėdainiai"
];

export default function CitySelect() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollBy({
      left: e.deltaY * 0.9,   // smaller multiplier = smoother movement
      behavior: "smooth"
    });
    }
  };

  return (
    <div className="city-select-container">
      <h1>Pasirink miestą</h1>

      <div
        className="city-scroll"
        ref={scrollRef}
        onWheel={handleWheel}
      >
        {cities.map((city) => (
          <Link
            key={city}
            to={`/map?city=${encodeURIComponent(city)}`}
            className="city-card"
          >
            {city}
          </Link>
        ))}
      </div>
    </div>
  );
}