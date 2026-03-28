"use client";

import { Card, CardContent } from "@/components/ui/card";

interface BestAreaCardProps {
  area: string;
  reason: string;
}

export function BestAreaCard({ area, reason }: BestAreaCardProps) {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-violet-500/10 via-indigo-500/10 to-cyan-500/10 border-violet-500/20">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-500/5 via-transparent to-transparent" />
      <CardContent className="relative p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/25">
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
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">
              Best Area to Stay
            </p>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent mb-2">
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
