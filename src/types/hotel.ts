export interface Listing {
  name: string;
  price: number;
  rating: number;
  area: string;
  policy: string;
  url: string;
  source: "hotel" | "airbnb" | "hostel" | "serviced-apartment";
  score?: number;
}

export interface RejectedListing extends Listing {
  rejectionReason: string;
}

export interface RankedResults {
  bestOverall: Listing | null;
  cheapestAcceptable: Listing | null;
  backupOption: Listing | null;
  rejectedOptions: RejectedListing[];
}
