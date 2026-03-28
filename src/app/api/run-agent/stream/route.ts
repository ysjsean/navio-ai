import { NextRequest } from "next/server";
import mockListings from "@/data/mock-listings.json";
import { createEventStream } from "@/lib/event-stream";
import { parseFile } from "@/lib/file-parser";
import { explainDecision, parseItinerary, selectBestArea } from "@/lib/openai";
import { saveRunResult } from "@/lib/run-store";
import { rankListings } from "@/lib/scoring";
import { runTinyFishSearch } from "@/lib/tinyfish";
import { Listing, SiteAuditRecord } from "@/types/listing";
import { ParsedItinerary, RunMode, TripInput } from "@/types/itinerary";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return createEventStream(async (write) => {
    const formData = await req.formData();
    const runId = String(formData.get("runId") || crypto.randomUUID());
    const runMode = parseRunMode(formData.get("runMode"));

    write("parsing_started", { runId, stage: "input" });

    const textInput = String(formData.get("itineraryText") || "");
    const file = formData.get("file");
    let fileText = "";

    if (file instanceof File && file.size > 0) {
      fileText = await parseFile(file);
    }

    const mergedText = [textInput, fileText].filter(Boolean).join("\n\n");
    const itineraryProvided = Boolean(mergedText.trim());
    const uiTrip = parseTripInput(formData);
    let parsed: ParsedItinerary;

    if (runMode === "accommodation-only") {
      if (!itineraryProvided) {
        throw new Error("Accommodation Only mode requires itinerary text or a PDF/DOCX file.");
      }

      parsed = await parseItinerary(mergedText);
      parsed = normalizeParsedForAccommodation(parsed, mergedText);
    } else {
      parsed = buildParsedFromManual(uiTrip);
      const missing = getMissingParsedFields(parsed);
      if (missing.length > 0) {
        throw new Error(
          `Full Decision Agent mode requires manual fields: ${missing.join(", ")}.`
        );
      }
    }

    write("parsing_done", {
      runId,
      stage: "parsed",
      itinerary: parsed,
    });

    const inferredAreaAnchor = inferAreaAnchor(parsed, mergedText);
    const area =
      runMode === "full-agent"
        ? await selectBestArea(parsed)
        : {
            bestArea: inferredAreaAnchor,
            reason:
              "Accommodation-only mode: using itinerary destination cluster as search anchor.",
          };
    write("area_selected", {
      runId,
      stage: "area",
      bestArea: area.bestArea,
      reason: area.reason,
    });

    const resolvedTrip: TripInput = {
      runMode,
      city: parsed.city,
      checkIn: parsed.checkIn,
      checkOut: parsed.checkOut,
      nights: parsed.nights,
      pax: parsed.pax,
      rooms: parsed.rooms,
      budget: {
        mode: uiTrip.budget.mode,
        amount: Math.max(0, parsed.budget || 0),
        currency: uiTrip.budget.currency || "USD",
      },
      roomType: uiTrip.roomType || "private room",
      propertyTypes:
        uiTrip.propertyTypes.length > 0
          ? uiTrip.propertyTypes
          : ["hotel", "airbnb", "hostel", "serviced-apartment"],
      preferences: parsed.preferences,
      itineraryText: mergedText,
    };

    write("tinyfish_started", {
      runId,
      stage: "tinyfish",
      action: "run-sse",
    });

    let usedMockData = false;
    let errorNote = "";
    let listings: Listing[] = [];
    let sitesChecked: SiteAuditRecord[] = [];
    let streamingUrl: string | undefined;

    try {
      const tinyfish = await runTinyFishSearch({
        trip: resolvedTrip,
        bestArea: area.bestArea,
        onProgress: (event) => {
          write("tinyfish_progress", {
            runId,
            ...event,
          });

          if (event.site) {
            write("site_searching", {
              runId,
              stage: "searching",
              site: event.site,
              action: event.action || "checking site",
            });
          }
        },
      });

      listings = tinyfish.listings;
      sitesChecked = tinyfish.sites_checked;
      streamingUrl = tinyfish.streaming_url;
      if (streamingUrl) {
        write("tinyfish_started", {
          runId,
          stage: "tinyfish",
          streaming_url: streamingUrl,
        });
      }
    } catch (error) {
      usedMockData = true;
      errorNote =
        error instanceof Error
          ? `TinyFish failed, fallback to mock data: ${error.message}`
          : "TinyFish failed, fallback to mock data.";
      listings = mockListings.listings as Listing[];
      sitesChecked = mockListings.sites_checked as SiteAuditRecord[];
      write("tinyfish_progress", {
        runId,
        message: errorNote,
      });
    }

    listings.forEach((listing) => {
      write("listing_extracted", {
        runId,
        site: listing.site_name,
        listing: listing.listing_name,
      });
    });

    write("ranking_started", { runId, stage: "ranking" });
    const rankings = rankListings(listings, parsed, area.bestArea);
    write("ranking_done", {
      runId,
      stage: "ranking",
      viableCount: [
        rankings.bestOverall,
        rankings.cheapestAcceptable,
        rankings.backupOption,
      ].filter(Boolean).length,
      rejectedCount: rankings.rejectedOptions.length,
    });

    const detailedSummary = buildDeterministicDecisionSummary({
      rankings,
      bestArea: area.bestArea,
      itinerary: parsed,
    });

    const explanation =
      runMode === "full-agent"
        ? `${await explainDecision({
            itinerary: parsed,
            bestArea: area.bestArea,
            ranked: rankings,
          })}\n\n${detailedSummary}`.trim()
        : detailedSummary;

    const finalResult = {
      runId,
      runMode,
      itinerary: parsed,
      bestArea: area.bestArea,
      areaReason: area.reason,
      tinyfishStreamingUrl: streamingUrl,
      sitesChecked,
      rankings,
      explanation,
      usedMockData,
      errorNote: errorNote || undefined,
    };

    saveRunResult(finalResult);

    write("completed", {
      runId,
      stage: "completed",
      result: finalResult,
    });
  });
}

