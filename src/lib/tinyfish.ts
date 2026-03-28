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
  targetSite?: "airbnb" | "trip";
  onProgress?: (event: {
    site?: string;
    action?: string;
    message?: string;
    streaming_url?: string;
  }) => void;
}

interface TinyFishSiteTiming {
  site: string;
  startedAt: string;
  firstProgressAt?: string;
  completedAt: string;
  queuedMs?: number;
  executionMs: number;
  totalMs: number;
  status: "fulfilled" | "rejected";
  error?: string;
}

interface TinyFishRunMetrics {
  startedAt: string;
  completedAt: string;
  totalMs: number;
  sites: TinyFishSiteTiming[];
  blockedLikely: boolean;
  blockedSignals: string[];
}

type TinyFishProfile = "lite" | "stealth";

export async function runTinyFishSearch(
  options: TinyFishRunOptions
): Promise<TinyFishSearchResult> {
  try {
    return await runTinyFishSearchOnce(options, "lite");
  } catch (firstError) {
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    if (!shouldRetryWithStealth(message)) {
      throw firstError;
    }

    options.onProgress?.({
      action: "retry_stealth",
      message: "Retrying with stealth profile and proxy due to suspected anti-bot block.",
    });

    return runTinyFishSearchOnce(options, "stealth");
  }
}

async function runTinyFishSearchOnce(
  options: TinyFishRunOptions,
  profile: TinyFishProfile
): Promise<TinyFishSearchResult> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) throw new Error("TINYFISH_API_KEY is missing.");

  const endpoint = resolveTinyFishEndpoint();
  const isSseEndpoint = /run-sse/i.test(endpoint);

  const goal = buildTinyFishGoal({
    ...options.trip,
    bestArea: options.bestArea,
    targetSite: options.targetSite,
  });
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
    // Keep both naming styles for compatibility across TinyFish API variants.
    browser_profile: profile,
    browserProfile: profile,
    ...(profile === "stealth"
      ? {
          proxy_config: {
            enabled: true,
            country_code: (process.env.TINYFISH_PROXY_COUNTRY || "US").toUpperCase(),
          },
          proxyConfig: {
            enabled: true,
            countryCode: (process.env.TINYFISH_PROXY_COUNTRY || "US").toUpperCase(),
          },
        }
      : {}),
  };

  const controller = new AbortController();
  const timeoutMs = Number(process.env.TINYFISH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), Math.max(10_000, timeoutMs));

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
    return parseSseResult(response, options, options.trip);
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
  }, options.trip);
}

