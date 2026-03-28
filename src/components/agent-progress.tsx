"use client";

import { AgentEvent } from "@/types/agent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AgentProgressProps {
  events: AgentEvent[];
  currentStage?: string;
  currentSite?: string;
  currentAction?: string;
}

export function AgentProgress({
  events,
  currentStage,
  currentSite,
  currentAction,
}: AgentProgressProps) {
  const stageEvents = events
    .filter((event) => STAGE_EVENT_TYPES.includes(event.type))
    .slice(-10)
    .reverse();

  const activityEvents = events
    .filter((event) => ACTIVITY_EVENT_TYPES.includes(event.type))
    .slice(-160)
    .reverse();

  const siteBuckets = buildSiteBuckets(activityEvents);
  const globalActivity = activityEvents.filter((event) => !getEventSiteLabel(event)).slice(0, 10);

  const technicalNotes = events
    .filter((event) => {
      const action = String(event.payload.action || "").toLowerCase();
      return event.type === "failed" || action.includes("timing") || action.includes("termination");
    })
    .slice(-8)
    .reverse();

  const totalEvents = events.length;
  const extractedCount = events.filter((event) => event.type === "listing_extracted").length;
  const startedAt = events[0]?.timestamp;
  const lastAt = events[events.length - 1]?.timestamp;
  const elapsedLabel = startedAt && lastAt ? formatElapsed(startedAt, lastAt) : "-";

  const pipelineSummary = buildPipelineSummary(events);
  const searchStatus = getSearchStatus(events);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-xs md:grid-cols-5">
          <p>
            <span className="font-semibold">Current stage:</span> {currentStage || "waiting"}
          </p>
          <p>
            <span className="font-semibold">Current site:</span> {currentSite || "-"}
          </p>
          <p>
            <span className="font-semibold">Current action:</span> {currentAction || "-"}
          </p>
          <p>
            <span className="font-semibold">Listings extracted:</span> {extractedCount}
          </p>
          <p>
            <span className="font-semibold">Elapsed:</span> {elapsedLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border p-2 text-xs">
          <span className="font-semibold">Search status:</span>
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              searchStatus.state === "completed"
                ? "bg-emerald-100 text-emerald-700"
                : searchStatus.state === "failed"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {searchStatus.label}
          </span>
          {searchStatus.timeLabel ? (
            <span className="text-muted-foreground">at {searchStatus.timeLabel}</span>
          ) : null}
        </div>

        <section className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pipeline Steps
            </p>
            <p className="text-xs text-muted-foreground">{pipelineSummary.currentStepLabel}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            {pipelineSummary.steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-md border px-3 py-2 text-xs ${
                  step.state === "active"
                    ? "border-foreground/40 bg-foreground/10"
                    : step.state === "done"
                    ? "border-border bg-muted/30"
                    : "border-border/70 bg-background"
                }`}
              >
                <p className="font-semibold">{step.shortLabel}</p>
                <p className="text-muted-foreground">{step.statusLabel}</p>
                {step.timeLabel ? <p className="text-muted-foreground">{step.timeLabel}</p> : null}
              </div>
            ))}
          </div>

          {stageEvents[0]?.payload?.message ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Latest detail: {String(stageEvents[0].payload.message)}
            </p>
          ) : null}

          {stageEvents.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Waiting for stage updates...</p>
          ) : null}
        </section>

        <section className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Concurrent Site Agents
            </p>
            <p className="text-xs text-muted-foreground">{totalEvents} total events</p>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {siteBuckets.map((bucket) => (
              <div key={bucket.site} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{bucket.site}</p>
                  <p className="text-xs text-muted-foreground">
                    {bucket.events.length} updates
                    {searchStatus.state === "completed" ? " • complete" : ""}
                  </p>
                </div>

                {bucket.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recent updates yet.</p>
                ) : (
                  <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                    {bucket.events.map((event, idx) => (
                      <div key={`${event.timestamp}-${bucket.site}-${idx}`} className="rounded-md border p-3 text-sm">
                        <p className="font-semibold">{formatActivityLabel(event)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</p>
                        {event.payload.message ? <p className="mt-1 text-xs">{String(event.payload.message)}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {globalActivity.length > 0 ? (
            <div className="mt-3 rounded-md border p-3">
              <p className="mb-2 text-sm font-semibold">Shared Search Updates</p>
              <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                {globalActivity.map((event, idx) => (
                  <div key={`${event.timestamp}-global-${idx}`} className="rounded-md border p-3 text-sm">
                    <p className="font-semibold">{formatActivityLabel(event)}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</p>
                    {event.payload.message ? <p className="mt-1 text-xs">{String(event.payload.message)}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {technicalNotes.length > 0 ? (
          <section className="rounded-lg border p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Technical Notes
            </p>
            <div className="max-h-[220px] space-y-2 overflow-auto pr-1 text-sm">
              {technicalNotes.map((event, idx) => (
                <div key={`${event.timestamp}-note-${idx}`} className="rounded-md border p-3">
                  <p className="font-semibold">{formatActivityLabel(event)}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</p>
                  {event.payload.message ? <p className="mt-1 text-xs">{String(event.payload.message)}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

const STAGE_EVENT_TYPES: AgentEvent["type"][] = [
  "parsing_started",
  "parsing_done",
  "geocoding_started",
  "geocoding_done",
  "area_selected",
  "tinyfish_started",
  "transit_scoring_started",
  "transit_scoring_done",
  "ranking_started",
  "ranking_done",
  "completed",
  "failed",
];

const ACTIVITY_EVENT_TYPES: AgentEvent["type"][] = [
  "site_searching",
  "listing_extracted",
  "tinyfish_progress",
  "failed",
];

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

function formatElapsed(start: string, end: string): string {
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

type PipelineStepId = "parse" | "geocode" | "area" | "search" | "transit" | "rank";

function buildPipelineSummary(events: AgentEvent[]): {
  steps: Array<{
    id: PipelineStepId;
    shortLabel: string;
    statusLabel: string;
    timeLabel?: string;
    state: "todo" | "active" | "done";
  }>;
  currentStepLabel: string;
} {
  const latestByType = new Map<AgentEvent["type"], AgentEvent>();
  for (const event of events) {
    latestByType.set(event.type, event);
  }

  const isCompleted = latestByType.has("completed");

  const steps: Array<{
    id: PipelineStepId;
    shortLabel: string;
    statusLabel: string;
    timeLabel?: string;
    state: "todo" | "active" | "done";
  }> = [
    {
      id: "parse",
      shortLabel: "1. Parse",
      ...buildStepState(
        latestByType.get("parsing_started"),
        latestByType.get("parsing_done"),
        isCompleted
      ),
    },
    {
      id: "geocode",
      shortLabel: "2. Geocode",
      ...buildStepState(
        latestByType.get("geocoding_started"),
        latestByType.get("geocoding_done"),
        isCompleted
      ),
    },
    {
      id: "area",
      shortLabel: "3. Area",
      ...buildInstantStepState(latestByType.get("area_selected"), isCompleted),
    },
    {
      id: "search",
      shortLabel: "4. Search",
      ...buildStepState(
        latestByType.get("tinyfish_started"),
        latestByType.get("transit_scoring_started") || latestByType.get("ranking_started"),
        isCompleted
      ),
    },
    {
      id: "transit",
      shortLabel: "5. Transit",
      ...buildStepState(
        latestByType.get("transit_scoring_started"),
        latestByType.get("transit_scoring_done"),
        isCompleted
      ),
    },
    {
      id: "rank",
      shortLabel: "6. Rank",
      ...buildStepState(
        latestByType.get("ranking_started"),
        latestByType.get("ranking_done") || latestByType.get("completed"),
        isCompleted
      ),
    },
  ];

  const active = steps.find((step) => step.state === "active");
  const currentStepLabel = active?.shortLabel || (isCompleted ? "All steps done" : "Waiting");

  return { steps, currentStepLabel };
}

function buildStepState(
  started?: AgentEvent,
  ended?: AgentEvent,
  forceDone?: boolean
): { statusLabel: string; timeLabel?: string; state: "todo" | "active" | "done" } {
  if (ended || forceDone) {
    return {
      statusLabel: "Done",
      timeLabel: ended ? formatTime(ended.timestamp) : undefined,
      state: "done",
    };
  }
  if (started) {
    return {
      statusLabel: "Running",
      timeLabel: formatTime(started.timestamp),
      state: "active",
    };
  }
  return {
    statusLabel: "Pending",
    state: "todo",
  };
}

function buildInstantStepState(
  event?: AgentEvent,
  forceDone?: boolean
): { statusLabel: string; timeLabel?: string; state: "todo" | "active" | "done" } {
  if (event || forceDone) {
    return {
      statusLabel: "Done",
      timeLabel: event ? formatTime(event.timestamp) : undefined,
      state: "done",
    };
  }
  return {
    statusLabel: "Pending",
    state: "todo",
  };
}

function formatStageLabel(event: AgentEvent): string {
  const labels: Record<AgentEvent["type"], string> = {
    parsing_started: "1. Parsing started",
    parsing_done: "1. Parsing completed",
    geocoding_started: "2. Geocoding started",
    geocoding_done: "2. Geocoding completed",
    area_selected: "3. Best area selected",
    tinyfish_started: "4. Site search started",
    site_searching: "Site search in progress",
    listing_extracted: "Listing extracted",
    transit_scoring_started: "5. Transit scoring started",
    transit_scoring_done: "5. Transit scoring completed",
    ranking_started: "6. Ranking started",
    ranking_done: "6. Ranking completed",
    completed: "Run completed",
    failed: "Run failed",
    tinyfish_progress: "Search progress",
  };

  return labels[event.type] || event.type;
}

function formatActivityLabel(event: AgentEvent): string {
  if (event.type === "site_searching") {
    return `${String(event.payload.site || "Site")}: ${String(event.payload.action || "searching")}`;
  }

  if (event.type === "listing_extracted") {
    return `${String(event.payload.site || "Site")}: listing extracted`;
  }

  if (event.type === "tinyfish_progress") {
    const site = getEventSiteLabel(event);
    const action = String(event.payload.action || "tinyfish progress");
    return site ? `${site}: ${action}` : action;
  }

  if (event.type === "failed") {
    return "Failure reported";
  }

  return formatStageLabel(event);
}

function getEventSiteLabel(event: AgentEvent): string | null {
  const rawSite = String(event.payload.site || "").trim();
  if (rawSite) return normalizeSiteLabel(rawSite);

  const action = String(event.payload.action || "").toLowerCase();
  const message = String(event.payload.message || "").toLowerCase();
  if (action.includes("airbnb") || message.includes("airbnb")) return "Airbnb";
  if (action.includes("trip") || message.includes("trip.com") || message.includes("trip")) {
    return "Trip.com";
  }

  return null;
}

function normalizeSiteLabel(site: string): string {
  const normalized = site.toLowerCase();
  if (normalized.includes("airbnb")) return "Airbnb";
  if (normalized.includes("trip")) return "Trip.com";
  return site;
}

function buildSiteBuckets(activityEvents: AgentEvent[]): Array<{ site: string; events: AgentEvent[] }> {
  const map = new Map<string, AgentEvent[]>();

  for (const event of activityEvents) {
    const site = getEventSiteLabel(event);
    if (!site) continue;
    if (!map.has(site)) map.set(site, []);
    const list = map.get(site)!;
    if (list.length < 10) {
      list.push(event);
    }
  }

  const orderedSites = ["Airbnb", "Trip.com", ...Array.from(map.keys())].filter(
    (site, idx, arr) => arr.indexOf(site) === idx
  );

  return orderedSites.map((site) => ({ site, events: map.get(site) || [] }));
}

function getSearchStatus(events: AgentEvent[]): {
  state: "running" | "completed" | "failed";
  label: string;
  timeLabel?: string;
} {
  const failed = [...events].reverse().find((event) => event.type === "failed");
  if (failed) {
    return {
      state: "failed",
      label: "Failed",
      timeLabel: formatTime(failed.timestamp),
    };
  }

  const searchEnded = [...events].reverse().find(
    (event) =>
      event.type === "ranking_started" ||
      (event.type === "tinyfish_progress" &&
        (String(event.payload.action || "") === "termination_success" ||
          String(event.payload.action || "") === "termination_no_growth"))
  );

  if (searchEnded) {
    return {
      state: "completed",
      label: "Search complete",
      timeLabel: formatTime(searchEnded.timestamp),
    };
  }

  return {
    state: "running",
    label: "Searching",
  };
}
