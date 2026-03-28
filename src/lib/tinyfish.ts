import { buildTinyFishGoal } from "@/lib/prompts";
import { TinyFishSearchResult, Listing, SiteAuditRecord } from "@/types/listing";
import { TripInput } from "@/types/itinerary";

const DEFAULT_BASE_URL = "https://api.tinyfish.ai";
const DEFAULT_TIMEOUT_MS = 90_000;
const MIN_TARGET_DOMAINS = 1;

const ALLOWED_ACCOMMODATION_DOMAINS = [
  "airbnb.com",
  "trip.com",
] as const;

interface TinyFishRunOptions {
  trip: TripInput;
  bestArea: string;
  onProgress?: (event: {
    site?: string;
    action?: string;
    message?: string;
    streaming_url?: string;
  }) => void;
}

export async function runTinyFishSearch(
  options: TinyFishRunOptions
): Promise<TinyFishSearchResult> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) throw new Error("TINYFISH_API_KEY is missing.");

  const endpoint = resolveTinyFishEndpoint();
  const isSseEndpoint = /run-sse/i.test(endpoint);

  const goal = buildTinyFishGoal({ ...options.trip, bestArea: options.bestArea });
  const startUrl = resolveTinyFishStartUrl(options);

  const payload = {
    // TinyFish automation endpoints require a starting URL.
    url: startUrl,
    // Keep multiple instruction keys for compatibility across TinyFish API variants.
    goal,
    task: goal,
    instruction: goal,
    instructions: goal,
    metadata: {
      city: options.trip.city,
      area: options.bestArea,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "unknown fetch error";
    throw new Error(`TinyFish network request failed at ${endpoint}. ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `TinyFish request failed at ${endpoint}: ${response.status} ${body.slice(0, 300)}`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const shouldParseSse = isSseEndpoint || contentType.includes("text/event-stream");

  if (shouldParseSse) {
    if (!response.body) {
      throw new Error(`TinyFish SSE endpoint returned no response body at ${endpoint}.`);
    }
    return parseSseResult(response, options);
  }

  const rawJson = await response.json().catch(async () => {
    const rawText = await response.text().catch(() => "");
    return safeJson(rawText);
  });

  const parsed = findTinyFishResult(rawJson);
  if (!parsed) {
    throw new Error("TinyFish JSON response did not include listings/sites_checked payload.");
  }

  return validateCoverage({
    streaming_url: parsed.streaming_url,
    sites_checked: normalizeSites(parsed.sites_checked),
    listings: normalizeListings(parsed.listings, parsed.sites_checked),
  });
}

function resolveTinyFishEndpoint(): string {
  const directUrl = (process.env.TINYFISH_API_URL || "").trim();
  if (directUrl) return directUrl;

  const baseUrl = (process.env.TINYFISH_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  return `${baseUrl}/run-sse`;
}

function resolveTinyFishStartUrl(options: TinyFishRunOptions): string {
  const fromEnv = (process.env.TINYFISH_START_URL || "").trim();
  if (fromEnv) return fromEnv;

  const city = encodeURIComponent(options.trip.city || "");
  const area = encodeURIComponent(options.bestArea || "");
  if (city || area) {
    return `https://www.google.com/travel/hotels/${city}?q=${area}`;
  }

  return "https://www.google.com/travel/hotels";
}

async function parseSseResult(
  response: Response,
  options: TinyFishRunOptions
): Promise<TinyFishSearchResult> {
  const decoder = new TextDecoder();
  const reader = response.body!.getReader();
  let buffer = "";
  let latestStreamingUrl: string | undefined;
  let finalResult: TinyFishSearchResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk);
      if (!parsed) continue;

      const payloadValue = parsed.data;
      const eventName = parsed.event || "progress";
      const streamingUrl = extractStreamingUrl(payloadValue);
      if (streamingUrl) {
        latestStreamingUrl = streamingUrl;
      }

      if (eventName.includes("site") || hasSiteName(payloadValue)) {
        options.onProgress?.({
          site: extractSiteName(payloadValue),
          action: extractAction(payloadValue),
          message: stringifyShort(payloadValue),
          streaming_url: latestStreamingUrl,
        });
      } else {
        options.onProgress?.({
          action: eventName,
          message: stringifyShort(payloadValue),
          streaming_url: latestStreamingUrl,
        });
      }

      const candidate = findTinyFishResult(payloadValue);
      if (candidate) {
        finalResult = {
          ...candidate,
          streaming_url: candidate.streaming_url || latestStreamingUrl,
        };
      }
    }
  }

  if (!finalResult) {
    throw new Error("TinyFish stream finished without a final structured result.");
  }

  return validateCoverage({
    streaming_url: finalResult.streaming_url || latestStreamingUrl,
    sites_checked: normalizeSites(finalResult.sites_checked),
    listings: normalizeListings(finalResult.listings, finalResult.sites_checked),
  });
}

function safeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function parseSseChunk(
  chunk: string
): { event?: string; data: unknown } | null {
  const lines = chunk.split(/\r?\n/);
  let eventName: string | undefined;
  let dataPayload = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    }
    if (line.startsWith("data:")) {
      dataPayload += line.slice(5).trim();
    }
  }

  if (!dataPayload) return null;

  try {
    return { event: eventName, data: JSON.parse(dataPayload) };
  } catch {
    return { event: eventName, data: dataPayload };
  }
}

function findTinyFishResult(input: unknown): TinyFishSearchResult | null {
  if (isResultShape(input)) return input;

  if (typeof input === "string") {
    const fenced = input.match(/```json\s*([\s\S]*?)```/i);
    const source = fenced?.[1] || input;
    try {
      const parsed = JSON.parse(source);
      return findTinyFishResult(parsed);
    } catch {
      return null;
    }
  }

  if (isRecord(input)) {
    for (const key of ["result", "data", "output", "final", "response"] as const) {
      if (!(key in input)) continue;
      const nested = findTinyFishResult(input[key]);
      if (nested) return nested;
    }
  }

  return null;
}

function isResultShape(input: unknown): input is TinyFishSearchResult {
  if (!isRecord(input)) return false;
  return Array.isArray(input.sites_checked) && Array.isArray(input.listings);
}

function normalizeSites(input: unknown[]): SiteAuditRecord[] {
  const mapped: Array<SiteAuditRecord | null> = input
    .map((site) => {
      if (!isRecord(site)) return null;
      const searchUrl = asUrl(site.search_url || site.url);
      return {
        site_name: String(site.site_name || site.site || "Unknown Site"),
        search_url: searchUrl || undefined,
        filters_applied: isRecord(site.filters_applied)
          ? {
              checkIn: asString(site.filters_applied.checkIn),
              checkOut: asString(site.filters_applied.checkOut),
              pax: asNumber(site.filters_applied.pax),
              rooms: asNumber(site.filters_applied.rooms),
              budget: asNumber(site.filters_applied.budget),
              roomType: asString(site.filters_applied.roomType),
            }
          : {},
        missing_filters: Array.isArray(site.missing_filters)
          ? site.missing_filters.map((item) => String(item))
          : [],
      };
    });

  return mapped.filter(
    (site): site is SiteAuditRecord =>
      site !== null &&
      isAccommodationUrl(site.search_url) &&
      isFilterableSearchUrl(site.search_url)
  );
}

function normalizeListings(input: unknown[], sites: unknown[]): Listing[] {
  const siteSearchMap = buildSiteSearchMap(sites);
  const mapped: Array<Listing | null> = input
    .map((raw) => {
      if (!isRecord(raw)) return null;

      const totalPrice = asNumber(raw.total_price) || asNumber(raw.price_per_night);
      const pricePerNight = asNumber(raw.price_per_night) || totalPrice;

      const siteName = asString(raw.site_name) || "Unknown Site";
      const listingUrl = asUrl(raw.listing_url || raw.url);
      const rawSearchUrl = asUrl(raw.search_url);
      const searchUrl = rawSearchUrl || siteSearchMap.get(normalizeSiteName(siteName)) || "";

      return {
        site_name: siteName,
        listing_name: asString(raw.listing_name) || asString(raw.name) || "Unknown Listing",
        listing_url: listingUrl,
        search_url: searchUrl || undefined,
        area: asString(raw.area),
        price_per_night: pricePerNight,
        total_price: totalPrice,
        currency: asString(raw.currency) || "USD",
        rating: asNumber(raw.rating),
        review_count: asNumber(raw.review_count),
        room_type: asString(raw.room_type),
        max_guests: asNumber(raw.max_guests) || 1,
        beds: asString(raw.beds),
        transport_note: asString(raw.transport_note),
        checkin_policy: asString(raw.checkin_policy),
        cancellation_policy: asString(raw.cancellation_policy),
        matched_filters: isRecord(raw.matched_filters)
          ? {
              pax: Boolean(raw.matched_filters.pax),
              rooms: Boolean(raw.matched_filters.rooms),
              dates: Boolean(raw.matched_filters.dates),
              budget: Boolean(raw.matched_filters.budget),
              roomType: Boolean(raw.matched_filters.roomType),
            }
          : {
              pax: true,
              rooms: true,
              dates: true,
              budget: true,
              roomType: true,
            },
        issues: Array.isArray(raw.issues) ? raw.issues.map((v) => String(v)) : [],
      };
    });

  return mapped.filter(
    (listing): listing is Listing =>
      listing !== null &&
      isDeepListingUrl(listing.listing_url) &&
      isAccommodationUrl(listing.search_url) &&
      isFilterableSearchUrl(listing.search_url)
  );
}

