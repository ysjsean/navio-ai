import { Listing } from "@/types/listing";

const GOOGLE_GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

interface EnrichOptions {
  city: string;
  onProgress?: (message: string) => void;
}

export async function enrichListingsWithGoogleGeo(
  listings: Listing[],
  options: EnrichOptions
): Promise<Listing[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const needsEnrichment = listings.filter(needsGeoEnrichment);

  if (needsEnrichment.length === 0) return listings;

  if (!apiKey) {
    options.onProgress?.(
      "Google geocode fallback skipped (GOOGLE_MAPS_API_KEY not set)."
    );
    return listings.map((listing) => {
      if (!needsGeoEnrichment(listing)) return listing;
      const referenceUrl = buildGoogleSearchUrl(listing, options.city);
      return {
        ...listing,
        geo_reference_url: listing.geo_reference_url || referenceUrl,
        geo_source: listing.geo_source || "google_search_link_only",
      };
    });
  }

  options.onProgress?.(
    `Attempting Google enrichment for ${needsEnrichment.length} listing(s) missing postal/coords.`
  );

  const out: Listing[] = [];
  for (const listing of listings) {
    if (!needsGeoEnrichment(listing)) {
      out.push(listing);
      continue;
    }

    const referenceUrl = buildGoogleSearchUrl(listing, options.city);
    try {
      const enriched = await geocodeListingWithGoogle(listing, options.city, apiKey);
      out.push({
        ...listing,
        lat: listing.lat ?? enriched.lat,
        lng: listing.lng ?? enriched.lng,
        postal_code: listing.postal_code || enriched.postalCode,
        geo_source: "google_geocoding",
        geo_reference_url: referenceUrl,
      });
    } catch {
      out.push({
        ...listing,
        geo_source: listing.geo_source || "google_geocoding_failed",
        geo_reference_url: listing.geo_reference_url || referenceUrl,
      });
    }
  }

  return out;
}

function needsGeoEnrichment(listing: Listing): boolean {
  return !listing.postal_code || listing.lat === undefined || listing.lng === undefined;
}

function buildGoogleSearchUrl(listing: Listing, city: string): string {
  const query = [listing.listing_name, listing.area, city].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

async function geocodeListingWithGoogle(
  listing: Listing,
  city: string,
  apiKey: string
): Promise<{ lat?: number; lng?: number; postalCode?: string }> {
  const query = [listing.listing_name, listing.area, city].filter(Boolean).join(", ");
  const url = `${GOOGLE_GEOCODE_ENDPOINT}?address=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`Google geocode request failed (${response.status}).`);

  const json = (await response.json()) as {
    status?: string;
    results?: Array<{
      geometry?: { location?: { lat?: number; lng?: number } };
      address_components?: Array<{ long_name?: string; types?: string[] }>;
    }>;
  };

  const first = json.results?.[0];
  if (!first) throw new Error(`No geocode result for ${query}`);

  const lat = first.geometry?.location?.lat;
  const lng = first.geometry?.location?.lng;
  const postal = first.address_components?.find((comp) =>
    Array.isArray(comp.types) && comp.types.includes("postal_code")
  )?.long_name;

  return {
    lat: typeof lat === "number" ? lat : undefined,
    lng: typeof lng === "number" ? lng : undefined,
    postalCode: postal || undefined,
  };
}
