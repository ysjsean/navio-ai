import { ParsedItinerary } from "@/types/itinerary";
import { Listing, RankedResults, RejectedOption } from "@/types/listing";
import { convertToSgd } from "@/lib/currency";

/**
 * 6-dimension scoring weights (sum = 100).
 * Transit convenience is the dominant factor because it directly affects
 * the experience of the itinerary: slow transit kills every day.
 */
const WEIGHTS = {
  transitConvenience: 30,
  price: 20,
  safety: 15,
  socialProof: 15,
  policy: 10,
  roomFit: 10,
} as const;

/**
 * Minimum platform rating accepted (out of 5.0 for Airbnb / TripAdvisor scale,
 * or 10 for Trip.com/Booking). Listings below this are soft-rejected.
 * We detect scale by magnitude: > 5 → /10 scale, ≤ 5 → /5 scale.
 */
const MIN_RATING_ON_5_SCALE = 3.5;
const MIN_RATING_ON_10_SCALE = 6.5;

/**
 * If avg transit time > this threshold (minutes), the listing gets a transit score of 0.
 * Anything ≤ this gets a proportionally higher score.
 */
const MAX_ACCEPTABLE_TRANSIT_MINUTES = 60;

export function rankListings(
  listings: Listing[],
  itinerary: ParsedItinerary,
  bestArea: string,
  /** Output of scoreTransitConvenience: area → avg transit minutes */
  transitMinutes: Record<string, number> = {},
  budgetCurrency = "SGD"
): RankedResults {
  const viable: Listing[] = [];
  const rejectedOptions: RejectedOption[] = [];
  const requiredRooms = deriveRequiredRooms(itinerary);
  const hasBudget = itinerary.budget > 0;

  for (const listing of listings) {
    const rejectionReasons = getHardRejections(listing, itinerary, requiredRooms);
    if (rejectionReasons.length > 0) {
      rejectedOptions.push({ listing, reasons: rejectionReasons });
      continue;
    }

    const avgMinutes = resolveTransitMinutes(listing, transitMinutes);
    const enriched: Listing = {
      ...listing,
      estimated_transit_minutes: avgMinutes ?? listing.estimated_transit_minutes,
      price_per_night_sgd:
        listing.price_per_night_sgd ?? convertToSgd(listing.price_per_night, listing.currency),
      total_price_sgd:
        listing.total_price_sgd ?? convertToSgd(listing.total_price, listing.currency),
    };
    const breakdown = buildScoreBreakdown(enriched, itinerary, bestArea, avgMinutes);
    const score = sumBreakdown(breakdown);

    viable.push({ ...enriched, score, score_breakdown: breakdown });
  }

  // User policy: default to cheapest; if budget exists, prioritize best fit within budget.
  viable.sort((a, b) => compareListings(a, b, itinerary, hasBudget, budgetCurrency));

  const bestOverall = viable[0] ?? null;
  const cheapestCandidate = [...viable].sort(
    (a, b) => resolvedTotalSgd(a) - resolvedTotalSgd(b)
  );
  const cheapestAcceptable =
    cheapestCandidate.find((item) => !isSameListing(item, bestOverall)) ?? null;
  const backupOption =
    viable.find(
      (item) =>
        !isSameListing(item, bestOverall) && !isSameListing(item, cheapestAcceptable)
    ) ?? null;

  return {
    bestOverall,
    cheapestAcceptable,
    backupOption,
    rejectedOptions,
  };
}

// ─── Hard rejection rules ─────────────────────────────────────────────────────
// Only reject on clear, unambiguous failures. Area mismatch is NOT a hard reject
// because geocoded centroid selection may have produced a different spelling.

