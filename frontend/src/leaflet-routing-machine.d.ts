import * as L from "leaflet";

declare module "leaflet" {
  namespace Routing {
    interface OSRMv1Options {
      serviceUrl?: string;
      profile?: string;
    }

    function osrmv1(options?: OSRMv1Options): any;

    interface ControlOptions {
      waypoints: L.LatLng[];
      router?: any;
      routeWhileDragging?: boolean;
      showAlternatives?: boolean;
      addWaypoints?: boolean;
      fitSelectedRoutes?: boolean;
      createMarker?: (i: number, waypoint: Waypoint, n: number) => L.Marker;
      altLineOptions?: {
        styles: L.PathOptions[];
        extendToWaypoints?: boolean;
        missingRouteTolerance?: number;
      };
    }

    interface Waypoint {
      latLng: L.LatLng;
    }

    interface Control extends L.Control {
      setWaypoints(waypoints: L.LatLng[]): this;
    }

    function control(options: ControlOptions): Control;
  }
}

declare module "leaflet-routing-machine" {}
declare module "leaflet-routing-machine/dist/leaflet-routing-machine.css" {}
