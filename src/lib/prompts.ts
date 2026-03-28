import { ParsedItinerary, TripInput } from "@/types/itinerary";

export function parseItineraryPrompt(rawText: string): string {
  return [
    "You are a strict itinerary parser.",
    "Return valid JSON only with no markdown.",
    "Extract the trip details from the text below, even when format is informal or inconsistent.",
    "Infer likely destination city/area from context (locations, transport legs, attraction names) when not explicitly labeled.",
    "If check-in/check-out or budget are not stated, keep them empty/0 instead of hallucinating.",
    "If a field is missing, use reasonable defaults (empty string, 0, empty array).",
    "",
    "Expected JSON:",
    "{",
    '  "city": "Tokyo",',
    '  "checkIn": "2026-06-10",',
    '  "checkOut": "2026-06-14",',
    '  "nights": 4,',
    '  "pax": 2,',
    '  "rooms": 1,',
    '  "budget": 800,',
    '  "locations": ["Shibuya", "Asakusa", "Akihabara"],',
    '  "preferences": ["near train station", "late check-in", "free cancellation"],',
    '  "constraints": ["private room"]',
    "}",
    "",
    "Trip text:",
    rawText,
  ].join("\n");
}

export function selectBestAreaPrompt(parsed: ParsedItinerary): string {
  return [
    "You are selecting the best area to stay based on itinerary efficiency.",
    "Return JSON only.",
    "",
    "Goal:",
    "Minimize total travel time and maximize itinerary convenience.",
    "",
    "Input itinerary:",
    JSON.stringify(parsed, null, 2),
    "",
    "Return:",
    "{",
    '  "bestArea": "Ueno",',
    '  "reason": "Ueno gives the shortest overall travel time to the listed itinerary spots and has strong transport links."',
    "}",
  ].join("\n");
}

export function explainDecisionPrompt(args: {
  itinerary: ParsedItinerary;
  bestArea: string;
  rankedResults: unknown;
}): string {
  return [
    "You are explaining accommodation decision trade-offs.",
    "Keep it concrete and transparent.",
    "",
    "Explain:",
    "1) why bestOverall was chosen",
    "2) why cheaper options were rejected",
    "3) how the itinerary and area choice influenced the decision",
    "",
    "Itinerary:",
    JSON.stringify(args.itinerary, null, 2),
    "",
    `Best area: ${args.bestArea}`,
    "",
    "Ranked results:",
    JSON.stringify(args.rankedResults, null, 2),
  ].join("\n");
}

export function buildTinyFishGoal(input: TripInput & { bestArea: string }): string {
  const hasBudget = input.budget.amount > 0;
  const hasDates = Boolean(input.checkIn && input.checkOut);

  return [
    "You are an accommodation search execution agent.",
    "Search real accommodation websites only inside the chosen area.",
    "",
    "Constraints:",
    `- chosen area: ${input.bestArea}`,
    `- city: ${input.city}`,
    `- check-in: ${input.checkIn || "not provided"}`,
    `- check-out: ${input.checkOut || "not provided"}`,
    `- nights: ${input.nights > 0 ? input.nights : "not provided"}`,
    `- pax: ${input.pax}`,
    `- rooms: ${input.rooms}`,
    `- budget mode: ${input.budget.mode}`,
    hasBudget
      ? `- budget amount: ${input.budget.amount} ${input.budget.currency}`
      : "- budget amount: not provided (show all viable options; do not apply a price cap)",
    `- room type: ${input.roomType}`,
    `- property types: ${input.propertyTypes.join(", ")}`,
    `- preferences: ${input.preferences.join(", ") || "none"}`,
    "",
    "Instructions:",
    "- Search only these accommodation websites directly: Airbnb and Trip.com.",
    "- Do not use Google Travel or other aggregators as the final listing source.",
    "- Include listings from Airbnb and Trip.com when available.",
    "- Do not stop at site homepages. Navigate into search results and open individual listing detail pages before extracting data.",
    "- Browse beyond the first view when needed (pagination or scroll) to gather enough viable options.",
    "- listing_url must be a property detail page URL, not a homepage or generic search landing page.",
    hasDates
      ? "- Apply filters for dates, guests, rooms, room type, budget, and preferences when supported."
      : "- Date range is missing: search the target area without date filters and focus on viable properties.",
    hasBudget
      ? "- Use budget filters when available."
      : "- Do not enforce budget filtering; return broad viable results across price ranges.",
    "- Every listing must include a direct listing URL and its corresponding filtered search URL from that same platform.",
    "- Every search_url must be linkable and include filter/query parameters whenever that site supports it.",
    "- Inspect listing pages and extract up to 8 viable listings.",
    "- Return site-by-site audit details and listing details in strict JSON.",
    "- Include exact filtered search links whenever available.",
    "- Avoid login, payment, booking, or personal data submission.",
    "",
    "Output JSON shape:",
    "{",
    '  "sites_checked": [',
    "    {",
    '      "site_name": "Booking.com",',
    '      "search_url": "https://...",',
    '      "filters_applied": {',
    `        "checkIn": "${input.checkIn || ""}",`,
    `        "checkOut": "${input.checkOut || ""}",`,
    `        "pax": ${input.pax},`,
    `        "rooms": ${input.rooms},`,
    `        "budget": ${hasBudget ? input.budget.amount : 0},`,
    `        "roomType": "${input.roomType}"`,
    "      },",
    '      "missing_filters": []',
    "    }",
    "  ],",
    '  "listings": []',
    "}",
  ].join("\n");
}
