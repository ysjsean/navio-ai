import { NextRequest } from "next/server";
import { parseFile } from "@/lib/file-parser";
import { parseItinerary, selectArea, explainDecision } from "@/lib/openai";
import { fetchTinyFish } from "@/lib/tinyfish";
import { rankListings } from "@/lib/scoring";
import { Listing } from "@/types/hotel";
import mockData from "@/data/mock-hotels.json";

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const formData = await req.formData();
        const inputText = formData.get("text") as string;
        const file = formData.get("file") as File | null;

        let tripText = inputText;
        if (file) {
          tripText = await parseFile(file);
        }

        if (!tripText || tripText.trim().length === 0) {
          send({ type: "error", message: "No itinerary text provided" });
          controller.close();
          return;
        }

        // Step 1 — Parse itinerary
        send({ type: "step", id: 1, status: "active" });
        const parsed = await parseItinerary(tripText);
        send({ type: "step", id: 1, status: "done" });

        // Step 2 — Select area
        send({ type: "step", id: 2, status: "active" });
        const { bestArea, reason: areaReason } = await selectArea(parsed);
        send({ type: "step", id: 2, status: "done" });

        // Step 3 — TinyFish search (streams back the live preview URL)
        send({ type: "step", id: 3, status: "active" });
        let listings: Listing[];
        try {
          listings = await fetchTinyFish({
            area: bestArea,
            budget: parsed.budget,
            dates: parsed.dates,
            onStreamingUrl: (url) => send({ type: "streaming_url", url }),
          });
        } catch (err) {
          console.warn("TinyFish unavailable, using mock data:", err);
          listings = mockData as Listing[];
        }
        send({ type: "step", id: 3, status: "done" });

        // Step 4 — Rank
        send({ type: "step", id: 4, status: "active" });
        const ranked = rankListings(listings, parsed, bestArea);
        send({ type: "step", id: 4, status: "done" });

        // Step 5 — Explain
        send({ type: "step", id: 5, status: "active" });
        const explanation = await explainDecision(ranked, parsed);
        send({ type: "step", id: 5, status: "done" });

        // Final result
        send({
          type: "result",
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
        send({ type: "error", message: "Agent failed. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
