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
  price_per_night: number;
  total_price: number;
  currency: string;
  rating: number;
  review_count: number;
  room_type: string;
  max_guests: number;
  beds: string;
  transport_note: string;
  checkin_policy: string;
  cancellation_policy: string;
  matched_filters: {
    pax: boolean;
    rooms: boolean;
    dates: boolean;
    budget: boolean;
    roomType: boolean;
  };
  issues: string[];
  score?: number;
  score_breakdown?: {
    price: number;
    itineraryFit: number;
    transport: number;
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
}
