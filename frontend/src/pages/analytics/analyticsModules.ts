import { Building2, Compass, Home, Layers3 } from "lucide-react";
import type { AnalyticsModuleLink } from "./analyticsTypes";

export const analyticsModules: AnalyticsModuleLink[] = [
  {
    path: "/analytics/elderships",
    title: "Seniūnijų palyginimas",
    eyebrow: "Teritorijos",
    description: "Palyginkite miesto dalis pagal saugumą, parkus, transportą, paslaugas ir mokyklų artumą.",
    Icon: Layers3,
  },
  {
    path: "/analytics/real-estate",
    title: "NT skelbimų analizė",
    eyebrow: "Aruodas",
    description: "Greitai supraskite, ar būsto aplinka patogi kasdieniam gyvenimui.",
    Icon: Home,
  },
  {
    path: "/analytics/recommendation",
    title: "Išmanioji rekomendacija",
    eyebrow: "Prioritetai",
    description: "Nustatykite, kas jums svarbu, ir gaukite tinkamiausių vietų sąrašą.",
    Icon: Compass,
  },
  {
    path: "/analytics/deep-evaluation",
    title: "Išsamus vietos vertinimas",
    eyebrow: "Vertinimas",
    description: "Įveskite adresą ir gaukite aiškų vietos saugumo, paslaugų bei susisiekimo vaizdą.",
    Icon: Building2,
  },
];
