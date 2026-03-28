"use client";

import { SiteAuditRecord } from "@/types/listing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SiteAuditCardProps {
  audit: SiteAuditRecord;
}

export function SiteAuditCard({ audit }: SiteAuditCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{audit.site_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {audit.search_url ? (
          <a href={audit.search_url} target="_blank" rel="noopener noreferrer" className="underline">
            Open filtered search
          </a>
        ) : (
          <p className="text-muted-foreground">No search URL captured.</p>
        )}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <p className="mb-1 font-semibold">Filters applied</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(audit.filters_applied, null, 2)}</pre>
        </div>
        <p className="text-xs text-muted-foreground">
          Missing filters: {audit.missing_filters.length > 0 ? audit.missing_filters.join(", ") : "none"}
        </p>
      </CardContent>
    </Card>
  );
}