export async function runTinyFishSearchConcurrent(
  options: Omit<TinyFishRunOptions, "targetSite">
): Promise<TinyFishSearchResult> {
  const sitePlans: Array<{ key: "airbnb" | "trip"; label: string }> = [
    { key: "airbnb", label: "Airbnb" },
    { key: "trip", label: "Trip.com" },
  ];

  const staggerMs = Math.max(0, Number(process.env.TINYFISH_SITE_STAGGER_MS || 0));
  const runStartedMs = Date.now();
  const perSiteFirstProgress = new Map<string, number>();
  const perSiteStarted = new Map<string, number>();

  const settled = await Promise.allSettled(
    sitePlans.map(async (plan, index) => {
      if (staggerMs > 0 && index > 0) {
        await sleep(index * staggerMs);
      }

      perSiteStarted.set(plan.label, Date.now());

      return runTinyFishSearch({
        ...options,
        targetSite: plan.key,
        onProgress: (event) => {
          if (!perSiteFirstProgress.has(plan.label)) {
            perSiteFirstProgress.set(plan.label, Date.now());
          }

          options.onProgress?.({
            ...event,
            site: event.site || plan.label,
          });
        },
      });
    }
    )
  );

  const successes = settled
    .filter((item): item is PromiseFulfilledResult<TinyFishSearchResult> => item.status === "fulfilled")
    .map((item) => item.value);

  if (successes.length === 0) {
    const reasons = settled
      .filter((item): item is PromiseRejectedResult => item.status === "rejected")
      .map((item) => (item.reason instanceof Error ? item.reason.message : String(item.reason)));
    throw new Error(`All concurrent TinyFish site searches failed: ${reasons.join(" | ")}`);
  }

  const mergedSites = dedupeSites(successes.flatMap((s) => s.sites_checked));
  const mergedListings = dedupeListings(successes.flatMap((s) => s.listings));
  const streamingUrl = successes.find((s) => s.streaming_url)?.streaming_url;
  const allBlockedSignals = Array.from(
    new Set(
      successes
        .flatMap((s) => s.metrics?.blockedSignals || [])
        .filter(Boolean)
    )
  );

  const siteTimings: TinyFishSiteTiming[] = settled.map((result, idx) => {
    const plan = sitePlans[idx];
    const startedMs = perSiteStarted.get(plan.label) || runStartedMs;
    const firstProgressMs = perSiteFirstProgress.get(plan.label);
    const completedMs = Date.now();
    const queuedMs = firstProgressMs ? Math.max(0, firstProgressMs - startedMs) : undefined;
    const executionStart = firstProgressMs || startedMs;
    const executionMs = Math.max(0, completedMs - executionStart);
    const totalMs = Math.max(0, completedMs - startedMs);

    if (result.status === "fulfilled") {
      return {
        site: plan.label,
        startedAt: new Date(startedMs).toISOString(),
        firstProgressAt: firstProgressMs ? new Date(firstProgressMs).toISOString() : undefined,
        completedAt: new Date(completedMs).toISOString(),
        queuedMs,
        executionMs,
        totalMs,
        status: "fulfilled",
      };
    }

    return {
      site: plan.label,
      startedAt: new Date(startedMs).toISOString(),
      firstProgressAt: firstProgressMs ? new Date(firstProgressMs).toISOString() : undefined,
      completedAt: new Date(completedMs).toISOString(),
      queuedMs,
      executionMs,
      totalMs,
      status: "rejected",
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  const runCompletedMs = Date.now();
  const metrics: TinyFishRunMetrics = {
    startedAt: new Date(runStartedMs).toISOString(),
    completedAt: new Date(runCompletedMs).toISOString(),
    totalMs: Math.max(0, runCompletedMs - runStartedMs),
    sites: siteTimings,
    blockedLikely: allBlockedSignals.length > 0,
    blockedSignals: allBlockedSignals,
  };

  return validateCoverage({
    streaming_url: streamingUrl,
    sites_checked: mergedSites,
    listings: mergedListings,
    metrics,
  }, options.trip);
}

function dedupeSites(sites: SiteAuditRecord[]): SiteAuditRecord[] {
  const seen = new Set<string>();
  const out: SiteAuditRecord[] = [];
  for (const site of sites) {
    const key = `${site.site_name}|${site.search_url || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(site);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeListings(listings: Listing[]): Listing[] {
  const seen = new Set<string>();
  const out: Listing[] = [];
  for (const listing of listings) {
    const key = listing.listing_url || `${listing.site_name}|${listing.listing_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(listing);
  }
  return out;
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

  // Start at Airbnb homepage — the goal instructions navigate the agent from here.
  return "https://www.airbnb.com";
}

async function parseSseResult(
  response: Response,
  options: TinyFishRunOptions,
  trip: TripInput
): Promise<TinyFishSearchResult> {
  const decoder = new TextDecoder();
  const reader = response.body!.getReader();
  let buffer = "";
  let latestStreamingUrl: string | undefined;
  let finalResult: TinyFishSearchResult | null = null;
  const blockedSignals = new Set<string>();

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

      const maybeBlocked = detectBlockedSignalFromUnknown(payloadValue);
      if (maybeBlocked) blockedSignals.add(maybeBlocked);
    }
  }

  if (!finalResult) {
    throw new Error("TinyFish stream finished without a final structured result.");
  }

  return validateCoverage({
    streaming_url: finalResult.streaming_url || latestStreamingUrl,
    sites_checked: normalizeSites(finalResult.sites_checked),
    listings: normalizeListings(finalResult.listings, finalResult.sites_checked),
    metrics: {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalMs: 0,
      sites: [],
      blockedLikely: blockedSignals.size > 0,
      blockedSignals: Array.from(blockedSignals),
    },
  }, trip);
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
      const houseRules = extractHouseRules(raw);

      return {
        site_name: siteName,
        listing_name: asString(raw.listing_name) || asString(raw.name) || "Unknown Listing",
        listing_url: listingUrl,
        search_url: searchUrl || undefined,
        area: asString(raw.area),
        postal_code:
          asString(raw.postal_code) || asString(raw.postcode) || asString(raw.zip_code) || undefined,
        lat: asNumber(raw.lat) || asNumber(raw.latitude) || undefined,
        lng: asNumber(raw.lng) || asNumber(raw.longitude) || undefined,
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
        house_rules: houseRules || undefined,
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
        tripadvisor_rating: asNumber(raw.tripadvisor_rating) || undefined,
        tripadvisor_reviews: asNumber(raw.tripadvisor_reviews) || undefined,
        safety_note: asString(raw.safety_note) || undefined,
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

function shouldRetryWithStealth(message: string): boolean {
  const text = message.toLowerCase();
  return /blocked|access denied|403|cloudflare|datadome|captcha|checking your browser|no valid|no linkable|empty/i.test(
    text
  );
}

function detectBlockedSignalFromUnknown(input: unknown): string | null {
  const text = stringifyShort(input).toLowerCase();
  const matched = /(access denied|captcha|cloudflare|datadome|blocked|forbidden|checking your browser|verify you are human)/i.exec(
    text
  );
  return matched?.[1] || null;
}

function getHostname(url: string): string {
  const parsed = safeParseUrl(url);
  return parsed?.hostname.toLowerCase() || "";
}

function validateCoverage(result: TinyFishSearchResult, trip: TripInput): TinyFishSearchResult {
  const listingHosts = new Set(
    result.listings
      .map((listing) => getHostname(listing.listing_url))
      .filter(Boolean)
      .filter((host) => !host.includes("google."))
  );

  const blockedSignals = new Set<string>(result.metrics?.blockedSignals || []);
  for (const listing of result.listings) {
    for (const issue of listing.issues || []) {
      const maybe = detectBlockedSignalFromUnknown(issue);
      if (maybe) blockedSignals.add(maybe);
    }
  }

  const hasDates = Boolean(trip.checkIn && trip.checkOut);
  const hasBudget = trip.budget.amount > 0;
  const requiredSites = trip.propertyTypes.includes("hotel") || trip.propertyTypes.includes("airbnb") ? 1 : 1;
  const sitesWithCoverage = result.sites_checked.filter((site) => {
    const missing = new Set(site.missing_filters || []);
    if (hasDates && (missing.has("checkIn") || missing.has("checkOut"))) return false;
    if (hasBudget && missing.has("budget")) return false;
    if (trip.pax > 0 && missing.has("pax")) return false;
    if (trip.rooms > 0 && missing.has("rooms")) return false;
    return true;
  });

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

  const unknownNameRatio =
    result.listings.filter((listing) => /unknown listing/i.test(listing.listing_name)).length /
    Math.max(1, result.listings.length);

  const zeroPriceRatio =
    result.listings.filter((listing) => (listing.total_price || 0) <= 0 && (listing.price_per_night || 0) <= 0)
      .length / Math.max(1, result.listings.length);

  if (unknownNameRatio >= 0.8 || zeroPriceRatio >= 0.8) {
    throw new Error(
      "TinyFish returned low-quality structured data (mostly unnamed or zero-price listings)."
    );
  }

  if (sitesWithCoverage.length < requiredSites && result.listings.length < 3) {
    throw new Error(
      "TinyFish completed but did not apply required filters reliably across sites (quality gate)."
    );
  }

  if (blockedSignals.size > 0 && result.listings.length < 2) {
    throw new Error(
      `TinyFish appears blocked (signals: ${Array.from(blockedSignals).join(", ")}) and returned too few viable listings.`
    );
  }

  if (result.metrics) {
    result.metrics.blockedLikely = blockedSignals.size > 0;
    result.metrics.blockedSignals = Array.from(blockedSignals);
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

function extractHouseRules(raw: Record<string, unknown>): string {
  const candidateLines: string[] = [];

  const directCandidates = [
    asString(raw.house_rules),
    asString(raw.houseRules),
    asString(raw.rules),
    asString(raw.house_rules_summary),
    asString(raw.property_rules),
  ].filter(Boolean);

  for (const item of directCandidates) {
    candidateLines.push(...splitRuleLines(item));
  }

  if (Array.isArray(raw.house_rules)) {
    for (const item of raw.house_rules) {
      const text = asString(item);
      if (text) candidateLines.push(...splitRuleLines(text));
    }
  }

  const checkin =
    asString(raw.checkin_window) ||
    asString(raw.check_in_window) ||
    asString(raw.checkin_time) ||
    asString(raw.check_in_time);
  const checkout =
    asString(raw.checkout_policy) ||
    asString(raw.check_out_policy) ||
    asString(raw.checkout_time) ||
    asString(raw.check_out_time);
  const guestLimit = asNumber(raw.guest_limit) || asNumber(raw.guests_max) || asNumber(raw.max_guests);

  if (checkin) candidateLines.push(`Check-in: ${checkin}`);
  if (checkout) candidateLines.push(`Checkout: ${checkout}`);
  if (guestLimit > 0) candidateLines.push(`${guestLimit} guests maximum`);

  const deduped = dedupeRuleLines(candidateLines);
  return deduped.join(" | ");
}

function splitRuleLines(input: string): string[] {
  return input
    .split(/\r?\n|\s*\|\s*|\s*;\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function dedupeRuleLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const key = line.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }

  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
