export interface ListingFiltersApplied {
  checkIn?: string;
  checkOut?: string;
  pax?: number;
  rooms?: number;
  budget?: number;
  roomType?: string;
}

export interface SiteAuditRecord {
  site_name: string;
  search_url?: string;
  filters_applied: ListingFiltersApplied;
  missing_filters: string[];
}

export interface Listing {
  site_name: string;
  listing_name: string;
  listing_url: string;
  search_url?: string;
  area: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
  geo_source?: string;
  geo_reference_url?: string;
  price_per_night: number;
  total_price: number;
  currency: string;
  /** Deterministic FX projection for fair cross-currency comparison */
  price_per_night_sgd?: number;
  total_price_sgd?: number;
  rating: number;
  review_count: number;
  room_type: string;
  max_guests: number;
  beds: string;
  transport_note: string;
  checkin_policy: string;
  cancellation_policy: string;
  house_rules?: string;
  matched_filters: {
    pax: boolean;
    rooms: boolean;
    dates: boolean;
    budget: boolean;
    roomType: boolean;
  };
  issues: string[];
  /** Independent rating pulled from TripAdvisor (0–10 scale) */
  tripadvisor_rating?: number;
  tripadvisor_reviews?: number;
  /** Safety/neighbourhood context from TripAdvisor or OpenAI area knowledge */
  safety_note?: string;
  /** Average estimated transit minutes from this listing area to all itinerary waypoints */
  estimated_transit_minutes?: number;
  score?: number;
  score_breakdown?: {
    transitConvenience: number;
    price: number;
    safety: number;
    socialProof: number;
    policy: number;
    roomFit: number;
  };
}

export interface RejectedOption {
  listing: Listing;
  reasons: string[];
}

export interface RankedResults {
  bestOverall: Listing | null;
  cheapestAcceptable: Listing | null;
  backupOption: Listing | null;
  rejectedOptions: RejectedOption[];
}

export interface TinyFishSearchResult {
  streaming_url?: string;
  sites_checked: SiteAuditRecord[];
  listings: Listing[];
  metrics?: {
    startedAt: string;
    completedAt: string;
    totalMs: number;
    sites: Array<{
      site: string;
      startedAt: string;
      firstProgressAt?: string;
      completedAt: string;
      queuedMs?: number;
      executionMs: number;
      totalMs: number;
      status: "fulfilled" | "rejected";
      error?: string;
    }>;
    blockedLikely: boolean;
    blockedSignals: string[];
  };
}

export interface FinalRunResult {
  runId: string;
  runMode?: import("./itinerary").RunMode;
  itinerary: import("./itinerary").ParsedItinerary;
  bestArea: string;
  areaReason: string;
  tinyfishStreamingUrl?: string;
  sitesChecked: SiteAuditRecord[];
  rankings: RankedResults;
  explanation: string;
  usedMockData: boolean;
  errorNote?: string;
  tinyfishMetrics?: TinyFishSearchResult["metrics"];
}
