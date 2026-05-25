import type { LucideIcon } from "lucide-react";

export interface AnalyticsModuleLink {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  Icon: LucideIcon;
}

export interface EldershipMetric {
  id: string;
  name: string;
  totalCrimeRate: number;
  averageAccessibilityScore: number;
  parks: number;
  publicTransportStops: number;
  averageSchoolDistance: number;
}

export interface RealEstateListingAnalytics {
  id: string;
  title: string;
  address: string;
  price: number;
  area: number;
  lat: number;
  lon: number;
  imageUrl?: string;
  url?: string;
  distance?: number;
  scores: {
    walkability: number;
    safety: number;
    services: number;
  };
}

export interface NeighborhoodPreference {
  safety: number;
  transport: number;
  greenery: number;
  nightlife: number;
}

export interface NeighborhoodProfile {
  id: string;
  name: string;
  summary: string;
  scores: NeighborhoodPreference;
  medianPrice: number;
  matchedSignals: string[];
}

export interface DeepEvaluationPoint {
  address: string;
  totalScore: number;
  safetyRating: number;
  crimeBreakdown: Array<{
    label: string;
    value: number;
    color: string;
  }>;
  nearestPois: Array<{
    id: string;
    type: string;
    name: string;
    distanceMeters: number;
  }>;
  transport: {
    walkScore: number;
    averageTripsPerHour: number;
    nearestStop: string;
    peakWindow: string;
  };
}
