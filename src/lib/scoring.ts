import { ParsedItinerary } from "@/types/itinerary";
import { Listing, RankedResults, RejectedOption } from "@/types/listing";

const WEIGHTS = {
  price: 30,
  itineraryFit: 25,
  transport: 15,
  policy: 15,
  roomFit: 15,
} as const;

const MIN_ACCEPTABLE_RATING = 7.2;

export function rankListings(
  listings: Listing[],
  itinerary: ParsedItinerary,
  bestArea: string
): RankedResults {
  const viable: Listing[] = [];
  const rejectedOptions: RejectedOption[] = [];

  for (const listing of listings) {
    const rejectionReasons = getHardRejections(listing, itinerary, bestArea);
    if (rejectionReasons.length > 0) {
      rejectedOptions.push({ listing, reasons: rejectionReasons });
      continue;
    }

    viable.push({
      ...listing,
      score: calculateScore(listing, itinerary, bestArea),
      score_breakdown: buildScoreBreakdown(listing, itinerary, bestArea),
    });
  }

  viable.sort((a, b) => (b.score || 0) - (a.score || 0));

  const cheapestAcceptable = [...viable].sort(
    (a, b) => a.total_price - b.total_price
  )[0] ?? null;

  return {
    bestOverall: viable[0] ?? null,
    cheapestAcceptable,
    backupOption: viable[1] ?? null,
    rejectedOptions,
  };
}

function getHardRejections(
  listing: Listing,
  itinerary: ParsedItinerary,
  bestArea: string
): string[] {
  const reasons: string[] = [];
  const areaMatches = stringMatch(listing.area, bestArea);

  if (!areaMatches) reasons.push(`Outside chosen area: ${bestArea}`);
  if (listing.max_guests < itinerary.pax) reasons.push("Insufficient guest capacity");
  if (!listing.matched_filters.rooms) reasons.push("Room count requirement not met");
  if (!listing.matched_filters.roomType) reasons.push("Room type requirement not met");
  if (!listing.matched_filters.dates) reasons.push("Requested dates unavailable or invalid");
  if (listing.rating < MIN_ACCEPTABLE_RATING) {
    reasons.push(`Rating too low (${listing.rating})`);
  }

  const preferenceBlob = `${listing.transport_note} ${listing.checkin_policy} ${listing.cancellation_policy}`.toLowerCase();
  if (itinerary.preferences.some((p) => p.toLowerCase().includes("late") && !preferenceBlob.includes("late") && !preferenceBlob.includes("24"))) {
    reasons.push("Critical preference failed: late check-in");
  }
  if (itinerary.preferences.some((p) => p.toLowerCase().includes("free cancellation") && !preferenceBlob.includes("free cancellation"))) {
    reasons.push("Critical preference failed: free cancellation");
  }

  return reasons;
}

function calculateScore(
  listing: Listing,
  itinerary: ParsedItinerary,
  bestArea: string
): number {
  const breakdown = buildScoreBreakdown(listing, itinerary, bestArea);
  return (
    breakdown.price +
    breakdown.itineraryFit +
    breakdown.transport +
    breakdown.policy +
    breakdown.roomFit
  );
}

function buildScoreBreakdown(
  listing: Listing,
  itinerary: ParsedItinerary,
  bestArea: string
): Listing["score_breakdown"] {
  const budgetFloor = itinerary.budget > 0 ? itinerary.budget : listing.total_price * 1.2;
  const priceRatio = clamp01(1 - listing.total_price / (budgetFloor * 1.35));
  const areaScore = stringMatch(listing.area, bestArea) ? 1 : 0;
  const transportScore = /station|metro|train|walk|transport/i.test(listing.transport_note)
    ? 1
    : 0.45;
  const policyText = `${listing.checkin_policy} ${listing.cancellation_policy}`;
  const policyScore = /free cancellation|24-hour|24 hour|late check-in/i.test(policyText)
    ? 1
    : 0.5;
  const roomScore = listing.matched_filters.roomType ? 1 : 0.4;

  return {
    price: round2(priceRatio * WEIGHTS.price),
    itineraryFit: round2(areaScore * WEIGHTS.itineraryFit),
    transport: round2(transportScore * WEIGHTS.transport),
    policy: round2(policyScore * WEIGHTS.policy),
    roomFit: round2(roomScore * WEIGHTS.roomFit),
  };
}

function stringMatch(a: string, b: string): boolean {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  return left === right || left.includes(right) || right.includes(left);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
