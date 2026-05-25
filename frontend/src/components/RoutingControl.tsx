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
  profile: 'car' | 'bike' | 'foot';
}

export default function RoutingControl({ start, end, profile }: RoutingControlProps) {
  const map = useMap();
  const controlRef = useRef<L.Routing.Control | null>(null);
  //type RouteProfile = 'car' | 'bike' | 'foot';
  //const [profile, setProfile] = useState<RouteProfile>('car');

  useEffect(() => {
    if (!start || !end) {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
      return;
    }

    const profileUrls = {
      car: 'https://routing.openstreetmap.de/routed-car/route/v1',
      bike: 'https://routing.openstreetmap.de/routed-bike/route/v1',
      foot: 'https://routing.openstreetmap.de/routed-foot/route/v1',
    }

    if (controlRef.current) {
      controlRef.current.setWaypoints([start, end]);
    } else {
      controlRef.current = L.Routing.control({
        position: 'bottomleft',
        router: L.Routing.osrmv1({
          serviceUrl: profileUrls[profile],
          profile: profile === 'car' ? 'driving' : profile === 'bike' ? 'cycling' : 'walking',
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
  }, [map, start, end, profile]);

  return null;
}
