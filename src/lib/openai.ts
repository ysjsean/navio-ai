import OpenAI from "openai";
import { z } from "zod";
import { ParsedItinerary } from "@/types/itinerary";
import { RankedResults } from "@/types/listing";
import {
  explainDecisionPrompt,
  parseItineraryPrompt,
  selectBestAreaPrompt,
} from "@/lib/prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const parsedItinerarySchema = z.object({
  city: z.string().default(""),
  checkIn: z.string().default(""),
  checkOut: z.string().default(""),
  nights: z.number().int().nonnegative().default(0),
  pax: z.number().int().positive().default(1),
  rooms: z.number().int().positive().default(1),
  budget: z.number().nonnegative().default(0),
  locations: z.array(z.string()).default([]),
  preferences: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
});

const areaSchema = z.object({
  bestArea: z.string().min(1),
  reason: z.string().min(1),
});

export async function parseItinerary(inputText: string): Promise<ParsedItinerary> {
  try {
    const raw = await askModelForJson(parseItineraryPrompt(inputText));
    return parsedItinerarySchema.parse(raw);
  } catch {
    return {
      city: "",
      checkIn: "",
      checkOut: "",
      nights: 0,
      pax: 1,
      rooms: 1,
      budget: 0,
      locations: [],
      preferences: [],
      constraints: [],
    };
  }
}

export async function selectBestArea(
  parsed: ParsedItinerary
): Promise<{ bestArea: string; reason: string }> {
  try {
    const raw = await askModelForJson(selectBestAreaPrompt(parsed));
    const selected = areaSchema.parse(raw);
    return {
      bestArea: selected.bestArea,
      reason: selected.reason,
    };
  } catch {
    const fallbackArea = parsed.locations[0] || `${parsed.city} City Center`.trim() || "City Center";
    return {
      bestArea: fallbackArea,
      reason:
        "Fallback area selected from itinerary anchors to preserve travel efficiency.",
    };
  }
}

export async function explainDecision(args: {
  itinerary: ParsedItinerary;
  bestArea: string;
  ranked: RankedResults;
}): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You explain accommodation trade-offs clearly. Mention constraints and reasons for rejections.",
        },
        {
          role: "user",
          content: explainDecisionPrompt({
            itinerary: args.itinerary,
            bestArea: args.bestArea,
            rankedResults: args.ranked,
          }),
        },
      ],
      temperature: 0.2,
    });

    return (
      response.choices[0]?.message?.content?.trim() ||
      "The selected option best balanced itinerary fit, transport convenience, room match, and policy flexibility. Cheaper listings were rejected due to weaker fit against critical constraints."
    );
  } catch {
    return "The selected option best balanced itinerary fit, transport convenience, room match, and policy flexibility. Cheaper listings were rejected due to weaker fit against critical constraints.";
  }
}

async function askModelForJson(prompt: string): Promise<unknown> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Return strict JSON only with no markdown.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
  });

  const content = completion.choices[0]?.message?.content || "{}";
  return safeJsonParse(content);
}

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      return JSON.parse(objectMatch[0]);
    }
    return {};
  }
}
