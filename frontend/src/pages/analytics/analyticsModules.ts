import { Building2, Compass, Home, Layers3 } from "lucide-react";
import type { AnalyticsModuleLink } from "./analyticsTypes";

export const analyticsModules: AnalyticsModuleLink[] = [
  {
    path: "/analytics/elderships",
    title: "Seniuniju palyginimas",
    eyebrow: "Teritorijos",
    description: "Lyginkite sauguma, pasiekiamuma, parkus, transporta ir mokyklu atstumus.",
    Icon: Layers3,
  },
  {
    path: "/analytics/real-estate",
    title: "NT skelbimu analize",
    eyebrow: "Aruodas",
    description: "Vertinkite busto skelbimus pagal kaina, plota ir kaimynystes kokybe.",
    Icon: Home,
  },
  {
    path: "/analytics/recommendation",
    title: "Ismanioji rekomendacija",
    eyebrow: "Prioritetai",
    description: "Suraskite tinkamiausius rajonus pagal jusu gyvenimo budo svorius.",
    Icon: Compass,
  },
  {
    path: "/analytics/deep-evaluation",
    title: "Issamus vietos vertinimas",
    eyebrow: "Dashboard",
    description: "Vieno adreso saugumo, infrastrukturos ir susisiekimo detalus pjuvis.",
    Icon: Building2,
  },
];
