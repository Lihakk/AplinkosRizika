import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Search } from "lucide-react";
import "./CitySelect.css";

// I added a few more cities and sorted them so the grid looks full and organized
const allCities = [
  "Alytus", "Ariogala", "Jonava", "Jurbarkas", "Kaunas", 
  "Kėdainiai", "Klaipėda", "Marijampolė", "Mažeikiai", "Panevėžys", 
  "Raseiniai", "Šiauliai", "Tauragė", "Telšiai", "Vilnius", "Vilkaviškis"
].sort();

export default function CitySelect() {
  const [searchQuery, setSearchQuery] = useState("");

  // Dynamically filter cities based on the search input
  const filteredCities = allCities.filter(city =>
    city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="landing-container">
      <div className="content-wrapper">
        <h1 className="title">Aplinkos Rizika</h1>
        <p className="subtitle">Pasirinkite miestą analizei</p>

        {/* Dynamic Search Bar */}
        <div className="search-container">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            placeholder="Ieškoti miesto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            autoFocus
          />
        </div>

        {/* Filtered Grid */}
        <div className="city-grid">
          {filteredCities.length > 0 ? (
            filteredCities.map((city) => (
              <Link key={city} to={`/map?city=${encodeURIComponent(city)}`} className="city-link">
                <MapPin size={18} />
                <span>{city}</span>
              </Link>
            ))
          ) : (
            <div className="no-results">Miestas "{searchQuery}" nerastas.</div>
          )}
        </div>
      </div>
    </div>
  );
}