function getHardRejections(
  listing: Listing,
  itinerary: ParsedItinerary,
  requiredRooms: number
): string[] {
  const reasons: string[] = [];

  if (listing.max_guests < itinerary.pax) {
    reasons.push("Insufficient guest capacity");
  }

  if (!listing.matched_filters.roomType) {
    reasons.push("Room type requirement not met");
  }

  if (requiredRooms > 1 && !listing.matched_filters.rooms) {
    reasons.push(`Room count requirement not met (needs ${requiredRooms} room(s))`);
  }

  if (!listing.matched_filters.dates) {
    reasons.push("Requested dates unavailable or invalid");
  }

  const ratingTooLow = isBelowMinRating(listing.rating);
  if (ratingTooLow) {
    reasons.push(`Rating too low (${listing.rating})`);
  }

  const preferenceBlob =
    `${listing.transport_note} ${listing.checkin_policy} ${listing.cancellation_policy}`.toLowerCase();

  if (
    itinerary.preferences.some(
      (p) =>
        p.toLowerCase().includes("late check-in") &&
        !preferenceBlob.includes("late") &&
        !preferenceBlob.includes("24")
    )
  ) {
    reasons.push("Critical preference failed: late check-in");
  }

  if (
    itinerary.preferences.some(
      (p) =>
        p.toLowerCase().includes("free cancellation") &&
        !preferenceBlob.includes("free cancellation") &&
        !preferenceBlob.includes("free cancel")
    )
  ) {
    reasons.push("Critical preference failed: free cancellation");
  }

  return reasons;
}

function isBelowMinRating(rating: number): boolean {
  if (!rating || rating <= 0) return false; // unknown rating — don't reject
  if (rating > 5) return rating < MIN_RATING_ON_10_SCALE; // /10 scale
  return rating < MIN_RATING_ON_5_SCALE; // /5 scale
}

// ─── Score breakdown ──────────────────────────────────────────────────────────

function buildScoreBreakdown(
  listing: Listing,
  itinerary: ParsedItinerary,
  bestArea: string,
  avgTransitMinutes: number | undefined
): NonNullable<Listing["score_breakdown"]> {
  // Transit convenience (30%) — lower minutes = higher score
  const transitScore =
    avgTransitMinutes !== undefined
      ? clamp01(1 - avgTransitMinutes / MAX_ACCEPTABLE_TRANSIT_MINUTES)
      : fallbackTransitScore(listing, bestArea);

  // Price/value (20%) — relative to budget ceiling
  const listingTotalSgd = resolvedTotalSgd(listing);
  const budgetCeiling =
    itinerary.budget > 0 ? itinerary.budget : listingTotalSgd * 1.4;
  const priceScore = clamp01(1 - listingTotalSgd / (budgetCeiling * 1.3));

  // Safety (15%) — from safety_note keywords or area match heuristic
  const safetyScore = deriveSafetyScore(listing);

  // Social proof (15%) — platform rating + review volume + TripAdvisor cross-ref
  const socialScore = deriveSocialProofScore(listing);

  // Policy (10%) — flexible check-in, free cancellation
  const policyText = `${listing.checkin_policy} ${listing.cancellation_policy}`;
  const policyScore = /free cancellation|24.hour|late check.in|self check.in/i.test(policyText)
    ? 1
    : 0.45;

  // Room fit (10%) — room type match + beds + guest capacity headroom
  const roomScore = deriveRoomFitScore(listing, itinerary);

  return {
    transitConvenience: round2(transitScore * WEIGHTS.transitConvenience),
    price: round2(priceScore * WEIGHTS.price),
    safety: round2(safetyScore * WEIGHTS.safety),
    socialProof: round2(socialScore * WEIGHTS.socialProof),
    policy: round2(policyScore * WEIGHTS.policy),
    roomFit: round2(roomScore * WEIGHTS.roomFit),
  };
}

function sumBreakdown(bd: NonNullable<Listing["score_breakdown"]>): number {
  return round2(
    bd.transitConvenience + bd.price + bd.safety + bd.socialProof + bd.policy + bd.roomFit
  );
}

/** Fallback when no AI transit estimate is available — use transport_note text + area proximity */
function fallbackTransitScore(listing: Listing, bestArea: string): number {
  const hasGoodTransport = /station|metro|bts|mrt|train|walk|transport/i.test(
    listing.transport_note
  );
  const areaMatches = stringMatch(listing.area, bestArea);
  if (areaMatches && hasGoodTransport) return 0.85;
  if (areaMatches || hasGoodTransport) return 0.6;
  return 0.35;
}

function deriveSafetyScore(listing: Listing): number {
  const note = (listing.safety_note || "").toLowerCase();
  if (!note) return 0.65; // neutral when unknown

  const positive = /safe|well.lit|tourist.friendly|central|popular|busy|secure/i.test(note);
  const negative = /avoid|unsafe|caution|be careful|crime|dangerous/i.test(note);

  if (positive && !negative) return 1.0;
  if (negative) return 0.25;
  return 0.65;
}

