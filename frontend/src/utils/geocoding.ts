import { LatLng } from "leaflet";

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    { headers: { "Accept-Language": "en" } }
  );
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export async function geocode(query: string): Promise<LatLng | null> {
  const viewbox = "23.74106,55.00378,24.10293,54.80450";

  const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1&countrycodes=lt`;

  const res = await fetch(
    url,
    { headers: { "Accept-Language": "lt" } }
  );
  const data = await res.json();
  if (data.length === 0) return null;
  return new LatLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
}
