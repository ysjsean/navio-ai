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
  const hasScore = typeof listing.score === "number" && Number.isFinite(listing.score);

  return (
    <Card className={highlight ? "border-primary/60 bg-primary/5" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{label}</CardTitle>
          {hasScore ? <Badge>Score {listing.score.toFixed(2)}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="font-semibold">{listing.listing_name}</p>
        <p>
          {listing.currency} {listing.price_per_night} / night ({listing.currency} {listing.total_price} total)
        </p>
        <p>
          Area: {listing.area} | Rating: {listing.rating} ({listing.review_count} reviews)
        </p>
        <p>Room: {listing.room_type} | Beds: {listing.beds}</p>
        <p>Transport: {listing.transport_note}</p>
        <p>Check-in: {listing.checkin_policy}</p>
        <p>Cancellation: {listing.cancellation_policy}</p>

        <div className="flex flex-wrap gap-2">
          {Object.entries(listing.matched_filters).map(([key, value]) => (
            <Badge key={key} variant="outline" className={value ? "border-green-500/50" : "border-red-500/50"}>
              {key}: {value ? "yes" : "no"}
            </Badge>
          ))}
        </div>

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
