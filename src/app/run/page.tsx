"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  showLivePreview?: boolean;
  file: {
    name: string;
    type: string;
    dataUrl: string;
  } | null;
}

function RunContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId") || "";
  const previewParam = searchParams.get("preview");

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [streamingUrl, setStreamingUrl] = useState<string | undefined>();
  const [error, setError] = useState<string>("");
  const [showLivePreview, setShowLivePreview] = useState<boolean>(previewParam === "1");
  const [sourceMode, setSourceMode] = useState<"workflow" | "manual">("workflow");
  const startedRunIdRef = useRef<string | null>(null);

  const current = useMemo(() => {
    const latest = events[events.length - 1];
    return {
      stage: String(latest?.payload?.stage || latest?.type || ""),
      site: latest?.payload?.site ? String(latest.payload.site) : "",
      action: latest?.payload?.action ? String(latest.payload.action) : "",
    };
  }, [events]);

  useEffect(() => {
    setShowLivePreview(previewParam === "1");
  }, [previewParam]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("navio-show-live-preview", showLivePreview ? "1" : "0");
  }, [showLivePreview]);

  useEffect(() => {
    if (previewParam !== null) return;
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("navio-show-live-preview");
    if (saved === "1" || saved === "0") {
      setShowLivePreview(saved === "1");
    }
  }, [previewParam]);

  useEffect(() => {
    if (!runId) {
      router.replace("/search");
      return;
    }
    if (startedRunIdRef.current === runId) return;
    startedRunIdRef.current = runId;

    const abortController = new AbortController();
    const raw = sessionStorage.getItem(`navio-pending-${runId}`);
    if (!raw) {
      // Stale deep-link or back navigation to an already-consumed run.
      router.replace("/search");
      return;
    }

    const payload = JSON.parse(raw) as PendingPayload;
    if (previewParam === "1" || previewParam === "0") {
      setShowLivePreview(previewParam === "1");
      setSourceMode("manual");
    } else if (typeof payload.showLivePreview === "boolean") {
      setShowLivePreview(payload.showLivePreview);
      setSourceMode("workflow");
    }

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
          signal: abortController.signal,
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
              const nextUrl = String(event.payload.streaming_url);
              setStreamingUrl((prev) => (prev === nextUrl ? prev : nextUrl));
            }

            if (event.type === "completed") {
              sessionStorage.removeItem(`navio-pending-${runId}`);
              // Replace so browser back does not return to a stale /run route.
              router.replace(`/results?runId=${encodeURIComponent(runId)}`);
              return;
            }

            if (event.type === "failed") {
              throw new Error(String(event.payload.message || "Run failed."));
            }
          }
        }
      } catch (err) {
        const isAbort =
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && /aborted/i.test(err.message));

        // Abort is expected during strict-mode dev cleanup or route changes.
        if (isAbort) return;

        setError(err instanceof Error ? err.message : "Run failed.");
      }
    };

    void execute();

    return () => {
      abortController.abort();
      // Allow a fresh attempt for the same runId after cleanup (strict mode/dev).
      startedRunIdRef.current = null;
    };
  }, [router, runId]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Live Decision Run</h1>
      <p className="mb-6 text-sm text-muted-foreground">Run ID: {runId || "-"}</p>

      <div className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowLivePreview(false)}
          className={`rounded-md border px-3 py-1.5 text-sm transition ${
            showLivePreview
              ? "border-border bg-background text-muted-foreground"
              : "border-foreground/30 bg-foreground/10 text-foreground"
          }`}
        >
          Text progress only
        </button>
        <button
          type="button"
          onClick={() => setShowLivePreview(true)}
          className={`rounded-md border px-3 py-1.5 text-sm transition ${
            showLivePreview
              ? "border-foreground/30 bg-foreground/10 text-foreground"
              : "border-border bg-background text-muted-foreground"
          }`}
        >
          Show live browser
        </button>
      </div>

      <p className="mb-6 text-xs text-muted-foreground">
        {showLivePreview
          ? sourceMode === "workflow"
            ? "Showing live browser because this was selected in the workflow page."
            : "Showing live browser preview for this run."
          : sourceMode === "workflow"
          ? "Text-only progress was selected in the workflow page for a cleaner run view."
          : "Text-only progress mode is enabled for a cleaner run view."}
      </p>

      {error ? <p className="mb-4 rounded-lg border border-red-500/50 p-3 text-sm text-red-400">{error}</p> : null}

      <div className="space-y-6">
        <AgentProgress
          events={events}
          currentStage={current.stage}
          currentSite={current.site}
          currentAction={current.action}
        />
        {showLivePreview ? <LiveBrowser streamingUrl={streamingUrl} /> : null}
      </div>
    </div>
  );
}

export default function RunPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
          Preparing run...
        </div>
      }
    >
      <RunContent />
    </Suspense>
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
