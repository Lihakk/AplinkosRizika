import { LatLng } from "leaflet";

export interface AruodasParseResult {
  isAruodas: boolean;
  query: string;
  display: string;
  confidence: "high" | "medium" | "low";
  city?: string;
  district?: string;
  street?: string;
  coordinates?: LatLng;
}

const CITY_FROM_LOCATIVE: Record<string, string> = {
  alytuje: "Alytus",
  ariogaloje: "Ariogala",
  jonavoje: "Jonava",
  jurbarke: "Jurbarkas",
  kaune: "Kaunas",
  kedainiuose: "Kėdainiai",
  klaipedoje: "Klaipėda",
  marijampoleje: "Marijampolė",
  mazeikiuose: "Mažeikiai",
  panevezyje: "Panevėžys",
  raseiniuose: "Raseiniai",
  siauliuose: "Šiauliai",
  taurageje: "Tauragė",
  telsiuose: "Telšiai",
  vilkaviskyje: "Vilkaviškis",
  vilniuje: "Vilnius",
};

const DISTRICT_FROM_SLUG: Record<string, string> = {
  aleksote: "Aleksotas",
  antakalnyje: "Antakalnis",
  centre: "Centras",
  dainavoje: "Dainava",
  eiguliuose: "Eiguliai",
  fabijoniskese: "Fabijoniškės",
  justiniskese: "Justiniškės",
  karoliniskese: "Karoliniškės",
  lazdynuose: "Lazdynai",
  naujamiestyje: "Naujamiestis",
  pasilaiciuose: "Pašilaičiai",
  petrasiunuose: "Petrašiūnai",
  sanciuose: "Šančiai",
  senamiestyje: "Senamiestis",
  silainiuose: "Šilainiai",
  snipiskese: "Šnipiškės",
  vilijampoleje: "Vilijampolė",
  virsuliskese: "Viršuliškės",
  zaliakalnyje: "Žaliakalnis",
  zirmunuose: "Žirmūnai",
};

const WORD_REPLACEMENTS: Record<string, string> = {
  azuolyno: "Ąžuolyno",
  ciurlionio: "Čiurlionio",
  gedimino: "Gedimino",
  jablonskio: "Jablonskio",
  savanoriu: "Savanorių",
  taikos: "Taikos",
  ukmerges: "Ukmergės",
  vasario: "Vasario",
  vokieciu: "Vokiečių",
  zemaiciu: "Žemaičių",
};

const STREET_MARKERS: Record<string, string> = {
  al: "al.",
  g: "g.",
  gatve: "g.",
  pl: "pl.",
  pr: "pr.",
  prospektas: "pr.",
  skg: "skg.",
};

function latinize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function toTitle(value: string): string {
  const normalized = latinize(value).replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return "";

  return normalized
    .split(/\s+/)
    .map((word) => WORD_REPLACEMENTS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseCoordinates(input: string): LatLng | null {
  const decoded = decodeURIComponent(input);
  const labeled = decoded.match(/(?:lat|latitude)["'=:\s]+(-?\d{1,2}\.\d+)[\s\S]{0,80}?(?:lon|lng|longitude)["'=:\s]+(-?\d{1,3}\.\d+)/i);
  if (labeled) {
    return new LatLng(Number(labeled[1]), Number(labeled[2]));
  }

  const pair = decoded.match(/\b(5[3-6]\.\d{3,})\s*[,; ]\s*(2[0-6]\.\d{3,})\b/);
  if (pair) {
    return new LatLng(Number(pair[1]), Number(pair[2]));
  }

  return null;
}

function tryParseUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function extractSlugParts(url: URL): string[] {
  return decodeURIComponent(url.pathname)
    .split(/[/-]+/)
    .map((part) => latinize(part.trim()))
    .filter((part) => part && !/^\d+$/.test(part));
}

function findStreet(parts: string[]): string | undefined {
  const markerIndex = parts.findIndex((part) => STREET_MARKERS[part]);
  if (markerIndex <= 0) return undefined;

  const words: string[] = [];
  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (CITY_FROM_LOCATIVE[part] || DISTRICT_FROM_SLUG[part] || part.length < 2) break;
    words.unshift(part);
    if (words.length === 3) break;
  }

  const streetName = toTitle(words.join(" "));
  return streetName ? `${streetName} ${STREET_MARKERS[parts[markerIndex]]}` : undefined;
}

function parseAruodasUrl(input: string): AruodasParseResult | null {
  const url = tryParseUrl(input);
  if (!url || !url.hostname.toLowerCase().includes("aruodas.lt")) return null;

  const parts = extractSlugParts(url);
  const cityPart = parts.find((part) => CITY_FROM_LOCATIVE[part]);
  const districtPart = parts.find((part) => DISTRICT_FROM_SLUG[part]);
  const city = cityPart ? CITY_FROM_LOCATIVE[cityPart] : undefined;
  const district = districtPart ? DISTRICT_FROM_SLUG[districtPart] : undefined;
  const street = findStreet(parts);
  const coordinates = parseCoordinates(input) ?? undefined;
  const queryParts = [street, district, city, "Lithuania"].filter(Boolean);
  const displayParts = [street, district, city].filter(Boolean);

  return {
    isAruodas: true,
    query: queryParts.join(", "),
    display: displayParts.join(", ") || "Aruodas skelbimas",
    confidence: street && city ? "high" : city ? "medium" : "low",
    city,
    district,
    street,
    coordinates,
  };
}

function parseCopiedListing(input: string): AruodasParseResult | null {
  const coordinates = parseCoordinates(input) ?? undefined;
  const city = Object.values(CITY_FROM_LOCATIVE).find((candidate) =>
    latinize(input).includes(latinize(candidate)),
  );
  const streetMatch = input.match(/([A-ZĄČĘĖĮŠŲŪŽ0-9][\p{L}0-9.' -]{1,48}\s(?:g\.|pr\.|al\.|pl\.|skg\.))/u);
  const districtMatch = input.match(/(?:,|\n)\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}' -]{3,32})(?:,|\n)/u);
  const street = streetMatch?.[1]?.trim();
  const district = districtMatch?.[1]?.trim();

  if (!coordinates && !street && !city) return null;

  const queryParts = [street, district, city, "Lithuania"].filter(Boolean);
  const displayParts = [street, district, city].filter(Boolean);

  return {
    isAruodas: input.toLowerCase().includes("aruodas"),
    query: queryParts.join(", ") || input,
    display: displayParts.join(", ") || "Įklijuotas skelbimas",
    confidence: street && city ? "high" : coordinates ? "medium" : "low",
    city,
    district,
    street,
    coordinates,
  };
}

export function parseAruodasInput(input: string): AruodasParseResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  return parseAruodasUrl(trimmed) ?? parseCopiedListing(trimmed);
}
