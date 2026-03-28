"use client";

import { useState, useRef } from "react";
import { TripForm } from "@/components/trip-form";
import { AgentProgress } from "@/components/agent-progress";
import { ResultCard } from "@/components/result-card";
import { BestAreaCard } from "@/components/best-area-card";
import { Card, CardContent } from "@/components/ui/card";
import { AgentStep, AgentResult } from "@/types/itinerary";
import { PriceWatchForm } from "@/components/price-watch-form";
import { AreaMap } from "@/components/area-map";
import { RejectedListing } from "@/types/hotel";

const INITIAL_STEPS: AgentStep[] = [
  { id: 1, label: "Parsing itinerary", status: "pending" },
  { id: 2, label: "Selecting best area", status: "pending" },
  { id: 3, label: "Searching accommodations", status: "pending" },
  { id: 4, label: "Ranking & scoring results", status: "pending" },
  { id: 5, label: "Generating explanation", status: "pending" },
];

type Screen = "landing" | "input" | "progress" | "results";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [steps, setSteps] = useState<AgentStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const stepsRef = useRef<AgentStep[]>(INITIAL_STEPS);

  const setStepStatus = (id: number, status: AgentStep["status"], detail?: string) => {
    setSteps((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, status, ...(detail ? { detail } : {}) } : s
      );
      stepsRef.current = next;
      return next;
    });
  };

  const handleSubmit = async (formData: FormData) => {
    setScreen("progress");
    setStreamingUrl(null);
    const fresh = INITIAL_STEPS.map((s) => ({ ...s, status: "pending" as const }));
    setSteps(fresh);
    stepsRef.current = fresh;

    try {
      const res = await fetch("/api/run-agent", {
        method: "POST",
        body: formData,
      });

      if (!res.ok || !res.body) throw new Error("Agent failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const stepDetails: Record<number, string> = {
        1: "Extracting travel data...",
        2: "Analyzing locations...",
        3: "Browsing Booking.com...",
        4: "Scoring and comparing...",
        5: "Generating recommendation...",
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const event = JSON.parse(line.slice(5).trim());

            if (event.type === "step") {
              setStepStatus(event.id, event.status, stepDetails[event.id]);
            } else if (event.type === "streaming_url") {
              setStreamingUrl(event.url);
            } else if (event.type === "result") {
              setResult({
                bestArea: event.bestArea,
                areaReason: event.areaReason,
                bestOverall: event.bestOverall,
                cheapestAcceptable: event.cheapestAcceptable,
                backupOption: event.backupOption,
                rejectedOptions: event.rejectedOptions,
                explanation: event.explanation,
                dates: event.dates,
                budget: event.budget,
              });
              await delay(500);
              setScreen("results");
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err) {
      console.error(err);
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "active"
            ? { ...s, status: "error", detail: "Failed" }
            : s
        )
      );
    }
  };

  // ── Landing Screen ──
  if (screen === "landing") {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-140px)] px-6">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 text-center max-w-2xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs font-medium text-violet-400">
              AI Decision Agent
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
              Find where to stay,
            </span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              not just where&apos;s cheap.
            </span>
          </h1>

          <p className="text-lg text-muted-foreground/70 mb-10 max-w-lg mx-auto leading-relaxed">
            Paste your itinerary or upload a file. TripWise AI picks the best
            area, searches real listings, and explains why — so you don&apos;t compromise.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 justify-center mb-10">
            {[
              "Area-first logic",
              "Real listing search",
              "Trade-off analysis",
              "PDF & DOCX upload",
            ].map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-lg bg-card/50 border border-border/50 text-xs text-muted-foreground backdrop-blur-sm"
              >
                {f}
              </span>
            ))}
          </div>

          <button
            id="get-started"
            onClick={() => setScreen("input")}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-base shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-500 hover:to-indigo-500 transition-all duration-300 transform hover:scale-105"
          >
            Get Started
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
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Input Screen ──
  if (screen === "input") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <button
          onClick={() => setScreen("landing")}
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
          Back
        </button>

        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            Describe your trip
          </h2>
          <p className="text-muted-foreground">
            Paste your itinerary or upload a PDF/DOCX file. Include dates,
            locations, and any preferences.
          </p>
        </div>

        <TripForm onSubmit={handleSubmit} isLoading={false} />
      </div>
    );
  }

  // ── Progress Screen ──
  if (screen === "progress") {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center mb-4 animate-pulse">
            <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-1">Agent is working</h2>
          <p className="text-sm text-muted-foreground">
            Analyzing your trip and finding the best accommodation...
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Steps */}
          <div className="lg:w-72 shrink-0">
            <AgentProgress steps={steps} />
          </div>

          {/* Live browser preview */}
          <div className="flex-1">
            {streamingUrl ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live agent browser
                </p>
                <div className="rounded-xl overflow-hidden border border-border/40 bg-card" style={{ height: "420px" }}>
                  <iframe
                    src={streamingUrl}
                    className="w-full h-full"
                    sandbox="allow-scripts allow-same-origin"
                    title="TinyFish live preview"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/20 bg-card/30 flex flex-col items-center justify-center text-center gap-3" style={{ height: "420px" }}>
                <svg className="w-8 h-8 text-muted-foreground/30 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-muted-foreground/50">Live browser preview will appear here<br />once the agent starts searching</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Results Screen ──
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <button
        onClick={() => {
          setScreen("input");
          setResult(null);
          setSteps(INITIAL_STEPS);
        }}
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
      </button>

      {result && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Best Area */}
          <BestAreaCard area={result.bestArea} reason={result.areaReason} />

          {/* Area map */}
          <Card className="bg-gradient-to-br from-card to-card/50 border-border/40">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Nearby food &amp; attractions
              </h3>
              <AreaMap area={result.bestArea} />
            </CardContent>
          </Card>

          {/* Results grid */}
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
                result.cheapestAcceptable.name !==
                  result.bestOverall?.name && (
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

          {/* Explanation */}
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

          {/* Price Watch */}
          <PriceWatchForm result={result} />

          {/* Rejected Options */}
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
      )}
    </div>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
