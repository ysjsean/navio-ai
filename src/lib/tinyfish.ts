import { Listing } from "@/types/hotel";
import { tinyfishInstruction } from "./prompts";

interface TinyFishParams {
  area: string;
  budget?: string;
  dates?: {
    checkin: string;
    checkout: string;
  };
}

export async function fetchTinyFish(params: TinyFishParams): Promise<Listing[]> {
  const apiKey = process.env.TINYFISH_API_KEY;
  const apiUrl = process.env.TINYFISH_API_URL || "https://api.tinyfish.ai/v1/agent";

  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY is not set");
  }

  const goal = tinyfishInstruction(
    params.area,
    params.dates?.checkin || "2025-06-01",
    params.dates?.checkout || "2025-06-05",
    params.budget || "150"
  );

  const encodedArea = encodeURIComponent(`accommodations in ${params.area}`);
  const searchUrl = `https://www.google.com/search?q=${encodedArea}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": `${apiKey}`,
    },
    body: JSON.stringify({
      url: searchUrl,
      goal: goal,
    }),
  });

  if (!response.ok) {
    throw new Error(`TinyFish API error: ${response.status}`);
  }

  const responseText = await response.text();
  let data: any = { output: "" };

  // If the endpoint is `run-sse`, it will stream Server-Sent Events (data: {...})
  if (responseText.includes("data:")) {
    const lines = responseText.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        try {
          const jsonStr = line.replace("data:", "").trim();
          if (jsonStr === "[DONE]") continue;
          
          const chunk = JSON.parse(jsonStr);
          // Look for final output payload
          if (chunk.type === "COMPLETE" || chunk.status === "completed" || chunk.status === "done" || chunk.output || chunk.results) {
            data = chunk.result ?? chunk;
          }
        } catch (err) {
          // ignore malformed SSE json fragments
        }
      }
    }
  } else {
    // Normal synchronous JSON response
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { output: responseText };
    }
  }

  // Parse the response — TinyFish returns results as text or JSON object
  let listings: Listing[];

  if (Array.isArray(data.results)) {
    listings = data.results.map(normalizeResult);
  } else if (Array.isArray(data.output)) {
    listings = data.output.map(normalizeResult);
  } else if (typeof data.output === "string") {
    try {
      // Find the JSON array inside the output string (in case the agent returned markdown ```json)
      const jsonMatch = data.output.match(/\[\s*\{[\w\W]*\}\s*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : data.output;
      listings = JSON.parse(jsonStr).map(normalizeResult);
    } catch (e) {
      console.error("Failed to parse agent string output:", data.output);
      throw new Error("Failed to parse TinyFish output");
    }
  } else {
    throw new Error("Unexpected TinyFish response format");
  }

  return listings;
}

function normalizeResult(raw: Record<string, unknown>): Listing {
  return {
    name: String(raw.name || "Unknown"),
    price: parseFloat(String(raw.price || "0").replace(/[^0-9.]/g, "")),
    rating: parseFloat(String(raw.rating || "0")),
    area: String(raw.area || ""),
    policy: String(raw.policy || "No info"),
    url: String(raw.url || "#"),
    source: inferSource(String(raw.url || raw.source || "")),
  };
}

function inferSource(input: string): Listing["source"] {
  const lower = input.toLowerCase();
  if (lower.includes("airbnb")) return "airbnb";
  if (lower.includes("hostel")) return "hostel";
  if (lower.includes("serviced") || lower.includes("apartment"))
    return "serviced-apartment";
  return "hotel";
}
