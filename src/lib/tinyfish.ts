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

  const encodedArea = encodeURIComponent(params.area);
  const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodedArea}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": `${apiKey}`,
      },
      body: JSON.stringify({
        url: searchUrl,
        goal: goal,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`TinyFish API error: ${response.status}`);
  }

  // Read SSE stream line-by-line and stop as soon as COMPLETE arrives
  let data: any = null;

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const chunk = JSON.parse(jsonStr);
          if (chunk.type === "COMPLETE") {
            data = chunk.result ?? chunk;
            reader.cancel(); // stop reading — we have what we need
            break outer;
          }
          // Fallback: capture last seen completed/done status
          if (chunk.status === "completed" || chunk.status === "done") {
            data = chunk.result ?? chunk;
          }
        } catch {
          // ignore malformed SSE fragments
        }
      }
    }
  }

  // Fallback: read full body if not SSE (synchronous JSON endpoint)
  if (!data) {
    const responseText = await (response.bodyUsed
      ? Promise.resolve("")
      : response.text());
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
