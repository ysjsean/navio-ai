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
  itineraryText?: string;
  sourceText?: string;
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
}

export interface AreaSelection {
  bestArea: string;
  reason: string;
}