function parseTripInput(formData: FormData): TripInput {
  const propertyTypesRaw = String(formData.get("propertyTypes") || "hotel,airbnb");
  const preferencesRaw = String(formData.get("preferences") || "");

  return {
    runMode: parseRunMode(formData.get("runMode")),
    city: String(formData.get("city") || "").trim(),
    checkIn: String(formData.get("checkIn") || "").trim(),
    checkOut: String(formData.get("checkOut") || "").trim(),
    nights: Number(formData.get("nights") || 0),
    pax: Number(formData.get("pax") || 0),
    rooms: Number(formData.get("rooms") || 0),
    budget: {
      mode: String(formData.get("budgetMode") || "total") === "nightly" ? "nightly" : "total",
      amount: Number(formData.get("budgetAmount") || 0),
      currency: String(formData.get("budgetCurrency") || "USD"),
    },
    roomType: String(formData.get("roomType") || "private room"),
    propertyTypes: propertyTypesRaw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean) as TripInput["propertyTypes"],
    preferences: preferencesRaw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    itineraryText: String(formData.get("itineraryText") || ""),
  };
}

function parseRunMode(value: FormDataEntryValue | null): RunMode {
  return String(value || "full-agent") === "accommodation-only"
    ? "accommodation-only"
    : "full-agent";
}

function buildParsedFromManual(trip: TripInput): ParsedItinerary {
  return {
    city: trip.city,
    checkIn: trip.checkIn,
    checkOut: trip.checkOut,
    nights: trip.nights,
    pax: trip.pax,
    rooms: trip.rooms,
    budget: trip.budget.amount,
    locations: trip.city ? [trip.city] : [],
    preferences: trip.preferences,
    constraints: trip.roomType ? [trip.roomType] : [],
  };
}

function getMissingParsedFields(parsed: {
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pax: number;
  rooms: number;
  budget: number;
}): string[] {
  const missing: string[] = [];

  if (!parsed.city?.trim()) missing.push("city");
  if (!parsed.checkIn?.trim()) missing.push("checkIn");
  if (!parsed.checkOut?.trim()) missing.push("checkOut");
  if (!parsed.nights || parsed.nights <= 0) missing.push("nights");
  if (!parsed.pax || parsed.pax <= 0) missing.push("pax");
  if (!parsed.rooms || parsed.rooms <= 0) missing.push("rooms");
  if (!parsed.budget || parsed.budget <= 0) missing.push("budget");

  return missing;
}

