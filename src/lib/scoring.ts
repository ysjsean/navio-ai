import { Listing, RejectedListing, RankedResults } from "@/types/hotel";
import { ParsedItinerary } from "@/types/itinerary";

// Scoring weights
const WEIGHTS = {
  price: 0.4,
  itineraryFit: 0.3,
  transport: 0.15,
  policy: 0.15,
};

// Minimum acceptable rating
const MIN_RATING = 3.5;

export function rankListings(
  listings: Listing[],
  parsed: ParsedItinerary,
  bestArea?: string
): RankedResults {
  const accepted: (Listing & { score: number })[] = [];
  const rejected: RejectedListing[] = [];

  for (const listing of listings) {
    const rejection = checkRejection(listing, parsed, bestArea);
    if (rejection) {
      rejected.push({ ...listing, rejectionReason: rejection });
      continue;
    }

    const score = scoreListing(listing, parsed, bestArea);
    accepted.push({ ...listing, score });
  }

  // Sort by score descending (higher is better)
  accepted.sort((a, b) => b.score - a.score);

  // Sort accepted by price for cheapest acceptable
  const byPrice = [...accepted].sort((a, b) => a.price - b.price);

  return {
    bestOverall: accepted[0] ?? null,
    cheapestAcceptable: byPrice[0] ?? null,
    backupOption: accepted[1] ?? byPrice[1] ?? null,
    rejectedOptions: rejected,
  };
}

function checkRejection(
  listing: Listing,
  parsed: ParsedItinerary,
  bestArea?: string
): string | null {
  // Reject if rating is too low
  if (listing.rating < MIN_RATING) {
    return `Rating ${listing.rating} is below minimum ${MIN_RATING}`;
  }

  // Reject if outside best area (when we have area info)
  if (
    bestArea &&
    listing.area.toLowerCase() !== bestArea.toLowerCase() &&
    !listing.area.toLowerCase().includes(bestArea.toLowerCase()) &&
    !bestArea.toLowerCase().includes(listing.area.toLowerCase())
  ) {
    return `Located in ${listing.area}, not in recommended area ${bestArea}`;
  }

  // Reject if constraints are mismatched
  for (const constraint of parsed.constraints) {
    const lower = constraint.toLowerCase();
    const policyLower = listing.policy.toLowerCase();

    if (lower.includes("late check-in") && !policyLower.includes("late check-in") && !policyLower.includes("24h")) {
      return `Does not support late check-in (constraint: "${constraint}")`;
    }

    if (lower.includes("free cancellation") && policyLower.includes("non-refundable")) {
      return `Non-refundable policy conflicts with "${constraint}"`;
    }
  }

  return null;
}

function scoreListing(
  listing: Listing,
  parsed: ParsedItinerary,
  bestArea?: string
): number {
  let score = 0;

  // Price score — cheaper is better, normalized (inverse)
  // Assume max budget ~300/night; scale 0–1
  const maxBudget = parsed.budget ? parseFloat(parsed.budget) * 1.5 : 300;
  const priceScore = Math.max(0, 1 - listing.price / maxBudget);
  score += priceScore * WEIGHTS.price;

  // Itinerary fit — is it in the best area?
  let fitScore = 0.5; // default middle
  if (bestArea) {
    if (
      listing.area.toLowerCase() === bestArea.toLowerCase() ||
      listing.area.toLowerCase().includes(bestArea.toLowerCase())
    ) {
      fitScore = 1;
    }
  }
  score += fitScore * WEIGHTS.itineraryFit;

  // Transport score — based on policy keywords
  let transportScore = 0.5;
  const policyLower = listing.policy.toLowerCase();
  if (policyLower.includes("near transport") || policyLower.includes("station")) {
    transportScore = 1;
  }
  if (listing.rating >= 4.5) {
    transportScore = Math.min(1, transportScore + 0.2);
  }
  score += transportScore * WEIGHTS.transport;

  // Policy score — flexible policies score higher
  let policyScore = 0.5;
  if (policyLower.includes("free cancellation") || policyLower.includes("flexible")) {
    policyScore += 0.3;
  }
  if (policyLower.includes("late check-in") || policyLower.includes("24h")) {
    policyScore += 0.2;
  }
  if (policyLower.includes("non-refundable")) {
    policyScore -= 0.3;
  }
  policyScore = Math.max(0, Math.min(1, policyScore));
  score += policyScore * WEIGHTS.policy;

  return Math.round(score * 100) / 100;
}
