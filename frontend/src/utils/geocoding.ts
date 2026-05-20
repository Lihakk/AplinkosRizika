import { LatLng } from "leaflet";

const CITY_VIEWBOX: Record<string, string> = {
  Kaunas: "23.74106,55.00378,24.10293,54.80450",
  Vilnius: "24.8500,54.8200,25.4500,54.6000",
};

const KNOWN_CITIES = Object.keys(CITY_VIEWBOX);

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function addLithuanianContext(query: string, cityHint = "Kaunas") {
  const normalized = stripDiacritics(query);
  const hasKnownCity = KNOWN_CITIES.some((city) => normalized.includes(stripDiacritics(city)));
  const hasCountry = normalized.includes("lietuva") || normalized.includes("lithuania");

  if (hasKnownCity && hasCountry) return query;
  if (hasKnownCity) return `${query}, Lietuva`;
  return `${query}, ${cityHint}, Lietuva`;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
    { headers: { "Accept-Language": "lt,en" } }
  );
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export async function geocode(query: string, cityHint = "Kaunas"): Promise<LatLng | null> {
  const viewbox = CITY_VIEWBOX[cityHint] || CITY_VIEWBOX.Kaunas;
  const contextualQuery = addLithuanianContext(query, cityHint);

  const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(contextualQuery)}&format=json&limit=1&viewbox=${viewbox}&bounded=0&countrycodes=lt&addressdetails=1`;

  const res = await fetch(
    url,
    { headers: { "Accept-Language": "lt,en" } }
  );
  const data = await res.json();
  if (data.length === 0) return null;
  return new LatLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
}
