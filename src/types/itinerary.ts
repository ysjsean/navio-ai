export interface ParsedItinerary {
  city: string;
  days: string[];
  locations: string[];
  constraints: string[];
  preferences: string[];
  budget?: string;
  dates?: {
    checkin: string;
    checkout: string;
  };
}

export interface AreaSelection {
  bestArea: string;
  reason: string;
}

export interface AgentStep {
  id: number;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

export interface AgentResult {
  bestArea: string;
  areaReason: string;
  bestOverall: import("./hotel").Listing | null;
  cheapestAcceptable: import("./hotel").Listing | null;
  backupOption: import("./hotel").Listing | null;
  rejectedOptions: import("./hotel").RejectedListing[];
  explanation: string;
}
