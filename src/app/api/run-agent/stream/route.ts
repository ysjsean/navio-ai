import { NextRequest } from "next/server";
import { createEventStream } from "@/lib/event-stream";
import { parseFile } from "@/lib/file-parser";
import {
  determineSearchRadius,
  explainDecision,
  geocodeLocations,
  parseItinerary,
  scoreTransitConvenience,
  selectBestArea,
} from "@/lib/openai";
import { saveRunResult } from "@/lib/run-store";
import { rankListings } from "@/lib/scoring";
import { runTinyFishSearchConcurrent } from "@/lib/tinyfish";
import { enrichListingsWithGoogleGeo } from "@/lib/google-geocode";
import { Listing, SiteAuditRecord, TinyFishSearchResult } from "@/types/listing";
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

    // Stage 1: Geocode itinerary locations to enable transit-aware area selection
    let geocodedLocations = parsed.geocodedLocations;
    if (parsed.locations.length > 0) {
      write("geocoding_started", { runId, stage: "geocoding" });
      try {
        geocodedLocations = await geocodeLocations(parsed.locations, parsed.city);
        parsed = { ...parsed, geocodedLocations };
        write("geocoding_done", { runId, stage: "geocoding", count: geocodedLocations.length });
      } catch {
        write("geocoding_done", { runId, stage: "geocoding", count: 0, note: "geocoding skipped" });
      }
    }

    // Stage 2: Select best area from itinerary geolocation in all modes
    const area = await selectBestArea(parsed, geocodedLocations);

    // Stage 3: Ask OpenAI for initial search radius based on all geocoded itinerary points
    const radiusDecision = await determineSearchRadius({
      city: parsed.city,
      bestArea: area.bestArea,
      geocodedLocations: geocodedLocations || [],
    });
    parsed = { ...parsed, searchRadiusKm: radiusDecision.radiusKm };

    write("area_selected", {
      runId,
      stage: "area",
      bestArea: area.bestArea,
      reason: area.reason,
      searchRadiusKm: radiusDecision.radiusKm,
      radiusReason: radiusDecision.reason,
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
      searchRadiusKm: parsed.searchRadiusKm,
      itineraryText: mergedText,
    };

    write("tinyfish_started", {
      runId,
      stage: "tinyfish",
      action: "run-sse",
    });

    const usedMockData = false;
    let errorNote = "";
    let listings: Listing[] = [];
    let sitesChecked: SiteAuditRecord[] = [];
    let streamingUrl: string | undefined;
    let tinyfishMetrics: TinyFishSearchResult["metrics"];

    try {
      const minListings = Math.max(4, Math.ceil((parsed.pax || 2) * 1.2));
      const baseRadius = resolvedTrip.searchRadiusKm || 3;
      const radiusPlan = [baseRadius, baseRadius + 1.5, baseRadius + 3].map((n) =>
        Math.round(n * 10) / 10
      );

      const mergedListingsMap = new Map<string, Listing>();
      const mergedSitesMap = new Map<string, SiteAuditRecord>();
      let consecutiveNoGrowthPasses = 0;
      const maxNoGrowthPasses = Math.max(1, Number(process.env.TINYFISH_MAX_NO_GROWTH_PASSES || 2));

      for (let i = 0; i < radiusPlan.length; i += 1) {
        const radiusKm = radiusPlan[i];
        const passStart = Date.now();
        const beforeCount = mergedListingsMap.size;
        write("tinyfish_progress", {
          runId,
          stage: "tinyfish",
          action: "radius_pass",
          message: `Searching within ${radiusKm} km radius (${i + 1}/${radiusPlan.length})`,
        });

        const tinyfish = await runTinyFishSearchConcurrent({
          trip: { ...resolvedTrip, searchRadiusKm: radiusKm },
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

        tinyfishMetrics = tinyfish.metrics || tinyfishMetrics;

        if (tinyfish.metrics) {
          write("tinyfish_progress", {
            runId,
            stage: "tinyfish",
            action: "timing_metrics",
            message: `Pass ${i + 1}: ${tinyfish.metrics.totalMs}ms total`,
            metrics: tinyfish.metrics,
          });
        }

        for (const item of tinyfish.listings) {
          const key = item.listing_url || `${item.site_name}|${item.listing_name}`;
          mergedListingsMap.set(key, item);
        }

        for (const site of tinyfish.sites_checked) {
          const key = `${site.site_name}|${site.search_url || ""}`;
          mergedSitesMap.set(key, site);
        }

        if (!streamingUrl && tinyfish.streaming_url) {
          streamingUrl = tinyfish.streaming_url;
          write("tinyfish_started", {
            runId,
            stage: "tinyfish",
            streaming_url: streamingUrl,
          });
        }

        const afterCount = mergedListingsMap.size;
        const growth = afterCount - beforeCount;
        const passMs = Date.now() - passStart;

        write("tinyfish_progress", {
          runId,
          stage: "tinyfish",
          action: "radius_pass_done",
          message: `Radius ${radiusKm}km completed in ${passMs}ms; +${growth} new listings (${afterCount} total).`,
          radiusKm,
          passIndex: i + 1,
          passDurationMs: passMs,
          growth,
          totalListings: afterCount,
        });

        if (growth <= 0) {
          consecutiveNoGrowthPasses += 1;
        } else {
          consecutiveNoGrowthPasses = 0;
        }

        if (mergedListingsMap.size >= minListings) {
          write("tinyfish_progress", {
            runId,
            stage: "tinyfish",
            action: "termination_success",
            message: `Stopping radius expansion: reached target inventory (${mergedListingsMap.size}/${minListings}).`,
          });
          break;
        }

        if (consecutiveNoGrowthPasses >= maxNoGrowthPasses) {
          write("tinyfish_progress", {
            runId,
            stage: "tinyfish",
            action: "termination_no_growth",
            message: `Stopping radius expansion early after ${consecutiveNoGrowthPasses} no-growth passes.`,
          });
          break;
        }

        if (tinyfish.metrics?.blockedLikely && afterCount < 2) {
          throw new Error(
            `TinyFish likely blocked during radius pass ${i + 1}: ${(tinyfish.metrics.blockedSignals || []).join(
              ", "
            )}`
          );
        }
      }

      listings = Array.from(mergedListingsMap.values());
      sitesChecked = Array.from(mergedSitesMap.values());

      if (listings.length === 0) {
        throw new Error("TinyFish completed all passes without extracting viable listings.");
      }
    } catch (error) {
      errorNote =
        error instanceof Error
          ? `TinyFish failed: ${error.message}`
          : "TinyFish failed.";
      write("tinyfish_progress", {
        runId,
        message: errorNote,
      });
      throw new Error(errorNote);
    }

    listings.forEach((listing) => {
      write("listing_extracted", {
        runId,
        site: listing.site_name,
        listing: listing.listing_name,
      });
    });

    listings = await enrichListingsWithGoogleGeo(listings, {
      city: parsed.city,
      onProgress: (message) => {
        write("tinyfish_progress", {
          runId,
          stage: "tinyfish",
          action: "google_geo_enrichment",
          message,
        });
      },
    });

    // Stage 5: Score transit convenience per listing area via OpenAI
    let transitMinutes: Record<string, number> = {};
    const uniqueAreas = [...new Set(listings.map((l) => l.area).filter(Boolean))];
    if (uniqueAreas.length > 0 && parsed.locations.length > 0) {
      write("transit_scoring_started", { runId, stage: "transit_scoring" });
      try {
        // Ensure we have geocoded locations for transit scoring
        const geoLocs =
          geocodedLocations && geocodedLocations.length > 0
            ? geocodedLocations
            : await geocodeLocations(parsed.locations, parsed.city);

        transitMinutes = await scoreTransitConvenience(uniqueAreas, geoLocs, parsed.city);
        write("transit_scoring_done", {
          runId,
          stage: "transit_scoring",
          areasScored: Object.keys(transitMinutes).length,
        });
      } catch {
        write("transit_scoring_done", {
          runId,
          stage: "transit_scoring",
          areasScored: 0,
          note: "transit scoring skipped",
        });
      }
    }

    write("ranking_started", { runId, stage: "ranking" });
    const rankings = rankListings(
      listings,
      parsed,
      area.bestArea,
      transitMinutes,
      uiTrip.budget.currency || "SGD"
    );
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
      tinyfishMetrics,
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