function deriveSocialProofScore(listing: Listing): number {
  // Normalise platform rating to 0–1
  const platformRating = listing.rating;
  const ratingNorm =
    platformRating > 5
      ? clamp01(platformRating / 10) // /10 scale
      : clamp01(platformRating / 5); // /5 scale

  // Review volume: log scale, saturates at ~500 reviews
  const reviewNorm = clamp01(Math.log10(Math.max(1, listing.review_count)) / 2.7);

  // TripAdvisor cross-reference (optional, /5 scale)
  const taRating = listing.tripadvisor_rating;
  const taNorm = taRating ? clamp01(taRating / 5) : ratingNorm; // fallback to platform rating

  // Weighted blend: 40% platform, 30% review volume, 30% TA cross-ref
  return clamp01(ratingNorm * 0.4 + reviewNorm * 0.3 + taNorm * 0.3);
}

function deriveRoomFitScore(listing: Listing, itinerary: ParsedItinerary): number {
  let score = 0;

  if (listing.matched_filters.roomType) score += 0.5;
  else score += 0.1;

  // Capacity headroom: just enough or lots of space
  if (listing.max_guests >= itinerary.pax) {
    const headroom = listing.max_guests - itinerary.pax;
    score += headroom === 0 ? 0.3 : headroom === 1 ? 0.4 : 0.5;
  }

  return clamp01(score);
}

// ─── Transit minutes resolution ───────────────────────────────────────────────

/**
 * Resolve transit minutes for a listing from the AI-produced map.
 * Try exact area match first, then a loose substring search.
 */
function resolveTransitMinutes(
  listing: Listing,
  transitMinutes: Record<string, number>
): number | undefined {
  const area = listing.area?.toLowerCase().trim();
  if (!area) return undefined;

  // Exact match
  for (const [key, minutes] of Object.entries(transitMinutes)) {
    if (key.toLowerCase().trim() === area) return minutes;
  }

  // Substring match
  for (const [key, minutes] of Object.entries(transitMinutes)) {
    const k = key.toLowerCase().trim();
    if (k.includes(area) || area.includes(k)) return minutes;
  }

  return undefined;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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

function deriveRequiredRooms(itinerary: ParsedItinerary): number {
  if (itinerary.rooms && itinerary.rooms > 0) return itinerary.rooms;
  const pax = Math.max(1, itinerary.pax || 1);
  return Math.ceil(pax / 2);
}

function isWithinBudget(
  listing: Listing,
  itinerary: ParsedItinerary,
  budgetCurrency: string
): boolean {
  if (!itinerary.budget || itinerary.budget <= 0) return true;
  const budgetSgd = convertToSgd(itinerary.budget, budgetCurrency) ?? itinerary.budget;
  return resolvedTotalSgd(listing) <= budgetSgd;
}

function compareListings(
  a: Listing,
  b: Listing,
  itinerary: ParsedItinerary,
  hasBudget: boolean,
  budgetCurrency: string
): number {
  if (!hasBudget) {
    // No budget provided: always cheapest first, then best score as tie-breaker.
    const aSgd = resolvedTotalSgd(a);
    const bSgd = resolvedTotalSgd(b);
    if (aSgd !== bSgd) return aSgd - bSgd;
    return (b.score || 0) - (a.score || 0);
  }

  const aIn = isWithinBudget(a, itinerary, budgetCurrency);
  const bIn = isWithinBudget(b, itinerary, budgetCurrency);
  if (aIn !== bIn) return aIn ? -1 : 1;

  // Budget provided: choose best fit among budget-valid options, then price.
  if ((a.score || 0) !== (b.score || 0)) return (b.score || 0) - (a.score || 0);
  return resolvedTotalSgd(a) - resolvedTotalSgd(b);
}

function resolvedTotalSgd(listing: Listing): number {
  return (
    listing.total_price_sgd ??
    convertToSgd(listing.total_price, listing.currency) ??
    listing.total_price
  );
}

function isSameListing(a: Listing | null, b: Listing | null): boolean {
  if (!a || !b) return false;
  if (a.listing_url && b.listing_url) return a.listing_url === b.listing_url;
  return a.site_name === b.site_name && a.listing_name === b.listing_name;
}
