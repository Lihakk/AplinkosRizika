import { Building2, Compass, Home, Layers3 } from "lucide-react";
import type { AnalyticsModuleLink } from "./analyticsTypes";

export const analyticsModules: AnalyticsModuleLink[] = [
  {
    path: "/analytics/elderships",
    title: "Seniūnijų palyginimas",
    eyebrow: "Teritorijos",
    description: "Lyginkite saugumą, pasiekiamumą, parkus, transportą ir mokyklų atstumus.",
    Icon: Layers3,
  },
  {
    path: "/analytics/real-estate",
    title: "NT skelbimų analizė",
    eyebrow: "Aruodas",
    description: "Vertinkite būsto skelbimus pagal kainą, plotą ir kaimynystės kokybę.",
    Icon: Home,
  },
  {
    path: "/analytics/recommendation",
    title: "Išmanioji rekomendacija",
    eyebrow: "Prioritetai",
    description: "Suraskite tinkamiausius rajonus pagal jūsų gyvenimo būdo prioritetus.",
    Icon: Compass,
  },
  {
    path: "/analytics/deep-evaluation",
    title: "Išsamus vietos vertinimas",
    eyebrow: "Vertinimas",
    description: "Vieno adreso saugumo, infrastruktūros ir susisiekimo detalus pjūvis.",
    Icon: Building2,
  },
];
