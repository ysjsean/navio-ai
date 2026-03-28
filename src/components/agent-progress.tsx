"use client";

import { useEffect, useState } from "react";
import { AgentStep } from "@/types/itinerary";

interface AgentProgressProps {
  steps: AgentStep[];
}

// Target overall % when each step becomes active
const STEP_TARGETS = [0, 15, 30, 75, 88, 100];

export function AgentProgress({ steps }: AgentProgressProps) {
  const [overallPct, setOverallPct] = useState(0);
  const [stepPcts, setStepPcts] = useState<number[]>(steps.map(() => 0));

  useEffect(() => {
    const activeIdx = steps.findIndex((s) => s.status === "active");
    const doneCount = steps.filter((s) => s.status === "done").length;

    // Target for overall bar
    const target =
      activeIdx !== -1
        ? STEP_TARGETS[activeIdx]
        : doneCount === steps.length
        ? 100
        : STEP_TARGETS[doneCount];

    // Smoothly tick overall % toward target
    const interval = setInterval(() => {
      setOverallPct((prev) => {
        if (prev >= target) return prev;
        const step = Math.max(0.5, (target - prev) * 0.05);
        return Math.min(target, prev + step);
      });
    }, 80);

    // Per-step percentages
    setStepPcts(
      steps.map((s) => {
        if (s.status === "done") return 100;
        if (s.status === "error") return 100;
        return 0;
      })
    );

    return () => clearInterval(interval);
  }, [steps]);

  // Animate active step's own bar from 0 → 90 slowly
  useEffect(() => {
    const activeIdx = steps.findIndex((s) => s.status === "active");
    if (activeIdx === -1) return;

    const interval = setInterval(() => {
      setStepPcts((prev) => {
        const next = [...prev];
        next[activeIdx] = Math.min(90, (next[activeIdx] ?? 0) + 0.6);
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [steps]);

  const displayPct = Math.round(overallPct);

  return (
    <div className="space-y-5">
      {/* Overall progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Agent Progress
          </h3>
          <span className="text-sm font-bold tabular-nums text-violet-400">
            {displayPct}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border/30 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="relative">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex items-start gap-4 pb-6 last:pb-0">
            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={`absolute left-[15px] w-[2px] h-6 transition-colors duration-500 ${
                  step.status === "done"
                    ? "bg-gradient-to-b from-green-500 to-green-500/20"
                    : "bg-border/30"
                }`}
                style={{ top: `${idx * 56 + 32}px` }}
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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : step.status === "active" ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : step.status === "error" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <span className="text-xs font-bold">{step.id}</span>
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center justify-between gap-2">
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
                {(step.status === "active" || step.status === "done") && (
                  <span
                    className={`text-xs font-semibold tabular-nums shrink-0 ${
                      step.status === "done" ? "text-green-500" : "text-violet-400"
                    }`}
                  >
                    {Math.round(stepPcts[idx] ?? 0)}%
                  </span>
                )}
              </div>

              {/* Per-step progress bar */}
              {(step.status === "active" || step.status === "done") && (
                <div className="mt-1.5 h-1 w-full rounded-full bg-border/30 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      step.status === "done"
                        ? "bg-green-500"
                        : "bg-gradient-to-r from-violet-500 to-indigo-400"
                    }`}
                    style={{ width: `${stepPcts[idx] ?? 0}%` }}
                  />
                </div>
              )}

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
