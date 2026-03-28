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
  return `You are on a Booking.com search page for accommodations in ${area} (${checkin} to ${checkout}, budget under $${budget}/night).

Task:
Extract the top 5 listings visible on this page. Do NOT navigate to other pages or sites.

For each listing collect:
- name: hotel/property name
- price: numeric nightly price in USD (digits only, e.g. 120)
- rating: score out of 10 converted to out of 5 (e.g. 8.4 → 4.2)
- area: neighbourhood shown on the card
- policy: cancellation or check-in policy shown (e.g. "Free cancellation", "Non-refundable")
- url: the direct property URL (must start with https://www.booking.com/hotel/)

Return ONLY a JSON array — no markdown, no explanation:
[
  {
    "name": "...",
    "price": 120,
    "rating": 4.2,
    "area": "...",
    "policy": "...",
    "url": "https://www.booking.com/hotel/..."
  }
]`;
}

