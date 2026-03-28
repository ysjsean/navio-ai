"use client";

import { Listing } from "@/types/hotel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ResultCardProps {
  listing: Listing;
  label: string;
  highlight?: boolean;
}

const sourceColors: Record<string, string> = {
  hotel: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  airbnb: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  hostel: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "serviced-apartment": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const sourceLabels: Record<string, string> = {
  hotel: "Hotel",
  airbnb: "Airbnb",
  hostel: "Hostel",
  "serviced-apartment": "Serviced Apt",
};

function renderStars(rating: number) {
  const full = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const stars = [];

  for (let i = 0; i < full; i++) {
    stars.push(
      <svg key={`f-${i}`} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  if (hasHalf) {
    stars.push(
      <svg key="half" className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24">
        <defs>
          <linearGradient id="half-star">
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          fill="url(#half-star)"
          stroke="currentColor"
          strokeWidth="1"
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        />
      </svg>
    );
  }

  return <div className="flex items-center gap-0.5">{stars}</div>;
}

export function ResultCard({ listing, label, highlight }: ResultCardProps) {
  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 hover:scale-[1.02] ${
        highlight
          ? "ring-2 ring-violet-500/50 shadow-lg shadow-violet-500/10 bg-gradient-to-br from-violet-500/5 to-indigo-500/5"
          : "hover:shadow-md"
      }`}
    >
      {highlight && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
      )}
      <CardContent className="p-5">
        {/* Label */}
        <div className="flex items-center justify-between mb-3">
          <span
            className={`text-xs font-bold uppercase tracking-wider ${
              highlight ? "text-violet-400" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] ${sourceColors[listing.source] || ""}`}
          >
            {sourceLabels[listing.source] || listing.source}
          </Badge>
        </div>

        {/* Name & Price */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-foreground leading-snug">
            {listing.name}
          </h3>
          <div className="text-right flex-shrink-0">
            <span className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              ${listing.price}
            </span>
            <span className="text-xs text-muted-foreground block">/night</span>
          </div>
        </div>

        {/* Rating & Area */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            {renderStars(listing.rating)}
            <span className="text-xs text-muted-foreground ml-1">
              {listing.rating}
            </span>
          </div>
          <div className="w-px h-3 bg-border" />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {listing.area}
          </span>
        </div>

        {/* Policy */}
        <p className="text-xs text-muted-foreground/70 mb-4">{listing.policy}</p>

        {/* Link */}
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
        >
          View listing
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </CardContent>
    </Card>
  );
}
