"use client";

import { useEffect, useState } from "react";
import { ResultCard } from "@/components/result-card";
import { BestAreaCard } from "@/components/best-area-card";
import { Card, CardContent } from "@/components/ui/card";
import { AgentResult } from "@/types/itinerary";
import { RejectedListing } from "@/types/hotel";

export default function ResultsPage() {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    // Load result from sessionStorage (set by main page)
    const stored = sessionStorage.getItem("tripwise-result");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {
        // Invalid data
      }
    }
  }, []);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <p className="text-muted-foreground mb-4">No results to display.</p>
        <a
          href="/"
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          ← Start a new search
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <a
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
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
            d="M15 19l-7-7 7-7"
          />
        </svg>
        New search
      </a>

      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <BestAreaCard area={result.bestArea} reason={result.areaReason} />

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Recommendations
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {result.bestOverall && (
              <ResultCard
                listing={result.bestOverall}
                label="Best Overall"
                highlight
              />
            )}
            {result.cheapestAcceptable &&
              result.cheapestAcceptable.name !== result.bestOverall?.name && (
                <ResultCard
                  listing={result.cheapestAcceptable}
                  label="Cheapest Viable"
                />
              )}
            {result.backupOption &&
              result.backupOption.name !== result.bestOverall?.name &&
              result.backupOption.name !==
                result.cheapestAcceptable?.name && (
                <ResultCard
                  listing={result.backupOption}
                  label="Backup Option"
                />
              )}
          </div>
        </div>

        <Card className="bg-gradient-to-br from-card to-card/50 border-border/40">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-violet-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              Why this recommendation?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {result.explanation}
            </p>
          </CardContent>
        </Card>

        {result.rejectedOptions.length > 0 && (
          <div>
            <button
              onClick={() => setShowRejected(!showRejected)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${
                  showRejected ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {result.rejectedOptions.length} rejected option
              {result.rejectedOptions.length !== 1 ? "s" : ""}
            </button>

            {showRejected && (
              <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                {result.rejectedOptions.map(
                  (item: RejectedListing, idx: number) => (
                    <Card
                      key={idx}
                      className="border-red-500/10 bg-red-500/5 opacity-60"
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-red-400">
                            {item.rejectionReason}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-muted-foreground">
                          ${item.price}/night
                        </span>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