function normalizeParsedForAccommodation(
  parsed: ParsedItinerary,
  sourceText: string
): ParsedItinerary {
  const groundedCity = appearsInText(parsed.city, sourceText) ? parsed.city.trim() : "";
  const groundedLocations = parsed.locations.filter((loc) => appearsInText(loc, sourceText));
  const inferredAnchor = inferAreaAnchor(
    {
      ...parsed,
      city: groundedCity,
      locations: groundedLocations,
    },
    sourceText
  );

  return {
    ...parsed,
    city: groundedCity || inferredAnchor,
    checkIn: parsed.checkIn?.trim() || "",
    checkOut: parsed.checkOut?.trim() || "",
    nights: parsed.nights > 0 ? parsed.nights : 0,
    pax: parsed.pax > 0 ? parsed.pax : 2,
    rooms: parsed.rooms > 0 ? parsed.rooms : 1,
    budget: parsed.budget > 0 ? parsed.budget : 0,
    locations: groundedLocations.length > 0 ? groundedLocations : inferredAnchor ? [inferredAnchor] : [],
  };
}

function inferAreaAnchor(parsed: ParsedItinerary, sourceText: string): string {
  if (parsed.locations[0]?.trim()) return parsed.locations[0].trim();
  if (parsed.city?.trim()) return parsed.city.trim();

  const normalized = sourceText.replace(/\s+/g, " ").trim();
  const inMatch = normalized.match(/\bin\s+([A-Z][A-Za-z\-\s]{2,40})/);
  if (inMatch?.[1]) return inMatch[1].trim();

  const toMatch = normalized.match(/\bto\s+([A-Z][A-Za-z\-\s]{2,40})/);
  if (toMatch?.[1]) return toMatch[1].trim();

  return "City Center";
}

function appearsInText(value: string, sourceText: string): boolean {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;

  const normalizedText = sourceText.toLowerCase().replace(/[^a-z0-9\s\-]/g, " ");
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeWord = new RegExp(`\\b${escaped}\\b`, "i");

  return wholeWord.test(normalizedText);
}

function buildDeterministicDecisionSummary(args: {
  rankings: {
    bestOverall: Listing | null;
    cheapestAcceptable: Listing | null;
    backupOption: Listing | null;
    rejectedOptions: Array<{ listing: Listing; reasons: string[] }>;
  };
  bestArea: string;
  itinerary: ParsedItinerary;
}): string {
  const selected = args.rankings.bestOverall;
  if (!selected) {
    return "No winning accommodation was selected because no listing passed the minimum fit checks.";
  }

  const lines: string[] = [];
  lines.push(`Chosen accommodation: ${selected.listing_name} (${selected.site_name})`);
  lines.push(`Area fit: selected area is ${args.bestArea}; listing area is ${selected.area}.`);
  lines.push(
    `Price/value: ${selected.currency} ${selected.price_per_night} per night (${selected.currency} ${selected.total_price} total), rating ${selected.rating} from ${selected.review_count} reviews.`
  );
  lines.push(
    `Access and nearby movement: ${selected.transport_note || "transport details not provided"}.`
  );
  lines.push(
    `Stay policies: check-in ${selected.checkin_policy || "not specified"}; cancellation ${selected.cancellation_policy || "not specified"}.`
  );
  lines.push(
    `Capacity match: supports up to ${selected.max_guests} guests with ${selected.room_type || "room type not specified"}.`
  );

  if (args.itinerary.locations.length > 0) {
    lines.push(`Nearby itinerary anchors considered: ${args.itinerary.locations.join(", ")}.`);
  }

  if (args.rankings.cheapestAcceptable) {
    const cheap = args.rankings.cheapestAcceptable;
    if (cheap.listing_url !== selected.listing_url) {
      lines.push(
        `Cheapest acceptable alternative: ${cheap.listing_name} at ${cheap.currency} ${cheap.total_price} total.`
      );
    }
  }

  if (args.rankings.backupOption) {
    lines.push(`Backup option: ${args.rankings.backupOption.listing_name}.`);
  }

  lines.push(`Direct listing link: ${selected.listing_url}`);
  if (selected.search_url) {
    lines.push(`Filtered search link: ${selected.search_url}`);
  }

  if (args.rankings.rejectedOptions.length > 0) {
    const topRejects = args.rankings.rejectedOptions.slice(0, 2);
    for (const rejected of topRejects) {
      lines.push(
        `Rejected ${rejected.listing.listing_name}: ${rejected.reasons.slice(0, 2).join("; ")}.`
      );
    }
  }

  return lines.join("\n");
}
