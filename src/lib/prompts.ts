import { GeocodedLocation, ParsedItinerary, TripInput } from "@/types/itinerary";

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

export function geocodeLocationsPrompt(locations: string[], city: string): string {
  return [
    `You are geocoding itinerary locations in ${city}.`,
    "Return JSON only. Use your knowledge of the city's geography and public transport.",
    "",
    "For each location, provide:",
    "- lat/lng coordinates (2 decimal places is sufficient)",
    "- transitType: the most practical public transit mode to reach it (BTS, MRT, BRT, bus, subway, tram, walking, taxi)",
    "",
    "Locations to geocode:",
    JSON.stringify(locations),
    "",
    "Return:",
    "{",
    '  "locations": [',
    '    { "name": "Chatuchak Weekend Market", "lat": 13.80, "lng": 100.55, "transitType": "BTS" }',
    "  ]",
    "}",
  ].join("\n");
}

export function transitScoringPrompt(
  listingAreas: string[],
  itineraryLocations: GeocodedLocation[],
  city: string
): string {
  return [
    `You are estimating public transit travel times in ${city}.`,
    "Return JSON only. Use your knowledge of the city's transit network and typical speeds.",
    "",
    "For each listing area, estimate the AVERAGE transit time in minutes to reach all itinerary locations listed below.",
    "Factor in: walking to transit stop, wait time, ride time, transfers. Be realistic — not the best case.",
    "",
    "Listing areas:",
    JSON.stringify(listingAreas),
    "",
    "Itinerary locations:",
    JSON.stringify(itineraryLocations, null, 2),
    "",
    "Return:",
    "{",
    '  "transit_estimates": [',
    '    { "area": "Sukhumvit", "avg_minutes": 28, "note": "BTS Asok → BTS Mo Chit" }',
    "  ]",
    "}",
  ].join("\n");
}

export function searchRadiusPrompt(args: {
  city: string;
  bestArea: string;
  geocodedLocations: GeocodedLocation[];
}): string {
  return [
    `You are deciding an accommodation search radius in ${args.city}.`,
    "Return JSON only.",
    "",
    "Goal:",
    "Choose a practical radius (in km) around the best stay area that can cover itinerary points efficiently.",
    "Use tighter radius for clustered points, wider radius for spread-out points.",
    "Prefer transit-efficient compact radius first; avoid overly broad search unless needed.",
    "",
    `Best area anchor: ${args.bestArea}`,
    "Geocoded itinerary points:",
    JSON.stringify(args.geocodedLocations, null, 2),
    "",
    "Return:",
    "{",
    '  "radiusKm": 2.5,',
    '  "reason": "Most itinerary points cluster around central BTS corridor; 2.5km captures high-fit inventory while limiting irrelevant outskirts."',
    "}",
  ].join("\n");
}

export function selectBestAreaPrompt(
  parsed: ParsedItinerary,
  geocodedLocations?: GeocodedLocation[]
): string {
  const geocodedSection =
    geocodedLocations && geocodedLocations.length > 0
      ? [
          "",
          "Geocoded location data (use to estimate transit-weighted centroid):",
          JSON.stringify(geocodedLocations, null, 2),
        ].join("\n")
      : "";

  return [
    "You are selecting the best neighbourhood to stay based on itinerary efficiency.",
    "Return JSON only.",
    "",
    "Goal:",
    "Pick the single area that minimises average transit time to ALL itinerary waypoints.",
    "Prefer areas with direct BTS/MRT access over bus-only connections.",
    "Prefer central/safe areas when waypoints are spread across the city.",
    "",
    "Input itinerary:",
    JSON.stringify(parsed, null, 2),
    geocodedSection,
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
    "Keep it concrete and transparent. Use specific numbers where available.",
    "",
    "Explain:",
    "1) why bestOverall was chosen (mention estimated_transit_minutes if present, tripadvisor_rating if available)",
    "2) what the score_breakdown reveals — highlight the highest and lowest scoring dimensions",
    "3) why cheaper options were rejected or ranked lower",
    "4) how the itinerary locations and chosen area influenced transit convenience",
    "",
    "Itinerary:",
    JSON.stringify(args.itinerary, null, 2),
    "",
    `Best area: ${args.bestArea}`,
    "",
    "Ranked results (includes score_breakdown per listing):",
    JSON.stringify(args.rankedResults, null, 2),
  ].join("\n");
}

