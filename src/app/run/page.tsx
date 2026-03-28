"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgentProgress } from "@/components/agent-progress";
import { LiveBrowser } from "@/components/live-browser";
import { AgentEvent } from "@/types/agent";

interface PendingPayload {
  values: {
    city: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    pax: number;
    rooms: number;
    budgetAmount: number;
    budgetMode: "total" | "nightly";
    budgetCurrency: string;
    roomType: string;
    propertyTypes: string[];
    preferences: string[];
    itineraryText: string;
    runMode?: "accommodation-only" | "full-agent";
  };
  mode?: "accommodation-only" | "full-agent";
  file: {
    name: string;
    type: string;
    dataUrl: string;
  } | null;
}

export default function RunPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId") || "";

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [streamingUrl, setStreamingUrl] = useState<string | undefined>();
  const [error, setError] = useState<string>("");

  const current = useMemo(() => {
    const latest = events[events.length - 1];
    return {
      stage: String(latest?.payload?.stage || latest?.type || ""),
      site: latest?.payload?.site ? String(latest.payload.site) : "",
      action: latest?.payload?.action ? String(latest.payload.action) : "",
    };
  }, [events]);

  useEffect(() => {
    if (!runId) return;
    const raw = sessionStorage.getItem(`navio-pending-${runId}`);
    if (!raw) {
      setError("Missing pending run payload.");
      return;
    }

    const payload = JSON.parse(raw) as PendingPayload;

    const execute = async () => {
      try {
        const formData = new FormData();
        formData.append("runId", runId);
        formData.append("city", payload.values.city);
        formData.append("checkIn", payload.values.checkIn);
        formData.append("checkOut", payload.values.checkOut);
        formData.append("nights", String(payload.values.nights));
        formData.append("pax", String(payload.values.pax));
        formData.append("rooms", String(payload.values.rooms));
        formData.append("budgetAmount", String(payload.values.budgetAmount));
        formData.append("budgetMode", payload.values.budgetMode);
        formData.append("budgetCurrency", payload.values.budgetCurrency);
        formData.append("roomType", payload.values.roomType);
        formData.append("propertyTypes", payload.values.propertyTypes.join(","));
        formData.append("preferences", payload.values.preferences.join(","));
        formData.append("itineraryText", payload.values.itineraryText);
        formData.append("runMode", payload.mode || payload.values.runMode || "full-agent");

        if (payload.file?.dataUrl) {
          const file = dataUrlToFile(payload.file.dataUrl, payload.file.name, payload.file.type);
          formData.append("file", file);
        }

        const response = await fetch("/api/run-agent/stream", {
          method: "POST",
          body: formData,
          headers: { Accept: "text/event-stream" },
        });

        if (!response.ok || !response.body) {
          throw new Error("Run stream failed to start.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const event = parseAgentEvent(chunk);
            if (!event) continue;

            setEvents((prev) => [...prev, event]);

            if (event.payload.streaming_url) {
              setStreamingUrl(String(event.payload.streaming_url));
            }

            if (event.type === "completed") {
              sessionStorage.removeItem(`navio-pending-${runId}`);
              router.push(`/results?runId=${encodeURIComponent(runId)}`);
              return;
            }

            if (event.type === "failed") {
              throw new Error(String(event.payload.message || "Run failed."));
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Run failed.");
      }
    };

    void execute();
  }, [router, runId]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Live Decision Run</h1>
      <p className="mb-6 text-sm text-muted-foreground">Run ID: {runId || "-"}</p>

      {error ? <p className="mb-4 rounded-lg border border-red-500/50 p-3 text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <AgentProgress
          events={events}
          currentStage={current.stage}
          currentSite={current.site}
          currentAction={current.action}
        />
        <LiveBrowser streamingUrl={streamingUrl} />
      </div>
    </div>
  );
}

function parseAgentEvent(chunk: string): AgentEvent | null {
  const lines = chunk.split(/\r?\n/);
  let payloadLine = "";

  for (const line of lines) {
    if (line.startsWith("data:")) {
      payloadLine = line.slice(5).trim();
      break;
    }
  }

  if (!payloadLine) return null;

  try {
    return JSON.parse(payloadLine) as AgentEvent;
  } catch {
    return null;
  }
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType: string): File {
  const [header, data] = dataUrl.split(",");
  const matches = header.match(/:(.*?);/);
  const type = matches?.[1] || mimeType || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type });
}
