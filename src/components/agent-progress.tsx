"use client";

import { AgentStep } from "@/types/itinerary";

interface AgentProgressProps {
  steps: AgentStep[];
}

export function AgentProgress({ steps }: AgentProgressProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Agent Progress
      </h3>
      <div className="relative">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex items-start gap-4 pb-6 last:pb-0">
            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={`absolute left-[15px] top-[32px] w-[2px] h-[calc(100%-32px)] transition-colors duration-500 ${
                  step.status === "done"
                    ? "bg-gradient-to-b from-green-500 to-green-500/20"
                    : "bg-border/30"
                }`}
                style={{
                  top: `${idx * 56 + 32}px`,
                  height: "24px",
                }}
              />
            )}

            {/* Step icon */}
            <div
              className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${
                step.status === "done"
                  ? "bg-green-500/20 text-green-500 ring-2 ring-green-500/30"
                  : step.status === "active"
                  ? "bg-violet-500/20 text-violet-400 ring-2 ring-violet-500/50 animate-pulse"
                  : step.status === "error"
                  ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step.status === "done" ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : step.status === "active" ? (
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : step.status === "error" ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <span className="text-xs font-bold">{step.id}</span>
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 min-w-0 pt-1">
              <p
                className={`text-sm font-medium transition-colors duration-300 ${
                  step.status === "done"
                    ? "text-green-500"
                    : step.status === "active"
                    ? "text-foreground"
                    : step.status === "error"
                    ? "text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </p>
              {step.detail && (
                <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