export function buildTinyFishGoal(
  input: TripInput & { bestArea: string; targetSite?: "airbnb" | "trip" }
): string {
  const hasBudget = input.budget.amount > 0;
  const hasDates = Boolean(input.checkIn && input.checkOut);
  const searchLocation = [input.bestArea, input.city].filter(Boolean).join(", ");
  const listingDepth = 4;
  const tripAdvisorDepth = 6;
  const includeAirbnb = !input.targetSite || input.targetSite === "airbnb";
  const includeTrip = !input.targetSite || input.targetSite === "trip";

  const dateInstructions = hasDates
    ? `check-in ${input.checkIn}, check-out ${input.checkOut}`
    : "no specific dates (search for general availability)";

  const budgetInstructions = hasBudget
    ? `maximum budget ${input.budget.amount} ${input.budget.currency} ${input.budget.mode}`
    : "no budget cap — show all price ranges";

  return [
    "You are a browser automation agent searching for accommodation listings.",
    "Follow the steps below exactly for each site. Do not skip steps.",
    "",
    `Search target: ${searchLocation}`,
    `Dates: ${dateInstructions}`,
    `Guests: ${input.pax} adults`,
    `Rooms: ${input.rooms}`,
    `Room type preference: ${input.roomType}`,
    `Budget: ${budgetInstructions}`,
    `Preferences: ${input.preferences.join(", ") || "none"}`,
    input.searchRadiusKm
      ? `Search radius constraint: prioritize listings within ${input.searchRadiusKm} km of ${input.bestArea}.`
      : "",
    input.searchRadiusKm
      ? "If insufficient listings are available in this radius, still return what you found and keep extracted links valid."
      : "",
    "",
    ...(includeAirbnb
      ? [
          "=== SITE 1: Airbnb (https://www.airbnb.com) ===",
          "Step 1. Navigate to https://www.airbnb.com",
          "Step 2. Before searching, handle consent/cookie banners immediately: click \"Accept\", \"I Agree\", or close banner so search inputs are fully interactable.",
          `Step 3. Type "${searchLocation}" into the destination/search box and select the matching suggestion.`,
          hasDates
            ? `Step 4. Set check-in to ${input.checkIn} and check-out to ${input.checkOut}.`
            : "Step 4. Skip date inputs — no dates provided.",
          `Step 5. Set guests to ${input.pax} adults.`,
          "Step 6. Click Search.",
          hasBudget
            ? `Step 7. Open price filter and set maximum to ${input.budget.amount} ${input.budget.currency}.`
            : "Step 7. Leave price filter open — no cap.",
          `Step 8. Apply room type filter for "${input.roomType}" if available.`,
          "Step 9. If a consent banner/pop-up reappears after filtering, close it before scrolling or opening listings.",
          "Step 10. On the results page, perform natural scrolling to load more cards (scroll down, pause 1-2 seconds, repeat at least 3 times).",
          `Step 11. From the visible results after scrolling, open each of the first ${listingDepth} listing cards individually.`,
          "Step 12. On each listing detail page extract: listing name, listing URL, price per night, total price, area/neighbourhood, postal code (if visible), latitude/longitude (if visible), rating, review count, room type, max guests, beds, check-in policy, cancellation policy, house rules (quiet hours, smoking/pets/party restrictions), transport/location note.",
          "Step 13. Record the filtered results search URL you landed on after applying filters.",
          "",
        ]
      : []),
    ...(includeTrip
      ? [
          "=== SITE 2: Trip.com (https://www.trip.com) ===",
          "Step 1. Navigate to https://www.trip.com",
          "Step 2. Before searching, handle consent/cookie banners immediately: click \"Accept\", \"I Agree\", or close banner so inputs are usable.",
          "Step 3. Click on Hotels.",
          `Step 4. Type "${searchLocation}" into the destination box and select the correct suggestion.`,
          hasDates
            ? `Step 5. Set check-in to ${input.checkIn} and check-out to ${input.checkOut}.`
            : "Step 5. Skip date inputs — no dates provided.",
          `Step 6. Set guests to ${input.pax} adults and ${input.rooms} room(s).`,
          "Step 7. Click Search.",
          hasBudget
            ? `Step 8. Apply price filter with maximum ${input.budget.amount} ${input.budget.currency}.`
            : "Step 8. Leave price filter as-is — no cap.",
          "Step 9. If a consent banner/pop-up reappears after filtering, close it before scrolling or opening listings.",
          "Step 10. On the results page, perform natural scrolling to load more hotels (scroll down, pause 1-2 seconds, repeat at least 3 times).",
          `Step 11. From the visible results after scrolling, open each of the first ${listingDepth} hotel cards individually.`,
          "Step 12. On each hotel detail page extract: listing name, listing URL, price per night, total price, area/neighbourhood, postal code (if visible), latitude/longitude (if visible), rating, review count, room type, max guests, check-in policy, cancellation policy, house rules (quiet hours, smoking/pets/party restrictions), transport/location note.",
          "Step 13. Record the filtered results search URL you landed on after applying filters.",
          "",
        ]
      : []),
    "",
    "=== SITE 3: TripAdvisor (https://www.tripadvisor.com) — safety & social proof cross-reference ===",
    "Step 1. Navigate to https://www.tripadvisor.com",
    "Step 2. Handle consent/cookie banners immediately so search is not blocked.",
    `Step 3. Search for hotels in "${searchLocation}".`,
    `Step 4. From the results, look at the top ${tripAdvisorDepth} results and note their TripAdvisor ratings, review counts, and neighbourhood.`,
    "Step 5. For each of the Airbnb and Trip.com listings you found above, search TripAdvisor for the property by name.",
    "Step 6. If a match is found, record the TripAdvisor rating (out of 5), review count, and any safety or neighbourhood notes from their description.",
    "Step 7. If no exact match is found, record the average TripAdvisor rating for similar listings in that neighbourhood as a proxy.",
    "Step 8. For each listing area encountered, note any safety context (e.g. 'well-lit, central', 'avoid at night', 'tourist-friendly').",
    "",
    "=== OUTPUT RULES ===",
    "- Use realistic browsing behavior: scroll results pages before selecting listings.",
    "- listing_url must be the full detail page URL for each individual property.",
    "- search_url must be the filtered search results page URL from that site.",
    "- Do not include homepages or unfiltered landing pages as search_url.",
    "- If anti-bot/captcha pages appear, try one safe retry path; if still blocked, return partial structured results with clear issues instead of hallucinating fields.",
    "- Do not log in, submit payments, or enter personal data.",
    "- Return a JSON object matching the exact shape below.",
    "",
    "Output JSON shape:",
    "{",
    '  "sites_checked": [',
    "    {",
    '      "site_name": "Airbnb",',
    '      "search_url": "https://www.airbnb.com/s/...",',
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
    '  "listings": [',
    "    {",
    '      "site_name": "Airbnb",',
    '      "listing_name": "Cozy Studio in Sukhumvit",',
    '      "listing_url": "https://www.airbnb.com/rooms/12345678",',
    '      "search_url": "https://www.airbnb.com/s/...",',
    '      "area": "Sukhumvit",',
    '      "postal_code": "10110",',
    '      "lat": 13.7367,',
    '      "lng": 100.5602,',
    '      "price_per_night": 45,',
    '      "total_price": 180,',
    '      "currency": "USD",',
    '      "rating": 4.8,',
    '      "review_count": 320,',
    '      "room_type": "Private room",',
    '      "max_guests": 2,',
    '      "beds": "1 double bed",',
    '      "transport_note": "5 min walk to BTS Asok",',
    '      "checkin_policy": "Self check-in, flexible hours",',
    '      "cancellation_policy": "Free cancellation before check-in",',
    '      "house_rules": "No smoking, no parties, quiet hours after 10pm",',
    '      "tripadvisor_rating": 4.2,',
    '      "tripadvisor_reviews": 180,',
    '      "safety_note": "Central area, well-lit streets, tourist-friendly neighbourhood"',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}
