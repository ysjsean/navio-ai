"use client";

import { Listing } from "@/types/listing";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResultCardProps {
  listing: Listing;
  label: string;
  highlight?: boolean;
}

export function ResultCard({ listing, label, highlight }: ResultCardProps) {
  const scoreValue =
    typeof listing.score === "number" && Number.isFinite(listing.score)
      ? listing.score
      : null;

  const priceLine = `${listing.currency} ${listing.price_per_night} / night`;
  const totalLine = `${listing.currency} ${listing.total_price} total`;
  const cancellationDisplay = formatCancellationDisplay(listing);
  const houseRuleLines = toHouseRuleLines(listing.house_rules);

  return (
    <Card
      className={
        highlight
          ? "border-primary/60 bg-gradient-to-b from-primary/10 to-background"
          : "border-border/80 bg-gradient-to-b from-muted/30 to-background"
      }
    >
      <CardHeader>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{label}</CardTitle>
            {scoreValue !== null ? <Badge>Score {scoreValue.toFixed(2)} / 100</Badge> : null}
          </div>
          <p className="text-base font-semibold leading-tight">{listing.listing_name}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-lg border bg-background/80 p-3">
          <p className="text-sm font-medium">{priceLine}</p>
          <p className="text-xs text-muted-foreground">{totalLine}</p>
          {listing.total_price_sgd !== undefined ? (
            <p className="mt-1 text-xs text-muted-foreground">
              FX mapped: SGD {listing.price_per_night_sgd ?? "-"} / night (SGD {listing.total_price_sgd} total)
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Area: {listing.area || "-"}</Badge>
          <Badge variant="outline">
            Rating: {listing.rating} ({listing.review_count} reviews)
          </Badge>
          <Badge variant="outline">Room: {listing.room_type || "-"}</Badge>
          <Badge variant="outline">Beds: {listing.beds || "-"}</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Postal: {listing.postal_code || "Not available"}
          {" | "}
          Coords: {formatCoords(listing)}
        </p>
        {listing.geo_source?.startsWith("google") ? (
          <p className="text-xs text-muted-foreground">
            Location enrichment source: Google
            {listing.geo_reference_url ? (
              <>
                {" "}
                <a href={listing.geo_reference_url} target="_blank" rel="noopener noreferrer" className="underline">
                  (reference)
                </a>
              </>
            ) : null}
            {listing.geo_source === "google_geocoding_failed" ? " - Not found on Google." : ""}
          </p>
        ) : null}

        <div className="space-y-1 rounded-lg border bg-muted/20 p-3">
          <p>Transport: {listing.transport_note || "Not provided"}</p>
        {listing.estimated_transit_minutes !== undefined ? (
            <p>Avg transit to waypoints: ~{listing.estimated_transit_minutes} min</p>
        ) : null}
        {listing.tripadvisor_rating !== undefined ? (
            <p>
              TripAdvisor: {listing.tripadvisor_rating}/5
              {listing.tripadvisor_reviews ? ` (${listing.tripadvisor_reviews} reviews)` : ""}
            </p>
        ) : null}
          {listing.safety_note ? <p>Safety: {listing.safety_note}</p> : null}
          <p>Check-in: {listing.checkin_policy || "Not specified"}</p>
          <p>Cancellation: {cancellationDisplay.value}</p>
          <div>
            <p>House rules:</p>
            {houseRuleLines.length > 0 ? (
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {houseRuleLines.map((line, idx) => (
                  <p key={`${line}-${idx}`}>- {line}</p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not provided</p>
            )}
          </div>
          {cancellationDisplay.note ? (
            <p className="text-xs text-muted-foreground">{cancellationDisplay.note}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Cancellation deadlines are listing-supplied and can depend on booking timestamp/timezone.
            Always verify final policy at checkout.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(listing.matched_filters).map(([key, value]) => (
            <Badge key={key} variant="outline" className={value ? "border-green-500/50" : "border-red-500/50"}>
              {key}: {value ? "yes" : "no"}
            </Badge>
          ))}
        </div>

        {listing.score_breakdown ? (
          <div className="rounded-lg border bg-background/80 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Score breakdown</p>
            <p>
              Each dimension shows normalized quality score first, then weighted contribution.
            </p>
            {(
              [
                ["transitConvenience", "Transit convenience"],
                ["price", "Price / value"],
                ["safety", "Safety"],
                ["socialProof", "Social proof"],
                ["policy", "Policies"],
                ["roomFit", "Room fit"],
              ] as [keyof NonNullable<typeof listing.score_breakdown>, string][]
            ).map(([key, label]) => {
              const val = listing.score_breakdown?.[key];
              const maxWeight = SCORE_WEIGHTS[key];
              const normalized =
                typeof val === "number" && Number.isFinite(val) && maxWeight > 0
                  ? ((val / maxWeight) * 10).toFixed(1)
                  : "-";
              return (
                <p key={key}>
                  {label}: {normalized}/10 ({typeof val === "number" && Number.isFinite(val) ? val.toFixed(1) : "-"}/{maxWeight} weighted)
                </p>
              );
            })}
          </div>
        ) : null}

        <div className="flex gap-4 text-xs">
          <a href={listing.listing_url} target="_blank" rel="noopener noreferrer" className="underline">
            Listing link
          </a>
          {listing.search_url ? (
            <a href={listing.search_url} target="_blank" rel="noopener noreferrer" className="underline">
              Filtered search link
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

const SCORE_WEIGHTS: Record<keyof NonNullable<Listing["score_breakdown"]>, number> = {
  transitConvenience: 30,
  price: 20,
  safety: 15,
  socialProof: 15,
  policy: 10,
  roomFit: 10,
};

function formatCoords(listing: Listing): string {
  if (listing.lat === undefined || listing.lng === undefined) {
    return "Not available";
  }
  return `${listing.lat.toFixed(5)}, ${listing.lng.toFixed(5)}`;
}

function formatCancellationDisplay(listing: Listing): { value: string; note?: string } {
  const raw = (listing.cancellation_policy || "").trim();
  if (!raw) return { value: "Not specified" };

  const hasDateSensitivePhrase = /free cancellation\s+before|cancel(?:lation)?\s+before/i.test(raw);
  const hasKnownDates = Boolean(listing.matched_filters?.dates);

  if (hasDateSensitivePhrase && !hasKnownDates) {
    return {
      value: "Date-dependent free cancellation may apply",
      note: "Exact cutoff cannot be determined without confirmed booking/check-in dates.",
    };
  }

  return { value: raw };
}

function toHouseRuleLines(rules: string | undefined): string[] {
  const text = (rules || "").trim();
  if (!text) return [];

  const lines = text
    .split(/\r?\n|\s*\|\s*|\s*;\s*/)
    .map((line) => line.trim())
    .filter(Boolean);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  return unique;
}
