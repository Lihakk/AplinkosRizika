import { useEffect, useRef } from "react";
import L from "leaflet";
window.L = L;
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { useMap } from "react-leaflet";

const routeIcon = new L.Icon({
  iconUrl: "./icons/placeholder.png",
  iconSize: [38, 38],
  iconAnchor: [19, 38],
});

interface RoutingControlProps {
  start: L.LatLng | null;
  end: L.LatLng | null;
}

export default function RoutingControl({ start, end }: RoutingControlProps) {
  const map = useMap();
  const controlRef = useRef<L.Routing.Control | null>(null);

  useEffect(() => {
    if (!start || !end) {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
      return;
    }

    if (controlRef.current) {
      controlRef.current.setWaypoints([start, end]);
    } else {
      controlRef.current = L.Routing.control({
        // @ts-ignore - 'position' is valid in Leaflet but missing in @types/leaflet-routing-machine
        position: 'bottomleft',
        router: L.Routing.osrmv1({
          serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1',
          profile: 'driving',
        }),
        waypoints: [start, end],
        routeWhileDragging: true,
        showAlternatives: true,
        addWaypoints: false,
        fitSelectedRoutes: true,
        createMarker: function (i: number, waypoint: L.Routing.Waypoint) {
          if (i === 0) return null as unknown as L.Marker;
          return L.marker(waypoint.latLng, { icon: routeIcon });
        },
        altLineOptions: {
          styles: [
            { color: "black", opacity: 0.15, weight: 9 },
            { color: "white", opacity: 0.8, weight: 6 },
            { color: "blue", opacity: 0.5, weight: 2 },
          ],
          extendToWaypoints: true,
          missingRouteTolerance: 0,
        },
      }).addTo(map);
    }

    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
    };
  }, [map, start, end]);

  return null;
}