function buildSiteSearchMap(sites: unknown[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const raw of sites) {
    if (!isRecord(raw)) continue;
    const siteName = normalizeSiteName(asString(raw.site_name || raw.site));
    const searchUrl = asUrl(raw.search_url || raw.url);
    if (!siteName || !searchUrl) continue;
    map.set(siteName, searchUrl);
  }

  return map;
}

function normalizeSiteName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function isAccommodationUrl(url?: string): boolean {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;

  const host = getHostname(url);
  if (!host) return false;

  return ALLOWED_ACCOMMODATION_DOMAINS.some((domain) => host.includes(domain));
}

function isFilterableSearchUrl(url?: string): boolean {
  if (!url) return false;
  if (!isAccommodationUrl(url)) return false;

  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const hasQuery = parsed.searchParams.toString().length > 0;
  const hasSearchPath = /search|hotels|stays|s\//i.test(parsed.pathname);
  return hasQuery || hasSearchPath;
}

function isDeepListingUrl(url?: string): boolean {
  if (!url) return false;
  if (!isAccommodationUrl(url)) return false;

  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const path = parsed.pathname.toLowerCase();
  const isRoot = path === "/" || path === "";
  if (isRoot) return false;

  const isSearchLike = /(^\/s\/|search|stays|hotels)(\/|$)/i.test(path);
  if (isSearchLike) return false;

  const looksLikeDetail = /(rooms\/\d+|room\/|hotel|property|detail|homestay|apartment|villa|house|p\/)\b/i.test(
    path
  );

  return looksLikeDetail;
}

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function getHostname(url: string): string {
  const parsed = safeParseUrl(url);
  return parsed?.hostname.toLowerCase() || "";
}

function validateCoverage(result: TinyFishSearchResult): TinyFishSearchResult {
  const listingHosts = new Set(
    result.listings
      .map((listing) => getHostname(listing.listing_url))
      .filter(Boolean)
      .filter((host) => !host.includes("google."))
  );

  if (listingHosts.size < MIN_TARGET_DOMAINS) {
    throw new Error(
      "TinyFish returned no valid Airbnb/Trip.com accommodation listings with real links and filterable search URLs."
    );
  }

  if (result.listings.length === 0) {
    throw new Error(
      "TinyFish returned no linkable listings with valid accommodation URLs and filtered search links."
    );
  }

  return result;
}

function extractStreamingUrl(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const candidate = input.streaming_url || input.streamingUrl || input.live_url;
  if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) {
    return candidate;
  }
  for (const key of ["data", "result", "output"] as const) {
    if (!(key in input)) continue;
    const nested = extractStreamingUrl(input[key]);
    if (nested) return nested;
  }
  return undefined;
}

function hasSiteName(input: unknown): boolean {
  if (!isRecord(input)) return false;
  return typeof (input.site_name || input.site) === "string";
}

function extractSiteName(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  return asString(input.site_name || input.site) || undefined;
}

function extractAction(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  return asString(input.action || input.step || input.status || input.message) || undefined;
}

function stringifyShort(input: unknown): string {
  if (typeof input === "string") return input.slice(0, 220);
  try {
    return JSON.stringify(input).slice(0, 220);
  } catch {
    return "tinyfish event";
  }
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asUrl(value: unknown): string {
  const text = asString(value);
  return /^https?:\/\//.test(text) ? text : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
