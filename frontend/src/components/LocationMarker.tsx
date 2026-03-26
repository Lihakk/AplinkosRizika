import { useState, useEffect, useRef } from "react";
import { Marker, useMapEvents } from "react-leaflet";
import { Icon, LatLng } from "leaflet";
import { reverseGeocode } from "../utils/geocoding";

interface SelectedPlace {
  latlng: LatLng;
  name: string;
}

interface LocationMarkerProps {
  customIcon: Icon;
  externalPosition: LatLng | null;
  onPlaceSelected: (place: SelectedPlace | null) => void;
  onDoubleClickResult: (latlng: LatLng, address: string) => void;
  onClickClear: () => void;
}

export default function LocationMarker({
  customIcon,
  externalPosition,
  onPlaceSelected,
  onDoubleClickResult,
  onClickClear,
}: LocationMarkerProps) {
  const [position, setPosition] = useState<LatLng | null>(null);
  const prevExternal = useRef<LatLng | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDblClick = useRef(false);

  useMapEvents({
    click() {
      // Delay click — if dblclick follows within 300ms, this gets cancelled
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickTimer.current = setTimeout(() => {
        if (!isDblClick.current) {
          setPosition(null);
          onPlaceSelected(null);
          onClickClear();
        }
        isDblClick.current = false;
      }, 300);
    },
    dblclick(e) {
      // Cancel any pending click handlers
      isDblClick.current = true;
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }

      setPosition(e.latlng);
      onPlaceSelected({ latlng: e.latlng, name: "Ieškoma adreso..." });

      reverseGeocode(e.latlng.lat, e.latlng.lng).then((address) => {
        onPlaceSelected({ latlng: e.latlng, name: address });
        onDoubleClickResult(e.latlng, address);
      });

      // Reset flag after all click events have passed
      setTimeout(() => { isDblClick.current = false; }, 500);
    },
  });

  useEffect(() => {
    if (
      externalPosition &&
      (!prevExternal.current || !prevExternal.current.equals(externalPosition))
    ) {
      prevExternal.current = externalPosition;
      setPosition(externalPosition);
      onPlaceSelected({ latlng: externalPosition, name: "Paieškos rezultatas" });
    }
  }, [externalPosition]);

  return position ? <Marker position={position} icon={customIcon} /> : null;
}
