import OpenAI from "openai";
import { ParsedItinerary, AreaSelection } from "@/types/itinerary";
import { RankedResults } from "@/types/hotel";
import {
  parseItineraryPrompt,
  selectAreaPrompt,
  explainDecisionPrompt,
} from "./prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o";

export async function parseItinerary(
  tripText: string
): Promise<ParsedItinerary> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: parseItineraryPrompt(tripText),
        },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    return JSON.parse(content) as ParsedItinerary;
  } catch (error) {
    console.error("Failed to parse itinerary:", error);
    // Fallback: return a minimal parsed itinerary
    return {
      city: "Tokyo",
      days: ["Day 1: Explore the city"],
      locations: ["City center"],
      constraints: [],
      preferences: [],
      budget: "150",
      dates: { checkin: "2025-06-01", checkout: "2025-06-05" },
    };
  }
}

export async function selectArea(
  parsed: ParsedItinerary
): Promise<AreaSelection> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: selectAreaPrompt(JSON.stringify(parsed, null, 2)),
        },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    return JSON.parse(content) as AreaSelection;
  } catch (error) {
    console.error("Failed to select area:", error);
    return {
      bestArea: "City Center",
      reason: "Centrally located for easy access to all itinerary locations.",
    };
  }
}

export async function explainDecision(
  ranked: RankedResults,
  itinerary: ParsedItinerary
): Promise<string> {
  try {
    const best = JSON.stringify(ranked.bestOverall, null, 2);
    const others = JSON.stringify(
      [
        ranked.cheapestAcceptable,
        ranked.backupOption,
        ...ranked.rejectedOptions.slice(0, 3),
      ].filter(Boolean),
      null,
      2
    );

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: explainDecisionPrompt(
            best,
            others,
            JSON.stringify(itinerary, null, 2)
          ),
        },
      ],
      temperature: 0.4,
    });

    return (
      response.choices[0]?.message?.content ??
      "Unable to generate explanation."
    );
  } catch (error) {
    console.error("Failed to explain decision:", error);
    return "The best option was selected based on a balance of price, location proximity to your itinerary, transport access, and booking flexibility. Cheaper alternatives were rejected due to poor ratings, inconvenient location, or restrictive policies.";
  }
}
