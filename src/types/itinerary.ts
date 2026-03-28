export type RunMode = "accommodation-only" | "full-agent";

export interface BudgetInput {
  mode: "total" | "nightly";
  amount: number;
  currency: string;
}

export interface TripInput {
  runMode: RunMode;
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pax: number;
  rooms: number;
  budget: BudgetInput;
  roomType: string;
  propertyTypes: Array<"hotel" | "airbnb" | "hostel" | "serviced-apartment">;
  preferences: string[];
  /** Dynamic search radius determined from itinerary geolocation spread */
  searchRadiusKm?: number;
  itineraryText?: string;
  sourceText?: string;
}

export interface GeocodedLocation {
  name: string;
  lat: number;
  lng: number;
  /** Likely transit mode to reach this location, e.g. "BTS", "MRT", "bus", "walking" */
  transitType: string;
}

export interface ParsedItinerary {
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pax: number;
  rooms: number;
  budget: number;
  locations: string[];
  preferences: string[];
  constraints: string[];
  /** Enriched with approximate coordinates and transit modes after geocoding step */
  geocodedLocations?: GeocodedLocation[];
  /** OpenAI-recommended search radius (km) around selected stay area */
  searchRadiusKm?: number;
}

export interface AreaSelection {
  bestArea: string;
  reason: string;
}
