import { useEffect, useRef, useState } from "react";
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

type Profile = "foot" | "bike" | "car";

const PROFILE_URLS: Record<Profile, string> = {
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1",
  bike: "https://routing.openstreetmap.de/routed-bike/route/v1",
  car: "https://routing.openstreetmap.de/routed-car/route/v1",
};

const PROFILE_LABELS: Record<Profile, string> = {
  foot: "Pėsčiomis",
  bike: "Dviračiu",
  car: "Automobiliu",
};

interface RoutingControlProps {
  start: L.LatLng | null;
  end: L.LatLng | null;
}

export default function RoutingControl({ start, end }: RoutingControlProps) {
  const map = useMap();
  const controlRef = useRef<L.Routing.Control | null>(null);
  const buttonsControlRef = useRef<L.Control | null>(null);
  const [profile, setProfile] = useState<Profile>("car");

  useEffect(() => {
    const ButtonsControl = L.Control.extend({
      options: { position: "bottomleft" },
      onAdd: function () {
        const container = L.DomUtil.create("div", "routing-mode-buttons");
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        return container;
      },
    });
    const ctrl = new ButtonsControl();
    ctrl.addTo(map);
    buttonsControlRef.current = ctrl;
    return () => {
      map.removeControl(ctrl);
      buttonsControlRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const ctrl = buttonsControlRef.current;
    if (!ctrl) return;
    const container = ctrl.getContainer();
    if (!container) return;
    container.innerHTML = "";
    container.style.display = start && end ? "flex" : "none";

    (Object.keys(PROFILE_URLS) as Profile[]).forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = PROFILE_LABELS[p];
      btn.className =
        "routing-mode-btn" + (profile === p ? " routing-mode-btn-active" : "");
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.stop(e);
        setProfile(p);
      });
      container.appendChild(btn);
    });
  }, [profile, start, end]);

  useEffect(() => {
    if (!start || !end) {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
      return;
    }

    if (controlRef.current) {
      map.removeControl(controlRef.current);
      controlRef.current = null;
    }

    controlRef.current = L.Routing.control({
      // @ts-ignore - 'position' is valid in Leaflet but missing in @types/leaflet-routing-machine
      position: "bottomleft",
      router: L.Routing.osrmv1({
        serviceUrl: PROFILE_URLS[profile],
        profile: profile === "car" ? "driving" : profile,
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

    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
    };
  }, [map, start, end, profile]);

  return null;
}
