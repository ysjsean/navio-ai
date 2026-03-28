"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BestAreaCard } from "@/components/best-area-card";
import { ResultCard } from "@/components/result-card";
import { SiteAuditCard } from "@/components/site-audit-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinalRunResult } from "@/types/listing";

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId") || "";
  const [result, setResult] = useState<FinalRunResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!runId) return;
    const load = async () => {
      try {
        const response = await fetch(`/api/run-agent/result?runId=${encodeURIComponent(runId)}`);
        if (!response.ok) {
          throw new Error("Result not found for run id.");
        }
        const payload = (await response.json()) as FinalRunResult;
        setResult(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load result.");
      }
    };

    void load();
  }, [runId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="mb-4 rounded-lg border border-red-500/50 p-3 text-sm text-red-400">{error}</p>
        <Link href="/search" className="underline">
          Start a new run
        </Link>
      </div>
    );
  }

  if (!result) {
    return <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">Loading result...</div>;
  }

  const chosen = result.rankings.bestOverall;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Decision Result</h1>
        <Link href="/search" className="text-sm underline">
          New search
        </Link>
      </div>

      <BestAreaCard area={result.bestArea} reason={result.areaReason} />

      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle>Chosen Accommodation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {chosen ? (
            <>
              <p className="text-base font-semibold">
                {chosen.listing_name} ({chosen.site_name})
              </p>
              <p className="text-muted-foreground">
                {chosen.currency} {chosen.price_per_night} / night ({chosen.currency} {chosen.total_price} total) · Area {chosen.area} · Rating {chosen.rating}
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <a
                  href={chosen.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Open chosen listing
                </a>
                {chosen.search_url ? (
                  <a
                    href={chosen.search_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Open filtered search used
                  </a>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">No winning listing available.</p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        {result.rankings.bestOverall ? (
          <ResultCard listing={result.rankings.bestOverall} label="Best Overall" highlight />
        ) : null}
        {result.rankings.cheapestAcceptable ? (
          <ResultCard listing={result.rankings.cheapestAcceptable} label="Cheapest Acceptable" />
        ) : null}
        {result.rankings.backupOption ? (
          <ResultCard listing={result.rankings.backupOption} label="Backup Option" />
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Why this option won</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="space-y-2">
            {result.explanation
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, idx) => (
                <p key={`${line}-${idx}`}>{line}</p>
              ))}
          </div>
          {result.usedMockData ? (
            <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              TinyFish fallback mode was used.
              {result.errorNote ? ` ${result.errorNote}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Site Audit Trail</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {result.sitesChecked.map((audit, idx) => (
            <SiteAuditCard key={`${audit.site_name}-${idx}`} audit={audit} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Rejected Options</h2>
        <div className="space-y-3">
          {result.rankings.rejectedOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rejected options captured.</p>
          ) : (
            result.rankings.rejectedOptions.map((item, idx) => (
              <Card key={`${item.listing.listing_name}-${idx}`}>
                <CardContent className="space-y-2 pt-4 text-sm">
                  <p className="font-semibold">{item.listing.listing_name}</p>
                  <p className="text-xs text-muted-foreground">{item.reasons.join("; ")}</p>
                  <a href={item.listing.listing_url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                    Open listing
                  </a>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
