"use client";

import { Card, CardContent } from "@/components/ui/card";

interface BestAreaCardProps {
  area: string;
  reason: string;
}

export function BestAreaCard({ area, reason }: BestAreaCardProps) {
  return (
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/10">
      <CardContent className="relative p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
              Best Area to Stay
            </p>
            <h2 className="mb-2 text-2xl font-bold">
              {area}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {reason}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
