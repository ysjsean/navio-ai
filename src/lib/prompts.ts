export function parseItineraryPrompt(tripText: string): string {
  return `You are extracting structured travel data.

Input:
${tripText}

Return ONLY valid JSON (no markdown, no code fences):
{
  "city": "",
  "days": [],
  "locations": [],
  "constraints": [],
  "preferences": [],
  "budget": "",
  "dates": {
    "checkin": "",
    "checkout": ""
  }
}

Rules:
- "city" is the main destination city
- "days" is an array of day descriptions (e.g. ["Day 1: Visit Sensoji Temple", "Day 2: Explore Shibuya"])
- "locations" is an array of all specific places mentioned
- "constraints" are hard requirements (e.g. "must have wifi", "need late check-in")
- "preferences" are nice-to-haves (e.g. "prefer near subway", "quiet area")
- "budget" is the stated budget per night if mentioned, or empty string
- "dates" has checkin/checkout in YYYY-MM-DD format if mentioned, or empty strings`;
}

export function selectAreaPrompt(parsedItinerary: string): string {
  return `You are selecting the best area to stay for a traveler.

Goal:
Minimize total travel time across all itinerary locations.
Prioritize proximity to the most-visited areas.

Input:
${parsedItinerary}

Return ONLY valid JSON (no markdown, no code fences):
{
  "bestArea": "",
  "reason": ""
}

Rules:
- "bestArea" is a specific neighborhood or area name (not a full address)
- "reason" explains why this area minimizes overall travel time
- Consider public transport access
- Consider how many itinerary days are spent near that area`;
}

export function explainDecisionPrompt(
  best: string,
  others: string,
  itinerary: string
): string {
  return `You are explaining a travel accommodation decision.

Best option:
${best}

Other options considered:
${others}

Traveler's itinerary:
${itinerary}

Explain:
- Why the best option was chosen
- Why cheaper alternatives were rejected (if any)
- How it relates to the itinerary locations
- Any trade-offs the traveler should know about

Keep the explanation concise (3-5 sentences). Be practical and specific.`;
}

export function tinyfishInstruction(
  area: string,
  checkin: string,
  checkout: string,
  budget: string
): string {
  return `Find accommodations in ${area} from multiple reliable sources.

Goal:
We need genuine, bookable accommodation listings that match the user's trip details. 
Do not just look at one website. Search across multiple providers.

Filters to apply:
- Dates: ${checkin} to ${checkout}
- Budget: under ${budget} per night
- Room type: Private room or entire place
- Preferences: Near transport, late check-in allowed

Tasks:
1. Review the initial Google search results for accommodations in ${area}.
2. Open at least 3 different booking platforms from the search results (e.g., Booking.com, Airbnb, Expedia, Agoda).
3. On each platform, apply the necessary filters and extract 1-2 of the best legitimate listings.
4. For each listing, ensure you capture the actual, direct booking URL (legit direct links to the property, NOT the search results page).

Return ONLY a JSON array with this exact structure (no markdown fences):
[
  {
    "name": "Listing Name",
    "price": "Numeric price per night (e.g. 150)",
    "rating": "Rating out of 5 (e.g. 4.5)",
    "area": "Specific neighborhood",
    "policy": "Cancellation/Check-in policies",
    "url": "Exact HTTP booking link for this specific property"
  }
]`;
}
