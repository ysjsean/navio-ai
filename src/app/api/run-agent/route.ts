import { NextRequest, NextResponse } from "next/server";
import { parseFile } from "@/lib/file-parser";
import { parseItinerary, selectArea, explainDecision } from "@/lib/openai";
import { fetchTinyFish } from "@/lib/tinyfish";
import { rankListings } from "@/lib/scoring";
import { Listing } from "@/types/hotel";
import mockData from "@/data/mock-hotels.json";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const inputText = formData.get("text") as string;
    const file = formData.get("file") as File | null;

    let tripText = inputText;

    if (file) {
      tripText = await parseFile(file);
    }

    if (!tripText || tripText.trim().length === 0) {
      return NextResponse.json(
        { error: "No itinerary text provided" },
        { status: 400 }
      );
    }

    // 1. Parse itinerary
    const parsed = await parseItinerary(tripText);

    // 2. Select best area
    const { bestArea, reason: areaReason } = await selectArea(parsed);

    // 3. TinyFish search
    let listings: Listing[];
    try {
      listings = await fetchTinyFish({
        area: bestArea,
        budget: parsed.budget,
        dates: parsed.dates,
      });
    } catch (err) {
      console.warn("TinyFish unavailable, using mock data:", err);
      listings = mockData as Listing[];
    }

    // 4. Rank results
    const ranked = rankListings(listings, parsed, bestArea);

    // 5. Explain decision
    const explanation = await explainDecision(ranked, parsed);

    return NextResponse.json({
      bestArea,
      areaReason,
      bestOverall: ranked.bestOverall,
      cheapestAcceptable: ranked.cheapestAcceptable,
      backupOption: ranked.backupOption,
      rejectedOptions: ranked.rejectedOptions,
      explanation,
      dates: parsed.dates,
      budget: parsed.budget,
    });
  } catch (error) {
    console.error("Agent failed:", error);
    return NextResponse.json(
      { error: "Agent failed. Please try again." },
      { status: 500 }
    );
  }
}
